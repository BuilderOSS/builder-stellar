import type { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { describe, expect, it, vi } from 'vitest';

import { prepareBuyerAction, prepareBuyerRefund } from './actions';
import type { CurrentAuction } from './types';

const snapshot: CurrentAuction = {
  status: 'active',
  auctionEnabled: true,
  paused: false,
  auction: {
    token_id: '9007199254740993',
    start_time: '1',
    end_time: '100',
    highest_bid: '10000001',
    highest_bidder: 'GOLD',
    settled: false
  },
  config: { reserve_price: '0', min_bid_increment_percent: 5, payment_token: 'CPAY' }
};

function client(data = snapshot) {
  const prepared = { signAndSend: vi.fn() };
  const mock = {
    get_auction: vi.fn().mockResolvedValue({
      result: {
        ...data.auction!,
        token_id: BigInt(data.auction!.token_id),
        start_time: 1n,
        end_time: 100n,
        highest_bid: BigInt(data.auction!.highest_bid)
      }
    }),
    get_config: vi
      .fn()
      .mockResolvedValue({ result: { ...data.config, reserve_price: BigInt(data.config.reserve_price) } }),
    paused: vi.fn().mockResolvedValue({ result: data.paused }),
    create_bid: vi.fn().mockResolvedValue(prepared),
    settle_auction: vi.fn().mockResolvedValue(prepared),
    settle_and_create_new: vi.fn().mockResolvedValue(prepared),
    pending_refund: vi.fn().mockResolvedValue({ result: 90071992547409931234567n }),
    withdraw_refund: vi.fn().mockResolvedValue(prepared)
  };
  return { mock, prepared, api: mock as unknown as AuctionClient };
}

describe('explicit auction action preparation', () => {
  it('passes full exact bid and u128 token ID to the current binding, without signing', async () => {
    const { mock, api, prepared } = client();
    await prepareBuyerAction(api, snapshot, 'GSESSION', 'bid', 10500001n, 50);
    expect(mock.create_bid).toHaveBeenCalledWith({
      bidder: 'GSESSION',
      token_id: 9007199254740993n,
      amount: 10500001n
    });
    expect(prepared.signAndSend).not.toHaveBeenCalled();
  });
  it('fresh reads reject outbid minimums, expiry, pause, token and payment-token rotation', async () => {
    const cases = [
      { ...snapshot, auction: { ...snapshot.auction!, highest_bid: '20000000' } },
      { ...snapshot, paused: true },
      { ...snapshot, auction: { ...snapshot.auction!, token_id: '7' } },
      { ...snapshot, config: { ...snapshot.config, payment_token: 'COTHER' } },
      { ...snapshot, auction: { ...snapshot.auction!, settled: true } }
    ];
    for (const fresh of cases) {
      const { api, mock } = client(fresh);
      await expect(prepareBuyerAction(api, snapshot, 'GSESSION', 'bid', 10500001n, 50)).rejects.toThrow();
      expect(mock.create_bid).not.toHaveBeenCalled();
    }
    const { api, mock } = client();
    await expect(prepareBuyerAction(api, snapshot, 'GSESSION', 'bid', 10500001n, 100)).rejects.toThrow('not accepting');
    expect(mock.create_bid).not.toHaveBeenCalled();
  });
  it('dispatches settle-only while paused and settle-and-create at exact expiry when unpaused', async () => {
    const paused = { ...snapshot, paused: true };
    const only = client(paused);
    await prepareBuyerAction(only.api, paused, 'GSESSION', 'settle', null, 50);
    expect(only.mock.settle_auction).toHaveBeenCalledOnce();
    expect(only.mock.settle_and_create_new).not.toHaveBeenCalled();
    const next = client();
    await prepareBuyerAction(next.api, snapshot, 'GSESSION', 'settle', null, 100);
    expect(next.mock.settle_and_create_new).toHaveBeenCalledOnce();
    expect(next.prepared.signAndSend).not.toHaveBeenCalled();
  });
  it('does not switch settlement method behind the buyer review or settle twice', async () => {
    const changed = client();
    await expect(
      prepareBuyerAction(changed.api, { ...snapshot, paused: true }, 'GSESSION', 'settle', null, 100)
    ).rejects.toThrow('state changed');
    expect(changed.mock.settle_and_create_new).not.toHaveBeenCalled();
    const settled = client({ ...snapshot, auction: { ...snapshot.auction!, settled: true } });
    await expect(prepareBuyerAction(settled.api, snapshot, 'GSESSION', 'settle', null, 100)).rejects.toThrow(
      'state changed'
    );
  });
  it('withdraws the whole exact refund for the wallet bidder without inventing an amount or signing', async () => {
    const { api, mock, prepared } = client();
    await prepareBuyerRefund(api, 'GSESSION');
    expect(mock.pending_refund).toHaveBeenCalledWith({ bidder: 'GSESSION' });
    expect(mock.withdraw_refund).toHaveBeenCalledWith({ bidder: 'GSESSION' });
    expect(prepared.signAndSend).not.toHaveBeenCalled();
    mock.pending_refund.mockResolvedValue({ result: 0n });
    mock.withdraw_refund.mockClear();
    await expect(prepareBuyerRefund(api, 'GSESSION')).rejects.toThrow('No deferred refund');
    expect(mock.withdraw_refund).not.toHaveBeenCalled();
  });
});
