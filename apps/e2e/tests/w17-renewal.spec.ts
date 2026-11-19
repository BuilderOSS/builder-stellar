import type { Locator, Page } from '@playwright/test';

import { signedTransactions, signInAs } from '../src/connect.ts';
import { appliedTheme, expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import { xlmBalance } from '../src/treasury-fixture.ts';
import { loadW02Fixture } from '../src/w02-fixture.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * W17 · Storage renewal: quote and renew on a tribe's Manage → Storage renewal tab, and the
 * platform page (§3.4).
 *
 * @matrix (every viewport × theme, nothing submitted): the tab signed out, a price quoted by a
 * signed-in wallet (simulation only), and the platform page, which is read only without the
 * Manager admin key. @chain (desktop dark): a wallet that is not a member renews the W02 fixture
 * tribe for 90 days and every part of it reads Healthy afterwards. The platform page's own actions
 * (shared storage renewal, pause, registry) need the Manager admin key and are not walked here.
 */

const tribe = loadW02Fixture();
const renewalPath = `/dao/${tribe.slug}/admin/renewal`;
/** Past TTL_SOON_DAYS (45), so a renewal turns every part Healthy. */
const DAYS = 90;
/** The tribe's own storage classes always present on a launched governance-only tribe. */
const TRIBE_CLASSES = ['Contracts', 'Artwork', 'Token records', 'Tribe link'];

const classRow = (page: Page, label: string) =>
  page
    .getByRole('main')
    .locator('div, li, a')
    .filter({ has: page.getByText(label, { exact: true }) });

async function openRenewal(page: Page, theme?: string) {
  await page.goto(renewalPath);
  if (theme) expect(await appliedTheme(page)).toBe(theme);
  await waitForVisible(page.getByRole('heading', { name: 'Storage renewal', level: 1 }), 'Storage renewal heading');
  await waitForUi(
    'storage report loaded',
    (timeout) => expect(page.getByText('Shared contract code', { exact: true })).toBeVisible({ timeout }),
    { governingS: 30 }
  );
}

async function choosePreset(page: Page, label: string) {
  await page.getByRole('radiogroup', { name: 'Renew for' }).getByText(label, { exact: true }).click();
}

/** Status chips of the tribe's own storage rows (not the shared code row). */
async function tribeChips(page: Page) {
  const texts = await page
    .getByRole('main')
    .getByText(/^(Healthy|Renew soon|Expiring soon|Expired)$/)
    .allInnerTexts();
  return texts.map((text) => text.trim());
}

async function getPrice(page: Page): Promise<{ total: string; button: Locator }> {
  await page.getByRole('button', { name: 'Get a price' }).click();
  const quote = page.getByText(/^(One transaction|\d+ transactions), about [\d.,]+ XLM in network fees\.$/);
  await waitForUi('renewal priced', (timeout) => expect(quote).toBeVisible({ timeout }), { governingS: 60 });
  const total = /about ([\d.,]+) XLM/.exec(await quote.innerText())![1]!;
  return { total, button: page.getByRole('button', { name: `Renew for ${DAYS} days · ${total} XLM` }) };
}

test.describe('W17 renewal tab', { tag: '@matrix' }, () => {
  test('lists what the tribe stores and asks for a wallet before pricing', async ({ page, theme }) => {
    await openRenewal(page, theme);
    await expect(page.getByText('Anyone can renew; the signing wallet pays the fee.', { exact: false })).toBeVisible();
    for (const label of TRIBE_CLASSES) await expect(classRow(page, label).first()).toBeVisible();
    await expect(page.getByText('Connect a wallet to see the price and renew.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Get a price' })).toBeDisabled();
    await expectNoHorizontalScroll(page);

    // Other: a day count past the network's limit is refused.
    await choosePreset(page, 'Other');
    const days = page.getByRole('textbox', { name: 'Days' });
    await days.fill('99999');
    await expect(days).toHaveAttribute('aria-invalid', 'true');
    await days.fill('30');
    await expect(days).not.toHaveAttribute('aria-invalid', 'true');
    await expectNoHorizontalScroll(page);
  });

  test('quotes a renewal for a signed-in wallet without sending anything', async ({ page, wallet }) => {
    await openRenewal(page);
    await signInAs(page, wallet, 'e2e-member-b');
    await choosePreset(page, `${DAYS} days`);
    const { button } = await getPrice(page);
    await expect(button).toBeEnabled();
    await expect(page.getByText(/costs about [\d.,]+ XLM a year/)).toBeVisible();
    await page.getByText('Price by part').click();
    await expect(page.getByText(/Contracts: [\d.,]+ XLM on its own/)).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Another period drops the old price.
    await choosePreset(page, '30 days');
    await expect(button).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Get a price' })).toBeEnabled();
    expect(signedTransactions(wallet, 'e2e-member-b')).toBe(0);
  });
});

