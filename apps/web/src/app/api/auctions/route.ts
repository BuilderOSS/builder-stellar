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

export async function GET(request: Request) {
  try {
    const daoId = new URL(request.url).searchParams.get('daoId');
    if (!daoId) return NextResponse.json({ message: 'daoId is required' }, { status: 400 });
    const config = await getDaoNetworkConfigById(daoId);
    const client = new AuctionClient({
      contractId: config.auctionContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: config.adminAddress
    });
    const [auctionTx, configTx, pausedTx, history] = await Promise.all([
      client.get_auction(),
      client.get_config(),
      client.paused(),
      getGoldskyAuctionHistory(daoId)
    ]);
    const auction = jsonValue(auctionTx.result) as { token_id: string };
    if (!auction || typeof auction.token_id === 'undefined') {
      throw new Error('Auction contract has no current auction state. Confirm the auction has been launched.');
    }
    const bids = await getGoldskyAuctionBids(daoId, auction.token_id);
    return NextResponse.json(jsonValue({ auction, config: configTx.result, paused: pausedTx.result, bids, history }));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Auction unavailable' },
      { status: 500 }
    );
  }
}
