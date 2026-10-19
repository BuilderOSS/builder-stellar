'use client';

import useSWR from 'swr';

import type { DaoNetworkConfig } from '@/lib/dao-config';

export type AuctionStatus = {
  status: 'not-launched' | 'paused' | 'active';
  paused: boolean;
  auction: { token_id: string; settled: boolean } | null;
  config: {
    duration: string | number;
    reserve_price: string;
    time_buffer: string | number;
    payment_token: string;
    min_bid_increment_percent: number;
  };
};

async function fetcher(url: string): Promise<AuctionStatus> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Auction status unavailable');
  return payload;
}

/** The auction's live settings and whether it is paused, for Manage and the proposal composer. */
export function useAuctionStatus(daoId: string, config: DaoNetworkConfig) {
  return useSWR<AuctionStatus>(
    config.auctionContractId ? `/api/dao/${encodeURIComponent(daoId)}/auctions` : null,
    fetcher
  );
}
