import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { directoryKey } from './hooks';
import { holderTokenId, memberAddress, memberPagination } from './validation';

describe('directory inputs and cache scope', () => {
  it('keeps deployment, DAO, address and pagination in query keys', () => {
    const a = directoryKey('dao-a', 'profile', 'address-a');
    expect(a[0]).toBe('member-directory');
    expect(a[1]).toBeTruthy();
    expect(a).not.toEqual(directoryKey('dao-b', 'profile', 'address-a'));
    expect(a).not.toEqual(directoryKey('dao-a', 'profile', 'address-b'));
    expect(directoryKey('dao-a', 'members', 0)).not.toEqual(directoryKey('dao-a', 'members', 4));
  });
  it.each(['-1', '1.1', '1e3', '', '9007199254740992'])('rejects unsafe offset %s', (offset) => {
    expect(() => memberPagination(new URLSearchParams({ offset }))).toThrow();
  });
  it('uses bounded pages and rejects invalid rather than silently truncating', () => {
    expect(memberPagination(new URLSearchParams({ limit: '25', offset: '1025' }))).toEqual({ limit: 25, offset: 1025 });
    expect(() => memberPagination(new URLSearchParams({ limit: '101' }))).toThrow();
    expect(() => memberPagination(new URLSearchParams({ limit: '0' }))).toThrow();
  });
  it('preserves Stellar case and verifies checksums', () => {
    const address = Keypair.random().publicKey();
    expect(memberAddress(` ${address} `)).toBe(address);
    expect(() => memberAddress(address.toLowerCase())).toThrow();
    expect(() => memberAddress('G'.repeat(56))).toThrow();
  });
  it('accepts zero and max u32 only as integer IDs', () => {
    expect(holderTokenId('0')).toBe(0);
    expect(holderTokenId('4294967295')).toBe(4294967295);
    for (const value of ['4294967296', '-1', '1.2', '1e2', 'NaN', '9007199254740991'])
      expect(() => holderTokenId(value)).toThrow();
  });
});
