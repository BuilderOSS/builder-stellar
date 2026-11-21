import type { Page } from '@playwright/test';

import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { lamplight, saveShowcaseState, SHOWCASE, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';
import {
  openComposer,
  openProposal,
  pickAction,
  ProposalState,
  statusColumn,
  submitProposal,
  waitForProposalState,
  writeAndReview
} from '../src/w09/proposals.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: proposals/cancel and home/showcase. The workshop lead proposes paying for paper, then
 * withdraws it; the tenth proposal, the evening lantern walk, stays open for votes, and the tribe's
 * home page is photographed with it (docs/qa/SHOWCASE_TRIBE.md).
 */
const PROPOSER = 'e2e-member-a';

async function payProposal(page: Page, wallet: E2ESigner, to: string, amount: string, title: string, why: string) {
  await openComposer(page, lamplight());
  await pickAction(page, /^Pay someone/, async (form) => {
    await form.getByLabel('Asset').selectOption({ label: 'XLM (Native)' });
    await waitForVisible(form.getByText('Treasury balance:'), 'treasury balance');
    await form.getByLabel('Recipient').fill(to);
    await form.getByLabel('Amount').fill(amount);
  });
  await writeAndReview(page, { title, why, actions: 1 });
  return submitProposal(page, wallet, PROPOSER, 1);
}

test.describe.serial('Lamplight: the last two proposals', () => {
  test.beforeEach(async ({ page, wallet }) => {
    test.setTimeout(20 * 60_000);
    showcaseIdentities();
    await page.goto(`/dao/${SHOWCASE.slug}/proposals`);
    await signInAs(page, wallet, PROPOSER);
  });

  test('propose, then withdraw', async ({ page, wallet }) => {
    test.skip(Boolean((showcaseState() as { cancelled?: boolean }).cancelled), 'done');
    const ids = showcaseIdentities();
    let id = showcaseState().proposals?.cancel;
    if (!id) {
      id = await payProposal(
        page,
        wallet,
        ids['e2e-member-a'],
        '40',
        'Buy paper for the lantern walk',
        'The walk needs about forty new lanterns. This pays for the paper so members can make them at the next two workshops.'
      );
      saveShowcaseState((s) => {
        s.proposals = { ...(s.proposals ?? {}), cancel: id! };
      });
    }
    const tribe = lamplight();
    await openProposal(page, tribe, id);
    const mine = page.getByText('You proposed this').first();
    await waitForVisible(mine, 'you proposed this');
    await snap(page, 'proposals/cancel/01', {
      top: true,
      markers: [{ label: 'the You proposed this line', locator: mine }]
    });
    const cancel = statusColumn(page).getByRole('button', { name: 'Cancel proposal' });
    await snap(page, 'proposals/cancel/02', { markers: [{ label: 'the Cancel proposal button', locator: cancel }] });
    await cancel.click();
    const dialog = page
      .getByRole('alertdialog', { name: 'Cancel this proposal?' })
      .or(page.getByRole('dialog', { name: 'Cancel this proposal?' }));
    await waitForVisible(dialog, 'cancel dialog');
    await snap(page, 'proposals/cancel/03', {
      markers: [
        { label: 'the Cancel proposal button', locator: dialog.getByRole('button', { name: 'Cancel proposal' }) }
      ]
    });
    await dialog.getByRole('button', { name: 'Cancel proposal' }).click();
    await waitForProposalState(page, tribe, id, [ProposalState.Canceled], 90);
    await openProposal(page, tribe, id);
    await waitForVisible(page.getByText('The proposer withdrew this proposal').first(), 'withdrawn', {
      governingS: 60
    });
    await snap(page, 'proposals/cancel/04', { top: true });
    saveShowcaseState((s) => {
      s.cancelled = true;
    });
  });

  test('the lantern walk, open for votes', async ({ page, wallet }) => {
    const ids = showcaseIdentities();
    let id = showcaseState().proposals?.walk;
    // Testnet can stall long enough for a ten-minute vote to close unseen: propose it again.
    if (id) {
      const body = await waitForProposalState(page, lamplight(), id, Object.values(ProposalState));
      if (body.state !== ProposalState.Pending && body.state !== ProposalState.Active) id = undefined;
    }
    if (!id) {
      id = await payProposal(
        page,
        wallet,
        ids['e2e-member-a'],
        '60',
        'Hold an evening lantern walk',
        'We would like to end the season with a walk where members carry the lanterns they made. This pays the workshop lead for candles, holders and a small first-aid kit. Everyone is welcome to join, members or not. The walk starts from the workshop at dusk and ends back there.'
      );
      saveShowcaseState((s) => {
        s.proposals = { ...(s.proposals ?? {}), walk: id! };
      });
    }
    const tribe = lamplight();
    await waitForProposalState(page, tribe, id, [ProposalState.Active], 400);
    await page.goto(`/dao/${SHOWCASE.slug}`);
    await waitForUi(
      'home shows the open proposal',
      (timeout) => expect(page.getByText('Hold an evening lantern walk').first()).toBeVisible({ timeout }),
      { governingS: 120 }
    );
    await snap(page, 'home/showcase', { top: true });
    saveShowcaseState((s) => {
      s.storyDone = true;
    });
  });
});
