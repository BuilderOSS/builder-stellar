import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { NextResponse } from 'next/server';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { parseContractErrorCode } from '@/lib/contract-errors';
import { getDaoNetworkConfigById, readSource } from '@/lib/dao-config';
import { getGoldskyAuctionBids, getGoldskyAuctionHistory } from '@/lib/goldsky';
import { prisma } from '@/lib/prisma';
import { cached } from '@/lib/server-cache';

function jsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  return value;
}

/**
 * The open auction from the index: the latest unsettled, uncancelled
 * auction_created, its highest bid, and its end time including extensions.
 */
async function currentIndexedAuction(daoId: string, contractId: string) {
  const row = await prisma.auctionAuction.findFirst({
    where: { deploymentId: DEPLOYMENT_ID, daoId, contractId },
    orderBy: { createdLedger: 'desc' }
  });
  if (!row || row.settled || row.cancelled) return null;
  const bids = await prisma.auctionBid.findMany({
    where: { deploymentId: DEPLOYMENT_ID, daoId, tokenId: row.tokenId },
    orderBy: [{ eventLedger: 'desc' }, { eventId: 'desc' }]
  });
  const highest = bids.reduce<(typeof bids)[number] | null>(
    (best, bid) => (!best || bid.amount.greaterThan(best.amount) ? bid : best),
    null
  );
  const extendedEnds = bids.map((bid) => bid.newEndSeconds).filter((value): value is bigint => value !== null);
  const endTime = extendedEnds.reduce((max, value) => (value > max ? value : max), row.endSeconds);
  return {
    token_id: row.tokenId.toString(),
    start_time: row.startSeconds.toString(),
    end_time: endTime.toString(),
    extension_count: bids.filter((bid) => bid.extended).length,
    highest_bid: highest ? highest.amount.toFixed(0) : '0',
    highest_bidder: highest?.bidder ?? null,
    settled: false
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const { daoId } = await params;
    const config = await getDaoNetworkConfigById(daoId);
    if (!config.auctionContractId) {
      return NextResponse.json({ message: 'Auctions are disabled for this DAO.' }, { status: 404 });
    }

    const client = new AuctionClient({
      contractId: config.auctionContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: readSource(config.launchAdmin)
    });
    // The index has the auction, its bids and the pause state; RPC is only for
    // the Auction config (cached) and a fallback when nothing is indexed yet.
    // Bidding and settlement recheck live state when they are prepared.
    const [configTx, history, indexed] = await Promise.all([
      cached(`auction-config:${config.auctionContractId}`, 60_000, () => client.get_config()),
      getGoldskyAuctionHistory(daoId),
      currentIndexedAuction(config.tokenContractId, config.auctionContractId)
    ]);
    let auction: { token_id?: string } | null = indexed;
    if (!auction) {
      try {
        const auctionTx = await cached(`auction-live:${config.auctionContractId}`, 15_000, () => client.get_auction());
        auction = jsonValue(auctionTx.result) as { token_id?: string } | null;
      } catch (error) {
        // AuctionError::NotLaunched: no auction has been created yet.
        if (parseContractErrorCode(error) !== 7409) throw error;
      }
    }
    const paused =
      config.auctionPaused ??
      Boolean((await cached(`auction-paused:${config.auctionContractId}`, 15_000, () => client.paused())).result);
    if (!auction || typeof auction.token_id === 'undefined') {
      // No auction token exists yet. Determine if we've never launched or if we paused after launching.
      // If there's auction history, we've been paused. Otherwise, we've never launched.
      return NextResponse.json({
        status: paused && history.length > 0 ? 'paused' : 'not-launched',
        auction: null,
        auctionEnabled: config.auctionEnabled,
        paused,
        config: jsonValue(configTx.result),
        history
      });
    }
    const bids = await getGoldskyAuctionBids(daoId, auction.token_id);
    return NextResponse.json(
      jsonValue({
        status: paused ? 'paused' : 'active',
        auction,
        auctionEnabled: config.auctionEnabled,
        config: configTx.result,
        paused,
        bids,
        history
      })
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Auction unavailable' },
      { status: 500 }
    );
  }
}
