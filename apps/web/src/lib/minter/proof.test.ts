import { createHash } from 'node:crypto';

import { Address } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { claimAmount, claimLeaf, hashBytes, parseProofFile, verifyClaimProof } from './proof';
import { ALICE, BOB } from './test-fixtures';

const hash = (hex: string) => createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');

describe('Minter supplied proofs match the Rust leaf codec', () => {
  it('hashes ScVal address XDR plus 16-byte big-endian u128, not ScAddress or StrKey text', () => {
    // ScVal::Address(18), ScAddress::Account(0), PublicKey::Ed25519(0), raw key, raw u128.
    const xdrHex = '000000120000000000000000' + '01'.repeat(32);
    expect(new Address(ALICE).toScVal().toXDR('hex')).toBe(xdrHex);
    const amount = '340282366920938463463374607431768211455';
    expect(claimLeaf(ALICE, amount).toString('hex')).toBe(hash(xdrHex + 'ff'.repeat(16)));
    expect(claimLeaf(ALICE, '5').toString('hex')).toBe(hash(xdrHex + '00'.repeat(15) + '05'));
    expect(claimLeaf(ALICE, '5').toString('hex')).not.toBe(
      hash(Buffer.from(ALICE).toString('hex') + '00'.repeat(15) + '05')
    );
  });
  it('uses byte-sorted SHA-256 pairs without direction bits and rejects another recipient/amount/root', () => {
    const a = claimLeaf(ALICE, '5').toString('hex');
    const b = claimLeaf(BOB, '3').toString('hex');
    const root = hash([a, b].sort().join(''));
    expect(verifyClaimProof(ALICE, '5', [b], root)).toBe(true);
    expect(verifyClaimProof(BOB, '3', [a], root)).toBe(true);
    expect(verifyClaimProof(ALICE, '6', [b], root)).toBe(false);
    expect(verifyClaimProof(BOB, '5', [b], root)).toBe(false);
    expect(verifyClaimProof(ALICE, '5', [b], a)).toBe(false);
    expect(verifyClaimProof(ALICE, '5', [], a)).toBe(true);
  });
  it.each(['0', '-1', '1.5', '01', '1e3', '340282366920938463463374607431768211456'])(
    'rejects unsafe amount %s',
    (value) => expect(() => claimAmount(value)).toThrow()
  );
  it('requires manual exact proof JSON and bounds lengths', () => {
    expect(parseProofFile('{"amount":"5","proof":[]}')).toEqual({ amount: '5', proof: [] });
    for (const value of [
      { amount: 5, proof: [] },
      { amount: '5', proof: ['abc'] },
      { amount: '5', proof: [], recipient: ALICE },
      { amount: '5', proof: new Array(33).fill('00'.repeat(32)) }
    ])
      expect(() => parseProofFile(JSON.stringify(value))).toThrow();
    expect(() => hashBytes('0x' + '00'.repeat(32))).toThrow();
    expect(() => parseProofFile(' '.repeat(8193))).toThrow('8 KB');
    expect(() => verifyClaimProof(ALICE, '5', new Array(33).fill('00'.repeat(32)), '00'.repeat(32))).toThrow('32');
  });
});
