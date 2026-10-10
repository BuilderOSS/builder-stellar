import type { NetworkName } from '@/config/networks';

export type CurrentAuction = {
  status: 'active' | 'paused' | 'not-launched';
  auctionEnabled: boolean | null;
  auction: {
    token_id: string;
    start_time: string;
    end_time: string;
    highest_bid: string;
    highest_bidder: string | null;
    settled: boolean;
  } | null;
  config: { reserve_price: string; min_bid_increment_percent: number; payment_token: string };
  paused: boolean;
  bids?: Array<{ event_id: string; bidder: string; amount: string; timestamp: string | null }>;
};

export type AuctionHistoryItem = {
  eventId: string;
  tokenId: string;
  winningBidder: string | null;
  amount: string | null;
  paymentToken: string | null;
  outcome: 'sold' | 'unsold' | 'cancelled';
  settledAt: string | null;
  transactionHash: string | null;
};

export type AuctionHistoryPage = {
  deploymentId: string;
  daoId: string;
  contractId: string;
  network: NetworkName;
  items: AuctionHistoryItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
};
