import type { Page } from '@playwright/test';

import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { lamplight, saveShowcaseState, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';
import { confirmAdd, submitProposal, writeAndReview } from '../src/w09/proposals.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: manage/auction, auctions/settings, manage/token, manage/marketplace (fee, pause), manage/governance
 * and manage/profile. Each change starts on its Manage page and goes to a vote as a proposal of its
 * own (docs/qa/SHOWCASE_TRIBE.md, the ten proposals).
 */
// The workshop lead proposes here; the founder votes, queues and executes in 90-drive (its own process,
// its own account), so the ten-minute voting windows never close while this spec is still drafting.
const PROPOSER = 'e2e-member-a';
const dock = (page: Page) => page.getByRole('region', { name: 'Your proposal draft' });

async function propose(page: Page, wallet: E2ESigner, key: string, title: string, why: string, actions: number) {
  await dock(page).getByRole('button', { name: 'Review proposal' }).click();
  await writeAndReview(page, { title, why, actions });
  const id = await submitProposal(page, wallet, PROPOSER, actions);
  saveShowcaseState((state) => {
    state.proposals = { ...(state.proposals ?? {}), [key]: id };
  });
}

const done = (key: string) => Boolean(showcaseState().proposals?.[key]);

test.describe.serial('Lamplight: Manage', () => {
  test.beforeEach(async ({ page, wallet }) => {
    showcaseIdentities();
    test.setTimeout(10 * 60_000);
    await page.goto(lamplight().path('admin'));
    await signInAs(page, wallet, PROPOSER);
  });

  test('auction: lower the starting price', async ({ page, wallet }) => {
    test.skip(done('auction'), 'proposed already');
    const tribe = lamplight();
    await page.goto(tribe.path('admin/auction'));
    const now = page.getByRole('region', { name: 'Auction now' });
    await waitForVisible(now.getByText('Running'), 'auction running');
    await snap(page, 'manage/auction/01', { focus: now });
    await snap(page, 'auctions/settings/01', { focus: now });
    const change = page.getByRole('region', { name: 'Change auction settings' });
    const price = change.getByRole('textbox', { name: 'Starting price' });
    await price.fill('10');
    await snap(page, 'manage/auction/02', { markers: [{ label: 'the Starting price field', locator: price }] });
    await snap(page, 'auctions/settings/02', { markers: [{ label: 'the Starting price field', locator: price }] });
    const cancel = change.getByRole('checkbox', { name: /^Also cancel the current auction/ });
    const resume = change.getByRole('radio', { name: 'Resume auctions' });
    await expect(resume).toBeChecked();
    await snap(page, 'manage/auction/03', {
      markers: [
        { label: 'the Also cancel the current auction checkbox', locator: cancel },
        { label: 'the Resume auctions choice', locator: resume }
      ]
    });
    await snap(page, 'auctions/settings/03', { markers: [{ label: 'the Resume auctions choice', locator: resume }] });
    const add = change.getByRole('button', { name: 'Add 3 steps to proposal' });
    const plan = change.getByRole('heading', { name: /If the proposal passes/ }).first();
    await snap(page, 'manage/auction/04', { focus: plan });
    await snap(page, 'auctions/settings/04', { focus: plan });
    await snap(page, 'manage/auction/05', { markers: [{ label: 'the Add 3 steps to proposal button', locator: add }] });
    await snap(page, 'auctions/settings/05', {
      markers: [{ label: 'the Add 3 steps to proposal button', locator: add }]
    });
    await add.click();
    await confirmAdd(page);
    await propose(
      page,
      wallet,
      'auction',
      'Lower the auction starting price',
      'A lower starting price lets more people bid on their first lantern. This pauses the auction, sets the starting price to 10 XLM and starts it again.',
      3
    );
  });

  test('mint: two lanterns for the workshop helpers', async ({ page, wallet }) => {
    test.skip(done('mint'), 'proposed already');
    const ids = showcaseIdentities();
    await page.goto(lamplight().path('admin/token'));
    await waitForVisible(page.getByText('Mint by vote').first(), 'mint page');
    await snap(page, 'manage/token/01', { top: true });
    await page.getByRole('textbox', { name: 'Recipient 1' }).fill(ids['e2e-member-a']);
    await page
      .getByRole('spinbutton', { name: /Tokens/ })
      .first()
      .fill('1');
    await page.getByRole('button', { name: 'Add recipient' }).click();
    await page.getByRole('textbox', { name: 'Recipient 2' }).fill(ids['e2e-member-b']);
    await page
      .getByRole('spinbutton', { name: /Tokens/ })
      .nth(1)
      .fill('1');
    await snap(page, 'manage/token/02', { focus: page.getByRole('textbox', { name: 'Recipient 1' }) });
    const add = page.getByRole('button', { name: 'Add to proposal' });
    await snap(page, 'manage/token/03', { markers: [{ label: 'the Add to proposal button', locator: add }] });
    await add.click();
    await confirmAdd(page);
    await propose(
      page,
      wallet,
      'mint',
      'Mint two lanterns for the workshop helpers',
      'Two members helped run the first workshop. This gives each of them one lantern token, so they have a vote in what we make next.',
      1
    );
  });

  test('market: set the resale fee', async ({ page, wallet }) => {
    test.skip(done('fee'), 'proposed already');
    await page.goto(lamplight().path('admin/marketplace'));
    await waitForVisible(page.getByText('The market is open'), 'market page');
    await snap(page, 'manage/marketplace/01', { top: true });
    const setting = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: 'Change the resale fee' }) })
      .filter({ has: page.getByRole('button', { name: 'Add to proposal' }) })
      .last();
    const fee = setting.getByRole('textbox', { name: 'Resale fee (%)' });
    await fee.fill('2');
    await snap(page, 'manage/marketplace/02', {
      markers: [
        { label: 'the Resale fee field', locator: fee },
        { label: 'the Add to proposal button', locator: setting.getByRole('button', { name: 'Add to proposal' }) }
      ]
    });
    const pause = page.getByRole('heading', { name: /^(Pause the market|Reopen the market)$/ }).first();
    await snap(page, 'manage/marketplace/03', { focus: pause });
    await setting.getByRole('button', { name: 'Add to proposal' }).click();
    await confirmAdd(page);
    await waitForVisible(dock(page), 'draft bar');
    await snap(page, 'manage/marketplace/06', {
      markers: [
        { label: 'the Review proposal button', locator: dock(page).getByRole('button', { name: 'Review proposal' }) }
      ]
    });
    await propose(
      page,
      wallet,
      'fee',
      'Set the resale fee to 2%',
      'When a member resells a lantern, 2% of the price goes to the shared treasury. It helps pay for materials, and the seller keeps the rest.',
      1
    );
  });

  test('voting rules: quorum and safety delay', async ({ page, wallet }) => {
    test.skip(done('rules'), 'proposed already');
    await page.goto(lamplight().path('admin/governance'));
    await waitForVisible(page.getByRole('region', { name: 'Quorum' }), 'voting rules');
    await snap(page, 'manage/governance/01', { top: true });
    await snap(page, 'manage/governance/02', {
      focus: page.getByRole('heading', { name: /How votes are counted/ }).first()
    });
    const quorum = page.getByRole('region', { name: 'Quorum' });
    const box = quorum.getByRole('spinbutton', { name: /^Quorum/ });
    await box.fill('15');
    await snap(page, 'manage/governance/03', { markers: [{ label: 'the Quorum field', locator: box }] });
    await quorum.getByRole('button', { name: 'Add to proposal' }).click();
    await confirmAdd(page);
    const delay = page.getByRole('region', { name: /Safety delay/ });
    const minutes = delay.getByRole('spinbutton', { name: 'Minutes' });
    await minutes.fill('6');
    await delay.getByRole('button', { name: 'Add to proposal' }).click();
    await confirmAdd(page);
    await waitForUi('safety delay in the draft', (timeout) =>
      expect(delay.getByText('In your proposal')).toBeVisible({ timeout })
    );
    await snap(page, 'manage/governance/04', { focus: delay });
    await snap(page, 'manage/governance/05', {
      markers: [
        { label: 'the Review proposal button', locator: dock(page).getByRole('button', { name: 'Review proposal' }) }
      ]
    });
    await propose(
      page,
      wallet,
      'rules',
      'Raise the quorum to 15%',
      'More of us take part in votes now, so a decision should need more of us. This raises the quorum to 15% and gives one more minute before a passed proposal can run.',
      2
    );
  });

  test('profile: update the profile', async ({ page, wallet }) => {
    test.skip(done('profile'), 'proposed already');
    await page.goto(lamplight().path('admin/profile'));
    const description = page.getByRole('textbox', { name: 'Description' });
    await waitForUi('profile loaded', (timeout) => expect(description).not.toHaveValue('', { timeout }));
    await snap(page, 'manage/profile/01', { top: true });
    const name = page.getByRole('textbox', { name: 'Name', exact: true });
    await name.fill('Lamplight Circle');
    await snap(page, 'manage/profile/03', { markers: [{ label: 'the Name field', locator: name }] });
    await description.fill(
      `${await description.inputValue()}\n\nWorkshops run every two weeks. New members are welcome, and no experience is needed.`
    );
    await snap(page, 'manage/profile/04', { focus: description });
    const plan = page.getByRole('heading', { name: 'If the proposal passes, it will' });
    await snap(page, 'manage/profile/05', { focus: plan });
    const add = page.getByRole('button', { name: /^Add \d+ actions? to proposal$/ }).first();
    await snap(page, 'manage/profile/06', { markers: [{ label: 'the Add to proposal button', locator: add }] });
    // The story keeps the name: only the profile goes to the vote.
    await name.fill('Lamplight');
    await page
      .getByRole('button', { name: /^Add 1 action to proposal$/ })
      .first()
      .click();
    await confirmAdd(page);
    await propose(
      page,
      wallet,
      'profile',
      "Update the circle's profile",
      'This adds a line to our description about when workshops run and that newcomers are welcome.',
      1
    );
  });
});
