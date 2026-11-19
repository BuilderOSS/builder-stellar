import { runInNewContext } from 'node:vm';

import { themeBootScript } from '@builder-stellar/design-tokens/theme';
import { GLOSSARY_KEYS, glossaryEntries, glossaryHref } from '@builder-stellar/glossary';
import { describe, expect, it } from 'vitest';

import { DOCS_DEFAULT_THEME } from './site';

describe('docs theme boot', () => {
  function boot(stored: string | null, cookie: string, dark: boolean) {
    const dataset: Record<string, string> = {};
    runInNewContext(themeBootScript(DOCS_DEFAULT_THEME), {
      document: { documentElement: { dataset }, cookie },
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: dark })
    });
    return dataset;
  }

  it('is a plain value the server can inline (not a client reference)', () => {
    expect(DOCS_DEFAULT_THEME).toBe('system');
  });
  it('reads the shared cookie, then the app’s localStorage key, then System', () => {
    expect(boot('light', 'tribes-theme=dark', false)).toEqual({ themePreference: 'dark', theme: 'dark' });
    expect(boot('light', '', true).theme).toBe('light');
    expect(boot(null, '', true)).toEqual({ themePreference: 'system', theme: 'dark' });
    expect(boot(null, '', false).theme).toBe('light');
  });
});

describe('shared glossary', () => {
  it('gives every term a unique anchor on the glossary page', () => {
    const slugs = glossaryEntries().map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(GLOSSARY_KEYS.length);
    expect(glossaryHref('quorum', 'https://docs.tribes.build')).toBe(
      'https://docs.tribes.build/reference/glossary#quorum'
    );
  });
});
