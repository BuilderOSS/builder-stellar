import type { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { AssembledTransaction } from '@stellar/stellar-sdk/contract';
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
      amount: 10500001n,
      comment: ''
    });
    expect(prepared.signAndSend).not.toHaveBeenCalled();
  });
  it('sends the bid comment, and refuses one over the 1 KiB cap before any wallet prompt', async () => {
    const { mock, api } = client();
    await prepareBuyerAction(api, snapshot, 'GSESSION', 'bid', 10500001n, 50, { comment: 'gm' });
    expect(mock.create_bid).toHaveBeenCalledWith(expect.objectContaining({ comment: 'gm' }));
    // 342 three-byte characters: 1026 bytes, but only 342 characters.
    await expect(
      prepareBuyerAction(api, snapshot, 'GSESSION', 'bid', 10500001n, 50, { comment: '€'.repeat(342) })
    ).rejects.toThrow('Shorten');
  });
  it('an auction still on 0.1.0 gets the old call and refuses a comment', async () => {
    const { mock, api } = client();
    await expect(
      prepareBuyerAction(api, snapshot, 'GSESSION', 'bid', 10500001n, 50, { comment: 'gm', withComment: false })
    ).rejects.toThrow("doesn't take comments");
    expect(mock.create_bid).not.toHaveBeenCalled();

    const build = vi.spyOn(AssembledTransaction, 'build').mockResolvedValue({} as AssembledTransaction<void>);
    await prepareBuyerAction(
      api,
      snapshot,
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      'bid',
      10500001n,
      50,
      {
        withComment: false
      }
    );
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ method: 'create_bid' }));
    expect(build.mock.calls[0][0].args).toHaveLength(3);
    expect(mock.create_bid).not.toHaveBeenCalled();
    build.mockRestore();
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
  it('dispatches settle-only while paused (never before the end time) and settle-and-create when unpaused', async () => {
    const paused = { ...snapshot, paused: true };
    const early = client(paused);
    await expect(prepareBuyerAction(early.api, paused, 'GSESSION', 'settle', null, 50)).rejects.toThrow();
    expect(early.mock.settle_auction).not.toHaveBeenCalled();
    const only = client(paused);
    await prepareBuyerAction(only.api, paused, 'GSESSION', 'settle', null, 100);
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
