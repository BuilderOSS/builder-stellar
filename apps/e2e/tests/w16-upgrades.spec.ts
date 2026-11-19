import type { Page } from '@playwright/test';

import { expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { MIN_GOVERNANCE_STEP_S } from '../src/network.ts';
import {
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
const tribe = (path = '') => `/dao/${W16.slug}${path}`;

function phase(): W16Phase {
  const addresses = w16Addresses();
  return w16Phase(readRegistry(addresses.manager), readModule(addresses.metadata));
}

async function connect(page: Page) {
  const button = page.getByRole('button', { name: 'Connect wallet' }).first();
  // The top bar says "Check wallet" (disabled) while it restores a session; the kit isn't ready until then.
  await waitForUi('Connect wallet ready', (timeout) => expect(button).toBeEnabled({ timeout }));
  await button.click();
  const option = page.getByText('E2E Wallet', { exact: true });
  await waitForVisible(option, 'E2E Wallet listed in the wallet modal');
  await option.click();
  await waitForVisible(page.getByRole('button', { name: /^You, connected as/ }), 'signed-in top bar');
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

test.describe('W16 upgrade screens', { tag: ['@matrix'] }, () => {
  test('tribe home and Manage show the upgrade state', async ({ page, wallet }) => {
    // The founder holds every token, so the home notice (members only) shows for this wallet.
    wallet.use('e2e-founder');
    const state = phase();
    test.info().annotations.push({ type: 'w16-phase', description: JSON.stringify(state) });

    await page.goto(tribe());
    await connect(page);
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
  });
});

test.describe('W16 upgrade by proposal', { tag: ['@chain'] }, () => {
  // Voting delay + voting period + queue delay (300s each), plus ledger close, wallet and indexer time.
  test.describe.configure({ timeout: (3 * MIN_GOVERNANCE_STEP_S + 900) * 1000 });

  test('a member upgrades Metadata to 0.4.1 and migrates it, by proposal', async ({ page, wallet, request }) => {
    requireVerifiedManager();
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
    wallet.use('e2e-founder');

    // 1. The notice, then Manage → Contract upgrades.
    await page.goto(tribe());
    await connect(page);
    await waitForVisible(page.getByText('A contract upgrade is available'), 'upgrade notice on the tribe home');
    await page.getByRole('link', { name: 'Review upgrade' }).click();
    await expectUpgradesPage(page, state);

    // 2. The upgrade into the draft. It is high-risk, so the app asks first.
    await updatesCard(page).getByRole('button', { name: 'Add 1 upgrade to proposal' }).click();
    const confirm = page.getByRole('dialog', { name: 'Add this to your proposal?' });
    await waitForVisible(confirm, 'high-risk confirmation');
    await confirm.getByRole('button', { name: 'Add to proposal' }).click();
    await waitForVisible(page.getByText('Added to your proposal').first(), 'upgrade added');

    // 3. The release changes the storage version (1 → 2), so migrate() goes right after it.
    await page.getByText('Advanced: check a specific release').click();
    const card = metadataCard(page);
    await card.getByRole('button', { name: 'Add storage migration to proposal' }).click();
    const again = page.getByRole('dialog', { name: 'Add this to your proposal?' });
    if (await again.isVisible().catch(() => false))
      await again.getByRole('button', { name: 'Add to proposal' }).click();
    await waitForUi('migration added', (timeout) =>
      expect(page.getByText('2 actions waiting for a vote', { exact: false }).first()).toBeVisible({ timeout })
    );

    // 4. Compose and submit.
    await page.goto(tribe('/proposals/create'));
    await waitForVisible(page.getByText('In this proposal (2 actions)'), 'both actions in the draft');
    await page.locator('#title').fill(`E2E W16: upgrade artwork and profile to ${W16.to.version}`);
    await page
      .locator('#description')
      .fill(
        `Walkthrough W16 (testnet). Upgrades the Metadata contract ${ARROW} (a test-only build) and runs its storage migration.`
      );
    await page.getByRole('button', { name: 'Next: review' }).first().click();
    await page.getByRole('button', { name: 'Submit proposal' }).click();
    const submit = page.getByRole('dialog', { name: 'Submit this proposal?' });
    await waitForVisible(submit, 'submit confirmation');
    await submit.getByRole('button', { name: 'Submit proposal' }).click();
    await waitForUi(
      'proposal page opened',
      async (timeout) =>
        expect(async () => {
          if (/\/proposals\/(?!create)[^/]+$/.test(new URL(page.url()).pathname)) return;
          const open = page.getByRole('link', { name: 'Open proposal' });
          if (await open.isVisible()) await open.click();
          throw new Error(`still on ${page.url()}`);
        }).toPass({ timeout }),
      { governingS: 120 }
    );
    const proposalUrl = new URL(page.url()).pathname;
    const created = latestProposal(addresses.governor);
    test.info().annotations.push({ type: 'proposal', description: `${created.id} ${proposalUrl}` });

    // 5. Vote For once voting opens (votingDelay).
    await waitForLedgerTime(created.vote_start + 1, {
      governingS: MIN_GOVERNANCE_STEP_S,
      label: 'voting opens'
    });
    await page.reload();
    const choices = page.getByRole('radiogroup', { name: 'Your vote' });
    await waitForVisible(choices, 'vote panel', { governingS: 60 });
    await choices.getByText('For', { exact: true }).click();
    await page.getByRole('button', { name: /^Cast \d+ votes? For$/ }).click();
    await waitForVisible(page.getByText('You voted For'), 'vote recorded', { governingS: 60 });

    // 6. Queue once voting ends (votingPeriod).
    await waitForLedgerTime(created.vote_end + 1, { governingS: MIN_GOVERNANCE_STEP_S, label: 'voting ends' });
    await page.reload();
    const queue = page.getByRole('button', { name: 'Queue for execution' });
    await waitForVisible(queue, 'queue button', { governingS: 60 });
    await queue.click();
    await waitForUi(
      'proposal queued on chain',
      async (timeout) =>
        expect.poll(() => proposal(addresses.governor, created.id).eta, { timeout }).toBeGreaterThan(0),
      { governingS: 60 }
    );
    const { eta } = proposal(addresses.governor, created.id);

    // 7. Execute after the safety delay (queueDelay). The Treasury runs upgrade, then migrate.
    await waitForLedgerTime(eta + 1, { governingS: MIN_GOVERNANCE_STEP_S, label: 'safety delay over' });
    await page.reload();
    const execute = page.getByRole('button', { name: 'Execute now' });
    await waitForVisible(execute, 'execute button', { governingS: 60 });
    await execute.click();

    // 8. The chain runs the new code, at the new storage version.
    await waitForUi(
      'Metadata runs the candidate',
      async (timeout) =>
        expect
          .poll(() => readModule(addresses.metadata), { timeout, intervals: [5_000] })
          .toEqual({ version: W16.to.version, hash: W16.to.hash, storageVersion: W16.to.storage }),
      { governingS: 120 }
    );

    // 9. And the app says so: up to date, 0.4.1, storage version 2.
    await page.goto(tribe('/admin/upgrades'));
    await expectUpgradesPage(page, { phase: 'done' });
    await page.getByText('Advanced: check a specific release').click();
    await expect(metadataCard(page).getByText(/^Current version: /)).toHaveText(
      `Current version: ${W16.to.version} · Storage version: ${W16.to.storage}`
    );
    await page.goto(tribe());
    await expect(page.getByText('A contract upgrade is available')).toHaveCount(0);

    // 10. The read model has both events (activity feed).
    await waitForIndexed<{ items: Array<Record<string, unknown>> }>(
      request,
      {
        label: 'Upgraded and Migrated indexed',
        path: `/api/dao/${addresses.token}/activity-feed?visibility=all&limit=20&contractId=${addresses.metadata}`,
        predicate: (body) =>
          body.items.some((item) => item.event_name === 'Upgraded' && JSON.stringify(item).includes(W16.to.version)) &&
          body.items.some((item) => item.event_name === 'Migrated')
      },
      { governingS: 60 }
    );
  });
});
