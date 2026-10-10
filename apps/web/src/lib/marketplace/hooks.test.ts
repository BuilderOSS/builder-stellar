import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';

import { marketplaceFetchKey, marketplaceKey } from './hooks';
import { parseMarketplacePreferences } from './preferences';

afterEach(() => {
  vi.unstubAllGlobals();
});
function respond(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
}

describe('marketplace client identity bindings', () => {
  it('separates deployment, DAO, resource/filter URL and authenticated wallet in cache keys', () => {
    const a = marketplaceKey('dao-a', 'inventory', '/api/a?page=0', 'wallet-a');
    expect(a).toEqual(['marketplace', DEPLOYMENT_ID, 'dao-a', 'inventory', '/api/a?page=0', 'wallet-a']);
    expect(a).not.toEqual(marketplaceKey('dao-b', 'inventory', '/api/a?page=0', 'wallet-a'));
    expect(a).not.toEqual(marketplaceKey('dao-a', 'inventory', '/api/a?page=1', 'wallet-a'));
    expect(a).not.toEqual(marketplaceKey('dao-a', 'inventory', '/api/a?page=0', 'wallet-b'));
  });
  it('rejects a mismatched deployment, DAO or actor before caching the response', async () => {
    const key = marketplaceKey('dao-a', 'inventory', '/inventory', 'wallet-a');
    for (const body of [
      { deploymentId: 'deployment-b', daoId: 'dao-a', address: 'wallet-a' },
      { deploymentId: DEPLOYMENT_ID, daoId: 'dao-b', address: 'wallet-a' },
      { deploymentId: DEPLOYMENT_ID, daoId: 'dao-a', address: 'wallet-b' },
      { daoId: 'dao-a', address: 'wallet-a' }
    ]) {
      respond(body);
      await expect(marketplaceFetchKey(key)).rejects.toThrow();
    }
  });
  it('accepts DAO and global DTO identities without wallet-provided mutation identity', async () => {
    respond({ deploymentId: DEPLOYMENT_ID, community: { daoId: 'dao-a' }, listings: [] });
    await expect(marketplaceFetchKey(marketplaceKey('dao-a', 'dao', '/dao'))).resolves.toMatchObject({ listings: [] });
    respond({ deploymentId: DEPLOYMENT_ID, communities: [] });
    await expect(marketplaceFetchKey(marketplaceKey(null, 'directory', '/directory'))).resolves.toMatchObject({
      communities: []
    });
  });
  it('bounds and validates browser-private preferences without creating public tags', () => {
    const daoId = `C${'A'.repeat(55)}`;
    const parsed = parseMarketplacePreferences(
      JSON.stringify({
        home: 'offers',
        favorites: [daoId, 'bad-id'],
        labels: { [daoId]: 'Private label', 'bad-id': 'ignore' },
        publicTags: ['invented']
      })
    );
    expect(parsed).toEqual({ home: 'offers', favorites: [daoId], labels: { [daoId]: 'Private label' } });
    expect(parseMarketplacePreferences('malformed')).toEqual({ home: 'communities', favorites: [], labels: {} });
  });
});
