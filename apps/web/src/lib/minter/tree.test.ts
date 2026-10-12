import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { verifyClaimProof } from './proof';
import { buildClaimTree, type ClaimEntry, MAX_TREE_CLAIMS, validateClaimEntries, verifyClaimTree } from './tree';

const NETWORK = 'Test SDF Network ; September 2015';
const TOKEN = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAITA4';
const entries = (n: number): ClaimEntry[] =>
  Array.from({ length: n }, (_, i) => ({ address: Keypair.random().publicKey(), amount: String(i + 1) }));

describe('published claim trees', () => {
  it('produces proofs the contract algorithm accepts, for every size from 1 to 33', () => {
    for (let n = 1; n <= 33; n += 1) {
      const list = entries(n);
      const tree = buildClaimTree(list, { network: NETWORK, token: TOKEN, round: 1 });
      for (const { address, amount } of list) {
        const claim = tree.claims[address]!;
        expect(claim.amount).toBe(amount);
        expect(verifyClaimProof(address, amount, claim.proof, tree.merkleRoot)).toBe(true);
      }
      expect(tree.tokenTotal).toBe(String((n * (n + 1)) / 2));
    }
  });

  it('is deterministic from the claim set, whatever the input order', () => {
    const list = entries(9);
    const a = buildClaimTree(list, { network: NETWORK, token: TOKEN, round: 2 });
    const b = buildClaimTree([...list].reverse(), { network: NETWORK, token: TOKEN, round: 2 });
    expect(b.merkleRoot).toBe(a.merkleRoot);
  });

  it('accepts a file only when the rebuilt root equals the chain root, and never trusts its proofs', () => {
    const list = entries(5);
    const tree = buildClaimTree(list, { network: NETWORK, token: TOKEN, round: 1 });
    const scope = { network: NETWORK, token: TOKEN, root: tree.merkleRoot };
    const forged = structuredClone(tree);
    forged.claims[list[0]!.address]!.proof = ['00'.repeat(32)];
    expect(verifyClaimTree(forged, scope).claims[list[0]!.address]!.proof).toEqual(
      tree.claims[list[0]!.address]!.proof
    );
    const inflated = structuredClone(tree);
    inflated.claims[list[0]!.address]!.amount = '999';
    expect(() => verifyClaimTree(inflated, scope)).toThrow('does not match the root');
    expect(() => verifyClaimTree({ ...tree, token: 'CX' }, scope)).toThrow('different community');
    expect(() => verifyClaimTree({ ...tree, format: 'uniswap' }, scope)).toThrow('unknown format');
  });

  it('rejects bad claim lists with a reason', () => {
    const [a] = entries(1);
    expect(() => validateClaimEntries([])).toThrow('at least one');
    expect(() => validateClaimEntries([a!, a!])).toThrow('appears twice');
    expect(() => validateClaimEntries([{ address: 'nope', amount: '1' }])).toThrow('not a Stellar address');
    expect(() => validateClaimEntries([{ ...a!, amount: '0' }])).toThrow();
    expect(MAX_TREE_CLAIMS).toBe(10_000);
  });
});
