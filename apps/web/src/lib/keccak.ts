import { Buffer } from 'buffer';

import { keccak_256 } from '@noble/hashes/sha3.js';

export function keccak256Bytes(value: string) {
  return Buffer.from(keccak_256(new TextEncoder().encode(value)));
}
