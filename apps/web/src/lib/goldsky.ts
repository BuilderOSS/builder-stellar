/**
 * Goldsky Data Access Layer
 *
 * PostgreSQL-backed data queries for Stellar DAO using Goldsky indexer.
 * Direct database access for indexed DAO data.
 *
 * All queries filter by:
 * - deployment_id: Manager contract (constant per app instance)
 * - dao_id: Token contract address (primary multi-tenant key)
 */

import type { AppProposalDetail, AppProposalList } from '@prisma/client';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDeploymentNetwork, verifyRows } from '@/lib/dao-db';
import { prisma } from '@/lib/prisma';

/**
 * Get the deployment_id for this app instance.
 *
 * deployment_id is CONSTANT per app instance and represents the manager contract
 * that manages multiple DAOs. Format: "manager:CONTRACT_ADDRESS"
 *
 * Example: "manager:CBSKIHNNVKEJWV3A2OI63BWUC637LR4P2GBV4MPJB5PDOMVUMS6KOMAH"
 *
 * This is generated from the latest manager deployment artifact and must match what's in the database.
 * All DAOs under this manager share the same deployment_id.
 */
function getDeploymentId(): string {
  return DEPLOYMENT_ID;
}

/** Activity rows shown on public feeds (the indexer also writes admin/system rows). */
const PUBLIC_VISIBILITY = ['public', 'governance'];
/** The indexer curates visibility: public feeds read only the public/governance rows. */
const PUBLIC_FEED_FILTER = { visibility: { in: PUBLIC_VISIBILITY } };
/** Chain order, newest first: ledger, then position inside the ledger (filled by the DB trigger), then the id. */
const FEED_ORDER = [
  { ledgerSequence: 'desc' as const },
  { transactionIndex: 'desc' as const },
  { operationIndex: 'desc' as const },
  { eventIndex: 'desc' as const },
  { activityId: 'desc' as const }
];

type FeedRowForAsset = { daoId: string | null; contractRole: string; tokenId: string | null; args: string };

/**
 * The payment asset (SAC contract id) behind each feed row's amount, so amounts can carry a unit.
 * Market events name it in their args; auction events take it from the auction for that token,
 * which stays right even if the community later changes the auction's payment asset.
 */
async function feedPaymentAssets(deploymentId: string, rows: FeedRowForAsset[]) {
  const auctionRows = rows.filter(
    (row) => row.contractRole === 'auction' && row.daoId && /^\d+$/.test(row.tokenId ?? '')
  );
  const auctions = auctionRows.length
    ? await prisma.auctionAuction.findMany({
        where: {
          deploymentId,
          daoId: { in: [...new Set(auctionRows.map((row) => row.daoId!))] },
          tokenId: { in: [...new Set(auctionRows.map((row) => BigInt(row.tokenId!)))] }
        },
        select: { daoId: true, tokenId: true, paymentToken: true }
      })
    : [];
  const byAuction = new Map(auctions.map((row) => [`${row.daoId}:${row.tokenId}`, row.paymentToken]));
  return rows.map((row) => {
    if (row.contractRole === 'auction') return byAuction.get(`${row.daoId}:${row.tokenId}`) ?? null;
    try {
      const args = JSON.parse(row.args) as { payment_asset?: unknown };
      return typeof args?.payment_asset === 'string' ? args.payment_asset : null;
    } catch {
      return null;
    }
  });
}

function mapProposalList(row: AppProposalList) {
  return {
    proposal_id: row.proposalId,
    proposal_number: row.proposalNumber,
    proposer: row.proposer,
    description: row.description,
    snapshot_ledger: row.snapshotLedger === null ? null : Number(row.snapshotLedger),
    // From ProposalScheduled: unix seconds (the snapshot is a ledger).
    vote_start_timestamp: row.voteStartSeconds === null ? null : Number(row.voteStartSeconds),
    vote_end_timestamp: row.voteEndSeconds === null ? null : Number(row.voteEndSeconds),
    // Fixed at proposal time from the voting supply at the snapshot.
    quorum_votes: row.quorumVotes === null ? null : row.quorumVotes.toFixed(0),
    eta: row.etaSeconds === null ? null : Number(row.etaSeconds),
    state: row.state,
    for_votes: row.forVotes.toString(),
    against_votes: row.againstVotes.toString(),
    abstain_votes: row.abstainVotes.toString(),
    created_timestamp: row.createdAt?.getTime() ? Math.floor(row.createdAt.getTime() / 1000) : null,
    created_ledger: Number(row.createdLedger),
    updated_ledger: row.updatedLedger === null ? null : Number(row.updatedLedger),
    updated_timestamp: row.updatedAt?.getTime() ? Math.floor(row.updatedAt.getTime() / 1000) : null
  };
}

