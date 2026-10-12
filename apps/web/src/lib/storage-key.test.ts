import { xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { namespacedKey, STORAGE_NAMESPACE } from './storage-key';

describe('namespaced storage keys', () => {
  // contracts/common/src/test.rs `namespaced_key_xdr_is_pinned` pins the same bytes.
  it('matches the contracts byte for byte', () => {
    expect(STORAGE_NAMESPACE).toBe('buildeross');
    expect(namespacedKey('Admin').toXDR('hex')).toBe(
      '0000001000000001000000020000000f0000000a6275696c6465726f737300000000001000000001000000010000000f0000000541646d696e000000'
    );
    expect(namespacedKey('Listing', xdr.ScVal.scvU32(7)).toXDR('hex')).toBe(
      '0000001000000001000000020000000f0000000a6275696c6465726f737300000000001000000001000000020000000f000000074c697374696e67000000000300000007'
    );
  });
});
