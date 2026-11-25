import { describe, expect, it, vi } from 'vitest';

import { enforceAuthRateLimit, getClientKey, trustedClientIpHeader } from './rate-limit';
import { claimAuthChallenge, consumeAuthChallenge, releaseAuthChallenge } from './server';

describe('authentication safeguards', () => {
  it('allows one challenge claim and blocks concurrent claims', () => {
    const nonce = `nonce-${crypto.randomUUID()}`;
    const expiresAt = Date.now() + 60_000;

    expect(claimAuthChallenge(nonce, expiresAt)).toEqual({ success: true });
    expect(claimAuthChallenge(nonce, expiresAt)).toEqual({ success: false, reason: 'in-use' });

    releaseAuthChallenge(nonce);
    expect(claimAuthChallenge(nonce, expiresAt)).toEqual({ success: true });
    consumeAuthChallenge(nonce);
    expect(claimAuthChallenge(nonce, expiresAt)).toEqual({ success: false, reason: 'consumed' });
  });

  const spoofable = {
    'x-forwarded-for': '203.0.113.42',
    'x-real-ip': '192.0.2.100',
    'cf-connecting-ip': '198.51.100.77'
  };

  it('on Vercel, keys the limit by x-vercel-forwarded-for only', () => {
    const env = { NODE_ENV: 'production', VERCEL: '1' } as NodeJS.ProcessEnv;
    const request = (headers: Record<string, string>) =>
      new Request('https://example.test/api/auth/verify', { headers });
    expect(getClientKey(request({ 'x-vercel-forwarded-for': '198.51.100.10', ...spoofable }), env)).toBe(
      '198.51.100.10'
    );
    // A client that changes the headers it controls is still the same client.
    expect(
      getClientKey(request({ 'x-vercel-forwarded-for': '198.51.100.10', 'x-forwarded-for': '203.0.113.99' }), env)
    ).toBe('198.51.100.10');
    expect(getClientKey(request(spoofable), env)).toBeNull();
  });

  it('off Vercel, ignores client-supplied address headers unless the operator names one', () => {
    const request = new Request('https://example.test/api/auth/verify', {
      headers: { 'x-vercel-forwarded-for': '198.51.100.10', ...spoofable }
    });
    expect(trustedClientIpHeader({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBeNull();
    expect(getClientKey(request, { NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBeNull();
    expect(getClientKey(request, { NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe('localhost-dev');
  });

  it('reads the last entry of an operator-named header, the one its proxy added', () => {
    const env = { NODE_ENV: 'production', TRUSTED_CLIENT_IP_HEADER: 'X-Forwarded-For' } as NodeJS.ProcessEnv;
    const request = new Request('https://example.test/api/auth/verify', {
      headers: { 'x-forwarded-for': '10.0.0.1, 203.0.113.42', 'x-vercel-forwarded-for': '198.51.100.10' }
    });
    expect(getClientKey(request, env)).toBe('203.0.113.42');
    // The operator's choice wins over Vercel's header.
    expect(getClientKey(request, { ...env, VERCEL: '1' })).toBe('203.0.113.42');
  });

  it('trusts no header when TRUSTED_CLIENT_IP_HEADER is not a header name', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = {
      NODE_ENV: 'production',
      VERCEL: '1',
      TRUSTED_CLIENT_IP_HEADER: 'x-forwarded-for: 1'
    } as NodeJS.ProcessEnv;
    expect(trustedClientIpHeader(env)).toBeNull();
  });

  it('rate-limits by the trusted address, whatever else the client sends', () => {
    const scope = `trusted-${crypto.randomUUID()}`;
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('TRUSTED_CLIENT_IP_HEADER', '');
    try {
      const request = (spoof: string) =>
        new Request('https://example.test/api/auth/verify', {
          headers: { 'x-vercel-forwarded-for': '198.51.100.10', 'x-forwarded-for': spoof }
        });
      expect(enforceAuthRateLimit(request('203.0.113.1'), scope, 2)).toBeNull();
      expect(enforceAuthRateLimit(request('203.0.113.2'), scope, 2)).toBeNull();
      expect((enforceAuthRateLimit(request('203.0.113.3'), scope, 2) as Response).status).toBe(429);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('fails closed in production when no IP headers are present', () => {
    const scope = `missing-identity-prod-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify');
    try {
      // Temporarily set to non-development to test production behavior
      vi.stubEnv('NODE_ENV', 'production');
      expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('allows local development with static localhost identifier when no headers present', () => {
    const scope = `dev-localhost-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify');
    try {
      // Set to development to test fallback behavior
      vi.stubEnv('NODE_ENV', 'development');
      expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
      expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
      expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(429);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
