import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_RATE_LIMITS, limitApiRequest, RATE_LIMITED_MESSAGE } from './api-rate-limit';

let nextIp = 1;
/** A request from an address no other test uses (the limiter's counts are per process). */
function client() {
  const ip = `198.51.100.${nextIp++}`;
  return () => new Request('https://tribes.build/api/render/x/1', { headers: { 'x-vercel-forwarded-for': ip } });
}

describe('limitApiRequest on Vercel', () => {
  beforeEach(() => vi.stubEnv('VERCEL', '1'));
  afterEach(() => vi.unstubAllEnvs());

  it('answers 429 with Retry-After once a client passes the route limit', async () => {
    const request = client();
    for (let i = 0; i < API_RATE_LIMITS.prepare.limit; i += 1) {
      expect(await limitApiRequest(request(), 'prepare')).toBeNull();
    }
    const blocked = await limitApiRequest(request(), 'prepare');
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Not the sign-in limiter's wording.
    expect(await blocked?.json()).toEqual({ code: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE });
  });

  it('counts each route and each client separately', async () => {
    const request = client();
    for (let i = 0; i < API_RATE_LIMITS.health.limit; i += 1) await limitApiRequest(request(), 'health');
    expect((await limitApiRequest(request(), 'health'))?.status).toBe(429);
    expect(await limitApiRequest(request(), 'render')).toBeNull();
    expect(await limitApiRequest(client()(), 'health')).toBeNull();
  });

  it('identifies the client only by the platform header, never by a forged x-forwarded-for', async () => {
    let n = 0;
    const forged = () =>
      new Request('https://tribes.build/api/health', {
        headers: { 'x-vercel-forwarded-for': '198.51.100.250', 'x-forwarded-for': `127.0.0.${++n}` }
      });
    for (let i = 0; i < API_RATE_LIMITS.health.limit; i += 1) await limitApiRequest(forged(), 'health');
    expect((await limitApiRequest(forged(), 'health'))?.status).toBe(429);
  });
});

describe('limitApiRequest without a trusted client address', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lets the request through uncounted, where sign-in refuses it', async () => {
    vi.stubEnv('VERCEL', '');
    // Off Vercel with no TRUSTED_CLIENT_IP_HEADER, no header is trusted, a client-sent one included.
    const request = () =>
      new Request('https://tribes.build/api/health', {
        headers: { 'x-vercel-forwarded-for': '198.51.100.251', 'x-forwarded-for': '198.51.100.251' }
      });
    for (let i = 0; i <= API_RATE_LIMITS.health.limit; i += 1) {
      expect(await limitApiRequest(request(), 'health')).toBeNull();
    }
  });

  it('does not count local development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const local = () => new Request('http://localhost:4242/api/health');
    for (let i = 0; i <= API_RATE_LIMITS.health.limit; i += 1) {
      expect(await limitApiRequest(local(), 'health')).toBeNull();
    }
  });
});
