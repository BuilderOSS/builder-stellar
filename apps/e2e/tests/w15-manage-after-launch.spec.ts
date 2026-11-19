import type { Page } from '@playwright/test';

import { signInAs } from '../src/connect.ts';
import { appliedTheme, expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import {
  auctionConfig,
  auctionPaused,
  governorRules,
  loadTribe,
  marketConfig,
  tokenName,
  tokensOf
} from '../src/w09/fixture.ts';
import {
  confirmAdd,
  draftCount,
  driveToExecuted,
  openComposer,
  proposalOf,
  type ProposalRecord,
  runState,
  runTag,
  saveRunState,
  submitProposal,
  writeAndReview
} from '../src/w09/proposals.ts';
import { waitForIndexed, waitForUi, waitForVisible } from '../src/waits.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';

/**
 * W15 · Manage after launch (§3.4): the tribe profile, minting, a voting rule, the auction and the
 * market, each changed from its Manage page as a proposal of its own, voted, queued, executed and
 * checked. Also the authority copy every Manage page shows: "Setup: …" on a tribe still in its setup
 * window (it applies directly), "Requires DAO governance: …" once launched (it goes to a vote).
 *
 * Tribes: "E2E Manage" (launched) and "E2E Setup" (never launched), src/w09/fixture.ts. Values that
 * change for good alternate between two values from run to run.
 */

const launched = loadTribe('manage');
const setup = loadTribe('setup');
const SPEC = 'w15';
const PROPOSER = 'e2e-founder';
/**
 * Proposes, votes, queues and executes W15's proposals. Member A's 2 votes pass alone at the 10%
 * quorum, and W09 signs as the founder, so the two walks can run side by side.
 */
const MANAGER = 'e2e-member-a';
const MEMBER_B = 'e2e-member-b';
const TAG = runTag();
const KEYS = ['profile', 'token', 'governance', 'auction', 'marketplace'];
const NAMES = ['E2E Manage', 'E2E Manage Two'];
const GOVERNANCE = 'Requires DAO governance: it runs only if members vote for it.';
const SETUP = 'Setup: you apply this directly as the launch admin.';

const other = <T>(pair: T[], current: T) => (current === pair[0] ? pair[1]! : pair[0]!);

/* ---------- Authority copy, read-only (@matrix: every viewport and theme) ---------- */

/** Each Manage page, the copy that says who decides, launched and in setup. */
async function checkLaunchedCopy(page: Page) {
  await page.goto(launched.path('admin'));
  const sections = page.getByRole('main');
  for (const section of [
    'Tribe profile',
    'Mint tokens',
    'Artwork',
    'Voting rules',
    'Membership',
    'Auction',
    'Market'
  ]) {
    await waitForVisible(
      sections.getByRole('link', { name: new RegExp(`^${section} .*Needs a vote$`) }),
      `${section}: Needs a vote`
    );
  }
  await expectNoHorizontalScroll(page);

  await page.goto(launched.path('admin/governance'));
  await waitForVisible(
    page.getByText('Requires DAO governance: change one rule at a time. Each change goes up for a vote.'),
    'Voting rules: governance copy'
  );
  await expect(page.getByText(GOVERNANCE).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply now' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  for (const [section, label] of [
    ['admin/profile', 'Tribe profile'],
    ['admin/token', 'Mint tokens'],
    ['admin/auction', 'Auction'],
    ['admin/marketplace', 'Market']
  ] as const) {
    await page.goto(launched.path(section));
    await waitForVisible(page.getByText(GOVERNANCE).first(), `${label}: governance copy`);
    await expect(page.getByText(SETUP)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  }
  await expect(
    page.getByText('Once the tribe has launched, members change the market by vote.', { exact: false })
  ).toBeVisible();
}

async function checkSetupCopy(page: Page) {
  await page.goto(setup.path('admin'));
  await waitForVisible(page.getByText('This tribe is in setup'), 'setup note');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: /^Founder tokens .*Required for launch$/ })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Voting rules .*Optional before launch$/ })).toBeVisible();
  await expect(main.getByText('Needs a vote')).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.goto(setup.path('admin/governance'));
  await waitForVisible(page.getByText('Setup: change one rule at a time, directly.'), 'Voting rules: setup copy');
  await expect(page.getByText(SETUP).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply now' }).first()).toBeVisible();
  await expect(page.getByText(GOVERNANCE)).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  for (const [section, label, button] of [
    ['admin/profile', 'Tribe profile', 'Apply changes now'],
    ['admin/token', 'Mint tokens', null],
    ['admin/auction', 'Auction', 'Apply now']
  ] as const) {
    await page.goto(setup.path(section));
    await waitForVisible(page.getByText(SETUP).first(), `${label}: setup copy`);
    await expect(page.getByText(GOVERNANCE)).toHaveCount(0);
    if (button) await expect(page.getByRole('button', { name: button })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  await expect(page.getByText('During setup, changes apply right away. Each one is its own signature.')).toBeVisible();
  // The market isn't live until launch: its settings go to a vote after it.
  await page.goto(setup.path('admin/marketplace'));
  await waitForVisible(page.getByText('The market opens at launch'), 'Market: opens at launch');
  await expect(page.getByText('Pools and market settings can be proposed once the tribe has launched.')).toBeVisible();
  await expectNoHorizontalScroll(page);
}

test.describe('W15 authority copy', { tag: '@matrix' }, () => {
  test.use({ actionTimeout: 30_000 });
  test('W15 Manage says Setup before launch and Requires DAO governance after', async ({ page, wallet, theme }) => {
    test.setTimeout(4 * 60_000);
    await page.goto(setup.path());
    expect(await appliedTheme(page)).toBe(theme);
    // The launch admin's view: the Setup copy offers to apply directly.
    await signInAs(page, wallet, PROPOSER);
    await checkSetupCopy(page);
    await checkLaunchedCopy(page);
  });
});

/* ---------- Each Manage page, as a proposal (@chain) ---------- */

async function propose(page: Page, wallet: E2ESigner, key: string, why: string, before: Record<string, unknown>) {
  await openComposer(page, launched);
  const actions = await draftCount(page);
  expect(actions).toBeGreaterThan(0);
  const title = `W15 ${key} ${TAG}`;
  await writeAndReview(page, { title, why, actions });
  await expectNoHorizontalScroll(page);
  if (process.env.E2E_COMPOSE_ONLY === '1') test.skip(true, `E2E_COMPOSE_ONLY: ${key} composed, not submitted`);
  const id = await submitProposal(page, wallet, MANAGER, actions);
  saveRunState(SPEC, (state) => {
    state.proposals[key] = { id, title, actions, before };
  });
}

async function startOn(page: Page, wallet: E2ESigner, section: string) {
  await page.goto(launched.path());
  await signInAs(page, wallet, MANAGER);
  await page.goto(launched.path(section));
}

test.describe('W15 manage after launch', { tag: '@chain' }, () => {
  test.use({ actionTimeout: 30_000 });
  let ids: Record<string, string> = {};
  test.beforeAll(async ({ identities }) => {
    requireVerifiedManager();
    ids = Object.fromEntries(Object.values(identities).map(({ name, address }) => [name, address]));
  });
  test.beforeEach(() => test.setTimeout(10 * 60_000));

  test('W15 the tribe profile and name, from Manage → Tribe profile', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.profile), 'proposed earlier in this run');
    const name = other(NAMES, tokenName(launched).name);
    const description = `Walkthrough fixture for Manage after launch (W15, testnet). Run ${TAG}.`;
    await startOn(page, wallet, 'admin/profile');
    await waitForVisible(page.getByText(GOVERNANCE), 'profile: governance copy');
    const box = page.getByRole('textbox', { name: 'Description' });
    await waitForUi('profile loaded', (timeout) => expect(box).not.toHaveValue('', { timeout }));
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await box.fill(description);
    await expect(page.getByRole('heading', { name: 'If the proposal passes, it will' })).toBeVisible();
    await page.getByRole('button', { name: /^Add \d+ actions? to proposal$/ }).click();
    await confirmAdd(page);
    await propose(page, wallet, 'profile', 'Walkthrough W15: the profile and the name, from Manage.', {
      name,
      description
    });
  });

  test('W15 a membership token, from Manage → Mint tokens', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.token), 'proposed earlier in this run');
    const held = (await tokensOf(page.request, launched, ids[MEMBER_B]!)).length;
    await startOn(page, wallet, 'admin/token');
    await waitForVisible(page.getByText(GOVERNANCE), 'mint: governance copy');
    await page.getByRole('textbox', { name: 'Recipient 1' }).fill(ids[MEMBER_B]!);
    await page.getByRole('spinbutton', { name: 'Tokens' }).fill('1');
    await page.getByRole('button', { name: 'Add to proposal' }).click();
    await confirmAdd(page);
    await propose(page, wallet, 'token', 'Walkthrough W15: mint one membership, from Manage.', { held });
  });

  test('W15 the quorum, from Manage → Voting rules', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.governance), 'proposed earlier in this run');
    const { quorumBps } = await governorRules(page.request, launched);
    const next = quorumBps === 1000 ? 1100 : 1000;
    await startOn(page, wallet, 'admin/governance');
    const region = page.getByRole('region', { name: 'Quorum' });
    await waitForVisible(region.getByText(`Now: ${quorumBps / 100}%`), 'quorum now');
    await region.getByRole('spinbutton', { name: /^Quorum/ }).fill((next / 100).toFixed(2));
    await expect(region.getByText(GOVERNANCE)).toBeVisible();
    await region.getByRole('button', { name: 'Add to proposal' }).click();
    await confirmAdd(page);
    await propose(page, wallet, 'governance', 'Walkthrough W15: one voting rule, from Manage.', { quorumBps: next });
  });

  test('W15 the starting price, from Manage → Auction (pause, change, resume)', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.auction), 'proposed earlier in this run');
    const reserve = auctionConfig(launched).reserve_price === '10000000' ? '20000000' : '10000000';
    await startOn(page, wallet, 'admin/auction');
    await waitForVisible(page.getByText('After launch, changes go to a vote.', { exact: false }), 'auction: vote copy');
    const change = page.getByRole('region', { name: 'Change auction settings' });
    await change.getByRole('textbox', { name: 'Starting price' }).fill(String(Number(reserve) / 10_000_000));
    await expect(change.getByRole('radio', { name: 'Resume auctions' })).toBeChecked();
    await expect(change.getByText(GOVERNANCE)).toBeVisible();
    // Pause, the new price, resume: "Add 3 steps to proposal".
    await change.getByRole('button', { name: 'Add 3 steps to proposal' }).click();
    await confirmAdd(page);
    await propose(page, wallet, 'auction', 'Walkthrough W15: the starting price, from Manage.', { reserve });
  });

  test('W15 the resale fee, from Manage → Market', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.marketplace), 'proposed earlier in this run');
    const fee = marketConfig(launched).default_secondary_fee_bps === 250 ? 300 : 250;
    await startOn(page, wallet, 'admin/marketplace');
    await waitForVisible(page.getByText('The market is open'), 'market loaded');
    const setting = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: 'Change the resale fee' }) })
      .filter({ has: page.getByRole('button', { name: 'Add to proposal' }) })
      .last();
    await setting.getByRole('textbox', { name: 'Resale fee (%)' }).fill(String(fee / 100));
    await setting.getByRole('button', { name: 'Add to proposal' }).click();
    await confirmAdd(page);
    await propose(page, wallet, 'marketplace', 'Walkthrough W15: the resale fee, from Manage.', { fee });
  });

  test('W15 every Manage proposal voted, queued and executed', async ({ page, wallet }) => {
    test.setTimeout(45 * 60_000);
    const made = KEYS.filter((key) => runState(SPEC).proposals[key]);
    test.skip(!made.length, 'no W15 proposal was made');
    await driveToExecuted(page, wallet, MANAGER, launched, SPEC, made, (line) => console.info(`W15 ${line}`));
  });

  test('W15 every change took effect', async ({ page }) => {
    const before = (key: string) => (proposalOf(SPEC, key) as ProposalRecord & { before: Record<string, any> }).before;
    expect(tokenName(launched).name).toBe(before('profile').name);
    expect((await governorRules(page.request, launched)).quorumBps).toBe(before('governance').quorumBps);
    expect(auctionConfig(launched).reserve_price).toBe(before('auction').reserve);
    expect(auctionPaused(launched)).toBe(false);
    expect(marketConfig(launched).default_secondary_fee_bps).toBe(before('marketplace').fee);
    await waitForIndexed<{ items: unknown[] }>(
      page.request,
      {
        label: 'minted token indexed',
        path: `${launched.api('tokens')}?owner=${ids[MEMBER_B]}&limit=100`,
        predicate: (body) => body.items.length === before('token').held + 1
      },
      { governingS: 0 }
    );
    await page.goto(launched.path());
    await waitForVisible(page.getByText(before('profile').description).first(), 'the new description', {
      governingS: 180
    });
    await page.goto(launched.path('admin/auction'));
    await waitForVisible(page.getByRole('region', { name: 'Auction now' }).getByText('Running'), 'auction resumed');
  });
});
