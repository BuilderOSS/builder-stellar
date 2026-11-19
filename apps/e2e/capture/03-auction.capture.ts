import type { APIRequestContext, Page } from '@playwright/test';

import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { requireDao, saveShowcaseState, SHOWCASE, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import { switchAccount } from '../src/tribe.ts';
import { latestLedger, waitForIndexed, waitForLedgerTime, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: auctions/bid, auctions/settle and start/first-10-minutes/05 to 06. The workshop lead wins
 * Lamplight's first auction with a comment, and the second bidder settles it (docs/qa/SHOWCASE_TRIBE.md).
 * Not captured: auctions/refunds (with XLM a refund is paid straight back, so "Refund waiting" never
 * appears) and the wallet's own window (bid/04, settle/03).
 */
type Current = {
  auction: { token_id: string; end_time: string; highest_bidder: string | null; settled: boolean } | null;
  paused: boolean;
};
const current = async (request: APIRequestContext, daoId: string) =>
  (await (await request.get(`/api/dao/${daoId}/auctions`)).json()) as Current;

async function youDisconnect(page: Page) {
  await page.getByRole('button', { name: /^You, connected as/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await waitForVisible(page.getByRole('button', { name: 'Connect wallet' }).first(), 'signed out');
}

async function openAuction(page: Page) {
  await page.goto(`/dao/${SHOWCASE.slug}/auctions`);
  await waitForVisible(page.getByRole('heading', { name: 'Auction', exact: true }), 'auction page');
}

test('Lamplight: the first auction', async ({ page, wallet }) => {
  test.skip(Boolean(showcaseState().firstAuctionSettled), 'The first auction is already settled.');
  const daoId = requireDao();
  showcaseIdentities();
  test.setTimeout(20 * 60_000);

  // A 5-minute auction that ended with no bid waits to be settled before the next one starts.
  const stale = await current(page.request, daoId);
  const { closeTime } = await latestLedger();
  if (stale.auction && !stale.auction.settled && Number(stale.auction.end_time) < closeTime + 150) {
    await waitForLedgerTime(Number(stale.auction.end_time) + 1, { governingS: 300, label: 'stale auction end' });
    wallet.use('e2e-operator');
    await openAuction(page);
    await signInAs(page, wallet, 'e2e-operator');
    const settleStale = page.getByRole('button', { name: 'Settle and start the next auction' });
    await waitForVisible(settleStale, 'settle the stale auction', { governingS: 30 });
    await settleStale.click();
    await waitForVisible(page.getByText('Auction settled', { exact: true }), 'stale settled', { governingS: 60 });
    await waitForIndexed<Current>(
      page.request,
      {
        label: 'fresh auction',
        path: `/api/dao/${daoId}/auctions`,
        predicate: (next) => Boolean(next.auction && next.auction.token_id !== stale.auction!.token_id)
      },
      { governingS: 30 }
    );
    await youDisconnect(page);
  }

  wallet.use('e2e-member-a');
  await page.goto(`/dao/${SHOWCASE.slug}`);
  await signInAs(page, wallet, 'e2e-member-a');
  await waitForVisible(page.getByRole('heading', { name: SHOWCASE.name }).first(), 'tribe home');
  await snap(page, 'start/first-10-minutes/05', { top: true });

  await openAuction(page);
  await waitForVisible(page.getByText('Live', { exact: true }), 'live auction');
  await snap(page, 'auctions/bid/01', { top: true });

  // The first bid of an auction has no "Bid the minimum": the field starts at the starting price.
  const bid = page.getByRole('textbox', { name: /^Your bid/ });
  await bid.fill('20');
  await snap(page, 'auctions/bid/02', { markers: [{ label: 'the Your bid field', locator: bid }] });
  const place = page.getByRole('button', { name: /^Place .+ XLM bid$/ });
  await snap(page, 'start/first-10-minutes/06', { markers: [{ label: 'the Place bid button', locator: place }] });
  const comment = page.getByRole('textbox', { name: /^Comment \(optional\)/ });
  await comment.fill('For the first workshop. Looking forward to it.');
  await snap(page, 'auctions/bid/03', { markers: [{ label: 'the comment box', locator: comment }] });

  await place.click();
  await waitForVisible(page.getByText('Bid confirmed', { exact: true }), 'bid confirmed', { governingS: 60 });
  await waitForVisible(page.getByText("You're winning", { exact: true }), 'winning', { governingS: 60 });
  await waitForUi('bid listed', (timeout) =>
    expect(page.getByText('For the first workshop. Looking forward to it.')).toBeVisible({ timeout })
  );
  await snap(page, 'auctions/bid/05', { focus: page.getByText("You're winning", { exact: true }) });

  // The end, then the founder settles.
  const body = await current(page.request, daoId);
  await waitForLedgerTime(Number(body.auction!.end_time) + 1, { governingS: 300, label: 'auction end' });
  // Anyone can settle; the second bidder does, so the founder's account stays with 90-drive.
  await switchAccount(page, wallet, 'e2e-operator', `/dao/${SHOWCASE.slug}/auctions`);
  await openAuction(page);
  const settle = page.getByRole('button', { name: 'Settle and start the next auction' });
  await waitForVisible(settle, 'settle button', { governingS: 30 });
  await snap(page, 'auctions/settle/01', { top: true });
  await snap(page, 'auctions/settle/02', {
    markers: [{ label: 'the Settle and start the next auction button', locator: settle }]
  });
  await settle.click();
  await waitForVisible(page.getByText('Auction settled', { exact: true }), 'settled', { governingS: 60 });
  await waitForIndexed<Current>(
    page.request,
    {
      label: 'next auction',
      path: `/api/dao/${daoId}/auctions`,
      predicate: (next) => Boolean(next.auction && next.auction.token_id !== body.auction!.token_id)
    },
    { governingS: 30 }
  );
  await openAuction(page);
  const past = page.getByRole('heading', { name: 'Past auctions' });
  await waitForVisible(page.getByText(`#${body.auction!.token_id}`).first(), 'settled token in past auctions', {
    governingS: 60
  });
  await snap(page, 'auctions/settle/04', { focus: past });
  saveShowcaseState((state) => {
    state.firstAuctionSettled = true;
    state.firstAuctionToken = body.auction!.token_id;
  });
});
