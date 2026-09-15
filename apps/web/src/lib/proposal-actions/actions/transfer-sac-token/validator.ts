// src/lib/proposal-actions/actions/transfer-sac-token/validator.ts

import { validateStellarAddress } from '@/lib/validate-address';

import type { FormContext, ValidationResult } from '../../types';
import type { TransferSacTokenData } from './types';

export function validateTransferSacToken(data: TransferSacTokenData, context: FormContext): ValidationResult {
  const fields: Record<string, string> = {};

  // Validate recipient
  const recipientValidation = validateStellarAddress(data.recipient);
  if (!recipientValidation.isValid) {
    fields.recipient = recipientValidation.error || 'Invalid address';
  }

  // Validate asset selection
  if (!data.assetCode || data.assetCode.trim().length === 0) {
    fields.assetCode = 'Please select an asset';
  }

  // Validate amount
  const amount = data.amount.trim();
  if (amount.length === 0) {
    fields.amount = 'Amount is required';
  } else if (!/^-?\d+(\.\d+)?$/.test(amount)) {
    fields.amount = 'Invalid amount format';
  } else {
    const numAmount = parseFloat(amount);
    if (numAmount <= 0) {
      fields.amount = 'Amount must be positive';
    } else if (isNaN(numAmount) || !isFinite(numAmount)) {
      fields.amount = 'Invalid amount';
    } else {
      // Check balance
      const balance = context.balances?.find((b) => b.assetCode === data.assetCode);
      if (balance && numAmount > parseFloat(balance.balance)) {
        fields.amount = `Amount exceeds balance of ${parseFloat(balance.balance).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 7
        })} ${data.assetCode}`;
      }
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
