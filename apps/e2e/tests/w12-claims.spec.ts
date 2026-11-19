import type { Page, Route } from '@playwright/test';

import { signedTransactions, signInAs } from '../src/connect.ts';
import { createFailingDrive, type Drive, rawCid } from '../src/drive-fixture.ts';
import { appliedTheme, expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { loadTribe, nativeStroops, XLM } from '../src/tribe-fixture.ts';
import { waitForIndexed, waitForLedgerTime, waitForVisible } from '../src/waits.ts';

/**
 * W12 · Claims (§3.4): the launch admin creates a claim list from pasted rows, publishes it and
 * opens it (allow the claims module to mint, then open the list), a listed member claims their
 * token, a wallet that is not on the list is refused before signing, and a member who paid into a
 * launch drive that failed takes the payment back.
 *
 * - The list and the claim run on the fixture tribe "E2E Claims" (slug e2e-w06-2, in Setup,
 *   configs/e2e-walk-e2e-w06-2-dao.json). Each run opens one more free list on it.
 * - The refund needs a drive that failed, and a tribe has one drive for life, so the refund case
 *   makes its own tribe and drive (src/drive-fixture.ts).
 * - The walkthrough build has no Pinata key, so the upload to IPFS is answered in the browser with
 *   the file's own CID. Nothing is pinned, so the server can't fetch the list back: members claim
 *   with the proof file the organizer hands out, the app's documented fallback.
 */

const tribe = loadTribe('e2e-w06-2', 'deploys/dev-testnet-dao-601.json');
const ADMIN = 'e2e-founder';
const CLAIMER = 'e2e-member-a';
const OUTSIDER = 'e2e-member-b';
const claimsPath = `/dao/${tribe.daoId}/claims`;
const adminPath = `/dao/${tribe.daoId}/admin/claims`;
const api = `/api/dao/${tribe.daoId}`;

type ListBody = {
  listId: number;
  root: string;
  treeUri: string;
  price: string;
  total: number;
  minted: number;
  claimers: number;
  escrowed?: string | null;
  claimed?: number | null;
  assurance: { state: string } | null;
};
type ClaimsBody = { live: boolean; admin: string; nextListId: number; allowance: number | null; lists: ListBody[] };
type HistoryBody = { total: number; items: { list_id: number; recipient: string | null; amount: string | null }[] };
type TreeFile = { merkleRoot: string; list: number; claims: Record<string, { amount: string; proof: string[] }> };

/* ---------- The IPFS upload, answered in the browser ---------- */

/**
 * Answer the three upload calls (authorize, upload, complete) without Pinata, and keep the file
 * the app published so the test can hand out its proofs.
 */
async function answerUploads(page: Page) {
  const published: { tree: TreeFile | null; cid: string } = { tree: null, cid: '' };
  await page.route('**/api/uploads/pinata-url', (route) =>
    route.fulfill({ json: { signedUrl: 'https://e2e-uploads.invalid/files', uploadId: `e2e-${Date.now()}` } })
  );
  await page.route('https://e2e-uploads.invalid/**', async (route: Route) => {
    const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
    const json = body.slice(body.indexOf('{"format"'), body.lastIndexOf('}') + 1);
    published.tree = JSON.parse(json) as TreeFile;
    published.cid = rawCid(json);
    await route.fulfill({ json: { data: { cid: published.cid } } });
  });
  await page.route('**/api/uploads/complete', (route) =>
    route.fulfill({
      json: { ipfsUri: `ipfs://${published.cid}`, gatewayUrl: `https://ipfs.io/ipfs/${published.cid}` }
    })
  );
  return published;
}

/* ---------- Page parts ---------- */

const listCard = (page: Page, listId: number) => page.getByRole('region', { name: `Claim list ${listId + 1}` });
const driveCard = (page: Page) => page.getByRole('region', { name: 'Launch drive' });
const status = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text });

async function openClaims(page: Page, path = claimsPath) {
  await page.goto(path);
  await waitForVisible(page.getByRole('heading', { level: 1 }), 'claims page');
}

/** Paste a proof file and check it; returns once the review is up. */
async function reviewProof(page: Page, proof: { amount: string; proof: string[] }) {
  await page.getByText('Have a proof file instead?').click();
  await page.getByRole('textbox', { name: 'Or paste it' }).fill(JSON.stringify(proof));
  await page.getByRole('button', { name: 'Check proof' }).click();
}

