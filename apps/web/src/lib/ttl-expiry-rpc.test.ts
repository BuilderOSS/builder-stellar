import { describe, expect, it } from 'vitest';

import { contractCodeKey, contractInstanceKey, ipfsGroupKey, itemKey, propertyKey } from './ttl-expiry-rpc';

const METADATA = 'CBJWB5XFGTVI7ZMFXHCSB3YXV5IWGTQ5WC4YRUTJPHBIIAE6IEL7V4HE';
const HASH = '33da64583015eac21f3ed28d89f39a25f48451570a3773810a93ca6b66d0c4a5';

describe('ledger key encodings', () => {
  it('produces distinct keys for each artwork entry and instance', () => {
    const encoded = [
      contractInstanceKey(METADATA),
      propertyKey(METADATA, 0),
      propertyKey(METADATA, 1),
      itemKey(METADATA, 0, 0),
      itemKey(METADATA, 0, 1),
      itemKey(METADATA, 1, 0),
      ipfsGroupKey(METADATA, 0),
      contractCodeKey(HASH)
    ].map((key) => key.toXDR('base64'));

    expect(new Set(encoded).size).toBe(encoded.length);
  });

  it('encodes the same key deterministically', () => {
    expect(itemKey(METADATA, 2, 3).toXDR('base64')).toBe(itemKey(METADATA, 2, 3).toXDR('base64'));
  });

  it('rejects a malformed WASM hash', () => {
    expect(() => contractCodeKey('abc')).toThrow('Invalid WASM hash');
    expect(() => contractCodeKey(`${HASH}00`)).toThrow('Invalid WASM hash');
  });
});
