/**
 * Mirrors `common::batch_mint_fits` (contracts/common/src/lib.rs): one Token
 * `batch_mint` call must fit the 16 KiB per-transaction contract-event limit.
 * Each token and each recipient entry adds estimated event bytes; the contract
 * rejects a batch over the budget with `BatchTooLarge` (7205). Keep these
 * constants in sync with the contract (and scripts/deploy-dao.mjs).
 */
export const BATCH_MINT_EVENT_BUDGET = 13_500;
export const BATCH_MINT_BYTES_PER_TOKEN = 300;
export const BATCH_MINT_BYTES_PER_RECIPIENT = 450;

/** Most tokens one call can mint, all to one recipient (43). */
export const MAX_BATCH_MINT = Math.floor(
  (BATCH_MINT_EVENT_BUDGET - BATCH_MINT_BYTES_PER_RECIPIENT) / BATCH_MINT_BYTES_PER_TOKEN
);
/** Most recipient entries one call can take, one token each (18). */
export const MAX_BATCH_RECIPIENTS = Math.floor(
  BATCH_MINT_EVENT_BUDGET / (BATCH_MINT_BYTES_PER_TOKEN + BATCH_MINT_BYTES_PER_RECIPIENT)
);

export const BATCH_MINT_LIMIT_TEXT = `up to ${MAX_BATCH_MINT} tokens to one recipient, or ${MAX_BATCH_RECIPIENTS} recipients with one token each`;

/** Entries count as new recipients even when they already delegate (conservative, like the contract). */
export function batchMintFits(tokens: bigint | number, recipients: number): boolean {
  const total = BigInt(tokens);
  if (total < 1n || recipients < 1) return false;
  return (
    total * BigInt(BATCH_MINT_BYTES_PER_TOKEN) + BigInt(recipients) * BigInt(BATCH_MINT_BYTES_PER_RECIPIENT) <=
    BigInt(BATCH_MINT_EVENT_BUDGET)
  );
}

export type BatchMintEntry = { recipient: string; amount: bigint };

/**
 * Packs allocations into calls that each fit the budget, splitting a recipient
 * above MAX_BATCH_MINT across calls (same packing as deploy-dao.mjs).
 */
export function planBatchMints(entries: BatchMintEntry[]): BatchMintEntry[][] {
  const pieces: BatchMintEntry[] = [];
  for (const { recipient, amount } of entries) {
    if (amount < 1n) throw new Error('Each amount must be at least one token.');
    for (let left = amount; left > 0n; left -= BigInt(MAX_BATCH_MINT)) {
      pieces.push({ recipient, amount: left < BigInt(MAX_BATCH_MINT) ? left : BigInt(MAX_BATCH_MINT) });
    }
  }
  const batches: BatchMintEntry[][] = [];
  let current: BatchMintEntry[] = [];
  let total = 0n;
  for (const piece of pieces) {
    if (current.length && !batchMintFits(total + piece.amount, current.length + 1)) {
      batches.push(current);
      current = [];
      total = 0n;
    }
    current.push(piece);
    total += piece.amount;
  }
  if (current.length) batches.push(current);
  return batches;
}
