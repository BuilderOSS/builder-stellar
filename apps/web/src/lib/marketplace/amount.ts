import { MAX_MARKETPLACE_FEE_BPS } from '@/lib/governance-limits';

const SCALE = 10_000_000n;
export const MAX_I128 = (1n << 127n) - 1n;

/** SAC amounts are integers; never pass through floating point. */
export function parseMarketplaceAmount(input: string, allowZero = false): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(input)) {
    throw new Error('Enter a plain decimal amount with at most 7 decimal places.');
  }
  const [whole, fraction = ''] = input.split('.');
  const value = BigInt(whole) * SCALE + BigInt(fraction.padEnd(7, '0'));
  if (value > MAX_I128 || (allowZero ? value < 0n : value <= 0n)) {
    throw new Error('Amount must be positive and within the contract limit.');
  }
  return value;
}

export function formatMarketplaceAmount(value: string | bigint): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? '-' : '';
  const abs = amount < 0n ? -amount : amount;
  return `${sign}${abs / SCALE}.${(abs % SCALE).toString().padStart(7, '0')}`;
}

export function marketplaceFee(price: string, feeBps: number): bigint {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_MARKETPLACE_FEE_BPS)
    throw new Error('Invalid marketplace fee.');
  const amount = BigInt(price);
  const intermediate = amount * BigInt(feeBps);
  if (amount < 0n || amount > MAX_I128 || intermediate > MAX_I128)
    throw new Error('This price and fee exceed the contract arithmetic limit.');
  return intermediate / 10_000n;
}

export function marketplaceId(value: string, kind: 'primary' | 'secondary'): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid listing identifier.');
  const id = BigInt(value);
  if (id > (kind === 'primary' ? (1n << 64n) - 1n : (1n << 32n) - 1n))
    throw new Error('Listing identifier is out of range.');
  return id;
}
