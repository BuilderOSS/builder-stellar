import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  managerDao: { findFirst: vi.fn(), findMany: vi.fn() },
  marketplacePool: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  marketplaceSecondaryListing: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  marketplaceModuleLaunch: { findFirst: vi.fn() },
  marketplaceSale: { findMany: vi.fn() }
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'deployment-a' }));
vi.mock('@/lib/deployment-config', () => ({
  getDeploymentConfig: () => ({
    name: 'testnet',
    rpcUrl: 'https://rpc.example',
    networkPassphrase: 'testnet',
    managerAddress: 'manager-a'
  })
}));
vi.mock('@builder-stellar/marketplace-bindings', () => ({
  Client: class {
    get_config() {
      return Promise.resolve({
        result: {
          token: 'dao-a',
          treasury: 'treasury-a',
          manager: 'manager-a',
          paused: false,
          payment_asset: 'asset',
          default_secondary_fee_bps: 250
        }
      });
    }
  }
}));

import { daoMarketplace, marketplaceDao, marketplaceDirectory, marketplaceListing, marketplaceOffers } from './service';
import type { MarketplaceCommunity } from './types';

function dao(id: string) {
  return {
    deploymentId: 'deployment-a',
    daoId: id,
    tokenAddress: id,
    tokenContract: id,
    marketplaceContract: `market-${id}`,
    treasuryContract: id === 'dao-a' ? 'treasury-a' : 'treasury-b',
    tokenName: id,
    tokenSymbol: 'DAO',
    marketplaceEnabled: true,
    auctionEnabled: false,
    metadataContract: null,
    status: 'operational'
  };
}
function pool(id: string, deploymentId = 'deployment-a') {
  return {
    deploymentId,
    daoId: id,
    contractId: `market-${id}`,
    poolId: 99n,
    eventId: `event-${id}`,
    price: { toFixed: () => '90071992547409930' },
    asset: 'sac-a',
    expiresAt: 9999999999n,
    size: 3n,
    stocked: 3n,
    sold: 1n,
    swept: 0n,
    inStock: 2n,
    maxPerBuyer: 1n,
    maxSoldPerPeriod: 5n,
    periodSecs: 3600n,
    status: 'open',
    released: null,
    openedTransactionHash: 'hash',
    openedAt: null,
    closedAt: null
  };
}
function resale(id: string) {
  return {
    deploymentId: 'deployment-a',
    daoId: id,
    contractId: `market-${id}`,
    tokenId: 7n,
    eventId: `event-${id}`,
    seller: 'seller',
    feeBps: 500,
    price: { toFixed: () => '100' },
    paymentAsset: 'sac-a',
    expiresAt: 9999999999n,
    status: 'open',
    buyer: null,
    createdTransactionHash: 'hash',
    createdAt: null,
    closedAt: null
  };
}
function buyable(id: string, count: number) {
  return { daoId: id, contractId: `market-${id}`, _count: { _all: count } };
}
beforeEach(() => {
  vi.clearAllMocks();
  db.managerDao.findMany.mockResolvedValue([dao('dao-a'), dao('dao-b')]);
  db.managerDao.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(where.daoId === 'dao-a' ? dao('dao-a') : where.daoId === 'dao-b' ? dao('dao-b') : null)
  );
  db.marketplacePool.findMany.mockResolvedValue([]);
  db.marketplaceSecondaryListing.findMany.mockResolvedValue([]);
  db.marketplacePool.groupBy.mockResolvedValue([buyable('dao-a', 2), buyable('dao-b', 1)]);
  db.marketplaceSecondaryListing.groupBy.mockResolvedValue([buyable('dao-a', 1)]);
  db.marketplaceModuleLaunch.findFirst.mockResolvedValue({ isLive: true, opened: true });
  db.marketplaceSale.findMany.mockResolvedValue([]);
});

