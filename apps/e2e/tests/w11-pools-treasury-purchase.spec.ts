import type { Locator, Page } from '@playwright/test';

import { signedTransactions, signInAs } from '../src/connect.ts';
import { expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { waitForIndexed, waitForUi, waitForVisible } from '../src/waits.ts';
import {
  listAsSeller,
  listingOf,
  mintAllowance,
  nativeStroops,
  ownerOf,
  POOLS_TRIBE,
  resetPoolsTribe,
  sacBalance,
  sellerToken,
  xlmStroops
} from '../src/w11/fixtures.ts';
import {
  confirmAddition,
  execute,
  proposalIndexed,
  queue,
  submitDraft,
  voteFor,
  waitForExecutable,
  waitForSucceeded,
  waitForVoting
} from '../src/w11/governance.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';

/**
 * W11 · Quick-buy pools and Treasury purchases (§3.4).
 *
 * @chain, in order on "E2E Pools" (src/w11/fixtures.ts):
 *   1. From Market settings the founder proposes a pool: the market's mint allowance and the pool,
 *      one item of two actions.
 *   2. e2e-member-a has a token listed; from Market settings the founder proposes that the Treasury
 *      buys it (authorise the exact payment transfers, then buy).
 *   3. The founder votes for both, queues both and executes both. The two timelines overlap, so the
 *      walk waits for one voting delay, period and queue delay, not two.
 *   4. The Treasury holds the token and the seller was paid the price less the resale fee.
 *   5. e2e-member-b, who holds no token here, stocks the pool (anyone may).
 *   6. e2e-member-a buys a token from the pool; the price goes to the treasury.
 *   7. The pool sells one token per period, so e2e-member-b's buy is refused with the reason.
 *
 * @matrix: Market settings and the market page at every viewport and theme, the pool form filled
 * and added to a draft (nothing signed), and the composer showing that draft.
 */

const tribe = POOLS_TRIBE;
const FOUNDER = 'e2e-founder';
const SELLER = 'e2e-member-a';
const OUTSIDER = 'e2e-member-b';
const POOL_PRICE = '1';
const POOL_SIZE = 3;
const LISTING_PRICE = '2';
const RUN = process.env.E2E_RUN_ID ?? String(Date.now());
const settingsPath = `/dao/${tribe.slug}/admin/marketplace`;
const marketPath = `/dao/${tribe.slug}/marketplace`;
const api = `/api/dao/${tribe.daoId}`;

type Listing = {
  kind: 'pool' | 'secondary';
  id: string;
  tokenId: string | null;
  status: string;
  price: string;
  seller: string | null;
  buyer: string | null;
  createdAt: string | null;
  pool?: {
    size: number;
    stocked: number;
    sold: number;
    inStock: number;
    maxPerBuyer: number;
    maxSoldPerPeriod: number;
  };
};
type MarketBody = {
  listings: Listing[];
  sales: {
    kind: string;
    poolId: string | null;
    tokenId: string;
    price: string;
    fee: string | null;
    buyer: string;
    seller: string | null;
  }[];
};

/* ---------- Page parts ---------- */

const panel = (page: Page, heading: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true, level: 2 }) });

const poolCard = (page: Page, poolId: string) =>
  page
    .getByRole('region', { name: 'Listings' })
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: `New tokens · pool ${poolId}`, exact: true }) });

/** A closing time two hours out, in the browser's local time, as datetime-local wants it. */
async function closesInTwoHours(page: Page) {
  return page.evaluate(() => {
    const at = new Date(Date.now() + 2 * 3600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
  });
}

/** Fill "Propose a quick-buy pool" (1 XLM, 3 tokens, 1 per wallet, 1 sale every 24h, closes in 2h). */
async function fillPoolForm(page: Page) {
  const form = panel(page, 'Propose a quick-buy pool');
  await form.getByLabel('Price per token').fill(POOL_PRICE);
  await form.getByLabel('Tokens in the pool').fill(String(POOL_SIZE));
  await form.getByLabel('Maximum per wallet').fill('1');
  await form.getByLabel('Maximum sales per period').fill('1');
  await form.getByLabel('Period (hours)').fill('24');
  await form.getByLabel('Closes at (local time)').fill(await closesInTwoHours(page));
  await expect(form.getByText(/The largest vote share one wallet could buy is [\d.]+%: 1 token/)).toBeVisible();
  return form;
}

/** Check, then Sign and send, then Done in a TradeReview dialog; one signature. */
async function signTrade(dialog: Locator, wallet: E2ESigner, identity: string) {
  const before = signedTransactions(wallet, identity);
  await dialog.getByRole('button', { name: 'Check' }).click();
  const send = dialog.getByRole('button', { name: 'Sign and send' });
  await waitForUi('trade prepared', (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 30 });
  await send.click();
  await waitForUi(
    'trade confirmed',
    (timeout) => expect(dialog.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout }),
    {
      governingS: 60
    }
  );
  expect(signedTransactions(wallet, identity) - before).toBe(1);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
}

