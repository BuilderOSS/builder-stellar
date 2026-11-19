import type { Locator, Page } from '@playwright/test';

import { signInAs } from '../src/connect.ts';
import { appliedTheme, expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import {
  approvalLedger,
  auctionConfig,
  auctionNow,
  auctionPaused,
  firstHeld,
  governorRules,
  invoke,
  loadTribe,
  marketConfig,
  mintAllowance,
  NATIVE_SAC,
  ownerOf,
  read,
  rendererBase,
  sacBalance,
  tokenModules,
  tokenName,
  tokenSettings,
  tokensOf,
  transferAgents,
  USDC_SAC
} from '../src/w09/fixture.ts';
import {
  confirmAdd,
  draftCount,
  driveToExecuted,
  openComposer,
  pickAction,
  proposalOf,
  type ProposalRecord,
  queueItems,
  runState,
  runTag,
  saveRunState,
  setMinutes,
  submitProposal,
  writeAndReview
} from '../src/w09/proposals.ts';
import { waitForIndexed, waitForUi, waitForVisible } from '../src/waits.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';

/**
 * W09 · One proposal per action group (docs/PROPOSAL_ACTIONS.md), each made in the app, voted,
 * queued, executed and checked on chain (§3.4). Groups share their waits: round 1 makes seven
 * proposals one after another, then drives them all through one timeline; round 2 cleans up what
 * only exists after round 1 ran (the pool it opened, the claims module it added).
 *
 *   members   Add members, Give a treasury token, Approve a membership transfer, Pay someone,
 *             DAO recovery on → Recover a membership → off, Lock memberships on,
 *             Members-only delegation on, Change a transfer agent on, Rename the tribe
 *   rules     the five voting rules
 *   auction   Pause, duration, late-bid time, starting price, minimum increase, payment asset,
 *             Cancel the current auction, Resume
 *   market    mint allowance, quick-buy pool (Manage → Market), Treasury purchase (Manage → Market),
 *             resale fee, payment asset USDC → XLM, Pause → Reopen
 *   slug      Change the link (Manage → Tribe profile), on its own as the app requires
 *   profile   Tribe profile description (Manage → Tribe profile), renderer (Manage → Artwork)
 *   modules   Add a module: claims (Manage → Membership), create and register
 *   cleanup   Close a pool, the three switches off again, Remove a module (round 2)
 *
 * Switches go on in round 1 and off in round 2 (recovery on and off around its transfer), so every
 * run starts from the same settings. Values that change for good (durations, the name, the slug)
 * alternate between two values from run to run. The members proposal runs after the market's, since
 * it locks memberships.
 *
 * Not covered here: `upgrade-dao-module` (needs an operator-approved upgrade path, W16) and
 * `migrate-dao-module` (not offered: every contract is at storage version 1); `mint-governance-token`
 * (no longer offered: one Mint membership tokens form replaced it); `open-claim-list` and
 * `add-artwork-properties` (each uploads to IPFS, which the walkthrough build turns off; W12 covers
 * claims); `regenerate-token-traits` (needs a token minted without traits, which no mint after the
 * artwork makes); `sweep-pool` (needs a closed pool someone restocked, W11).
 */

const tribe = loadTribe('actions');
const SPEC = 'w09';
const PROPOSER = 'e2e-founder';
const MEMBER_A = 'e2e-member-a';
const MEMBER_B = 'e2e-member-b';
const TAG = runTag();
const ROUND_1 = ['members', 'rules', 'auction', 'market', 'slug', 'profile', 'modules'];
const ROUND_2 = ['cleanup'];
const NAMES = ['E2E Actions', 'E2E Actions Two'];
const SLUGS = ['e2e-w09', 'e2e-w09-b'];
const RENDERERS = ['https://tribes.build/api/render', 'https://www.tribes.build/api/render'];

let ids: Record<string, string> = {};
/** E2E_COMPOSE_ONLY=1 composes and reviews every proposal without submitting: a quick check of the forms. */
const COMPOSE_ONLY = process.env.E2E_COMPOSE_ONLY === '1';

const other = <T>(pair: T[], current: T) => (current === pair[0] ? pair[1]! : pair[0]!);
const flip = (minutes: number) => (minutes === 5 ? 6 : 5);

/* ---------- Composing ---------- */

/** Sign in as the proposer and open an empty draft (each test has a fresh browser, so a fresh draft). */
async function startDraft(page: Page, wallet: E2ESigner) {
  await page.goto(tribe.path());
  await signInAs(page, wallet, PROPOSER);
  await openComposer(page, tribe);
  await expect(queueItems(page)).toHaveCount(0);
}

async function propose(
  page: Page,
  wallet: E2ESigner,
  key: string,
  why: string,
  before: Record<string, unknown>
): Promise<ProposalRecord> {
  await openComposer(page, tribe);
  const actions = await draftCount(page);
  const title = `W09 ${key} ${TAG}`;
  const preview = await writeAndReview(page, { title, why, actions });
  await expect(
    preview.getByText(actions === 1 ? 'If it passes, this runs' : 'If it passes, these run in order')
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  if (COMPOSE_ONLY) test.skip(true, `E2E_COMPOSE_ONLY: ${key} composed with ${actions} actions, not submitted`);
  const id = await submitProposal(page, wallet, PROPOSER, actions);
  const record = { id, title, actions, before };
  saveRunState(SPEC, (state) => {
    state.proposals[key] = record;
  });
  return record;
}

const fillText = (form: Locator, label: string, value: string) =>
  form.getByRole('textbox', { name: label }).fill(value);
const setSwitch = async (form: Locator, name: RegExp, on: boolean) => {
  const box = form.getByRole('checkbox', { name });
  if ((await box.isChecked()) !== on) await box.click({ force: true });
  await expect(box).toBeChecked({ checked: on });
};

/* ---------- The forms at every viewport and theme (@matrix: nothing is submitted) ---------- */

test.describe('W09 composer forms', { tag: '@matrix' }, () => {
  test.use({ actionTimeout: 30_000 });

  test('W09 the picker and action forms fit, and a draft step opens the next', async ({ page, wallet, theme }) => {
    test.setTimeout(3 * 60_000);
    await page.goto(tribe.path());
    expect(await appliedTheme(page)).toBe(theme);
    await signInAs(page, wallet, PROPOSER);
    await openComposer(page, tribe);
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Add an action' }).click();
    const picker = page.getByRole('dialog', { name: 'Add an action' });
    await waitForVisible(picker, 'action picker');
    // BUG-W09-1: the market asset by its code.
    await expect(picker.getByRole('button', { name: /^Change the market payment asset Now: XLM$/ })).toBeVisible();
    await expect(picker.getByRole('button', { name: /^Recover a membership/ })).toBeDisabled();
    await expectNoHorizontalScroll(page);
    await picker.getByRole('button', { name: /^Pay someone/ }).click();
    const form = page.getByRole('dialog', { name: 'Set up the action' });
    await waitForVisible(form.getByRole('textbox', { name: 'Recipient' }), 'Pay someone form');
    await expectNoHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await expect(form).toBeHidden();

    // BUG-W09-3: with recovery on in the draft, Recover a membership opens.
    await pickAction(page, /^DAO recovery Now: Off$/, (box) => setSwitch(box, /^DAO recovery/, true));
    await page.getByRole('button', { name: 'Add an action' }).click();
    await expect(picker.getByRole('button', { name: /^Recover a membership/ })).toBeEnabled();
    await picker.getByRole('button', { name: /^Recover a membership/ }).click();
    await waitForVisible(form.getByRole('textbox', { name: 'New holder' }), 'Recover a membership form');
    await expectNoHorizontalScroll(page);
    await page.keyboard.press('Escape');

    await page.goto(tribe.path('admin/marketplace'));
    await waitForVisible(page.getByRole('heading', { name: 'Propose a quick-buy pool' }), 'Manage → Market');
    await expect(page.getByText('Now: XLM')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

/* ---------- The walk ---------- */

test.describe('W09 proposal actions', { tag: '@chain' }, () => {
  test.use({ actionTimeout: 30_000 });
  test.beforeAll(async ({ identities }) => {
    requireVerifiedManager();
    ids = Object.fromEntries(Object.values(identities).map(({ name, address }) => [name, address]));
  });
  test.beforeEach(() => test.setTimeout(15 * 60_000));

  test('W09 membership and treasury actions, in one proposal', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.members), 'proposed earlier in this run');
    // The fixture: the treasury holds a token to give (bought by the last run's market proposal, or
    // given now), and member A approves the treasury for one of theirs.
    let give = (await tokensOf(page.request, tribe, tribe.treasury)).find(
      (id) => ownerOf(tribe, id) === tribe.treasury
    );
    if (give === undefined) {
      give = firstHeld(tribe, ids[PROPOSER]!, await tokensOf(page.request, tribe, ids[PROPOSER]!));
      invoke(
        tribe.token,
        PROPOSER,
        ['transfer', '--from', ids[PROPOSER]!, '--to', tribe.treasury, '--token_id', String(give)],
        'yes'
      );
    }
    const heldByA = await tokensOf(page.request, tribe, ids[MEMBER_A]!);
    const approved = firstHeld(tribe, ids[MEMBER_A]!, heldByA);
    const recovered = firstHeld(tribe, ids[MEMBER_A]!, heldByA, [approved]);
    invoke(
      tribe.token,
      MEMBER_A,
      [
        'approve',
        '--owner',
        ids[MEMBER_A]!,
        '--spender',
        tribe.treasury,
        '--token_id',
        String(approved),
        '--expiration_ledger',
        String(approvalLedger())
      ],
      'yes'
    );
    const name = tokenName(tribe);
    const auctionAgent = tribe.auction!;
    const before = {
      give,
      approved,
      recovered,
      name: other(NAMES, name.name),
      symbol: name.symbol,
      settings: tokenSettings(tribe),
      agents: transferAgents(tribe),
      bXlm: String(sacBalance(NATIVE_SAC, ids[MEMBER_B]!)),
      aTokens: heldByA.length,
      bTokens: (await tokensOf(page.request, tribe, ids[MEMBER_B]!)).length
    };
    expect(before.settings).toEqual({ dao_recovery: false, members_only_delegation: false, transfers_locked: false });

    await startDraft(page, wallet);

    await pickAction(page, /^Add members/, async (form) => {
      await fillText(form, 'Recipient 1', ids[MEMBER_A]!);
      await form.getByRole('spinbutton', { name: 'Tokens' }).first().fill('2');
      await form.getByRole('button', { name: 'Add recipient' }).click();
      await fillText(form, 'Recipient 2', ids[MEMBER_B]!);
      await form.getByRole('spinbutton', { name: 'Tokens' }).nth(1).fill('1');
    });
    await pickAction(page, /^Give a treasury token/, async (form) => {
      await fillText(form, 'Token number', String(give));
      await fillText(form, 'Give it to', ids[PROPOSER]!);
    });
    await pickAction(
      page,
      /^Approve a membership transfer/,
      async (form) => {
        await fillText(form, 'Token', String(approved));
        await fillText(form, 'Current holder', ids[MEMBER_A]!);
        await fillText(form, 'New holder', ids[MEMBER_B]!);
      },
      { advanced: true }
    );
    await pickAction(page, /^Pay someone/, async (form) => {
      await form.getByLabel('Asset').selectOption({ label: 'XLM (Native)' });
      await fillText(form, 'Recipient', ids[MEMBER_B]!);
      await fillText(form, 'Amount', '1');
    });
    // Recovery on, recover, recovery off: "Recover a membership" opens once recovery is on in the draft.
    await pickAction(page, /^DAO recovery Now: Off$/, (form) => setSwitch(form, /^DAO recovery/, true));
    await pickAction(page, /^Recover a membership/, async (form) => {
      await fillText(form, 'Token', String(recovered));
      await fillText(form, 'New holder', ids[PROPOSER]!);
    });
    await pickAction(page, /^DAO recovery Now: Off$/, (form) => setSwitch(form, /^DAO recovery/, false));
    // Turned on here and off again in round 2, so every run starts with them off.
    await pickAction(page, /^Lock memberships Now: Off$/, (form) => setSwitch(form, /^Lock memberships/, true));
    await pickAction(page, /^Members-only delegation Now: Off$/, (form) =>
      setSwitch(form, /^Members-only delegation/, true)
    );
    await pickAction(
      page,
      /^Change a transfer agent/,
      async (form) => {
        await fillText(form, 'Module', auctionAgent);
        await setSwitch(form, /^Can move memberships/, true);
      },
      { advanced: true }
    );
    await pickAction(page, /^Rename the tribe/, async (form) => {
      await fillText(form, 'Name', before.name);
      await fillText(form, 'Symbol', before.symbol);
    });
    await expect.poll(() => draftCount(page)).toBe(11);
    await propose(
      page,
      wallet,
      'members',
      'Walkthrough W09: every membership and treasury action in one vote.',
      before
    );
  });

  test('W09 voting rules, in one proposal', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.rules), 'proposed earlier in this run');
    const now = await governorRules(page.request, tribe);
    const next = {
      votingDelay: flip(now.votingDelay / 60) * 60,
      votingPeriod: flip(now.votingPeriod / 60) * 60,
      queueDelay: flip(now.queueDelay / 60) * 60,
      threshold: now.threshold === 1 ? 2 : 1,
      quorumBps: now.quorumBps === 1000 ? 1100 : 1000
    };
    await startDraft(page, wallet);
    await pickAction(page, /^Change the wait before voting opens/, (form) => setMinutes(form, next.votingDelay / 60));
    await pickAction(page, /^Change how long voting stays open/, (form) => setMinutes(form, next.votingPeriod / 60));
    await pickAction(page, /^Change the safety delay/, (form) => setMinutes(form, next.queueDelay / 60));
    await pickAction(page, /^Change the votes needed to propose/, (form) =>
      form.getByRole('textbox', { name: /^Votes needed to propose/ }).fill(String(next.threshold))
    );
    await pickAction(page, /^Change the quorum/, (form) =>
      form.getByRole('spinbutton', { name: /^Quorum/ }).fill((next.quorumBps / 100).toFixed(2))
    );
    await propose(page, wallet, 'rules', 'Walkthrough W09: every voting rule in one vote.', next);
  });

  test('W09 auction settings: pause, change, cancel and resume, in one proposal', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.auction), 'proposed earlier in this run');
    const config = auctionConfig(tribe);
    const current = auctionNow(tribe);
    expect(current.highest_bid, 'the fixture auction never takes a bid').toBe('0');
    expect(auctionPaused(tribe)).toBe(false);
    const next = {
      duration: flip(config.duration / 60) * 60,
      timeBuffer: config.time_buffer === 60 ? 120 : 60,
      reserve: config.reserve_price === '10000000' ? '20000000' : '10000000',
      minBid: config.min_bid_increment_percent === 10 ? 11 : 10,
      paymentToken: config.payment_token === NATIVE_SAC ? USDC_SAC : NATIVE_SAC,
      cancelled: current.token_id
    };
    await startDraft(page, wallet);
    // The first change brings its own pause and resume ("Change the auction: 3 steps"); the rest go
    // between them.
    await pickAction(page, /^Change how long each auction runs/, (form) => setMinutes(form, next.duration / 60));
    await pickAction(page, /^Change how much time a late bid adds/, (form) => setMinutes(form, next.timeBuffer / 60));
    await pickAction(page, /^Change the starting price/, (form) =>
      form.getByRole('textbox', { name: 'Starting price' }).fill(String(Number(next.reserve) / 10_000_000))
    );
    await pickAction(page, /^Change the minimum bid increase/, (form) =>
      form.getByRole('textbox', { name: /^Minimum bid increase/ }).fill(String(next.minBid))
    );
    await pickAction(
      page,
      /^Change the auction payment asset/,
      async (form) => {
        await form
          .getByRole('combobox', { name: 'Payment token' })
          .selectOption({ label: next.paymentToken === USDC_SAC ? 'USDC · USD Coin' : 'XLM · Lumens' });
      },
      { advanced: true }
    );
    await pickAction(page, /^Cancel the current auction/, async () => undefined);
    // Pause, five changes, cancel, resume: one "Change the auction" item.
    await expect(
      page.getByRole('list', { name: 'Actions in this proposal' }).getByText('Change the auction')
    ).toBeVisible();
    await expect.poll(() => draftCount(page)).toBe(8);
    await propose(page, wallet, 'auction', 'Walkthrough W09: every auction setting, then a fresh auction.', next);
  });

  test('W09 market: allowance, pool, Treasury purchase, fee, asset and pause, in one proposal', async ({
    page,
    wallet
  }) => {
    test.skip(Boolean(runState(SPEC).proposals.market), 'proposed earlier in this run');
    const config = marketConfig(tribe);
    expect(config.paused).toBe(false);
    expect(config.payment_asset, 'each run puts the market back on XLM').toBe(NATIVE_SAC);
    // The fixture: the founder lists a token for 1 XLM, for the treasury to buy (an open listing left
    // by an earlier run that never got bought is used again).
    type Listings = { listings: { tokenId: string | null; seller: string | null; price: string; status: string }[] };
    const open = await page.request.get(
      `${tribe.api('marketplace')}?kind=secondary&status=open&seller=${ids[PROPOSER]}`
    );
    const reuse = ((await open.json()) as Listings).listings.find(
      (row) => row.seller === ids[PROPOSER] && row.price === '10000000' && row.tokenId !== null
    );
    let listed = reuse ? Number(reuse.tokenId) : -1;
    if (listed < 0 || ownerOf(tribe, listed) !== tribe.marketplace) {
      listed = firstHeld(tribe, ids[PROPOSER]!, await tokensOf(page.request, tribe, ids[PROPOSER]!));
      invoke(
        tribe.token,
        PROPOSER,
        [
          'approve',
          '--owner',
          ids[PROPOSER]!,
          '--spender',
          tribe.marketplace!,
          '--token_id',
          String(listed),
          '--expiration_ledger',
          String(approvalLedger())
        ],
        'yes'
      );
      const expiresAt = Math.floor(Date.now() / 1000) + 3 * 86_400;
      invoke(
        tribe.marketplace!,
        PROPOSER,
        [
          'list',
          '--token_id',
          String(listed),
          '--seller',
          ids[PROPOSER]!,
          '--price',
          '10000000',
          '--expires_at',
          String(expiresAt),
          '--max_fee_bps',
          '2500',
          '--payment_asset',
          NATIVE_SAC
        ],
        'yes'
      );
    }
    await waitForIndexed<Listings>(
      page.request,
      {
        label: `listing of #${listed} indexed`,
        path: `${tribe.api('marketplace')}?kind=secondary&status=open`,
        predicate: (body) => body.listings.some((row) => row.tokenId === String(listed))
      },
      { governingS: 0 }
    );
    const before = {
      listed,
      fee: config.default_secondary_fee_bps === 250 ? 300 : 250,
      allowance: mintAllowance(tribe, tribe.marketplace!),
      nextPool: Number(read(tribe.marketplace!, 'next_pool_id'))
    };

    await startDraft(page, wallet);
    await pickAction(page, /^Change a mint allowance/, async (form) => {
      await form.getByRole('combobox', { name: 'Module' }).selectOption({ label: 'Marketplace (quick-buy pools)' });
      await form.getByRole('combobox', { name: 'Change' }).selectOption({ label: 'Let it mint more tokens' });
      await fillText(form, 'Tokens', '2');
    });

    // The pool and the purchase are prepared in Manage → Market and land in the same draft.
    await page.goto(tribe.path('admin/marketplace'));
    await waitForVisible(page.getByRole('heading', { name: 'Propose a quick-buy pool' }), 'Manage → Market');
    await fillText(page.locator('main'), 'Price per token', '1');
    await fillText(page.locator('main'), 'Tokens in the pool', '2');
    await fillText(page.locator('main'), 'Maximum per wallet', '1');
    await fillText(page.locator('main'), 'Maximum sales per period', '1');
    await fillText(page.locator('main'), 'Period (hours)', '24');
    const closes = new Date(Date.now() + 2 * 86_400_000);
    const local = new Date(closes.getTime() - closes.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByLabel('Closes at (local time)').fill(local);
    await page.getByRole('button', { name: 'Add the pool to proposal' }).click();
    await confirmAdd(page);
    await fillText(page.locator('main'), 'Listed token ID', String(listed));
    const buy = page.getByRole('button', { name: 'Add the purchase to proposal' });
    await waitForUi('purchase ready', (timeout) => expect(buy).toBeEnabled({ timeout }), { governingS: 30 });
    await buy.click();
    await confirmAdd(page);

    await openComposer(page, tribe);
    const queued = page.getByRole('list', { name: 'Actions in this proposal' });
    await expect(queued.getByText('Open a quick-buy pool')).toBeVisible();
    await expect(queued.getByText(`Treasury buys listed token #${listed}`)).toBeVisible();
    await pickAction(page, /^Change the resale fee/, (form) =>
      form.getByRole('textbox', { name: 'Resale fee (%)' }).fill(String(before.fee / 100))
    );
    for (const label of ['USDC · USD Coin', 'XLM · Lumens'])
      await pickAction(page, /^Change the market payment asset Now: XLM$/, async (form) => {
        await form.getByRole('combobox', { name: 'Buyers pay in' }).selectOption({ label });
      });
    await pickAction(page, /^Pause the market Now: Open$/, async () => undefined);
    await pickAction(page, /^Reopen the market/, async () => undefined);
    await propose(
      page,
      wallet,
      'market',
      'Walkthrough W09: every market action, including a Treasury purchase.',
      before
    );
  });

  test('W09 the tribe link, in a proposal of its own', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.slug), 'proposed earlier in this run');
    const current = read<string>(read<string>(tribe.token, 'manager'), 'get_slug', '--token_address', tribe.token);
    const next = other(SLUGS, current);
    await startDraft(page, wallet);
    await page.goto(tribe.path('admin/profile'));
    const link = page.getByRole('textbox', { name: 'Link', exact: true });
    await waitForUi('the link shows the current slug', (timeout) => expect(link).toHaveValue(current, { timeout }));
    await link.fill(next);
    await waitForVisible(page.getByText(`/dao/${next} is available.`), 'slug available');
    await expect(page.getByText(`/dao/${current} → /dao/${next}`, { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Add the new link to proposal' }).click();
    await confirmAdd(page);
    await propose(
      page,
      wallet,
      'slug',
      'Walkthrough W09: the tribe link, on its own as a taken link fails everything.',
      {
        from: current,
        to: next
      }
    );
  });

  test('W09 tribe profile and artwork renderer, in one proposal', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.profile), 'proposed earlier in this run');
    const description = `Walkthrough fixture for proposal actions (W09, testnet). Run ${TAG}.`;
    const renderer = other(RENDERERS, rendererBase(tribe));
    await startDraft(page, wallet);
    await page.goto(tribe.path('admin/profile'));
    const box = page.getByRole('textbox', { name: 'Description' });
    await waitForUi('profile loaded', (timeout) => expect(box).not.toHaveValue('', { timeout }));
    await box.fill(description);
    await page.getByRole('button', { name: /^Add \d+ actions? to proposal$/ }).click();
    await confirmAdd(page);

    await page.goto(tribe.path('admin/artwork'));
    await page.getByRole('button', { name: 'Advanced' }).click();
    await page.getByRole('textbox', { name: 'New renderer address' }).fill(renderer);
    await page
      .getByRole('textbox', { name: 'Why change it?' })
      .fill(`Walkthrough W09 switches renderers each run (${TAG}).`);
    await page.getByRole('button', { name: 'Add to proposal' }).click();
    await confirmAdd(page);
    await propose(page, wallet, 'profile', 'Walkthrough W09: the profile and the renderer.', { description, renderer });
  });

  test('W09 add the claims module, in one proposal', async ({ page, wallet }) => {
    test.skip(Boolean(runState(SPEC).proposals.modules), 'proposed earlier in this run');
    expect(tokenModules(tribe).map((module) => module.kind)).not.toContain('claims');
    await startDraft(page, wallet);
    await page.goto(tribe.path('admin/owner'));
    await page.getByRole('button', { name: 'Add a module' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add a module' });
    await sheet.getByText('Invite lists', { exact: true }).click();
    const setUp = page.getByRole('dialog', { name: 'Set up the claims module' });
    await waitForVisible(setUp, 'claims module setup');
    const add = setUp.getByRole('button', { name: 'Add 2 actions to your proposal' });
    await waitForUi('the plan checked against the chain', (timeout) => expect(add).toBeEnabled({ timeout }), {
      governingS: 30
    });
    await expect(setUp.getByText('Checked just now. This should run as planned.')).toBeVisible();
    await add.click();
    await confirmAdd(page);
    await propose(page, wallet, 'modules', 'Walkthrough W09: a claims module, created and registered.', {});
  });

  test('W09 round 1: every proposal voted, queued and executed', async ({ page, wallet }) => {
    test.setTimeout(60 * 60_000);
    const made = ROUND_1.filter((key) => runState(SPEC).proposals[key]);
    test.skip(!made.length, 'no round 1 proposal was made');
    // The members proposal locks memberships, so it runs after the market's Treasury purchase.
    await driveToExecuted(page, wallet, PROPOSER, tribe, SPEC, made, (line) => console.info(`W09 ${line}`), {
      members: ['market']
    });
  });

  test('W09 members: every action took effect', async ({ page }) => {
    const { before } = proposalOf(SPEC, 'members') as ProposalRecord & { before: Record<string, any> };
    expect(ownerOf(tribe, before.give)).toBe(ids[PROPOSER]);
    expect(ownerOf(tribe, before.approved)).toBe(ids[MEMBER_B]);
    expect(ownerOf(tribe, before.recovered)).toBe(ids[PROPOSER]);
    // Recovery went on and off again; lock and members-only delegation stay on until round 2.
    expect(tokenSettings(tribe)).toEqual({
      dao_recovery: false,
      members_only_delegation: true,
      transfers_locked: true
    });
    expect(transferAgents(tribe)).toEqual([...before.agents, tribe.auction]);
    expect(tokenName(tribe)).toEqual({ name: before.name, symbol: before.symbol });
    expect(sacBalance(NATIVE_SAC, ids[MEMBER_B]!) - BigInt(before.bXlm)).toBe(10_000_000n);
    await waitForIndexed<{ items: { tokenId: number; owner: string }[] }>(
      page.request,
      {
        label: 'minted and moved tokens indexed',
        path: `${tribe.api('tokens')}?owner=${ids[MEMBER_B]}&limit=100`,
        // +1 minted, +1 approved transfer.
        predicate: (body) => body.items.length === before.bTokens + 2
      },
      { governingS: 0 }
    );
    expect((await tokensOf(page.request, tribe, ids[MEMBER_A]!)).length).toBe(before.aTokens);
    await page.goto(tribe.path());
    await waitForVisible(page.getByRole('heading', { name: before.name, level: 1 }), 'the new name on the tribe page');
  });

  test('W09 rules: every voting rule changed', async ({ page }) => {
    const { before } = proposalOf(SPEC, 'rules');
    await waitForIndexed(
      page.request,
      {
        label: 'new safety delay indexed',
        path: tribe.api('governance/settings'),
        predicate: (body: { settings: { queueDelay: number } }) => body.settings.queueDelay === before.queueDelay
      },
      { governingS: 0 }
    );
    expect(await governorRules(page.request, tribe)).toEqual(before);
  });

  test('W09 auction: settings changed, the auction cancelled and a new one running', async () => {
    const { before } = proposalOf(SPEC, 'auction') as ProposalRecord & { before: Record<string, any> };
    expect(auctionConfig(tribe)).toMatchObject({
      duration: before.duration,
      time_buffer: before.timeBuffer,
      reserve_price: before.reserve,
      min_bid_increment_percent: before.minBid,
      payment_token: before.paymentToken
    });
    expect(auctionPaused(tribe)).toBe(false);
    expect(Number(auctionNow(tribe).token_id)).toBeGreaterThan(Number(before.cancelled));
    expect(ownerOf(tribe, Number(before.cancelled))).toBe(tribe.treasury);
  });

  test('W09 market: allowance, pool, purchase, fee and asset', async () => {
    const { before } = proposalOf(SPEC, 'market') as ProposalRecord & { before: Record<string, any> };
    const config = marketConfig(tribe);
    expect(config).toMatchObject({ paused: false, payment_asset: NATIVE_SAC, default_secondary_fee_bps: before.fee });
    expect(ownerOf(tribe, before.listed)).toBe(tribe.treasury);
    expect(Number(read(tribe.marketplace!, 'next_pool_id'))).toBe(before.nextPool + 1);
    const pool = read<{ size: number; closed: boolean }>(
      tribe.marketplace!,
      'get_pool',
      '--pool_id',
      String(before.nextPool)
    );
    expect(pool).toMatchObject({ size: 2, closed: false });
    saveRunState(SPEC, (state) => {
      state.notes.pool = before.nextPool;
    });
  });

  test('W09 slug: the tribe answers to its new link', async ({ page }) => {
    const { before } = proposalOf(SPEC, 'slug') as ProposalRecord & { before: { from: string; to: string } };
    const manager = read<string>(tribe.token, 'manager');
    expect(read<string>(manager, 'get_dao_by_slug', '--slug', before.to)).toBe(tribe.token);
    await page.goto(`/dao/${before.to}`);
    await waitForVisible(page.getByRole('link', { name: 'Proposals' }).first(), 'tribe page at its new link');
    await expect(page).toHaveURL(new RegExp(`/dao/${before.to}`));
  });

  test('W09 profile: description and renderer changed', async ({ page }) => {
    const { before } = proposalOf(SPEC, 'profile') as ProposalRecord & {
      before: { description: string; renderer: string };
    };
    expect(rendererBase(tribe)).toBe(before.renderer);
    await page.goto(tribe.path());
    await waitForVisible(page.getByText(before.description).first(), 'the new description on the tribe page', {
      governingS: 180
    });
  });

  test('W09 modules: the claims module is registered', async () => {
    proposalOf(SPEC, 'modules');
    const claims = tokenModules(tribe).find((module) => module.kind === 'claims');
    expect(claims).toBeTruthy();
    saveRunState(SPEC, (state) => {
      state.notes.claims = claims!.address;
    });
  });

  test('W09 round 2: close the pool, switches off, remove the claims module, in one proposal', async ({
    page,
    wallet
  }) => {
    test.setTimeout(45 * 60_000);
    const { notes } = runState(SPEC);
    test.skip(notes.pool === undefined || !notes.claims, 'round 1 did not open a pool and add a module');
    if (!runState(SPEC).proposals.cleanup) {
      await startDraft(page, wallet);
      await pickAction(page, /^Close a pool/, (form) => fillText(form, 'Pool', String(notes.pool)));
      await pickAction(page, /^Lock memberships Now: On$/, (form) => setSwitch(form, /^Lock memberships/, false));
      await pickAction(page, /^Members-only delegation Now: On$/, (form) =>
        setSwitch(form, /^Members-only delegation/, false)
      );
      await pickAction(
        page,
        /^Change a transfer agent/,
        async (form) => {
          await fillText(form, 'Module', tribe.auction!);
          await setSwitch(form, /^Can move memberships/, false);
        },
        { advanced: true }
      );
      await page.goto(tribe.path('admin/owner'));
      await page
        .getByRole('button', { name: /^Claims? .*options$|options$/ })
        .filter({ hasNotText: /Auction|Market/ })
        .last()
        .click();
      await page.getByRole('menuitem', { name: /^Remove from tribe/ }).click();
      const remove = page.getByRole('dialog', { name: /^Remove the/ });
      const add = remove.getByRole('button', { name: /^Add \d+ actions? to your proposal$/ });
      await waitForUi('removal checked', (timeout) => expect(add).toBeEnabled({ timeout }), { governingS: 30 });
      await add.click();
      await confirmAdd(page);
      await propose(page, wallet, 'cleanup', 'Walkthrough W09: round 2, what only exists once round 1 ran.', notes);
    }
    await driveToExecuted(page, wallet, PROPOSER, tribe, SPEC, ROUND_2, (line) => console.info(`W09 ${line}`));
    const pool = read<{ closed: boolean }>(tribe.marketplace!, 'get_pool', '--pool_id', String(notes.pool));
    expect(pool.closed).toBe(true);
    expect(tokenModules(tribe).map((module) => module.kind)).not.toContain('claims');
    expect(tokenSettings(tribe)).toEqual({
      dao_recovery: false,
      members_only_delegation: false,
      transfers_locked: false
    });
    expect(transferAgents(tribe)).toEqual([]);
  });
});
