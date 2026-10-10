import { describe, expect, it } from 'vitest';

import { batchMintFits, MAX_BATCH_MINT, MAX_BATCH_RECIPIENTS, planBatchMints } from './batch-mint-budget';

describe('batch mint event budget (mirrors common::batch_mint_fits)', () => {
  it('derives the same caps as the contract', () => {
    expect(MAX_BATCH_MINT).toBe(43);
    expect(MAX_BATCH_RECIPIENTS).toBe(18);
  });
  it('accepts batches at the edge and rejects one more token or recipient', () => {
    expect(batchMintFits(43, 1)).toBe(true);
    expect(batchMintFits(44, 1)).toBe(false);
    expect(batchMintFits(18, 18)).toBe(true);
    expect(batchMintFits(19, 19)).toBe(false);
    expect(batchMintFits(35, 5)).toBe(true);
    expect(batchMintFits(42, 2)).toBe(true);
    expect(batchMintFits(43, 2)).toBe(false);
    expect(batchMintFits(0, 1)).toBe(false);
  });
  it('packs allocations into fitting calls and splits large recipients', () => {
    const one = planBatchMints([{ recipient: 'A', amount: 100n }]);
    expect(one.map((batch) => batch.map((entry) => entry.amount))).toEqual([[43n], [43n], [14n]]);
    const many = planBatchMints(Array.from({ length: 30 }, (_, i) => ({ recipient: `F${i}`, amount: 1n })));
    expect(many.map((batch) => batch.length)).toEqual([18, 12]);
    for (const batch of [...one, ...many])
      expect(
        batchMintFits(
          batch.reduce((sum, entry) => sum + entry.amount, 0n),
          batch.length
        )
      ).toBe(true);
    expect(() => planBatchMints([{ recipient: 'A', amount: 0n }])).toThrow();
  });
});
