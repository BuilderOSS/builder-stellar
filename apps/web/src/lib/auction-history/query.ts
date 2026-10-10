import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { prisma } from '@/lib/prisma';

import type { AuctionHistoryPage } from './types';

export class AuctionHistoryError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export function historyPagination(params: URLSearchParams) {
  const limit = params.get('limit') ?? '12';
  const offset = params.get('offset') ?? '0';
  if (
    !/^\d{1,2}$/.test(limit) ||
    Number(limit) < 1 ||
    Number(limit) > 50 ||
    !/^\d{1,6}$/.test(offset) ||
    Number(offset) > 100_000
  )
    throw new AuctionHistoryError('Invalid history pagination.');
  return { limit: Number(limit), offset: Number(offset) };
}

export function auctionHistoryScope(deploymentId: string, daoId: string, contractId: string) {
  if (!deploymentId || !daoId || !contractId) throw new AuctionHistoryError('Auction identity unavailable.', 404);
  return { deploymentId, daoId, contractId };
}

type HistoryRow = {
  event_id: string;
  token_id: string;
  winner: string | null;
  amount: string | null;
  payment_token: string | null;
  settled: boolean;
  cancelled: boolean;
  settled_at: Date | null;
  transaction_hash: string | null;
};

export async function readAuctionHistory(daoId: string, params: URLSearchParams): Promise<AuctionHistoryPage> {
  const page = historyPagination(params);
  const config = await getDaoNetworkConfigById(daoId);
  const scope = auctionHistoryScope(DEPLOYMENT_ID, config.tokenContractId, config.auctionContractId);
  if (params.get('network') !== null && params.get('network') !== config.name)
    throw new AuctionHistoryError('History network does not match this DAO.', 409);
  // Existing views only. Keep every join and read scoped, including the settlement lookup.
  // Cast exact numerics to text: never round a bid or token ID through a JS number.
  const rows = await prisma.$queryRaw<HistoryRow[]>`
    SELECT a.event_id, a.token_id::text, a.payment_token, a.settled, a.cancelled,
           s.winner, s.amount::text, s.event_at AS settled_at, s.transaction_hash
    FROM auction.auctions a
    LEFT JOIN LATERAL (
      SELECT s.winner, s.amount, s.event_at, s.transaction_hash
      FROM auction.settlements s
      WHERE s.deployment_id = a.deployment_id AND s.dao_id = a.dao_id
        AND s.contract_id = a.contract_id AND s.token_id = a.token_id
        AND s.event_ledger >= a.created_ledger
      ORDER BY s.event_ledger DESC, s.transaction_index DESC NULLS LAST,
        s.operation_index DESC NULLS LAST, s.event_index DESC NULLS LAST, s.event_id DESC
      LIMIT 1
    ) s ON true
    WHERE a.deployment_id = ${scope.deploymentId} AND a.dao_id = ${scope.daoId}
      AND a.contract_id = ${scope.contractId} AND (a.settled OR a.cancelled)
    ORDER BY a.token_id DESC, a.event_id DESC
    LIMIT ${page.limit + 1} OFFSET ${page.offset}
  `;
  return {
    ...scope,
    network: config.name,
    ...page,
    hasMore: rows.length > page.limit,
    items: rows.slice(0, page.limit).map((row) => {
      if (row.settled && row.amount === null) throw new AuctionHistoryError('Settlement data is incomplete.', 503);
      return {
        eventId: row.event_id,
        tokenId: row.token_id,
        winningBidder: row.winner,
        amount: row.amount,
        paymentToken: row.payment_token,
        outcome: row.settled ? (row.winner ? 'sold' : 'unsold') : 'cancelled',
        settledAt: row.settled_at?.toISOString() ?? null,
        transactionHash: row.transaction_hash
      };
    })
  };
}
