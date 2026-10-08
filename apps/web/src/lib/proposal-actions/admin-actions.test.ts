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
