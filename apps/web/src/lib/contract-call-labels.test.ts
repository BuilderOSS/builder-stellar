import { describe, expect, it } from 'vitest';

import { mintGrants, mintTitle } from './contract-call-labels';

const minter = 'CTREASURY';

describe('token mint wording', () => {
  it('reads a batch mint to one wallet as a sentence, never as JSON', () => {
    const grants = mintGrants('batch_mint', [minter, ['GALICE'], ['5']]);
    expect(grants).toEqual([{ recipient: 'GALICE', amount: 5n }]);
    expect(mintTitle(grants!)).toBe('Mint 5 membership tokens to GALICE');
    expect(mintTitle(grants!, (address) => `${address.slice(0, 3)}…`)).toBe('Mint 5 membership tokens to GAL…');
  });
  it('says "a membership token" for one, and totals several wallets', () => {
    expect(mintTitle(mintGrants('mint', [minter, 'GALICE'])!)).toBe('Mint a membership token to GALICE');
    expect(mintTitle(mintGrants('batch_mint', [minter, ['GALICE'], [1]])!)).toBe('Mint a membership token to GALICE');
    const several = mintGrants('batch_mint', [minter, ['GALICE', 'GBOB'], ['5', '1200']]);
    expect(mintTitle(several!)).toBe('Mint 1,205 membership tokens to 2 wallets');
  });
  it('folds repeat wallets into one grant, in first-seen order', () => {
    expect(mintGrants('batch_mint', [minter, ['GBOB', 'GALICE', 'GBOB'], ['1', '2', '3']])).toEqual([
      { recipient: 'GBOB', amount: 4n },
      { recipient: 'GALICE', amount: 2n }
    ]);
    expect(mintTitle(mintGrants('batch_mint', [minter, ['GBOB', 'GBOB'], ['1', '2']])!)).toBe(
      'Mint 3 membership tokens to GBOB'
    );
  });
  it('returns null for calls the Token rejects or that are not mints', () => {
    for (const args of [
      [minter, ['GALICE', 'GBOB'], ['5']],
      [minter, [], []],
      [minter, ['GALICE'], ['0']],
      [minter, ['GALICE'], ['-1']],
      [minter, ['GALICE'], ['five']],
      [minter, 'GALICE', '5'],
      [minter, [7], ['5']]
    ]) {
      expect(mintGrants('batch_mint', args)).toBeNull();
    }
    expect(mintGrants('mint', [minter, ['GALICE']])).toBeNull();
    expect(mintGrants('transfer', [minter, 'GALICE', 1])).toBeNull();
  });
});
