import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { FIXTURES, lamplight, SHOWCASE, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import { ProposalState, waitForProposalState } from '../src/w09/proposals.ts';
import { waitForUi } from '../src/waits.ts';

/**
 * Pages that can be photographed again at any time without changing anything on chain, for shots
 * that need a retake (an earlier one caught the page still loading, or the app copy changed).
 */
test('Lamplight home, with the lantern walk open', async ({ page, wallet }) => {
  showcaseIdentities();
  const id = showcaseState().proposals?.walk;
  test.skip(!id, 'no lantern walk proposal');
  await waitForProposalState(page, lamplight(), id!, [ProposalState.Active], 60);
  await page.goto(`/dao/${SHOWCASE.slug}`);
  await signInAs(page, wallet, 'e2e-member-a');
  await waitForUi('home shows the open proposal', (timeout) =>
    expect(page.getByText('Hold an evening lantern walk').first()).toBeVisible({ timeout })
  );
  await snap(page, 'home/showcase', { top: true });
});

/** The siblings (timeline `showb`): Claims pages after the plural fix (BUG-CAP-4). */
test.describe('siblings, after the plural fix', () => {
  test.skip(process.env.E2E_TIMELINE !== 'showb', 'run with E2E_TIMELINE=showb');
  const read = (file: string) =>
    JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as { daoId?: string; walk?: { daoId: string } };

  test('Past claims after the free claim', async ({ page, wallet }) => {
    showcaseIdentities();
    const { daoId } = read('claims-state.json');
    await page.goto(`/dao/${daoId}/claims`);
    await signInAs(page, wallet, 'e2e-member-b');
    const past = page.getByText(/^5 tokens from Claim list 1/).first();
    await waitForUi('past claims', (timeout) => expect(past).toBeVisible({ timeout }), { governingS: 60 });
    await snap(page, 'claims/claim/05', {
      markers: [{ label: 'the claim under Past claims', locator: past }],
      focus: page.getByRole('heading', { name: 'Past claims' })
    });
  });

  test('the failed drive after the payment came back', async ({ page, wallet }) => {
    showcaseIdentities();
    const walk = read('drives-state.json').walk!;
    await page.goto(`/dao/${walk.daoId}/claims`);
    await signInAs(page, wallet, 'e2e-member-a');
    const card = page.getByRole('region', { name: 'Launch drive' });
    const returned = card.getByText('Your payment has been returned.');
    await waitForUi('payment returned', (timeout) => expect(returned).toBeVisible({ timeout }), { governingS: 60 });
    await snap(page, 'claims/refund/03', {
      markers: [{ label: 'the note that your payment has been returned', locator: returned }],
      focus: card
    });
  });
});
