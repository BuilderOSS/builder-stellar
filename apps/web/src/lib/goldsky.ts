/**
 * Goldsky Data Access Layer
 *
 * PostgreSQL-backed data queries for Stellar DAO using Goldsky indexer.
 * Direct database access for indexed DAO data.
 */

import { Pool } from '@neondatabase/serverless';

// Initialize connection pool with read-only app_server role
const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL
});

function getDeploymentId() {
  return `${process.env.NEXT_PUBLIC_DAO_LABEL || 'local'}-${process.env.NEXT_PUBLIC_DAO_NETWORK || 'local'}`;
}

export async function getGoldskyAuctionHistory(limit = 24, offset = 0) {
  const deploymentId = getDeploymentId();
  const result = await pool.query(
    `
    SELECT * FROM auction.auctions
    WHERE deployment_id = $1 AND settled = true
    ORDER BY token_id DESC
    LIMIT $2 OFFSET $3
  `,
    [deploymentId, limit, offset]
  );
  return result.rows;
}

export async function getGoldskyAuctionBids(tokenId: string, limit = 20) {
  const result = await pool.query(
    `
    SELECT event_id, bidder, amount, payment_type, ledger_sequence, timestamp, transaction_hash
    FROM auction.bids
    WHERE deployment_id = $1 AND token_id = $2
    ORDER BY ledger_sequence DESC, event_id DESC
    LIMIT $3
  `,
    [getDeploymentId(), tokenId, limit]
  );
  return result.rows;
}

/**
 * Activity Feed
 *
 * Returns recent activity across all contracts (governance, token, auction, treasury)
 */
export async function getGoldskyActivityFeed(
  params: {
    limit?: number;
    offset?: number;
    contractId?: string;
    kind?: string;
  } = {}
) {
  const { limit = 25, offset = 0, contractId, kind } = params;

  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (contractId) {
    conditions.push(`contract_id = $${paramIndex++}`);
    values.push(contractId);
  }

  if (kind) {
    conditions.push(`kind = $${paramIndex++}`);
    values.push(kind);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      activity_id,
      contract_id,
      contract_role,
      kind,
      title,
      summary,
      proposal_id,
      proposal_number,
      actor,
      addresses,
      ledger_sequence,
      timestamp,
      transaction_hash
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
  params: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {}
) {
  const { limit = 50, offset = 0, status } = params;

  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`state = $${paramIndex++}`);
    values.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      proposal_id,
      proposal_number,
      proposer,
      description,
      snapshot_ledger,
      vote_start_timestamp,
      deadline_ledger,
      eta,
      state,
      for_votes,
      against_votes,
      abstain_votes,
      created_timestamp,
      created_ledger,
      updated_ledger,
      updated_timestamp
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
export async function getGoldskyProposalDetail(proposalId: string) {
  const query = `
    SELECT
      proposal_id,
      proposal_number,
       proposer,
       description,
       snapshot_ledger,
       vote_start_timestamp,
       deadline_ledger,
       eta,
       state,
       vote_summary,
       votes,
       actions,
       created_timestamp,
       created_ledger,
       updated_ledger,
       updated_timestamp
    FROM app.proposal_detail
    WHERE proposal_id = $1 OR proposal_number::text = $1
  `;

  const result = await pool.query(query, [proposalId]);

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
export async function getGoldskyProposalVotes(params: {
  proposalId: string;
  limit?: number;
  offset?: number;
  support?: number;
}) {
  const { proposalId, limit = 100, offset = 0, support } = params;

  const conditions = ['proposal_id = $1'];
  const values: any[] = [proposalId];
  let paramIndex = 2;

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
      timestamp,
      transaction_hash,
      ledger_sequence
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
    WHERE proposal_id = $1
    GROUP BY support
  `;

  const tallyResult = await pool.query(tallyQuery, [proposalId]);

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
  params: {
    limit?: number;
    offset?: number;
  } = {}
) {
  const { limit = 100, offset = 0 } = params;

  const query = `
    SELECT
      token_id,
      owner,
      ledger_sequence,
      timestamp,
      transaction_hash
    FROM token.inventory
    WHERE deployment_id = $3
    ORDER BY token_id DESC
    LIMIT $1 OFFSET $2
  `;

  const [result, countResult, supplyResult] = await Promise.all([
    pool.query(query, [limit, offset, getDeploymentId()]),
    pool.query('SELECT COUNT(*)::int AS total FROM token.inventory WHERE deployment_id = $1', [getDeploymentId()]),
    pool.query('SELECT COUNT(*)::bigint as total_supply FROM token.inventory WHERE deployment_id = $1', [
      getDeploymentId()
    ])
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

export async function getGoldskyMemberList(params: { limit?: number; offset?: number } = {}) {
  const { limit = 100, offset = 0 } = params;
  const [result, countResult] = await Promise.all([
    pool.query(
      `
      SELECT address, owned_token_count, delegated_to, voting_power, last_activity_ledger
      FROM token.members
      WHERE deployment_id = $1
      ORDER BY voting_power DESC, address
      LIMIT $2 OFFSET $3
    `,
      [getDeploymentId(), limit, offset]
    ),
    pool.query('SELECT COUNT(*)::int AS total FROM token.members WHERE deployment_id = $1', [getDeploymentId()])
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
export async function getGoldskyMintAuthorities() {
  const query = `
    SELECT
      authority,
      enabled,
      ledger_sequence AS last_updated_ledger
    FROM token.mint_authorities
    WHERE enabled = true
    ORDER BY authority
  `;

  const result = await pool.query(query);

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
export async function getGoldskyGovernorAuthorities() {
  const query = `
    SELECT
      authority,
      enabled,
      ledger_sequence AS last_updated_ledger
    FROM governance.governor_authorities
    WHERE enabled = true
    ORDER BY authority
  `;

  const result = await pool.query(query);

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
export async function getGoldskyProposalLifecycle(proposalId: string) {
  const query = `
    SELECT
      event_type,
      actor,
      timestamp,
      transaction_hash,
      ledger_sequence
    FROM governance.proposal_lifecycle
    WHERE proposal_id = $1
    ORDER BY ledger_sequence ASC
  `;

  const result = await pool.query(query, [proposalId]);

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