function marketIndexed(page: Page, query: string, label: string, predicate: (body: MarketBody) => boolean) {
  return waitForIndexed<MarketBody>(
    page.request,
    { label, path: `${api}/marketplace?${query}`, predicate },
    { governingS: 0 }
  );
}

async function openPoolDetails(page: Page, poolId: string) {
  await page.goto(`${marketPath}?kind=pool`);
  const card = poolCard(page, poolId);
  await waitForVisible(card, `pool ${poolId} on the market`);
  await card.getByRole('button', { name: 'Details' }).click();
  return card;
}

/* ---------- @chain ---------- */

test.describe.serial('W11 pools and Treasury purchases', { tag: '@chain' }, () => {
  let ids: Record<string, string> = {};
  let listedToken = 0;
  let poolProposal = '';
  let purchaseProposal = '';
  let poolId = '';
  let allowanceBefore = 0;
  let sellerBefore = 0n;

  test.beforeAll(async ({ identities }) => {
    requireVerifiedManager();
    test.setTimeout(10 * 60_000);
    ids = Object.fromEntries(Object.values(identities).map(({ name, address }) => [name, address]));
    const changed = resetPoolsTribe(ids);
    if (changed.length) console.info(`W11 fixture reset: ${changed.join('; ')}`);
    listedToken = sellerToken(ids);
    await listAsSeller(ids, listedToken, LISTING_PRICE);
    expect(listingOf(tribe, listedToken)).toMatchObject({
      seller: ids[SELLER],
      price: String(xlmStroops(LISTING_PRICE))
    });
    allowanceBefore = mintAllowance(tribe, tribe.marketplace!);
  });

  test.beforeEach(() => test.setTimeout(10 * 60_000));

  test('W11 proposes a quick-buy pool from Market settings: allowance and pool as one item', async ({
    page,
    wallet
  }) => {
    await page.goto(settingsPath);
    await signInAs(page, wallet, FOUNDER);
    await waitForVisible(page.getByText('The market is open'), 'market open');
    const form = await fillPoolForm(page);
    await form.getByRole('button', { name: 'Add the pool to proposal' }).click();
    await confirmAddition(page, /3 tokens at 1 XLM each, at most 1 per wallet and 1 sold every 24h/);
    poolProposal = await submitDraft(page, wallet, FOUNDER, { title: `W11 open a pool ${RUN}`, expectActions: 2 });
    const detail = await proposalIndexed(
      page.request,
      tribe.daoId,
      poolProposal,
      `pool proposal ${poolProposal} indexed`
    );
    expect(detail.label).toMatch(/^(Pending|Active)$/);
  });

  test('W11 proposes a Treasury purchase of a listed token from Market settings', async ({ page, wallet }) => {
    await marketIndexed(
      page,
      `kind=secondary&status=open&seller=${ids[SELLER]}`,
      `listing of #${listedToken} indexed`,
      (body) => body.listings.some((row) => row.tokenId === String(listedToken) && row.status === 'open')
    );
    await page.goto(settingsPath);
    await signInAs(page, wallet, FOUNDER);
    const purchase = panel(page, 'Propose a Treasury purchase');
    await purchase.getByLabel('Listed token ID').fill(String(listedToken));
    await purchase.getByRole('button', { name: 'Add the purchase to proposal' }).click();
    // Added at once (no high-risk check): the draft names the purchase as one item of two steps.
    await waitForVisible(page.getByText('Added to your proposal', { exact: true }), 'added toast');
    await expect(
      page
        .getByRole('region', { name: 'Your proposal draft' })
        .getByText(`Latest: Treasury buys listed token #${listedToken}: 2 steps`)
    ).toBeVisible();
    purchaseProposal = await submitDraft(page, wallet, FOUNDER, {
      title: `W11 Treasury buys #${listedToken} ${RUN}`,
      expectActions: 2
    });
    await proposalIndexed(page.request, tribe.daoId, purchaseProposal, `purchase proposal ${purchaseProposal} indexed`);
  });

  test('W11 the founder votes for, queues and executes both proposals', async ({ page, wallet }) => {
    test.setTimeout(45 * 60_000);
    expect(poolProposal && purchaseProposal, 'both proposals were made').toBeTruthy();
    const both = [poolProposal, purchaseProposal];
    await page.goto(`/dao/${tribe.slug}/proposals`);
    await signInAs(page, wallet, FOUNDER);

    for (const id of both) await waitForVoting(page.request, tribe.daoId, id);
    for (const id of both) await voteFor(page, wallet, FOUNDER, tribe.slug, id);
    for (const id of both) await waitForSucceeded(page.request, tribe.daoId, id);
    for (const id of both) await queue(page, wallet, FOUNDER, tribe.slug, id);
    for (const id of both) await waitForExecutable(page.request, tribe.daoId, id);

    await execute(page, wallet, FOUNDER, tribe.slug, poolProposal);
    sellerBefore = await nativeStroops(ids[SELLER]!);
    await execute(page, wallet, FOUNDER, tribe.slug, purchaseProposal);
    for (const id of both)
      await proposalIndexed(page.request, tribe.daoId, id, `proposal ${id} executed`, (b) => b.label === 'Executed');

    // The pool reserved the allowance the same proposal granted.
    expect(mintAllowance(tribe, tribe.marketplace!)).toBe(allowanceBefore + POOL_SIZE);
    const market = await marketIndexed(page, 'kind=pool&status=open', 'new pool indexed', (body) =>
      body.listings.some(
        (row) =>
          row.kind === 'pool' &&
          row.price === String(xlmStroops(POOL_PRICE)) &&
          row.pool?.stocked === 0 &&
          row.pool.size === POOL_SIZE
      )
    );
    const newest = market.listings
      .filter((row) => row.kind === 'pool' && row.pool?.stocked === 0 && row.pool.size === POOL_SIZE)
      .sort((a, b) => Number(b.id) - Number(a.id))[0]!;
    poolId = newest.id;
    expect(newest.pool).toMatchObject({ maxPerBuyer: 1, maxSoldPerPeriod: 1, sold: 0, inStock: 0 });
  });

  test('W11 the Treasury holds the token it bought and the seller is paid less the resale fee', async ({ page }) => {
    expect(sellerBefore, 'the purchase was executed').toBeGreaterThan(0n);
    const price = xlmStroops(LISTING_PRICE);
    const fee = (price * BigInt(tribe.feeBps)) / 10_000n;
    expect(ownerOf(tribe, listedToken)).toBe(tribe.treasury);
    expect(listingOf(tribe, listedToken)).toBeNull();
    expect((await nativeStroops(ids[SELLER]!)) - sellerBefore).toBe(price - fee);
    const sold = await marketIndexed(page, 'kind=secondary&status=all', `sale of #${listedToken} indexed`, (body) =>
      body.sales.some((sale) => sale.tokenId === String(listedToken) && sale.buyer === tribe.treasury)
    );
    expect(
      sold.sales.find((sale) => sale.tokenId === String(listedToken) && sale.buyer === tribe.treasury)
    ).toMatchObject({
      price: String(price),
      seller: ids[SELLER]
    });
    // The token page shows the Treasury as the holder.
    await page.goto(`/dao/${tribe.slug}/token/${listedToken}`);
    await waitForVisible(page.getByText(/Treasury/).first(), 'token page names the Treasury');
  });

  test('W11 anyone can stock the pool: a wallet with no token here', async ({ page, wallet }) => {
    expect(poolId, 'the pool opened').not.toBe('');
    await page.goto(marketPath);
    await signInAs(page, wallet, OUTSIDER);
    const card = await openPoolDetails(page, poolId);
    await expect(card.getByText('No tokens are ready to buy yet.', { exact: false })).toBeVisible();
    await card.getByRole('button', { name: 'Stock this pool' }).click();
    await signTrade(page.getByRole('dialog', { name: 'Stock this pool' }), wallet, OUTSIDER);
    await marketIndexed(page, 'kind=pool&status=open', `pool ${poolId} stocked`, (body) =>
      body.listings.some((row) => row.kind === 'pool' && row.id === poolId && row.pool?.inStock === POOL_SIZE)
    );
  });

  test('W11 a member buys a token from the pool; the price goes to the treasury', async ({ page, wallet }) => {
    expect(poolId, 'the pool opened').not.toBe('');
    const treasuryBefore = sacBalance(tribe.paymentAsset!, tribe.treasury);
    await page.goto(marketPath);
    await signInAs(page, wallet, SELLER);
    const card = await openPoolDetails(page, poolId);
    await expect(card.getByText(`${POOL_SIZE} available`)).toBeVisible();
    await card.getByRole('button', { name: `Buy for ${POOL_PRICE} XLM` }).click();
    await signTrade(page.getByRole('dialog', { name: 'Buy this token' }), wallet, SELLER);
    const body = await marketIndexed(page, 'kind=pool&status=all', `pool ${poolId} sale indexed`, (b) =>
      b.sales.some((sale) => sale.poolId === poolId && sale.buyer === ids[SELLER])
    );
    const sale = body.sales.find((s) => s.poolId === poolId && s.buyer === ids[SELLER])!;
    expect(sale.price).toBe(String(xlmStroops(POOL_PRICE)));
    expect(ownerOf(tribe, Number(sale.tokenId))).toBe(ids[SELLER]);
    expect(sacBalance(tribe.paymentAsset!, tribe.treasury) - treasuryBefore).toBe(xlmStroops(POOL_PRICE));
  });

  test('W11 the per-period sales limit refuses the next buy, with the reason', async ({ page, wallet }) => {
    expect(poolId, 'the pool opened').not.toBe('');
    await page.goto(marketPath);
    await signInAs(page, wallet, OUTSIDER);
    const card = await openPoolDetails(page, poolId);
    await expect(card.getByText('1 every 24h')).toBeVisible();
    await card.getByRole('button', { name: `Buy for ${POOL_PRICE} XLM` }).click();
    const dialog = page.getByRole('dialog', { name: 'Buy this token' });
    const before = signedTransactions(wallet, OUTSIDER);
    await dialog.getByRole('button', { name: 'Check' }).click();
    await waitForVisible(
      dialog.getByText(
        'This pool has sold as many tokens as it can for now. Try again when its next sales period starts.'
      ),
      'sales limit reason'
    );
    await expect(dialog.getByRole('button', { name: 'Sign and send' })).toHaveCount(0);
    expect(signedTransactions(wallet, OUTSIDER) - before).toBe(0);
  });
});

