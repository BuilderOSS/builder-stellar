import type { Client as AuctionClient } from '@builder-stellar/auction-bindings';

import { settlementMethod, validateAuctionBid } from './state';
import type { CurrentAuction } from './types';

export async function prepareBuyerAction(
  client: AuctionClient,
  snapshot: CurrentAuction,
  bidder: string,
  action: 'bid' | 'settle',
  amount: bigint | null,
  now = Math.floor(Date.now() / 1000)
) {
  const [auctionTx, configTx, pausedTx] = await Promise.all([
    client.get_auction(),
    client.get_config(),
    client.paused()
  ]);
  const auction = auctionTx.result;
  const config = configTx.result;
  const live: CurrentAuction = {
    ...snapshot,
    paused: pausedTx.result,
    auction: {
      ...auction,
      token_id: auction.token_id.toString(),
      highest_bid: auction.highest_bid.toString(),
      start_time: auction.start_time.toString(),
      end_time: auction.end_time.toString()
    },
    config: { ...config, reserve_price: config.reserve_price.toString() }
  };
  if (
    live.auction?.token_id !== snapshot.auction?.token_id ||
    live.config.payment_token !== snapshot.config.payment_token
  )
    throw new Error('Auction or payment token changed. Refresh and review before signing.');
  if (action === 'bid') {
    if (amount === null) throw new Error('Enter a positive amount with up to 7 decimal places.');
    validateAuctionBid(live, snapshot.auction!.token_id, amount, now);
    return client.create_bid({ bidder, token_id: auction.token_id, amount });
  }
  const method = settlementMethod(live, now);
  // Do not silently turn a reviewed settle-only action into one that mints another token.
  if (!method || method !== settlementMethod(snapshot, now))
    throw new Error('Settlement state changed. Refresh and review it again.');
  return client[method]();
}

export async function prepareBuyerRefund(client: AuctionClient, bidder: string) {
  if ((await client.pending_refund({ bidder })).result <= 0n) throw new Error('No deferred refund to claim.');
  // No amount parameter: the current spec withdraws the bidder's whole pending balance.
  return client.withdraw_refund({ bidder });
}
