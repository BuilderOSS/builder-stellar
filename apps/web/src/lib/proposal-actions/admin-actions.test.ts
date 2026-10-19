import { describe, expect, it } from 'vitest';

import { getTreasuryAssets } from '@/lib/assets-config';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getProposalActionSummary } from '@/lib/proposal-call';

import { getActionHandler } from './registry';
import type { BuildContext, FormContext } from './types';

// Resolve handlers through the registry (importing admin-actions directly hits a circular import).
const setVotingDelayHandler = getActionHandler('set-voting-delay');
const setVotingPeriodHandler = getActionHandler('set-voting-period');
const setQuorumBpsHandler = getActionHandler('set-quorum-bps');
const setProposalThresholdHandler = getActionHandler('set-proposal-threshold');
const setAuctionTimeBufferHandler = getActionHandler('set-auction-time-buffer');
const openPoolHandler = getActionHandler('open-pool');
const closePoolHandler = getActionHandler('close-pool');
const sweepPoolHandler = getActionHandler('sweep-pool');
const ASSET = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const testnetAsset = (code: string) => getTreasuryAssets('testnet').find((asset) => asset.code === code)!.contractId!;

const config = {
  name: 'testnet',
  marketplaceContractId: 'CMARKET',
  auctionContractId: 'CAUCTION'
} as DaoNetworkConfig;
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

describe('quick-buy pool proposal actions', () => {
  it('builds open_pool(price, asset, expires_at, size, per-buyer, per-period, period) against the marketplace', () => {
    const data = {
      price: '1.5',
      asset: ASSET,
      size: '10',
      maxPerBuyer: '2',
      maxSoldPerPeriod: '5',
      periodHours: '24',
      expiresAt: '2030-01-01T00:00'
    };
    expect(openPoolHandler.validate(data, formContext).valid).toBe(true);
    const call = openPoolHandler.buildCallVector(data, buildContext);
    expect(call.target).toBe('CMARKET');
    expect(call.function).toBe('open_pool');
    expect(call.args[0]).toBe('15000000');
    expect(call.args[1]).toBe(ASSET);
    expect(Number(call.args[2])).toBeGreaterThan(0);
    expect(call.args.slice(3)).toEqual([10, 2, 5, String(24 * 3600)]);
  });

  it('queues the closing time as unix seconds and reads older local-time drafts the same way', () => {
    const data = {
      price: '1.5',
      asset: ASSET,
      size: '10',
      maxPerBuyer: '2',
      maxSoldPerPeriod: '5',
      periodHours: '24',
      expiresAt: '2030-01-01T00:00'
    };
    const seconds = String(Math.floor(new Date(data.expiresAt).getTime() / 1000));
    const action = openPoolHandler.serialize(data, formContext);
    expect(action.expiresAt).toBe(seconds);
    const reopened = openPoolHandler.deserialize(action);
    expect(reopened.expiresAt).toBe(seconds);
    expect(openPoolHandler.validate(reopened, formContext).valid).toBe(true);
    expect(openPoolHandler.buildCallVector(reopened, buildContext).args[2]).toBe(seconds);
    // A draft queued before this kept the datetime-local text; it still builds.
    const legacy = openPoolHandler.deserialize({ ...action, expiresAt: '2030-01-01T00:00' });
    expect(openPoolHandler.buildCallVector(legacy, buildContext).args[2]).toBe(seconds);
    expect(getProposalActionSummary(action)).toContain(new Date(Number(seconds) * 1000).toISOString());
  });

  it('rejects an invalid price, asset, count or a past closing time', () => {
    const base = {
      price: '1',
      asset: ASSET,
      size: '1',
      maxPerBuyer: '1',
      maxSoldPerPeriod: '1',
      periodHours: '1',
      expiresAt: '2030-01-01T00:00'
    };
    for (const change of [
      { price: 'abc' },
      { asset: 'G' },
      { size: '0' },
      { maxPerBuyer: '-1' },
      { periodHours: 'x' },
      { expiresAt: '2000-01-01T00:00' }
    ])
      expect(openPoolHandler.validate({ ...base, ...change }, formContext).valid).toBe(false);
  });

  it('prices a pool only in XLM or USDC, the assets the market can take', () => {
    const base = {
      price: '1',
      asset: ASSET,
      size: '1',
      maxPerBuyer: '1',
      maxSoldPerPeriod: '1',
      periodHours: '1',
      expiresAt: '2030-01-01T00:00'
    };
    expect(openPoolHandler.validate({ ...base, asset: testnetAsset('XLM') }, formContext).valid).toBe(true);
    expect(openPoolHandler.validate({ ...base, asset: testnetAsset('USDC') }, formContext).valid).toBe(true);
    // EURC is a treasury asset, and the contract would accept it, but nobody could buy from the pool.
    const eurc = openPoolHandler.validate({ ...base, asset: testnetAsset('EURC') }, formContext);
    expect(eurc).toMatchObject({ valid: false, fields: { asset: 'Choose the asset buyers pay in: XLM or USDC.' } });
    const custom = `C${'A'.repeat(55)}`;
    expect(openPoolHandler.validate({ ...base, asset: custom }, formContext).valid).toBe(false);
    // Each network has its own asset contracts: testnet USDC means nothing on mainnet.
    const mainnet = { ...formContext, config: { ...config, name: 'public' } } as FormContext;
    expect(openPoolHandler.validate({ ...base, asset: testnetAsset('USDC') }, mainnet).valid).toBe(false);
  });

  it('builds close_pool and sweep_pool by pool id', () => {
    expect(closePoolHandler.validate({ poolId: '3' }, formContext).valid).toBe(true);
    expect(closePoolHandler.validate({ poolId: 'x' }, formContext).valid).toBe(false);
    expect(closePoolHandler.buildCallVector({ poolId: '3' }, buildContext)).toEqual({
      target: 'CMARKET',
      function: 'close_pool',
      args: [3]
    });
    expect(sweepPoolHandler.buildCallVector({ poolId: '3' }, buildContext)).toEqual({
      target: 'CMARKET',
      function: 'sweep_pool',
      args: [3]
    });
  });
});

