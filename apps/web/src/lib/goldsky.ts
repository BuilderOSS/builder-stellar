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

import type { AppProposalDetail, AppProposalList, TokenMember } from '@prisma/client';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
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
    votes: Array.isArray(row.votes) ? row.votes : [],
    actions
  };
}

function mapMember(row: TokenMember) {
  return {
    address: row.address,
    owned_token_count: Number(row.ownedTokenCount),
    delegated_to: row.delegatedTo,
    voting_power: Number(row.votingPower),
    last_activity_ledger: row.lastActivityLedger === null ? null : Number(row.lastActivityLedger)
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
    time_buffer_seconds: row.timeBufferSeconds === null ? null : Number(row.timeBufferSeconds),
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
    transaction_hash: row.transactionHash
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
    ...(visibility === 'all' ? {} : { visibility: { in: PUBLIC_VISIBILITY } }),
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
      orderBy: [{ ledgerSequence: 'desc' }, { activityId: 'desc' }],
      take: limit,
      skip: offset
    }),
    prisma.appActivityFeed.count({ where })
  ]);

  return {
    items: rows.map((row) => ({
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
  const numericProposalNumber = Number(proposalId);
  const proposal = await prisma.appProposalDetail.findFirst({
    where: {
      deploymentId,
      daoId: daoIdFromUrl,
      OR: [
        { proposalId },
        ...(Number.isInteger(numericProposalNumber) ? [{ proposalNumber: numericProposalNumber }] : [])
      ]
    },
    select: { proposalId: true }
  });
  const resolvedProposalId = proposal?.proposalId;

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
      orderBy: { eventLedger: 'desc' },
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

/**
 * Token Inventory
 *
 * Returns all token holders and their delegations
 */
export async function getGoldskyTokenInventory(
  daoId: string,
  params: {
    limit?: number;
    offset?: number;
  } = {}
) {
  const { limit = 100, offset = 0 } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const where = { deploymentId, daoId: daoIdFromUrl };
  const [rows, total, supply] = await Promise.all([
    prisma.tokenInventory.findMany({ where, orderBy: { tokenId: 'desc' }, take: limit, skip: offset }),
    prisma.tokenInventory.count({ where }),
    prisma.tokenSupply.findFirst({ where })
  ]);

  return {
    items: rows.map((row) => ({
      tokenId: Number(row.tokenId),
      owner: row.owner,
      ledger: Number(row.eventLedger),
      timestamp: row.eventAt ? Math.floor(row.eventAt.getTime() / 1000) : 0,
      txHash: row.transactionHash,
      contractId: row.contractId
    })),
    total,
    totalSupply: String(total),
    // Tokens held by the Treasury, Auction and Marketplace carry no votes.
    votingSupply: supply ? supply.votingSupply.toString() : null,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

export async function getGoldskyMemberList(daoId: string, params: { limit?: number; offset?: number } = {}) {
  const { limit = 100, offset = 0 } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const where = { deploymentId, daoId: daoIdFromUrl };
  const [rows, total] = await Promise.all([
    prisma.tokenMember.findMany({
      where,
      orderBy: [{ votingPower: 'desc' }, { address: 'asc' }],
      take: limit,
      skip: offset
    }),
    prisma.tokenMember.count({ where })
  ]);

  return {
    items: rows.map(mapMember),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

export async function getGoldskyMember(daoId: string, address: string) {
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const row = await prisma.tokenMember.findFirst({ where: { deploymentId, daoId: daoIdFromUrl, address } });
  return row ? mapMember(row) : null;
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

/**
 * Proposal Lifecycle
 *
 * Returns the complete event history for a proposal
 */
export async function getGoldskyProposalLifecycle(daoId: string, proposalId: string) {
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const rows = await prisma.governanceProposalLifecycle.findMany({
    where: { deploymentId, daoId: daoIdFromUrl, proposalId },
    orderBy: [
      { eventLedger: 'asc' },
      { transactionIndex: 'asc' },
      { operationIndex: 'asc' },
      { eventIndex: 'asc' },
      { lifecycleEventId: 'asc' }
    ]
  });

  return {
    items: rows.map((row) => ({
      event_type: row.state,
      actor: null,
      timestamp: row.eventAt,
      transaction_hash: row.transactionHash,
      ledger_sequence: Number(row.eventLedger)
    })),
    total: rows.length,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Get All DAOs
 *
 * Returns all DAOs managed by this deployment (manager contract)
 * Used for the DAO directory/landing page
 */
export async function getGoldskyDaoList() {
  const deploymentId = getDeploymentId();
  const rows = await prisma.managerDao.findMany({
    where: { deploymentId },
    orderBy: { createdLedger: 'desc' }
  });

  return {
    items: rows.map((row) => ({
      dao_id: row.daoId,
      token_address: row.tokenAddress,
      creator: row.deployer,
      manager_contract: row.managerContract,
      governor_contract: row.governorContract,
      auction_contract: row.auctionContract,
      treasury_contract: row.treasuryContract,
      metadata_contract: row.metadataContract,
      created_timestamp: row.createdAt,
      created_ledger: Number(row.createdLedger)
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
      where: { deploymentId, daoId: { in: daoIds }, visibility: { in: PUBLIC_VISIBILITY } },
      orderBy: [{ ledgerSequence: 'desc' }, { activityId: 'desc' }],
      take: limit,
      skip: offset
    }),
    prisma.appActivityFeed.count({
      where: { deploymentId, daoId: { in: daoIds }, visibility: { in: PUBLIC_VISIBILITY } }
    })
  ]);
  const daoById = new Map(myDaoCandidates.map((row) => [row.daoId, row]));

  return {
    myDaos: myDaos.map((row) => ({
      dao_id: row.daoId,
      token_name: row.tokenName,
      token_symbol: row.tokenSymbol,
      token_description: row.tokenDescription,
      status: row.status
    })),
    feed: {
      items: feedRows.map((row) => ({
        activity_id: row.activityId,
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
 * Minting History
 *
 * Returns all minting operations for a token
 */
export async function getGoldskyMintingHistory(
  daoId: string,
  params: {
    limit?: number;
    offset?: number;
    kind?: 'batch_mint' | 'merkle_claim' | 'allowlist_claim';
  } = {}
) {
  const { limit = 50, offset = 0, kind } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const where = {
    deploymentId,
    daoId: daoIdFromUrl,
    contractRole: 'minter',
    ...(kind ? { kind: `minter.${kind}` } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.appActivityFeed.findMany({
      where,
      orderBy: { ledgerSequence: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.appActivityFeed.count({ where })
  ]);

  return {
    items: rows.map((row) => ({
      activity_id: row.activityId,
      event_name: row.eventName,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      actor: row.actor,
      amount: row.amount,
      ledger_sequence: Number(row.ledgerSequence),
      timestamp: row.ledgerClosedAt,
      transaction_hash: row.transactionHash
    })),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Minter Claims
 *
 * Returns all successful claims (merkle and allowlist) for a token
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
    kind: { in: ['minter.merkle_claim', 'minter.allowlist_claim'] },
    ...(recipient ? { actor: { equals: recipient, mode: 'insensitive' as const } } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.appActivityFeed.findMany({
      where,
      orderBy: { ledgerSequence: 'desc' },
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
      claim_type: row.kind === 'minter.merkle_claim' ? 'merkle' : 'allowlist',
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
