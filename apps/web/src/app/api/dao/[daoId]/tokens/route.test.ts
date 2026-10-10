import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ tokens: vi.fn() }));
vi.mock('@/lib/member-directory/query', () => ({ directoryTokens: mocks.tokens }));

import { GET } from './route';

describe('token inventory API', () => {
  const owner = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tokens.mockResolvedValue({ items: [], total: 0, hasMore: false });
  });
  const request = (query: string, daoId = 'dao-a') =>
    GET(new Request(`http://localhost/api/dao/${daoId}/tokens?${query}`), { params: Promise.resolve({ daoId }) });
  it('supports owner-filtered pages beyond the first 100', async () => {
    const response = await request(`owner=${owner}&limit=25&offset=100`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.tokens).toHaveBeenCalledWith('dao-a', { limit: 25, offset: 100 }, owner);
    await request(`owner=${owner}&limit=25&offset=0`, 'dao-b');
    expect(mocks.tokens.mock.calls[1][0]).toBe('dao-b');
  });
  it.each(['owner=', 'owner=bad', 'offset=-1', 'offset=Infinity', 'limit=0', 'limit=101'])(
    'rejects invalid query %s',
    async (query) => {
      expect((await request(query)).status).toBe(400);
      expect(mocks.tokens).not.toHaveBeenCalled();
    }
  );
  it('preserves the legacy default inventory page size', async () => {
    await request('');
    expect(mocks.tokens).toHaveBeenCalledWith('dao-a', { limit: 100, offset: 0 }, undefined);
  });
});
