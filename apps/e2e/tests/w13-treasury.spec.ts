import type { Page } from '@playwright/test';

import { signedTransactions, signInAs } from '../src/connect.ts';
import { appliedTheme, expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { ensureTreasuryFunded, stroopsToXlm, xlmBalance } from '../src/treasury-fixture.ts';
import { loadW02Fixture } from '../src/w02-fixture.ts';
import { waitForIndexed, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * W13 · Treasury: balances, and a payout proposal made from the draft dock (§3.4).
 *
 * @matrix (every viewport × theme, nothing submitted): the signed-out page, a contribution checked
 * up to the signature and cancelled, and a payout added to the draft dock and opened in the
 * composer. @chain (desktop dark): a member adds XLM to the treasury, then proposes a payout from the
 * dock and the proposal reaches the read model. Voting on it is W07's job.
 *
 * Runs on the W02 fixture tribe "E2E Discover" (src/w02-fixture.ts).
 */

const tribe = loadW02Fixture();
const treasuryPath = `/dao/${tribe.slug}/treasury`;
const RUN = process.env.E2E_RUN_ID ?? String(Date.now());

const balances = (page: Page) => page.getByRole('region', { name: 'Treasury balances' });
const fundForm = (page: Page) => page.getByRole('region', { name: 'Add funds' });
const payoutForm = (page: Page) => page.getByRole('region', { name: 'Propose a payout' });
const dock = (page: Page) => page.getByRole('region', { name: 'Your proposal draft' });

/** The XLM balance as the page shows it ("1,234.5"), from the amount whose unit is XLM. */
async function shownXlm(page: Page) {
  const amount = balances(page).locator('p', { has: page.locator('span', { hasText: /^XLM$/ }) });
  const text = (await amount.first().innerText()).replace(/XLM/g, '').replace(/[,\s]/g, '');
  return text;
}

/** Same number, whatever trailing zeros the page keeps. */
const sameAmount = (a: string, b: string) => Number(a) === Number(b);

async function openTreasury(page: Page, theme?: string) {
  await page.goto(treasuryPath);
  if (theme) expect(await appliedTheme(page)).toBe(theme);
  await waitForVisible(page.getByRole('heading', { name: 'Treasury', level: 1 }), 'Treasury heading');
  await waitForVisible(balances(page).locator('span', { hasText: /^XLM$/ }).first(), 'XLM balance');
}

async function chooseAction(page: Page, label: 'Add funds' | 'Send funds') {
  await page.getByRole('radiogroup', { name: 'Treasury action' }).getByText(label, { exact: true }).click();
}

/** Fill the payout form and add it to the draft. */
async function addPayout(page: Page, recipient: string, amount: string) {
  await chooseAction(page, 'Send funds');
  const form = payoutForm(page);
  await form.getByLabel('Asset').selectOption('XLM');
  await form.getByLabel('Recipient').fill(recipient);
  await form.getByLabel('Amount').fill(amount);
  await form.getByRole('button', { name: 'Add the payout to proposal' }).click();
  // A payout is high risk, so it gets a second look before it joins the draft. Nothing is signed.
  const review = page.getByRole('dialog', { name: 'Add this to your proposal?' });
  await waitForVisible(review, 'high-risk review');
  await expect(review).toContainText(`Send ${amount} XLM to ${recipient}`);
  // BUG-W02-2: the warning names what a payout does.
  await expect(review).toContainText('Sends funds out of the treasury.');
  await review.getByRole('button', { name: 'Add to proposal' }).click();
  await waitForVisible(page.getByText('Added to your proposal', { exact: true }).first(), 'added toast');
}

/** The composer's Next: review, in the page on wide screens and in the action bar on phones. */
const nextButton = (page: Page) => page.getByRole('button', { name: 'Next: review' }).locator('visible=true').first();

/** From the Treasury page: a 1 XLM payout into the dock, then the composer, Review and Submit. */
async function draftAndSubmit(page: Page, recipient: string, title: string, why: string) {
  await addPayout(page, recipient, '1');
  await waitForVisible(dock(page), 'draft dock');
  await dock(page).getByRole('button', { name: 'Review proposal' }).click();
  await page.waitForURL(`**/dao/${tribe.slug}/proposals/create`);

  await waitForVisible(page.getByText('In this proposal (1 action)'), 'composer with the payout');
  await page.getByLabel('Title (required)').fill(title);
  await page.locator('textarea#description').fill(why);
  const next = nextButton(page);
  await waitForUi('proposal ready for review', (timeout) => expect(next).toBeEnabled({ timeout }), {
    governingS: 30
  });
  await next.click();

  const preview = page.getByRole('region', { name: 'Proposal preview' });
  await expect(preview.getByRole('heading', { name: title })).toBeVisible();
  await expect(preview).toContainText('If it passes, this runs');
  await page.getByRole('button', { name: 'Submit proposal' }).click();
  // BUG-W02-3: the confirmation is an alert dialog with a name.
  const confirm = page.getByRole('alertdialog', { name: 'Submit this proposal?' });
  await waitForVisible(confirm, 'confirm dialog');
  await confirm.getByRole('button', { name: 'Submit proposal' }).click();
}

test.describe('W13 treasury', { tag: '@matrix' }, () => {
  test.beforeAll(() => {
    // The payout form checks the amount against a verified balance, so the treasury needs some XLM.
    // Fixture setup by a direct transfer from the operator key; the flow itself is W13 @chain.
    if (ensureTreasuryFunded(tribe.treasury, 10_000_000n)) console.info('W13 fixture: topped up the treasury');
  });

  test('shows balances to anyone and asks to connect before acting', async ({ page, theme }) => {
    await openTreasury(page, theme);
    const onChain = stroopsToXlm(xlmBalance(tribe.treasury));
    await waitForUi('XLM balance matches the chain', (timeout) =>
      expect.poll(async () => sameAmount(await shownXlm(page), onChain), { timeout }).toBe(true)
    );
    await expect(balances(page)).toContainText(/\d funded assets?/);
    await expect(
      page.getByText('Funds the tribe holds together. They move only when a proposal passes.')
    ).toBeVisible();
    await expect(fundForm(page).getByRole('status').filter({ hasText: 'Connect your wallet' })).toHaveText(
      'Connect your wallet to add funds.'
    );
    await expect(fundForm(page).getByRole('button', { name: 'Review contribution' })).toBeDisabled();
    await chooseAction(page, 'Send funds');
    await expect(payoutForm(page).getByRole('status')).toHaveText('Connect your wallet to propose a payout.');
    await expect(payoutForm(page).getByRole('button', { name: 'Add the payout to proposal' })).toBeDisabled();
    // The treasury contract sits behind Technical details.
    await balances(page).getByText('Technical details').click();
    await expect(balances(page).getByText(tribe.treasury.slice(0, 4)).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Execution history' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('checks a contribution up to the signature, then cancels it', async ({ page, wallet }) => {
    await openTreasury(page);
    await signInAs(page, wallet, 'e2e-member-b');
    const form = fundForm(page);
    await waitForVisible(form.getByText('You can send'), 'wallet balance read');
    await form.getByLabel('Amount').fill('1');
    await form.getByRole('button', { name: 'Review contribution' }).click();
    await waitForUi(
      'contribution checked',
      (timeout) => expect(form.getByText('Checks passed. Review the exact transfer below.')).toBeVisible({ timeout }),
      { governingS: 30 }
    );
    await expect(form.getByRole('button', { name: 'Sign and send' })).toBeEnabled();
    await expectNoHorizontalScroll(page);
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(form.getByText('Review cancelled. Nothing was signed.')).toBeVisible();
    expect(signedTransactions(wallet, 'e2e-member-b')).toBe(0);
  });

  test('a payout goes into the draft dock and opens in the composer', async ({ page, wallet, identities }) => {
    await openTreasury(page);
    await signInAs(page, wallet, 'e2e-founder');
    await expect(dock(page)).toHaveCount(0);

    // More than the treasury holds is caught before it reaches the draft.
    await chooseAction(page, 'Send funds');
    await payoutForm(page).getByLabel('Asset').selectOption('XLM');
    await waitForVisible(payoutForm(page).getByText('Treasury balance:'), 'treasury balance in the form');
    await payoutForm(page).getByLabel('Recipient').fill(identities['e2e-member-b']!.address);
    await payoutForm(page).getByLabel('Amount').fill('100000000');
    await payoutForm(page).getByRole('button', { name: 'Add the payout to proposal' }).click();
    await expect(payoutForm(page).getByText(/This is more than the treasury holds/)).toBeVisible();
    await expect(dock(page)).toHaveCount(0);

    await addPayout(page, identities['e2e-member-b']!.address, '0.5');
    await waitForVisible(dock(page), 'draft dock');
    await expect(dock(page)).toContainText(/1\s*action waiting for a vote/);
    await expect(dock(page).getByText(/^Latest: /)).toBeVisible();
    await expectNoHorizontalScroll(page);

    await dock(page).getByRole('button', { name: 'Review proposal' }).click();
    await page.waitForURL(`**/dao/${tribe.slug}/proposals/create`);
    await waitForVisible(page.getByText('In this proposal (1 action)'), 'composer with the payout');
    await expectNoHorizontalScroll(page);
    // Written, up to the review: still no sideways scroll on a phone.
    await page.getByLabel('Title (required)').fill('W13 matrix payout');
    await page.locator('textarea#description').fill('Walkthrough W13, filled up to the review and not submitted.');
    await expectNoHorizontalScroll(page);
    await nextButton(page).click();
    await waitForVisible(page.getByRole('region', { name: 'Proposal preview' }), 'review step');
    await expectNoHorizontalScroll(page);
    expect(signedTransactions(wallet, 'e2e-founder')).toBe(0);
  });
});

type ProposalList = { items: { proposalId: string; proposalNumber: number; metadata: { title: string } }[] };

test.describe.serial('W13 treasury on chain', { tag: '@chain' }, () => {
  test.beforeAll(() => {
    requireVerifiedManager();
  });

  test('a member adds XLM to the treasury', async ({ page, wallet }) => {
    test.setTimeout(5 * 60_000);
    const before = xlmBalance(tribe.treasury);
    await openTreasury(page);
    await signInAs(page, wallet, 'e2e-member-a');
    const form = fundForm(page);
    await waitForVisible(form.getByText('You can send'), 'wallet balance read');
    await form.getByLabel('Amount').fill('10');
    await form.getByRole('button', { name: 'Review contribution' }).click();
    const send = form.getByRole('button', { name: 'Sign and send' });
    await waitForUi('contribution checked', (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 30 });
    await send.click();
    await waitForUi(
      'contribution confirmed',
      (timeout) => expect(form.getByText('Thank you. Your contribution is in the treasury.')).toBeVisible({ timeout }),
      { governingS: 60 }
    );
    expect(signedTransactions(wallet, 'e2e-member-a')).toBe(1);

    const after = xlmBalance(tribe.treasury);
    expect(after - before).toBe(100_000_000n);
    // The page refreshes its live balance after the confirmation.
    await waitForUi('balance shows the contribution', (timeout) =>
      expect.poll(async () => sameAmount(await shownXlm(page), stroopsToXlm(after)), { timeout }).toBe(true)
    );
  });

  test('the founder proposes a payout from the draft dock', async ({ page, wallet, identities }, testInfo) => {
    test.setTimeout(6 * 60_000);
    // One proposal per project: the Governor refuses a second identical proposal (BUG-W02-6).
    const title = `W13 payout ${RUN} ${testInfo.project.name}`;
    const why = `Walkthrough W13: send 1 XLM from the treasury. Run ${RUN}, ${testInfo.project.name}.`;
    const recipient = identities['e2e-member-b']!.address;
    await openTreasury(page);
    await signInAs(page, wallet, 'e2e-founder');
    await draftAndSubmit(page, recipient, title, why);

    await waitForUi(
      'proposal confirmed and opened',
      (timeout) =>
        expect(page).toHaveURL((url) => /^\/dao\/[^/]+\/proposals\/(?!create$)[^/]+$/.test(url.pathname), {
          timeout
        }),
      { governingS: 90 }
    );
    expect(signedTransactions(wallet, 'e2e-founder')).toBe(1);

    const list = await waitForIndexed<ProposalList>(
      page.request,
      {
        label: 'payout proposal in the read model',
        path: `/api/dao/${tribe.daoId}/proposals?limit=10`,
        predicate: (body) => body.items.some((item) => item.metadata.title === title)
      },
      { governingS: 0 }
    );
    expect(list.items.find((item) => item.metadata.title === title)).toBeTruthy();
    // BUG-W02-4: the page used to stay on "Loading your proposal".
    await waitForVisible(page.getByRole('heading', { name: title }).first(), 'proposal page title');

    // The draft is cleared once the proposal exists.
    await page.goto(treasuryPath);
    await waitForVisible(balances(page), 'treasury again');
    await expect(dock(page)).toHaveCount(0);

    // The same proposal again is refused before anything is signed, and says why.
    await draftAndSubmit(page, recipient, title, why);
    await waitForUi(
      'duplicate proposal refused',
      (timeout) => expect(page.getByText(/proposal already exists\./i).first()).toBeVisible({ timeout }),
      { governingS: 30 }
    );
    expect(signedTransactions(wallet, 'e2e-founder')).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/dao/${tribe.slug}/proposals/create$`));
  });
});
