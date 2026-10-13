import { afterEach, describe, expect, it, vi } from 'vitest';

import { canAutoReload, isChunkLoadError } from './chunk-reload';

describe('isChunkLoadError', () => {
  it('matches webpack and native module load failures', () => {
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(
      isChunkLoadError(new Error('Loading chunk 3832 failed. (error: https://example.com/_next/static/chunks/a.js)'))
    ).toBe(true);
    expect(isChunkLoadError(new Error('Loading CSS chunk app-layout failed'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /a.js'))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('Loading chunk 1 failed')).toBe(false);
  });
});

describe('canAutoReload', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows one reload, then stops for a short window', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: store.set.bind(store) }
    });
    expect(canAutoReload(100_000)).toBe(true);
    store.set('builder:chunk-reload-at', '100000');
    expect(canAutoReload(110_000)).toBe(false);
    expect(canAutoReload(140_000)).toBe(true);
  });
});
