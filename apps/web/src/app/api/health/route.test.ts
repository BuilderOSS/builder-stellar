import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ feed: vi.fn(), daoCount: vi.fn(), pipeline: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { appFeedStatus: { findFirst: mocks.feed }, managerDao: { count: mocks.daoCount } }
}));
vi.mock('@/lib/pipeline-health', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pipeline-health')>();
  return { ...original, fetchPipelineReport: mocks.pipeline, assessPipeline: vi.fn(original.assessPipeline) };
});

import { API_RATE_LIMITS } from '@/lib/api-rate-limit';
import { assessPipeline } from '@/lib/pipeline-health';
import { clearServerCache } from '@/lib/server-cache';

import { GET } from './route';

const SECRET_ERROR = 'sink postgres://indexer:hunter2@10.0.0.5:5432/stellar refused';
const get = (ip = '203.0.113.10') =>
  GET(new Request('https://tribes.build/api/health', { headers: { 'x-vercel-forwarded-for': ip } }));

describe('GET /api/health', () => {
  beforeEach(() => {
    clearServerCache();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ result: { sequence: 1000 } }))
    );
    mocks.feed.mockResolvedValue({ latestLedger: 990n, lastHourCount: 4n });
    mocks.daoCount.mockResolvedValue(3);
    mocks.pipeline.mockResolvedValue({ configured: true, status: 'RUNNING', errors: [SECRET_ERROR], lastLedger: 999 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports how many pipeline errors there are, never their text', async () => {
    const response = await get();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.pipeline).toEqual({ configured: true, status: 'RUNNING', error_count: 1 });
    expect(JSON.stringify(body)).not.toContain('hunter2');
    // The text stays in the server log.
    expect(console.error).toHaveBeenCalledWith('[api:health] Goldsky pipeline errors:', [SECRET_ERROR]);
  });

  it('shares one result for a few seconds instead of re-running every check', async () => {
    await get('203.0.113.11');
    await get('203.0.113.12');
    expect(mocks.feed).toHaveBeenCalledTimes(1);
    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
    expect((await get('203.0.113.13')).headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=10');
  });

  it('answers an unexpected failure in words and logs it', async () => {
    vi.mocked(assessPipeline).mockImplementationOnce(() => {
      throw new Error(SECRET_ERROR);
    });
    const response = await get('203.0.113.30');
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toMatchObject({ status: 'error', message: 'Health check unavailable' });
    expect(text).not.toContain('hunter2');
    expect(console.error).toHaveBeenCalledWith('[api:health]', expect.any(Error));
  });

  it('is rate limited per client', async () => {
    for (let i = 0; i < API_RATE_LIMITS.health.limit; i += 1) await get('203.0.113.20');
    expect((await get('203.0.113.20')).status).toBe(429);
  });
});
