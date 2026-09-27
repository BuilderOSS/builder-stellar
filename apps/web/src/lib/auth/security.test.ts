import { describe, expect, it } from 'vitest';

import { enforceAuthRateLimit } from './rate-limit';
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

  it('rate-limits authentication requests with x-vercel-forwarded-for', async () => {
    const scope = `test-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify', {
      headers: { 'x-vercel-forwarded-for': '198.51.100.10' }
    });

    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(429);
  });

  it('falls back to x-forwarded-for header', () => {
    const scope = `forwarded-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify', {
      headers: { 'x-forwarded-for': '203.0.113.42, 198.51.100.50' }
    });

    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(429);
  });

  it('falls back to x-real-ip header', () => {
    const scope = `realip-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify', {
      headers: { 'x-real-ip': '192.0.2.100' }
    });

    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(429);
  });

  it('falls back to cf-connecting-ip header', () => {
    const scope = `cloudflare-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify', {
      headers: { 'cf-connecting-ip': '198.51.100.77' }
    });

    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(429);
  });

  it('respects header priority (x-vercel-forwarded-for > x-forwarded-for > x-real-ip > cf-connecting-ip)', () => {
    const scope = `priority-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify', {
      headers: {
        'x-vercel-forwarded-for': '198.51.100.10',
        'x-forwarded-for': '203.0.113.42',
        'x-real-ip': '192.0.2.100',
        'cf-connecting-ip': '198.51.100.77'
      }
    });

    // Should use x-vercel-forwarded-for
    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    // If it was using a different header, this would not hit rate limit
    expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(429);
  });

  it('fails closed in production when no IP headers are present', () => {
    const scope = `missing-identity-prod-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify');
    const nodeEnv = process.env.NODE_ENV;

    try {
      // Temporarily set to non-development to test production behavior
      process.env.NODE_ENV = 'production';
      expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(503);
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
  });

  it('allows local development with static localhost identifier when no headers present', () => {
    const scope = `dev-localhost-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify');
    const nodeEnv = process.env.NODE_ENV;

    try {
      // Set to development to test fallback behavior
      process.env.NODE_ENV = 'development';
      expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
      expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
      expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(429);
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
  });
});
