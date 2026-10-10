import { describe, expect, it } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';

import { getActionHandler } from './registry';
import type { BuildContext, FormContext } from './types';

// Resolve handlers through the registry (importing admin-actions directly hits a circular import).
const setVotingDelayHandler = getActionHandler('set-voting-delay');
const setVotingPeriodHandler = getActionHandler('set-voting-period');
const setQuorumBpsHandler = getActionHandler('set-quorum-bps');
const setProposalThresholdHandler = getActionHandler('set-proposal-threshold');
const setAuctionTimeBufferHandler = getActionHandler('set-auction-time-buffer');
const createPrimaryListingHandler = getActionHandler('create-primary-listing');
const cancelPrimaryListingHandler = getActionHandler('cancel-primary-listing');

const config = { marketplaceContractId: 'CMARKET', auctionContractId: 'CAUCTION' } as DaoNetworkConfig;
const buildContext: BuildContext = {
  config,
  governorContractId: 'CGOV',
  tokenContractId: 'CTOKEN',
  treasuryAddress: 'CTREASURY'
};
const formContext = { config, session: { address: null, kit: null } } as FormContext;

describe('governor setter proposal actions', () => {
  it('builds calls without a caller argument', () => {
    expect(setVotingDelayHandler.buildCallVector({ value: '300' }, buildContext)).toEqual({
      target: 'CGOV',
      function: 'set_voting_delay',
      args: [300]
    });
    expect(setVotingPeriodHandler.buildCallVector({ value: '86400' }, buildContext).args).toEqual([86400]);
    expect(setQuorumBpsHandler.buildCallVector({ value: '1000' }, buildContext).args).toEqual([1000]);
    expect(setProposalThresholdHandler.buildCallVector({ value: '5' }, buildContext).args).toEqual(['5']);
  });

  it('enforces contract bounds', () => {
    expect(setVotingDelayHandler.validate({ value: '299' }, formContext).valid).toBe(false);
    expect(setVotingDelayHandler.validate({ value: '2592001' }, formContext).valid).toBe(false);
    expect(setVotingPeriodHandler.validate({ value: '2592000' }, formContext).valid).toBe(true);
    expect(setQuorumBpsHandler.validate({ value: '0' }, formContext).valid).toBe(false);
    expect(setQuorumBpsHandler.validate({ value: '10001' }, formContext).valid).toBe(false);
    expect(setProposalThresholdHandler.validate({ value: '0' }, formContext).valid).toBe(false);
    expect(setProposalThresholdHandler.validate({ value: '1' }, formContext).valid).toBe(true);
    expect(setAuctionTimeBufferHandler.validate({ value: '0' }, formContext).valid).toBe(false);
    expect(setAuctionTimeBufferHandler.validate({ value: '86401' }, formContext).valid).toBe(false);
    expect(setAuctionTimeBufferHandler.validate({ value: '86400' }, formContext).valid).toBe(true);
  });

  it('no longer registers a governor authority action', () => {
    expect(() => getActionHandler('set-governor-authority' as never)).toThrow();
  });
});

describe('primary listing proposal actions', () => {
  it('builds create_primary_listing(price, expires_at) against the marketplace', () => {
    const data = { price: '1.5', expiresAt: '2030-01-01T00:00' };
    expect(createPrimaryListingHandler.validate(data, formContext).valid).toBe(true);
    const call = createPrimaryListingHandler.buildCallVector(data, buildContext);
    expect(call.target).toBe('CMARKET');
    expect(call.function).toBe('create_primary_listing');
    expect(call.args[0]).toBe('15000000');
    expect(Number(call.args[1])).toBeGreaterThan(0);
  });

  it('rejects invalid price or expiry', () => {
    expect(
      createPrimaryListingHandler.validate({ price: 'abc', expiresAt: '2030-01-01T00:00' }, formContext).valid
    ).toBe(false);
    expect(createPrimaryListingHandler.validate({ price: '1', expiresAt: '' }, formContext).valid).toBe(false);
  });

  it('builds cancel_primary(listing_id)', () => {
    expect(cancelPrimaryListingHandler.validate({ listingId: '3' }, formContext).valid).toBe(true);
    expect(cancelPrimaryListingHandler.validate({ listingId: 'x' }, formContext).valid).toBe(false);
    expect(cancelPrimaryListingHandler.buildCallVector({ listingId: '3' }, buildContext)).toEqual({
      target: 'CMARKET',
      function: 'cancel_primary',
      args: ['3']
    });
  });
});

describe('current marketplace/governor/auction administration registry', () => {
  it('uses marketplace set_payment_asset (not a guessed set_payment_token) and no-argument pause/resume', () => {
    expect(
      getActionHandler('set-marketplace-payment-token').buildCallVector({ paymentToken: 'CSAC' }, buildContext)
    ).toEqual({ target: 'CMARKET', function: 'set_payment_asset', args: ['CSAC'] });
    expect(getActionHandler('set-marketplace-secondary-fee').buildCallVector({ value: '250' }, buildContext)).toEqual({
      target: 'CMARKET',
      function: 'set_secondary_fee_bps',
      args: [250]
    });
    expect(getActionHandler('pause-marketplace').buildCallVector({}, buildContext)).toEqual({
      target: 'CMARKET',
      function: 'pause',
      args: []
    });
    expect(getActionHandler('unpause-marketplace').buildCallVector({}, buildContext)).toEqual({
      target: 'CMARKET',
      function: 'unpause',
      args: []
    });
    expect(getActionHandler('pause-auction').buildCallVector({}, buildContext).args).toEqual(['CTREASURY']);
  });
  it('adds queue delay and the remaining auction administration methods with source bounds', () => {
    expect(getActionHandler('set-queue-delay').buildCallVector({ value: '300' }, buildContext)).toEqual({
      target: 'CGOV',
      function: 'set_queue_delay',
      args: [300]
    });
    expect(getActionHandler('set-queue-delay').validate({ value: '299' }, formContext).valid).toBe(false);
    expect(getActionHandler('set-queue-delay').validate({ value: '2592001' }, formContext).valid).toBe(false);
    const bidIncrement = getActionHandler('set-auction-min-bid-increment');
    expect(bidIncrement.buildCallVector({ value: '10' }, buildContext)).toEqual({
      target: 'CAUCTION',
      function: 'set_min_bid_increment',
      args: [10]
    });
    for (const value of ['0', '101', '1.5', '9007199254740993'])
      expect(bidIncrement.validate({ value }, formContext).valid).toBe(false);
    for (const value of ['1', '100']) expect(bidIncrement.validate({ value }, formContext).valid).toBe(true);
    expect(getActionHandler('cancel-auction').buildCallVector({}, buildContext)).toEqual({
      target: 'CAUCTION',
      function: 'cancel_auction',
      args: []
    });
    expect(getActionHandler('set-auction-duration').validate({ value: '2592001' }, formContext).valid).toBe(false);
  });
  it('accepts fee 0..2500 bps (25% cap) and rejects invalid marketplace contract IDs', () => {
    const fee = getActionHandler('set-marketplace-secondary-fee');
    for (const value of ['0', '2500']) expect(fee.validate({ value }, formContext).valid).toBe(true);
    for (const value of ['-1', '2501', '10000', '2.5', '9007199254740993'])
      expect(fee.validate({ value }, formContext).valid).toBe(false);
    expect(
      getActionHandler('set-marketplace-payment-token').validate({ paymentToken: 'invalid' }, formContext).valid
    ).toBe(false);
  });
});
