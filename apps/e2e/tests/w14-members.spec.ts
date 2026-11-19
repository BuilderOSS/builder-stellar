import type { Locator, Page } from '@playwright/test';

import { signedTransactions, signInAs, topBarConnect, youButton } from '../src/connect.ts';
import { expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { waitForIndexed, waitForUi, waitForVisible } from '../src/waits.ts';
import {
  approvedFor,
  delegateOf,
  MEMBERS_ONLY_TRIBE,
  MEMBERS_TRIBE,
  ownerOf,
  resetMemberTribes,
  TOKENS,
  type Tribe
} from '../src/w11/fixtures.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';

/**
 * W14 · Members (§3.4): the directory, a profile, and the holder's own actions from a token page.
 *
 * @chain, in order:
 *   - on "E2E Members" (every switch off): e2e-member-a delegates to e2e-member-b from its own
 *     profile, then votes for itself again; sends a token to e2e-member-b, who sends it back;
 *     approves e2e-member-b for one token with a short approval, then cancels it;
 *   - on "E2E Members Only" (members-only delegation on): delegating to a wallet that holds no token
 *     is refused before signing, with the reason; delegating to a member works, then back.
 *
 * @matrix: the directory and a profile at every viewport and theme, and the holder's form up to the
 * transaction review (nothing signed).
 */

const MEMBER = 'e2e-member-a';
const OTHER = 'e2e-member-b';
const FOUNDER = 'e2e-founder';
const [FIRST, SECOND] = TOKENS.members.memberA;

type Member = { address: string; owned_token_count: string; voting_power: string; delegated_to: string | null };
type Profile = { item: Member | null };
type TokenBody = { owner: string | null; indexedOwner: string | null };

/* ---------- Page parts and reads ---------- */

const yourToken = (page: Page) => page.getByRole('region', { name: 'Your token' });
const directoryRow = (page: Page, address: string) =>
  page.getByRole('listitem').filter({ has: page.locator(`span[title="${address}"]`) });

function memberIndexed(page: Page, tribe: Tribe, address: string, label: string, predicate: (m: Member) => boolean) {
  return waitForIndexed<Profile>(
    page.request,
    {
      label,
      path: `/api/dao/${tribe.daoId}/members?address=${address}`,
      predicate: (b) => Boolean(b.item && predicate(b.item))
    },
    { governingS: 0 }
  );
}

function tokenIndexed(page: Page, tribe: Tribe, tokenId: number, owner: string, label: string) {
  return waitForIndexed<TokenBody>(
    page.request,
    {
      label,
      path: `/api/dao/${tribe.daoId}/tokens/${tokenId}`,
      predicate: (b) => b.owner === owner && b.indexedOwner === owner
    },
    { governingS: 0 }
  );
}

async function openToken(page: Page, tribe: Tribe, tokenId: number, query = '') {
  await page.goto(`/dao/${tribe.slug}/token/${tokenId}${query}`);
  await waitForVisible(yourToken(page), `Your token controls on #${tokenId}`);
  return yourToken(page);
}

/** Disconnect from the You sheet, as a member handing the device to another would. */
async function signOut(page: Page) {
  await youButton(page).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await waitForVisible(topBarConnect(page), 'signed out');
}

async function choose(controls: Locator, option: string) {
  await controls
    .getByRole('radiogroup', { name: 'What do you want to do?' })
    .getByText(option, { exact: true })
    .click();
}

/** Review, then Sign and send; waits for the confirmation line. One signature. */
async function reviewAndSign(controls: Locator, wallet: E2ESigner, identity: string, summary: RegExp) {
  await controls.getByRole('button', { name: 'Review' }).click();
  const review = controls.getByLabel('Transaction review');
  await waitForVisible(review, 'transaction review', { governingS: 30 });
  await expect(review).toContainText(summary);
  const before = signedTransactions(wallet, identity);
  await review.getByRole('button', { name: 'Sign and send' }).click();
  await waitForVisible(
    controls.getByText('Confirmed. Ownership and votes can take a moment to update here.'),
    'holder action confirmed',
    { governingS: 60 }
  );
  expect(signedTransactions(wallet, identity) - before).toBe(1);
  await controls.getByRole('button', { name: 'Do something else' }).click();
}

/* ---------- @chain ---------- */

test.describe.serial('W14 members', { tag: '@chain' }, () => {
  let ids: Record<string, string> = {};
  const tribe = MEMBERS_TRIBE;

  test.beforeAll(async ({ identities }) => {
    requireVerifiedManager();
    test.setTimeout(10 * 60_000);
    ids = Object.fromEntries(Object.values(identities).map(({ name, address }) => [name, address]));
    const changed = resetMemberTribes(ids);
    if (changed.length) console.info(`W14 fixture reset: ${changed.join('; ')}`);
  });

  test.beforeEach(() => test.setTimeout(10 * 60_000));

  test('W14 delegates from your own profile, then votes for yourself again', async ({ page, wallet }) => {
    const member = ids[MEMBER]!;
    const other = ids[OTHER]!;
    await memberIndexed(page, tribe, member, 'fixture: member votes for itself', (m) => m.delegated_to === member);
    const otherBefore = await memberIndexed(page, tribe, other, 'other member indexed', () => true);
    const otherVotes = Number(otherBefore.item!.voting_power);

    await page.goto(`/dao/${tribe.slug}/members/${member}`);
    await signInAs(page, wallet, MEMBER);
    await waitForVisible(page.getByRole('heading', { name: 'You', level: 1 }), 'your profile');
    await page.getByRole('link', { name: 'Delegate votes' }).click();
    await expect(page).toHaveURL(/action=delegate/);
    const controls = yourToken(page);
    await waitForVisible(controls.getByLabel('Delegate address'), 'delegate form opened from the profile');
    await controls.getByLabel('Delegate address').fill(other);
    await reviewAndSign(controls, wallet, MEMBER, /deleg/i);

    expect(delegateOf(tribe, member)).toBe(other);
    await memberIndexed(
      page,
      tribe,
      other,
      'delegated votes indexed',
      (m) => Number(m.voting_power) === otherVotes + 2
    );
    await memberIndexed(
      page,
      tribe,
      member,
      'delegation indexed',
      (m) => m.delegated_to === other && m.voting_power === '0'
    );
    await page.goto(`/dao/${tribe.slug}/members`);
    await waitForVisible(directoryRow(page, member).getByText(/^Votes go to /), 'directory shows where the votes go');
    await page.goto(`/dao/${tribe.slug}/members/${member}`);
    await waitForVisible(page.getByText('Delegated', { exact: true }), 'profile shows the delegate');

    const again = await openToken(page, tribe, FIRST, '?action=delegate');
    await again.getByRole('button', { name: 'Vote for myself again' }).click();
    await expect(again.getByLabel('Delegate address')).toHaveValue(member);
    await reviewAndSign(again, wallet, MEMBER, /deleg/i);
    expect(delegateOf(tribe, member)).toBe(member);
    await memberIndexed(
      page,
      tribe,
      member,
      'votes back with the member',
      (m) => m.delegated_to === member && m.voting_power === '2'
    );
  });

  test('W14 sends a token to another member, who sends it back', async ({ page, wallet }) => {
    const member = ids[MEMBER]!;
    const other = ids[OTHER]!;
    await page.goto(`/dao/${tribe.slug}/token/${SECOND}`);
    await signInAs(page, wallet, MEMBER);
    const controls = await openToken(page, tribe, SECOND);
    await choose(controls, 'Send');
    await controls.getByLabel('Recipient address').fill(other);
    await reviewAndSign(controls, wallet, MEMBER, /transfer|send/i);
    expect(ownerOf(tribe, SECOND)).toBe(other);
    await tokenIndexed(page, tribe, SECOND, other, `#${SECOND} indexed with the recipient`);
    await memberIndexed(page, tribe, other, 'recipient holds 2', (m) => m.owned_token_count === '2');

    // The holder controls are the new holder's now.
    await page.reload();
    await expect(yourToken(page)).toHaveCount(0);

    await signOut(page);
    await signInAs(page, wallet, OTHER);
    const back = await openToken(page, tribe, SECOND);
    await choose(back, 'Send');
    await back.getByLabel('Recipient address').fill(member);
    await reviewAndSign(back, wallet, OTHER, /transfer|send/i);
    expect(ownerOf(tribe, SECOND)).toBe(member);
    await tokenIndexed(page, tribe, SECOND, member, `#${SECOND} back with the member`);
  });

  test('W14 approves another wallet for one token, then cancels the approval', async ({ page, wallet }) => {
    const other = ids[OTHER]!;
    await page.goto(`/dao/${tribe.slug}/token/${FIRST}`);
    await signInAs(page, wallet, MEMBER);
    const controls = await openToken(page, tribe, FIRST);
    await choose(controls, 'Approve');
    await controls.getByLabel('Spender address').fill(other);
    await controls.getByRole('button', { name: 'Use a short approval (about 10 minutes)' }).click();
    await expect(controls.getByLabel('Approval ends at network position')).toHaveValue(/^\d+$/);
    await reviewAndSign(controls, wallet, MEMBER, new RegExp(`#${FIRST}`));
    expect(approvedFor(tribe, FIRST)).toBe(other);

    await choose(controls, 'Cancel token approval');
    // The live approval is shown before it is cancelled (BUG-W11-2).
    await waitForVisible(controls.getByText('Approved now'), 'current approval shown');
    await reviewAndSign(controls, wallet, MEMBER, /Revoke the single-token approval/);
    expect(approvedFor(tribe, FIRST)).toBeNull();
  });

  test('W14 members-only delegation refuses a non-member before signing, and allows a member', async ({
    page,
    wallet
  }) => {
    const only = MEMBERS_ONLY_TRIBE;
    const member = ids[MEMBER]!;
    const [tokenId] = TOKENS.membersOnly.memberA;
    await page.goto(`/dao/${only.slug}/token/${tokenId}`);
    await signInAs(page, wallet, MEMBER);
    const controls = await openToken(page, only, tokenId!, '?action=delegate');
    await expect(controls.getByText('This tribe only lets you delegate to members', { exact: false })).toBeVisible();

    // e2e-member-b holds no token here.
    await controls.getByLabel('Delegate address').fill(ids[OTHER]!);
    const before = signedTransactions(wallet, MEMBER);
    await controls.getByRole('button', { name: 'Review' }).click();
    await waitForVisible(
      controls.getByText(
        'This tribe only lets you delegate to members: someone who holds a token. Tokens listed for sale don’t count.'
      ),
      'members-only refusal'
    );
    await expect(controls.getByLabel('Transaction review')).toHaveCount(0);
    expect(signedTransactions(wallet, MEMBER) - before).toBe(0);

    await controls.getByLabel('Delegate address').fill(ids[FOUNDER]!);
    await reviewAndSign(controls, wallet, MEMBER, /deleg/i);
    expect(delegateOf(only, member)).toBe(ids[FOUNDER]);

    await controls.getByRole('button', { name: 'Vote for myself again' }).click();
    await reviewAndSign(controls, wallet, MEMBER, /deleg/i);
    expect(delegateOf(only, member)).toBe(member);
  });
});

/* ---------- @matrix ---------- */

test.describe('W14 member directory and profiles', { tag: '@matrix' }, () => {
  const tribe = MEMBERS_TRIBE;

  test('the directory lists members with tokens and votes, and opens a profile', async ({ page, identities }) => {
    const founder = identities[FOUNDER]!.address;
    await page.goto(`/dao/${tribe.slug}/members`);
    await waitForVisible(page.getByRole('heading', { name: 'Members', level: 1 }), 'Members');
    const row = directoryRow(page, founder);
    await waitForVisible(row, 'founder row');
    // The founder's two tokens never move in W14.
    await expect(row.getByText('2 tokens', { exact: true })).toBeVisible();
    await expect(row.getByText('2 votes', { exact: true })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ has: page.locator('span[title^="G"]') })).toHaveCount(3);
    await expectNoHorizontalScroll(page);

    await page.getByLabel('Find someone').fill('not-an-address');
    await page.getByRole('button', { name: 'Find' }).click();
    await expect(page.getByLabel('Find someone')).toHaveAttribute('aria-invalid', 'true');

    await row.getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`/members/${founder}$`));
    await waitForVisible(page.getByText('Tokens', { exact: true }).first(), 'profile stats');
    await expect(page.getByRole('heading', { name: 'Tokens' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('a profile that holds nothing says so', async ({ page, identities }) => {
    const outsider = identities['e2e-operator']!.address;
    await page.goto(`/dao/${tribe.slug}/members/${outsider}`);
    await waitForVisible(page.getByText('Not a member right now'), 'empty profile');
    await expectNoHorizontalScroll(page);
  });

  test('your own profile offers delegation, and the token form reaches the review without signing', async ({
    page,
    wallet,
    identities
  }) => {
    const founder = identities[FOUNDER]!.address;
    await page.goto(`/dao/${tribe.slug}/members/${founder}`);
    await signInAs(page, wallet, FOUNDER);
    await waitForVisible(page.getByRole('heading', { name: 'You', level: 1 }), 'your profile');
    await expect(page.getByRole('heading', { name: 'Delegate your votes' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    const controls = await openToken(page, tribe, TOKENS.members.founder[0]);
    await choose(controls, 'Send');
    await controls.getByLabel('Recipient address').fill(identities[OTHER]!.address);
    await controls.getByRole('button', { name: 'Review' }).click();
    const review = controls.getByLabel('Transaction review');
    await waitForVisible(review, 'transaction review', { governingS: 30 });
    await expectNoHorizontalScroll(page);
    await review.getByRole('button', { name: 'Cancel' }).click();
    await expect(review).toHaveCount(0);
    expect(wallet.calls.some((call) => call.method === 'signTransaction')).toBe(false);
  });

  test('members-only delegation is explained on the delegate form', async ({ page, wallet }) => {
    const only = MEMBERS_ONLY_TRIBE;
    await page.goto(`/dao/${only.slug}/token/${TOKENS.membersOnly.founder[0]}?action=delegate`);
    await signInAs(page, wallet, FOUNDER);
    const controls = yourToken(page);
    await waitForVisible(controls.getByLabel('Delegate address'), 'delegate form');
    await expect(controls.getByText('This tribe only lets you delegate to members', { exact: false })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
