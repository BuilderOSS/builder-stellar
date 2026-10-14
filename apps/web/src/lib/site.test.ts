import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEGACY_SITE_ORIGIN, siteHref, siteUrl, withSiteOrigin } from './site';

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
