// Docs screenshots (plan §5.6, docs/qa/SHOWCASE_TRIBE.md). A capture spec drives the app to a real
// state once, then `snap` photographs that same page at desktop and mobile in light and dark:
//   apps/docs/public/shots/<id>/{desktop,mobile}-{light,dark}.webp and manifest.json
// The theme is switched the way the app's own Appearance menu does it (packages/design-tokens
// theme.ts: localStorage, [data-theme] with transitions suppressed, then the theme event), so every
// image is the app in that theme, never a recolouring. The device is a viewport resize of the same page.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { THEME_KEY, type Theme } from './fixtures.ts';
import { latestLedger } from './waits.ts';
import { E2E_ROOT } from './run.ts';

// sharp comes from apps/web (Next depends on it); only its WebP encode is used here.
type Sharp = (input: Buffer) => { webp(options: { quality: number; effort: number }): { toBuffer(): Promise<Buffer> } };
const sharp = createRequire(join(E2E_ROOT, '../web/package.json'))('sharp') as Sharp;

export const SHOTS_DIR = join(E2E_ROOT, '../docs/public/shots');
export const CAPTURE_DEVICES = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 }
} as const;
export type CaptureDevice = keyof typeof CAPTURE_DEVICES;
/** Context device scale factor for the capture project (playwright.config.ts). */
export const CAPTURE_SCALE = 2;
const THEMES: Theme[] = ['light', 'dark'];
const ID_PATTERN = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

type Box = { x: number; y: number; w: number; h: number };
type Marker = { label: string; locator: Locator };

export type SnapOptions = {
  /** Elements to ring, in step order. Each needs an accessible description ("the Bid button"). */
  markers?: Marker[];
  /** Scrolled to the middle of the viewport before each device's photo. Defaults to the first marker. */
  focus?: Locator;
  /** Re-run after each resize, for state that a breakpoint change resets (an open menu, say). */
  prepare?: (page: Page, device: CaptureDevice) => Promise<void>;
  /** Only these devices; the docs show a device only when both its themes exist. */
  devices?: CaptureDevice[];
  /** Scroll to the top instead of to the focus (page overviews). */
  top?: boolean;
  /** Keep toasts in the photo. They are hidden by default: they are transient and cover the page. */
  toasts?: boolean;
};

let appCommit: string | null = null;
function commit() {
  appCommit ??=
    process.env.E2E_APP_COMMIT?.trim() ||
    execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: E2E_ROOT, encoding: 'utf8' }).trim();
  return appCommit;
}

/** Same steps as saveThemePreference in packages/design-tokens/src/theme.ts. */
async function applyTheme(page: Page, theme: Theme) {
  await page.evaluate(
    ({ key, theme }) => {
      try {
        window.localStorage.setItem(key, theme);
      } catch {
        /* storage denied */
      }
      const root = document.documentElement;
      root.setAttribute('data-theme-switching', '');
      root.dataset.theme = theme;
      root.dataset.themePreference = theme;
      void root.offsetHeight;
      window.dispatchEvent(new Event('builder:warm-ink-theme'));
    },
    { key: THEME_KEY, theme }
  );
  await settle(page);
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme-switching'));
}

/** Fonts loaded, images decoded, two frames painted, and no running animations. */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images)
        .filter((image) => image.loading !== 'lazy' || image.getBoundingClientRect().top < window.innerHeight)
        .map((image) => (image.complete ? null : image.decode().catch(() => null)))
    );
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish();
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/**
 * Waits until no loading skeleton is visible. Panda hashes class names, so a skeleton is found by
 * its background, the `skeleton` colour token (components/ui/skeleton.tsx). A page still loading
 * after the budget fails the shot rather than shipping placeholders.
 */
export async function waitForContent(page: Page, id: string, timeoutMs = 60_000) {
  const count = () =>
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.background = 'var(--colors-skeleton)';
      document.body.appendChild(probe);
      const skeleton = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const onScreen = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      };
      const placeholders = Array.from(document.querySelectorAll<HTMLElement>('span[aria-hidden="true"]')).filter(
        (el) => getComputedStyle(el).backgroundColor === skeleton && onScreen(el)
      ).length;
      // Loading lines: "Loading your tokens…", "Checking your payment account…", "Refreshing…".
      const loading = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((el) => {
        if (el.children.length || !onScreen(el)) return false;
        return /^(Loading|Checking|Refreshing)\b[^.]*…$/.test((el.textContent ?? '').trim());
      }).length;
      return placeholders + loading;
    });
  const until = Date.now() + timeoutMs;
  let left = await count();
  while (left > 0 && Date.now() < until) {
    await page.waitForTimeout(500);
    left = await count();
  }
  if (left > 0) throw new Error(`Shot ${id}: ${left} loading placeholders still on screen after ${timeoutMs / 1000}s.`);
}