describe('read-only marketplace services and DTO isolation', () => {
  it('filters directory by deployment and truthful indexed capability', async () => {
    const response = await marketplaceDirectory(new URLSearchParams('capability=auction&page=2&search=community'));
    const where = db.managerDao.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual(expect.objectContaining({ deploymentId: 'deployment-a', auctionEnabled: true }));
    expect(db.managerDao.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 48, take: 25 }));
    expect(response.communities[0].capabilities).toEqual(['marketplace']);
    expect(response.network).toBe('testnet');
  });
  it('lists only open markets with something to buy right now, with how many', async () => {
    const response = await marketplaceDirectory(new URLSearchParams());
    const now = expect.any(BigInt);
    expect(db.marketplacePool.groupBy.mock.calls[0][0].where).toEqual({
      deploymentId: 'deployment-a',
      status: 'open',
      expiresAt: { gt: now },
      inStock: { gt: 0 }
    });
    expect(db.marketplaceSecondaryListing.groupBy.mock.calls[0][0].where).toEqual({
      deploymentId: 'deployment-a',
      status: 'open',
      expiresAt: { gt: now }
    });
    expect(db.managerDao.findMany.mock.calls[0][0].where.AND[1]).toEqual({
      marketplaceEnabled: true,
      OR: [
        { daoId: 'dao-a', marketplaceContract: 'market-dao-a' },
        { daoId: 'dao-b', marketplaceContract: 'market-dao-b' }
      ]
    });
    expect(response.communities.map((c) => [c.daoId, c.forSale])).toEqual([
      ['dao-a', 3],
      ['dao-b', 1]
    ]);
  });
  it('lists no communities when nothing is for sale', async () => {
    db.marketplacePool.groupBy.mockResolvedValue([]);
    db.marketplaceSecondaryListing.groupBy.mockResolvedValue([]);
    const response = await marketplaceDirectory(new URLSearchParams());
    expect(db.managerDao.findMany).not.toHaveBeenCalled();
    expect(response).toEqual(expect.objectContaining({ communities: [], hasMore: false }));
  });
  it('does not advertise a next page that the bounded API would reject', async () => {
    db.managerDao.findMany.mockResolvedValue(Array.from({ length: 25 }, (_, index) => dao(`dao-${index}`)));
    const result = await marketplaceDirectory(new URLSearchParams('page=500'));
    expect(result.communities).toHaveLength(24);
    expect(result.hasMore).toBe(false);
  });
  it('global offers retain two DAO identities and string amounts; pools carry their terms', async () => {
    db.marketplacePool.findMany.mockResolvedValue([pool('dao-a'), pool('dao-b')]);
    const response = await marketplaceOffers(new URLSearchParams('kind=pool'));
    expect(db.managerDao.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ deploymentId: 'deployment-a', marketplaceEnabled: true })
    );
    // Across communities only what can be bought now: no ended, sold-out or unstocked pools.
    expect(db.marketplacePool.findMany.mock.calls[0][0].where).toEqual({
      deploymentId: 'deployment-a',
      OR: [
        { deploymentId: 'deployment-a', daoId: 'dao-a', contractId: 'market-dao-a' },
        { deploymentId: 'deployment-a', daoId: 'dao-b', contractId: 'market-dao-b' }
      ],
      status: 'open',
      expiresAt: { gt: expect.any(BigInt) },
      inStock: { gt: 0 }
    });
    expect(response.listings.map((r) => [r.daoId, r.kind, r.id, r.price, r.tokenId, r.pool?.inStock])).toEqual([
      ['dao-a', 'pool', '99', '90071992547409930', null, 2],
      ['dao-b', 'pool', '99', '90071992547409930', null, 2]
    ]);
    expect(db.marketplaceSecondaryListing.findMany).not.toHaveBeenCalled();
    expect(() => JSON.stringify(response)).not.toThrow();
  });
  it.each(['deployment', 'dao', 'module'])(
    'fails closed if a global row leaks across %s identity',
    async (identity) => {
      const bad = {
        ...pool('dao-a'),
        ...(identity === 'deployment'
          ? { deploymentId: 'deployment-b' }
          : identity === 'dao'
            ? { daoId: 'foreign-dao' }
            : { contractId: 'market-dao-b' })
      };
      db.marketplacePool.findMany.mockResolvedValue([bad]);
      await expect(marketplaceOffers(new URLSearchParams())).rejects.toThrow(/identity|scoped tribe/);
    }
  );
  it('DAO status, history and every listing query keep deployment/DAO/module filters', async () => {
    const response = await daoMarketplace('dao-a', new URLSearchParams('status=all'));
    expect(db.managerDao.findFirst).toHaveBeenCalledWith({ where: { deploymentId: 'deployment-a', daoId: 'dao-a' } });
    expect(db.marketplaceModuleLaunch.findFirst).toHaveBeenCalledWith({
      where: { deploymentId: 'deployment-a', daoId: 'dao-a', moduleRole: 'marketplace', moduleContract: 'market-dao-a' }
    });
    expect(db.marketplaceSale.findMany.mock.calls[0][0].where).toEqual({
      deploymentId: 'deployment-a',
      daoId: 'dao-a',
      contractId: 'market-dao-a'
    });
    expect(db.marketplacePool.findMany.mock.calls[0][0].where).toEqual({
      deploymentId: 'deployment-a',
      OR: [{ deploymentId: 'deployment-a', daoId: 'dao-a', contractId: 'market-dao-a' }]
    });
    expect(response.launched).toBe(true);
    expect(response.openedAtLaunch).toBe(true);
    expect(response.config?.feeBps).toBe(250);
  });
  it('uses event identity to select a specific secondary listing cycle', async () => {
    const community = await marketplaceDao('dao-b');
    db.marketplaceSecondaryListing.findFirst.mockResolvedValue(resale('dao-b'));
    // An absent row from this exact cycle never falls back to a token-only lookup.
    db.marketplaceSecondaryListing.findFirst.mockResolvedValue(null);
    await expect(marketplaceListing(community, 'secondary', '7', 'cycle-two')).rejects.toThrow('not found');
    expect(db.marketplaceSecondaryListing.findFirst).toHaveBeenCalledWith({
      where: {
        deploymentId: 'deployment-a',
        daoId: 'dao-b',
        contractId: 'market-dao-b',
        tokenId: 7n,
        eventId: 'cycle-two'
      }
    });
  });
  it('rejects invalid ids/missing module instead of querying more broadly', async () => {
    const community = await marketplaceDao('dao-a');
    await expect(marketplaceListing(community, 'secondary', '4294967296', 'event')).rejects.toMatchObject({
      status: 400
    });
    await expect(
      marketplaceListing({ ...community, marketplaceContract: null } as MarketplaceCommunity, 'pool', '1', 'event')
    ).rejects.toThrow('incomplete');
  });
});
