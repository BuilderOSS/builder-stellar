import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ registry: vi.fn(), tribes: vi.fn(), voteSources: vi.fn() }));
vi.mock('@/lib/platform/indexed', () => ({
  indexedRegistry: mocks.registry,
  indexedTribes: mocks.tribes,
  indexedVoteSources: mocks.voteSources
}));

import { GET as registry } from './registry/route';
import { GET as tribes } from './tribes/route';
import { GET as voteSources } from './vote-sources/route';

describe('platform API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('serves the registry and tribes uncached', async () => {
    mocks.registry.mockResolvedValue({ implementations: [], runningHashes: [] });
    mocks.tribes.mockResolvedValue([]);
    const [a, b] = await Promise.all([registry(), tribes()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.headers.get('Cache-Control')).toBe('no-store');
    expect(await b.json()).toEqual({ tribes: [] });
  });

  it('answers 503 without leaking the database error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.registry.mockRejectedValue(new Error('password authentication failed for user x'));
    mocks.tribes.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const [a, b] = await Promise.all([registry(), tribes()]);
    expect([a.status, b.status]).toEqual([503, 503]);
    expect(JSON.stringify(await a.json())).not.toContain('password');
  });

  it('serves approved vote sources uncached, and 503 without the database error', async () => {
    mocks.voteSources.mockResolvedValue([{ source: 'CADAPTER', name: 'Mock adapter' }]);
    const ok = await voteSources();
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(await ok.json()).toEqual({ sources: [{ source: 'CADAPTER', name: 'Mock adapter' }] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.voteSources.mockRejectedValue(new Error('password authentication failed for user x'));
    const down = await voteSources();
    expect(down.status).toBe(503);
    expect(JSON.stringify(await down.json())).not.toContain('password');
  });
});
