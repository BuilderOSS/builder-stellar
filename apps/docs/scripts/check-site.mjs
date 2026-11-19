// Checks every page of the static export (pnpm build first) at 375, 768 and 1440px in
// light and dark: no horizontal scroll, no console errors, and no serious or critical axe
// issues (docs plan §5.4c). Then it walks the interactive states with the keyboard and
// touch: search, the nav sheet, the skip link, the screenshot toggle and 44px targets.
// Exits 1 on any failure.
//
// Chromium: PLAYWRIGHT_CHROMIUM_PATH, or the browser `playwright-core install chromium` fetched.
// Options: --only=/path/,/other/ to check a subset.
import fs from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright-core';

import { startServer } from './serve.mjs';

const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'out');
if (!fs.existsSync(out)) {
  console.error('No out/ directory: run pnpm --dir apps/docs build first.');
  process.exit(1);
}

function routes(dir = out, prefix = '/') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (['_next', 'pagefind', 'shots'].includes(entry.name)) return [];
      return routes(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    }
    return entry.name === 'index.html' ? [prefix] : [];
  });
}

const only = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice(7)
  .split(',');
const pages = [...(only ?? routes()), '/this-page-does-not-exist/'];
const widths = [375, 768, 1440];
const themes = ['light', 'dark'];
const port = 4399;
const server = await startServer(port);
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const failures = [];

for (const theme of themes) {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 812 : 900 },
      colorScheme: theme,
      reducedMotion: 'reduce'
    });
    // The reader's choice, as the theme control saves it.
    await context.addInitScript((value) => localStorage.setItem('builder.warm-ink.theme.v1', value), theme);
    for (const route of pages) {
      const page = await context.newPage();
      const errors = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && !/Failed to load resource.*404/.test(message.text()))
          errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'networkidle' });
      const label = `${route} @${width} ${theme}`;
      const applied = await page.evaluate(() => document.documentElement.dataset.theme);
      if (applied !== theme) failures.push(`${label}: data-theme is ${applied}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) failures.push(`${label}: horizontal scroll of ${overflow}px`);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      for (const violation of violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) {
        failures.push(
          `${label}: axe ${violation.id} (${violation.impact}) on ${violation.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(', ')}`
        );
      }
      for (const error of errors) failures.push(`${label}: console error ${error}`);
      await page.close();
    }
    await context.close();
    console.info(`Checked ${pages.length} pages at ${width}px in ${theme}.`);
  }
}

// Interactive states, in both themes.
const base = `http://localhost:${port}`;
const guide = `${base}/guides/proposals/vote/`;
async function axe(page, label) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  for (const violation of violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) {
    failures.push(
      `${label}: axe ${violation.id} (${violation.impact}) on ${violation.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(', ')}`
    );
  }
}
function expect(ok, label) {
  if (!ok) failures.push(label);
}
const inDialog = () => Boolean(document.activeElement?.closest('[role=dialog]'));

