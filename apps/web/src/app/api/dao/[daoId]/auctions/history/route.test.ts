import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/auction-history/query', () => ({
  readAuctionHistory: mocks.read,
  AuctionHistoryError: class extends Error {
    constructor(
      message: string,
      public status = 400
    ) {
      super(message);
    }
  }
}));

import { AuctionHistoryError } from '@/lib/auction-history/query';

import { GET } from './route';

describe('history GET contract', () => {
  beforeEach(() => vi.resetAllMocks());
  it('forwards URL DAO and page/network parameters, returns a typed uncached page', async () => {
    const page = {
      deploymentId: 'manager:A',
      daoId: 'DAO_A',
      contractId: 'AUCTION_A',
      network: 'testnet',
      items: [{ tokenId: '9007199254740993', amount: '90071992547409931234567', winningBidder: 'GWINNER' }],
      limit: 12,
      offset: 24,
      hasMore: true
    };
    mocks.read.mockResolvedValue(page);
    const result = await GET(
      new Request('https://example.test/api/dao/DAO_A/auctions/history?limit=12&offset=24&network=testnet'),
      { params: Promise.resolve({ daoId: 'DAO_A' }) }
    );
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(await result.json()).toEqual(page);
    const [dao, params] = mocks.read.mock.calls[0];
    expect(dao).toBe('DAO_A');
    expect(params.toString()).toBe('limit=12&offset=24&network=testnet');
  });
  it('reports validation, scope/network and read failures without a successful empty archive', async () => {
    for (const status of [400, 404, 409, 503]) {
      mocks.read.mockRejectedValue(new AuctionHistoryError('Unavailable', status));
      const result = await GET(new Request('https://example.test/history'), {
        params: Promise.resolve({ daoId: 'DAO' })
      });
      expect(result.status).toBe(status);
      expect(await result.json()).toEqual({ message: 'Unavailable' });
    }
    mocks.read.mockRejectedValue(new Error('Read failed'));
    expect(
      (await GET(new Request('https://example.test/history'), { params: Promise.resolve({ daoId: 'DAO' }) })).status
    ).toBe(500);
  });
});
