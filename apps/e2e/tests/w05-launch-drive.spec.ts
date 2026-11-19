import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { E2E_ROOT } from '../src/run.ts';
import { switchAccount } from '../src/tribe.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';
import { latestLedger, waitForIndexed, waitForLedgerTime, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * W05 · Launch drive: open, contribute, launch when ready or fail, refunds (§3.4).
 *
 * The drives are opened by `apps/e2e/scripts/w05-drive-fixtures.mjs` (create_dao and admin_checklist
 * through scripts/deploy-dao.mjs, then manager.open_assurance), because opening one in the app
 * publishes the claim list to IPFS and uploads are off in the walkthrough build. Its list names
 * member-a and member-b, one token each at 1 XLM, two people needed. The list file itself is not on
 * IPFS, so members claim with the proof file the claims page accepts.
 *
 * Each drive is one-shot: run the script before this spec (docs/qa/WALKTHROUGHS.md, "W05 fixtures").
 */

type Drive = {
  daoId: string;
  name: string;
  slug: string;
  deadline: number;
  proofs: Record<string, { address: string; amount: string; proof: string[] }>;
};
const FIXTURES = join(E2E_ROOT, 'fixtures/w05-drives.json');
const RECREATE = 'Recreate it: node apps/e2e/scripts/w05-drive-fixtures.mjs';

function drive(kind: 'ready' | 'fail'): Drive {
  if (!existsSync(FIXTURES)) throw new Error(`No W05 fixtures. ${RECREATE} both`);
  const all = JSON.parse(readFileSync(FIXTURES, 'utf8')) as Record<string, Drive>;
  if (!all[kind]) throw new Error(`No ${kind} drive in ${FIXTURES}. ${RECREATE} ${kind}`);
  return all[kind];
}

type ClaimState = {
  live: boolean;
  lists: { listId: number; claimers: number; assurance: { state: string } | null }[];
};
async function claimState(page: Page, daoId: string) {
  const response = await page.request.get(`/api/dao/${daoId}/claims`);
  expect(response.ok(), 'claims state').toBe(true);
  return (await response.json()) as ClaimState;
}

const driveCard = (page: Page) => page.getByRole('region', { name: 'Launch drive' });

/** Claim one token from the drive with the member's proof file (the list file isn't on IPFS). */
async function claimWithProof(page: Page, wallet: E2ESigner, role: string, fixture: Drive) {
  await switchAccount(page, wallet, role, `/dao/${fixture.daoId}/claims`);
  await waitForVisible(page.getByRole('heading', { name: 'Claim your tokens', level: 1 }), 'member claims page');
  await waitForVisible(driveCard(page), 'drive card');
  await expect(driveCard(page).getByText('Claim list unavailable')).toBeVisible();
  await expect(driveCard(page).getByText(/You can still claim with a proof file from the organizer\./)).toBeVisible();

  await page.getByRole('button', { name: 'Have a proof file instead?' }).click();
  const { amount, proof } = fixture.proofs[role];
  await page.getByLabel('Or paste it').fill(JSON.stringify({ amount, proof }));
  await page.getByRole('button', { name: 'Check proof' }).click();
  const review = page.getByRole('heading', { name: 'Claim 1 token from the launch drive' });
  await waitForVisible(review, 'claim review', { governingS: 30 });
  await expect(
    page.getByText(/You pay 1(\.0+)? XLM, held by the claims module until the tribe launches\. If the drive fails, you can take it back\./)
  ).toBeVisible();
  await expect(page.getByText('Checks passed. Nothing is signed or sent yet.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Sign and claim' }).click();
  await waitForVisible(
    page.getByText('Claim confirmed. Your claim history can take a moment to update.'),
    'claim confirmed',
    { governingS: 60 }
  );
}

test.describe('W05 drive states', { tag: '@matrix' }, () => {
  for (const kind of ['ready', 'fail'] as const) {
    test(`the ${kind} drive's claims and setup pages`, async ({ page }) => {
      const fixture = drive(kind);
      const state = await claimState(page, fixture.daoId);
      const phase = state.lists[0]?.assurance?.state;
      await page.goto(`/dao/${fixture.daoId}/claims`);
      await waitForVisible(page.getByRole('heading', { name: 'Claim your tokens', level: 1 }), 'claims page');
      await waitForVisible(driveCard(page), 'drive card');
      await expect(page.getByText('Connect the wallet that is on a claim list to see your tokens, or to take back a payment.')).toBeVisible();
      await expect(driveCard(page).getByRole('progressbar', { name: 'People who have claimed' })).toBeVisible();
      if (state.live) await expect(driveCard(page).getByText('Enough people claimed and the tribe launched.')).toBeVisible();
      else if (phase === 'failed')
        await expect(driveCard(page).getByText(/^The drive ended before the tribe launched\./)).toBeVisible();
      else await expect(driveCard(page).getByText(/people needed by /)).toBeVisible();
      await expectNoHorizontalScroll(page);

      await page.goto(`/dao/${fixture.daoId}/setup`);
      if (state.live) {
        // Setup hands over to the tribe's Home once it is live.
        await waitForUi('setup hands over to Home', (timeout) => expect(page).not.toHaveURL(/\/setup$/, { timeout }));
      } else {
        await waitForVisible(
          page.getByRole('heading', { name: phase === 'failed' ? 'The launch drive ended' : 'Launch drive open' }),
          'drive card on setup'
        );
      }
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe('W05 launch drive', { tag: '@chain' }, () => {
  test('two people claim, then anyone launches it', async ({ page, wallet }) => {
    requireVerifiedManager();
    test.setTimeout(15 * 60_000);
    const ready = drive('ready');
    const before = await claimState(page, ready.daoId);
    if (before.live || before.lists[0]?.claimers)
      throw new Error(`The ready drive ${ready.slug} was already used. ${RECREATE} ready`);

    // The launch admin's Setup is frozen and points at the drive.
    await switchAccount(page, wallet, 'e2e-founder', `/dao/${ready.daoId}/setup`);
    await waitForVisible(page.getByRole('heading', { name: 'Launch drive open' }), 'drive open on setup');
    await expect(page.getByText('While the drive runs')).toBeVisible();
    await expect(page.getByText(/Settings, artwork and founder tokens can't change\./)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Required to launch' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'See the drive' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await claimWithProof(page, wallet, 'e2e-member-a', ready);
    await waitForUi('one of two claimed', (timeout) =>
      expect(driveCard(page).getByText(/^1 of 2 people needed by /)).toBeVisible({ timeout })
    );
    await expect(driveCard(page).getByText(/1 of 2 tokens claimed by 1 person/)).toBeVisible();

    await claimWithProof(page, wallet, 'e2e-member-b', ready);
    const met = driveCard(page).getByText('Enough people have claimed. Anyone can launch the tribe now.');
    await waitForVisible(met, 'threshold met', { governingS: 30 });

    // member-b is not the launch admin; launch_when_ready is open to anyone.
    await page.getByRole('button', { name: 'Launch the tribe' }).click();
    await waitForVisible(
      driveCard(page).getByText('Enough people claimed and the tribe launched.'),
      'launched through the drive',
      { governingS: 60 }
    );
    expect((await claimState(page, ready.daoId)).live).toBe(true);
    await waitForIndexed<{ status: string }>(
      page.request,
      { label: 'drive tribe live', path: `/api/dao/${ready.daoId}`, predicate: (body) => body.status === 'operational' },
      { governingS: 0 }
    );
    await waitForIndexed<{ claimedBy?: string | null }>(
      page.request,
      { label: 'drive link claimed', path: `/api/slugs/${ready.slug}`, predicate: (body) => body.claimedBy === ready.daoId },
      { governingS: 0 }
    );
  });

  test('the drive ends short, the claimer takes the payment back and the link is freed', async ({
    page,
    wallet
  }) => {
    requireVerifiedManager();
    const fail = drive('fail');
    const head = await latestLedger();
    const remaining = fail.deadline - head.closeTime;
    if (remaining < 120)
      throw new Error(`The fail drive ${fail.slug} closes in ${remaining}s, too soon to claim first. ${RECREATE} fail`);
    test.setTimeout((remaining + 15 * 60) * 1000);

    await claimWithProof(page, wallet, 'e2e-member-a', fail);
    await waitForUi('one of two claimed', (timeout) =>
      expect(driveCard(page).getByText(/^1 of 2 people needed by /)).toBeVisible({ timeout })
    );
    // While it runs there is nothing to refund.
    await expect(page.getByRole('button', { name: /^Take back / })).toHaveCount(0);

    // The network's clock passes the deadline with one of two claimed.
    await waitForLedgerTime(fail.deadline + 1, { governingS: remaining, label: 'drive deadline' });
    await page.reload();
    await waitForVisible(
      driveCard(page).getByText('The drive ended before the tribe launched. Everyone who paid can take their payment back.'),
      'drive failed',
      { governingS: 30 }
    );
    await expect(driveCard(page).getByText('Failed', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Take back 1(\.0+)? XLM$/ }).click();
    await waitForVisible(driveCard(page).getByText('Your payment has been returned.'), 'refund confirmed', {
      governingS: 60
    });

    // The launch admin's Setup says it ended and sends people to refunds.
    await switchAccount(page, wallet, 'e2e-founder', `/dao/${fail.daoId}/setup`);
    await waitForVisible(page.getByRole('heading', { name: 'The launch drive ended' }), 'ended on setup');
    await expect(page.getByRole('link', { name: 'Go to refunds' })).toBeVisible();

    // Anyone frees the reserved link.
    await switchAccount(page, wallet, 'e2e-member-b', `/dao/${fail.daoId}/claims`);
    await waitForVisible(driveCard(page), 'drive card');
    await driveCard(page).getByRole('button', { name: 'Free the link' }).click();
    await waitForVisible(page.getByText('The link is free again. The page will update shortly.'), 'link freed', {
      governingS: 60
    });
    await waitForIndexed<{ claimedBy?: string | null }>(
      page.request,
      { label: 'link released', path: `/api/slugs/${fail.slug}`, predicate: (body) => !body.claimedBy },
      { governingS: 0 }
    );
  });
});
