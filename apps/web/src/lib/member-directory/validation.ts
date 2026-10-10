import { StrKey } from '@stellar/stellar-sdk';

export function memberAddress(value: string): string {
  const address = value.trim();
  if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address))
    throw new Error('Enter a valid Stellar account or contract address.');
  return address;
}

export function memberPagination(search: URLSearchParams) {
  const read = (key: string, fallback: string) => {
    const value = search.get(key) ?? fallback;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw new Error('Use whole numbers for limit and offset.');
    return Number(value);
  };
  const limit = read('limit', '100');
  const offset = read('offset', '0');
  if (limit < 1 || limit > 100 || offset > Number.MAX_SAFE_INTEGER - limit)
    throw new Error('Limit must be between 1 and 100; offset must be a non-negative safe integer.');
  return { limit, offset };
}

export function holderTokenId(value: string): number {
  if (!/^\d{1,10}$/.test(value)) throw new Error('Token ID must be a whole number from 0 to 4294967295.');
  const id = Number(value);
  if (!Number.isInteger(id) || id > 0xffffffff) throw new Error('Token ID is outside the u32 range.');
  return id;
}
