// src/lib/proposal-actions/actions/batch-mint-governance-token/index.ts

import { MAX_BATCH_MINT } from '@/lib/batch-mint-budget';

import type { ActionHandler } from '../../types';
import { BatchMintGovernanceTokenForm } from './component';
import { batchMintEntries, type BatchMintGovernanceTokenData } from './types';
import { validateBatchMintGovernanceToken } from './validator';

export const batchMintGovernanceTokenHandler: ActionHandler<BatchMintGovernanceTokenData> = {
  type: 'batch-mint-governance-token',
  label: 'Mint membership tokens',
  description: `Mint 1 to ${MAX_BATCH_MINT} membership tokens across one or more wallets`,
  order: 2,
  group: 'Membership',

  FormComponent: BatchMintGovernanceTokenForm,

  getDefaultValues: () => ({
    recipient: '',
    amount: '1'
  }),

  validate: validateBatchMintGovernanceToken,

  serialize: (data, _context) => ({
    id: crypto.randomUUID(),
    type: 'batch-mint-governance-token',
    recipient: data.recipient.trim(),
    amount: data.amount.trim(),
    ...(data.allocations?.length
      ? { allocations: data.allocations.map((row) => ({ recipient: row.recipient.trim(), amount: row.amount.trim() })) }
      : {})
  }),

  deserialize: (action) => ({
    recipient: action.recipient || '',
    amount: action.amount || '1',
    ...(Array.isArray(action.allocations) ? { allocations: action.allocations } : {})
  }),

  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'batch_mint',
    args: [
      context.treasuryAddress,
      batchMintEntries(data).map((row) => row.recipient.trim()),
      batchMintEntries(data).map((row) => row.amount.trim())
    ]
  }),

  checkPreconditions: (context) => {
    // The Treasury mints as the Token admin (no allowance needed), so a mint proposal needs it to be the admin.
    if (!context.config.treasuryContractId || context.config.adminAddress !== context.config.treasuryContractId) {
      return {
        canExecute: false,
        reason: 'Minting by proposal works once the tribe has launched and its Treasury is the token admin.'
      };
    }

    return { canExecute: true };
  }
};
