import type { NextConfig } from 'next';
import { unstable_doesMiddlewareMatch, unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { config as middlewareConfig, middleware } from '@/middleware';

import { API_CONTENT_SECURITY_POLICY, HSTS_VALUE, securityHeaderRules } from '../../security-headers.mjs';
import { buildContentSecurityPolicy, cspMode } from './content-security-policy';

async function nextConfig(): Promise<NextConfig> {
  // A runtime path keeps TypeScript from resolving the untyped .mjs config.
  return ((await import('../../next.config.mjs' as string)) as { default: NextConfig }).default;
}

async function configHeaders(url: string) {
  return (await unstable_getResponseFromNextConfig({ url, nextConfig: await nextConfig() })).headers;
}

function directive(policy: string, name: string) {
  return policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
}

describe('baseline headers (next.config.mjs)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    'https://tribes.build/',
    'https://tribes.build/dao/abc',
    'https://tribes.build/api/health',
    '/images/a.png'
  ])('sends nosniff, no framing, a referrer policy and a permissions policy on %s', async (url) => {
    const headers = await configHeaders(url.startsWith('/') ? `https://tribes.build${url}` : url);
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('permissions-policy')).toContain('camera=()');
    expect(headers.get('permissions-policy')).toContain('geolocation=()');
    // Hardware wallets need WebUSB and WebHID.
    expect(headers.get('permissions-policy')).not.toMatch(/\b(usb|hid)=/);
  });

  it('lets API responses load nothing and never be framed', async () => {
    expect((await configHeaders('https://tribes.build/api/render/x/1')).get('content-security-policy')).toBe(
      API_CONTENT_SECURITY_POLICY
    );
  });

  it.each(['enforce', 'report-only'])('sends no page CSP of its own with CSP_MODE=%s', async (mode) => {
    // A nonce-free page policy here took the place of the middleware's on dev.tribes.build, so
    // Next's scripts lost their nonce. The middleware's policy is the only one on pages.
    vi.stubEnv('CSP_MODE', mode);
    for (const url of ['https://tribes.build/', 'https://tribes.build/dao/x/proposals']) {
      const headers = await configHeaders(url);
      expect(headers.get('content-security-policy'), url).toBeNull();
      expect(headers.get('content-security-policy-report-only'), url).toBeNull();
    }
  });

  it('sends HSTS itself only off Vercel, which already sends it', () => {
    const hsts = (env: { VERCEL?: string; NODE_ENV?: string }) =>
      securityHeaderRules(env)[0].headers.find((header) => header.key === 'Strict-Transport-Security')?.value;
    expect(hsts({ NODE_ENV: 'production' })).toBe(HSTS_VALUE);
    expect(hsts({ NODE_ENV: 'production', VERCEL: '1' })).toBeUndefined();
    expect(hsts({ NODE_ENV: 'development' })).toBeUndefined();
  });
});

