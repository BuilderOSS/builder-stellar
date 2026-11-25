import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), aggregate: vi.fn(), config: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { claimsList: { findMany: mocks.findMany, aggregate: mocks.aggregate } } }));
vi.mock('./service', () => ({ claimScope: async () => ({ config: mocks.config() }) }));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'deployment-a' }));

import { openClaimLists } from './open-lists';
import { CLAIMS, config, TOKEN, XLM } from './test-fixtures';

const NOW = 1_800_000_000;
const row = (listId: number, patch: Record<string, unknown> = {}) => ({
  listId: BigInt(listId),
  isAssurance: false,
  price: { toFixed: () => '0' },
  asset: XLM,
  total: 10n,
  claimed: 4n,
  effectiveExpiresAt: 9_223_372_036_854_775_807n,
  openedInSetup: true,
  ...patch
});

describe('open claim lists from the index', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.mockReturnValue(config);
  });

  it('reads only the tribe’s current ClaimMinter, and only lists that have not closed or expired', async () => {
    mocks.findMany.mockResolvedValue([row(0), row(3, { openedInSetup: false })]);
    mocks.aggregate.mockResolvedValue({ _sum: { total: 10n, claimed: 4n }, _count: 1 });
    const result = await openClaimLists(TOKEN, NOW);
    const where = {
      deploymentId: 'deployment-a',
      daoId: TOKEN,
      contractId: CLAIMS,
      closed: false,
      effectiveExpiresAt: { gt: BigInt(NOW) }
    };
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    // Founder supply: free Setup lists only, not the launch drive.
    expect(mocks.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ...where, openedInSetup: true, isAssurance: false } })
    );
    expect(result).toMatchObject({ deploymentId: 'deployment-a', daoId: TOKEN, setupUnclaimed: 6, setupLists: 1 });
    expect(result.lists.map((list) => [list.listId, list.openedInSetup])).toEqual([
      [0, true],
      [3, false]
    ]);
    // A list open until past the bigint range keeps that as a number the date helpers read as no end.
    expect(result.lists[0]!.expiresAt).toBeGreaterThan(8.64e12);
  });

  it('has nothing to read without a claims module', async () => {
    mocks.config.mockReturnValue({ ...config, claimsContractId: '' });
    expect(await openClaimLists(TOKEN, NOW)).toMatchObject({ lists: [], setupUnclaimed: 0, claimsContractId: null });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