describe('current marketplace/governor/auction administration registry', () => {
  it('uses marketplace set_payment_asset (not a guessed set_payment_token) and no-argument pause/resume', () => {
    expect(
      getActionHandler('set-marketplace-payment-token').buildCallVector({ paymentToken: 'CSAC' }, buildContext)
    ).toEqual({ target: 'CMARKET', function: 'set_payment_asset', args: ['CSAC'] });
    expect(getActionHandler('set-marketplace-secondary-fee').buildCallVector({ value: '2.5' }, buildContext)).toEqual({
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
  it('takes the resale fee as a percent from 0% to 25% (the 2500 bps cap) and rejects invalid marketplace contract IDs', () => {
    const fee = getActionHandler('set-marketplace-secondary-fee');
    for (const value of ['0', '0.01', '2.5', '2.50', '25'])
      expect(fee.validate({ value }, formContext).valid).toBe(true);
    for (const value of ['', '-1', '25.01', '250', '2.505', '.5', 'abc', '9007199254740993'])
      expect(fee.validate({ value }, formContext).valid).toBe(false);
    expect(
      getActionHandler('set-marketplace-payment-token').validate({ paymentToken: 'invalid' }, formContext).valid
    ).toBe(false);
  });

  it('limits the market payment asset to XLM or USDC, like quick-buy pools', () => {
    const asset = getActionHandler('set-marketplace-payment-token');
    expect(asset.FormComponent).not.toBe(getActionHandler('set-auction-payment-token').FormComponent);
    for (const code of ['XLM', 'USDC'])
      expect(asset.validate({ paymentToken: testnetAsset(code) }, formContext).valid).toBe(true);
    for (const paymentToken of [testnetAsset('EURC'), `C${'A'.repeat(55)}`, 'invalid', ''])
      expect(asset.validate({ paymentToken }, formContext)).toMatchObject({
        valid: false,
        fields: { paymentToken: 'Choose the asset buyers pay in: XLM or USDC.' }
      });
    // The auction takes any treasury asset, EURC included.
    expect(
      getActionHandler('set-auction-payment-token').validate({ paymentToken: testnetAsset('EURC') }, formContext).valid
    ).toBe(true);
  });

  it('limits the auction payment asset to the treasury’s assets and stops once a bid has fixed it', () => {
    const auction = getActionHandler('set-auction-payment-token');
    const context = { ...formContext, config: { ...config, passphrase: 'Test SDF Network ; September 2015' } };
    for (const code of ['XLM', 'USDC', 'EURC'])
      expect(auction.validate({ paymentToken: testnetAsset(code) }, context).valid).toBe(true);
    // A wallet or an unknown contract could never pay out a bid.
    for (const paymentToken of [`G${'A'.repeat(55)}`, `C${'A'.repeat(55)}`, 'invalid'])
      expect(auction.validate({ paymentToken }, context)).toMatchObject({
        valid: false,
        fields: { paymentToken: 'Choose one of the treasury’s assets: XLM, USDC, EURC.' }
      });
    const locked = { ...context, auctionPaymentTokenLocked: true };
    expect(auction.checkPreconditions?.(locked)).toMatchObject({ canExecute: false });
    expect(auction.validate({ paymentToken: testnetAsset('USDC') }, locked).valid).toBe(false);
    expect(auction.checkPreconditions?.({ ...context, auctionPaymentTokenLocked: false })).toEqual({
      canExecute: true
    });
    // Unknown (the read failed or is loading): the vote is still checked by the contract.
    expect(auction.checkPreconditions?.(context)).toEqual({ canExecute: true });
    // The market's handler is built from the auction's and must not inherit the auction lock.
    expect(getActionHandler('set-marketplace-payment-token').checkPreconditions).toBeUndefined();
  });

  it('stores and calls the resale fee in basis points, and shows a queued one as a percent again', () => {
    const fee = getActionHandler('set-marketplace-secondary-fee');
    const action = fee.serialize({ value: '2.5' }, formContext);
    expect(action).toMatchObject({ type: 'set-marketplace-secondary-fee', value: '250', amount: '250' });
    expect(fee.deserialize(action)).toEqual({ value: '2.5' });
    expect(fee.buildCallVector(fee.deserialize(action), buildContext).args).toEqual([250]);
    for (const [bps, percent] of [
      ['0', '0'],
      ['1', '0.01'],
      ['7', '0.07'],
      ['2499', '24.99'],
      ['2500', '25']
    ])
      expect(fee.deserialize({ ...action, value: bps, amount: bps })).toEqual({ value: percent });
    expect(() => fee.buildCallVector({ value: '30' }, buildContext)).toThrow(/0% to 25%/);
    expect(getProposalActionSummary(action)).toBe('Change the resale fee to 2.5%');
  });
});
