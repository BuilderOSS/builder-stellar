import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Nothing past the limiter may run: these would show it did.
const work = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('route work ran past the limit');
  })
);
vi.mock('@/lib/dao-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dao-config')>()),
  getDaoNetworkConfigById: work
}));
vi.mock('@/lib/auth/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/server')>()),
  getAuthSession: work,
  requireAuthenticatedSession: work
}));
vi.mock('@/lib/minter/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/minter/service')>()),
  claimHistory: work,
  currentClaims: work
}));
vi.mock('@/lib/minter/open-lists', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/minter/open-lists')>()),
  openClaimLists: work
}));
vi.mock('@/lib/goldsky', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/goldsky')>()),
  getGoldskyHealth: work
}));

import { API_RATE_LIMITS, limitApiRequest, type LimitedRoute } from '@/lib/api-rate-limit';

import { GET as claimHistory } from './dao/[daoId]/claims/history/route';
import { GET as claimLists } from './dao/[daoId]/claims/lists/route';
import { POST as claimPrepare } from './dao/[daoId]/claims/prepare/route';
import { GET as claims } from './dao/[daoId]/claims/route';
import { POST as marketplacePrepare } from './dao/[daoId]/marketplace/prepare/route';
import { POST as tokensPrepare } from './dao/[daoId]/tokens/prepare/route';
import { POST as treasuryPrepare } from './dao/[daoId]/treasury/prepare/route';
import { GET as goldskyHealth } from './goldsky/health/route';
import { GET as renderToken } from './render/[daoId]/[tokenId]/route';
import { GET as renderQuery } from './render/route';

let nextIp = 1;
const dao = { params: Promise.resolve({ daoId: 'CDAO' }) };
const post = (ip: string) =>
  new Request('https://tribes.build/api/x', {
    method: 'POST',
    body: '{}',
    headers: { origin: 'https://tribes.build', 'x-vercel-forwarded-for': ip }
  });
const get = (ip: string, path = '/api/x') =>
  new Request(`https://tribes.build${path}`, { headers: { 'x-vercel-forwarded-for': ip } });

const CONTRACT = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';

describe.each<[string, LimitedRoute, (ip: string) => Promise<Response>]>([
  [
    'GET /api/render/[daoId]/[tokenId]',
    'render',
    (ip) => renderToken(get(ip), { params: Promise.resolve({ daoId: 'CDAO', tokenId: '1' }) })
  ],
  [
    'GET /api/render?contract=&token=',
    'render',
    (ip) => renderQuery(get(ip, `/api/render?contract=${CONTRACT}&token=1`))
  ],
  ['POST claims/prepare', 'prepare', (ip) => claimPrepare(post(ip), dao)],
  ['POST marketplace/prepare', 'prepare', (ip) => marketplacePrepare(post(ip), dao)],
  ['POST tokens/prepare', 'prepare', (ip) => tokensPrepare(post(ip), dao)],
  ['POST treasury/prepare', 'prepare', (ip) => treasuryPrepare(post(ip), dao)],
  ['GET claims', 'claims', (ip) => claims(get(ip), dao)],
  ['GET claims/history', 'claims', (ip) => claimHistory(get(ip), dao)],
  ['GET claims/lists', 'claims', (ip) => claimLists(get(ip), dao)],
  ['GET /api/goldsky/health', 'health', (ip) => goldskyHealth(get(ip))]
])('%s', (_name, route, call) => {
  beforeEach(() => vi.stubEnv('VERCEL', '1'));
  afterEach(() => vi.unstubAllEnvs());

  it(`answers 429 once the client has used its ${route} limit, before any work`, async () => {
    const ip = `198.18.0.${nextIp++}`;
    for (let i = 0; i < API_RATE_LIMITS[route].limit; i += 1) await limitApiRequest(get(ip), route);
    work.mockClear();
    const response = await call(ip);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(work).not.toHaveBeenCalled();
  });
});
