// src/lib/proposal-actions/actions/batch-mint-governance-token/validator.ts

import { MAX_BATCH_MINT } from '@/lib/batch-mint-budget';
import { validateStellarAddress } from '@/lib/validate-address';

import type { FormContext, ValidationResult } from '../../types';
import type { BatchMintGovernanceTokenData } from './types';

export function validateBatchMintGovernanceToken(
  data: BatchMintGovernanceTokenData,
  context: FormContext
): ValidationResult {
  // Check mint authority first
  const treasuryHasMintAuthority = Boolean(
    context.config.treasuryContractId &&
    context.mintAuthorities?.some((item) => item.authority === context.config.treasuryContractId && item.enabled)
  );

  if (context.mintAuthoritiesLoading) {
    return {
      valid: false,
      message: 'Checking mint authority...'
    };
  }

  if (!treasuryHasMintAuthority) {
    return {
      valid: false,
      message: 'Grant mint authority to the treasury before creating mint proposals.'
    };
  }

  const fields: Record<string, string> = {};

  // Validate recipient
  const recipientValidation = validateStellarAddress(data.recipient);
  if (!recipientValidation.isValid) {
    fields.recipient = recipientValidation.error || 'Invalid address';
  }

  // One batch_mint to a single recipient fits the event budget up to MAX_BATCH_MINT.
  const amount = data.amount.trim();
  if (amount.length === 0) {
    fields.amount = 'Amount is required';
  } else if (!/^\d+$/.test(amount)) {
    fields.amount = 'Amount must be a positive whole number';
  } else {
    const numAmount = parseInt(amount, 10);
    if (numAmount < 1) {
      fields.amount = 'Amount must be at least 1';
    } else if (numAmount > MAX_BATCH_MINT) {
      fields.amount = `Amount cannot exceed ${MAX_BATCH_MINT} tokens per action; add another action for more`;
    }
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
