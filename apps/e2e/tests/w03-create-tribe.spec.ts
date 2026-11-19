import type { Page } from '@playwright/test';

import { expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import {
  choose,
  createTribe,
  fillCreateForm,
  MEMBERSHIP_RULES,
  MEMBERSHIP_TYPES,
  type MembershipType,
  reviewRow,
  runTag,
  setCheckbox,
  signIn,
  VOTING_PACES
} from '../src/tribe.ts';
import { waitForVisible } from '../src/waits.ts';

/**
 * W03 · Create a tribe through the Identity, Membership, Voting and Review steps, and deploy (§3.4).
 * @matrix covers the form at every viewport and theme: every membership type, both membership
 * rules, every voting pace, the vote source choice, validation and the signed-out Create state. It
 * never signs. @chain deploys an auction tribe and a fixed-price tribe with claim lists.
 */

const continueTo = (page: Page, section: string) => page.getByRole('button', { name: `Continue to ${section}` });
const advanced = (page: Page, section: string) =>
  page.locator(`section#${section}`).getByRole('button', { name: 'Advanced settings' });

/** What each membership type creates, as Advanced settings and Review show it. */
const MODULES: Record<MembershipType, { auction: boolean; market: boolean; claims: boolean }> = {
  auction: { auction: true, market: false, claims: false },
  'auction-resale': { auction: true, market: true, claims: false },
  'fixed-price': { auction: false, market: true, claims: false },
  invite: { auction: false, market: false, claims: true }
};

test.describe('W03 create form', { tag: '@matrix' }, () => {
  test('identity checks its fields before Membership opens', async ({ page }) => {
    await page.goto('/create');
    await waitForVisible(page.getByLabel('Tribe name'), 'Identity section');
    await expect(page.getByText(/Saved on this browser as you go · Testnet/)).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Nothing filled in: Continue names the problems and focuses the first one.
    await continueTo(page, 'Membership').click();
    await expect(page.getByRole('alert').filter({ hasText: /need(s)? attention/ })).toBeVisible();
    await expect(page.getByLabel('Tribe name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Tribe name')).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Membership', exact: true })).toHaveCount(0);

    // The symbol and link follow the name until you type your own.
    await page.getByLabel('Tribe name').fill('E2E W03 Form Check');
    await expect(page.getByLabel('Symbol')).not.toHaveValue('');
    await expect(page.getByLabel('Link', { exact: true })).toHaveValue(/^e2e-w03-form-check/);
    await expect(page.getByText('Filled in from the name. Type to choose your own.')).toBeVisible();

    // A link with capitals and spaces is refused.
    await page.getByLabel('Link', { exact: true }).fill('no');
    await continueTo(page, 'Membership').click();
    await expect(page.getByLabel('Link', { exact: true })).toHaveAttribute('aria-invalid', 'true');

    await page.getByRole('textbox', { name: 'Description' }).fill('A walkthrough tribe on testnet.');
    await page.getByLabel('Link', { exact: true }).fill(`e2e-w03-form-${runTag()}`);
    await continueTo(page, 'Membership').click();
    await waitForVisible(page.getByRole('heading', { name: 'Membership', exact: true }), 'Membership section');
    await expectNoHorizontalScroll(page);
  });

  test('every membership type, rule and pace reaches Review', async ({ page }) => {
    await fillCreateForm(page, { name: 'E2E W03 Form Types', slug: `e2e-w03-types-${runTag()}`, type: 'auction' });
    await expectNoHorizontalScroll(page);

    // Every section stays on the page, so Review follows each choice above it.
    await advanced(page, 'membership').click();
    const membership = page.locator('section#membership');
    for (const type of Object.keys(MEMBERSHIP_TYPES) as MembershipType[]) {
      await choose(page, 'How do people join?', MEMBERSHIP_TYPES[type]);
      const modules = MODULES[type];
      await expect(membership.getByText('Auctions', { exact: true })).toHaveCount(modules.auction ? 1 : 0);
      await expect(membership.getByText('Market', { exact: true })).toHaveCount(modules.market ? 1 : 0);
      const claims = membership.getByRole('checkbox', { name: /Let members claim tokens from published lists/ });
      if (modules.claims) await expect(claims).toBeChecked();
      else await expect(claims).not.toBeChecked();
      await expect(reviewRow(page, 'Membership')).toHaveText(MEMBERSHIP_TYPES[type]);
      await expect(reviewRow(page, 'Auctions')).toHaveText(modules.auction ? /^On at launch/ : /^None/);
      await expect(reviewRow(page, 'Market')).toHaveText(modules.market ? /^On at launch/ : /^None/);
      await expect(reviewRow(page, 'Claim lists')).toHaveText(modules.claims ? /^On\./ : /^None/);
      await expectNoHorizontalScroll(page);
    }
    // Invite only with claims switched off would leave no way to join; Review says so.
    await choose(page, 'How do people join?', MEMBERSHIP_TYPES['fixed-price']);
    await setCheckbox(membership, /Let members claim tokens/, true);
    await expect(reviewRow(page, 'Claim lists')).toHaveText(/^On\./);

    // Both membership rules, and a custom mix from the switches.
    await choose(page, 'Who can hold a membership?', MEMBERSHIP_RULES.club);
    await expect(reviewRow(page, 'Who can hold one')).toHaveText(/only with the tribe’s approval/);
    await expect(page.getByText(/While memberships are locked, members can't resell on the market/)).toBeVisible();
    await setCheckbox(membership, /recover a membership/, false);
    await expect(page.getByText('Your own mix of membership rules, set in Advanced settings below.')).toBeVisible();
    await choose(page, 'Who can hold a membership?', MEMBERSHIP_RULES.open);
    await expect(reviewRow(page, 'Who can hold one')).toHaveText('Members can sell, give or delegate their tokens freely.');

    // Every voting pace; Super fast is testnet-only and labelled so.
    const voting = page.getByRole('radiogroup', { name: 'How fast should decisions happen?' });
    await expect(voting.getByRole('radio', { name: /^Super fast/ })).toBeVisible();
    for (const pace of Object.values(VOTING_PACES)) {
      await choose(page, 'How fast should decisions happen?', pace);
      await expect(reviewRow(page, 'Voting pace')).toHaveText(pace);
    }
    // A custom timing turns the pace into "Custom".
    await choose(page, 'How fast should decisions happen?', VOTING_PACES['super-fast']);
    await expect(reviewRow(page, 'Voting')).toHaveText('Opens 5 minutes after a proposal, stays open 10 minutes.');
    await advanced(page, 'voting').click();
    await page.locator('section#voting').getByLabel('Votes needed to propose').fill('2');
    await expect(reviewRow(page, 'Voting pace')).toHaveText('Custom');
    await expect(reviewRow(page, 'Rules')).toHaveText(/2 votes needed to propose/);
    await expectNoHorizontalScroll(page);
  });

  test('votes are counted by the token unless an approved source is chosen', async ({ page }) => {
    await fillCreateForm(page, { name: 'E2E W03 Form Votes', slug: `e2e-w03-votes-${runTag()}`, type: 'auction' });
    const counting = page.getByRole('radiogroup', { name: 'How are votes counted?' });
    await expect(counting.getByRole('radio', { name: /^Token-weighted/ })).toBeChecked();
    await expect(counting.getByRole('radio', { name: /^Neural Quorum Governance/ })).toBeDisabled();
    await expect(reviewRow(page, 'Votes counted by')).toHaveText("The tribe's token: one membership, one vote.");

    // The picker shows only when the platform has approved a vote source (the Manager's list).
    const approved = (await (await page.request.get('/api/platform/vote-sources')).json()) as {
      sources?: { source: string; name: string }[];
    };
    await advanced(page, 'voting').click();
    const picker = page.locator('section#voting').getByText('Vote source', { exact: true });
    if (!approved.sources?.length) {
      await expect(picker).toHaveCount(0);
      test.info().annotations.push({ type: 'coverage', description: 'No approved vote source on this Manager.' });
      return;
    }
    await page.locator('section#voting #voteSource').click();
    await page.getByRole('option', { name: approved.sources[0].name }).click();
    await expect(page.getByText("This contract decides every member's voting power")).toBeVisible();
    await expect(reviewRow(page, 'Votes counted by')).toHaveText(/Cannot be changed after creation\./);
    await choose(page, 'How are votes counted?', 'Token-weighted');
    await expect(reviewRow(page, 'Votes counted by')).toHaveText("The tribe's token: one membership, one vote.");
  });

  test('Create waits for a signed-in wallet', async ({ page }) => {
    await fillCreateForm(page, { name: 'E2E W03 Form Signed Out', slug: `e2e-w03-out-${runTag()}`, type: 'invite' });
    await expect(page.getByRole('button', { name: 'Create tribe' })).toBeDisabled();
    await expect(page.getByText('Connect your wallet when you’re ready to create it.')).toBeVisible();
    await expect(reviewRow(page, 'Launch admin')).toHaveText('Connect your wallet when ready');
    await expectNoHorizontalScroll(page);
  });
});

test.describe('W03 create and deploy', { tag: '@chain' }, () => {
  test.describe.configure({ mode: 'serial' });

  test('deploys an auction tribe into Setup', async ({ page, wallet }) => {
    requireVerifiedManager();
    test.setTimeout(8 * 60_000);
    const tag = runTag();
    await signIn(page);
    await fillCreateForm(page, {
      name: `E2E W03 Auction ${tag}`,
      slug: `e2e-w03-auc-${tag}`,
      type: 'auction',
      pace: 'super-fast'
    });
    await expect(reviewRow(page, 'Launch admin')).toHaveText(
      `${wallet.address!.slice(0, 4)}…${wallet.address!.slice(-4)} (you)`
    );
    await expect(page.getByText('You sign once to create it in Setup. You launch it later, when it’s ready.')).toBeVisible();
    const daoId = await createTribe(page, wallet);
    test.info().annotations.push({ type: 'tribe', description: `auction ${daoId} e2e-w03-auc-${tag}` });

    await page.goto(`/dao/${daoId}/setup`);
    await waitForVisible(page.getByRole('heading', { name: 'Set up and launch' }), 'setup page');
    await waitForVisible(page.getByRole('heading', { name: 'Required to launch' }), 'launch admin view');
    const review = page.getByRole('region', { name: 'Review (optional)' });
    await expect(review.getByRole('heading', { name: /^Auctions :/ })).toBeVisible();
    await expect(review.getByText('5 minutes each · starts at 1 XLM')).toBeVisible();
    await expect(review.getByText(/Super fast: votes open after 5 minutes/)).toBeVisible();
    await expect(review.getByRole('heading', { name: /^Market :/ })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /^Start auctions/ })).toBeChecked();
    await expectNoHorizontalScroll(page);
  });

  test('deploys a fixed-price tribe with claim lists into Setup', async ({ page, wallet }) => {
    requireVerifiedManager();
    test.setTimeout(8 * 60_000);
    const tag = runTag();
    await signIn(page);
    await fillCreateForm(page, {
      name: `E2E W03 Fixed ${tag}`,
      slug: `e2e-w03-fix-${tag}`,
      type: 'fixed-price',
      rules: 'club',
      pace: 'super-fast'
    });
    await advanced(page, 'membership').click();
    await setCheckbox(page.locator('section#membership'), /Let members claim tokens/, true);
    await expect(reviewRow(page, 'Claim lists')).toHaveText(/^On\./);
    const daoId = await createTribe(page, wallet);
    test.info().annotations.push({ type: 'tribe', description: `fixed-price ${daoId} e2e-w03-fix-${tag}` });

    await page.goto(`/dao/${daoId}/setup`);
    await waitForVisible(page.getByRole('heading', { name: 'Required to launch' }), 'launch admin view');
    const review = page.getByRole('region', { name: 'Review (optional)' });
    await expect(review.getByRole('heading', { name: /^Market :/ })).toBeVisible();
    await expect(review.getByRole('heading', { name: /^Claims :/ })).toBeVisible();
    await expect(review.getByRole('heading', { name: /^Auctions :/ })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /^Open the market/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /^Start auctions/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});
