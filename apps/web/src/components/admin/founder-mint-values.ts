import { StrKey } from '@stellar/stellar-sdk';

import {
  BATCH_MINT_LIMIT_TEXT,
  batchMintFits,
  MAX_BATCH_MINT,
  MAX_BATCH_RECIPIENTS,
  planBatchMints
} from '@/lib/batch-mint-budget';

export type FounderMintRow = { recipient: string; amount: string };
export function founderMintValues(rows: FounderMintRow[]) {
  if (!rows.length || rows.length > MAX_BATCH_RECIPIENTS)
    throw new Error(`Use 1–${MAX_BATCH_RECIPIENTS} founder recipients per transaction.`);
  const recipients = rows.map((row) => row.recipient.trim());
  if (recipients.some((address) => !StrKey.isValidEd25519PublicKey(address)))
    throw new Error('Each founder must have a valid Stellar account address (G…).');
  if (new Set(recipients).size !== recipients.length)
    throw new Error('Combine duplicate founder addresses into one row.');
  const amounts = rows.map((row) => {
    if (!/^\d+$/.test(row.amount) || Number(row.amount) < 1 || Number(row.amount) > MAX_BATCH_MINT)
      throw new Error(`Each founder amount must be a whole number from 1 to ${MAX_BATCH_MINT} per transaction.`);
    return BigInt(row.amount);
  });
  const total = amounts.reduce((sum, value) => sum + value, 0n);
  // One batch_mint must fit the contract's event budget (BatchTooLarge otherwise).
  if (!batchMintFits(total, recipients.length)) {
    const calls = planBatchMints(recipients.map((recipient, i) => ({ recipient, amount: amounts[i] }))).length;
    throw new Error(
      `This allocation does not fit one transaction (${BATCH_MINT_LIMIT_TEXT}). Split it into ${calls} transactions and submit them one after another.`
    );
  }
  return { recipients, amounts, total };
}
