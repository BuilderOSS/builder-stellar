import { StrKey } from '@stellar/stellar-sdk';

export type FounderMintRow = { recipient: string; amount: string };
export function founderMintValues(rows: FounderMintRow[]) {
  if (!rows.length || rows.length > 20) throw new Error('Use 1–20 founder recipients per transaction.');
  const recipients = rows.map((row) => row.recipient.trim());
  if (recipients.some((address) => !StrKey.isValidEd25519PublicKey(address)))
    throw new Error('Each founder must have a valid Stellar account address (G…).');
  if (new Set(recipients).size !== recipients.length)
    throw new Error('Combine duplicate founder addresses into one row.');
  const amounts = rows.map((row) => {
    if (!/^\d+$/.test(row.amount) || Number(row.amount) < 1 || Number(row.amount) > 20)
      throw new Error('Each founder amount must be a whole number from 1 to 20.');
    return BigInt(row.amount);
  });
  const total = amounts.reduce((sum, value) => sum + value, 0n);
  if (total > 20n)
    throw new Error('Keep each transaction to at most 20 tokens. Submit additional allocations separately.');
  return { recipients, amounts, total };
}
