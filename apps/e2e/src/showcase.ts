// The Lamplight showcase tribe (docs/qa/SHOWCASE_TRIBE.md): its identity, the ids the capture specs
// record as the story moves on, and helpers to pause the app at a moment worth photographing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page, Route } from '@playwright/test';

import { allowAddresses } from './capture.ts';
import { E2E_IDENTITIES, loadIdentity, timelineKeyName } from './identities.ts';
import { E2E_ROOT } from './run.ts';
import { TESTNET_RPC_URL } from './network.ts';

export const SHOWCASE = {
  name: 'Lamplight',
  symbol: 'LAMP',
  slug: 'lamplight',
  description:
    'Lamplight is a circle of lantern makers. Each member holds a lantern token, and each token is one vote. Together we decide what to make, which workshops to run and how to use the shared treasury.\n\nThis is an example tribe on Stellar testnet, used in the Tribe Builder guides.',
  links: [
    { label: 'Guides', url: 'https://docs.tribes.build' },
    { label: 'Tribe Builder', url: 'https://tribes.build' }
  ]
} as const;

export const FIXTURES = join(E2E_ROOT, 'fixtures/showcase');
export const COVER_IMAGE = join(FIXTURES, 'cover.png');
export const ART_DIR = join(FIXTURES, 'art');
const STATE_FILE = join(FIXTURES, 'state.json');

/** What the story has made so far, so later specs can pick up where earlier ones stopped. */
export type ShowcaseState = {
  daoId?: string;
  launched?: boolean;
  proposals?: Record<string, string>;
  [key: string]: unknown;
};

export function showcaseState(): ShowcaseState {
  return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as ShowcaseState) : {};
}

export function saveShowcaseState(update: (state: ShowcaseState) => void) {
  const state = showcaseState();
  update(state);
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

/** Lamplight in the shape the W09 helpers take (src/w09/fixture.ts `Tribe`), opened by id. */
export function lamplight() {
  const { daoId, addresses } = showcaseState() as ShowcaseState & { addresses?: Record<string, string> };
  if (!daoId || !addresses) throw new Error('No Lamplight tribe yet: run capture/01-create.capture.ts first.');
  return {
    name: 'manage' as const,
    launchSlug: SHOWCASE.slug,
    launched: Boolean(showcaseState().launched),
    daoId,
    token: daoId,
    treasury: addresses.treasury!,
    governor: addresses.governor!,
    metadata: addresses.metadata!,
    auction: addresses.auction,
    marketplace: addresses.marketplace,
    claims: addresses.claims ?? addresses.claimMinter,
    path: (section = '') => `/dao/${daoId}${section ? `/${section}` : ''}`,
    api: (section = '') => `/api/dao/${daoId}${section ? `/${section}` : ''}`
  };
}

export function requireDao(): string {
  const { daoId } = showcaseState();
  if (!daoId) throw new Error('No Lamplight tribe yet: run capture/01-create.capture.ts first.');
  return daoId;
}

/** The showcase's own test keys, by role, and permission for them to appear in screenshots. */
export function showcaseIdentities() {
  const identities = Object.fromEntries(
    E2E_IDENTITIES.map((role) => [role, loadIdentity(timelineKeyName(role)).address])
  );
  allowAddresses(Object.values(identities));
  return identities as Record<(typeof E2E_IDENTITIES)[number], string>;
}

/**
 * Holds the app's `getTransaction` polls to the RPC until `release()`, so a "Confirming on the
 * network" state stays on screen for its photograph. The transaction itself goes through as normal.
 */
export async function holdConfirmation(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let held = false;
  const handler = async (route: Route) => {
    const body = route.request().postData() ?? '';
    if (route.request().method() === 'POST' && body.includes('"getTransaction"')) {
      held = true;
      await gate;
    }
    // Unrouting lets held requests through on its own; a second continue would throw.
    await route.continue().catch(() => undefined);
  };
  const pattern = `${new URL(TESTNET_RPC_URL).origin}/**`;
  await page.route(pattern, handler);
  return {
    held: () => held,
    release: async () => {
      release();
      await page.unroute(pattern, handler);
    }
  };
}

/** Answers `path` with 404 until `release()`, e.g. to keep a "Created" panel up before the app moves on. */
export async function holdApi(page: Page, path: RegExp) {
  let open = false;
  const handler = async (route: Route) => {
    if (!open && path.test(new URL(route.request().url()).pathname)) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"held for capture"}' });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/**', handler);
  return {
    release: async () => {
      open = true;
      await page.unroute('**/api/**', handler);
    }
  };
}
