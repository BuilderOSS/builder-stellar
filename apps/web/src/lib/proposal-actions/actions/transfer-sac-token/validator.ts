// src/lib/proposal-actions/actions/transfer-sac-token/validator.ts

import { decimalToStroops } from '@/lib/auction-values';
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
    fields.assetCode = 'Choose an asset.';
  }

  // Validate amount
  const amount = data.amount.trim();
  if (amount.length === 0) {
    fields.amount = 'Enter an amount.';
  } else if (!/^-?\d+(\.\d+)?$/.test(amount)) {
    fields.amount = 'Enter a number, such as 25 or 25.5.';
  } else {
    const numAmount = decimalToStroops(amount);
    if (numAmount === null) {
      fields.amount = 'Enter an amount with at most seven decimal places.';
    } else if (numAmount <= 0n) {
      fields.amount = 'Enter an amount above zero.';
    } else if (numAmount >= 1n << 127n) {
      fields.amount = 'This amount is too large.';
    } else {
      // Check balance
      const balance = context.balances?.find((b) => b.assetCode === data.assetCode);
      if (context.balancesError) fields.amount = `Balance unavailable: ${context.balancesError}`;
      const balanceStroops = balance ? decimalToStroops(balance.balance) : null;
      if (balanceStroops !== null && numAmount > balanceStroops) {
        fields.amount = `This is more than the treasury holds (${balance!.balance} ${data.assetCode}).`;
      }
    }
  }

  const hasErrors = Object.keys(fields).length > 0;

  if (hasErrors) {
    return {
      valid: false,
      message: 'Check the fields below.',
      fields
    };
  }

  return { valid: true };
}
