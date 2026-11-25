import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Upstream failures carry hosts, credentials and queries; none of it may reach a client.
const INTERNAL = 'connect ECONNREFUSED 10.0.0.5:5432 (prisma: SELECT * FROM manager.daos)';

const mocks = vi.hoisted(() => ({
  daoConfig: vi.fn(),
  networkConfig: vi.fn(),
  activity: vi.fn(),
  bids: vi.fn(),
  scope: vi.fn(),
  slug: vi.fn()
}));
vi.mock('@/lib/prisma', () => ({ prisma: { managerDao: { findFirst: mocks.slug, count: mocks.slug } } }));
vi.mock('@/lib/dao-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dao-db')>()),
  getDaoConfigFromDatabase: mocks.daoConfig
}));
vi.mock('@/lib/dao-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dao-config')>()),
  getDaoNetworkConfigById: mocks.networkConfig
}));
vi.mock('@/lib/goldsky', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/goldsky')>()),
  getGoldskyActivityFeed: mocks.activity,
  getGoldskyAuctionBids: mocks.bids
}));
vi.mock('@/lib/member-directory/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/member-directory/query')>()),
  directoryScope: mocks.scope
}));

import { PREPARE_FAILED } from '@/lib/marketplace/errors';
import { marketplaceTradeFailure } from '@/lib/marketplace/http';
import { clearServerCache } from '@/lib/server-cache';

import { GET as activityFeed } from './dao/[daoId]/activity-feed/route';
import { GET as auctionBids } from './dao/[daoId]/auctions/bids/route';
import { GET as governanceSettings } from './dao/[daoId]/governance/settings/route';
import { GET as proposals } from './dao/[daoId]/proposals/route';
import { GET as dao } from './dao/[daoId]/route';
import { GET as tokenJson } from './dao/[daoId]/token/[tokenId]/route';
import { GET as unseeded } from './dao/[daoId]/tokens/unseeded/route';
import { GET as slug } from './slugs/[slug]/route';

const request = (path: string) => new Request(`https://tribes.build${path}`);
const daoParams = { params: Promise.resolve({ daoId: 'garden' }) };

describe('API error text', () => {
  beforeEach(() => {
    clearServerCache();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const mock of Object.values(mocks)) mock.mockReset().mockRejectedValue(new Error(INTERNAL));
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['/api/dao/garden', () => dao(request('/api/dao/garden'), daoParams), 'Tribe details are unavailable. Try again.'],
    [
      '/api/dao/garden/activity-feed',
      () => activityFeed(request('/api/dao/garden/activity-feed'), daoParams),
      'Activity is unavailable. Try again.'
    ],
    [
      '/api/dao/garden/auctions/bids',
      () => auctionBids(request('/api/dao/garden/auctions/bids?tokenId=1'), daoParams),
      'Bids are unavailable. Try again.'
    ],
    [
      '/api/dao/garden/governance/settings',
      () => governanceSettings(request('/api/dao/garden/governance/settings'), daoParams),
      'Governance settings are unavailable. Try again.'
    ],
    [
      '/api/dao/garden/proposals',
      () => proposals(request('/api/dao/garden/proposals'), daoParams),
      'Proposals are unavailable. Try again.'
    ],
    [
      '/api/dao/garden/token/1',
      () =>
        tokenJson(request('/api/dao/garden/token/1'), { params: Promise.resolve({ daoId: 'garden', tokenId: '1' }) }),
      'Token details are unavailable. Try again.'
    ],
    [
      '/api/dao/garden/tokens/unseeded',
      () => unseeded(request('/api/dao/garden/tokens/unseeded'), daoParams),
      'Tokens without artwork could not be listed. Try again.'
    ],
    [
      '/api/slugs/garden',
      () => slug(request('/api/slugs/garden'), { params: Promise.resolve({ slug: 'garden' }) }),
      'Name availability could not be checked. Try again.'
    ]
  ])('%s answers in words and logs the detail', async (_path, call, message) => {
    const response = await call();
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(text).message).toBe(message);
    expect(text).not.toContain('10.0.0.5');
    expect(text).not.toContain('prisma');
    expect(console.error).toHaveBeenCalled();
  });

  it('still says when a tribe does not exist', async () => {
    mocks.daoConfig.mockRejectedValue(new Error('DAO not found: garden'));
    mocks.networkConfig.mockRejectedValue(new Error('DAO not found: garden'));
    for (const response of [
      await dao(request('/api/dao/garden'), daoParams),
      await proposals(request('/api/dao/garden/proposals'), daoParams)
    ]) {
      expect(response.status).toBe(404);
      expect((await response.json()).message).toBe('Tribe not found.');
    }
  });

  it('still names a malformed token ID', async () => {
    const response = await tokenJson(request('/api/dao/garden/token/x'), {
      params: Promise.resolve({ daoId: 'garden', tokenId: 'x' })
    });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('Invalid token ID.');
  });

  it('keeps unknown simulation text out of marketplace preparation failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = marketplaceTradeFailure(new Error(`HostError: ${INTERNAL}`));
    expect(response.status).toBe(422);
    expect((await response.json()).message).toBe(PREPARE_FAILED);
  });
});
