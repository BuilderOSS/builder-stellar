import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  managerDao: { findFirst: vi.fn(), findMany: vi.fn() },
  marketplacePrimaryListing: { findFirst: vi.fn(), findMany: vi.fn() },
  marketplaceSecondaryListing: { findFirst: vi.fn(), findMany: vi.fn() },
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
function primary(id: string, deploymentId = 'deployment-a') {
  return {
    deploymentId,
    daoId: id,
    contractId: `market-${id}`,
    listingId: 99n,
    tokenId: null,
    eventId: `event-${id}`,
    price: { toFixed: () => '90071992547409930' },
    expiresAt: 9999999999n,
    status: 'open',
    buyer: null,
    createdTransactionHash: 'hash',
    createdAt: null,
    closedAt: null
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  db.managerDao.findMany.mockResolvedValue([dao('dao-a'), dao('dao-b')]);
  db.managerDao.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(where.daoId === 'dao-a' ? dao('dao-a') : where.daoId === 'dao-b' ? dao('dao-b') : null)
  );
  db.marketplacePrimaryListing.findMany.mockResolvedValue([]);
  db.marketplaceSecondaryListing.findMany.mockResolvedValue([]);
  db.marketplaceModuleLaunch.findFirst.mockResolvedValue({ isLive: true, opened: true });
  db.marketplaceSale.findMany.mockResolvedValue([]);
});

describe('read-only marketplace services and DTO isolation', () => {
  it('filters directory by deployment and truthful indexed capability', async () => {
    const response = await marketplaceDirectory(new URLSearchParams('capability=auction&page=2&search=community'));
    expect(db.managerDao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deploymentId: 'deployment-a', auctionEnabled: true }),
        skip: 48,
        take: 25
      })
    );
    expect(response.communities[0].capabilities).toEqual(['marketplace']);
    expect(response.network).toBe('testnet');
  });
  it('does not advertise a next page that the bounded API would reject', async () => {
    db.managerDao.findMany.mockResolvedValue(Array.from({ length: 25 }, (_, index) => dao(`dao-${index}`)));
    const result = await marketplaceDirectory(new URLSearchParams('page=500'));
    expect(result.communities).toHaveLength(24);
    expect(result.hasMore).toBe(false);
  });
  it('global offers retain two DAO identities and string amounts/u64 ids', async () => {
    db.marketplacePrimaryListing.findMany.mockResolvedValue([primary('dao-a'), primary('dao-b')]);
    const response = await marketplaceOffers(new URLSearchParams('kind=primary'));
    expect(db.marketplacePrimaryListing.findMany.mock.calls[0][0].where).toEqual({
      deploymentId: 'deployment-a',
      OR: [
        { deploymentId: 'deployment-a', daoId: 'dao-a', contractId: 'market-dao-a' },
        { deploymentId: 'deployment-a', daoId: 'dao-b', contractId: 'market-dao-b' }
      ],
      status: 'open'
    });
    expect(response.listings.map((r) => [r.daoId, r.id, r.price, r.tokenId])).toEqual([
      ['dao-a', '99', '90071992547409930', null],
      ['dao-b', '99', '90071992547409930', null]
    ]);
    expect(() => JSON.stringify(response)).not.toThrow();
  });
  it.each(['deployment', 'dao', 'module'])(
    'fails closed if a global row leaks across %s identity',
    async (identity) => {
      const bad = {
        ...primary('dao-a'),
        ...(identity === 'deployment'
          ? { deploymentId: 'deployment-b' }
          : identity === 'dao'
            ? { daoId: 'foreign-dao' }
            : { contractId: 'market-dao-b' })
      };
      db.marketplacePrimaryListing.findMany.mockResolvedValue([bad]);
      await expect(marketplaceOffers(new URLSearchParams())).rejects.toThrow(/identity|scoped community/);
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
    expect(db.marketplacePrimaryListing.findMany.mock.calls[0][0].where.OR).toEqual([
      { deploymentId: 'deployment-a', daoId: 'dao-a', contractId: 'market-dao-a' }
    ]);
    expect(response.launched).toBe(true);
    expect(response.openedAtLaunch).toBe(true);
    expect(response.config?.feeBps).toBe(250);
  });
  it('uses event identity to select a specific secondary listing cycle', async () => {
    const community = await marketplaceDao('dao-b');
    db.marketplaceSecondaryListing.findFirst.mockResolvedValue({
      ...primary('dao-b'),
      tokenId: 7n,
      seller: 'seller',
      feeBps: 500,
      listingId: undefined
    });
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
      marketplaceListing({ ...community, marketplaceContract: null } as MarketplaceCommunity, 'primary', '1', 'event')
    ).rejects.toThrow('incomplete');
  });
});
