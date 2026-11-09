import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  managerImplementation: { findMany: vi.fn() },
  managerModuleVersion: { findMany: vi.fn() },
  managerDao: { findMany: vi.fn() }
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'manager:CTEST' }));

import { indexedRegistry, indexedTribes } from '@/lib/platform/indexed';

const h = (c: string) => c.repeat(64);

describe('indexed platform reads', () => {
  beforeEach(() => vi.resetAllMocks());

  it('counts the modules running each hash and drops incomplete rows', async () => {
    db.managerImplementation.findMany.mockResolvedValue([
      { name: 'Token', version: '0.4.0', wasmHash: h('a'), publishedLedger: 10n, revoked: false },
      { name: null, version: '0.1.0', wasmHash: h('b'), publishedLedger: null, revoked: false }
    ]);
    db.managerModuleVersion.findMany.mockResolvedValue([
      { currentHash: h('a') },
      { currentHash: h('a') },
      { currentHash: h('c') },
      { currentHash: null }
    ]);
    const result = await indexedRegistry();
    expect(result.implementations).toEqual([
      { name: 'Token', version: '0.4.0', hash: h('a'), publishedLedger: 10, revoked: false, usedBy: 2 }
    ]);
    expect(result.runningHashes).toEqual([h('a'), h('c')]);
    expect(db.managerImplementation.findMany.mock.calls[0]![0]).toMatchObject({
      where: { deploymentId: 'manager:CTEST' }
    });
  });

  it("lists this deployment's tribes with the contracts their storage check reads", async () => {
    db.managerDao.findMany.mockResolvedValue([
      {
        daoId: 'CTOKEN',
        tokenName: 'Fast DAO',
        slug: 'fast-dao',
        claimedSlug: 'fast-dao',
        status: 'operational',
        tokenAddress: 'CTOKEN',
        metadataContract: 'CMETA',
        governorContract: 'CGOV',
        treasuryContract: 'CTREAS',
        auctionContract: null,
        marketplaceContract: null,
        claimsContract: 'CCLAIM'
      }
    ]);
    expect(await indexedTribes()).toEqual([
      {
        daoId: 'CTOKEN',
        name: 'Fast DAO',
        slug: 'fast-dao',
        status: 'operational',
        contracts: {
          token: 'CTOKEN',
          metadata: 'CMETA',
          governor: 'CGOV',
          treasury: 'CTREAS',
          auction: '',
          marketplace: '',
          claims: 'CCLAIM'
        }
      }
    ]);
  });
});
