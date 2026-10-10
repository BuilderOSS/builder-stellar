import { describe, expect, it } from 'vitest';

import { hashFromHex, hashToHex } from '@/lib/admin-module-versions';

import { moduleUpgradeHandler } from './module-upgrade-actions';
import type { BuildContext, FormContext } from './types';

describe('module upgrade exact hashes', () => {
  const fromHash = '01'.repeat(32);
  const toHash = 'ab'.repeat(32);
  const context = {
    config: { tokenContractId: 'token', treasuryContractId: 'treasury', metadataContractId: 'metadata' }
  } as FormContext & BuildContext;
  it('round-trips 32 bytes and rejects malformed BytesN', () => {
    expect(hashToHex(hashFromHex(toHash))).toBe(toHash);
    expect(() => hashFromHex('abc')).toThrow();
    expect(() => hashToHex(new Uint8Array(31))).toThrow();
  });
  it('targets only the selected DAO module with exact from/to hashes', () => {
    expect(moduleUpgradeHandler.validate({ module: 'token', fromHash, toHash }, context).valid).toBe(true);
    expect(moduleUpgradeHandler.buildCallVector({ module: 'treasury', fromHash, toHash }, context)).toEqual({
      target: 'treasury',
      function: 'upgrade',
      args: [fromHash, toHash]
    });
  });
  it('rejects missing modules, unchanged hashes and malformed hashes', () => {
    expect(moduleUpgradeHandler.validate({ module: 'auction', fromHash, toHash }, context).valid).toBe(false);
    expect(moduleUpgradeHandler.validate({ module: 'token', fromHash, toHash: fromHash }, context).valid).toBe(false);
    expect(moduleUpgradeHandler.validate({ module: 'token', fromHash: 'bad', toHash }, context).valid).toBe(false);
  });
});
