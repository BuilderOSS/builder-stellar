import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ swr: vi.fn(), pending: vi.fn(), client: vi.fn() }));
vi.mock('swr', () => ({ default: mocks.swr }));
vi.mock('@builder-stellar/auction-bindings', () => ({
  Client: class {
    constructor(options: unknown) {
      mocks.client(options);
    }
    pending_refund = mocks.pending;
  }
}));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'manager:DEPLOYMENT_A' }));

import type { DaoNetworkConfig } from '@/lib/dao-config';

import { auctionQueryKey, fetchAuctionHistory, useAuctionHistory, useBuyerRefund } from './hooks';

const config = {
  name: 'testnet',
  rpcUrl: 'https://test',
  passphrase: 'TEST',
  tokenContractId: 'DAO_A',
  auctionContractId: 'AUCTION_A'
} as DaoNetworkConfig;

describe('buyer query network isolation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });
  it('keys include deployment, DAO, contract, RPC, passphrase, page and bidder', () => {
    const key = auctionQueryKey(config, 'url', 'history', 0);
    expect(key).toEqual([
      'auction-buyer',
      'manager:DEPLOYMENT_A',
      'url',
      'DAO_A',
      'AUCTION_A',
      'testnet',
      'https://test',
      'TEST',
      'history',
      0
    ]);
    for (const alternate of [
      { ...config, name: 'public' as const, passphrase: 'PUBLIC' },
      { ...config, rpcUrl: 'https://other' },
      { ...config, auctionContractId: 'AUCTION_B' },
      { ...config, tokenContractId: 'DAO_B' }
    ])
      expect(auctionQueryKey(alternate, 'url', 'history', 0)).not.toEqual(key);
    expect(auctionQueryKey(config, 'url', 'history', 1)).not.toEqual(key);
    expect(auctionQueryKey(config, 'url', 'refund', 'GONE')).not.toEqual(
      auctionQueryKey(config, 'url', 'refund', 'GTWO')
    );
  });
  it('uses encoded URL, pagination and network and refuses foreign response identity', async () => {
    const response = {
      deploymentId: 'manager:DEPLOYMENT_A',
      daoId: 'DAO_A',
      contractId: 'AUCTION_A',
      network: 'testnet',
      items: []
    };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => response });
    vi.stubGlobal('fetch', fetch);
    await fetchAuctionHistory(config, 'url/dao', 2);
    expect(fetch).toHaveBeenCalledWith('/api/dao/url%2Fdao/auctions/history?limit=12&offset=24&network=testnet', {
      cache: 'no-store'
    });
    for (const foreign of [
      { ...response, deploymentId: 'manager:B' },
      { ...response, daoId: 'DAO_B' },
      { ...response, contractId: 'AUCTION_B' },
      { ...response, network: 'public' }
    ]) {
      fetch.mockResolvedValue({ ok: true, json: async () => foreign });
      await expect(fetchAuctionHistory(config, 'url/dao', 2)).rejects.toThrow('identity');
    }
  });
  it('disables missing module/account reads and does not retain another key’s data', async () => {
    useAuctionHistory({ ...config, auctionContractId: '' }, 'url', 0);
    expect(mocks.swr.mock.calls[0][0]).toBeNull();
    useBuyerRefund(config, 'url', '');
    expect(mocks.swr.mock.calls[1][0]).toBeNull();
    mocks.pending.mockResolvedValue({ result: 90071992547409931234567n });
    useBuyerRefund(config, 'url', 'GONE');
    const [, fetcher, options] = mocks.swr.mock.calls[2];
    expect(options.keepPreviousData).not.toBe(true);
    expect(await fetcher()).toBe(90071992547409931234567n);
    expect(mocks.client).toHaveBeenCalledWith({
      contractId: 'AUCTION_A',
      rpcUrl: 'https://test',
      networkPassphrase: 'TEST',
      publicKey: 'GONE',
      allowHttp: false
    });
    expect(mocks.pending).toHaveBeenCalledWith({ bidder: 'GONE' });
  });
});
