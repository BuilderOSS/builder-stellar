import { describe, expect, it } from 'vitest';

import {
  assertAuctionWallet,
  auctionBuyerState,
  formatAuctionAmount,
  MAX_I128,
  minimumAuctionBid,
  parseAuctionAmount,
  settlementMethod,
  validateAuctionBid
} from './state';
import type { CurrentAuction } from './types';

export const auctionFixture: CurrentAuction = {
  status: 'active',
  auctionEnabled: true,
  paused: false,
  auction: {
    token_id: '9007199254740993',
    start_time: '1',
    end_time: '100',
    highest_bid: '10000001',
    highest_bidder: 'GBIDDER',
    settled: false
  },
  config: { reserve_price: '0', min_bid_increment_percent: 5, payment_token: 'CPAY' }
};
const config = { status: 'operational' as const, auctionEnabled: true, auctionContractId: 'CAUCTION' };

describe('auction buyer economics and lifecycle', () => {
  it('parses and formats exact SAC amounts, rejecting zero, negatives, exponent notation and excess precision', () => {
    expect(parseAuctionAmount('9007199254740993.1234567')).toBe(90071992547409931234567n);
    expect(formatAuctionAmount('90071992547409931234567')).toBe('9007199254740993.1234567');
    expect(parseAuctionAmount('0.0000001')).toBe(1n);
    expect(parseAuctionAmount(formatAuctionAmount(MAX_I128))).toBe(MAX_I128);
    expect(parseAuctionAmount(formatAuctionAmount(MAX_I128 + 1n))).toBeNull();
    for (const value of ['0', '-1', '1e3', '1.00000001', '', 'Infinity', '.1'])
      expect(parseAuctionAmount(value)).toBeNull();
  });
  it('uses floor integer increments and at least one base unit with a zero reserve', () => {
    expect(minimumAuctionBid(auctionFixture)).toBe(10500001n);
    const noBid = {
      ...auctionFixture,
      auction: { ...auctionFixture.auction!, highest_bid: '0', highest_bidder: null }
    };
    expect(minimumAuctionBid(noBid)).toBe(1n);
    expect(() => validateAuctionBid(noBid, noBid.auction.token_id, 0n, 50)).toThrow('Bid at least');
    expect(() => validateAuctionBid(auctionFixture, auctionFixture.auction!.token_id, 10500000n, 50)).toThrow(
      'Bid at least'
    );
    expect(() => validateAuctionBid(auctionFixture, auctionFixture.auction!.token_id, 10500001n, 50)).not.toThrow();
  });
  it('distinguishes setup, disabled, not launched, paused, active, exact expiry and settled', () => {
    expect(auctionBuyerState({ ...config, status: 'pending' }, auctionFixture, 50)).toBe('setup');
    expect(auctionBuyerState({ ...config, auctionEnabled: false }, auctionFixture, 50)).toBe('disabled');
    expect(auctionBuyerState({ ...config, auctionContractId: '' }, undefined, 50)).toBe('disabled');
    expect(auctionBuyerState(config, { ...auctionFixture, auction: null, status: 'not-launched' }, 50)).toBe(
      'not-launched'
    );
    expect(auctionBuyerState(config, { ...auctionFixture, auction: null, status: 'paused', paused: true }, 50)).toBe(
      'paused'
    );
    expect(auctionBuyerState(config, auctionFixture, 0)).toBe('loading');
    expect(auctionBuyerState(config, auctionFixture, 99)).toBe('active');
    expect(auctionBuyerState(config, auctionFixture, 100)).toBe('expired');
    expect(auctionBuyerState(config, { ...auctionFixture, paused: true }, 100)).toBe('paused');
    expect(
      auctionBuyerState(config, { ...auctionFixture, auction: { ...auctionFixture.auction!, settled: true } }, 100)
    ).toBe('settled');
  });
  it('matches paused-only settlement, including pre-expiry, and never restarts an already settled auction', () => {
    expect(settlementMethod(auctionFixture, 99)).toBeNull();
    expect(settlementMethod(auctionFixture, 100)).toBe('settle_and_create_new');
    expect(settlementMethod({ ...auctionFixture, paused: true }, 50)).toBe('settle_auction');
    expect(settlementMethod({ ...auctionFixture, auction: null }, 100)).toBeNull();
    expect(
      settlementMethod({ ...auctionFixture, auction: { ...auctionFixture.auction!, settled: true } }, 100)
    ).toBeNull();
  });
  it('rejects paused, expired, settled, rotated tokens and wrong wallet networks/accounts', () => {
    expect(() => validateAuctionBid(auctionFixture, '123', 20000000n, 50)).toThrow('changed');
    expect(() => validateAuctionBid(auctionFixture, auctionFixture.auction!.token_id, 20000000n, 100)).toThrow(
      'not accepting'
    );
    expect(() =>
      validateAuctionBid({ ...auctionFixture, paused: true }, auctionFixture.auction!.token_id, 20000000n, 50)
    ).toThrow('not accepting');
    expect(() => assertAuctionWallet('GONE', 'TEST', 'GTWO', 'TEST')).toThrow('account changed');
    expect(() => assertAuctionWallet('GONE', 'MAIN', 'GONE', 'TEST')).toThrow('network');
    expect(() => assertAuctionWallet('GONE', 'TEST', 'GONE', 'TEST')).not.toThrow();
  });
});
