'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import useSWR from 'swr';

import type { DaoNetworkConfig } from '@/lib/dao-config';

type PendingRefundKey = readonly ['auction-pending-refund', string, string, string, string];

async function fetchPendingRefund([, contractId, rpcUrl, passphrase, bidder]: PendingRefundKey) {
  const client = new AuctionClient({ contractId, rpcUrl, networkPassphrase: passphrase, publicKey: bidder });
  // The contract view is authoritative; auction.pending_refunds (indexed) only mirrors it.
  return (await client.pending_refund({ bidder })).result;
}

/**
 * Deferred refund held by the auction contract for `bidder` (in payment-token base units).
 * A refund is deferred when the best-effort push to the outbid bidder failed; the bidder pulls it
 * with `withdraw_refund(bidder)`.
 */
export function usePendingRefund(config: DaoNetworkConfig, bidder: string | null | undefined) {
  const key =
    config.auctionContractId && bidder
      ? (['auction-pending-refund', config.auctionContractId, config.rpcUrl, config.passphrase, bidder] as const)
      : null;
  return useSWR(key, fetchPendingRefund, { keepPreviousData: true, refreshInterval: 30_000 });
}
