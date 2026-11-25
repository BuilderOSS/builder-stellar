import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_RATE_LIMITS } from '@/lib/api-rate-limit';

import { POST } from './route';

const report = (body: string, ip = '192.0.2.10', headers: Record<string, string> = {}) =>
  POST(
    new Request('https://tribes.build/api/csp-report', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/csp-report', 'x-vercel-forwarded-for': ip, ...headers }
    })
  );

describe('POST /api/csp-report', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL', '1');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('logs the directive, and the blocked address and page without their query strings', async () => {
    const response = await report(
      JSON.stringify({
        'csp-report': {
          'document-uri': 'https://tribes.build/dao/x?session=secret',
          'effective-directive': 'img-src',
          'blocked-uri': 'https://tracker.example/p.gif?id=GABC'
        }
      })
    );
    expect(response.status).toBe(204);
    expect(console.warn).toHaveBeenCalledWith('[csp-report]', {
      directive: 'img-src',
      blocked: 'https://tracker.example/p.gif',
      page: 'https://tribes.build/dao/x'
    });
  });

  it('reads Reporting API batches too', async () => {
    await report(
      JSON.stringify([
        {
          type: 'csp-violation',
          body: { effectiveDirective: 'script-src-elem', blockedURL: 'inline', documentURL: 'https://tribes.build/' }
        }
      ]),
      '192.0.2.11'
    );
    expect(console.warn).toHaveBeenCalledWith('[csp-report]', {
      directive: 'script-src-elem',
      blocked: 'inline',
      page: 'https://tribes.build/'
    });
  });

  it('drops a report over 16 KB unread, and anything that is not JSON', async () => {
    const big = JSON.stringify({ 'csp-report': { 'blocked-uri': 'x'.repeat(17 * 1024) } });
    expect((await report(big, '192.0.2.12')).status).toBe(204);
    expect((await report(big, '192.0.2.12', { 'content-length': String(big.length) })).status).toBe(204);
    expect((await report('not json', '192.0.2.12')).status).toBe(204);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('is rate limited per client', async () => {
    for (let i = 0; i < API_RATE_LIMITS['csp-report'].limit; i += 1) await report('{}', '192.0.2.13');
    expect((await report('{}', '192.0.2.13')).status).toBe(429);
  });
});
