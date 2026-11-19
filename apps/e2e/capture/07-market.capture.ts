import type { Locator, Page } from '@playwright/test';

import { signInAs, signedTransactions } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import {
  holdConfirmation,
  lamplight,
  saveShowcaseState,
  SHOWCASE,
  showcaseIdentities,
  showcaseState
} from '../src/showcase.ts';
import { switchAccount } from '../src/tribe.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';
import { confirmAdd, submitProposal, writeAndReview } from '../src/w09/proposals.ts';
import { tokensOf } from '../src/w09/fixture.ts';
import { waitForLedgerTime, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: marketplace/sell, marketplace/buy, marketplace/cancel, marketplace/pools (the proposal),
 * marketplace/treasury-purchases (the proposal) and manage/marketplace/04. The workshop lead lists
 * lanterns; the new member buys one, their first; one listing ends and comes back; one is
 * cancelled; and the workshop lead proposes a quick-buy pool and a Treasury purchase of the
 * remaining listing (docs/qa/SHOWCASE_TRIBE.md). The founder votes in 90-drive.
 */
const SELLER = 'e2e-member-a';
const BUYER = 'e2e-member-b';
const market = `/dao/${SHOWCASE.slug}/marketplace`;
const sellForm = (page: Page) => page.getByRole('region', { name: 'Sell a token you own' });
const yourListings = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Your listings', exact: true }) });
/** One row of Your listings ("Token #3 · 50 XLM"), as W10 finds it. */
const yourRow = (page: Page, tokenId: number) =>
  yourListings(page)
    .locator(':scope > div > div')
    .filter({ hasText: new RegExp(`Token #${tokenId} ·`) });
const card = (page: Page, tokenId: number) =>
  page
    .getByRole('region', { name: 'Listings' })
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: `${SHOWCASE.name} #${tokenId}`, exact: true }) });
const panel = (page: Page, heading: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true, level: 2 }) });
const state = () => showcaseState() as ReturnType<typeof showcaseState> & { market?: Record<string, unknown> };
const mark = (key: string, value: unknown = true) =>
  saveShowcaseState((s) => {
    s.market = { ...((s.market as Record<string, unknown>) ?? {}), [key]: value };
  });

async function openMarket(page: Page, query = '') {
  await page.goto(`${market}${query}`);
  await waitForVisible(page.getByText('Open for trading'), 'market open');
}

/** Check, then Sign and send for each step, until Done is enabled. */
async function signSteps(
  dialog: Locator,
  wallet: E2ESigner,
  identity: string,
  steps: number,
  beforeDone?: () => Promise<void>
) {
  const before = signedTransactions(wallet, identity);
  await dialog.getByRole('button', { name: 'Check' }).click();
  for (let step = 1; step <= steps; step++) {
    const send = dialog.getByRole('button', { name: 'Sign and send' });
    await waitForUi(`step ${step} prepared`, (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 30 });
    await send.click();
    await waitForUi(
      `step ${step} signed`,
      (timeout) => expect.poll(() => signedTransactions(wallet, identity) - before, { timeout }).toBe(step),
      { governingS: 30 }
    );
  }
  await waitForUi(
    'confirmed',
    (timeout) => expect(dialog.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout }),
    { governingS: 90 }
  );
  if (beforeDone) await beforeDone();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
}

