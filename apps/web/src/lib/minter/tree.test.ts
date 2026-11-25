import { readFileSync } from 'node:fs';

import { Address, Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { MAX_BATCH_MINT } from '@/lib/batch-mint-budget';

import { claimLeaf, verifyClaimProof } from './proof';
import {
  buildClaimTree,
  type ClaimEntry,
  MAX_TREE_CLAIMS,
  TREE_FORMAT,
  TREE_LEAF,
  TREE_NODE,
  validateClaimEntries,
  verifyClaimTree
} from './tree';

const NETWORK = 'Test SDF Network ; September 2015';
const TOKEN = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAITA4';
const entries = (n: number): ClaimEntry[] =>
  Array.from({ length: n }, (_, i) => ({ address: Keypair.random().publicKey(), amount: String(i + 1) }));

describe('published claim trees', () => {
  it('produces proofs the contract algorithm accepts, for every size from 1 to 33', () => {
    for (let n = 1; n <= 33; n += 1) {
      const list = entries(n);
      const tree = buildClaimTree(list, { network: NETWORK, token: TOKEN, list: 1 });
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
    const a = buildClaimTree(list, { network: NETWORK, token: TOKEN, list: 2 });
    const b = buildClaimTree([...list].reverse(), { network: NETWORK, token: TOKEN, list: 2 });
    expect(b.merkleRoot).toBe(a.merkleRoot);
  });

  it('accepts a file only when the rebuilt root equals the chain root, and never trusts its proofs', () => {
    const list = entries(5);
    const tree = buildClaimTree(list, { network: NETWORK, token: TOKEN, list: 1 });
    const scope = { network: NETWORK, token: TOKEN, root: tree.merkleRoot };
    const forged = structuredClone(tree);
    forged.claims[list[0]!.address]!.proof = ['00'.repeat(32)];
    expect(verifyClaimTree(forged, scope).claims[list[0]!.address]!.proof).toEqual(
      tree.claims[list[0]!.address]!.proof
    );
    const inflated = structuredClone(tree);
    inflated.claims[list[0]!.address]!.amount = '2';
    expect(() => verifyClaimTree(inflated, scope)).toThrow('does not match the root');
    expect(() => verifyClaimTree({ ...tree, token: 'CX' }, scope)).toThrow('different tribe');
    expect(() => verifyClaimTree({ ...tree, format: 'uniswap' }, scope)).toThrow('unknown format');
  });

  it('rejects bad claim lists with a reason', () => {
    const [a] = entries(1);
    expect(() => validateClaimEntries([])).toThrow('at least one');
    expect(() => validateClaimEntries([a!, a!])).toThrow('appears twice');
    expect(() => validateClaimEntries([{ address: 'nope', amount: '1' }])).toThrow('not a Stellar address');
    expect(() => validateClaimEntries([{ ...a!, amount: '0' }])).toThrow();
    // An allocation above one claim's 43 tokens is claimed over several transactions.
    expect(() => validateClaimEntries([{ ...a!, amount: String(MAX_BATCH_MINT + 1) }])).not.toThrow();
    expect(() => validateClaimEntries([{ ...a!, amount: '4294967296' }])).toThrow('more than a list can hold');
    expect(MAX_TREE_CLAIMS).toBe(10_000);
  });
});

/** Shared with the contract's tests (contracts/minter/src/test.rs), which check the same file. */
type MerkleVectors = {
  format: string;
  leafRule: string;
  nodeRule: string;
  leaves: {
    name: string;
    address: string;
    amount: string;
    scvalXdr: string;
    preimageBytes: number;
    leaf: string;
    claimable: boolean;
  }[];
  tree: { claims: ClaimEntry[]; merkleRoot: string; proofs: Record<string, string[]> };
};
const VECTORS = JSON.parse(
  readFileSync(new URL('../../../../../contracts/minter/test-vectors/merkle-v1.json', import.meta.url), 'utf8')
) as MerkleVectors;

describe('shared merkle vectors (contracts/minter/test-vectors/merkle-v1.json)', () => {
  it('describe the format this builder publishes', () => {
    expect(VECTORS.format).toBe(TREE_FORMAT);
    expect(VECTORS.leafRule).toBe(TREE_LEAF);
    expect(VECTORS.nodeRule).toBe(TREE_NODE);
  });

  it('hash every leaf as the contract does, for account, contract, and muxed addresses', () => {
    for (const vector of VECTORS.leaves) {
      const xdr = Buffer.from(new Address(vector.address).toScVal().toXDR());
      expect(xdr.toString('hex'), vector.name).toBe(vector.scvalXdr);
      expect(xdr.length + 16, vector.name).toBe(vector.preimageBytes);
      expect(claimLeaf(vector.address, vector.amount).toString('hex'), vector.name).toBe(vector.leaf);
    }
    expect(VECTORS.leaves.map((vector) => vector.address[0])).toEqual(expect.arrayContaining(['G', 'C', 'M']));
  });

  it('only claimable leaves differ in length from a node (64 bytes)', () => {
    for (const vector of VECTORS.leaves) expect(vector.preimageBytes === 64, vector.name).toBe(!vector.claimable);
  });

  it('build the same root and proofs, whatever the input order', () => {
    const scope = { network: NETWORK, token: TOKEN, list: 0 };
    for (const claims of [VECTORS.tree.claims, [...VECTORS.tree.claims].reverse()]) {
      const tree = buildClaimTree(claims, scope);
      expect(tree.merkleRoot).toBe(VECTORS.tree.merkleRoot);
      for (const { address, amount } of claims) {
        expect(tree.claims[address]!.proof).toEqual(VECTORS.tree.proofs[address]);
        expect(verifyClaimProof(address, amount, VECTORS.tree.proofs[address]!, VECTORS.tree.merkleRoot)).toBe(true);
      }
    }
  });

  it('refuse the muxed claimer, which the contract cannot accept', () => {
    for (const vector of VECTORS.leaves.filter(({ claimable }) => !claimable))
      expect(() => validateClaimEntries([{ address: vector.address, amount: vector.amount }])).toThrow(
        'not a Stellar address'
      );
  });
});
