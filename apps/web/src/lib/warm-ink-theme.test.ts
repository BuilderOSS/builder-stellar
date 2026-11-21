import { runInNewContext } from 'node:vm';

import { readThemeCookie, themeCookie } from '@builder-stellar/design-tokens/theme';
import { describe, expect, it } from 'vitest';

import { isWarmInkPreference, warmInkBootScript } from './warm-ink-theme';

describe('Warm Ink first paint', () => {
  function boot(stored: string | null, dark: boolean, denied = false, cookie?: string) {
    const dataset: Record<string, string> = {};
    const documentElement = { dataset };
    runInNewContext(warmInkBootScript, {
      document:
        cookie === undefined
          ? { documentElement }
          : {
              documentElement,
              get cookie() {
                if (denied) throw new Error('Cookies denied');
                return cookie;
              }
            },
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
  it('resolves system preferences and defaults first visits to dark', () => {
    expect(boot('system', true)).toEqual({ themePreference: 'system', theme: 'dark' });
    expect(boot('system', false)).toEqual({ themePreference: 'system', theme: 'light' });
    expect(boot(null, false)).toEqual({ themePreference: 'dark', theme: 'dark' });
  });
  it('ignores invalid stored values and survives denied storage', () => {
    expect(boot('invalid', false).theme).toBe('dark');
    expect(boot(null, false, true).theme).toBe('dark');
    expect(boot(null, false, true, 'tribes-theme=light').theme).toBe('dark');
  });
  it('prefers the shared cookie, so a choice made on the docs site carries over', () => {
    expect(boot('dark', false, false, 'a=1; tribes-theme=light').theme).toBe('light');
    expect(boot('light', true, false, 'tribes-theme=system').theme).toBe('dark');
    expect(boot('light', true, false, 'tribes-theme=sepia').theme).toBe('light');
    expect(boot('light', true, false, 'other-tribes-theme=dark').theme).toBe('light');
  });
  it('only accepts documented preference values', () => {
    expect(['light', 'dark', 'system'].every(isWarmInkPreference)).toBe(true);
    expect([null, undefined, 'auto', {}, 1].some(isWarmInkPreference)).toBe(false);
  });
});

describe('Shared theme cookie', () => {
  it('is scoped to .tribes.build on the app and the docs, and host-only elsewhere', () => {
    expect(themeCookie('light', 'tribes.build', true)).toContain('domain=.tribes.build');
    expect(themeCookie('light', 'docs.tribes.build', true)).toContain('domain=.tribes.build');
    expect(themeCookie('light', 'localhost', false)).not.toContain('domain=');
    expect(themeCookie('light', 'eviltribes.build', true)).not.toContain('domain=');
    expect(themeCookie('dark', 'tribes.build', true)).toBe(
      'tribes-theme=dark; path=/; max-age=31536000; samesite=lax; domain=.tribes.build; secure'
    );
  });
  it('reads only valid values', () => {
    expect(readThemeCookie('x=1; tribes-theme=system')).toBe('system');
    expect(readThemeCookie('tribes-theme=auto')).toBeNull();
    expect(readThemeCookie(undefined)).toBeNull();
  });
});
