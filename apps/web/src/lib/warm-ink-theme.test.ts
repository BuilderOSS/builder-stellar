import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { isWarmInkPreference, warmInkBootScript } from './warm-ink-theme';

describe('Warm Ink first paint', () => {
  function boot(stored: string | null, dark: boolean, denied = false) {
    const dataset: Record<string, string> = {};
    runInNewContext(warmInkBootScript, {
      document: { documentElement: { dataset } },
      localStorage: {
        getItem: () => {
          if (denied) throw new Error('Storage denied');
          return stored;
        }
      },
      matchMedia: () => ({ matches: dark })
    });
    return dataset;
  }

  it('honors explicit preferences before hydration', () => {
    expect(boot('light', true)).toEqual({ themePreference: 'light', theme: 'light' });
    expect(boot('dark', false)).toEqual({ themePreference: 'dark', theme: 'dark' });
  });
  it('resolves system and missing preferences', () => {
    expect(boot('system', true)).toEqual({ themePreference: 'system', theme: 'dark' });
    expect(boot(null, false)).toEqual({ themePreference: 'system', theme: 'light' });
  });
  it('ignores invalid stored values and survives denied storage', () => {
    expect(boot('invalid', true).theme).toBe('dark');
    expect(boot(null, true, true).theme).toBe('dark');
  });
  it('only accepts documented preference values', () => {
    expect(['light', 'dark', 'system'].every(isWarmInkPreference)).toBe(true);
    expect([null, undefined, 'auto', {}, 1].some(isWarmInkPreference)).toBe(false);
  });
});
