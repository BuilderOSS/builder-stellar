import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';

import { type LaunchReadiness, launchReadinessIssues, readLaunchReadiness } from './launch-readiness';

const mocks = vi.hoisted(() => ({
  pending: vi.fn(),
  supply: vi.fn(),
  admin: vi.fn(),
  live: vi.fn(),
  minter: vi.fn(),
  auction: vi.fn(),
  marketplace: vi.fn()
}));
vi.mock('@builder-stellar/manager-bindings', () => ({
  Client: class {
    get_pending_dao = mocks.pending;
    get_platform_minter = mocks.minter;
    get_dao_by_slug = async () => ({ result: { isOk: () => false, unwrap: () => '' } });
  }
}));
vi.mock('@builder-stellar/token-bindings', () => ({
  Client: class {
    total_supply = mocks.supply;
    admin = mocks.admin;
    is_live = mocks.live;
  }
}));
vi.mock('@builder-stellar/auction-bindings', () => ({
  Client: class {
    get_config = mocks.auction;
  }
}));
vi.mock('@builder-stellar/marketplace-bindings', () => ({
  Client: class {
    get_config = mocks.marketplace;
  }
}));
vi.mock('@/lib/deployment-config', () => ({
  getDeploymentConfig: () => ({ name: 'testnet', managerAddress: 'manager-A' })
}));
const addresses = {
  token: 'dao-A',
  auction: 'auction-A',
  marketplace: 'market-A',
  governor: 'gov-A',
  treasury: 'treasury-A',
  metadata: 'metadata-A'
};
const ready = (): LaunchReadiness => ({
  pending: {
    addresses,
    launch_admin: 'wallet-A',
    auction_payment_asset: 'xlm',
    marketplace_payment_asset: 'usdc',
    slug: 'test-dao'
  },
  supply: 1n,
  admin: 'wallet-A',
  live: false,
  paymentAssetsMatch: true,
  platformMinter: null,
  slugTaken: false
});
const config = { name: 'testnet', rpcUrl: 'https://rpc.test', passphrase: 'test' } as DaoNetworkConfig;
beforeEach(() => {
  mocks.pending.mockResolvedValue({ result: ready().pending });
  mocks.supply.mockResolvedValue({ result: 1n });
  mocks.admin.mockResolvedValue({ result: 'wallet-A' });
  mocks.live.mockResolvedValue({ result: false });
  mocks.minter.mockResolvedValue({ result: null });
  mocks.auction.mockResolvedValue({ result: { payment_token: 'xlm' } });
  mocks.marketplace.mockResolvedValue({ result: { payment_asset: 'usdc' } });
});
describe('live launch readiness', () => {
  it('does not require indexed auctionEnabled (null in Setup) or a platform minter', async () => {
    const result = await readLaunchReadiness('dao-A', { ...config, auctionEnabled: null });
    expect(launchReadinessIssues(result, 'wallet-A')).toEqual([]);
    expect(mocks.supply).toHaveBeenCalled();
  });
  it('requires nonzero actual supply, even with auction launch selected', () => {
    expect(launchReadinessIssues({ ...ready(), supply: 0n }, 'wallet-A')).toContain(
      'Mint at least one founder token before launch.'
    );
  });
  it('requires both payment assets to match, even for disabled modules', async () => {
    mocks.marketplace.mockResolvedValue({ result: { payment_asset: 'changed' } });
    expect((await readLaunchReadiness('dao-A', config)).paymentAssetsMatch).toBe(false);
  });
  it('fails closed if any live read fails', async () => {
    mocks.supply.mockRejectedValueOnce(new Error('RPC unavailable'));
    await expect(readLaunchReadiness('dao-A', config)).rejects.toThrow('RPC unavailable');
  });
  it('rejects cross-network and cross-DAO Manager state', async () => {
    await expect(readLaunchReadiness('dao-A', { ...config, name: 'public' })).rejects.toThrow('network');
    mocks.pending.mockResolvedValueOnce({
      result: { ...ready().pending, addresses: { ...addresses, token: 'dao-B' } }
    });
    await expect(readLaunchReadiness('dao-A', config)).rejects.toThrow('identity');
  });
  it('rejects a lost admin and never calls an already-live DAO ready', () => {
    expect(launchReadinessIssues({ ...ready(), admin: 'other-wallet', pending: null }, 'wallet-A')).toHaveLength(2);
    expect(launchReadinessIssues({ ...ready(), live: true }, 'wallet-A')).toEqual([
      'This DAO is already live. Refresh the overview.'
    ]);
  });
});

describe('slug claimed by another DAO', () => {
  it('blocks launch with a rename hint', () => {
    const issues = launchReadinessIssues({ ...ready(), slugTaken: true }, 'wallet-A');
    expect(issues.join(' ')).toMatch(/test-dao.*claimed by another DAO/);
  });
});
