/**
 * Published claim trees (docs/STORAGE_DIET.md § 4 Minter, D18).
 *
 * Every root a DAO sets comes with the full tree at an `ipfs://` `tree_uri`, in
 * the Uniswap merkle-distributor shape with an explicit algorithm header. Our
 * hashing differs from the EVM defaults, so no stock EVM loader verifies it and
 * the format is never labelled as one:
 *
 *   {
 *     "format": "builder-stellar-merkle-v1",
 *     "hash": "sha256", "leaf": "sha256(scval_xdr(address) || u128_be(amount))", "node": "sha256(sorted(a, b))",
 *     "network": "<passphrase>", "token": "C…", "round": 3, "merkleRoot": "<64 hex>", "tokenTotal": "1234",
 *     "claims": { "G…": { "amount": "5", "proof": ["<64 hex>", …] } }
 *   }
 *
 * The chain cannot check a file against its root. Consumers rebuild the tree
 * from `claims` and refuse the file unless the rebuilt root equals the chain's;
 * the proof they use is the rebuilt one, never the file's.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { StrKey } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

import { claimAmount, claimLeaf } from './proof';

export const TREE_FORMAT = 'builder-stellar-merkle-v1';
export const TREE_LEAF = 'sha256(scval_xdr(address) || u128_be(amount))';
export const TREE_NODE = 'sha256(sorted(a, b))';
/** Recipients per tree the app builds; a two-file index is the escape beyond it. */
export const MAX_TREE_CLAIMS = 10_000;

export type ClaimEntry = { address: string; amount: string };

export type ClaimTreeFile = {
  format: typeof TREE_FORMAT;
  hash: 'sha256';
  leaf: typeof TREE_LEAF;
  node: typeof TREE_NODE;
  network: string;
  token: string;
  round: number;
  merkleRoot: string;
  tokenTotal: string;
  claims: Record<string, { amount: string; proof: string[] }>;
};

function hashPair(a: Buffer, b: Buffer) {
  const [low, high] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  return Buffer.from(sha256(Buffer.concat([low, high])));
}

/**
 * Build the tree over sorted leaves; an odd node at the end of a layer is
 * carried up unchanged. With sorted-pair hashing the contract accepts any
 * fixed shape, and this one is deterministic from the claim set alone.
 */
function buildLayers(leaves: Buffer[]): Buffer[][] {
  const layers = [[...leaves].sort(Buffer.compare)];
  while (layers[layers.length - 1]!.length > 1) {
    const layer = layers[layers.length - 1]!;
    const next: Buffer[] = [];
    for (let i = 0; i < layer.length; i += 2)
      next.push(i + 1 < layer.length ? hashPair(layer[i]!, layer[i + 1]!) : layer[i]!);
    layers.push(next);
  }
  return layers;
}

function proofFor(layers: Buffer[][], leaf: Buffer): string[] {
  let index = layers[0]!.findIndex((node) => node.equals(leaf));
  if (index < 0) throw new Error('Leaf not in tree.');
  const proof: string[] = [];
  for (const layer of layers.slice(0, -1)) {
    const sibling = index ^ 1;
    if (sibling < layer.length) proof.push(layer[sibling]!.toString('hex'));
    index = Math.floor(index / 2);
  }
  return proof;
}

/** Validate a claim list: valid addresses, positive amounts, no duplicates, within the cap. */
export function validateClaimEntries(entries: ClaimEntry[]) {
  if (!entries.length) throw new Error('Add at least one recipient.');
  if (entries.length > MAX_TREE_CLAIMS) throw new Error(`Use at most ${MAX_TREE_CLAIMS.toLocaleString()} recipients.`);
  const seen = new Set<string>();
  for (const { address, amount } of entries) {
    if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address))
      throw new Error(`${address || 'An empty address'} is not a Stellar address.`);
    if (seen.has(address)) throw new Error(`${address} appears twice. Combine its amounts into one line.`);
    seen.add(address);
    claimAmount(amount);
  }
}

/** Build the published file for a claim list. */
export function buildClaimTree(
  entries: ClaimEntry[],
  scope: { network: string; token: string; round: number }
): ClaimTreeFile {
  validateClaimEntries(entries);
  const leaves = entries.map(({ address, amount }) => claimLeaf(address, amount));
  const layers = buildLayers(leaves);
  const claims: ClaimTreeFile['claims'] = {};
  entries.forEach(({ address, amount }, i) => {
    claims[address] = { amount, proof: proofFor(layers, leaves[i]!) };
  });
  return {
    format: TREE_FORMAT,
    hash: 'sha256',
    leaf: TREE_LEAF,
    node: TREE_NODE,
    network: scope.network,
    token: scope.token,
    round: scope.round,
    merkleRoot: layers[layers.length - 1]![0]!.toString('hex'),
    tokenTotal: entries.reduce((sum, { amount }) => sum + BigInt(amount), 0n).toString(),
    claims
  };
}

/**
 * Check a fetched file against the chain. Returns the rebuilt tree (proofs
 * recomputed from `claims`) or throws with a member-facing reason.
 */
export function verifyClaimTree(
  value: unknown,
  expected: { network: string; token: string; root: string }
): ClaimTreeFile {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The claim list is not a JSON object.');
  const file = value as Partial<ClaimTreeFile>;
  if (file.format !== TREE_FORMAT || file.hash !== 'sha256' || file.leaf !== TREE_LEAF || file.node !== TREE_NODE)
    throw new Error('The claim list uses an unknown format.');
  if (file.network !== expected.network || file.token !== expected.token)
    throw new Error('The claim list is for a different community or network.');
  if (!file.claims || typeof file.claims !== 'object') throw new Error('The claim list has no claims.');
  const entries = Object.entries(file.claims).map(([address, claim]) => ({
    address,
    amount: String((claim as { amount?: unknown })?.amount ?? '')
  }));
  const rebuilt = buildClaimTree(entries, {
    network: expected.network,
    token: expected.token,
    round: Number(file.round)
  });
  if (rebuilt.merkleRoot !== expected.root.toLowerCase())
    throw new Error('The claim list does not match the root on chain.');
  return rebuilt;
}

/** The file as uploaded: stable key order, one line. */
export function claimTreeJson(file: ClaimTreeFile) {
  return JSON.stringify(file);
}
