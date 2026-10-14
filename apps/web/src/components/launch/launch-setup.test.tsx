import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = `G${'A'.repeat(55)}`;
const state = vi.hoisted(() => ({
  address: '',
  readiness: undefined as unknown,
  artwork: undefined as unknown,
  drive: {} as Record<string, unknown>
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
      claimsContractId: '',
      status: 'pending'
    }
  };
  const current = () => ({ ...value, daoConfig: { ...value.daoConfig, ...state.drive } });
  return { useDaoContext: current, useOptionalDaoContext: current };
});
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector?: (s: unknown) => unknown) => {
    const session = {
      address: state.address,
      authStatus: 'authenticated',
      walletNetworkIssue: '',
      walletNetworkPassphrase: 'PASS'
    };
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
  claimsContractId: '',
  status: 'pending'
} as never;
const readiness = (patch: Record<string, unknown> = {}) => ({
  pending: { launch_admin: ADMIN, slug: 'lantern-club', auction_payment_asset: 'CA', marketplace_payment_asset: 'CA' },
  supply: 0n,
  admin: ADMIN,
  live: false,
  paymentAssetsMatch: true,
  assurance: null,
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
    state.drive = {};
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
    expect(html.replace(/<!-- -->/g, '')).toContain(
      'Your link /dao/lantern-club is claimed. Changing it later takes a vote.'
    );
  });

  it('adds the rename step when another community took the link', () => {
    state.readiness = readiness({ supply: 1n, slugTaken: true });
    state.artwork = artwork(1);
    const html = render();
    expect(html).toContain('Pick a new link');
    expect(html).toContain('Rename form');
    expect(launchButton(html)).toContain('disabled');
  });

  it('replaces the launch action with the drive while a launch drive is open', () => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400);
    state.readiness = readiness({
      supply: 2n,
      admin: 'CTREASURY',
      assurance: {
        claim_minter: 'CCLAIMS',
        deadline,
        list_id: 0,
        launch_config: { launch_auction: true, launch_marketplace: false }
      }
    });
    state.artwork = artwork(1);
    const html = render().replace(/<!-- -->/g, '');
    expect(html).toContain('Launch drive open');
    expect(html).toContain('At launch: auctions start.');
    expect(html).toContain('See the drive');
    expect(html).not.toContain('Launch Lantern Club');
    expect(html).not.toContain('Review (optional)');
  });

  it('shows visitors the drive too, not "being set up"', () => {
    state.address = `G${'B'.repeat(55)}`;
    state.readiness = readiness({
      supply: 2n,
      assurance: {
        claim_minter: 'CCLAIMS',
        deadline: BigInt(Math.floor(Date.now() / 1000) + 86_400),
        list_id: 0,
        launch_config: { launch_auction: false, launch_marketplace: false }
      }
    });
    const html = render();
    expect(html).toContain('Launch drive open');
    expect(html).not.toContain('is being set up');
  });

  it('points to refunds once the drive deadline has passed', () => {
    state.readiness = readiness({
      supply: 2n,
      assurance: {
        claim_minter: 'CCLAIMS',
        deadline: BigInt(Math.floor(Date.now() / 1000) - 60),
        list_id: 0,
        launch_config: { launch_auction: false, launch_marketplace: false }
      }
    });
    const html = render();
    expect(html).toContain('The launch drive ended');
    expect(html).toContain('Go to refunds');
    expect(html).not.toContain('Launch Lantern Club');
    expect(html).not.toContain('Free the link');
  });

  describe('freeing the link of a failed drive', () => {
    const endedDrive = () => {
      const deadline = Math.floor(Date.now() / 1000) - 60;
      state.readiness = readiness({
        supply: 2n,
        assurance: {
          claim_minter: 'CCLAIMS',
          deadline: BigInt(deadline),
          list_id: 0,
          launch_config: { launch_auction: false, launch_marketplace: false }
        }
      });
      state.drive = {
        passphrase: 'PASS',
        tokenContractId: 'CDAO',
        assuranceOutcome: 'open',
        assuranceDeadline: deadline
      };
    };

    it('offers it next to the refunds, to the launch admin and to visitors', () => {
      endedDrive();
      for (const address of [ADMIN, `G${'B'.repeat(55)}`]) {
        state.address = address;
        const html = render().replace(/<!-- -->/g, '');
        expect(html).toContain('Go to refunds');
        expect(html).toContain('Free the link');
      }
    });

    it('hides it once the indexed outcome is released', () => {
      endedDrive();
      state.drive = { ...state.drive, assuranceOutcome: 'released' };
      const html = render();
      expect(html).toContain('The launch drive ended');
      expect(html).not.toContain('Free the link');
    });

    it('never offers it while the drive is open', () => {
      endedDrive();
      const deadline = Math.floor(Date.now() / 1000) + 86_400;
      state.readiness = readiness({
        supply: 2n,
        assurance: {
          claim_minter: 'CCLAIMS',
          deadline: BigInt(deadline),
          list_id: 0,
          launch_config: { launch_auction: false, launch_marketplace: false }
        }
      });
      state.drive = { ...state.drive, assuranceDeadline: deadline };
      expect(render()).not.toContain('Free the link');
    });
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
