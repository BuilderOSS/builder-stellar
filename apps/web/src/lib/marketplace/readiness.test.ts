import { Asset, Networks } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { getTreasuryAssets } from '@/lib/assets-config';

import { MARKETPLACE_LOCAL_XLM_SAC, marketplaceAssetLabel, marketplaceDisplayAmount } from './asset-label';
import { accountReadiness, marketplaceAsset, type ReadinessAccount } from './readiness';

const xlm = Asset.native().contractId(Networks.TESTNET);
const usdc = getTreasuryAssets('testnet').find((a) => a.code === 'USDC')!;
const native = { asset_type: 'native', balance: '10.0000001', selling_liabilities: '1.0000000' };

describe('marketplace SAC and account readiness', () => {
  it('never assumes an unknown payment contract is USD or has seven decimals', () => {
    expect(marketplaceAssetLabel('testnet', usdc.contractId!)).toBe('USDC');
    expect(marketplaceDisplayAmount('testnet', usdc.contractId!, '10000001')).toBe('1.0000001');
    expect(marketplaceAssetLabel('public', usdc.contractId!)).toBe('Unknown SAC');
    expect(marketplaceDisplayAmount('public', usdc.contractId!, '10000001')).toBe('10000001 base units');
  });
  it('verifies known XLM/USDC SAC ids against their network and issuer', () => {
    for (const network of ['public', 'testnet'] as const) {
      const passphrase = network === 'public' ? Networks.PUBLIC : Networks.TESTNET;
      for (const asset of getTreasuryAssets(network).filter((a) => ['USDC', 'XLM'].includes(a.code))) {
        expect((asset.isNative ? Asset.native() : new Asset(asset.code, asset.issuer!)).contractId(passphrase)).toBe(
          asset.contractId
        );
        expect(marketplaceAsset(network, asset.contractId!)?.code).toBe(asset.code);
      }
    }
    expect(marketplaceAsset('public', usdc.contractId!)).toBeUndefined();
    expect(marketplaceAsset('local', xlm)).toBeUndefined();
    expect(marketplaceAsset('local', Asset.native().contractId(Networks.STANDALONE))?.code).toBe('XLM');
    expect(MARKETPLACE_LOCAL_XLM_SAC).toBe(Asset.native().contractId(Networks.STANDALONE));
    expect(marketplaceDisplayAmount('local', MARKETPLACE_LOCAL_XLM_SAC, '10000001')).toBe('1.0000001');
    expect(
      marketplaceAsset('testnet', getTreasuryAssets('testnet').find((a) => a.code === 'EURC')!.contractId!)
    ).toBeUndefined();
  });
  it('deducts reserve, sponsorship and selling liabilities exactly', () => {
    const account: ReadinessAccount = { subentry_count: 3, num_sponsoring: 1, num_sponsored: 2, balances: [native] };
    const result = accountReadiness(account, 5_000_000n, 'buyer', 'testnet', xlm);
    // 10.0000001 - 1 selling liabilities - (2 + 3 + 1 - 2) * .5 reserve.
    expect(result.available).toBe('70000001');
    expect(result.nativeAvailable).toBe('70000001');
    expect(result.authorized).toBe(true);
  });
  it('does not confuse a USDC-code impostor issuer with the real trustline', () => {
    const account: ReadinessAccount = {
      subentry_count: 1,
      balances: [
        native,
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'impostor',
          balance: '1000.0000000',
          is_authorized: true
        }
      ]
    };
    const result = accountReadiness(account, 5_000_000n, 'buyer', 'testnet', usdc.contractId!);
    expect(result.trustline).toBe(false);
    expect(result.available).toBe('0');
    expect(result.canAddTrustline).toBe(true);
  });
  it('requires authorization and preserves one-stroop USDC precision', () => {
    const account: ReadinessAccount = {
      subentry_count: 1,
      balances: [
        native,
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: usdc.issuer,
          balance: '1.0000001',
          selling_liabilities: '0.0000000',
          is_authorized: false
        }
      ]
    };
    const result = accountReadiness(account, 5_000_000n, 'buyer', 'testnet', usdc.contractId!);
    expect(result.trustline).toBe(true);
    expect(result.available).toBe('10000001');
    expect(result.authorized).toBe(false);
    expect(result.issues[0]).toContain('not authorized');
  });
  it('clamps reserve-deficient spendable funds to zero', () => {
    const result = accountReadiness(
      { subentry_count: 5, balances: [{ ...native, balance: '1.0000000' }] },
      5_000_000n,
      'buyer',
      'testnet',
      xlm
    );
    expect(result.available).toBe('0');
    expect(result.issues.join()).toContain('reserve');
  });
  it('reserves the additional trustline reserve plus the classic network fee', () => {
    const account = { subentry_count: 0, balances: [{ asset_type: 'native', balance: '1.5000001' }] };
    const result = accountReadiness(account, 5_000_000n, 'buyer', 'testnet', usdc.contractId!);
    expect(result.canAddTrustline).toBe(false);
  });
  it('subtracts buying liabilities from USDC receipt capacity', () => {
    const account: ReadinessAccount = {
      subentry_count: 1,
      balances: [
        native,
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: usdc.issuer,
          balance: '3.0000001',
          limit: '5.0000000',
          buying_liabilities: '1.0000000',
          is_authorized: true
        }
      ]
    };
    const result = accountReadiness(account, 5_000_000n, 'seller', 'testnet', usdc.contractId!);
    expect(result.receivable).toBe('9999999');
  });
});
