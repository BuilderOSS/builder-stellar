import type { Locator, Page } from '@playwright/test';

import { signedTransactions, signInAs } from '../src/connect.ts';
import { appliedTheme, expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { loadMarketFixture, nativeStroops, ownerOf, resetMarketFixture, xlmStroops } from '../src/market-fixture.ts';
import { waitForIndexed, waitForLedgerTime, waitForUi, waitForVisible } from '../src/waits.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';

/**
 * W10 · Marketplace (§3.4): a member lists a token with the guided List for sale (Allow, then
 * List), lists again while the permission is live (Allow skipped), changes a price (cancel, allow,
 * relist), another member comments and buys, the seller cancels, and a listing ends and its token
 * comes back with Return my token. Restock and pools need a proposal and belong to W11.
 *
 * Runs against the fixture tribe "E2E Market" (src/market-fixture.ts). The @chain cases run in
 * order and share its state; the fixture is put back before they start, so the walk can run again.
 */

const market = loadMarketFixture();
const SELLER = 'e2e-member-a';
const BUYER = 'e2e-member-b';
const VIEWER = 'e2e-founder';
const [FIRST, SECOND] = market.sellerTokens.map(String) as [string, string];
/** One run's prices, so a listing from this run can't be mistaken for an earlier one. */
const PRICE = '5';
const NEW_PRICE = '6';
const COMMENT = `W10 comment ${process.env.E2E_RUN_ID ?? Date.now()}`;

const marketPath = `/dao/${market.slug}/marketplace`;
const api = `/api/dao/${market.daoId}`;

type Listing = { tokenId: string | null; price: string; seller: string | null; status: string; eventId: string };
type MarketBody = {
  listings: Listing[];
  sales: { tokenId: string; price: string; fee: string | null; buyer: string; seller: string | null }[];
};
type TokenBody = { owner: string | null; indexedOwner: string | null; ownerSource: string };

/* ---------- Page parts ---------- */

const sellForm = (page: Page) => page.getByRole('region', { name: 'Sell a token you own' });
const yourListings = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Your listings', exact: true }) });
/** One row of Your listings ("Token #3 · 5 XLM"). */
const yourRow = (page: Page, tokenId: string) =>
  yourListings(page)
    .locator(':scope > div > div')
    .filter({ hasText: new RegExp(`Token #${tokenId} ·`) });
const publicCard = (page: Page, tokenId: string) =>
  page
    .getByRole('region', { name: 'Listings' })
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: `E2E Market #${tokenId}`, exact: true }) });

/* ---------- Indexer checks (the app's own API) ---------- */

function sellerListings(page: Page, seller: string, predicate: (listings: Listing[]) => boolean, label: string) {
  return waitForIndexed<MarketBody>(
    page.request,
    {
      label,
      path: `${api}/marketplace?kind=secondary&status=open&seller=${seller}`,
      predicate: (body) => predicate(body.listings.filter((row) => row.seller === seller))
    },
    { governingS: 0 }
  );
}

function tokenOwner(page: Page, tokenId: string, owner: string, label: string) {
  return waitForIndexed<TokenBody>(
    page.request,
    {
      label,
      path: `${api}/tokens/${tokenId}`,
      predicate: (body) => body.owner === owner && body.indexedOwner === owner && body.ownerSource === 'onchain'
    },
    { governingS: 0 }
  );
}

/* ---------- Signing ---------- */

/**
 * Drive a SellSequence or TradeReview dialog: Check, then Sign and send for each step in
 * `signs` (1-based step numbers of `total`), then Done. Asserts the wallet signed exactly that many.
 */
