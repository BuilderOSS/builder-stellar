import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { lamplight, SHOWCASE, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import { openProposal, ProposalState, waitForProposalState } from '../src/w09/proposals.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: marketplace/pools/01 to 04, manage/marketplace/05 and marketplace/treasury-purchases/05. Run
 * after 90-drive has executed the pool and the Treasury purchase (docs/qa/SHOWCASE_TRIBE.md).
 */
const market = `/dao/${SHOWCASE.slug}/marketplace`;
const poolCard = (page: import('@playwright/test').Page) =>
  page
    .getByRole('region', { name: 'Listings' })
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: /^New tokens · pool / }) })
    .first();

test.describe.serial('Lamplight: after the votes', () => {
  test.beforeEach(() => {
    test.setTimeout(30 * 60_000);
    showcaseIdentities();
  });

  test('the executed Treasury purchase', async ({ page }) => {
    const id = showcaseState().proposals?.purchase;
    test.skip(!id, 'no purchase proposal');
    await waitForProposalState(page, lamplight(), id!, [ProposalState.Executed], 1800);
    await openProposal(page, lamplight(), id!);
    await snap(page, 'marketplace/treasury-purchases/05', { top: true });
  });

  test('the quick-buy pool: empty, stocked and bought', async ({ page, wallet }) => {
    const id = showcaseState().proposals?.pool;
    test.skip(!id, 'no pool proposal');
    await waitForProposalState(page, lamplight(), id!, [ProposalState.Executed], 1800);
    await page.goto(`${market}?kind=pool`);
    await signInAs(page, wallet, 'e2e-member-b');
    const card = poolCard(page);
    await waitForVisible(card, 'pool card', { governingS: 120 });
    await snap(page, 'marketplace/pools/01', { top: true });
    await card.getByRole('button', { name: 'Details' }).click();
    const stock = card.getByRole('button', { name: 'Stock this pool' });
    if (await stock.isVisible().catch(() => false)) {
      await snap(page, 'marketplace/pools/03', { markers: [{ label: 'the Stock this pool button', locator: stock }] });
      await stock.click();
      const dialog = page.getByRole('dialog', { name: 'Stock this pool' });
      await dialog.getByRole('button', { name: 'Check' }).click();
      const send = dialog.getByRole('button', { name: 'Sign and send' });
      await waitForUi('stock prepared', (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 30 });
      await send.click();
      await waitForUi(
        'stocked',
        (timeout) => expect(dialog.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout }),
        { governingS: 90 }
      );
      await dialog.getByRole('button', { name: 'Done' }).click();
      await page.goto(`${market}?kind=pool`);
      await waitForVisible(card, 'pool card');
      await card.getByRole('button', { name: 'Details' }).click();
    }
    const buy = card.getByRole('button', { name: /^Buy for / });
    await waitForUi('pool stocked', (timeout) => expect(buy).toBeVisible({ timeout }), { governingS: 120 });
    await snap(page, 'marketplace/pools/02', { focus: card });
    await buy.click();
    const dialog = page.getByRole('dialog', { name: 'Buy this token' });
    await dialog.getByRole('button', { name: 'Check' }).click();
    const send = dialog.getByRole('button', { name: 'Sign and send' });
    await waitForUi('buy prepared', (timeout) => expect(send).toBeEnabled({ timeout }), { governingS: 30 });
    await snap(page, 'marketplace/pools/04', { focus: dialog });
    await send.click();
    await waitForUi(
      'bought',
      (timeout) => expect(dialog.getByRole('button', { name: 'Done' })).toBeEnabled({ timeout }),
      { governingS: 90 }
    );
    await dialog.getByRole('button', { name: 'Done' }).click();

    // Closing or sweeping it is a proposal of its own: the section, with the pool picked, not sent.
    await page.goto(lamplight().path('admin/marketplace'));
    await waitForVisible(page.getByText('The market is open'), 'market settings');
    const section = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /closing or sweeping a pool/i }) })
      .first();
    await waitForVisible(section, 'close or sweep section');
    const select = section.getByRole('combobox').first();
    if (await select.isVisible().catch(() => false)) await select.selectOption({ index: 1 }).catch(() => undefined);
    await snap(page, 'manage/marketplace/05', { focus: section });
  });
});