function mapProposalDetail(row: AppProposalDetail) {
  const actions = Array.isArray(row.actions) ? row.actions : [];
  return {
    ...mapProposalList(row),
    vote_summary: {
      for: row.forVotes.toString(),
      against: row.againstVotes.toString(),
      abstain: row.abstainVotes.toString()
    },
    actions
  };
}

/**
 * Get the dao_id (token contract address) for a given daoId URL parameter.
 *
 * dao_id is the PRIMARY KEY for multi-tenancy - it's the token contract address
 * that uniquely identifies each DAO within this manager deployment.
 *
 * @param daoId - URL format like "testnet/builder" or "builder"
 * @returns Token contract address (e.g., "CBGLIC3VDPNSXRQTHIHADJVL3WVM54ZIO7FV23SDC3DQTTDLO2NMYUK7")
 */
async function getDaoIdFromUrl(daoId: string): Promise<string> {
  // Import here to avoid circular dependency
  const { getDaoNetworkConfigById } = require('@/lib/dao-config');

  const config = await getDaoNetworkConfigById(daoId);

  // dao_id in the database is the token contract address
  return config.tokenContractId;
}

export async function getGoldskyAuctionHistory(daoId: string, limit = 24, offset = 0) {
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const rows = await prisma.auctionAuction.findMany({
    where: { deploymentId, daoId: daoIdFromUrl, settled: true },
    orderBy: { tokenId: 'desc' },
    take: limit,
    skip: offset
  });

  return rows.map((row) => ({
    event_id: row.eventId,
    token_id: Number(row.tokenId),
    start_seconds: Number(row.startSeconds),
    end_seconds: Number(row.endSeconds),
    duration_seconds: row.durationSeconds === null ? null : Number(row.durationSeconds),
    reserve_price: row.reservePrice.toString(),
    payment_token: row.paymentToken,
    settled: row.settled,
    cancelled: row.cancelled,
    created_ledger: Number(row.createdLedger),
    transaction_hash: row.transactionHash
  }));
}

export async function getGoldskyAuctionBids(daoId: string, tokenId: string, limit = 20) {
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const rows = await prisma.auctionBid.findMany({
    where: { deploymentId, daoId: daoIdFromUrl, tokenId: BigInt(tokenId) },
    orderBy: [{ eventLedger: 'desc' }, { eventId: 'desc' }],
    take: limit
  });

  return rows.map((row) => ({
    event_id: row.eventId,
    bidder: row.bidder,
    amount: row.amount.toString(),
    payment_type: null,
    ledger_sequence: Number(row.eventLedger),
    timestamp: row.eventAt,
    transaction_hash: row.transactionHash,
    comment: row.comment
  }));
}

/**
 * Activity Feed
 *
 * Returns recent activity across all contracts (governance, token, auction, treasury)
 */
