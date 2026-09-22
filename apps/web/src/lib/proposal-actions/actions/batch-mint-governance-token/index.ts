// src/lib/proposal-actions/actions/batch-mint-governance-token/index.ts

import type { ActionHandler } from '../../types';
import { BatchMintGovernanceTokenForm } from './component';
import type { BatchMintGovernanceTokenData } from './types';
import { validateBatchMintGovernanceToken } from './validator';

export const batchMintGovernanceTokenHandler: ActionHandler<BatchMintGovernanceTokenData> = {
  type: 'batch-mint-governance-token',
  label: 'Batch Mint Governance Tokens',
  description: 'Mint multiple governance tokens (1-20) to a recipient',
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
    args: [context.treasuryAddress, data.recipient.trim(), parseInt(data.amount.trim(), 10)]
  }),

  checkPreconditions: (context) => {
    // Check if still loading
    if (context.mintAuthoritiesLoading) {
      return {
        canExecute: false,
        reason: 'Checking mint authority...',
        loading: true
      };
    }

    // Check if treasury has mint authority
    const treasuryHasMintAuthority = Boolean(
      context.config.treasuryContractId &&
      context.mintAuthorities?.some((item) => item.authority === context.config.treasuryContractId && item.enabled)
    );

    if (!treasuryHasMintAuthority) {
      return {
        canExecute: false,
        reason: 'Grant mint authority to the treasury before creating mint proposals.'
      };
    }

    return { canExecute: true };
  },

  requiresMintAuthority: false
};