/* ---------- @matrix ---------- */

test.describe('W11 Market settings and pools', { tag: '@matrix' }, () => {
  test('Market settings: signed out, the proposal buttons say to connect', async ({ page }) => {
    await page.goto(settingsPath);
    await waitForVisible(page.getByRole('heading', { name: 'Market settings', level: 1 }), 'Market settings');
    await waitForVisible(page.getByText('The market is open'), 'market state');
    await expect(page.getByText('Prices in XLM · Resale fee 2.5%, paid by the seller')).toBeVisible();
    for (const name of ['Add the pool to proposal', 'Add closing to proposal', 'Add the purchase to proposal'])
      await expect(page.getByRole('button', { name })).toBeDisabled();
    await expect(page.getByText('Connect your wallet to add this to a proposal.')).toBeVisible();
    // The live payment asset reads as its code, not its contract id (BUG-W11-1).
    await expect(page.getByText('Now: XLM', { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('a pool goes into a draft with its mint allowance, and the composer shows both', async ({ page, wallet }) => {
    await page.goto(settingsPath);
    await signInAs(page, wallet, FOUNDER);
    const form = await fillPoolForm(page);
    await expectNoHorizontalScroll(page);
    await form.getByRole('button', { name: 'Add the pool to proposal' }).click();
    await confirmAddition(page, /Open a quick-buy pool/);
    const dock = page.getByRole('region', { name: 'Your proposal draft' });
    await waitForVisible(dock, 'draft dock');
    await expect(dock.getByText('Latest: Open a quick-buy pool')).toBeVisible();
    await dock.getByRole('button', { name: 'Review proposal' }).click();
    await waitForVisible(page.getByRole('heading', { name: 'In this proposal (2 actions)' }), 'composer with the pool');
    await expectNoHorizontalScroll(page);
    expect(wallet.calls.some((call) => call.method === 'signTransaction')).toBe(false);
  });

  test('the market page lists pools with their limits', async ({ page }) => {
    await page.goto(`${marketPath}?kind=pool&status=all`);
    const listings = page.getByRole('region', { name: 'Listings' });
    // Every W11 run leaves a pool behind, open, ended or closed.
    await waitForVisible(listings, 'pool listings');
    await expectNoHorizontalScroll(page);
    const card = listings.locator('article').filter({ hasText: 'Quick-buy pool' }).first();
    await card.getByRole('button', { name: 'Details' }).click();
    await expect(card.getByText(/^\d+ every \d+h$/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
