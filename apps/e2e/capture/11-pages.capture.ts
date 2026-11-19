import { signInAs, topBarConnect } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { COVER_IMAGE, lamplight, SHOWCASE, showcaseIdentities } from '../src/showcase.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: start/first-10-minutes/01, 03 and 04, legal/export and platform/operators (read only). These
 * pages sign nothing. Only example names and the example.org domain are typed: no personal data.
 */
test.describe('Lamplight: pages that sign nothing', () => {
  test.describe('first visit', () => {
    test.use({ skipWalletIntro: false });
    test('Before you connect', async ({ page }) => {
      showcaseIdentities();
      await page.goto('/');
      await topBarConnect(page).click();
      const sheet = page.getByRole('dialog', { name: /Before you connect/ });
      await waitForVisible(sheet, 'Before you connect');
      await snap(page, 'start/first-10-minutes/01', {
        prepare: async () => {
          if (!(await sheet.isVisible())) await topBarConnect(page).click();
        }
      });
    });
  });

  test('the top bar after connecting, and Discover', async ({ page, wallet }) => {
    showcaseIdentities();
    await page.goto('/discover');
    await signInAs(page, wallet, 'e2e-member-b');
    const you = page.getByRole('button', { name: /^You, connected as/ });
    await snap(page, 'start/first-10-minutes/03', {
      top: true,
      markers: [{ label: 'your avatar and address', locator: you }]
    });
    await waitForVisible(page.getByText(SHOWCASE.name).first(), 'Lamplight on Discover', { governingS: 60 });
    await snap(page, 'start/first-10-minutes/04', { top: true });
  });

  test('legal entity export', async ({ page, wallet }) => {
    test.setTimeout(10 * 60_000);
    const ids = showcaseIdentities();
    await page.goto(lamplight().path('admin/legal'));
    await signInAs(page, wallet, 'e2e-founder');
    const name = page.getByLabel('Proposed legal name');
    await waitForVisible(name, 'legal export');
    await snap(page, 'legal/export/01', { top: true });
    await name.fill('Lamplight Circle DAO LLC');
    // Card choices: press the card, as a person would.
    await page.getByRole('radiogroup', { name: 'Entity type' }).locator('label').first().click();
    const purpose = page.getByRole('radiogroup', { name: 'What is the non-profit purpose?' });
    if (await purpose.isVisible().catch(() => false)) await purpose.locator('label').first().click();
    await page
      .getByLabel('Purpose', { exact: true })
      .fill(
        'To run lantern-making workshops and community lantern walks, and to look after the materials and the collection the members share.'
      );
    await snap(page, 'legal/export/02', { focus: name });
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await next.click();
    await page.getByLabel('Contact name').fill('Lamplight workshop lead');
    await page.getByLabel('Contact email (optional)').fill('workshops@example.org');
    await page.getByRole('button', { name: 'Add a manager' }).click();
    await page.getByRole('textbox', { name: 'Manager 1 name' }).fill('Lamplight founder');
    await page.getByRole('textbox', { name: 'Manager 1 role' }).fill('Founder');
    await page.getByRole('textbox', { name: 'Manager 1 Stellar address' }).fill(ids['e2e-founder']);
    await snap(page, 'legal/export/03', { focus: page.getByLabel('Contact name') });
    await next.click();
    const verify = page.getByRole('heading', { name: 'Who a registrar would verify' });
    await waitForVisible(verify, 'review');
    await snap(page, 'legal/export/04', { focus: verify });
    await next.click();
    const download = page.getByRole('button', { name: 'Download bundle (JSON)' });
    await waitForUi('export ready', (timeout) => expect(download).toBeVisible({ timeout }));
    await snap(page, 'legal/export/05', { markers: [{ label: 'the download buttons', locator: download }] });
  });

  test('the profile image preview, and the contracts page', async ({ page, wallet }) => {
    showcaseIdentities();
    await page.goto(lamplight().path('admin/profile'));
    await signInAs(page, wallet, 'e2e-founder');
    const description = page.getByRole('textbox', { name: 'Description' });
    await waitForUi('profile loaded', (timeout) => expect(description).not.toHaveValue('', { timeout }));
    // A new image is only previewed here; nothing is uploaded or proposed.
    await page
      .locator('section[aria-labelledby="profile-title"] input[type="file"]:not([multiple])')
      .setInputFiles(COVER_IMAGE);
    const upload = page.getByRole('button', { name: 'Upload image' }).first();
    await waitForVisible(upload, 'image preview');
    await snap(page, 'manage/profile/02', { markers: [{ label: 'the Upload image button', locator: upload }] });

    await page.goto(lamplight().path('admin/upgrades'));
    const status = page.getByText(/^(Everything is up to date|\d+ upgrades? available)$/).first();
    await waitForVisible(status, 'contracts page', { governingS: 60 });
    await snap(page, 'setup/contracts/02', { top: true });
    if ((await status.textContent()) === 'Everything is up to date')
      await snap(page, 'setup/contracts/05', { focus: status });
  });

  test('the platform page, read only', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    showcaseIdentities();
    await page.goto('/platform');
    await waitForVisible(page.getByRole('heading', { name: 'Platform', level: 1 }), 'platform page');
    await waitForVisible(
      page
        .getByText(/^Checked \d+ of \d+/)
        .or(page.getByRole('heading', { name: 'Tribes' }))
        .first(),
      'tribes section'
    );
    const attention = page.getByRole('heading', { name: 'Needs attention' });
    if (await attention.isVisible().catch(() => false)) await snap(page, 'platform/operators/01', { top: true });
    await snap(page, 'platform/operators/02', { focus: page.getByRole('heading', { name: 'Shared storage' }) });
    const tribes = page.getByRole('heading', { name: 'Tribes' });
    const needs = page
      .getByRole('radio', { name: 'Needs renewal' })
      .or(page.getByRole('button', { name: 'Needs renewal' }))
      .first();
    if (await needs.isVisible().catch(() => false)) await needs.click({ force: true });
    await snap(page, 'platform/operators/04', { focus: tribes });
    await snap(page, 'platform/operators/05', { focus: page.getByRole('heading', { name: 'Registry' }) });
    await snap(page, 'platform/operators/06', { focus: page.getByRole('heading', { name: /Factory and admin/ }) });
  });
});
