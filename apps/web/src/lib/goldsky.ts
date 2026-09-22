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

import { Pool } from '@neondatabase/serverless';

// Initialize connection pool with read-only app_server role
const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL
});

/**
 * Get the deployment_id for this app instance.
 *
 * deployment_id is CONSTANT per app instance and represents the manager contract
 * that manages multiple DAOs. Format: "manager:CONTRACT_ADDRESS"
 *
 * Example: "manager:CBSKIHNNVKEJWV3A2OI63BWUC637LR4P2GBV4MPJB5PDOMVUMS6KOMAH"
 *
 * This is set by the Goldsky pipeline and must match what's in the database.
 * All DAOs under this manager share the same deployment_id.
 */
function getDeploymentId(): string {
  const deploymentId = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;

  if (!deploymentId) {
    throw new Error(
      'NEXT_PUBLIC_DEPLOYMENT_ID environment variable is required. ' +
        'Format: "manager:CONTRACT_ADDRESS" (e.g., "manager:CBSKIHNNVKEJWV3A2OI63BWUC637LR4P2GBV4MPJB5PDOMVUMS6KOMAH")'
    );
  }

  return deploymentId;
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
function getDaoIdFromUrl(daoId: string): string {
  // Import here to avoid circular dependency
  const { getDaoNetworkConfigById } = require('@/lib/dao-config');

  const config = getDaoNetworkConfigById(daoId);

  // dao_id in the database is the token contract address
  return config.tokenContractId;
}

export async function getGoldskyAuctionHistory(daoId: string, limit = 24, offset = 0) {
  const deploymentId = getDeploymentId();
  const dao_id = getDaoIdFromUrl(daoId);
  const result = await pool.query(
    `
    SELECT * FROM auction.auctions
    WHERE deployment_id = $1 AND dao_id = $2 AND settled = true
    ORDER BY token_id DESC
    LIMIT $3 OFFSET $4
  `,
    [deploymentId, dao_id, limit, offset]
  );
  return result.rows;
}

export async function getGoldskyAuctionBids(daoId: string, tokenId: string, limit = 20) {
  const deploymentId = getDeploymentId();
  const dao_id = getDaoIdFromUrl(daoId);
  const result = await pool.query(
    `
     SELECT
       event_id,
       bidder,
       amount,
       NULL::text AS payment_type,
       event_ledger AS ledger_sequence,
       event_at AS timestamp,
       transaction_hash
    FROM auction.bids
    WHERE deployment_id = $1 AND dao_id = $2 AND token_id = $3
    ORDER BY ledger_sequence DESC, event_id DESC
    LIMIT $4
  `,
    [deploymentId, dao_id, tokenId, limit]
  );
  return result.rows;
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
    kind?: string;
  } = {}
) {
  const { limit = 25, offset = 0, contractId, kind } = params;
  const deploymentId = getDeploymentId();
  const dao_id = getDaoIdFromUrl(daoId);

  const conditions: string[] = ['deployment_id = $1', 'dao_id = $2'];
  const values: any[] = [deploymentId, dao_id];
  let paramIndex = 3;

  if (contractId) {
    conditions.push(`contract_id = $${paramIndex++}`);
    values.push(contractId);
  }

  if (kind) {
    conditions.push(`kind = $${paramIndex++}`);
    values.push(kind);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const query = `
    SELECT
      activity_id,
      contract_id,
      contract_role,
      kind,
      title,
      summary,
      proposal_id,
      actor,
      addresses,
      ledger_sequence,
      transaction_hash,
      ledger_closed_at
    FROM app.activity_feed
    ${whereClause}
    ORDER BY ledger_sequence DESC, activity_id DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  values.push(limit, offset);

  const [result, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM app.activity_feed ${whereClause}`,
      values.slice(0, values.length - 2)
    )
  ]);
  const total = countResult.rows[0]?.total ?? 0;

  return {
    items: result.rows,
    total,
    limit,
    offset,
    hasMore: offset + result.rows.length < total,
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
  const dao_id = getDaoIdFromUrl(daoId);

  const conditions: string[] = ['deployment_id = $1', 'dao_id = $2'];
  const values: any[] = [deploymentId, dao_id];
  let paramIndex = 3;

  if (status) {
    conditions.push(`state = $${paramIndex++}`);
    values.push(status);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const query = `
    SELECT
      proposal_id,
      proposal_number,
      proposer,
      description,
      snapshot_ledger,
       vote_start_seconds AS vote_start_timestamp,
       vote_end_seconds AS deadline_ledger,
       eta_seconds AS eta,
      state,
      for_votes,
      against_votes,
      abstain_votes,
       extract(epoch FROM created_at)::bigint AS created_timestamp,
      created_ledger,
      updated_ledger,
       extract(epoch FROM updated_at)::bigint AS updated_timestamp
    FROM app.proposal_list
    ${whereClause}
    ORDER BY proposal_number DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  values.push(limit, offset);

  const [result, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM app.proposal_list ${whereClause}`,
      values.slice(0, values.length - 2)
    )
  ]);

  return {
    items: result.rows,
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
    hasMore: offset + result.rows.length < (countResult.rows[0]?.total ?? 0),
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
  const dao_id = getDaoIdFromUrl(daoId);
  const query = `
    SELECT
      proposal_id,
      proposal_number,
       proposer,
       description,
       snapshot_ledger,
       vote_start_seconds AS vote_start_timestamp,
       vote_end_seconds AS deadline_ledger,
       eta_seconds AS eta,
       state,
        jsonb_build_object(
          'for', for_votes,
          'against', against_votes,
          'abstain', abstain_votes
        ) AS vote_summary,
       votes,
       actions,
       extract(epoch FROM created_at)::bigint AS created_timestamp,
       created_ledger,
       updated_ledger,
       extract(epoch FROM updated_at)::bigint AS updated_timestamp
    FROM app.proposal_detail
    WHERE deployment_id = $1 AND dao_id = $2 AND (proposal_id = $3 OR proposal_number::text = $3)
  `;

  const result = await pool.query(query, [deploymentId, dao_id, proposalId]);

  if (result.rows.length === 0) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  return {
    proposal: result.rows[0],
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
  const dao_id = getDaoIdFromUrl(daoId);

  const conditions = ['deployment_id = $1', 'dao_id = $2', 'proposal_id = $3'];
  const values: any[] = [deploymentId, dao_id, proposalId];
  let paramIndex = 4;

  if (support !== undefined) {
    conditions.push(`support = $${paramIndex++}`);
    values.push(support);
  }

  const query = `
    SELECT
      voter,
      support,
      weight,
      reason,
      event_at AS timestamp,
      transaction_hash,
      event_ledger AS ledger_sequence
    FROM governance.proposal_votes
    WHERE ${conditions.join(' AND ')}
    ORDER BY ledger_sequence DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  values.push(limit, offset);

  const [result, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM governance.proposal_votes WHERE ${conditions.join(' AND ')}`,
      values.slice(0, values.length - 2)
    )
  ]);

  // Get vote tallies
  const tallyQuery = `
    SELECT
      support,
      COUNT(*) as vote_count,
      SUM(weight::numeric) as total_weight
    FROM governance.proposal_votes
    WHERE deployment_id = $1 AND dao_id = $2 AND proposal_id = $3
    GROUP BY support
  `;

  const tallyResult = await pool.query(tallyQuery, [deploymentId, dao_id, proposalId]);

  const tally = {
    for: '0',
    against: '0',
    abstain: '0'
  };

  tallyResult.rows.forEach((row: any) => {
    if (row.support === 1) tally.for = row.total_weight || '0';
    if (row.support === 0) tally.against = row.total_weight || '0';
    if (row.support === 2) tally.abstain = row.total_weight || '0';
  });

  return {
    items: result.rows,
    total: countResult.rows[0]?.total ?? 0,
    tally,
    limit,
    offset,
    hasMore: offset + result.rows.length < (countResult.rows[0]?.total ?? 0),
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
  const dao_id = getDaoIdFromUrl(daoId);

  const query = `
    SELECT
      token_id,
      owner,
       event_ledger AS ledger_sequence,
       event_at AS timestamp,
      transaction_hash
    FROM token.inventory
    WHERE deployment_id = $1 AND dao_id = $2
    ORDER BY token_id DESC
    LIMIT $3 OFFSET $4
  `;

  const [result, countResult, supplyResult] = await Promise.all([
    pool.query(query, [deploymentId, dao_id, limit, offset]),
    pool.query('SELECT COUNT(*)::int AS total FROM token.inventory WHERE deployment_id = $1 AND dao_id = $2', [
      deploymentId,
      dao_id
    ]),
    pool.query(
      'SELECT COUNT(*)::bigint as total_supply FROM token.inventory WHERE deployment_id = $1 AND dao_id = $2',
      [deploymentId, dao_id]
    )
  ]);

  // Get total supply
  const totalSupply = supplyResult.rows[0]?.total_supply || '0';
  const total = countResult.rows[0]?.total ?? 0;

  return {
    items: result.rows.map((row: any) => ({
      tokenId: Number(row.token_id),
      owner: row.owner,
      ledger: Number(row.ledger_sequence),
      timestamp: row.timestamp ? Math.floor(new Date(row.timestamp).getTime() / 1000) : 0,
      txHash: row.transaction_hash,
      contractId: row.deployment_id
    })),
    total,
    totalSupply,
    limit,
    offset,
    hasMore: offset + result.rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

export async function getGoldskyMemberList(daoId: string, params: { limit?: number; offset?: number } = {}) {
  const { limit = 100, offset = 0 } = params;
  const deploymentId = getDeploymentId();
  const dao_id = getDaoIdFromUrl(daoId);
  const [result, countResult] = await Promise.all([
    pool.query(
      `
      SELECT address, owned_token_count, delegated_to, voting_power, last_activity_ledger
      FROM token.members
      WHERE deployment_id = $1 AND dao_id = $2
      ORDER BY voting_power DESC, address
      LIMIT $3 OFFSET $4
    `,
      [deploymentId, dao_id, limit, offset]
    ),
    pool.query('SELECT COUNT(*)::int AS total FROM token.members WHERE deployment_id = $1 AND dao_id = $2', [
      deploymentId,
      dao_id
    ])
  ]);
  const total = countResult.rows[0]?.total ?? 0;

  return {
    items: result.rows,
    total,
    limit,
    offset,
    hasMore: offset + result.rows.length < total,
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
  const dao_id = getDaoIdFromUrl(daoId);
  const query = `
    SELECT
      authority,
      enabled,
       event_ledger AS last_updated_ledger
    FROM token.mint_authorities
    WHERE deployment_id = $1 AND dao_id = $2 AND enabled = true
    ORDER BY authority
  `;

  const result = await pool.query(query, [deploymentId, dao_id]);

  return {
    items: result.rows,
    total: result.rowCount,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Governor Authorities
 *
 * Returns all addresses with governor authority
 */
export async function getGoldskyGovernorAuthorities(daoId: string) {
  const deploymentId = getDeploymentId();
  const dao_id = getDaoIdFromUrl(daoId);
  const query = `
    SELECT
      authority,
      enabled,
       event_ledger AS last_updated_ledger
    FROM governance.governor_authorities
    WHERE deployment_id = $1 AND dao_id = $2 AND enabled = true
    ORDER BY authority
  `;

  const result = await pool.query(query, [deploymentId, dao_id]);

  return {
    items: result.rows,
    total: result.rowCount,
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
  const dao_id = getDaoIdFromUrl(daoId);
  const query = `
    SELECT
      event_type,
      actor,
      timestamp,
      transaction_hash,
      ledger_sequence
    FROM governance.proposal_lifecycle
    WHERE deployment_id = $1 AND dao_id = $2 AND proposal_id = $3
    ORDER BY ledger_sequence ASC
  `;

  const result = await pool.query(query, [deploymentId, dao_id, proposalId]);

  return {
    items: result.rows,
    total: result.rowCount,
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

  const query = `
    SELECT
      dao_id,
      token_address,
      creator,
      manager_contract,
      governor_contract,
      auction_contract,
      treasury_contract,
      metadata_contract,
      created_timestamp,
      created_ledger
    FROM manager.daos
    WHERE deployment_id = $1
    ORDER BY created_ledger DESC
  `;

  const result = await pool.query(query, [deploymentId]);

  return {
    items: result.rows,
    total: result.rowCount,
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
    const query = `
      SELECT
        MAX(ledger_sequence) as latest_ledger,
        COUNT(*) as total_events,
        MAX(ingested_at) as last_ingestion
      FROM chain.raw_events
    `;

    const result = await pool.query(query);
    const stats = result.rows[0];

    return {
      status: 'healthy',
      latestLedger: stats.latest_ledger,
      totalEvents: stats.total_events,
      lastIngestion: stats.last_ingestion,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      generatedAt: new Date().toISOString()
    };
  }
}
