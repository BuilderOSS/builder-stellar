// src/lib/proposal-actions/actions/mint-governance-token/validator.ts

import { validateStellarAddress } from '@/lib/validate-address';

import type { FormContext, ValidationResult } from '../../types';
import type { MintGovernanceTokenData } from './types';

export function validateMintGovernanceToken(data: MintGovernanceTokenData, _context: FormContext): ValidationResult {
  const fields: Record<string, string> = {};

  // Validate recipient
  const recipientValidation = validateStellarAddress(data.recipient);
  if (!recipientValidation.isValid) {
    fields.recipient = recipientValidation.error || 'Invalid address';
  }

  // Validate amount (must be exactly 1 for single mint)
  const amount = data.amount.trim();
  if (amount.length === 0) {
    fields.amount = 'Amount is required';
  } else if (amount !== '1') {
    fields.amount = 'Amount must be 1 for single mint (use batch mint for multiple)';
  }

  const hasErrors = Object.keys(fields).length > 0;

  if (hasErrors) {
    return {
      valid: false,
      message: 'Please fix the errors below',
      fields
    };
  }

  return { valid: true };
}