/** Sign the reviewed claim and wait for its confirmation. */
async function signClaim(page: Page, wallet: Parameters<typeof signedTransactions>[0], identity: string) {
  const review = page.getByRole('region', { name: 'Claim transaction review' });
  await waitForVisible(review, 'claim review', { governingS: 30 });
  const before = signedTransactions(wallet, identity);
  await review.getByRole('button', { name: 'Sign and claim' }).click();
  await waitForVisible(
    status(page, 'Claim confirmed. Your claim history can take a moment to update.'),
    'claim confirmed',
    { governingS: 60 }
  );
  expect(signedTransactions(wallet, identity) - before).toBe(1);
  return review;
}

/* ---------- @chain: the walk ---------- */

test.describe.serial('W12 claims', { tag: '@chain' }, () => {
  let ids: Record<string, string> = {};
  let listId = -1;
  let tree: TreeFile | null = null;

  test.beforeAll(async ({ identities }) => {
    requireVerifiedManager();
    ids = Object.fromEntries(Object.values(identities).map(({ name, address }) => [name, address]));
  });

  test('the launch admin creates a claim list, publishes it and opens it', async ({ page, wallet }) => {
    test.setTimeout(5 * 60_000);
    const published = await answerUploads(page);
    const before = (await (await page.request.get(`${api}/claims`)).json()) as ClaimsBody;
    expect(before.live, 'the claims fixture is still in Setup').toBe(false);
    expect(before.admin).toBe(ids[ADMIN]);
    listId = before.nextListId;

    await openClaims(page, adminPath);
    await signInAs(page, wallet, ADMIN);
    await waitForVisible(page.getByRole('heading', { name: 'Open a claim list' }), 'the list form');
    await expect(page.getByRole('radio', { name: 'Free list' })).toBeChecked();

    await page.getByRole('button', { name: 'Paste addresses instead' }).click();
    const rows = page.getByRole('textbox', { name: 'Who can claim' });
    // A bad row is caught before anything is published.
    await rows.fill(`address,amount\n${ids[CLAIMER]},1\nnot-an-address,2`);
    await waitForVisible(page.getByText(/not-an-address|line 3/i).first(), 'the bad row named');
    await rows.fill(`address,amount\n${ids[CLAIMER]},1`);
    await page.getByRole('textbox', { name: 'Claims stay open for (days)' }).fill('7');

    const signed = signedTransactions(wallet, ADMIN);
    await page.getByRole('button', { name: 'Publish the list and open it' }).click();
    // Two signatures: let the claims module mint, then open the list.
    await waitForVisible(page.getByText('Claim list open', { exact: true }), 'Claim list open toast', {
      governingS: 120
    });
    expect(signedTransactions(wallet, ADMIN) - signed).toBe(2);

    tree = published.tree;
    expect(tree, 'the app published the claim tree').not.toBeNull();
    expect(tree!.list).toBe(listId);
    expect(Object.keys(tree!.claims)).toEqual([ids[CLAIMER]]);

    const after = await waitForIndexed<ClaimsBody>(
      page.request,
      {
        label: `claim list ${listId + 1} open`,
        path: `${api}/claims`,
        predicate: (body) => body.lists.some((list) => list.listId === listId)
      },
      { governingS: 0 }
    );
    const list = after.lists.find((item) => item.listId === listId)!;
    expect(list).toMatchObject({ root: tree!.merkleRoot, treeUri: `ipfs://${published.cid}`, price: '0', total: 1 });
    expect(after.allowance).toBeGreaterThanOrEqual(1);

    const card = listCard(page, listId);
    await waitForVisible(card, `claim list ${listId + 1} card`, { governingS: 30 });
    await expect(card.getByText('Open', { exact: true })).toBeVisible();
    await expect(card.getByText(/^Free · 0 of 1 tokens claimed by 0 people · closes /)).toBeVisible();
  });

  test('a wallet that is not on the list is refused before it signs', async ({ page, wallet }) => {
    test.setTimeout(3 * 60_000);
    expect(tree).not.toBeNull();
    await openClaims(page);
    await signInAs(page, wallet, OUTSIDER);
    await waitForVisible(listCard(page, listId), `claim list ${listId + 1}`, { governingS: 30 });
    await reviewProof(page, tree!.claims[ids[CLAIMER]]);
    await waitForVisible(
      status(page, 'This proof matches none of the open lists for your account.'),
      'proof refused for another account'
    );
    await expect(page.getByRole('region', { name: 'Claim transaction review' })).toHaveCount(0);
    expect(signedTransactions(wallet, OUTSIDER)).toBe(0);
  });

  test('a listed member claims their token with the proof file', async ({ page, wallet }) => {
    test.setTimeout(5 * 60_000);
    expect(tree).not.toBeNull();
    await openClaims(page);
    await signInAs(page, wallet, CLAIMER);
    const card = listCard(page, listId);
    await waitForVisible(card, `claim list ${listId + 1}`, { governingS: 30 });
    // The list isn't pinned (see above), so the server can't check it and says so in words (BUG-W06-1).
    await expect(card.getByText('Claim list unavailable')).toBeVisible();
    await expect(
      card.getByText("The published list couldn't be loaded from IPFS. You can still claim with a proof file from the organizer.")
    ).toBeVisible();

    await reviewProof(page, tree!.claims[ids[CLAIMER]]);
    const review = page.getByRole('region', { name: 'Claim transaction review' });
    await waitForVisible(review, 'claim review', { governingS: 30 });
    await expect(review.getByRole('heading', { name: `Claim 1 token from claim list ${listId + 1}` })).toBeVisible();
    await expect(review.getByText(/^The tokens are free\. Network fee: [\d.]+ XLM\.$/)).toBeVisible();
    await signClaim(page, wallet, CLAIMER);

    const body = await waitForIndexed<ClaimsBody>(
      page.request,
      {
        label: `claim on list ${listId + 1} indexed`,
        path: `${api}/claims`,
        predicate: (state) => state.lists.some((list) => list.listId === listId && list.minted === 1)
      },
      { governingS: 0 }
    );
    expect(body.lists.find((list) => list.listId === listId)).toMatchObject({ minted: 1, claimers: 1 });
    await waitForIndexed<HistoryBody>(
      page.request,
      {
        label: 'the claim in past claims',
        path: `${api}/claims/history?page=0`,
        predicate: (history) =>
          history.items.some((item) => item.list_id === listId && item.recipient === ids[CLAIMER])
      },
      { governingS: 0 }
    );

    // The page shows the claim: the card's count, and the history row.
    await page.getByRole('button', { name: 'Refresh' }).click();
    await waitForVisible(card.getByText(/· 1 of 1 tokens claimed by 1 person ·/), 'the list counts the claim', {
      governingS: 30
    });
    await expect(card.getByText('All claimed', { exact: true })).toBeVisible();
    await expect(page.getByText(`1 token from Claim list ${listId + 1}`).first()).toBeVisible();

    // Nothing is left to claim: the card offers no claim button.
    await expect(card.getByRole('button', { name: /^Claim \d/ })).toHaveCount(0);
  });

  test('a member who paid into a failed launch drive takes the payment back', async ({ page, wallet }) => {
    test.setTimeout(20 * 60_000);
    const WINDOW_S = 180;
    let drive: Drive | null = null;
    await test.step('a Setup tribe with a drive that will fail', async () => {
      drive = createFailingDrive({ claimers: [ids[CLAIMER]], price: XLM, windowS: WINDOW_S });
    });
    const { daoId, deadline, price, proofs } = drive!;
    const drivePath = `/dao/${daoId}/claims`;

    await test.step('the member claims and pays while the drive is open', async () => {
      await waitForIndexed<ClaimsBody>(
        page.request,
        {
          label: 'the drive indexed',
          path: `/api/dao/${daoId}/claims`,
          predicate: (body) => body.lists.some((list) => list.assurance?.state === 'open')
        },
        { governingS: 0 }
      );
      await openClaims(page, drivePath);
      await signInAs(page, wallet, CLAIMER);
      const card = driveCard(page);
      await waitForVisible(card, 'the launch drive card', { governingS: 30 });
      await expect(card.getByText(/^0 of 2 people needed by /)).toBeVisible();
      await reviewProof(page, proofs[ids[CLAIMER]]);
      const review = page.getByRole('region', { name: 'Claim transaction review' });
      await waitForVisible(review, 'drive claim review', { governingS: 30 });
      await expect(review.getByText(/^You pay 1(\.0+)? XLM, held by the claims module until the tribe launches\./)).toBeVisible();
      await signClaim(page, wallet, CLAIMER);
    });

    await test.step('the deadline passes and the drive fails', async () => {
      await waitForLedgerTime(deadline + 1, { governingS: WINDOW_S, label: 'drive deadline on ledger time' });
      await waitForIndexed<ClaimsBody>(
        page.request,
        {
          label: 'the drive failed, with the payment held',
          path: `/api/dao/${daoId}/claims`,
          predicate: (body) =>
            body.lists.some((list) => list.assurance?.state === 'failed' && BigInt(list.escrowed ?? 0) === price)
        },
        { governingS: 0 }
      );
    });

    await test.step('Take back returns the payment to the member', async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      const card = driveCard(page);
      await waitForVisible(card.getByText('Failed', { exact: true }), 'drive failed badge', { governingS: 30 });
      await expect(
        card.getByText('The drive ended before the tribe launched. Everyone who paid can take their payment back.')
      ).toBeVisible();
      const takeBack = card.getByRole('button', { name: /^Take back 1(\.0+)? XLM$/ });
      await expect(takeBack).toBeEnabled();
      const balance = await nativeStroops(ids[CLAIMER]);
      const signed = signedTransactions(wallet, CLAIMER);
      await takeBack.click();
      await waitForVisible(page.getByText('Take back your payment', { exact: true }), 'refund toast', {
        governingS: 60
      });
      await waitForVisible(card.getByText('Your payment has been returned.'), 'payment returned', { governingS: 60 });
      expect(signedTransactions(wallet, CLAIMER) - signed).toBe(1);
      // The whole payment comes back; the member pays only the network fee.
      await expect
        .poll(async () => (await nativeStroops(ids[CLAIMER])) - balance, { timeout: 30_000 })
        .toBeGreaterThan(price - XLM / 2n);
      expect((await nativeStroops(ids[CLAIMER])) - balance).toBeLessThanOrEqual(price);
      await expect(card.getByRole('button', { name: /^Take back/ })).toHaveCount(0);
    });
  });
});