async function signSteps(
  dialog: Locator,
  wallet: E2ESigner,
  identity: string,
  { total, signs }: { total: number; signs: number[] }
) {
  const before = signedTransactions(wallet, identity);
  await dialog.getByRole('button', { name: 'Check' }).click();
  for (const [done, step] of signs.entries()) {
    if (total > 1)
      await waitForVisible(dialog.getByText(new RegExp(`^Step ${step} of ${total}:`)), `step ${step} shown`);
    const send = dialog.getByRole('button', { name: 'Sign and send' });
    await waitForUi(`step ${step} of ${total} prepared`, (timeout) => expect(send).toBeEnabled({ timeout }), {
      governingS: 30
    });
    await send.click();
    await waitForUi(
      `step ${step} signed`,
      (timeout) => expect.poll(() => signedTransactions(wallet, identity) - before, { timeout }).toBe(done + 1),
      { governingS: 30 }
    );
  }
  // Submission and confirmation of the last step: testnet closes a ledger about every 5s.
  await waitForUi(
    'all steps confirmed',
    (timeout) => expect(dialog.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout }),
    {
      governingS: 60
    }
  );
  expect(signedTransactions(wallet, identity) - before).toBe(signs.length);
}

async function openMarket(page: Page, query = '') {
  await page.goto(`${marketPath}${query}`);
  await waitForVisible(page.getByText('Open for trading'), 'market open');
}

/* ---------- @chain: the walk ---------- */