export async function getGoldskyActivityFeed(
  daoId: string,
  params: {
    limit?: number;
    offset?: number;
    contractId?: string;
    contractRole?: string;
    actor?: string;
    kind?: string;
    /** 'public' (default) hides admin/system rows such as launch handoffs and seed events. */
    visibility?: 'public' | 'all';
  } = {}
) {
  const { limit = 25, offset = 0, contractId, contractRole, actor, kind, visibility = 'public' } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const where = {
    deploymentId,
    daoId: daoIdFromUrl,
    ...(contractId ? { contractId } : {}),
    ...(contractRole ? { contractRole } : {}),
    ...(actor ? { actor } : {}),
    ...(visibility === 'all' ? {} : PUBLIC_FEED_FILTER),
    ...(kind
      ? {
          kind: {
            in: kind
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          }
        }
      : {})
  };
  const [rows, total] = await Promise.all([
    prisma.appActivityFeed.findMany({
      where,
      orderBy: FEED_ORDER,
      take: limit,
      skip: offset
    }),
    prisma.appActivityFeed.count({ where })
  ]);
  const paymentAssets = await feedPaymentAssets(deploymentId, rows);

  return {
    items: rows.map((row, index) => ({
      payment_asset: paymentAssets[index],
      activity_id: row.activityId,
      contract_id: row.contractId,
      contract_role: row.contractRole,
      event_name: row.eventName,
      topics: row.topics,
      args: row.args,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      proposal_id: row.proposalId,
      token_id: row.tokenId,
      amount: row.amount,
      actor: row.actor,
      addresses: row.addresses,
      ledger_sequence: Number(row.ledgerSequence),
      transaction_hash: row.transactionHash,
      timestamp: row.ledgerClosedAt
    })),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Proposal List
 *
 * Returns all proposals with their current status and vote tallies
 */
export async function getGoldskyProposalList(
  daoId: string,
  params: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {}
) {
  const { limit = 50, offset = 0, status } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const where = { deploymentId, daoId: daoIdFromUrl, ...(status ? { state: status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.appProposalList.findMany({
      where,
      orderBy: { proposalNumber: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.appProposalList.count({ where })
  ]);

  return {
    items: rows.map(mapProposalList),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Proposal Detail
 *
 * Returns detailed information about a specific proposal
 */
export async function getGoldskyProposalDetail(daoId: string, proposalId: string) {
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const numericProposalNumber = Number(proposalId);
  const row = await prisma.appProposalDetail.findFirst({
    where: {
      deploymentId,
      daoId: daoIdFromUrl,
      OR: [
        { proposalId },
        ...(Number.isInteger(numericProposalNumber) ? [{ proposalNumber: numericProposalNumber }] : [])
      ]
    }
  });

  if (!row) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  return {
    proposal: mapProposalDetail(row),
    generatedAt: new Date().toISOString()
  };
}

/**
 * Proposal Votes
 *
 * Returns all votes cast on a specific proposal
 */
export async function getGoldskyProposalVotes(
  daoId: string,
  params: {
    proposalId: string;
    limit?: number;
    offset?: number;
    support?: number;
  }
) {
  const { proposalId, limit = 100, offset = 0, support } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const resolvedProposalId = await resolveProposalId(deploymentId, daoIdFromUrl, proposalId);

  if (!resolvedProposalId) {
    return {
      items: [],
      total: 0,
      tally: { for: '0', against: '0', abstain: '0' },
      limit,
      offset,
      hasMore: false,
      generatedAt: new Date().toISOString()
    };
  }

  const where = {
    deploymentId,
    daoId: daoIdFromUrl,
    proposalId: resolvedProposalId,
    ...(support === undefined ? {} : { support })
  };
  const [rows, total, tallyRows] = await Promise.all([
    prisma.governanceProposalVote.findMany({
      where,
      orderBy: [
        { eventLedger: 'desc' },
        { transactionIndex: 'desc' },
        { operationIndex: 'desc' },
        { eventIndex: 'desc' }
      ],
      take: limit,
      skip: offset
    }),
    prisma.governanceProposalVote.count({ where }),
    prisma.governanceProposalVote.findMany({
      where: { deploymentId, daoId: daoIdFromUrl, proposalId: resolvedProposalId },
      select: { support: true, weight: true }
    })
  ]);

  const tally = {
    for: '0',
    against: '0',
    abstain: '0'
  };

  tallyRows.forEach((row) => {
    const key = row.support === 1 ? 'for' : row.support === 0 ? 'against' : row.support === 2 ? 'abstain' : null;
    if (key) tally[key] = (BigInt(tally[key]) + BigInt(row.weight.toString())).toString();
  });

  return {
    items: rows.map((row) => ({
      id: row.voteEventId,
      proposalId: row.proposalId,
      contractId: row.contractId,
      voter: row.voter,
      support: row.support,
      weight: row.weight.toString(),
      reason: row.reason,
      timestamp: row.eventAt?.getTime() ? Math.floor(row.eventAt.getTime() / 1000) : null,
      txHash: row.transactionHash,
      ledger: Number(row.eventLedger)
    })),
    total,
    tally,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

/** A proposal's id from its id or its number in this DAO. */
async function resolveProposalId(deploymentId: string, daoId: string, proposalId: string) {
  const numericProposalNumber = Number(proposalId);
  const proposal = await prisma.appProposalList.findFirst({
    where: {
      deploymentId,
      daoId,
      OR: [
        { proposalId },
        ...(Number.isInteger(numericProposalNumber) ? [{ proposalNumber: numericProposalNumber }] : [])
      ]
    },
    select: { proposalId: true }
  });
  return proposal?.proposalId;
}

function commentTimestamp(eventAt: Date | null) {
  return eventAt?.getTime() ? Math.floor(eventAt.getTime() / 1000) : null;
}

/**
 * Proposal Comments
 *
 * Event-only comments on a proposal, oldest first (a conversation reads top to bottom).
 */
export async function getGoldskyProposalComments(
  daoId: string,
  params: { proposalId: string; limit?: number; offset?: number }
) {
  const { proposalId, limit = 100, offset = 0 } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const resolvedProposalId = await resolveProposalId(deploymentId, daoIdFromUrl, proposalId);
  if (!resolvedProposalId) {
    return { items: [], total: 0, limit, offset, hasMore: false, generatedAt: new Date().toISOString() };
  }

  const where = { deploymentId, daoId: daoIdFromUrl, proposalId: resolvedProposalId };
  const [rows, total] = await Promise.all([
    prisma.governanceProposalComment.findMany({
      where,
      orderBy: [{ eventLedger: 'asc' }, { transactionIndex: 'asc' }, { eventIndex: 'asc' }],
      take: limit,
      skip: offset
    }),
    prisma.governanceProposalComment.count({ where })
  ]);

  return {
    items: rows.map((row) => ({
      id: row.commentEventId,
      author: row.author,
      body: row.body,
      timestamp: commentTimestamp(row.eventAt),
      txHash: row.transactionHash
    })),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Mint Authorities
 *
 * Returns all addresses with mint authority
 */
export async function getGoldskyMintAuthorities(daoId: string) {
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const rows = await prisma.tokenMintAuthority.findMany({
    where: { deploymentId, daoId: daoIdFromUrl, enabled: true },
    orderBy: { authority: 'asc' }
  });

  return {
    items: rows.map((row) => ({
      authority: row.authority,
      enabled: row.enabled,
      last_updated_ledger: Number(row.eventLedger)
    })),
    total: rows.length,
    generatedAt: new Date().toISOString()
  };
}

export async function getDashboardData(address: string, params: { limit?: number; offset?: number } = {}) {
  const { limit = 20, offset = 0 } = params;
  const deploymentId = getDeploymentId();
  const normalizedAddress = address.trim().toLowerCase();
  const members = await prisma.tokenMember.findMany({
    where: { deploymentId, address: { equals: normalizedAddress, mode: 'insensitive' } },
    select: { daoId: true, ownedTokenCount: true, votingPower: true }
  });
  const memberDaoIds = members.filter((row) => row.ownedTokenCount > 0 || row.votingPower > 0).map((row) => row.daoId);
  const ownedOrAdminWhere = {
    deploymentId,
    status: 'operational',
    OR: [
      ...(memberDaoIds.length ? [{ daoId: { in: memberDaoIds } }] : []),
      { deployer: { equals: normalizedAddress, mode: 'insensitive' as const } },
      { launchAdmin: { equals: normalizedAddress, mode: 'insensitive' as const } },
      { adminAddress: { equals: normalizedAddress, mode: 'insensitive' as const } }
    ]
  };
  const [myDaos, myDaoCandidates] = await Promise.all([
    prisma.managerDao.findMany({ where: ownedOrAdminWhere, orderBy: { createdLedger: 'desc' } }),
    prisma.managerDao.findMany({
      where: {
        deploymentId,
        OR: [
          ...(memberDaoIds.length ? [{ daoId: { in: memberDaoIds } }] : []),
          { deployer: { equals: normalizedAddress, mode: 'insensitive' as const } },
          { launchAdmin: { equals: normalizedAddress, mode: 'insensitive' as const } },
          { adminAddress: { equals: normalizedAddress, mode: 'insensitive' as const } }
        ]
      },
      select: { daoId: true, tokenName: true, tokenSymbol: true }
    })
  ]);
  const daoIds = myDaoCandidates.map((row) => row.daoId);
  const [feedRows, total] = await Promise.all([
    prisma.appActivityFeed.findMany({
      where: { deploymentId, daoId: { in: daoIds }, ...PUBLIC_FEED_FILTER },
      orderBy: FEED_ORDER,
      take: limit,
      skip: offset
    }),
    prisma.appActivityFeed.count({
      where: { deploymentId, daoId: { in: daoIds }, ...PUBLIC_FEED_FILTER }
    })
  ]);
  const daoById = new Map(myDaoCandidates.map((row) => [row.daoId, row]));
  const paymentAssets = await feedPaymentAssets(deploymentId, feedRows);
  // The image and description come from the verified community profile.
  const profiles = await verifyRows(getDeploymentNetwork(), myDaos);

  return {
    myDaos: myDaos.map((row) => ({
      dao_id: row.daoId,
      // Only a claimed slug is unique; pending DAOs link by address.
      slug: row.slugClaimed ? row.claimedSlug : null,
      token_name: row.tokenName,
      token_symbol: row.tokenSymbol,
      description: profiles.get(row.daoId)?.profile.description ?? '',
      image: profiles.get(row.daoId)?.profile.image ?? '',
      status: row.status
    })),
    feed: {
      items: feedRows.map((row, index) => ({
        activity_id: row.activityId,
        payment_asset: paymentAssets[index],
        dao_id: row.daoId,
        contract_role: row.contractRole,
        event_name: row.eventName,
        topics: row.topics,
        args: row.args,
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        proposal_id: row.proposalId,
        token_id: row.tokenId,
        amount: row.amount,
        actor: row.actor,
        ledger_sequence: Number(row.ledgerSequence),
        timestamp: row.ledgerClosedAt,
        transaction_hash: row.transactionHash,
        token_name: daoById.get(row.daoId ?? '')?.tokenName ?? null,
        token_symbol: daoById.get(row.daoId ?? '')?.tokenSymbol ?? null
      })),
      total,
      limit,
      offset,
      hasMore: offset + feedRows.length < total
    },
    generatedAt: new Date().toISOString()
  };
}

/**
 * Minter Claims
 *
 * Returns all successful claims for a token (claims are merkle-only)
 */
export async function getGoldskyMinterClaims(
  daoId: string,
  params: {
    limit?: number;
    offset?: number;
    recipient?: string;
  } = {}
) {
  const { limit = 100, offset = 0, recipient } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);

  const where = {
    deploymentId,
    daoId: daoIdFromUrl,
    contractRole: 'minter',
    kind: 'minter.merkle_claim',
    ...(recipient ? { actor: { equals: recipient, mode: 'insensitive' as const } } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.appActivityFeed.findMany({
      where,
      orderBy: FEED_ORDER,
      take: limit,
      skip: offset
    }),
    prisma.appActivityFeed.count({ where })
  ]);

  return {
    items: rows.map((row) => ({
      claim_id: row.activityId,
      recipient: row.actor,
      amount: row.amount,
      claim_type: 'merkle',
      transaction_hash: row.transactionHash,
      ledger_sequence: Number(row.ledgerSequence),
      timestamp: row.ledgerClosedAt
    })),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Health Check
 *
 * Verifies database connectivity and returns latest indexed ledger
 */
export async function getGoldskyHealth() {
  try {
    const status = await prisma.appIndexerStatus.findFirst({ where: { deploymentId: getDeploymentId() } });

    return {
      status: 'healthy',
      latestLedger: status ? Number(status.latestLedger) : null,
      totalEvents: status ? Number(status.eventCount) : 0,
      lastIngestion: status?.lastIngestedAt ?? null,
      generatedAt: new Date().toISOString()
    };
  } catch {
    return {
      status: 'unhealthy',
      generatedAt: new Date().toISOString()
    };
  }
}
