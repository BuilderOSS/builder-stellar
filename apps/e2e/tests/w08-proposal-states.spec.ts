import { expect, expectNoHorizontalScroll, test } from '../src/fixtures.ts';
import {
  composeProposal,
  lifecycleHeading,
  loadProposalsFixture,
  type ProposalListBody,
  signInOn,
  stateChip
} from '../src/proposals.ts';
import { waitForVisible } from '../src/waits.ts';

/**
 * W07/W08 at every viewport and theme (@matrix), signing no transaction:
 *   - threshold not met: a member under the proposal threshold is told why they can't propose;
 *   - the composer with three actions, up to the signing step, then cancelled;
 *   - a state tour of the fixture tribe's proposals: each state the @chain walk leaves behind.
 */

const fixture = loadProposalsFixture();

test.describe('W08 threshold and W07 composer', { tag: '@matrix' }, () => {
  test('W08 threshold not met: a member with too few votes is told why they cannot propose', async ({
    page,
    wallet
  }) => {
    await signInOn(page, wallet, 'e2e-member-a', `/dao/${fixture.slug}/proposals`);
    const votes = fixture.votesOf(wallet.address!);
    expect(votes).toBeLessThan(fixture.threshold);
    const reason = `You need at least ${fixture.threshold} votes to create proposals. Current voting power: ${votes}.`;
    await waitForVisible(page.getByText(reason), 'threshold hint on the proposals page');
    await expect(page.getByRole('button', { name: 'New proposal' })).toBeDisabled();
    await expectNoHorizontalScroll(page);

    // Going straight to the composer says the same, and offers nothing to submit.
    await page.goto(`/dao/${fixture.slug}/proposals/create`);
    const callout = page.getByText("You can't propose yet");
    await waitForVisible(callout, 'composer refusal');
    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title (required)' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    expect(wallet.calls.some((call) => call.method === 'signTransaction')).toBe(false);
  });

  test('W07 the composer takes three actions up to signing, then cancels', async ({ page, wallet, identities }) => {
    await signInOn(page, wallet, 'e2e-founder', `/dao/${fixture.slug}/proposals`);
    const a = identities['e2e-member-a']!.address;
    const b = identities['e2e-member-b']!.address;
    const preview = await composeProposal(page, fixture, {
      title: 'W07 composer check (not submitted)',
      why: 'Checks the composer at this viewport. It is cancelled before signing.',
      actions: [
        { kind: 'pay', to: a, amount: '2', summary: new RegExp(`^Send 2 XLM to ${a}`) },
        { kind: 'pay', to: b, amount: '1', summary: new RegExp(`^Send 1 XLM to ${b}`) },
        { kind: 'toggle', setting: 'Members-only delegation', summary: /delegat/i }
      ]
    });
    await expect(preview.getByRole('listitem')).toHaveCount(3);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Submit proposal' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Submit this proposal?' });
    await waitForVisible(confirm, 'submit confirmation');
    await expect(confirm.getByText('It goes to a vote with 3 actions.', { exact: false })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    // The draft stays on this browser, at its review.
    await expect(preview).toBeVisible();
    expect(wallet.calls.some((call) => call.method === 'signTransaction')).toBe(false);

    // Discard it so the next visit starts clean.
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Discard draft' }).click();
    await page
      .getByRole('alertdialog', { name: 'Discard this draft?' })
      .getByRole('button', { name: /^Discard/ })
      .click();
    await page.waitForURL(new RegExp(`/dao/${fixture.slug}/proposals$`));
  });
});

/** The states the @chain walk leaves on the fixture tribe; the others show up while it runs. */
const REQUIRED = ['Executed', 'Defeated', 'Canceled'];
const DISPLAY: Record<string, { chip: string; heading: RegExp }> = {
  Pending: { chip: 'Voting soon', heading: /^Opens in / },
  Active: { chip: 'Voting', heading: / left to vote$/ },
  Succeeded: { chip: 'Passed', heading: /^The vote passed$/ },
  Queued: { chip: 'Queued', heading: /^(Can run in |Ready to execute)/ },
  Executed: { chip: 'Executed', heading: /^Executed$/ },
  Defeated: { chip: "Didn't pass", heading: /^The vote didn't pass$/ },
  Canceled: { chip: 'Cancelled', heading: /^Cancelled$/ },
  Expired: { chip: 'Expired', heading: /^Expired$/ }
};

test.describe('W07 and W08 proposal states', { tag: '@matrix' }, () => {
  test('W08 each proposal state renders without horizontal scroll', async ({ page }) => {
    const response = await page.request.get(`/api/dao/${fixture.daoId}/proposals?limit=100`);
    expect(response.ok()).toBe(true);
    const { items } = (await response.json()) as ProposalListBody;
    const newest = new Map<string, ProposalListBody['items'][number]>();
    for (const item of items) if (!newest.has(item.stateLabel)) newest.set(item.stateLabel, item);
    const missing = REQUIRED.filter((label) => !newest.has(label));
    expect(missing, `run the @chain walk (w07-w08-proposals) first; missing ${missing.join(', ')}`).toEqual([]);

    await page.goto(`/dao/${fixture.slug}/proposals`);
    await waitForVisible(page.getByRole('heading', { name: /^Proposals/ }), 'proposals list');
    await expectNoHorizontalScroll(page);

    for (const [label, item] of newest) {
      const display = DISPLAY[label];
      if (!display) continue;
      await page.goto(`/dao/${fixture.slug}/proposals/${item.proposalNumber}`);
      await waitForVisible(page.getByRole('heading', { level: 1, name: /^Proposal \d+: / }), `${label} proposal`);
      await expect(stateChip(page).getByText(display.chip, { exact: true })).toBeVisible();
      await expect(lifecycleHeading(page)).toHaveText(display.heading);
      await expectNoHorizontalScroll(page);
    }
  });
});
