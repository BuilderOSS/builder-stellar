import { describe, expect, it } from 'vitest';

import { paymentAssetCode, TREASURY_ASSETS } from './assets-config';

describe('paymentAssetCode', () => {
  it('names a known payment asset by its contract id', () => {
    const xlm = TREASURY_ASSETS.testnet.find((asset) => asset.code === 'XLM')!;
    expect(paymentAssetCode('testnet', xlm.contractId)).toBe('XLM');
  });

  it('is undefined for a custom or missing asset', () => {
    expect(paymentAssetCode('testnet', 'CUNKNOWN')).toBeUndefined();
    expect(paymentAssetCode('testnet', undefined)).toBeUndefined();
  });
});
