import { describe, expect, it } from 'vitest';

import { API_RATE_LIMITS, limitApiRequest, RATE_LIMITED_MESSAGE } from './api-rate-limit';

let nextIp = 1;
/** A request from an address no other test uses (the limiter's counts are per process). */
function client() {
  const ip = `198.51.100.${nextIp++}`;
  return () => new Request('https://tribes.build/api/render/x/1', { headers: { 'x-vercel-forwarded-for': ip } });
}

describe('limitApiRequest', () => {
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

  it('does not count requests from this machine (next dev, next start, the walkthrough suite)', async () => {
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      const local = () => new Request('http://localhost:4242/api/health', { headers: { 'x-forwarded-for': address } });
      for (let i = 0; i <= API_RATE_LIMITS.health.limit; i += 1) {
        expect(await limitApiRequest(local(), 'health'), address).toBeNull();
      }
    }
  });

  it('never treats a Vercel request as local', async () => {
    const forged = () =>
      new Request('https://tribes.build/api/health', {
        headers: { 'x-vercel-forwarded-for': '198.51.100.250', 'x-forwarded-for': '127.0.0.1' }
      });
    for (let i = 0; i < API_RATE_LIMITS.health.limit; i += 1) await limitApiRequest(forged(), 'health');
    expect((await limitApiRequest(forged(), 'health'))?.status).toBe(429);
  });

  it('lets a request with no client address through uncounted', async () => {
    const anonymous = () => new Request('https://tribes.build/api/health');
    for (let i = 0; i <= API_RATE_LIMITS.health.limit; i += 1) {
      expect(await limitApiRequest(anonymous(), 'health')).toBeNull();
    }
  });
});