test.describe('W17 platform page', { tag: '@matrix' }, () => {
  test('is read only without the platform admin wallet', async ({ page, wallet, theme }) => {
    await page.goto('/platform');
    expect(await appliedTheme(page)).toBe(theme);
    await waitForVisible(page.getByRole('heading', { name: 'Platform', level: 1 }), 'Platform heading');
    const readOnly = page.getByText('Read only: changes need the platform admin wallet.', { exact: false });
    await expect(readOnly).toBeVisible();
    for (const section of ['Shared storage', 'Tribes', 'Registry', 'Factory and admin'])
      await waitForVisible(page.getByRole('heading', { name: section, exact: true }), `${section} section`);

    // Every tribe is listed with a link to its own Renewal tab.
    const row = page.locator(`a[href="/dao/${tribe.slug}/admin/renewal"]`);
    await waitForUi('fixture tribe listed', (timeout) => expect(row).toBeVisible({ timeout }), { governingS: 60 });
    await expect(row).toContainText(tribe.name);
    await expectNoHorizontalScroll(page);

    // A signed-in wallet that is not the admin still sees no actions.
    await signInAs(page, wallet, 'e2e-founder');
    await expect(readOnly).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Pause|Resume) new tribes$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Renew for / })).toHaveCount(0);

    await row.click();
    await page.waitForURL(`**${renewalPath}`);
    await waitForVisible(page.getByRole('heading', { name: 'Storage renewal', level: 1 }), 'tribe Renewal tab');
  });
});

test.describe.serial('W17 renewal on chain', { tag: '@chain' }, () => {
  test.beforeAll(() => {
    requireVerifiedManager();
  });

  test('a wallet that is not a member renews the tribe for 90 days', async ({ page, wallet, identities }) => {
    test.setTimeout(6 * 60_000);
    const payer = identities['e2e-member-b']!.address;
    const before = xlmBalance(payer);
    await openRenewal(page);
    await signInAs(page, wallet, 'e2e-member-b');
    await choosePreset(page, `${DAYS} days`);
    const { button } = await getPrice(page);
    const steps = /^(\d+) transactions/.exec(
      await page.getByText(/^(One transaction|\d+ transactions), about/).innerText()
    );
    const expected = steps ? Number(steps[1]) : 1;
    await button.click();

    await waitForUi(
      'renewal confirmed',
      (timeout) => expect(page.getByText(`Storage renewed for ${DAYS} days`).first()).toBeVisible({ timeout }),
      { governingS: 60 * expected }
    );
    expect(signedTransactions(wallet, 'e2e-member-b')).toBe(expected);
    await expect(page.getByRole('alert').filter({ hasText: 'Renewal needs attention' })).toHaveCount(0);
    // The quote is spent; a new one starts from Get a price.
    await expect(page.getByRole('button', { name: 'Get a price' })).toBeVisible();
    expect(xlmBalance(payer)).toBeLessThan(before);

    // The report reloads from chain: every part of the tribe now has more than 45 days.
    await waitForUi(
      'every part Healthy',
      (timeout) =>
        expect.poll(async () => (await tribeChips(page)).every((chip) => chip === 'Healthy'), { timeout }).toBe(true),
      { governingS: 30 }
    );
    expect((await tribeChips(page)).length).toBeGreaterThanOrEqual(TRIBE_CLASSES.length);
  });
});
