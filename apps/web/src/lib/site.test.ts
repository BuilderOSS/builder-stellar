import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEGACY_SITE_ORIGIN, SITE_NAME, siteHref, siteUrl, withSiteOrigin } from './site';

afterEach(() => vi.unstubAllEnvs());

describe('site URL', () => {
  it('defaults to tribes.build and follows NEXT_PUBLIC_SITE_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(siteUrl().origin).toBe('https://tribes.build');
    expect(siteHref('/api/render')).toBe('https://tribes.build/api/render');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:4242');
    expect(siteHref('/images/dao-logo.png')).toBe('http://localhost:4242/images/dao-logo.png');
  });

  it('falls back to tribes.build when the configured value is not a URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'not a url');
    expect(siteUrl().origin).toBe('https://tribes.build');
  });

  it('moves only old-host URLs to the site', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(withSiteOrigin(`${LEGACY_SITE_ORIGIN}/api/render`)).toBe('https://tribes.build/api/render');
    expect(withSiteOrigin('https://example.com/api/render')).toBe('https://example.com/api/render');
    expect(withSiteOrigin(`${LEGACY_SITE_ORIGIN}.evil.example/x`)).toBe(`${LEGACY_SITE_ORIGIN}.evil.example/x`);
  });
});

describe('product name', () => {
  const SRC = path.resolve(__dirname, '..');
  const BINARY = /\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?)$/i;
  // The plural name, also across a line wrap or between the wordmark's spans.
  const PLURAL_NAME = /\bTribes(?:\s|<[^>]*>)+Builder\b/;

  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return files(full);
      return BINARY.test(entry.name) ? [] : [full];
    });
  }

  it('is Tribe Builder, singular', () => {
    expect(SITE_NAME).toBe('Tribe Builder');
  });

  it('never appears in the plural in the web source', () => {
    const offenders = files(SRC).filter((file) => PLURAL_NAME.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });
});
