import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = `G${'A'.repeat(55)}`;
const state = vi.hoisted(() => ({
  address: '',
  readiness: undefined as unknown,
  artwork: undefined as unknown
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/contexts/dao-context', () => {
  const value = {
    daoId: 'CDAO',
    routeId: 'lantern-club',
    daoConfig: {
      name: 'testnet',
      tokenName: 'Lantern Club',
      launchAdmin: `G${'A'.repeat(55)}`,
      auctionContractId: 'CAUCTION',
      marketplaceContractId: '',
      minterContractId: '',
      status: 'pending'
    }
  };
  return { useDaoContext: () => value, useOptionalDaoContext: () => value };
});
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector?: (s: unknown) => unknown) => {
    const session = { address: state.address, authStatus: 'authenticated', walletNetworkIssue: '' };
    return selector ? selector(session) : session;
  }
}));
vi.mock('swr', () => ({
  default: (key: unknown) => ({
    data: Array.isArray(key) && key[0] === 'launch-readiness' ? state.readiness : undefined,
    error: undefined,
    isValidating: false,
    mutate: vi.fn()
  })
}));
vi.mock('@/lib/admin-surfaces', () => ({ useAdminArtwork: () => ({ data: state.artwork, mutate: vi.fn() }) }));
vi.mock('@/lib/admin-queries', () => ({ useGovernorSettings: () => ({ data: undefined }) }));
vi.mock('@/lib/use-dao-deployment', () => ({ useDaoDeployment: () => ({ launchDao: vi.fn() }) }));
vi.mock('@/lib/deployment-config', () => ({
  getDeploymentConfig: () => ({ name: 'testnet', managerAddress: 'CMANAGER' })
}));
vi.mock('@/components/create-dao/launch-readiness', () => ({
  readLaunchReadiness: vi.fn(),
  launchReadinessIssues: () => []
}));
vi.mock('@/components/create-dao/SlugRename', () => ({ SlugRename: () => <div>Rename form</div> }));
vi.mock('@/stores/create-dao-store', () => {
  const store = Object.assign(() => [], { persist: { rehydrate: async () => {} }, getState: () => ({ drafts: [] }) });
  return { useCreateDaoStore: store };
});
vi.mock('@/stores/local-preferences-store', () => {
  const prefs = { launches: {}, setLaunch: vi.fn() };
  const store = Object.assign((selector: (s: typeof prefs) => unknown) => selector(prefs), {
    persist: { rehydrate: async () => {} },
    getState: () => prefs
  });
  return { useLocalPreferencesStore: store, preferenceScopeKey: () => 'scope', assertPreferencesSaved: () => {} };
});

import { LaunchSetup } from './launch-setup';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const config = {
  name: 'testnet',
  tokenName: 'Lantern Club',
  launchAdmin: ADMIN,
  auctionContractId: 'CAUCTION',
  marketplaceContractId: '',
  minterContractId: '',
  status: 'pending'
} as never;
const readiness = (patch: Record<string, unknown> = {}) => ({
  pending: { launch_admin: ADMIN, slug: 'lantern-club', auction_payment_asset: 'CA', marketplace_payment_asset: 'CA' },
  supply: 0n,
  admin: ADMIN,
  live: false,
  paymentAssetsMatch: true,
  platformMinter: null,
  slugTaken: false,
  ...patch
});
const artwork = (layers: number) => ({ properties: Array.from({ length: layers }, (_, id) => ({ id, count: 4 })) });
const render = () => renderToStaticMarkup(<LaunchSetup daoId="CDAO" config={config} />);
const launchButton = (html: string) =>
  html.match(/<button[^>]*>(?:(?!<\/button>).)*Launch Lantern Club<\/button>/s)?.[0] ?? '';

describe('LaunchSetup', () => {
  beforeEach(() => {
    state.address = ADMIN;
    state.readiness = readiness();
    state.artwork = artwork(0);
  });

  it('starts with artwork as the clear first step, and launch disabled with a reason', () => {
    const html = render();
    expect(html).toContain('0 of 2 required steps done');
    expect(html).toContain('Add artwork');
    expect(html).toContain('Add artwork first so founder tokens get traits.');
    expect(launchButton(html)).toContain('disabled');
    expect(html).toContain('Add your artwork first.');
  });

  it('marks done steps with what is there and enables launch', () => {
    state.readiness = readiness({ supply: 3n });
    state.artwork = artwork(2);
    const html = render();
    expect(html).toContain('All required steps done');
    expect(html).toContain('2 layers · 8 traits');
    expect(html).toContain('3 tokens minted');
    // Saved launch choices load in an effect, so a static render can't show the button enabled;
    // the hint comes from the same plan that enables it.
    expect(html).toContain('Ready when you are.');
    expect(html).not.toContain('first.');
    expect(html.replace(/<!-- -->/g, '')).toContain('Your link /dao/lantern-club becomes permanent.');
  });

  it('adds the rename step when another community took the link', () => {
    state.readiness = readiness({ supply: 1n, slugTaken: true });
    state.artwork = artwork(1);
    const html = render();
    expect(html).toContain('Pick a new link');
    expect(html).toContain('Rename form');
    expect(launchButton(html)).toContain('disabled');
  });

  it('shows visitors progress only, never the launch controls', () => {
    state.address = `G${'B'.repeat(55)}`;
    const html = render();
    expect(html).toContain('Lantern Club is being set up');
    expect(html).toContain('0 of 2 required steps done');
    expect(html).not.toContain('Launch Lantern Club');
    expect(html).not.toContain('Add artwork');
  });
});
