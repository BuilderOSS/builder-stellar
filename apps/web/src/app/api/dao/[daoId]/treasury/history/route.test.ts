import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ scope: vi.fn(), history: vi.fn() }));
vi.mock('@/lib/treasury-service/service', async (original) => ({
  ...(await original<typeof import('@/lib/treasury-service/service')>()),
  treasuryScope: mock.scope,
  indexedTreasuryHistory: mock.history
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { GET } from './route';

const scope = {
  deploymentId: 'server-deployment',
  daoId: 'dao-a',
  treasuryContractId: 'registered-treasury',
  governorContractId: 'registered-governor'
};
const context = { params: Promise.resolve({ daoId: 'dao-a' }) };
beforeEach(() => {
  vi.clearAllMocks();
  mock.scope.mockResolvedValue(scope);
  mock.history.mockResolvedValue({ ...scope, calls: [], page: 2, hasMore: false });
});

describe('treasury history HTTP scope', () => {
  it('passes only the resolved registry scope and bounded page to indexed reads', async () => {
    const response = await GET(new Request('http://localhost/api/dao/dao-a/treasury/history?page=2'), context);
    expect(response.status).toBe(200);
    expect(mock.scope).toHaveBeenCalledWith('dao-a');
    expect(mock.history).toHaveBeenCalledWith(scope, 2);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject(scope);
  });
  it.each(['treasury=other', 'governor=other', 'daoId=other', 'deploymentId=other', 'page=1&page=2', 'page=999999'])(
    'rejects untrusted query %s before registry or query work',
    async (query) => {
      expect((await GET(new Request(`http://localhost/api/treasury/history?${query}`), context)).status).toBe(400);
      expect(mock.scope).not.toHaveBeenCalled();
      expect(mock.history).not.toHaveBeenCalled();
    }
  );
  it('does not replace a failed read with an empty success response', async () => {
    mock.history.mockRejectedValue(new Error('read unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await GET(new Request('http://localhost/api/treasury/history'), context);
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('calls');
    log.mockRestore();
  });
});
