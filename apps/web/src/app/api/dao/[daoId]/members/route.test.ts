import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ member: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/member-directory/query', () => ({ directoryMember: mocks.member, directoryMembers: mocks.list }));
import { GET } from './route';

describe('members API', () => {
  const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.list.mockResolvedValue({ items: [], total: 101, limit: 25, offset: 100, hasMore: true });
    mocks.member.mockResolvedValue({ item: null });
  });
  const request = (query: string, daoId = 'dao-a') =>
    GET(new Request(`http://localhost/api/dao/${daoId}/members?${query}`), { params: Promise.resolve({ daoId }) });
  it('passes pagination beyond 100 through and disables HTTP caches', async () => {
    const response = await request('limit=25&offset=100');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.list).toHaveBeenCalledWith('dao-a', { limit: 25, offset: 100 });
    await request('limit=25&offset=0', 'dao-b');
    expect(mocks.list.mock.calls[1][0]).toBe('dao-b');
  });
  it('looks up a valid address directly and treats a missing member as a normal null', async () => {
    const response = await request(`address=${address}`);
    expect(await response.json()).toEqual({ item: null });
    expect(mocks.member).toHaveBeenCalledWith('dao-a', address);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each(['address=', 'address=bad', 'limit=0', 'offset=-1', 'offset=1.2', 'limit=1001', 'offset=9007199254740992'])(
    'rejects invalid input %s before any query',
    async (query) => {
      expect((await request(query)).status).toBe(400);
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.member).not.toHaveBeenCalled();
    }
  );
  it('does not disguise a failed indexed read as an empty directory', async () => {
    mocks.list.mockRejectedValue(new Error('private DB details'));
    const response = await request('');
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.items).toBeUndefined();
    expect(body.message).not.toContain('private');
  });
});
