import { sha256 } from '@noble/hashes/sha2.js';
import { Address } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

export function claimAmount(value: string): bigint {
  if (!/^[1-9]\d{0,38}$/.test(value)) throw new Error('Enter a positive whole-token amount.');
  const amount = BigInt(value);
  if (amount >= 1n << 128n) throw new Error('Amount exceeds u128.');
  return amount;
}

export function hashBytes(value: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('Each hash must be exactly 32 bytes of hex (64 characters).');
  return Buffer.from(value, 'hex');
}

/** contracts/minter/src/contract.rs:258-272: Address::to_xdr is ScVal XDR,
 * NOT ScAddress XDR, a StrKey string, or a raw ed25519 key. SHA-256, not Keccak.
 * This verifies supplied proofs; it never generates allocation trees/proofs. */
export function claimLeaf(recipient: string, amount: string): Buffer {
  const integer = claimAmount(amount);
  const be128 = Buffer.from(integer.toString(16).padStart(32, '0'), 'hex');
  return Buffer.from(sha256(Buffer.concat([new Address(recipient).toScVal().toXDR(), be128])));
}

export function verifyClaimProof(recipient: string, amount: string, proof: string[], root: string): boolean {
  if (proof.length > 32) throw new Error('Proof depth exceeds the contract limit of 32.');
  let node = claimLeaf(recipient, amount);
  for (const hex of proof) {
    const sibling = hashBytes(hex);
    const pair = Buffer.compare(node, sibling) <= 0 ? [node, sibling] : [sibling, node];
    node = Buffer.from(sha256(Buffer.concat(pair)));
  }
  return node.equals(hashBytes(root));
}

/** Explicit manual upload format. Identity/network/root are never accepted from the file. */
export function parseProofFile(text: string): { amount: string; proof: string[] } {
  if (text.length > 8192) throw new Error('Proof file exceeds 8 KB.');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== 2 || typeof object.amount !== 'string' || !Array.isArray(object.proof))
    throw new Error('Use exactly { "amount": "5", "proof": ["64-character sibling hex", ...] }.');
  claimAmount(object.amount);
  if (object.proof.length > 32) throw new Error('Proof depth exceeds 32.');
  for (const hash of object.proof) {
    if (typeof hash !== 'string') throw new Error('Proof siblings must be hex strings.');
    hashBytes(hash);
  }
  return { amount: object.amount, proof: object.proof as string[] };
}