test.describe.serial('W10 marketplace', { tag: '@chain' }, () => {
  let ids: Record<string, string> = {};

  test.beforeAll(async ({ identities, playwright }) => {
    requireVerifiedManager();
    test.setTimeout(10 * 60_000);
    ids = Object.fromEntries(Object.values(identities).map(({ name, address }) => [name, address]));
    const changed = resetMarketFixture(market, ids);
    if (changed.length) console.info(`W10 fixture reset: ${changed.join('; ')}`);
    const request = await playwright.request.newContext();
    try {
      for (const tokenId of [FIRST, SECOND])
        await waitForIndexed<TokenBody>(
          request,
          {
            label: `fixture: #${tokenId} back with the seller`,
            path: `${api}/tokens/${tokenId}`,
            predicate: (body) => body.owner === ids[SELLER] && body.indexedOwner === ids[SELLER]
          },
          { governingS: 0 }
        );
    } finally {
      await request.dispose();
    }
  });

  test.beforeEach(() => test.setTimeout(10 * 60_000));

  test('W10 lists a token from the token page: Allow, then List', async ({ page, wallet }) => {
    await page.goto(`/dao/${market.slug}/token/${FIRST}`);
    await signInAs(page, wallet, SELLER);
    const yourToken = page.getByRole('region', { name: 'Your token' });
    await waitForVisible(yourToken, 'Your token controls for the holder');
    await yourToken.getByRole('link', { name: 'Sell' }).click();
    await expect(page).toHaveURL(new RegExp(`/marketplace\\?sell=${FIRST}$`));

    const form = sellForm(page);
    await waitForUi('Sell link preselects the token', (timeout) =>
      expect(form.locator('#sell-token')).toHaveValue(FIRST, { timeout })
    );
    await expectNoHorizontalScroll(page);
    await form.locator('#sell-price').fill(PRICE);
    await expect(form.getByText(`You receive 4.875 XLM if it sells`, { exact: false })).toBeVisible();
    await expect(form.getByText(/^Ends .+, your time\.$/)).toBeVisible();
    // Listing pauses this token's vote (a token-weighted tribe).
    await expect(form.getByText('Its vote pauses while it is listed')).toBeVisible();
    await form.getByRole('button', { name: 'List for sale' }).click();

    const dialog = page.getByRole('dialog', { name: 'List your token for sale' });
    await waitForVisible(dialog, 'guided List for sale');
    await expect(dialog.getByText('Allow the market to hold your token', { exact: true })).toBeVisible();
    await signSteps(dialog, wallet, SELLER, { total: 2, signs: [1, 2] });
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
    await expect(sellForm(page)).toBeHidden();

    // Shown at once, as updating, before the indexer has it.
    await waitForVisible(yourRow(page, FIRST).getByText('Updating', { exact: true }), 'new listing shown as updating');
    await expect(yourRow(page, FIRST)).toContainText(`Token #${FIRST} · ${PRICE} XLM`);

    await sellerListings(
      page,
      ids[SELLER]!,
      (rows) => rows.some((row) => row.tokenId === FIRST && row.price === String(xlmStroops(PRICE))),
      `listing of #${FIRST} indexed`
    );
    await waitForVisible(
      yourRow(page, FIRST).getByText('For sale', { exact: true }),
      'listing indexed in Your listings'
    );
    await expect(yourRow(page, FIRST).getByRole('button', { name: 'Change price' })).toBeVisible();
    await expect(yourRow(page, FIRST).getByRole('button', { name: 'Cancel listing' })).toBeVisible();
    await waitForVisible(publicCard(page, FIRST), 'listing in the public list');
    await expect(publicCard(page, FIRST).getByText('open', { exact: true })).toBeVisible();
    expect(ownerOf(market, Number(FIRST))).toBe(market.marketplace);
  });

  test('W10 lists again while the permission is live: Allow is skipped', async ({ page, wallet }) => {
    await openMarket(page, `?sell=${SECOND}`);
    await signInAs(page, wallet, SELLER);
    const form = sellForm(page);
    await waitForUi('token preselected', (timeout) =>
      expect(form.locator('#sell-token')).toHaveValue(SECOND, { timeout })
    );
    await form.locator('#sell-price').fill(PRICE);

    // Allow, then stop before List: the permission stays live.
    await form.getByRole('button', { name: 'List for sale' }).click();
    let dialog = page.getByRole('dialog', { name: 'List your token for sale' });
    const before = signedTransactions(wallet, SELLER);
    await dialog.getByRole('button', { name: 'Check' }).click();
    await waitForUi('Allow prepared', (timeout) =>
      expect(dialog.getByRole('button', { name: 'Sign and send' })).toBeEnabled({ timeout })
    );
    await dialog.getByRole('button', { name: 'Sign and send' }).click();
    await waitForVisible(dialog.getByText(/^Step 2 of 2:/), 'Allow confirmed, List next', { governingS: 60 });
    await waitForUi('List prepared', (timeout) =>
      expect(dialog.getByRole('button', { name: 'Sign and send' })).toBeEnabled({ timeout })
    );
    expect(signedTransactions(wallet, SELLER) - before).toBe(1);
    // Stopping says what stays in place (BUG-006): nothing is listed, and the permission lasts an hour.
    await expect(dialog.getByText('If you stop here, nothing is listed.', { exact: false })).toBeVisible();
    await dialog.getByRole('button', { name: 'Stop here' }).click();
    await expect(dialog).toBeHidden();

    // List for sale again: one signature.
    await form.getByRole('button', { name: 'List for sale' }).click();
    dialog = page.getByRole('dialog', { name: 'List your token for sale' });
    await signSteps(dialog, wallet, SELLER, { total: 2, signs: [2] });
    await expect(dialog.getByText('Allow the market to hold your token (already allowed)')).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();

    await waitForVisible(yourRow(page, SECOND).getByText('Updating', { exact: true }), 'second listing updating');
    await sellerListings(
      page,
      ids[SELLER]!,
      (rows) => rows.some((row) => row.tokenId === SECOND),
      `listing of #${SECOND} indexed`
    );
    await waitForVisible(yourRow(page, SECOND).getByText('For sale', { exact: true }), 'second listing indexed');
  });

  test('W10 changes a price: cancel, allow, relist', async ({ page, wallet }) => {
    await openMarket(page);
    await signInAs(page, wallet, SELLER);
    const row = yourRow(page, FIRST);
    await waitForVisible(row.getByRole('button', { name: 'Change price' }), 'Change price on the listing');
    await row.getByRole('button', { name: 'Change price' }).click();

    const change = page.getByRole('dialog', { name: `Change the price of token #${FIRST}` });
    await expect(change.getByText(`Now: ${PRICE} XLM.`)).toBeVisible();
    await expect(change.getByRole('radio', { name: '7 days' })).toBeChecked();
    await change.locator('#change-price').fill(NEW_PRICE);
    await change.getByRole('button', { name: 'Continue' }).click();

    const dialog = page.getByRole('dialog', { name: 'Change the price' });
    await waitForVisible(dialog, 'Change the price sequence');
    await signSteps(dialog, wallet, SELLER, { total: 3, signs: [1, 2, 3] });
    await dialog.getByRole('button', { name: 'Done' }).click();

    await sellerListings(
      page,
      ids[SELLER]!,
      (rows) => rows.some((row) => row.tokenId === FIRST && row.price === String(xlmStroops(NEW_PRICE))),
      `new price of #${FIRST} indexed`
    );
    await waitForVisible(
      yourRow(page, FIRST)
        .filter({ hasText: `${NEW_PRICE} XLM` })
        .getByText('For sale', { exact: true }),
      'new price in Your listings'
    );
    await expect(yourListings(page).getByText(new RegExp(`Token #${FIRST} · ${PRICE} XLM`))).toHaveCount(0);
  });

  test('W10 a member comments on a listing', async ({ page, wallet }) => {
    await openMarket(page);
    await signInAs(page, wallet, BUYER);
    const card = publicCard(page, SECOND);
    await waitForVisible(card, `listing of #${SECOND}`);
    await card.getByRole('button', { name: 'Details' }).click();
    await card.getByRole('textbox', { name: /^Add a comment/ }).fill(COMMENT);
    await card.getByRole('button', { name: 'Post comment' }).click();
    const dialog = page.getByRole('dialog', { name: 'Post your comment' });
    await expect(dialog.getByText(COMMENT)).toBeVisible();
    await signSteps(dialog, wallet, BUYER, { total: 1, signs: [1] });
    await dialog.getByRole('button', { name: 'Done' }).click();

    await waitForIndexed<{ items: { body: string; author: string }[] }>(
      page.request,
      {
        label: 'comment indexed',
        path: `${api}/marketplace/comments?kind=secondary&id=${SECOND}`,
        predicate: (body) => body.items.some((item) => item.body === COMMENT && item.author === ids[BUYER])
      },
      { governingS: 0 }
    );
    await waitForVisible(card.getByText(COMMENT, { exact: true }), 'comment shown on the listing', { governingS: 30 });
  });

  test('W10 a member buys a listing; the seller is paid less the resale fee', async ({ page, wallet }) => {
    await openMarket(page);
    await signInAs(page, wallet, BUYER);
    const card = publicCard(page, FIRST);
    await waitForVisible(card, `listing of #${FIRST}`);
    await card.getByRole('button', { name: 'Details' }).click();
    await expect(card.getByText('5.85 XLM', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: `Buy for ${NEW_PRICE} XLM` }).click();

    const dialog = page.getByRole('dialog', { name: 'Buy this token' });
    const sellerBefore = await nativeStroops(ids[SELLER]!);
    await signSteps(dialog, wallet, BUYER, { total: 1, signs: [1] });
    await dialog.getByRole('button', { name: 'Done' }).click();

    // The seller gets the price less 2.5%; the fee goes to the treasury.
    const price = xlmStroops(NEW_PRICE);
    const fee = (price * BigInt(market.feeBps)) / 10_000n;
    await waitForUi(
      'seller paid on chain',
      (timeout) =>
        expect.poll(async () => (await nativeStroops(ids[SELLER]!)) - sellerBefore, { timeout }).toBe(price - fee),
      { governingS: 30 }
    );

    await tokenOwner(page, FIRST, ids[BUYER]!, `#${FIRST} owned by the buyer`);
    const sale = await waitForIndexed<MarketBody>(
      page.request,
      {
        label: 'sale indexed',
        path: `${api}/marketplace?kind=secondary&status=all`,
        predicate: (body) => body.sales.some((row) => row.tokenId === FIRST && row.buyer === ids[BUYER])
      },
      { governingS: 0 }
    );
    expect(sale.sales.find((row) => row.tokenId === FIRST && row.buyer === ids[BUYER])).toMatchObject({
      price: String(price),
      fee: String(fee),
      seller: ids[SELLER]
    });
    await sellerListings(page, ids[SELLER]!, (rows) => !rows.some((row) => row.tokenId === FIRST), 'sold listing gone');
    await waitForVisible(page.getByRole('heading', { name: 'Recent sales' }), 'Recent sales');

    // The buyer's views: the token page and their member page.
    await page.goto(`/dao/${market.slug}/token/${FIRST}`);
    const heldBy = page.getByRole('region', { name: 'Held by' });
    await waitForVisible(heldBy.getByText('You', { exact: true }), 'token page: held by you');
    await expect(heldBy.getByText('Yours', { exact: true })).toBeVisible();
    await page.goto(`/dao/${market.slug}/members/${ids[BUYER]}`);
    await waitForVisible(page.locator(`a[href$="/token/${FIRST}"]`), 'member page lists the bought token');
  });

  test('W10 the seller cancels a listing and gets the token back', async ({ page, wallet }) => {
    await openMarket(page);
    await signInAs(page, wallet, SELLER);
    const row = yourRow(page, SECOND);
    await waitForVisible(row.getByRole('button', { name: 'Cancel listing' }), 'Cancel listing');
    // The sold listing is gone from Your listings.
    await expect(yourRow(page, FIRST)).toHaveCount(0);
    await row.getByRole('button', { name: 'Cancel listing' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel your listing' });
    await signSteps(dialog, wallet, SELLER, { total: 1, signs: [1] });
    await dialog.getByRole('button', { name: 'Done' }).click();
    // Hidden at once, before the indexer.
    await expect(yourRow(page, SECOND)).toHaveCount(0);

    expect(ownerOf(market, Number(SECOND))).toBe(ids[SELLER]);
    await tokenOwner(page, SECOND, ids[SELLER]!, `#${SECOND} back with the seller`);
    await sellerListings(page, ids[SELLER]!, (rows) => !rows.some((row) => row.tokenId === SECOND), 'cancel indexed');
  });

  test('W10 a listing ends; the seller returns the token', async ({ page, wallet }) => {
    await openMarket(page, `?sell=${SECOND}`);
    await signInAs(page, wallet, SELLER);
    const form = sellForm(page);
    await waitForUi('token preselected', (timeout) =>
      expect(form.locator('#sell-token')).toHaveValue(SECOND, { timeout })
    );
    await form.locator('#sell-price').fill(PRICE);

    // The contract only needs an end after the listing lands; the field works in whole minutes.
    // Two to three minutes ahead leaves time for Allow and List.
    await form.getByRole('radio', { name: 'Custom' }).click({ force: true });
    const end = await page.evaluate(() => {
      const date = new Date(Date.now() + 120_000);
      date.setSeconds(0, 0);
      date.setMinutes(date.getMinutes() + 1);
      const pad = (value: number) => String(value).padStart(2, '0');
      return {
        value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
        unix: date.getTime() / 1000
      };
    });
    await form.locator('#sell-expiry').fill(end.value);
    await expect(form.getByText(/^Ends .+, your time\.$/)).toBeVisible();
    await form.getByRole('button', { name: 'List for sale' }).click();
    const dialog = page.getByRole('dialog', { name: 'List your token for sale' });
    await signSteps(dialog, wallet, SELLER, { total: 2, signs: [1, 2] });
    await dialog.getByRole('button', { name: 'Done' }).click();

    const indexed = await sellerListings(
      page,
      ids[SELLER]!,
      (rows) => rows.some((row) => row.tokenId === SECOND),
      `short listing of #${SECOND} indexed`
    );
    expect(indexed.listings.find((row) => row.tokenId === SECOND && row.seller === ids[SELLER])).toBeTruthy();

    await waitForLedgerTime(end.unix, { governingS: end.unix - Date.now() / 1000, label: 'listing end' });
    // Your listings re-reads every 15s; the ended state needs no reload.
    const row = yourRow(page, SECOND);
    await waitForVisible(row.getByText('Ended', { exact: true }), 'ended state for the seller', { governingS: 30 });
    await expect(yourListings(page).getByText(`Your listing of token #${SECOND} has ended`)).toBeVisible();
    await row.getByRole('button', { name: 'Return my token' }).click();
    const back = page.getByRole('dialog', { name: 'Return the token from an ended listing' });
    await signSteps(back, wallet, SELLER, { total: 1, signs: [1] });
    await back.getByRole('button', { name: 'Done' }).click();
    await expect(yourRow(page, SECOND)).toHaveCount(0);

    expect(ownerOf(market, Number(SECOND))).toBe(ids[SELLER]);
    await tokenOwner(page, SECOND, ids[SELLER]!, `#${SECOND} returned to the seller`);
  });
});

/* ---------- @matrix: no signing beyond sign-in ---------- */

test.describe('W10 market pages', { tag: '@matrix' }, () => {
  test('W10 the Market shows Sell, its defaults and the signed-out Connect', async ({ page, theme }) => {
    await openMarket(page);
    expect(await appliedTheme(page)).toBe(theme);
    await expect(page.getByText('Prices in XLM · resale fee 2.5%')).toBeVisible();
    await expectNoHorizontalScroll(page);

    const sell = page.getByRole('button', { name: 'Sell a token you own' });
    await sell.click();
    const form = sellForm(page);
    await waitForVisible(form, 'sell form');
    await expect(form.getByText('Connect your wallet to see your tokens and sell one.')).toBeVisible();
    await expect(form.getByRole('button', { name: 'Connect wallet' })).toBeVisible();
    await expect(form.locator('#sell-token')).toBeDisabled();
    for (const label of ['1 day', '7 days', '30 days', 'Custom'])
      await expect(form.getByRole('radio', { name: label })).toBeAttached();
    await expect(form.getByRole('radio', { name: '7 days' })).toBeChecked();
    await expect(form.getByText(/^Ends .+, your time\.$/)).toBeVisible();
    await expect(form.getByText('Resale fee:')).toContainText('2.5%');
    await expect(form.getByRole('button', { name: 'List for sale' })).toBeDisabled();
    await expectNoHorizontalScroll(page);

    // Market settings (signed out, read only): named like the nav, and only the pause action that
    // applies to an open market (BUG-008).
    await page.getByRole('link', { name: 'Market settings' }).click();
    await waitForVisible(page.getByRole('heading', { name: 'Market settings', level: 1 }), 'Market settings page');
    await waitForVisible(page.getByRole('heading', { name: 'Pause the market', level: 3 }), 'Pause the market');
    await expect(page.getByRole('heading', { name: 'Reopen the market' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    // ?sell=1 opens the form directly.
    await openMarket(page, '?sell=1');
    await waitForVisible(sellForm(page), 'sell form from ?sell=1');
    await expectNoHorizontalScroll(page);
  });

  test('W10 the token page offers Sell to its holder and opens the form', async ({ page, wallet }) => {
    const tokenId = '0';
    await page.goto(`/dao/${market.slug}/token/${tokenId}`);
    // Signed out: no holder controls, so no Sell.
    await waitForVisible(page.getByRole('region', { name: 'Held by' }), 'Held by');
    await expect(page.getByRole('link', { name: 'Sell', exact: true })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await signInAs(page, wallet, VIEWER);
    const yourToken = page.getByRole('region', { name: 'Your token' });
    await waitForVisible(yourToken, 'Your token');
    const link = yourToken.getByRole('link', { name: 'Sell', exact: true });
    await expect(link).toHaveAttribute('href', `${marketPath}?sell=${tokenId}`);
    await expectNoHorizontalScroll(page);
    await link.click();

    const form = sellForm(page);
    await waitForUi('token preselected', (timeout) =>
      expect(form.locator('#sell-token')).toHaveValue(tokenId, { timeout })
    );
    await expect(form.getByRole('radio', { name: '7 days' })).toBeChecked();
    await expect(form.getByRole('button', { name: 'List for sale' })).toBeEnabled();
    await form.getByRole('radio', { name: 'Custom' }).click({ force: true });
    await expect(form.locator('#sell-expiry')).toBeVisible();
    await expect(form.getByText('Choose a date and time in the future, in your time.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(wallet.calls.some((call) => call.method === 'signTransaction')).toBe(false);
  });
});
