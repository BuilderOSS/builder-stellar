export const STROOPS_PER_TOKEN = 10_000_000n;
export const MIN_RESERVE_PRICE_STROOPS = 1_000n;
export const MIN_RESERVE_PRICE_TOKENS = '0.0001';

export function decimalToStroops(value: string): bigint | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)(?:\.(\d{1,7}))?$/);
  if (!match) return null;

  return BigInt(match[1]) * STROOPS_PER_TOKEN + BigInt((match[2] ?? '').padEnd(7, '0') || '0');
}

export function formatStroops(stroops: bigint | string | number): string {
  const value = BigInt(stroops);
  const whole = value / STROOPS_PER_TOKEN;
  const fraction = (value % STROOPS_PER_TOKEN).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function validateReservePrice(value: string): string | null {
  const stroops = decimalToStroops(value);
  if (stroops === null) return 'Enter a valid amount with up to 7 decimal places.';
  if (stroops < MIN_RESERVE_PRICE_STROOPS) {
    return `Minimum reserve price is ${MIN_RESERVE_PRICE_TOKENS} payment tokens.`;
  }
  return null;
}

export function getConfiguredAuctionNetwork(): 'testnet' | 'public' | 'local' {
  const network = process.env.NEXT_PUBLIC_NETWORK;
  return network === 'public' || network === 'local' || network === 'testnet' ? network : 'testnet';
}