/** Test accounts only: a full G… address on the page that isn't a known test key fails the capture. */
async function checkAddresses(page: Page, allowed: ReadonlySet<string>, id: string) {
  const found: string[] = await page.evaluate(() => {
    const text = `${document.body.innerText} ${Array.from(
      document.querySelectorAll('[href],[title],[aria-label],input')
    )
      .map((el) =>
        [
          el.getAttribute('href'),
          el.getAttribute('title'),
          el.getAttribute('aria-label'),
          (el as HTMLInputElement).value
        ].join(' ')
      )
      .join(' ')}`;
    return Array.from(new Set(text.match(/\bG[A-Z2-7]{55}\b/g) ?? []));
  });
  const unknown = found.filter((address) => !allowed.has(address));
  if (unknown.length)
    throw new Error(`Shot ${id}: unknown account on the page (${unknown.join(', ')}); only test keys may appear.`);
}

// Public asset issuers (USDC and the like) show on summary pages; they are not people.
const ISSUERS = (() => {
  try {
    return readFileSync(join(E2E_ROOT, '../web/src/lib/assets-config.ts'), 'utf8').match(/\bG[A-Z2-7]{55}\b/g) ?? [];
  } catch {
    return [];
  }
})();
// The dev Manager's admin, the platform's own testnet key, shows on the platform page.
const PLATFORM_ADMIN = (() => {
  try {
    return [execFileSync('stellar', ['keys', 'address', 'testnet-admin'], { encoding: 'utf8' }).trim()];
  } catch {
    return [];
  }
})();
let allowedAddresses: ReadonlySet<string> = new Set([...ISSUERS, ...PLATFORM_ADMIN]);
export function allowAddresses(addresses: Iterable<string>) {
  allowedAddresses = new Set([...allowedAddresses, ...addresses]);
}

async function markerBox(
  locator: Locator,
  viewport: { width: number; height: number },
  id: string,
  label: string
): Promise<Box> {
  let rect = await locator.boundingBox();
  if (!rect) throw new Error(`Shot ${id}: marker "${label}" isn't visible.`);
  // A visually hidden control (a card's radio input) rings its label, the card a person sees.
  if (rect.width < 8 || rect.height < 8) {
    rect =
      (await locator.evaluate((el) => {
        const card = el.closest('label') ?? el.parentElement;
        const r = card?.getBoundingClientRect();
        return r && r.width >= 8 && r.height >= 8 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      })) ?? rect;
  }
  const box = {
    x: rect.x / viewport.width,
    y: rect.y / viewport.height,
    w: rect.width / viewport.width,
    h: rect.height / viewport.height
  };
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  const inside = box.x >= 0 && box.y >= 0 && box.x + box.w <= 1 && box.y + box.h <= 1 && box.w > 0 && box.h > 0;
  if (!inside)
    throw new Error(
      `Shot ${id}: marker "${label}" falls outside the ${viewport.width}px image (${JSON.stringify(box)}).`
    );
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}

/**
 * Photographs the page as it is now. Leaves it at desktop size in the theme it started in.
 */
export async function snap(page: Page, id: string, options: SnapOptions = {}) {
  if (!ID_PATTERN.test(id)) throw new Error(`Shot id "${id}" must be lower-case path segments.`);
  const devices = options.devices ?? (['desktop', 'mobile'] as CaptureDevice[]);
  const markers = options.markers ?? [];
  const focus = options.focus ?? markers[0]?.locator;
  const startTheme = ((await page.locator('html').getAttribute('data-theme')) as Theme | null) ?? 'dark';
  const startSize = page.viewportSize() ?? CAPTURE_DEVICES.desktop;
  const dir = join(SHOTS_DIR, id);
  mkdirSync(dir, { recursive: true });

  const variants: Record<string, unknown> = {};
  const boxes: Record<string, Partial<Record<CaptureDevice, Box>>> = {};
  const hideToasts = options.toasts
    ? null
    : await page.addStyleTag({ content: '[data-scope="toast"]{visibility:hidden !important}' });
  try {
    for (const device of devices) {
      const viewport = CAPTURE_DEVICES[device];
      await page.setViewportSize(viewport);
      await settle(page);
      if (options.prepare) await options.prepare(page, device);
      if (options.top) await page.evaluate(() => window.scrollTo(0, 0));
      else if (focus) {
        await focus.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
      }
      await waitForContent(page, id);
      await checkAddresses(page, allowedAddresses, id);
      for (const theme of THEMES) {
        await applyTheme(page, theme);
        const png = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'device' });
        const webp = await sharp(png).webp({ quality: 80, effort: 5 }).toBuffer();
        writeFileSync(join(dir, `${device}-${theme}.webp`), webp);
      }
      for (const marker of markers) {
        (boxes[marker.label] ??= {})[device] = await markerBox(marker.locator, viewport, id, marker.label);
      }
      variants[device] = { width: viewport.width * CAPTURE_SCALE, height: viewport.height * CAPTURE_SCALE, viewport };
    }
  } finally {
    await hideToasts?.evaluate((el) => (el as Element).remove()).catch(() => undefined);
    await page.setViewportSize(startSize);
    await applyTheme(page, startTheme);
  }

  let ledger: number | undefined;
  try {
    ledger = (await latestLedger()).sequence;
  } catch {
    ledger = undefined;
  }
  const manifest = {
    id,
    appCommit: commit(),
    ...(ledger ? { ledger } : {}),
    capturedAt: new Date().toISOString(),
    variants,
    ...(markers.length
      ? { markers: markers.map((marker, index) => ({ n: index + 1, label: marker.label, box: boxes[marker.label] })) }
      : {})
  };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
