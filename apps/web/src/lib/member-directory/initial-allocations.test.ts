import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ scope: vi.fn(), query: vi.fn() }));
vi.mock('./query', () => ({ directoryScope: mocks.scope }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: mocks.query } }));

import { initialAllocations } from './initial-allocations';

describe('initial allocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('reads historical pre-launch mint recipients within the exact deployment and token scope', async () => {
    mocks.scope.mockResolvedValue({ deploymentId: 'deployment-a', daoId: 'token-a' });
    mocks.query.mockResolvedValue([{ address: 'recipient', amount: 9007199254740993n, total: 30n }]);
    const result = await initialAllocations('slug', { limit: 25, offset: 0 });
    const [sql, ...values] = mocks.query.mock.calls[0];
    expect(sql.join('')).toContain("t.transfer_type = 'mint' AND t.pos < l.launched_pos");
    expect(sql.join('')).toContain('l.deployment_id = t.deployment_id AND l.dao_id = t.dao_id');
    expect(values).toEqual(['deployment-a', 'token-a', 'token-a', 25, 0]);
    expect(result.items).toEqual([{ address: 'recipient', amount: '9007199254740993' }]);
    expect(result.hasMore).toBe(true);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it('retains the scoped recipient total for an offset beyond the last page', async () => {
    mocks.scope.mockResolvedValue({ deploymentId: 'deployment-b', daoId: 'token-b' });
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 30n }]);
    const result = await initialAllocations('other-slug', { limit: 25, offset: 100 });
    expect(result).toMatchObject({
      deploymentId: 'deployment-b',
      daoId: 'token-b',
      items: [],
      total: 30,
      hasMore: false
    });
    const [sql, ...values] = mocks.query.mock.calls[1];
    expect(sql.join('')).toContain('count(DISTINCT t.to_address)');
    expect(sql.join('')).toContain('l.deployment_id = t.deployment_id AND l.dao_id = t.dao_id');
    expect(sql.join('')).toContain("t.transfer_type = 'mint' AND t.pos < l.launched_pos");
    expect(values).toEqual(['deployment-b', 'token-b', 'token-b']);
  });
  it('reports zero when the DAO has no historical allocations', async () => {
    mocks.scope.mockResolvedValue({ deploymentId: 'deployment-a', daoId: 'token-a' });
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0n }]);
    expect(await initialAllocations('slug', { limit: 25, offset: 0 })).toMatchObject({
      items: [],
      total: 0,
      hasMore: false
    });
  });
});