/* ---------- @matrix: the claims pages at every viewport and theme ---------- */

test.describe('W12 claims pages', { tag: '@matrix' }, () => {
  test('signed out: what claims are, and how to take part', async ({ page, theme }) => {
    await openClaims(page);
    expect(await appliedTheme(page)).toBe(theme);
    await expect(page.getByRole('heading', { name: 'Claim your tokens', level: 1 })).toBeVisible();
    // The lists' state can take one IPFS fetch budget (15s) when a published list isn't reachable.
    await waitForVisible(
      page.getByText('Connect the wallet that is on a claim list to see your tokens, or to take back a payment.'),
      'signed-out claims state',
      { governingS: 15 }
    );
    await expect(page.getByRole('heading', { name: 'Past claims' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('the launch admin sees the list form, and a bad row is caught before publishing', async ({
    page,
    wallet
  }) => {
    await openClaims(page, adminPath);
    await signInAs(page, wallet, ADMIN);
    await waitForVisible(page.getByRole('heading', { name: 'Open a claim list' }), 'the list form');
    await expect(page.getByRole('heading', { name: 'Claim lists', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Paste addresses instead' }).click();
    await page.getByRole('textbox', { name: 'Who can claim' }).fill('address,amount\nnot-an-address,2');
    await waitForVisible(page.getByText(/not-an-address|line 2/i).first(), 'the bad row named');
    await expect(page.getByRole('button', { name: 'Publish the list and open it' })).toBeDisabled();

    // The drive tab warns before it hands the tribe to its Treasury.
    await page.getByText('Launch drive', { exact: true }).click();
    await expect(page.getByText('Opening a drive transfers control of the tribe to its Treasury now')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'People who must claim before launch' })).toBeVisible();
    expect(wallet.calls.some((call) => call.method === 'signTransaction')).toBe(false);
    await expectNoHorizontalScroll(page);
  });
});
