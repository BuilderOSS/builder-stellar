import type { DaoNetworkConfig } from '@/lib/dao-config';

import type { CurrentAuction } from './types';

const SCALE = 10_000_000n;
export const MAX_I128 = (1n << 127n) - 1n;

export function formatAuctionAmount(value: string | bigint | null | undefined) {
  if (value === null || value === undefined) return '—';
  const raw = BigInt(value);
  const fraction = (raw % SCALE).toString().padStart(7, '0').replace(/0+$/, '');
  return `${raw / SCALE}${fraction ? `.${fraction}` : ''}`;
}

export function parseAuctionAmount(value: string): bigint | null {
  const match = value.trim().match(/^(\d{1,32})(?:\.(\d{1,7}))?$/);
  if (!match) return null;
  const amount = BigInt(match[1]) * SCALE + BigInt((match[2] ?? '').padEnd(7, '0'));
  return amount > 0n && amount <= MAX_I128 ? amount : null;
}

export function minimumAuctionBid(data: CurrentAuction): bigint {
  if (!data.auction) throw new Error('No current auction.');
  const highest = BigInt(data.auction.highest_bid);
  const minimum = data.auction.highest_bidder
    ? highest + (highest * BigInt(data.config.min_bid_increment_percent)) / 100n
    : BigInt(data.config.reserve_price);
  return minimum > 0n ? minimum : 1n;
}

export function auctionBuyerState(
  config: Pick<DaoNetworkConfig, 'status' | 'auctionEnabled' | 'auctionContractId'>,
  data: CurrentAuction | undefined,
  now: number
) {
  if (config.status === 'pending') return 'setup';
  if (!config.auctionContractId || config.auctionEnabled === false || data?.auctionEnabled === false) return 'disabled';
  if (!data) return 'loading';
  if (!data.auction) return data.paused && data.status === 'paused' ? 'paused' : 'not-launched';
  if (data.auction.settled) return 'settled';
  if (data.paused) return 'paused';
  if (now <= 0) return 'loading';
  return BigInt(data.auction.end_time) <= BigInt(now) ? 'expired' : 'active';
}

export function settlementMethod(data: CurrentAuction, now: number) {
  if (!data.auction || data.auction.settled || BigInt(data.auction.start_time) === 0n) return null;
  // Both settle methods require now >= end_time (AuctionActive otherwise), even
  // while paused. Paused settlement closes the auction without starting another.
  if (now <= 0 || BigInt(data.auction.end_time) > BigInt(now)) return null;
  return data.paused ? ('settle_auction' as const) : ('settle_and_create_new' as const);
}

export function assertAuctionWallet(
  address: string,
  passphrase: string,
  expectedAddress: string,
  expectedPassphrase: string
) {
  if (!address || address !== expectedAddress) throw new Error('Wallet account changed. Reconnect before signing.');
  if (passphrase !== expectedPassphrase) throw new Error('Switch your wallet to the DAO network before signing.');
}

export function validateAuctionBid(data: CurrentAuction, tokenId: string, amount: bigint, now: number) {
  if (!data.auction || data.auction.token_id !== tokenId)
    throw new Error('The current auction changed. Review it again.');
  if (
    data.paused ||
    data.auction.settled ||
    data.auctionEnabled === false ||
    BigInt(data.auction.end_time) <= BigInt(now)
  )
    throw new Error('This auction is not accepting bids.');
  if (amount <= 0n || amount > MAX_I128 || amount < minimumAuctionBid(data))
    throw new Error(`Bid at least ${formatAuctionAmount(minimumAuctionBid(data))} payment tokens (up to 7 decimals).`);
}
