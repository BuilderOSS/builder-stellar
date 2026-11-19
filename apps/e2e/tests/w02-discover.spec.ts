import type { Page } from '@playwright/test';

import { appliedTheme, expect, expectNoHorizontalScroll, test } from '../src/fixtures.ts';
import { E2E_BASE_URL } from '../src/network.ts';
import { claimedSlug, loadW02Fixture, MARKET_TRIBE } from '../src/w02-fixture.ts';
import { waitForVisible } from '../src/waits.ts';

/**
 * W02 · Discover and search tribes, open a tribe, share card (§3.4). Read only: nothing signs, so
 * every case runs at every viewport × theme (@matrix).
 *
 * Tribes: "E2E Discover" (the W02 fixture, src/w02-fixture.ts) and "E2E Market" (W10's fixture,
 * read only). Both are launched on the dev Manager and named with the "E2E " prefix.
 */

const tribe = loadW02Fixture();

const search = (page: Page) => page.getByRole('searchbox', { name: 'Search tribes' });
const card = (page: Page, slug: string) => page.locator(`a[href="/dao/${slug}"]`);
const cards = (page: Page) => page.locator('main a[href^="/dao/"]');

async function openDiscover(page: Page, theme: string, query = '') {
  await page.goto(query ? `/discover?q=${encodeURIComponent(query)}` : '/discover');
  expect(await appliedTheme(page)).toBe(theme);
  await waitForVisible(page.getByRole('heading', { name: 'Discover', level: 1 }), 'Discover heading');
  await expect(page.getByText("Tribes didn't load")).toHaveCount(0);
}

/** The query in the address bar, so a search can be shared. */
const urlQuery = (page: Page) => new URL(page.url()).searchParams.get('q');

/** One flipped character in the middle keeps the shape of a contract ID but breaks its checksum. */
function breakChecksum(id: string) {
  const at = 28;
  return `${id.slice(0, at)}${id[at] === 'A' ? 'B' : 'A'}${id.slice(at + 1)}`;
}

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(buffer: Buffer) {
  expect(buffer.subarray(1, 4).toString('ascii'), 'share card is a PNG').toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test.describe('W02 discover and open a tribe', { tag: '@matrix' }, () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: E2E_BASE_URL });
    try {
      const [own, market] = await Promise.all([
        claimedSlug(request, tribe.slug),
        claimedSlug(request, MARKET_TRIBE.slug)
      ]);
      expect(own, `${tribe.slug} resolves to the fixture tribe`).toBe(tribe.daoId);
      expect(market).toMatch(/^C[A-Z2-7]{55}$/);
    } finally {
      await request.dispose();
    }
  });

  test('lists launched tribes and finds one by name or symbol', async ({ page, theme }) => {
    await openDiscover(page, theme);
    await waitForVisible(card(page, tribe.slug), `${tribe.name} card`);
    await expect(card(page, MARKET_TRIBE.slug)).toBeVisible();
    await expect(card(page, tribe.slug)).toContainText(tribe.description);
    await expectNoHorizontalScroll(page);

    // By name: case does not matter, and the query goes into the address bar.
    await search(page).fill(tribe.name.toLowerCase());
    await expect(card(page, tribe.slug)).toBeVisible();
    await expect(card(page, MARKET_TRIBE.slug)).toHaveCount(0);
    await expect.poll(() => urlQuery(page)).toBe(tribe.name.toLowerCase());

    // By symbol.
    await search(page).fill(MARKET_TRIBE.symbol);
    await expect(card(page, MARKET_TRIBE.slug)).toBeVisible();
    await expect(card(page, tribe.slug)).toHaveCount(0);

    // The shared prefix finds both walkthrough tribes.
    await search(page).fill('E2E ');
    await expect(card(page, tribe.slug)).toBeVisible();
    await expect(card(page, MARKET_TRIBE.slug)).toBeVisible();

    // Sorting A to Z puts "E2E Discover" before "E2E Market".
    await page.getByRole('combobox', { name: 'Sort' }).selectOption('name');
    const hrefs = await cards(page).evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    expect(hrefs.indexOf(`/dao/${tribe.slug}`)).toBeLessThan(hrefs.indexOf(`/dao/${MARKET_TRIBE.slug}`));
    await expectNoHorizontalScroll(page);

    // Clearing the search empties the address bar again.
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(search(page)).toHaveValue('');
    await expect.poll(() => urlQuery(page)).toBeNull();
  });

  test('finds a tribe by one of its contract IDs, from a shared link', async ({ page, theme }) => {
    await openDiscover(page, theme, tribe.treasury);
    await expect(search(page)).toHaveValue(tribe.treasury);
    await waitForVisible(page.getByRole('status').filter({ hasText: '1 tribe uses this contract' }), 'contract count');
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page, tribe.slug)).toContainText('Treasury');
    await expectNoHorizontalScroll(page);

    // A shortened ID, as the app shows it, finds it too.
    await search(page).fill(`${tribe.governor.slice(0, 4)}…${tribe.governor.slice(-4)}`);
    await expect(card(page, tribe.slug)).toBeVisible();
    await expect(card(page, tribe.slug)).toContainText('Governor');

    // Enter opens the only result.
    await search(page).press('Enter');
    await page.waitForURL(`**/dao/${tribe.slug}`);
    await waitForVisible(page.getByRole('heading', { name: tribe.name, level: 1 }), 'tribe home');
  });

  test('explains a search that finds nothing', async ({ page, theme }) => {
    await openDiscover(page, theme);
    await waitForVisible(card(page, tribe.slug), 'tribes listed');

    await search(page).fill('zz no such tribe zz');
    await waitForVisible(page.getByText('No tribe matches', { exact: true }), 'no match');
    await expect(cards(page)).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await search(page).fill(breakChecksum(tribe.treasury));
    await waitForVisible(page.getByText("That contract ID isn't valid"), 'malformed contract ID');

    // A wallet address is not a contract.
    await search(page).fill(tribe.founder);
    await waitForVisible(page.getByText("That's an account address"), 'account address');

    // A real contract that no tribe uses: the Manager.
    await search(page).fill(tribe.manager);
    await waitForVisible(page.getByText('No tribe uses this contract'), 'unknown contract');

    // The empty state's own button clears the search and brings every tribe back.
    await page.getByRole('main').getByRole('button', { name: 'Clear search' }).last().click();
    await expect(search(page)).toHaveValue('');
    await expect(card(page, tribe.slug)).toBeVisible();
  });

  test('opens a tribe by its slug and by its contract ID', async ({ page, theme }) => {
    await openDiscover(page, theme, tribe.name);
    await card(page, tribe.slug).click();
    await page.waitForURL(`**/dao/${tribe.slug}`);
    expect(await appliedTheme(page)).toBe(theme);
    await waitForVisible(page.getByRole('heading', { name: tribe.name, level: 1 }), 'tribe home by slug');
    await expect(page.getByText(tribe.description).first()).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(`^${tribe.name}`));
    await expectNoHorizontalScroll(page);

    // The token contract is the tribe's id; it opens the same tribe.
    await page.goto(`/dao/${tribe.daoId}`);
    await waitForVisible(page.getByRole('heading', { name: tribe.name, level: 1 }), 'tribe home by id');

    // And the other walkthrough tribe, read only.
    await page.goto(`/dao/${MARKET_TRIBE.slug}`);
    await waitForVisible(page.getByRole('heading', { name: MARKET_TRIBE.name, level: 1 }), 'market tribe home');
    await expectNoHorizontalScroll(page);
  });

  test('an unknown tribe link says so', async ({ page }) => {
    const response = await page.goto('/dao/e2e-no-such-tribe-w02');
    expect(response?.status()).toBe(404);
    // BUG-W02-1: this was a 500 and "Something went wrong".
    await waitForVisible(page.getByRole('heading', { name: 'Page not found', level: 1 }), 'not-found page');
    await expect(page.getByRole('link', { name: 'Find a tribe' })).toHaveAttribute('href', '/discover');
    await expectNoHorizontalScroll(page);
  });
});

