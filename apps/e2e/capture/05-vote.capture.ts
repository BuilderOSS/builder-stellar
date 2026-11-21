import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { lamplight, saveShowcaseState, SHOWCASE, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import { openProposal, ProposalState, statusColumn, waitForProposalState } from '../src/w09/proposals.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: proposals/vote and start/first-10-minutes/07. The workshop lead votes For on proposal 1 with a
 * reason (docs/qa/SHOWCASE_TRIBE.md).
 */
const REASON = 'I can run this. Twelve places should be enough for the first session.';

test('Lamplight: the workshop lead votes on proposal 1', async ({ page, wallet }) => {
  const tribe = lamplight();
  showcaseIdentities();
  test.setTimeout(20 * 60_000);
  const p1 = showcaseState().proposals?.workshop;
  test.skip(!p1, 'Proposal 1 is not submitted yet.');
  const state = showcaseState() as ReturnType<typeof showcaseState> & { voted?: Record<string, boolean> };
  test.skip(Boolean(state.voted?.['workshop:member-a']), 'Already voted.');
  // The workshop lead's vote on proposal 1.
  await waitForProposalState(page, tribe, p1!, [ProposalState.Active], 400);
  await page.goto(`/dao/${SHOWCASE.slug}/proposals`);
  await signInAs(page, wallet, 'e2e-member-a');
  const open = page.getByRole('heading', { name: 'Open now' });
  await waitForVisible(open, 'Open now');
  await snap(page, 'proposals/vote/01', { focus: open });
  await openProposal(page, tribe, p1!);
  await snap(page, 'proposals/vote/02', { top: true });
  const column = statusColumn(page);
  const power = column.getByText(/^You have \d+ votes? on this proposal/);
  await waitForVisible(power, 'voting power');
  await snap(page, 'proposals/vote/03', { focus: power, markers: [{ label: 'your voting power', locator: power }] });
  await column.getByRole('radio', { name: 'For' }).check({ force: true });
  await snap(page, 'proposals/vote/04', { focus: power });
  const reason = column.getByRole('textbox', { name: 'Why? (optional)' });
  await reason.fill(REASON);
  await snap(page, 'proposals/vote/05', { markers: [{ label: 'the Why? box', locator: reason }] });
  const cast = column.getByRole('button', { name: /^Cast \d+ votes? For$/ });
  await snap(page, 'proposals/vote/06', { markers: [{ label: 'the Cast votes For button', locator: cast }] });
  await snap(page, 'start/first-10-minutes/07', { markers: [{ label: 'the Cast votes For button', locator: cast }] });
  await cast.click();
  await waitForVisible(page.getByText('Vote cast', { exact: true }), 'vote cast', { governingS: 90 });
  await waitForUi('vote shown', (timeout) => expect(column.getByText('You voted For')).toBeVisible({ timeout }), {
    governingS: 180
  });
  await waitForUi('reason listed', (timeout) => expect(page.getByText(REASON).first()).toBeVisible({ timeout }), {
    governingS: 120
  });
  await snap(page, 'proposals/vote/07', { focus: column.getByText('You voted For') });
  saveShowcaseState((s) => {
    s.voted = { ...((s.voted as Record<string, boolean>) ?? {}), 'workshop:member-a': true };
  });
});
