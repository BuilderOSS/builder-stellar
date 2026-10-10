import { describe, expect, it } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getActionHandler } from '@/lib/proposal-actions/registry';

import { marketplaceGovernanceAction, marketplaceGovernanceContext, marketplaceSettingHandlers } from './governance';

const config = {
  name: 'testnet',
  marketplaceContractId: 'market-a',
  auctionContractId: 'auction-a',
  tokenContractId: 'token-a',
  governorContractId: 'governor-a',
  treasuryContractId: 'treasury-a'
} as DaoNetworkConfig;
describe('marketplace governance queue adapter', () => {
  it('discovers the four landed registry controls by scoped target, not the pause function name', () => {
    expect(
      marketplaceSettingHandlers(config)
        .map((handler) => handler.type)
        .sort()
    ).toEqual([
      'pause-marketplace',
      'set-marketplace-payment-token',
      'set-marketplace-secondary-fee',
      'unpause-marketplace'
    ]);
    expect(marketplaceGovernanceContext(config).targetRole).toBe('marketplace');
    expect(marketplaceSettingHandlers({ ...config, marketplaceContractId: '' })).toEqual([]);
  });
  it('queues fee as the actual registry shape with explicit marketplace role and u32 call arg', () => {
    const result = marketplaceGovernanceAction(config, 'wallet-a', getActionHandler('set-marketplace-secondary-fee'), {
      value: '250'
    });
    expect(result.call).toEqual({ target: 'market-a', function: 'set_secondary_fee_bps', args: [250] });
    expect(result.action).toMatchObject({
      type: 'set-marketplace-secondary-fee',
      value: '250',
      amount: '250',
      targetRole: 'marketplace'
    });
    expect(() =>
      marketplaceGovernanceAction(config, 'wallet-a', getActionHandler('set-marketplace-secondary-fee'), {
        value: '10001'
      })
    ).toThrow();
  });
  it('does not let an auction pause with the same function name enter the marketplace queue', () => {
    expect(() => marketplaceGovernanceAction(config, 'wallet-a', getActionHandler('pause-auction'), {})).toThrow(
      'does not target'
    );
    const pause = marketplaceGovernanceAction(config, 'wallet-a', getActionHandler('pause-marketplace'), {});
    expect(pause.call).toEqual({ target: 'market-a', function: 'pause', args: [] });
    expect(pause.action.targetRole).toBe('marketplace');
  });
  it('uses the registered paymentToken draft field but the actual set_payment_asset method', () => {
    const paymentToken = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
    const result = marketplaceGovernanceAction(config, 'wallet-a', getActionHandler('set-marketplace-payment-token'), {
      paymentToken
    });
    expect(result.call).toEqual({ target: 'market-a', function: 'set_payment_asset', args: [paymentToken] });
    expect(result.action).toMatchObject({
      type: 'set-marketplace-payment-token',
      paymentToken,
      targetRole: 'marketplace'
    });
    const resume = marketplaceGovernanceAction(config, 'wallet-a', getActionHandler('unpause-marketplace'), {});
    expect(resume.call).toEqual({ target: 'market-a', function: 'unpause', args: [] });
  });
});
