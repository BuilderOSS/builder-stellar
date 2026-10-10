import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { founderMintValues } from './founder-mint-values';

const a = Keypair.random().publicKey();
const b = Keypair.random().publicKey();
describe('setup founder recipient vectors', () => {
  it('builds matching address and u128-compatible amount vectors', () => {
    expect(
      founderMintValues([
        { recipient: ` ${a} `, amount: '3' },
        { recipient: b, amount: '17' }
      ])
    ).toEqual({ recipients: [a, b], amounts: [3n, 17n], total: 20n });
  });
  it.each(['0', '-1', '1.5', '44', 'NaN', ''])('rejects invalid amount %s', (amount) => {
    expect(() => founderMintValues([{ recipient: a, amount }])).toThrow(/amount/);
  });
  it('rejects invalid, duplicate and empty recipients', () => {
    expect(() => founderMintValues([{ recipient: 'bad', amount: '1' }])).toThrow(/address/);
    expect(() =>
      founderMintValues([
        { recipient: a, amount: '1' },
        { recipient: a, amount: '1' }
      ])
    ).toThrow(/duplicate/);
    expect(() => founderMintValues([])).toThrow();
  });
  it('applies the event budget to the whole transaction, not just each row', () => {
    expect(founderMintValues([{ recipient: a, amount: '43' }]).total).toBe(43n);
    expect(() =>
      founderMintValues([
        { recipient: a, amount: '42' },
        { recipient: b, amount: '1' }
      ])
    ).toThrow(/does not fit one transaction.*2 transactions/);
  });
});
