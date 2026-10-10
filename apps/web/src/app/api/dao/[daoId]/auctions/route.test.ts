import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  auction: vi.fn(),
  paused: vi.fn(),
  history: vi.fn(),
  bids: vi.fn()
}));
vi.mock('@builder-stellar/auction-bindings', () => ({
  Client: class {
    get_config = async () => ({ result: { duration: 300n } });
    get_auction = mocks.auction;
    paused = mocks.paused;
  }
}));
vi.mock('@/lib/dao-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dao-config')>()),
  getDaoNetworkConfigById: mocks.config
}));
vi.mock('@/lib/goldsky', () => ({ getGoldskyAuctionHistory: mocks.history, getGoldskyAuctionBids: mocks.bids }));
import { GET } from './route';

const get = () =>
  GET(new Request('https://app.test/api/dao/dao1/auctions'), { params: Promise.resolve({ daoId: 'dao1' }) });
describe('expected prelaunch auction state', () => {
  beforeEach(() => {
    mocks.config.mockResolvedValue({ auctionContractId: 'auction1', auctionEnabled: true });
    mocks.paused.mockResolvedValue({ result: true });
    mocks.history.mockResolvedValue([]);
    mocks.bids.mockClear();
    mocks.auction.mockRejectedValue(new Error('Error(Contract, #7409)'));
  });
  it('returns NotLaunched as an ordinary state, not a 500', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'not-launched', auction: null, config: { duration: '300' } });
    expect(mocks.bids).not.toHaveBeenCalled();
    expect(mocks.history).toHaveBeenCalledWith('dao1');
  });
  it('does not mask unrelated contract/RPC errors as prelaunch', async () => {
    mocks.auction.mockRejectedValue(new Error('RPC unavailable'));
    expect((await get()).status).toBe(500);
  });
});
