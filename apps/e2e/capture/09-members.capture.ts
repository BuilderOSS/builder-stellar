import type { Locator, Page } from '@playwright/test';

import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { lamplight, saveShowcaseState, SHOWCASE, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import { switchAccount } from '../src/tribe.ts';
import { tokensOf } from '../src/w09/fixture.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: members/find, members/delegate, members/transfer, members/approvals and
 * start/first-10-minutes/08. The new member delegates their vote to the workshop lead; the workshop
 * lead gives a lantern to a second bidder and prepares an approval without sending it
 * (docs/qa/SHOWCASE_TRIBE.md).
 */
const yourToken = (page: Page) => page.getByRole('region', { name: 'Your token' });
const done = (key: string) => Boolean((showcaseState() as { members?: Record<string, boolean> }).members?.[key]);
const mark = (key: string) =>
  saveShowcaseState((s) => {
    s.members = { ...((s.members as Record<string, boolean>) ?? {}), [key]: true };
  });

async function choose(controls: Locator, option: string) {
  await controls
    .getByRole('radiogroup', { name: 'What do you want to do?' })
    .getByText(option, { exact: true })
    .click();
}

test.describe.serial('Lamplight: members', () => {
  test.beforeEach(() => {
    test.setTimeout(15 * 60_000);
  });

  test('find a member', async ({ page }) => {
    test.skip(done('find'), 'done');
    const ids = showcaseIdentities();
    await page.goto(`/dao/${SHOWCASE.slug}/members`);
    await waitForVisible(page.getByRole('heading', { name: 'Members', level: 1 }), 'members');
    await waitForVisible(page.getByText(/\d+ votes?$/).first(), 'member rows');
    await snap(page, 'members/find/01', { top: true });
    const sort = page
      .getByRole('button', { name: /^Sort/ })
      .or(page.getByRole('combobox', { name: /^Sort/ }))
      .first();
    await sort.click();
    const option = page
      .getByRole('option', { name: /Votes: highest first/ })
      .or(page.getByRole('menuitemradio', { name: /Votes: highest first/ }))
      .first();
    await waitForVisible(option, 'sort options');
    await snap(page, 'members/find/02', {
      markers: [{ label: 'the Votes: highest first option', locator: option }],
      prepare: async () => {
        if (!(await option.isVisible())) await sort.click();
      }
    });
    await option.click();
    const find = page.getByLabel('Find someone');
    await find.fill(ids['e2e-member-a']);
    await page
      .getByRole('button', { name: 'Find' })
      .click()
      .catch(() => undefined);
    await snap(page, 'members/find/03', { markers: [{ label: 'the Find someone field', locator: find }] });
    await page.goto(`/dao/${SHOWCASE.slug}/members/${ids['e2e-member-a']}`);
    await waitForVisible(page.getByRole('heading', { name: 'Tokens' }), 'member profile');
    await snap(page, 'members/find/04', { top: true });
    const [first] = await tokensOf(page.request, lamplight(), ids['e2e-member-a']);
    await page.goto(`/dao/${SHOWCASE.slug}/token/${first}`);
    await waitForVisible(page.getByRole('region', { name: 'Held by' }), 'token page');
    await snap(page, 'members/find/05', { top: true });
    mark('find');
  });

  test('the new member delegates their vote', async ({ page, wallet }) => {
    test.skip(done('delegate'), 'done');
    const ids = showcaseIdentities();
    await page.goto(`/dao/${SHOWCASE.slug}/members/${ids['e2e-member-b']}`);
    await signInAs(page, wallet, 'e2e-member-b');
    await waitForVisible(page.getByRole('heading', { name: 'You', level: 1 }), 'your profile');
    const delegate = page.getByRole('link', { name: 'Delegate votes' });
    await snap(page, 'members/delegate/01', { markers: [{ label: 'the Delegate votes button', locator: delegate }] });
    await delegate.click();
    const controls = yourToken(page);
    const address = controls.getByLabel('Delegate address');
    await waitForVisible(address, 'delegate form');
    await snap(page, 'members/delegate/02', { focus: controls });
    await address.fill(ids['e2e-member-a']);
    await snap(page, 'members/delegate/03', { markers: [{ label: 'the Delegate address field', locator: address }] });
    await snap(page, 'start/first-10-minutes/08', {
      markers: [{ label: 'the Delegate address field', locator: address }]
    });
    await controls.getByRole('button', { name: 'Review' }).click();
    const review = controls.getByLabel('Transaction review');
    await waitForVisible(review, 'review', { governingS: 30 });
    await snap(page, 'members/delegate/04', { focus: review });
    await review.getByRole('button', { name: 'Sign and send' }).click();
    await waitForVisible(
      controls.getByText('Confirmed. Ownership and votes can take a moment to update here.'),
      'delegated',
      { governingS: 60 }
    );
    await page.goto(`/dao/${SHOWCASE.slug}/members/${ids['e2e-member-b']}`);
    await waitForUi(
      'profile shows the delegate',
      (timeout) => expect(page.getByText('Delegated', { exact: true })).toBeVisible({ timeout }),
      { governingS: 120 }
    );
    await snap(page, 'members/delegate/05', { focus: page.getByText('Delegated', { exact: true }) });
    mark('delegate');
  });

  test('the workshop lead gives a lantern away, and prepares an approval', async ({ page, wallet }) => {
    test.skip(done('transfer'), 'done');
    const ids = showcaseIdentities();
    const held = await tokensOf(page.request, lamplight(), ids['e2e-member-a']);
    const tokenId = held.sort((a, b) => b - a)[0];
    await page.goto(`/dao/${SHOWCASE.slug}/token/${tokenId}`);
    await signInAs(page, wallet, 'e2e-member-a');
    const controls = yourToken(page);
    await waitForVisible(controls, 'your token');
    await snap(page, 'members/approvals/01', { focus: controls });

    // Approval: prepared and reviewed, not sent.
    await choose(controls, 'Approve');
    await snap(page, 'members/approvals/02', { focus: controls });
    const spender = controls.getByLabel('Spender address');
    await spender.fill(ids['e2e-operator']);
    await snap(page, 'members/approvals/03', { markers: [{ label: 'the Spender address field', locator: spender }] });
    await controls.getByRole('button', { name: 'Use a short approval (about 10 minutes)' }).click();
    const ends = controls.getByLabel('Approval ends at network position');
    await expect(ends).toHaveValue(/^\d+$/);
    await snap(page, 'members/approvals/04', { markers: [{ label: 'the approval end field', locator: ends }] });
    await controls.getByRole('button', { name: 'Review' }).click();
    const review = controls.getByLabel('Transaction review');
    await waitForVisible(review, 'approval review', { governingS: 30 });
    await snap(page, 'members/approvals/05', { focus: review });
    await review.getByRole('button', { name: 'Cancel' }).click();

    // Transfer to the second bidder.
    await page.goto(`/dao/${SHOWCASE.slug}/token/${tokenId}`);
    await waitForVisible(controls, 'your token');
    await snap(page, 'members/transfer/01', { top: true });
    await choose(controls, 'Send');
    await snap(page, 'members/transfer/02', { focus: controls });
    const recipient = controls.getByLabel('Recipient address');
    await recipient.fill(ids['e2e-operator']);
    await snap(page, 'members/transfer/03', {
      markers: [{ label: 'the Recipient address field', locator: recipient }]
    });
    await controls.getByRole('button', { name: 'Review' }).click();
    const send = controls.getByLabel('Transaction review');
    await waitForVisible(send, 'transfer review', { governingS: 30 });
    await snap(page, 'members/transfer/04', { focus: send });
    await send.getByRole('button', { name: 'Sign and send' }).click();
    await waitForVisible(
      controls.getByText('Confirmed. Ownership and votes can take a moment to update here.'),
      'sent',
      { governingS: 60 }
    );
    await page.goto(`/dao/${SHOWCASE.slug}/token/${tokenId}`);
    const heldBy = page.getByRole('region', { name: 'Held by' });
    await waitForUi(
      'new holder shown',
      (timeout) => expect(heldBy.getByText('Yours', { exact: true })).toHaveCount(0, { timeout }),
      { governingS: 120 }
    );
    await snap(page, 'members/transfer/05', { focus: heldBy });
    mark('transfer');

    // The second account now holds exactly one lantern: the sell form warns that it's their last.
    await switchAccount(page, wallet, 'e2e-operator', `/dao/${SHOWCASE.slug}/marketplace?sell=${tokenId}`);
    await page.goto(`/dao/${SHOWCASE.slug}/marketplace?sell=${tokenId}`);
    const form = page.getByRole('region', { name: 'Sell a token you own' });
    await waitForUi(
      'token preselected',
      (timeout) => expect(form.locator('#sell-token')).toHaveValue(String(tokenId), { timeout }),
      { governingS: 120 }
    );
    await form.locator('#sell-price').fill('40');
    const last = form.getByText(/This is your last token in this tribe/);
    await waitForVisible(last, 'last token warning');
    await snap(page, 'marketplace/sell/04', { markers: [{ label: 'the last token warning', locator: last }] });
  });
});
