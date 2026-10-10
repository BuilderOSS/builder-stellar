import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  member: vi.fn(),
  tokens: vi.fn(),
  supply: vi.fn()
}));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'deployment-a' }));
vi.mock('@/lib/dao-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dao-config')>()),
  getDaoNetworkConfigById: mocks.config
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    tokenMember: { findMany: mocks.list, count: mocks.count, findFirst: mocks.member },
    tokenInventory: { findMany: mocks.tokens, count: mocks.supply },
    tokenSupply: { findFirst: async () => null }
  }
}));

import { directoryMember, directoryMembers, directoryTokens } from './query';

describe('exact scoped directory reads', () => {
  const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.mockImplementation(async (daoId: string) => ({ tokenContractId: daoId }));
    mocks.list.mockResolvedValue([]);
    mocks.count.mockResolvedValue(126);
    mocks.member.mockResolvedValue(null);
    mocks.tokens.mockResolvedValue([]);
    mocks.supply.mockResolvedValue(130);
  });
  it('paginates beyond the first 100 and scopes rows and count with a deterministic tie-breaker', async () => {
    const page = await directoryMembers('dao-a', { limit: 25, offset: 100 });
    expect(mocks.list).toHaveBeenCalledWith({
      where: { deploymentId: 'deployment-a', daoId: 'dao-a', contractId: 'dao-a' },
      orderBy: [{ votingPower: 'desc' }, { address: 'asc' }],
      take: 25,
      skip: 100
    });
    expect(mocks.count).toHaveBeenCalledWith({
      where: { deploymentId: 'deployment-a', daoId: 'dao-a', contractId: 'dao-a' }
    });
    expect(page.hasMore).toBe(true);
    await directoryMembers('dao-b', { limit: 25, offset: 0 });
    expect(mocks.list.mock.calls[1][0].where).toEqual({
      deploymentId: 'deployment-a',
      daoId: 'dao-b',
      contractId: 'dao-b'
    });
  });
  it('looks up the address directly without any first-1000 scan and preserves integers', async () => {
    mocks.member.mockResolvedValue({
      address,
      ownedTokenCount: 12n,
      votingPower: 9007199254740993n,
      delegatedTo: null,
      lastActivityLedger: null
    });
    const result = await directoryMember('dao-b', ` ${address} `);
    expect(mocks.member).toHaveBeenCalledWith({
      where: { deploymentId: 'deployment-a', daoId: 'dao-b', contractId: 'dao-b', address }
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(result.item?.voting_power).toBe('9007199254740993');
    expect(result.item?.owned_token_count).toBe('12');
    expect(result.item?.last_activity_ledger).toBeNull();
  });
  it('rejects bad address before any DAO or indexed lookup', async () => {
    await expect(directoryMember('dao-a', "' OR 1=1 --")).rejects.toThrow('valid Stellar');
    expect(mocks.config).not.toHaveBeenCalled();
  });
  it('fails closed when a DAO lacks a token identity', async () => {
    mocks.config.mockResolvedValue({ tokenContractId: '' });
    await expect(directoryMembers('missing', { limit: 25, offset: 0 })).rejects.toThrow('scope');
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('scopes owned tokens, owner-filtered count, and collection supply separately', async () => {
    await directoryTokens('dao-b', { limit: 25, offset: 75 }, address);
    expect(mocks.tokens).toHaveBeenCalledWith({
      where: { deploymentId: 'deployment-a', daoId: 'dao-b', contractId: 'dao-b', owner: address },
      orderBy: { tokenId: 'desc' },
      take: 25,
      skip: 75
    });
    expect(mocks.supply.mock.calls).toEqual([
      [{ where: { deploymentId: 'deployment-a', daoId: 'dao-b', contractId: 'dao-b', owner: address } }],
      [{ where: { deploymentId: 'deployment-a', daoId: 'dao-b', contractId: 'dao-b' } }]
    ]);
  });
});
