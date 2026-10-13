// src/lib/proposal-actions/actions/batch-mint-governance-token/index.ts

import { MAX_BATCH_MINT } from '@/lib/batch-mint-budget';

import type { ActionHandler } from '../../types';
import { BatchMintGovernanceTokenForm } from './component';
import type { BatchMintGovernanceTokenData } from './types';
import { validateBatchMintGovernanceToken } from './validator';

export const batchMintGovernanceTokenHandler: ActionHandler<BatchMintGovernanceTokenData> = {
  type: 'batch-mint-governance-token',
  label: 'Batch Mint Governance Tokens',
  description: `Mint multiple governance tokens (1-${MAX_BATCH_MINT}) to a recipient`,
  order: 2,
  group: 'Governance',

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
    amount: data.amount.trim()
  }),

  deserialize: (action) => ({
    recipient: action.recipient || '',
    amount: action.amount || '1'
  }),

  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'batch_mint',
    args: [context.treasuryAddress, [data.recipient.trim()], [data.amount.trim()]]
  }),

  checkPreconditions: (context) => {
    // The Treasury mints as the Token admin (no allowance needed), so a mint proposal needs it to be the admin.
    if (!context.config.treasuryContractId || context.config.adminAddress !== context.config.treasuryContractId) {
      return {
        canExecute: false,
        reason: 'Minting by proposal works once the community has launched and its Treasury is the token admin.'
      };
    }

    return { canExecute: true };
  }
};
