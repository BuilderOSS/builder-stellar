import { batchMintFits, MAX_BATCH_MINT, MAX_BATCH_RECIPIENTS } from '@/lib/batch-mint-budget';
import { validateStellarAddress } from '@/lib/validate-address';

import type { FormContext, ValidationResult } from '../../types';
import { batchMintEntries, type BatchMintGovernanceTokenData } from './types';

export function validateBatchMintGovernanceToken(
  data: BatchMintGovernanceTokenData,
  _context: FormContext
): ValidationResult {
  const fields: Record<string, string> = {};
  const entries = batchMintEntries(data);
  let total = 0n;
  if (entries.length > MAX_BATCH_RECIPIENTS)
    return { valid: false, message: `Use at most ${MAX_BATCH_RECIPIENTS} recipients per action.` };
  entries.forEach((entry, index) => {
    const key = data.allocations?.length ? `allocations.${index}.` : '';
    const valid = validateStellarAddress(entry.recipient);
    if (!valid.isValid) fields[`${key}recipient`] = valid.error || 'Invalid address';
    if (
      !/^\d+$/.test(entry.amount.trim()) ||
      BigInt(entry.amount.trim()) < 1n ||
      BigInt(entry.amount.trim()) > BigInt(MAX_BATCH_MINT)
    )
      fields[`${key}amount`] = `Use a whole number from 1 to ${MAX_BATCH_MINT}.`;
    else total += BigInt(entry.amount.trim());
  });
  if (Object.keys(fields).length)
    return { valid: false, message: 'Check the recipient addresses and token amounts.', fields };
  if (!batchMintFits(total, entries.length))
    return {
      valid: false,
      message: 'These allocations exceed the transaction event limit. Reduce the token amounts or recipients.'
    };
  return { valid: true };
}
