import type { APIRequestContext, Page } from '@playwright/test';

import { signedTransactions, signInAs, youButton } from '../src/connect.ts';
import { expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { MIN_GOVERNANCE_STEP_S } from '../src/network.ts';
import { ProposalState, setAnnotator, settleSend, statusColumn, submitProposal } from '../src/proposals.ts';
import {
  type FeedItem,
  feedShowsUpgrade,
  latestProposal,
  proposal,
  readModule,
  readRegistry,
  W16,
  w16Addresses,
  w16Phase,
  type W16Phase
} from '../src/upgrades.ts';
import { waitForIndexed, waitForLedgerTime, waitForUi, waitForVisible } from '../src/waits.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';

/**
 * W16 · Contract upgrades (§3.4). The fixture tribe `e2e-w16` runs Metadata 0.4.0; the platform admin
 * registers a throwaway Metadata 0.4.1 (storage version 2), approves 0.4.0 → 0.4.1 and announces it as
 * latest (docs/qa/WALKTHROUGHS.md, "W16"). Then a member sees the notice, puts the upgrade and the
 * storage migration in one proposal, votes, queues after the voting period, executes after the safety
 * delay, and the app and the chain both report 0.4.1.
 *
 * Module upgrades are not gated by the Manager's upgradeDelayLedgers (720 ledgers on dev): that notice
 * applies to `upgrade_manager` only. A tribe's own proposal is the notice for its modules, so the waits
 * here are the tribe's 300s voting delay, voting period and queue delay.
 */

const MODULE_LABEL = 'Artwork and profile';
const ARROW = `${W16.from.version} → ${W16.to.version}`;
const FOUNDER = 'e2e-founder';
const tribe = (path = '') => `/dao/${W16.slug}${path}`;

function phase(): W16Phase {
  const addresses = w16Addresses();
  return w16Phase(readRegistry(addresses.manager), readModule(addresses.metadata));
}

const updatesCard = (page: Page) => page.locator('section[aria-labelledby="updates-title"]');
const contractsCard = (page: Page) => page.locator('section[aria-labelledby="modules-title"]');
const metadataRow = (page: Page) => contractsCard(page).getByRole('listitem').filter({ hasText: MODULE_LABEL });
/** The Advanced card for Metadata: the innermost block holding both its heading and its hash field. */
const metadataCard = (page: Page) =>
  page
    .locator('div')
    .filter({ has: page.locator('#upgrade-hash-metadata') })
    .filter({ has: page.getByRole('heading', { name: 'metadata', exact: true }) })
    .last();

/** Manage → Contract upgrades for the state the fixture is in. */
async function expectUpgradesPage(page: Page, state: W16Phase) {
  await waitForVisible(page.getByRole('heading', { name: 'Contract upgrades' }), 'Contract upgrades page');
  if (state.phase === 'available') {
    await waitForVisible(
      updatesCard(page).getByRole('heading', { name: '1 upgrade available' }),
      'one upgrade offered'
    );
    const row = updatesCard(page).getByRole('listitem').filter({ hasText: MODULE_LABEL });
    await expect(row).toContainText(ARROW);
    await expect(row).toContainText('No release notes for this version yet.');
    await expect(metadataRow(page)).toContainText('Upgrade available');
    await expect(updatesCard(page)).toContainText('Upgrades go to a vote like any other change.');
  } else {
    await waitForVisible(
      updatesCard(page).getByRole('heading', { name: 'Everything is up to date' }),
      'nothing to upgrade'
    );
    const version = state.phase === 'awaiting-admin' ? W16.from.version : W16.to.version;
    await expect(metadataRow(page)).toContainText(version);
    await expect(metadataRow(page)).toContainText('Up to date');
  }
}

/** The Metadata activity feed shows the upgrade and the migration (read model, so indexer-late on timeout). */
function waitForFeed(request: APIRequestContext, addresses: { token: string; metadata: string }) {
  return waitForIndexed<{ items: FeedItem[] }>(
    request,
    {
      label: 'Metadata upgraded and migrated in the activity feed',
      path: `/api/dao/${addresses.token}/activity-feed?visibility=all&limit=20&contractId=${addresses.metadata}`,
      predicate: (body) => feedShowsUpgrade(body.items)
    },
    { governingS: 60 }
  );
}

/**
 * From the notice to a submitted proposal: Review upgrade, add the upgrade (high-risk, confirmed) and the
 * storage migration, write it, review it and submit it. Returns the proposal id.
 */
async function proposeUpgrade(page: Page, wallet: E2ESigner) {
  await waitForVisible(page.getByText('A contract upgrade is available'), 'upgrade notice on the tribe home');
  await page.getByRole('link', { name: 'Review upgrade' }).click();
  await expectUpgradesPage(page, { phase: 'available' });

  await updatesCard(page).getByRole('button', { name: 'Add 1 upgrade to proposal' }).click();
  const confirm = page.getByRole('dialog', { name: 'Add this to your proposal?' });
  await waitForVisible(confirm, 'high-risk confirmation');
  await expect(confirm.getByText('Replaces this contract’s code.', { exact: false })).toBeVisible();
  await confirm.getByRole('button', { name: 'Add to proposal' }).click();
  await waitForVisible(page.getByText('1 action waiting for a vote', { exact: false }).first(), 'upgrade added');

  // The release changes the storage version (1 → 2), so migrate() goes right after the upgrade.
  await page.getByText('Advanced: check a specific release').click();
  await metadataCard(page).getByRole('button', { name: 'Add storage migration to proposal' }).click();
  const again = page.getByRole('dialog', { name: 'Add this to your proposal?' });
  const added = page.getByText('2 actions waiting for a vote', { exact: false }).first();
  await waitForUi('migration added or confirmation asked', (timeout) =>
    expect(again.or(added).first()).toBeVisible({ timeout })
  );
  if (await again.isVisible()) await again.getByRole('button', { name: 'Add to proposal' }).click();
  await waitForVisible(added, 'migration added');

  await page.goto(tribe('/proposals/create'));
  await waitForVisible(
    page.getByRole('heading', { name: 'In this proposal (2 actions)' }),
    'both actions in the draft'
  );
  const queue = page.getByRole('list', { name: 'Actions in this proposal' }).getByRole('listitem');
  await expect(queue).toHaveCount(2);
  const title = `E2E W16: upgrade artwork and profile to ${W16.to.version}`;
  await page.getByRole('textbox', { name: 'Title (required)' }).fill(title);
  await page
    .getByRole('textbox', { name: 'Why' })
    .fill(`Walkthrough W16 (testnet). Upgrades Metadata ${ARROW} (a test-only build) and runs its storage migration.`);
  await page.getByRole('button', { name: 'Next: review' }).filter({ visible: true }).first().click();
  const preview = page.getByRole('region', { name: 'Proposal preview' });
  await waitForVisible(preview, 'proposal review');
  await expect(preview.getByRole('heading', { name: title })).toBeVisible();
  await expect(preview.getByText('If it passes, these run in order')).toBeVisible();
  return submitProposal(page, wallet, FOUNDER, 2);
}

test.describe('W16 upgrade screens', { tag: ['@matrix'] }, () => {
  test('tribe home and Manage show the upgrade state', async ({ page, wallet }) => {
    const state = phase();
    test.info().annotations.push({ type: 'w16-phase', description: JSON.stringify(state) });

    await page.goto(tribe());
    // The founder holds every token, so the home notice (members only) shows for this wallet.
    await signInAs(page, wallet, FOUNDER);
    const notice = page.getByText('A contract upgrade is available');
    if (state.phase === 'available') {
      await waitForVisible(notice, 'upgrade notice on the tribe home');
      await expect(page.getByText(`${MODULE_LABEL} ${ARROW}.`)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Review upgrade' })).toBeVisible();
    } else {
      await expect(notice).toHaveCount(0);
    }
    await expectNoHorizontalScroll(page);

    await page.goto(tribe('/admin'));
    if (state.phase === 'available') await waitForVisible(notice, 'upgrade notice on the Manage overview');

    await page.goto(tribe('/admin/upgrades'));
    await expectUpgradesPage(page, state);
    await expectNoHorizontalScroll(page);

    // Advanced: the per-module card reads the same registry, by hash.
    await page.getByText('Advanced: check a specific release').click();
    const card = metadataCard(page);
    await waitForVisible(card.getByText(/^Current version: /), 'Metadata card');
    const running = state.phase === 'awaiting-admin' || state.phase === 'available' ? W16.from : W16.to;
    await expect(card.getByText(/^Current version: /)).toHaveText(
      `Current version: ${running.version} · Storage version: ${state.phase === 'upgraded-not-migrated' ? W16.from.storage : running.storage}`
    );
    if (state.phase === 'available') await expect(card.getByText('Transition approved')).toBeVisible();
    await expectNoHorizontalScroll(page);
    if (state.phase === 'done') await waitForFeed(page.request, w16Addresses());
  });
});

test.describe('W16 upgrade by proposal', { tag: ['@chain'] }, () => {
  // Voting delay + voting period + queue delay (300s each), plus ledger close, wallet and indexer time.
  test.describe.configure({ timeout: (3 * MIN_GOVERNANCE_STEP_S + 900) * 1000 });

  test('a member upgrades Metadata to 0.4.1 and migrates it, by proposal', async ({ page, wallet, request }) => {
    requireVerifiedManager();
    setAnnotator((type, description) => test.info().annotations.push({ type, description }));
    const addresses = w16Addresses();
    const state = phase();
    if (state.phase === 'awaiting-admin') {
      throw new Error(
        `W16 needs the platform admin steps first (docs/qa/WALKTHROUGHS.md, "W16"). Missing: ${state.missing.join('; ')}`
      );
    }
    if (state.phase !== 'available') {
      throw new Error(
        `The e2e-w16 fixture is already on the candidate (${state.phase}). It is single-use: recreate it with the next ` +
          'nonce (docs/qa/WALKTHROUGHS.md, "W16") or run only the @matrix checks.'
      );
    }
    await page.goto(tribe());
    await signInAs(page, wallet, FOUNDER);

    // A run that stopped after submitting resumes its proposal instead of opening a second one.
    const inFlight = latestProposal(addresses.governor);
    const resumable = [ProposalState.Pending, ProposalState.Active, ProposalState.Succeeded, ProposalState.Queued];
    let id: string;
    if (inFlight && resumable.includes(inFlight.state as (typeof resumable)[number])) {
      id = inFlight.id;
      test.info().annotations.push({ type: 'resumed', description: `proposal ${id} (state ${inFlight.state})` });
    } else {
      id = await proposeUpgrade(page, wallet);
    }
    test.info().annotations.push({ type: 'proposal', description: id });
    let info = proposal(addresses.governor, id);
    const open = () => page.goto(tribe(`/proposals/${id}`));

    // Vote For once voting opens (votingDelay).
    if (info.state <= ProposalState.Active) {
      await waitForLedgerTime(info.vote_start + 1, { governingS: MIN_GOVERNANCE_STEP_S, label: 'voting opens' });
      await open();
      const column = statusColumn(page);
      const voted = column.getByText('You voted For');
      const power = column.getByText('You have 2 votes on this proposal');
      await waitForUi('vote form or recorded vote', (timeout) => expect(power.or(voted)).toBeVisible({ timeout }), {
        governingS: 60
      });
      if (await power.isVisible()) {
        await column.getByRole('radio', { name: 'For' }).check({ force: true });
        const before = signedTransactions(wallet, FOUNDER);
        await column.getByRole('button', { name: 'Cast 2 votes For' }).click();
        await settleSend(page, 'Vote cast', 'founder votes For', column);
        expect(signedTransactions(wallet, FOUNDER) - before).toBe(1);
      }
      await waitForVisible(voted, 'vote recorded', { governingS: 180 });
    }

    // Queue once voting ends (votingPeriod). Anyone can; the founder does.
    info = proposal(addresses.governor, id);
    if (info.state < ProposalState.Queued) {
      await waitForLedgerTime(info.vote_end + 1, { governingS: MIN_GOVERNANCE_STEP_S, label: 'voting ends' });
      await waitForUi(
        'the vote passed on chain',
        (timeout) =>
          expect.poll(() => proposal(addresses.governor, id).state, { timeout }).toBe(ProposalState.Succeeded),
        { governingS: 60 }
      );
      await open();
      const queue = statusColumn(page).getByRole('button', { name: 'Queue for execution' });
      await waitForVisible(queue, 'queue button', { governingS: 60 });
      await queue.click();
      await settleSend(page, 'Proposal queued', 'queue', statusColumn(page));
      await waitForUi(
        'queued on chain',
        (timeout) => expect.poll(() => proposal(addresses.governor, id).state, { timeout }).toBe(ProposalState.Queued),
        { governingS: 60 }
      );
    }

    // Execute after the safety delay (queueDelay). The Treasury runs upgrade, then migrate.
    info = proposal(addresses.governor, id);
    await waitForLedgerTime(info.eta + 1, { governingS: MIN_GOVERNANCE_STEP_S, label: 'safety delay over' });
    await open();
    const execute = statusColumn(page).getByRole('button', { name: 'Execute now' });
    await waitForVisible(execute, 'execute button', { governingS: 60 });
    await execute.click();
    await settleSend(page, 'Proposal executed', 'execute', statusColumn(page));

    // The chain runs the new code, at the new storage version.
    await waitForUi(
      'Metadata runs the candidate',
      async (timeout) =>
        expect
          .poll(() => readModule(addresses.metadata), { timeout, intervals: [5_000] })
          .toEqual({ version: W16.to.version, hash: W16.to.hash, storageVersion: W16.to.storage }),
      { governingS: 120 }
    );
    expect(proposal(addresses.governor, id).state).toBe(ProposalState.Executed);

    // And the app says so: up to date, 0.4.1, storage version 2, and no notice.
    await page.goto(tribe('/admin/upgrades'));
    await expectUpgradesPage(page, { phase: 'done' });
    await page.getByText('Advanced: check a specific release').click();
    await expect(metadataCard(page).getByText(/^Current version: /)).toHaveText(
      `Current version: ${W16.to.version} · Storage version: ${W16.to.storage}`
    );
    await page.goto(tribe());
    await waitForVisible(youButton(page), 'still signed in');
    await expect(page.getByText('A contract upgrade is available')).toHaveCount(0);

    // The read model has both events (activity feed).
    await waitForFeed(request, addresses);
  });
});
