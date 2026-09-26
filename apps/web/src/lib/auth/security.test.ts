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

  it('rate-limits authentication requests', async () => {
    const scope = `test-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify', {
      headers: { 'x-vercel-forwarded-for': '198.51.100.10' }
    });

    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect(enforceAuthRateLimit(request, scope, 2)).toBeNull();
    expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(429);
  });

  it('fails closed when the trusted client identity is unavailable', () => {
    const scope = `missing-identity-${crypto.randomUUID()}`;
    const request = new Request('http://localhost:3000/api/auth/verify');

    expect((enforceAuthRateLimit(request, scope, 2) as Response).status).toBe(503);
  });
});
