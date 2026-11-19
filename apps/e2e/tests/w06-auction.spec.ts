import type { APIRequestContext, Page } from '@playwright/test';

import { signedTransactions, signInAs } from '../src/connect.ts';
import { appliedTheme, expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { loadTribe, nativeStroops, sacBalance, XLM } from '../src/tribe-fixture.ts';
import { latestLedger, waitForIndexed, waitForLedgerTime, waitForUi, waitForVisible } from '../src/waits.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';

/**
 * W06 · Auction (§3.4): member A bids the reserve, member B outbids A and A's bid comes straight
 * back, the auction ends, anyone settles it, B holds the token, the Treasury holds the bid, and the
 * next auction starts on its own.
 *
 * Runs on the fixture tribe "E2E Auction" (slug e2e-w06, configs/e2e-walk-e2e-w06-dao.json): a
 * 300s auction with a 1 XLM reserve, a 10% minimum raise and a 60s anti-snipe buffer. The @chain
 * cases run in order and share the one auction; the first case settles a stale auction left by an
 * earlier run, so the walk can run again at any time.
 */

const tribe = loadTribe('e2e-w06', 'deploys/dev-testnet-dao-6.json');
const auctionPath = `/dao/${tribe.slug}/auctions`;
const api = `/api/dao/${tribe.daoId}`;
const BIDDER_A = 'e2e-member-a';
const BIDDER_B = 'e2e-member-b';
const SETTLER = 'e2e-founder';
const RESERVE = 10_000_000n;
const OUTBID_COMMENT = `W06 outbid ${process.env.E2E_RUN_ID ?? Date.now()}`;
/** The auction's own duration governs every wait on it (§3.3). */
const DURATION_S = 300;

type Bid = { bidder: string; amount: string; comment?: string | null; event_id: string };
type CurrentBody = {
  status: string;
  auction: {
    token_id: string;
    start_time: string;
    end_time: string;
    highest_bid: string;
    highest_bidder: string | null;
    settled: boolean;
  } | null;
  config: { reserve_price: string; min_bid_increment_percent: number; payment_token: string; treasury: string };
  paused: boolean;
  bids: Bid[];
};
type TokenBody = { owner: string | null; indexedOwner: string | null; ownerSource: string };
type HistoryBody = { items: { tokenId: string; winner?: string | null; amount?: string | null }[] };

/* ---------- Reads ---------- */

async function current(request: APIRequestContext): Promise<CurrentBody> {
  const response = await request.get(`${api}/auctions`);
  expect(response.ok(), `GET ${api}/auctions`).toBe(true);
  return (await response.json()) as CurrentBody;
}

function auctionIndexed(
  request: APIRequestContext,
  label: string,
  predicate: (body: CurrentBody) => boolean,
  governingS = 0
) {
  return waitForIndexed<CurrentBody>(request, { label, path: `${api}/auctions`, predicate }, { governingS });
}

/* ---------- Page parts ---------- */

const tokenHeading = (page: Page, tokenId: string | number) =>
  page.getByRole('heading', { name: `${tribe.tokenName} #${tokenId}`, exact: true });
const bidsSection = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Bids', exact: true }) });
/** The bid field; its label also carries the "About your bid" help. */
const bidInput = (page: Page) => page.getByRole('textbox', { name: /^Your bid/ });
const settleButton = (page: Page) => page.getByRole('button', { name: 'Settle and start the next auction' });
const toast = (page: Page, title: string) => page.getByText(title, { exact: true });

async function openAuction(page: Page) {
  await page.goto(auctionPath);
  await waitForVisible(page.getByRole('heading', { name: 'Auction', exact: true }), 'auction page');
}

/** Press a button that signs one transaction, then wait for the toast that says it landed. */
async function signOne(page: Page, wallet: E2ESigner, identity: string, press: () => Promise<void>, done: string) {
  const before = signedTransactions(wallet, identity);
  await press();
  await waitForUi(
    `${done}: signed`,
    (timeout) => expect.poll(() => signedTransactions(wallet, identity) - before, { timeout }).toBe(1),
    { governingS: 30 }
  );
  await waitForVisible(toast(page, done), `${done} toast`, { governingS: 60 });
  expect(signedTransactions(wallet, identity) - before).toBe(1);
}

/** Bid the minimum the page offers (the reserve, or the top bid plus 10%), with an optional comment. */
async function bidMinimum(page: Page, wallet: E2ESigner, identity: string, comment = '') {
  await page.getByRole('button', { name: 'Bid the minimum' }).click();
  if (comment) await page.getByRole('textbox', { name: /^Comment \(optional\)/ }).fill(comment);
  const place = page.getByRole('button', { name: /^Place .+ XLM bid$/ });
  await expect(place).toBeEnabled();
  await signOne(page, wallet, identity, () => place.click(), 'Bid confirmed');
}

/** Settle from the page as `identity` once the chain's clock has passed the end. */
async function settleFromPage(page: Page, wallet: E2ESigner, identity: string, endTime: number) {
  await waitForLedgerTime(endTime + 1, { governingS: DURATION_S, label: 'auction end on ledger time' });
  await openAuction(page);
  await signInAs(page, wallet, identity);
  await waitForVisible(settleButton(page), 'Settle and start the next auction', { governingS: 30 });
  await signOne(page, wallet, identity, () => settleButton(page).click(), 'Auction settled');
}

/* ---------- @chain: the walk ---------- */

test.describe.serial('W06 auction', { tag: '@chain' }, () => {
  let ids: Record<string, string> = {};
  let tokenId = '';
  let firstBid = 0n;
  let secondBid = 0n;
  let aAfterBid = 0n;

  test.beforeAll(async ({ identities }) => {
    requireVerifiedManager();
    ids = Object.fromEntries(Object.values(identities).map(({ name, address }) => [name, address]));
  });

  test('a fresh auction is running, with no bids yet', async ({ page, wallet }) => {
    test.setTimeout(15 * 60_000);
    let body = await current(page.request);
    expect(body.paused, 'the fixture auction is paused').toBe(false);
    expect(body.auction, 'the fixture auction has launched').not.toBeNull();
    const head = await latestLedger();
    const fresh =
      body.auction && !body.auction.settled && !body.auction.highest_bidder && Number(body.auction.end_time) > head.closeTime + 150;
    if (!fresh) {
      // An earlier run's auction (ended, or with bids, or too close to its end): settle it first.
      const stale = body.auction!;
      await settleFromPage(page, wallet, SETTLER, Number(stale.end_time));
      body = await auctionIndexed(
        page.request,
        `next auction after #${stale.token_id}`,
        (next) => Number(next.auction?.token_id) === Number(stale.token_id) + 1 && !next.auction?.highest_bidder
      );
    }
    tokenId = body.auction!.token_id;
    await openAuction(page);
    await waitForVisible(tokenHeading(page, tokenId), `token #${tokenId} on the block`);
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    await expect(page.getByText('Starting at')).toBeVisible();
    await expect(bidsSection(page).getByText('No bids yet. New bids can take a moment to show up.')).toBeVisible();
  });

  test('member A bids the reserve price', async ({ page, wallet }) => {
    test.setTimeout(5 * 60_000);
    await openAuction(page);
    await signInAs(page, wallet, BIDDER_A);
    await waitForVisible(tokenHeading(page, tokenId), `token #${tokenId}`);
    const before = await nativeStroops(ids[BIDDER_A]);

    // Under the minimum, the page says so and the wallet never opens.
    await bidInput(page).fill('0.5');
    await page.getByRole('button', { name: 'Place bid', exact: true }).click();
    await expect(page.getByText('Enter at least 1 XLM, up to 7 decimals.')).toBeVisible();
    expect(signedTransactions(wallet, BIDDER_A)).toBe(0);
    await bidInput(page).fill('');

    await bidMinimum(page, wallet, BIDDER_A);
    const body = await auctionIndexed(
      page.request,
      'A leads the auction',
      (next) => next.auction?.token_id === tokenId && next.auction.highest_bidder === ids[BIDDER_A]
    );
    firstBid = BigInt(body.auction!.highest_bid);
    expect(firstBid).toBe(RESERVE);
    await waitForVisible(page.getByText("You're winning", { exact: true }), 'A is winning', { governingS: 30 });

    // The full bid is held by the auction: A's balance drops by the bid plus a network fee.
    await expect
      .poll(async () => before - (await nativeStroops(ids[BIDDER_A])), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(firstBid);
    aAfterBid = await nativeStroops(ids[BIDDER_A]);
    expect(before - aAfterBid).toBeLessThan(firstBid + XLM / 2n);
  });

  test("member B outbids A, and A's bid comes straight back", async ({ page, wallet }) => {
    test.setTimeout(5 * 60_000);
    await openAuction(page);
    await signInAs(page, wallet, BIDDER_B);
    await waitForVisible(page.getByText('Top bid', { exact: true }), 'top bid shown');
    // The minimum raise is 10%: 1 XLM becomes 1.1 XLM.
    await page.getByRole('button', { name: 'Bid the minimum' }).click();
    await expect(bidInput(page)).toHaveValue('1.1');
    await bidInput(page).fill('');

    await bidMinimum(page, wallet, BIDDER_B, OUTBID_COMMENT);
    const body = await auctionIndexed(
      page.request,
      'B leads the auction',
      (next) =>
        next.auction?.highest_bidder === ids[BIDDER_B] &&
        next.bids.some((bid) => bid.bidder === ids[BIDDER_B] && bid.comment === OUTBID_COMMENT)
    );
    secondBid = BigInt(body.auction!.highest_bid);
    expect(secondBid).toBe(firstBid + firstBid / 10n);

    // The outbid refund is pushed in B's transaction: A gets the whole bid back without signing.
    await expect.poll(async () => (await nativeStroops(ids[BIDDER_A])) - aAfterBid, { timeout: 30_000 }).toBe(firstBid);

    // Both bids are listed, newest first, with B's comment.
    await waitForVisible(bidsSection(page).getByText(OUTBID_COMMENT), "B's comment in the bids list", { governingS: 30 });
    await expect(page.getByText("You're winning", { exact: true })).toBeVisible();
    await expect(bidsSection(page).getByRole('link')).toHaveCount(2);
  });

  test('A sees the outbid, with nothing left to claim', async ({ page, wallet }) => {
    test.setTimeout(3 * 60_000);
    await openAuction(page);
    await signInAs(page, wallet, BIDDER_A);
    await waitForVisible(page.getByText('Highest bidder', { exact: true }), 'highest bidder row');
    await expect(page.getByText("You're winning", { exact: true })).toHaveCount(0);
    // A pushed refund leaves no pending refund, so no Claim refund prompt.
    await expect(page.getByText('Refund waiting')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Claim refund' })).toHaveCount(0);
    expect(signedTransactions(wallet, BIDDER_A)).toBe(0);
  });

  test('after the end anyone settles: B gets the token, the Treasury the bid, and the next auction starts', async ({
    page,
    wallet
  }) => {
    test.setTimeout(15 * 60_000);
    const body = await current(page.request);
    expect(body.auction?.token_id).toBe(tokenId);
    const treasuryBefore = sacBalance(body.config.payment_token, body.config.treasury);

    // The founder settles; settling is open to anyone once the chain's clock passes the end.
    await settleFromPage(page, wallet, SETTLER, Number(body.auction!.end_time));

    const next = await auctionIndexed(
      page.request,
      `auction #${Number(tokenId) + 1} started`,
      (now) => Number(now.auction?.token_id) === Number(tokenId) + 1 && !now.auction?.settled
    );
    expect(next.auction!.highest_bidder).toBeNull();
    await waitForIndexed<TokenBody>(
      page.request,
      {
        label: `#${tokenId} owned by B`,
        path: `${api}/tokens/${tokenId}`,
        predicate: (token) => token.owner === ids[BIDDER_B] && token.indexedOwner === ids[BIDDER_B]
      },
      { governingS: 0 }
    );
    expect(sacBalance(body.config.payment_token, body.config.treasury) - treasuryBefore).toBe(secondBid);

    // The page moves on to the next token, open at the reserve again.
    await waitForVisible(tokenHeading(page, next.auction!.token_id), 'the next token on the block', {
      governingS: 30
    });
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    await expect(page.getByText('Starting at')).toBeVisible();

    // Past auctions lists the settled token and its winner, without a reload (BUG-W06-4).
    const history = await waitForIndexed<HistoryBody>(
      page.request,
      {
        label: `#${tokenId} in past auctions`,
        path: `${api}/auctions/history?limit=12&offset=0&network=testnet`,
        predicate: (page) => page.items.some((item) => item.tokenId === tokenId)
      },
      { governingS: 0 }
    );
    expect(history.items.find((item) => item.tokenId === tokenId)).toBeTruthy();
    const past = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Past auctions' }) });
    await waitForVisible(past.getByText(`#${tokenId}`, { exact: true }), `#${tokenId} under Past auctions`, {
      governingS: 30
    });

    // B's member page counts the token.
    await page.goto(`/dao/${tribe.slug}/members/${ids[BIDDER_B]}`);
    await waitForVisible(page.getByText(`#${tokenId}`).first(), `#${tokenId} on B's member page`, { governingS: 30 });
  });
});

/* ---------- @matrix: the auction page at every viewport and theme ---------- */

test.describe('W06 auction page', { tag: '@matrix' }, () => {
  test('signed out: the token, its figures and how to bid', async ({ page, theme }) => {
    await openAuction(page);
    expect(await appliedTheme(page)).toBe(theme);
    await waitForVisible(page.getByRole('heading', { name: new RegExp(`^${tribe.tokenName} #\\d+$`) }), 'token heading');
    await expect(page.getByText(/^(Live|Auction ended|Settled)$/).first()).toBeVisible();
    await expect(page.getByText(/^(Starting at|Top bid|Winning bid)$/)).toBeVisible();
    await expect(page.getByRole('img', { name: new RegExp(`^${tribe.tokenName} #\\d+$`) })).toBeVisible();
    await expect(page.getByText('Connect a wallet on Testnet to bid, settle or claim a refund.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bids', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Past auctions' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('signed in: a bid under the minimum is refused before the wallet opens', async ({ page, wallet }) => {
    await openAuction(page);
    await signInAs(page, wallet, 'e2e-founder');
    await waitForVisible(page.getByRole('heading', { name: new RegExp(`^${tribe.tokenName} #\\d+$`) }), 'token heading');
    const bid = bidInput(page);
    if (await page.getByText('Live', { exact: true }).isVisible()) {
      await bid.fill('0.0000001');
      await page.getByRole('button', { name: 'Place bid', exact: true }).click();
      await expect(page.getByText(/^Enter at least [\d.]+ XLM, up to 7 decimals\.$/)).toBeVisible();
    } else {
      // Between the end and settlement the form gives way to settling.
      await expect(bid).toHaveCount(0);
      await expect(settleButton(page)).toBeVisible();
    }
    expect(wallet.calls.some((call) => call.method === 'signTransaction')).toBe(false);
    await expectNoHorizontalScroll(page);
  });
});

