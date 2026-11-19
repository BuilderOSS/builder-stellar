import { test as base, expect, type Page } from '@playwright/test';

import { E2E_SIGN_BINDING } from '../../web/src/lib/e2e-wallet/protocol.ts';
import { E2E_IDENTITIES, type Identity, loadIdentity, timelineKeyName } from './identities.ts';
import { TESTNET_RPC_URL } from './network.ts';
import { E2ESigner, rpcAccountSequence } from './wallet/signer.ts';

/** localStorage key the app's theme runtime reads before first paint (apps/web/src/lib/warm-ink-theme.ts). */
export const THEME_KEY = 'builder.warm-ink.theme.v1';
/** Set so the first Connect goes straight to the wallet modal; W01 covers the intro separately. */
export const WALLET_INTRO_KEY = 'builder.wallet-intro.v1';

export type Theme = 'light' | 'dark';

type Options = {
  theme: Theme;
  /** Skip the "Before you connect" intro (it stays covered by W01's first case). */
  skipWalletIntro: boolean;
};

type Fixtures = {
  identities: Record<string, Identity>;
  wallet: E2ESigner;
};

/** A stable, test-unique address in 10.0.0.0/8 for the rate limiter. */
export function clientAddress(worker: number, testId: string) {
  let hash = 0;
  for (const char of testId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `10.${worker % 256}.${(hash >>> 8) % 256}.${hash % 256}`;
}

let cachedIdentities: Record<string, Identity> | null = null;

export const test = base.extend<Options & Fixtures>({
  theme: ['dark', { option: true }],
  skipWalletIntro: [true, { option: true }],

  identities: async ({}, use) => {
    // Keyed by role (e2e-founder, ...); with E2E_TIMELINE the key behind each role is the timeline's own.
    cachedIdentities ??= Object.fromEntries(
      E2E_IDENTITIES.map((role) => [role, { ...loadIdentity(timelineKeyName(role)), name: role }])
    );
    await use(cachedIdentities);
  },

  // One signer per test, attached to the whole browser context, so popups and navigations keep it.
  wallet: async ({ context, identities }, use) => {
    const signer = new E2ESigner(Object.values(identities), { accountSequence: rpcAccountSequence(TESTNET_RPC_URL) });
    signer.use('e2e-founder');
    await context.exposeBinding(E2E_SIGN_BINDING, (_source, request) => signer.handle(request));
    await use(signer);
  },

  page: async ({ page, theme, skipWalletIntro }, use, testInfo) => {
    // The app rate-limits sign-in per client address (apps/web/src/lib/auth/rate-limit.ts), and every
    // test comes from localhost. Each test is a different visitor, so it gets its own address.
    await page
      .context()
      .setExtraHTTPHeaders({ 'x-forwarded-for': clientAddress(testInfo.workerIndex, testInfo.testId) });
    await page.addInitScript(
      ({ themeKey, theme, introKey, skipIntro }) => {
        try {
          window.localStorage.setItem(themeKey, theme);
          if (skipIntro) window.localStorage.setItem(introKey, 'seen');
        } catch {
          /* storage denied: the app falls back to its defaults */
        }
      },
      { themeKey: THEME_KEY, theme, introKey: WALLET_INTRO_KEY, skipIntro: skipWalletIntro }
    );
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await use(page);
    test
      .info()
      .annotations.push(
        ...consoleErrors.map((description) => ({ type: 'console-error', description: description.slice(0, 500) }))
      );
  }
});

export { expect };

/** The applied theme on <html>, as the boot script set it. */
export async function appliedTheme(page: Page) {
  return page.locator('html').getAttribute('data-theme');
}

/**
 * No horizontal page scroll (§3.5). Measured against the root's client width, not `innerWidth`: with
 * mobile emulation, content wider than the screen widens the layout viewport itself, so `innerWidth`
 * grows with it and the overflow never showed.
 */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(0);
}

/**
 * Chain flows (@chain) call this first: they sign real transactions, so they run only against an e2e
 * Manager the preflight verified matches this checkout's contracts (globalSetup sets the status).
 */
export function requireVerifiedManager() {
  const status = process.env.E2E_MANAGER_STATUS;
  if (status !== 'verified') {
    throw new Error(
      `Chain flows need the dev Manager verified by the preflight (status: ${status ?? 'preflight skipped'}). ` +
        'See docs/qa/WALKTHROUGHS.md, "The dev Manager".'
    );
  }
}
