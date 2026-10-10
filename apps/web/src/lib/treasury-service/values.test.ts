import { describe, expect, it } from 'vitest';

import { decimalToStroops } from '@/lib/auction-values';

import { assertTreasuryIdentity, displayTreasuryBalance, fundingSchema, treasuryPage } from './values';

describe('treasury exact amounts and request boundaries', () => {
  it('retains every digit well above Number.MAX_SAFE_INTEGER', () => {
    expect(displayTreasuryBalance('900719925474099312345.0000001')).toBe('900,719,925,474,099,312,345.0000001');
    expect(displayTreasuryBalance('0.0000000')).toBe('0.0000000');
    expect(displayTreasuryBalance('1.2300000')).toBe('1.2300000');
    expect(decimalToStroops('900719925.4740993')).toBe(9007199254740993n);
  });
  it.each(['NaN', 'Infinity', '-1', '', '1e7', '1.12345678'])('never displays invalid %s as zero', (value) => {
    expect(() => displayTreasuryBalance(value)).toThrow();
  });
  it.each(['0', '-1', '0.00000001', '1e3', 'NaN', '17014118346046923173168730371588.4105728'])(
    'rejects invalid funding amount %s',
    (amount) => {
      expect(fundingSchema.safeParse({ assetCode: 'XLM', amount }).success).toBe(false);
    }
  );
  it('accepts one stroop and the exact maximum signed i128', () => {
    expect(fundingSchema.safeParse({ assetCode: 'XLM', amount: '0.0000001' }).success).toBe(true);
    expect(
      fundingSchema.safeParse({ assetCode: 'USDC', amount: '17014118346046923173168730371588.4105727' }).success
    ).toBe(true);
  });
  it.each(['address', 'treasury', 'governor', 'deploymentId', 'assetContractId', 'from', 'to'])(
    'rejects body identity %s',
    (field) => {
      expect(fundingSchema.safeParse({ assetCode: 'XLM', amount: '1', [field]: 'attacker' }).success).toBe(false);
    }
  );
  it('bounds pagination and rejects identity filters and duplicate pages', () => {
    expect(treasuryPage(new URLSearchParams('page=1000'))).toBe(1000);
    expect(treasuryPage(new URLSearchParams())).toBe(0);
    for (const query of [
      'page=-1',
      'page=1001',
      'page=1.5',
      'page=1&page=2',
      'treasury=attacker',
      'deploymentId=other'
    ])
      expect(() => treasuryPage(new URLSearchParams(query))).toThrow();
  });
  it('checks every response identity independently', () => {
    const scope = { deploymentId: 'a', daoId: 'b', treasuryContractId: 'c', governorContractId: 'd' };
    for (const field of Object.keys(scope))
      expect(() => assertTreasuryIdentity({ ...scope, [field]: 'other' }, scope)).toThrow();
    expect(() => assertTreasuryIdentity(scope, { ...scope, daoId: '' })).toThrow();
  });
});
