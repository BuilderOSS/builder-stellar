import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cached,
  clearServerCache,
  estimateBytes,
  invalidateCached,
  serverCacheUsage,
  setServerCacheLimits
} from './server-cache';

const bytes = (n: number) => Buffer.alloc(n);

describe('server cache', () => {
  let restore = () => {};
  beforeEach(() => clearServerCache());
  afterEach(() => {
    restore();
    clearServerCache();
  });

  it('shares one load between concurrent callers and keeps the value until it expires', async () => {
    const load = vi.fn(async () => 'v');
    const [a, b] = await Promise.all([cached('k', 60_000, load), cached('k', 60_000, load)]);
    expect([a, b]).toEqual(['v', 'v']);
    expect(await cached('k', 60_000, load)).toBe('v');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failure', async () => {
    await expect(cached('k', 60_000, async () => Promise.reject(new Error('rpc')))).rejects.toThrow('rpc');
    expect(await cached('k', 60_000, async () => 'ok')).toBe('ok');
    expect(serverCacheUsage().entries).toBe(1);
  });

  it('keeps its size under the byte budget, dropping the oldest entries first', async () => {
    restore = setServerCacheLimits({ maxBytes: 1_000, maxValueBytes: 600 });
    for (let i = 0; i < 10; i += 1) await cached(`image:${i}`, 60_000, async () => bytes(300));
    const usage = serverCacheUsage();
    expect(usage.bytes).toBeLessThanOrEqual(1_000);
    expect(usage.entries).toBe(3);
    // The newest three survive; an evicted one loads again.
    const reload = vi.fn(async () => bytes(300));
    await cached('image:9', 60_000, reload);
    expect(reload).not.toHaveBeenCalled();
    await cached('image:0', 60_000, reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('returns a value larger than one entry may be, without keeping it', async () => {
    restore = setServerCacheLimits({ maxBytes: 1_000, maxValueBytes: 600 });
    await cached('small', 60_000, async () => bytes(100));
    const big = await cached('big', 60_000, async () => bytes(700));
    expect(big.byteLength).toBe(700);
    expect(serverCacheUsage()).toEqual({ entries: 1, bytes: 100 });
  });

  it('keeps the count under its limit too, and invalidation frees the bytes', async () => {
    restore = setServerCacheLimits({ maxEntries: 10 });
    for (let i = 0; i < 25; i += 1) await cached(`dao-config:${i}`, 60_000, async () => ({ i }));
    expect(serverCacheUsage().entries).toBeLessThanOrEqual(10);
    invalidateCached('dao-config:');
    expect(serverCacheUsage()).toEqual({ entries: 0, bytes: 0 });
  });

  it('a load that finishes after its entry was invalidated, or replaced by a newer load, changes nothing', async () => {
    let finishOld = (_value: string) => {};
    const old = cached('k', 60_000, () => new Promise<string>((resolve) => (finishOld = resolve)));
    invalidateCached('k');
    let finishNew = (_value: string) => {};
    const fresh = cached('k', 60_000, () => new Promise<string>((resolve) => (finishNew = resolve)));
    finishOld('stale');
    expect(await old).toBe('stale');
    // The newer load is still the one callers share.
    const third = vi.fn(async () => 'third');
    const shared = cached('k', 60_000, third);
    finishNew('fresh');
    expect(await fresh).toBe('fresh');
    expect(await shared).toBe('fresh');
    expect(third).not.toHaveBeenCalled();
    expect(await cached('k', 60_000, third)).toBe('fresh');
  });

  it('estimates sizes: binary exactly, text and objects by their length, cycles and bigints without throwing', () => {
    expect(estimateBytes(bytes(1234))).toBe(1234);
    expect(estimateBytes(new Uint8Array(10).buffer)).toBe(10);
    expect(estimateBytes('abcd')).toBe(8);
    expect(estimateBytes({ claims: { GALICE: { amount: 2 } } })).toBe(
      JSON.stringify({ claims: { GALICE: { amount: 2 } } }).length * 2
    );
    expect(estimateBytes({ supply: 10n })).toBeGreaterThan(0);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(estimateBytes(cycle)).toBe(16 * 1024);
    expect(estimateBytes(undefined)).toBe(0);
  });
});
