// src/lib/proposal-actions/actions/mint-governance-token/index.ts

import type { ActionHandler } from '../../types';
import { MintGovernanceTokenForm } from './component';
import type { MintGovernanceTokenData } from './types';
import { validateMintGovernanceToken } from './validator';

export const mintGovernanceTokenHandler: ActionHandler<MintGovernanceTokenData> = {
  type: 'mint-governance-token',
  label: 'Mint Governance Token',
  description: 'Mint a single governance token to a recipient',
  order: 1,
  group: 'Governance',

  FormComponent: MintGovernanceTokenForm,

  getDefaultValues: () => ({
    recipient: '',
    amount: '1'
  }),

  validate: validateMintGovernanceToken,

  serialize: (data, _context) => ({
    id: crypto.randomUUID(),
    type: 'mint-governance-token',
    recipient: data.recipient.trim(),
    amount: '1' // Always 1 for single mint
  }),

  deserialize: (action) => ({
    recipient: action.recipient || '',
    amount: action.amount || '1'
  }),

  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'mint',
    args: [context.treasuryAddress, data.recipient.trim()]
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