async function listToken(
  page: Page,
  wallet: E2ESigner,
  tokenId: number,
  price: string,
  shots = false,
  endsAt?: string
) {
  await openMarket(page, `?sell=${tokenId}`);
  const form = sellForm(page);
  await waitForUi('token preselected', (timeout) =>
    expect(form.locator('#sell-token')).toHaveValue(String(tokenId), { timeout })
  );
  if (shots) await snap(page, 'marketplace/sell/01', { focus: form });
  await form.locator('#sell-price').fill(price);
  if (shots) {
    await snap(page, 'marketplace/sell/02', {
      markers: [{ label: 'the price field', locator: form.locator('#sell-price') }],
      focus: form
    });
    await snap(page, 'marketplace/sell/03', {
      markers: [{ label: 'the Listing ends choice', locator: form.getByRole('radio', { name: '7 days' }) }],
      focus: form.getByRole('radio', { name: '7 days' })
    });
  }
  if (endsAt) {
    await form.getByRole('radio', { name: 'Custom' }).click({ force: true });
    await form.locator('#sell-expiry').fill(endsAt);
  }
  await form.getByRole('button', { name: 'List for sale' }).click();
  const dialog = page.getByRole('dialog', { name: 'List your token for sale' });
  await waitForVisible(dialog, 'list dialog');
  if (shots) {
    await snap(page, 'marketplace/sell/05', {
      markers: [{ label: 'the Check button', locator: dialog.getByRole('button', { name: 'Check' }) }]
    });
    await dialog.getByRole('button', { name: 'Check' }).click();
    const send = dialog.getByRole('button', { name: 'Sign and send' });
    await waitForUi('allow prepared', (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 30 });
    await snap(page, 'marketplace/sell/06', { markers: [{ label: 'the Sign and send button', locator: send }] });
    const before = signedTransactions(wallet, SELLER);
    for (let step = 1; step <= 2; step++) {
      await waitForUi(`step ${step} prepared`, (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 60 });
      await send.click();
      await waitForUi(
        `step ${step} signed`,
        (timeout) => expect.poll(() => signedTransactions(wallet, SELLER) - before, { timeout }).toBe(step),
        { governingS: 30 }
      );
    }
    const done = dialog.getByRole('button', { name: 'Done' });
    await waitForUi('listed', (timeout) => expect(done).toBeEnabled({ timeout }), { governingS: 90 });
    await snap(page, 'marketplace/sell/07', { markers: [{ label: 'the Done button', locator: done }] });
    await done.click();
    // "Updating" until the indexer has it, which on testnet can be under a second.
    await waitForVisible(yourRow(page, tokenId).getByText(/^(Updating|For sale)$/), 'listed');
    await snap(page, 'marketplace/sell/08', { focus: yourRow(page, tokenId) });
  } else {
    await signSteps(dialog, wallet, SELLER, (await dialog.getByText(/already allowed/).count()) ? 1 : 2);
  }
  await waitForVisible(yourRow(page, tokenId).getByText(/^(For sale|Ended)$/), `listing of #${tokenId} indexed`, {
    governingS: 120
  });
}

async function proposeFromDock(
  page: Page,
  wallet: E2ESigner,
  key: string,
  title: string,
  why: string,
  actions: number
) {
  await page
    .getByRole('region', { name: 'Your proposal draft' })
    .getByRole('button', { name: 'Review proposal' })
    .click();
  const preview = await writeAndReview(page, { title, why, actions });
  const id = await submitProposal(page, wallet, SELLER, actions);
  saveShowcaseState((s) => {
    s.proposals = { ...(s.proposals ?? {}), [key]: id };
  });
  return preview;
}

