import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hasSeenWalletIntro, markWalletIntroSeen, resetWalletIntroForTests } from './wallet-intro';

const data = new Map<string, string>();

beforeEach(() => {
  data.clear();
  resetWalletIntroForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe('wallet intro flag', () => {
  it('shows once per browser', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, v: string) => data.set(key, v)
      }
    });
    expect(hasSeenWalletIntro()).toBe(false);
    markWalletIntroSeen();
    resetWalletIntroForTests();
    expect(hasSeenWalletIntro()).toBe(true);
  });

  it('falls back to this page load when storage is denied', () => {
    const denied = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('window', { localStorage: { getItem: denied, setItem: denied } });
    expect(hasSeenWalletIntro()).toBe(false);
    expect(() => markWalletIntroSeen()).not.toThrow();
    expect(hasSeenWalletIntro()).toBe(true);
  });
});
