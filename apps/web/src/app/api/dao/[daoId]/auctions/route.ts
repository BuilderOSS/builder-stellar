import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { NextResponse } from 'next/server';

import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { getGoldskyAuctionBids, getGoldskyAuctionHistory } from '@/lib/goldsky';

function jsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  return value;
}

export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const { daoId } = await params;
    const config = await getDaoNetworkConfigById(daoId);
    if (!config.auctionContractId || config.auctionEnabled === false) {
      return NextResponse.json({ message: 'Auctions are disabled for this DAO.' }, { status: 404 });
    }

    const client = new AuctionClient({
      contractId: config.auctionContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: config.adminAddress
    });
    const [configTx, pausedTx, history] = await Promise.all([
      client.get_config(),
      client.paused(),
      getGoldskyAuctionHistory(daoId)
    ]);
    const auctionTx = await client.get_auction();
    const auction = jsonValue(auctionTx.result) as { token_id?: string } | null;
    const paused = Boolean(pausedTx.result);
    if (!auction || typeof auction.token_id === 'undefined') {
      // No auction token exists yet. Determine if we've never launched or if we paused after launching.
      // If there's auction history, we've been paused. Otherwise, we've never launched.
      return NextResponse.json({
        status: paused && history.length > 0 ? 'paused' : 'not-launched',
        auction: null,
        auctionEnabled: true,
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
        auctionEnabled: true,
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
