import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { getActionHandler } from '../../registry';
import type { BuildContext, FormContext } from '../../types';

const handler = getActionHandler('batch-mint-governance-token');
import { validateBatchMintGovernanceToken } from './validator';

describe('multiple mint recipients', () => {
  const a = Keypair.random().publicKey();
  const b = Keypair.random().publicKey();
  const context = { treasuryAddress: 'treasury', tokenContractId: 'token' } as BuildContext;
  const form = {} as FormContext;
  it('preserves all allocations through draft persistence and builds the vector ABI', () => {
    const data = {
      recipient: a,
      amount: '2',
      allocations: [
        { recipient: a, amount: '2' },
        { recipient: b, amount: '3' }
      ]
    };
    expect(validateBatchMintGovernanceToken(data, form)).toEqual({ valid: true });
    const restored = handler.deserialize(handler.serialize(data, form));
    expect(handler.buildCallVector(restored, context)).toEqual({
      target: 'token',
      function: 'batch_mint',
      args: ['treasury', [a, b], ['2', '3']]
    });
  });
  it('still supports existing single-recipient drafts', () => {
    expect(handler.buildCallVector({ recipient: a, amount: '43' }, context).args).toEqual(['treasury', [a], ['43']]);
  });
  it('enforces the combined event budget, rather than a per-row limit alone', () => {
    const valid = (amount: string) =>
      validateBatchMintGovernanceToken(
        {
          recipient: a,
          amount,
          allocations: [
            { recipient: a, amount },
            { recipient: b, amount: '1' }
          ]
        },
        form
      ).valid;
    expect(valid('41')).toBe(true);
    expect(valid('42')).toBe(false);
    expect(valid('0')).toBe(false);
  });
});
