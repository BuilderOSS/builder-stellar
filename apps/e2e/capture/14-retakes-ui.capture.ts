import type { Page } from '@playwright/test';

import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { lamplight, saveShowcaseState, SHOWCASE, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import { choose, setCheckbox, switchAccount } from '../src/tribe.ts';
import { tokensOf } from '../src/w09/fixture.ts';
import { confirmAdd, draftCount, openComposer, pickAction } from '../src/w09/proposals.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Retakes after the screenshot audit: shots that caught a page still loading, rang a hidden radio
 * instead of its card, or framed the wrong part. Forms are filled and never sent. The only
 * transactions are settling the ended auction and one listing, so a member has something to look at.
 */
const market = `/dao/${SHOWCASE.slug}/marketplace`;
const section = (page: Page, id: string) => page.locator(`section#${id}`);
const card = (page: Page, tokenId: number) =>
  page
    .getByRole('region', { name: 'Listings' })
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: `${SHOWCASE.name} #${tokenId}`, exact: true }) });

test.describe('Lamplight: retakes', () => {
  test.beforeEach(() => {
    test.setTimeout(20 * 60_000);
    showcaseIdentities();
  });

  test('the create form choices', async ({ page, wallet }) => {
    await page.goto('/drafts');
    await signInAs(page, wallet, 'e2e-founder');
    await page.goto('/create');
    const created = page.getByRole('region', { name: 'Creating your tribe' });
    const name = page.getByLabel('Tribe name');
    await waitForUi('a draft opens', (timeout) => expect(name.or(created)).toBeVisible({ timeout }));
    if (await created.isVisible()) {
      await page.goto('/drafts');
      await page.getByRole('link', { name: 'Build another tribe' }).click();
    }
    await name.fill(SHOWCASE.name);
    await page.getByLabel('Symbol').fill(SHOWCASE.symbol);
    await page.getByLabel('Link', { exact: true }).fill('lamplight-example');
    await page.getByRole('textbox', { name: 'Description' }).fill(SHOWCASE.description);
    await page.getByRole('button', { name: 'Continue to Membership' }).click();
    const join = page.getByRole('radiogroup', { name: 'How do people join?' });
    await waitForVisible(join, 'membership');
    await choose(page, 'How do people join?', 'Daily auction');
    await snap(page, 'create/membership/01', {
      markers: [{ label: 'the Daily auction choice', locator: join.getByRole('radio', { name: /^Daily auction/ }) }],
      focus: join
    });
    const rules = page.getByRole('radiogroup', { name: 'Who can hold a membership?' });
    await choose(page, 'Who can hold a membership?', 'Open membership');
    await snap(page, 'create/membership/02', {
      markers: [
        { label: 'the Open membership choice', locator: rules.getByRole('radio', { name: /^Open membership/ }) }
      ],
      focus: rules
    });
    await choose(page, 'How do people join?', 'Auction + resale');
    const advanced = section(page, 'membership').getByRole('button', { name: 'Advanced settings' });
    await advanced.click();
    const claims = section(page, 'membership').getByRole('checkbox', { name: /Let members claim tokens/ });
    await setCheckbox(section(page, 'membership'), /Let members claim tokens/, true);
    // The membership rules and the claim lists option, below the auction fields.
    await snap(page, 'create/membership/03', { focus: claims });
    await page.getByRole('button', { name: 'Continue to Voting' }).click();
    const pace = page.getByRole('radiogroup', { name: 'How fast should decisions happen?' });
    await waitForVisible(pace, 'voting');
    await choose(page, 'How fast should decisions happen?', 'Balanced');
    await snap(page, 'create/voting/02', {
      markers: [{ label: 'the Balanced pace', locator: pace.getByRole('radio', { name: /^Balanced/ }) }],
      focus: pace
    });
    await page.goto('/drafts');
  });

  test('Manage pages, loaded', async ({ page, wallet }) => {
    const tribe = lamplight();
    await page.goto(tribe.path('admin/governance'));
    await signInAs(page, wallet, 'e2e-founder');
    await waitForVisible(page.getByRole('region', { name: 'Quorum' }).getByText(/^Now: \d/), 'voting rules loaded', {
      governingS: 60
    });
    await snap(page, 'manage/governance/01', { top: true });

    await page.goto(tribe.path('admin/profile'));
    const description = page.getByRole('textbox', { name: 'Description' });
    await waitForUi('profile loaded', (timeout) => expect(description).toBeEditable({ timeout }), { governingS: 60 });
    await snap(page, 'manage/profile/01', { top: true });

    await page.goto(tribe.path('admin/auction'));
    const change = page.getByRole('region', { name: 'Change auction settings' });
    await waitForVisible(change, 'auction settings');
    await change.getByRole('textbox', { name: 'Starting price' }).fill('12');
    const cancel = change.getByRole('checkbox', { name: /^Also cancel the current auction/ });
    const resume = change.getByRole('radio', { name: 'Resume auctions' });
    await snap(page, 'manage/auction/03', {
      markers: [
        { label: 'the Also cancel the current auction checkbox', locator: cancel },
        { label: 'the Resume auctions choice', locator: resume }
      ]
    });
    await snap(page, 'auctions/settings/03', { markers: [{ label: 'the Resume auctions choice', locator: resume }] });

    await page.goto(tribe.path('admin/marketplace'));
    await waitForVisible(page.getByText('The market is open'), 'market settings');
    const sweep = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /closing or sweeping a pool/i }) })
      .first();
    const pool = sweep.getByRole('combobox').first();
    if (await pool.isVisible().catch(() => false)) {
      const options = await pool.locator('option').count();
      if (options > 1) await pool.selectOption({ index: 1 });
    }
    await snap(page, 'manage/marketplace/05', { focus: sweep });

    // The pool draft, with its two steps open; never sent.
    const form = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Propose a quick-buy pool', exact: true, level: 2 }) });
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
    await form.getByRole('button', { name: 'Add the pool to proposal' }).click();
    await confirmAdd(page);
    await page
      .getByRole('region', { name: 'Your proposal draft' })
      .getByRole('button', { name: 'Review proposal' })
      .click();
    const queue = page.getByRole('list', { name: 'Actions in this proposal' });
    await waitForVisible(queue, 'composer');
    await queue
      .getByRole('button', { name: /\d+ steps?/ })
      .first()
      .click()
      .catch(() => undefined);
    await snap(page, 'marketplace/pools/08', { focus: queue });

    // Two actions, then clear the draft.
    const ids = showcaseIdentities();
    await openComposer(page, tribe);
    while ((await draftCount(page)) > 0) {
      await queue.getByRole('listitem').first().getByRole('button', { name: 'Remove' }).click();
      const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /^Remove/ }));
      if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: 'Remove' }).click();
      await page.waitForTimeout(300);
    }
    for (const [to, amount] of [
      [ids['e2e-member-a'], '30'],
      [ids['e2e-member-b'], '20']
    ] as const) {
      await pickAction(page, /^Pay someone/, async (pay) => {
        await pay.getByLabel('Asset').selectOption({ label: 'XLM (Native)' });
        await waitForVisible(pay.getByText('Treasury balance:'), 'treasury balance');
        await pay.getByLabel('Recipient').fill(to);
        await pay.getByLabel('Amount').fill(amount);
      });
    }
    await snap(page, 'proposals/write/04', {
      markers: [{ label: 'the Add an action button', locator: page.getByRole('button', { name: 'Add an action' }) }],
      focus: queue
    });
    while ((await draftCount(page)) > 0) {
      await queue.getByRole('listitem').first().getByRole('button', { name: 'Remove' }).click();
      const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /^Remove/ }));
      if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: 'Remove' }).click();
      await page.waitForTimeout(300);
    }
  });

  test('the market: a listing to look at, the sell form, the buyer view and a Treasury purchase draft', async ({
    page,
    wallet
  }) => {
    const ids = showcaseIdentities();
    const state = showcaseState() as { retake?: Record<string, number> };
    await page.goto(market);
    await signInAs(page, wallet, 'e2e-member-a');
    let listed = state.retake?.listed;
    if (!listed) {
      const held = (await tokensOf(page.request, lamplight(), ids['e2e-member-a'])).sort((a, b) => a - b);
      listed = held[0]!;
      await page.goto(`${market}?sell=${listed}`);
      const form = page.getByRole('region', { name: 'Sell a token you own' });
      await waitForUi('token preselected', (timeout) =>
        expect(form.locator('#sell-token')).toHaveValue(String(listed), { timeout })
      );
      await snap(page, 'marketplace/sell/01', { focus: form });
      await snap(page, 'marketplace/sell/03', {
        markers: [{ label: 'the Listing ends choice', locator: form.getByRole('radio', { name: '7 days' }) }],
        focus: form.getByRole('radio', { name: '7 days' })
      });
      await form.locator('#sell-price').fill('40');
      await form.getByRole('button', { name: 'List for sale' }).click();
      const dialog = page.getByRole('dialog', { name: 'List your token for sale' });
      await dialog.getByRole('button', { name: 'Check' }).click();
      const send = dialog.getByRole('button', { name: 'Sign and send' });
      const done = dialog.getByRole('button', { name: 'Done' });
      await expect(async () => {
        if (await done.isEnabled().catch(() => false)) return;
        if (await send.isEnabled().catch(() => false)) await send.click();
        throw new Error('not listed yet');
      }).toPass({ timeout: 240_000, intervals: [2_000] });
      await done.click();
      saveShowcaseState((s) => {
        s.retake = { ...((s.retake as Record<string, number>) ?? {}), listed: listed! };
      });
    }

    await switchAccount(page, wallet, 'e2e-member-b', `${market}?kind=secondary`);
    await page.goto(`${market}?kind=secondary`);
    const listing = card(page, listed);
    await waitForVisible(listing, 'listing card', { governingS: 120 });
    await listing.getByRole('button', { name: 'Details' }).click();
    const buy = listing.getByRole('button', { name: /^Buy for / });
    await snap(page, 'marketplace/buy/02', { focus: buy, markers: [{ label: 'the Buy button', locator: buy }] });

    await switchAccount(page, wallet, 'e2e-founder', lamplight().path('admin/marketplace'));
    await page.goto(lamplight().path('admin/marketplace'));
    const purchase = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Propose a Treasury purchase', exact: true, level: 2 }) });
    await purchase.getByLabel('Listed token ID').fill(String(listed));
    await purchase.getByRole('button', { name: 'Add the purchase to proposal' }).click();
    await waitForVisible(page.getByText('Added to your proposal', { exact: true }), 'added');
    await page
      .getByRole('region', { name: 'Your proposal draft' })
      .getByRole('button', { name: 'Review proposal' })
      .click();
    const queue = page.getByRole('list', { name: 'Actions in this proposal' });
    await waitForVisible(queue, 'composer');
    await queue
      .getByRole('button', { name: /\d+ steps?/ })
      .first()
      .click()
      .catch(() => undefined);
    await snap(page, 'marketplace/treasury-purchases/03', { focus: queue });
    await queue.getByRole('listitem').first().getByRole('button', { name: 'Remove' }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /^Remove/ }));
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: 'Remove' }).click();
  });

  test('pages, loaded', async ({ page, wallet }) => {
    const ids = showcaseIdentities();
    await page.goto(`/dao/${SHOWCASE.slug}/proposals`);
    await signInAs(page, wallet, 'e2e-member-a');
    const open = page.getByRole('heading', { name: 'Open now' });
    const voting = await open
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (voting) await snap(page, 'proposals/vote/01', { focus: open });
    await snap(page, 'proposals/write/01', {
      markers: [
        { label: 'the New proposal button', locator: page.getByRole('button', { name: 'New proposal' }).first() }
      ]
    });

    await page.goto(`/dao/${SHOWCASE.slug}/members/${ids['e2e-member-a']}`);
    await waitForVisible(page.getByRole('heading', { name: 'Tokens' }), 'member profile');
    await snap(page, 'members/find/04', { top: true });
    const [first] = await tokensOf(page.request, lamplight(), ids['e2e-founder']);
    await page.goto(`/dao/${SHOWCASE.slug}/token/${first}`);
    await waitForVisible(page.getByRole('region', { name: 'Held by' }), 'token page');
    await snap(page, 'members/find/05', { focus: page.getByRole('region', { name: 'Held by' }) });

    const [given] = await tokensOf(page.request, lamplight(), ids['e2e-operator']);
    if (given !== undefined) {
      await page.goto(`/dao/${SHOWCASE.slug}/token/${given}`);
      const heldBy = page.getByRole('region', { name: 'Held by' });
      await waitForVisible(heldBy, 'held by');
      await snap(page, 'members/transfer/05', { focus: heldBy });
      // The second account's only lantern: the last-token warning.
      await switchAccount(page, wallet, 'e2e-operator', `${market}?sell=${given}`);
      await page.goto(`${market}?sell=${given}`);
      const form = page.getByRole('region', { name: 'Sell a token you own' });
      await waitForUi(
        'token preselected',
        (timeout) => expect(form.locator('#sell-token')).toHaveValue(String(given), { timeout }),
        { governingS: 60 }
      );
      await form.locator('#sell-price').fill('40');
      const last = form.getByText(/This is your last token in this tribe/);
      await waitForVisible(last, 'last token warning');
      await snap(page, 'marketplace/sell/04', { markers: [{ label: 'the last token warning', locator: last }] });
    }

    await switchAccount(page, wallet, 'e2e-member-b', `/dao/${SHOWCASE.slug}/members/${ids['e2e-member-b']}`);
    await page.goto(`/dao/${SHOWCASE.slug}/members/${ids['e2e-member-b']}`);
    const delegated = page.getByText('Delegated', { exact: true });
    await waitForVisible(delegated, 'delegated row', { governingS: 60 });
    await snap(page, 'members/delegate/05', { focus: delegated });

    // The home page, at the proposals, while the lantern walk is open.
    await page.goto(`/dao/${SHOWCASE.slug}`);
    if (voting) {
      const proposals = page.getByRole('heading', { name: 'Proposals', exact: true }).first();
      await waitForUi(
        'home shows the open proposal',
        (timeout) => expect(page.getByText('Hold an evening lantern walk').first()).toBeVisible({ timeout }),
        { governingS: 60 }
      );
      await snap(page, 'home/showcase', { focus: proposals });
    }
  });

  test('the platform page, scan finished', async ({ page }) => {
    await page.goto('/platform');
    await waitForUi(
      'platform scan finished',
      (timeout) =>
        expect(
          page
            .getByText(/^Checked (\d+) of \1\b/)
            .or(page.getByText(/^Checked all/))
            .first()
        ).toBeVisible({ timeout }),
      { governingS: 300 }
    ).catch(() => undefined);
    await snap(page, 'platform/operators/02', { focus: page.getByRole('heading', { name: 'Shared storage' }) });
  });

  test('the next auction, after settling the ended one', async ({ page, wallet }) => {
    await page.goto(`/dao/${SHOWCASE.slug}/auctions`);
    await signInAs(page, wallet, 'e2e-operator');
    const settle = page.getByRole('button', { name: 'Settle and start the next auction' });
    if (await settle.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await settle.click();
      await waitForVisible(page.getByText('Auction settled', { exact: true }), 'settled', { governingS: 60 });
      await page.reload();
    }
    await waitForVisible(page.getByText('Live', { exact: true }), 'live auction', { governingS: 90 });
    await snap(page, 'auctions/settle/04', { top: true });
  });
});