test.describe.serial('Lamplight: the market', () => {
  let tokens: number[] = [];
  test.beforeEach(async ({ page, wallet }) => {
    test.setTimeout(30 * 60_000);
    const ids = showcaseIdentities();
    tokens = (await tokensOf(page.request, lamplight(), ids[SELLER])).sort((a, b) => a - b);
    await page.goto(market);
    await signInAs(page, wallet, SELLER);
  });

  test('sell, then change the price', async ({ page, wallet }) => {
    test.skip(Boolean(state().market?.sold), 'done');
    const keep = (state().market?.kept as number | undefined) ?? tokens[0];
    await openMarket(page);
    const listed = await yourRow(page, keep!)
      .getByText('For sale', { exact: true })
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (listed) {
      await snap(page, 'marketplace/sell/08', { focus: yourRow(page, keep!) });
    } else await listToken(page, wallet, keep!, '50', true);
    mark('kept', keep);
    // Change the price: three steps, photographed while the cancel step confirms.
    await openMarket(page);
    const row = yourRow(page, keep!);
    await row.getByRole('button', { name: 'Change price' }).click();
    const change = page.getByRole('dialog', { name: `Change the price of token #${keep}` });
    await waitForVisible(change, 'change price');
    await change.getByRole('textbox', { name: /New price/ }).fill('45');
    await snap(page, 'marketplace/sell/09', { focus: change });
    await change.getByRole('button', { name: 'Continue' }).click();
    const dialog = page.getByRole('dialog', { name: 'Change the price' });
    await dialog.getByRole('button', { name: 'Check' }).click();
    const send = dialog.getByRole('button', { name: 'Sign and send' });
    await waitForUi('cancel step prepared', (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 30 });
    const hold = await holdConfirmation(page);
    await send.click();
    await waitForUi('cancel step confirming', (timeout) => expect.poll(() => hold.held(), { timeout }).toBe(true), {
      governingS: 30
    });
    await snap(page, 'marketplace/sell/10', { focus: dialog });
    await hold.release();
    // Then the relist steps (allow, if needed, and list) until Done.
    const doneButton = dialog.getByRole('button', { name: 'Done' });
    await expect(async () => {
      if (await doneButton.isEnabled().catch(() => false)) return;
      if (await send.isEnabled().catch(() => false)) await send.click();
      throw new Error('not done yet');
    }).toPass({ timeout: 240_000, intervals: [2_000] });
    await dialog.getByRole('button', { name: 'Done' }).click();
    mark('sold');
  });

  test('the new member buys a lantern', async ({ page, wallet }) => {
    test.skip(Boolean(state().market?.bought), 'done');
    const forSale = tokens.find((id) => id !== state().market?.kept);
    if (!state().market?.forBuyer) {
      await listToken(page, wallet, forSale!, '30');
      mark('forBuyer', forSale);
    }
    const tokenId = state().market!.forBuyer as number;
    const ids = showcaseIdentities();
    const alreadyBought = (await tokensOf(page.request, lamplight(), ids[BUYER])).includes(tokenId);
    await switchAccount(page, wallet, BUYER, alreadyBought ? `/dao/${SHOWCASE.slug}` : `${market}?kind=secondary`);
    if (!alreadyBought) await buyListing(page, tokenId);
    await page.goto(`/dao/${SHOWCASE.slug}`);
    const membership = page.getByRole('complementary', { name: 'Membership' });
    await waitForVisible(membership.getByRole('heading', { name: 'Your membership' }), 'your membership', {
      governingS: 120
    });
    await snap(page, 'marketplace/buy/05', { focus: membership });
    mark('bought');
  });

  async function buyListing(page: Page, tokenId: number) {
    await openMarket(page, '?kind=secondary');
    const listing = card(page, tokenId);
    await waitForVisible(listing, 'listing card', { governingS: 60 });
    await snap(page, 'marketplace/buy/01', { top: true });
    await listing.getByRole('button', { name: 'Details' }).click();
    await snap(page, 'marketplace/buy/02', { focus: listing });
    await listing.getByRole('button', { name: /^Buy for / }).click();
    const dialog = page.getByRole('dialog', { name: 'Buy this token' });
    await waitForVisible(dialog, 'buy dialog');
    await dialog.getByRole('button', { name: 'Check' }).click();
    const send = dialog.getByRole('button', { name: 'Sign and send' });
    await waitForUi('buy prepared', (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 30 });
    await snap(page, 'marketplace/buy/03', { focus: dialog });
    await send.click();
    const done = dialog.getByRole('button', { name: 'Done' });
    await waitForUi('bought', (timeout) => expect(done).toBeEnabled({ timeout }), { governingS: 90 });
    await snap(page, 'marketplace/buy/04', { markers: [{ label: 'the Done button', locator: done }] });
    await done.click();
  }

  test('a listing ends and comes back; another is cancelled', async ({ page, wallet }) => {
    test.skip(Boolean(state().market?.cancelled), 'done');
    const kept = state().market?.kept as number;
    const spare = tokens.find((id) => id !== kept);
    test.skip(spare === undefined, 'no spare token to list');
    const end = await page.evaluate(() => {
      const date = new Date(Date.now() + 150_000);
      date.setSeconds(0, 0);
      date.setMinutes(date.getMinutes() + 1);
      const pad = (value: number) => String(value).padStart(2, '0');
      return {
        value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
        unix: date.getTime() / 1000
      };
    });
    await listToken(page, wallet, spare!, '35', false, end.value);
    await waitForLedgerTime(end.unix + 1, { governingS: end.unix - Date.now() / 1000 + 30, label: 'listing end' });
    await openMarket(page);
    const ended = yourRow(page, spare!);
    await waitForVisible(ended.getByText('Ended', { exact: true }), 'ended', { governingS: 60 });
    await snap(page, 'marketplace/cancel/01', { focus: yourListings(page) });
    const giveBack = ended.getByRole('button', { name: 'Return my token' });
    await snap(page, 'marketplace/cancel/04', {
      markers: [{ label: 'the Return my token button', locator: giveBack }]
    });
    await giveBack.click();
    const back = page.getByRole('dialog', { name: 'Return the token from an ended listing' });
    await signSteps(back, wallet, SELLER, 1, () => snap(page, 'marketplace/cancel/05', { focus: back }));

    // List it again, then cancel.
    await listToken(page, wallet, spare!, '35');
    const row = yourRow(page, spare!);
    await row.getByRole('button', { name: 'Cancel listing' }).click();
    const cancel = page.getByRole('dialog', { name: 'Cancel your listing' });
    await waitForVisible(cancel, 'cancel dialog');
    await cancel.getByRole('button', { name: 'Check' }).click();
    const send = cancel.getByRole('button', { name: 'Sign and send' });
    await waitForUi('cancel prepared', (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 30 });
    await snap(page, 'marketplace/cancel/02', { focus: cancel });
    await send.click();
    await waitForUi(
      'cancelled',
      (timeout) => expect(cancel.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout }),
      { governingS: 90 }
    );
    await cancel.getByRole('button', { name: 'Done' }).click();
    await waitForUi('listing gone', (timeout) => expect(yourRow(page, spare!)).toHaveCount(0, { timeout }), {
      governingS: 120
    });
    await snap(page, 'marketplace/cancel/03', { top: true });
    mark('cancelled');
  });

  test('propose a quick-buy pool', async ({ page, wallet }) => {
    test.skip(Boolean(showcaseState().proposals?.pool), 'proposed already');
    await page.goto(lamplight().path('admin/marketplace'));
    await waitForVisible(page.getByText('The market is open'), 'market settings');
    const form = panel(page, 'Propose a quick-buy pool');
    await snap(page, 'marketplace/pools/05', { focus: form });
    await form.getByLabel('Price per token').fill('25');
    await form.getByLabel('Tokens in the pool').fill('3');
    await form.getByLabel('Maximum per wallet').fill('1');
    await form.getByLabel('Maximum sales per period').fill('2');
    await form.getByLabel('Period (hours)').fill('24');
    const closes = await page.evaluate(() => {
      const at = new Date(Date.now() + 14 * 24 * 3600_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T18:00`;
    });
    await form.getByLabel('Closes at (local time)').fill(closes);
    const warning = form.getByText(/The largest vote share one wallet could buy is/);
    await waitForVisible(warning, 'vote warning');
    await snap(page, 'marketplace/pools/06', { focus: form.getByLabel('Price per token') });
    await snap(page, 'manage/marketplace/04', { focus: warning });
    await snap(page, 'marketplace/pools/07', { markers: [{ label: 'the vote warning', locator: warning }] });
    await form.getByRole('button', { name: 'Add the pool to proposal' }).click();
    await confirmAdd(page);
    await page
      .getByRole('region', { name: 'Your proposal draft' })
      .getByRole('button', { name: 'Review proposal' })
      .click();
    const queue = page.getByRole('list', { name: 'Actions in this proposal' });
    await waitForVisible(queue, 'composer with the pool');
    await snap(page, 'marketplace/pools/08', { focus: queue });
    await writeAndReview(page, {
      title: 'Open a quick-buy pool for new makers',
      why: 'Some people would like to join without waiting for an auction. This opens a pool of three new lanterns at 25 XLM each, one per wallet, so new makers can join directly.',
      actions: 2
    });
    const id = await submitProposal(page, wallet, SELLER, 2);
    saveShowcaseState((s) => {
      s.proposals = { ...(s.proposals ?? {}), pool: id };
    });
  });

  test('propose a Treasury purchase of the kept lantern', async ({ page, wallet }) => {
    test.skip(Boolean(showcaseState().proposals?.purchase), 'proposed already');
    const kept = state().market?.kept as number;
    await page.goto(lamplight().path('admin/marketplace'));
    await waitForVisible(page.getByText('The market is open'), 'market settings');
    const purchase = panel(page, 'Propose a Treasury purchase');
    await snap(page, 'marketplace/treasury-purchases/01', { focus: purchase });
    const field = purchase.getByLabel('Listed token ID');
    await field.fill(String(kept));
    await snap(page, 'marketplace/treasury-purchases/02', {
      markers: [{ label: 'the Listed token ID field', locator: field }]
    });
    await purchase.getByRole('button', { name: 'Add the purchase to proposal' }).click();
    await waitForVisible(page.getByText('Added to your proposal', { exact: true }), 'added');
    await page
      .getByRole('region', { name: 'Your proposal draft' })
      .getByRole('button', { name: 'Review proposal' })
      .click();
    const queue = page.getByRole('list', { name: 'Actions in this proposal' });
    await waitForVisible(queue, 'composer with the purchase');
    await snap(page, 'marketplace/treasury-purchases/03', { focus: queue });
    await writeAndReview(page, {
      title: `Keep lantern #${kept} for the shared collection`,
      why: `Lantern #${kept} was one of the first made in a workshop. This buys it from the market with treasury funds, so it stays with the circle and can be shown at events.`,
      actions: 2
    });
    await snap(page, 'marketplace/treasury-purchases/04', { top: true });
    const id = await submitProposal(page, wallet, SELLER, 2);
    saveShowcaseState((s) => {
      s.proposals = { ...(s.proposals ?? {}), purchase: id };
    });
  });
});