test.describe('W02 share card', { tag: '@matrix' }, () => {
  test("a tribe link previews with the tribe's own card", async ({ page }) => {
    await page.goto(`/dao/${tribe.slug}`);
    await waitForVisible(page.getByRole('heading', { name: tribe.name, level: 1 }), 'tribe home');

    const meta = (property: string) => page.locator(`meta[property="${property}"]`).first().getAttribute('content');
    expect(await meta('og:title')).toBe(tribe.name);
    expect(await meta('og:description')).toBe(tribe.description);
    expect(await meta('og:image:width')).toBe('1200');
    expect(await meta('og:image:height')).toBe('630');
    expect(await meta('og:image:alt')).toMatch(/A tribe on Tribe Builder/);
    const image = await meta('og:image');
    expect(image, 'og:image').toBeTruthy();
    const url = new URL(image!);
    expect(url.pathname).toMatch(new RegExp(`^/dao/${tribe.slug}/opengraph-image`));

    // Fetch it from this server (the absolute URL names NEXT_PUBLIC_SITE_URL, which is this one).
    const response = await page.request.get(`${url.pathname}${url.search}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    // The brand card is the fallback for a data source that failed; a tribe card means it loaded.
    expect(response.headers()['x-share-card'], 'share card fell back to the brand card').toBeUndefined();
    const body = await response.body();
    expect(pngSize(body)).toEqual({ width: 1200, height: 630 });
    // WhatsApp skips previews larger than about 300 KB (lib/og/share-card.tsx).
    expect(body.byteLength).toBeLessThanOrEqual(300_000);
  });

  test('Discover and a section page have their own cards', async ({ page }) => {
    for (const [path, title] of [
      ['/discover', 'Discover tribes'],
      [`/dao/${tribe.slug}/treasury`, null]
    ] as const) {
      await page.goto(path);
      const image = await page.locator('meta[property="og:image"]').first().getAttribute('content');
      expect(image, `${path} og:image`).toBeTruthy();
      const url = new URL(image!);
      expect(url.pathname.startsWith(`${path}/opengraph-image`), `${path} card path`).toBe(true);
      const response = await page.request.get(`${url.pathname}${url.search}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/png');
      expect(response.headers()['x-share-card']).toBeUndefined();
      if (title) await expect(page).toHaveTitle(new RegExp(title));
    }
  });
});