describe('page Content-Security-Policy (middleware)', () => {
  afterEach(() => vi.unstubAllEnvs());

  const page = (path = '/dao/abc') => middleware(new NextRequest(`https://tribes.build${path}`));
  const nonceOf = (policy: string) => /'nonce-([A-Za-z0-9+/=]+)'/.exec(policy)?.[1];

  it('is enforced by default, and sets one CSP header', () => {
    const response = page();
    // Next copies middleware response headers onto the request; a second, nonce-free CSP would
    // hide the nonce from Next's own scripts.
    expect(response.headers.get('content-security-policy-report-only')).toBeNull();
    const policy = response.headers.get('content-security-policy')!;
    expect(directive(policy, 'script-src')).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=]{24}' 'strict-dynamic'$/);
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'report-uri')).toBe('report-uri /api/csp-report');
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('only reports with CSP_MODE=report-only', () => {
    vi.stubEnv('CSP_MODE', 'report-only');
    const response = page();
    const policy = response.headers.get('content-security-policy-report-only')!;
    expect(policy).toContain("'strict-dynamic'");
    expect(response.headers.get('content-security-policy')).toBeNull();
    // Ignored (with a console warning) in a report-only policy.
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('gives each response a fresh nonce and hands the same one to the page', () => {
    const first = page();
    const second = page();
    const nonce = nonceOf(first.headers.get('content-security-policy')!);
    expect(nonce).toBeTruthy();
    expect(nonce).not.toBe(nonceOf(second.headers.get('content-security-policy')!));
    // NextResponse.next({ request }) forwards request headers to the page as x-middleware-request-*.
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(nonceOf(first.headers.get('x-middleware-request-content-security-policy')!)).toBe(nonce);
  });

  it('runs for pages, not for API routes, build assets or prefetches', () => {
    const matches = (url: string, headers?: Record<string, string>) =>
      unstable_doesMiddlewareMatch({ config: middlewareConfig, url, headers });
    expect(matches('/')).toBe(true);
    expect(matches('/dao/abc/proposals/1')).toBe(true);
    expect(matches('/api/health')).toBe(false);
    expect(matches('/_next/static/chunks/main.js')).toBe(false);
    expect(matches('/images/logo.png')).toBe(false);
    // A tribe slug can contain an excluded word; every exclusion is anchored at the root.
    expect(matches('/dao/my-opengraph-image/proposals/3')).toBe(true);
    expect(matches('/dao/api/proposals')).toBe(true);
    expect(matches('/dao/images-of-us')).toBe(true);
    expect(matches('/dao/abc', { 'next-router-prefetch': '1' })).toBe(false);
  });
});

describe('buildContentSecurityPolicy', () => {
  afterEach(() => vi.unstubAllEnvs());

  const build = (overrides: Partial<Parameters<typeof buildContentSecurityPolicy>[0]> = {}) =>
    buildContentSecurityPolicy({
      nonce: 'abc',
      network: 'testnet',
      dev: false,
      walletConnect: false,
      upgradeInsecureRequests: false,
      ...overrides
    });

  it('never allows inline or evaluated script outside development', () => {
    const scripts = directive(build(), 'script-src')!;
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(directive(build({ dev: true }), 'script-src')).toContain("'unsafe-eval'");
  });

  it('loads images only from the app, IPFS gateways and the wallet kit', () => {
    const images = directive(build(), 'img-src')!;
    expect(images.split(' ')).not.toContain('https:');
    expect(images).toContain('https://ipfs.io');
    expect(images).toContain('https://*.dweb.link');
    expect(images).toContain('https://stellar.creit.tech');
    // Tribe images saved before the rename point at the old host.
    expect(images).toContain('https://builder-stellar-web.vercel.app');
    expect(images).toContain('https://tribes.build');
    // tribes.build redirects to www.tribes.build, and the policy applies to the redirect too.
    expect(images).toContain('https://*.tribes.build');
  });

  it('allows the production site’s images on every deployment', () => {
    // Early tribes on dev.tribes.build store https://tribes.build/images/dao-logo.png as their image.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dev.tribes.build');
    const images = directive(build(), 'img-src')!.split(' ');
    expect(images).toEqual(
      expect.arrayContaining([
        'https://dev.tribes.build',
        'https://*.dev.tribes.build',
        'https://tribes.build',
        'https://*.tribes.build'
      ])
    );
  });

  it("connects to the network's RPC and Horizon", () => {
    expect(directive(build(), 'connect-src')).toContain('https://soroban-testnet.stellar.org');
    expect(directive(build(), 'connect-src')).toContain('https://horizon-testnet.stellar.org');
    expect(directive(build({ network: 'public' }), 'connect-src')).toContain('https://soroban-mainnet.stellar.org');
    expect(directive(build({ network: 'local' }), 'connect-src')).toContain('http://localhost:8000');
  });

  it('allows frames only for the wallets the app registers', () => {
    // lib/wallet-kit.ts registers the kit's default modules and WalletConnect: no Trezor or HOT.
    expect(directive(build(), 'frame-src')).toBe('frame-src https://albedo.link');
    for (const host of ['trezor.io', 'hot-labs.org', 'h4n.app', 'herewallet.app']) expect(build()).not.toContain(host);
  });

  it('allows WalletConnect hosts only when WalletConnect is configured', () => {
    expect(build()).not.toContain('walletconnect');
    expect(directive(build({ walletConnect: true }), 'connect-src')).toContain('wss://*.walletconnect.org');
    expect(directive(build({ walletConnect: true }), 'frame-src')).toContain('https://verify.walletconnect.org');
  });

  it('enforces unless CSP_MODE is exactly report-only', () => {
    expect(cspMode(undefined)).toBe('enforce');
    expect(cspMode('')).toBe('enforce');
    expect(cspMode('enforce')).toBe('enforce');
    expect(cspMode('off')).toBe('enforce');
    expect(cspMode('report-only')).toBe('report-only');
    expect(cspMode(' Report-Only ')).toBe('report-only');
  });
});