for (const theme of themes) {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
    reducedMotion: 'reduce'
  });
  await desktop.addInitScript((value) => localStorage.setItem('builder.warm-ink.theme.v1', value), theme);
  let page = await desktop.newPage();
  await page.goto(guide, { waitUntil: 'networkidle' });

  // Skip link first in the tab order, and it lands on main.
  await page.keyboard.press('Tab');
  expect(
    (await page.evaluate(() => document.activeElement?.textContent)) === 'Skip to content',
    `${theme}: the first Tab doesn't reach "Skip to content"`
  );
  await page.keyboard.press('Enter');
  expect((await page.evaluate(() => location.hash)) === '#content', `${theme}: the skip link doesn't go to #content`);

  // Search: Ctrl K opens with focus in the field; results as you type; arrows and Enter open one.
  await page.keyboard.press('Control+k');
  const field = page.getByRole('combobox', { name: 'Search the docs' });
  await field.waitFor();
  expect(
    await field.evaluate((node) => node === document.activeElement),
    `${theme}: Ctrl K doesn't focus the search field`
  );
  await field.fill('delegate');
  await page
    .getByRole('option')
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => failures.push(`${theme}: no results for "delegate"`));
  await axe(page, `search results ${theme}`);
  // Focus stays in the dialog.
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(inDialog), `${theme}: Tab leaves the open search dialog`);
  await field.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page
    .waitForURL((url) => url.pathname !== '/guides/proposals/vote/', { timeout: 5000 })
    .catch(() => failures.push(`${theme}: Enter doesn't open a result`));

  // Escape closes and focus returns to the trigger.
  await page.goto(guide, { waitUntil: 'networkidle' });
  const trigger = page
    .getByRole('banner')
    .getByRole('button', { name: /^Search/ })
    .first();
  await trigger.click();
  await field.waitFor();
  await field.fill('zzqxv');
  await page
    .getByText('No pages match')
    .waitFor({ timeout: 5000 })
    .catch(() => failures.push(`${theme}: no "No pages match" state`));
  await axe(page, `search empty ${theme}`);
  await page.keyboard.press('Escape');
  await field.waitFor({ state: 'detached' });
  expect(
    await trigger.evaluate((node) => node === document.activeElement),
    `${theme}: Escape doesn't return focus to the search button`
  );

  // The index failing to load shows the error state.
  await page.route('**/pagefind/**', (route) => route.abort());
  page = await desktop.newPage();
  await page.route('**/pagefind/**', (route) => route.abort());
  await page.goto(guide, { waitUntil: 'networkidle' });
  await page.keyboard.press('/');
  await field.waitFor().catch(() => {});
  await page.getByRole('combobox', { name: 'Search the docs' }).fill('vote');
  await page
    .getByText('Search isn’t available right now.')
    .waitFor({ timeout: 5000 })
    .catch(() => failures.push(`${theme}: no error state when the index fails`));
  await desktop.close();

  // Phone: touch targets, the nav sheet, and the screenshot device toggle.
  const phone = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
    reducedMotion: 'reduce'
  });
  await phone.addInitScript((value) => localStorage.setItem('builder.warm-ink.theme.v1', value), theme);
  page = await phone.newPage();
  await page.goto(guide, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Menu' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Docs' });
  await sheet.waitFor();
  await page.waitForTimeout(400);
  expect(
    (await sheet.locator('a[aria-current=page]').count()) === 1,
    `${theme}: the nav sheet doesn't mark the current page`
  );
  const currentBox = await sheet.locator('a[aria-current=page]').boundingBox();
  expect(
    currentBox !== null && currentBox.y > 0 && currentBox.y + currentBox.height < 812,
    `${theme}: the current page is out of view in the nav sheet`
  );
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'header a, header button, [role=dialog] a, [role=dialog] button, [role=dialog] [data-part=item], [data-shot] [data-part=item], nav[aria-label="Previous and next"] a'
      )
    ]
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => ({
        name: (node.textContent || node.getAttribute('aria-label') || '').trim().slice(0, 40),
        height: node.getBoundingClientRect().height
      }))
      .filter((target) => target.height < 44)
  );
  for (const target of small) failures.push(`${theme}: touch target "${target.name}" is ${target.height}px tall`);
  await axe(page, `nav sheet ${theme}`);
  await sheet.getByRole('link', { name: 'Delegate your votes' }).tap();
  await page.waitForURL('**/guides/members/delegate/');
  await sheet
    .waitFor({ state: 'detached', timeout: 3000 })
    .catch(() => failures.push(`${theme}: the nav sheet stays open after navigating`));

  await page.goto(`${base}/preview/shot/`, { waitUntil: 'networkidle' });
  const visible = (device) =>
    page.locator(`[data-shot="_preview/design-catalogue"] [data-device=${device}]`).isVisible();
  expect(
    (await visible('mobile')) && !(await visible('desktop')),
    `${theme}: a phone doesn't get the mobile screenshot`
  );
  await page.getByRole('radio', { name: 'Show desktop' }).first().tap({ force: true });
  expect(
    (await visible('desktop')) && !(await visible('mobile')),
    `${theme}: "Show desktop" doesn't switch the screenshot`
  );
  await page.reload({ waitUntil: 'networkidle' });
  expect(await visible('desktop'), `${theme}: the screenshot choice isn't kept for the session`);
  const loaded = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-shot] img')].filter(
        (img) => img.complete && img.naturalWidth > 0 && img.checkVisibility()
      ).length
  );
  expect(loaded === 1, `${theme}: ${loaded} screenshot images visible, expected exactly 1 (theme and device)`);
  await phone.close();
  console.info(`Checked the interactive states in ${theme}.`);
}

await browser.close();
server.close();
if (failures.length > 0) {
  console.error(`\n${failures.length} problems:\n${failures.join('\n')}`);
  process.exit(1);
}
console.info(`All ${pages.length * widths.length * themes.length} checks passed.`);
