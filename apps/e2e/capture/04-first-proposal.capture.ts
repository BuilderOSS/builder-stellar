import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { lamplight, saveShowcaseState, SHOWCASE, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import { ensureTreasuryFunded } from '../src/treasury-fixture.ts';
import { confirmAdd, draftCount, openComposer, submitProposal } from '../src/w09/proposals.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: proposals/write, proposals/actions and start/build-your-first-tribe (the composer). The founder
 * writes Lamplight's first proposal, "Fund the first lantern workshop", and submits it. The action
 * picker tour is a second draft that is never sent (docs/qa/SHOWCASE_TRIBE.md).
 */
export const P1 = {
  key: 'workshop',
  title: 'Fund the first lantern workshop',
  why: 'We would like to run a first workshop where members make their own lanterns. This pays the workshop lead for paper, frames and candles for twelve people. Anything left over stays with the workshop lead for the next session.',
  amount: '150'
};

test('Lamplight: write the first proposal', async ({ page, wallet }) => {
  test.skip(Boolean(showcaseState().proposals?.[P1.key]), 'Proposal 1 is already submitted.');
  const tribe = lamplight();
  const ids = showcaseIdentities();
  test.setTimeout(15 * 60_000);
  ensureTreasuryFunded(tribe.treasury, 400_0000000n, 500_0000000n);

  await page.goto(`/dao/${SHOWCASE.slug}/proposals`);
  await signInAs(page, wallet, 'e2e-founder');
  const newProposal = page.getByRole('button', { name: 'New proposal' }).first();
  await waitForVisible(newProposal, 'proposals page');
  await snap(page, 'proposals/write/01', { markers: [{ label: 'the New proposal button', locator: newProposal }] });
  await snap(page, 'start/build-your-first-tribe/04', {
    markers: [{ label: 'the New proposal button', locator: newProposal }]
  });

  // The action picker, in a draft of its own that is never sent.
  await openComposer(page, tribe);
  await page.getByRole('button', { name: 'Add an action' }).click();
  const picker = page.getByRole('dialog', { name: 'Add an action' });
  await waitForVisible(picker, 'action picker');
  const reopenPicker = async () => {
    if (await picker.isVisible()) return;
    await page.getByRole('button', { name: 'Add an action' }).click();
    await waitForVisible(picker, 'action picker');
  };
  await snap(page, 'proposals/actions/01', {
    markers: [
      {
        label: 'the Find an action search box',
        locator: picker
          .getByRole('searchbox', { name: 'Find an action' })
          .or(picker.getByRole('textbox', { name: 'Find an action' }))
      }
    ],
    prepare: reopenPicker
  });
  const pay = picker.getByRole('button', { name: /^Pay someone/ });
  await snap(page, 'proposals/actions/02', {
    markers: [{ label: 'the Pay someone tile', locator: pay }],
    prepare: reopenPicker
  });
  const settingGroup = picker.getByText(/^Change a setting · /).first();
  await snap(page, 'proposals/actions/03', {
    focus: settingGroup,
    prepare: async (p) => {
      await reopenPicker();
      await settingGroup.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    }
  });

  await pay.click();
  const form = page.getByRole('dialog', { name: 'Set up the action' });
  await waitForVisible(form, 'pay form');
  await form.getByLabel('Asset').selectOption({ label: 'XLM (Native)' });
  await waitForVisible(form.getByText('Treasury balance:'), 'treasury balance');
  await form.getByLabel('Recipient').fill(ids['e2e-member-a']);
  await form.getByLabel('Amount').fill('40');
  await snap(page, 'proposals/actions/04', { focus: form.getByLabel('Recipient') });
  await form.getByRole('button', { name: 'Add to proposal' }).click();
  await confirmAdd(page, 0);
  for (const [index, amount] of ['25', '15'].entries()) {
    const before = await draftCount(page);
    await page.getByRole('button', { name: 'Add an action' }).click();
    await picker.getByRole('button', { name: /^Pay someone/ }).click();
    await form.getByLabel('Asset').selectOption({ label: 'XLM (Native)' });
    await form.getByLabel('Recipient').fill(index === 0 ? ids['e2e-member-b'] : ids['e2e-operator']);
    await form.getByLabel('Amount').fill(amount);
    await form.getByRole('button', { name: 'Add to proposal' }).click();
    await confirmAdd(page, before);
    await waitForUi('action added', (timeout) => expect.poll(() => draftCount(page), { timeout }).toBe(before + 1));
  }
  const queue = page.getByRole('list', { name: 'Actions in this proposal' });
  await snap(page, 'proposals/actions/05', {
    markers: [{ label: 'the move buttons', locator: page.getByRole('button', { name: 'Move action 2 up' }) }],
    focus: queue
  });
  const row = queue.getByRole('listitem').first();
  await snap(page, 'proposals/actions/06', {
    markers: [
      { label: 'the Edit button', locator: row.getByRole('button', { name: 'Edit' }) },
      { label: 'the Remove button', locator: row.getByRole('button', { name: 'Remove' }) }
    ]
  });
  // Clear the tour draft.
  while ((await draftCount(page)) > 0) {
    await queue.getByRole('listitem').first().getByRole('button', { name: 'Remove' }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /^Remove/ }));
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: 'Remove' }).click();
    await page.waitForTimeout(300);
  }

  // The real proposal.
  const title = page.getByRole('textbox', { name: 'Title (required)' });
  await title.fill(P1.title);
  await snap(page, 'proposals/write/02', { markers: [{ label: 'the Title field', locator: title }] });
  const why = page.getByRole('textbox', { name: 'Why' });
  await why.fill(P1.why);
  await snap(page, 'proposals/write/03', { markers: [{ label: 'the Why field', locator: why }] });
  const next = page.getByRole('button', { name: 'Next: review' }).filter({ visible: true }).first();
  await snap(page, 'proposals/write/05', { markers: [{ label: 'the Next: review button', locator: next }] });

  await page.getByRole('button', { name: 'Add an action' }).click();
  await picker.getByRole('button', { name: /^Pay someone/ }).click();
  await form.getByLabel('Asset').selectOption({ label: 'XLM (Native)' });
  await waitForVisible(form.getByText('Treasury balance:'), 'treasury balance');
  await form.getByLabel('Recipient').fill(ids['e2e-member-a']);
  await form.getByLabel('Amount').fill(P1.amount);
  await form.getByRole('button', { name: 'Add to proposal' }).click();
  await confirmAdd(page, 0);
  await snap(page, 'proposals/write/04', {
    markers: [{ label: 'the Add an action button', locator: page.getByRole('button', { name: 'Add an action' }) }],
    focus: queue
  });

  await next.click();
  const preview = page.getByRole('region', { name: 'Proposal preview' });
  await waitForVisible(preview, 'review step');
  await snap(page, 'proposals/write/06', { top: true });
  await page.getByRole('button', { name: 'Submit proposal' }).filter({ visible: true }).first().click();
  const confirm = page.getByRole('alertdialog', { name: 'Submit this proposal?' });
  await waitForVisible(confirm, 'submit confirmation');
  await snap(page, 'proposals/write/07', {
    markers: [
      { label: 'the Submit proposal button', locator: confirm.getByRole('button', { name: 'Submit proposal' }) }
    ]
  });
  await confirm.getByRole('button', { name: 'Cancel' }).click();

  const id = await submitProposal(page, wallet, 'e2e-founder', 1);
  saveShowcaseState((state) => {
    state.proposals = { ...(state.proposals ?? {}), [P1.key]: id };
  });
});
