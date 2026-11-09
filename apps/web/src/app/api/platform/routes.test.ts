import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ registry: vi.fn(), tribes: vi.fn() }));
vi.mock('@/lib/platform/indexed', () => ({ indexedRegistry: mocks.registry, indexedTribes: mocks.tribes }));

import { GET as registry } from './registry/route';
import { GET as tribes } from './tribes/route';

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
});
