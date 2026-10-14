// src/lib/proposal-actions/actions/mint-governance-token/index.ts

import type { ActionHandler } from '../../types';
import { MintGovernanceTokenForm } from './component';
import type { MintGovernanceTokenData } from './types';
import { validateMintGovernanceToken } from './validator';

export const mintGovernanceTokenHandler: ActionHandler<MintGovernanceTokenData> = {
  type: 'mint-governance-token',
  label: 'Mint a membership token',
  description: 'Mint one membership token to a wallet',
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
