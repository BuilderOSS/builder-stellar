/**
 * DAO Configuration from Database
 *
 * Loads DAO-specific configuration from the Goldsky-indexed manager.daos table.
 * This is the source of truth for all deployed DAOs.
 *
 * Multi-tenant isolation:
 * - deployment_id = manager contract address (constant per app)
 * - dao_id = token contract address (unique identifier per DAO)
 */

import { Pool } from '@neondatabase/serverless';
import { getNetworkConfig, type NetworkName } from '@/config/networks';

const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL
});

/**
 * DAO Configuration from Database
 *
 * Represents a complete DAO record including contracts, token metadata,
 * and lifecycle state (pending/operational).
 */
export interface DaoConfig {
  // Multi-tenant keys
  deployment_id: string;
  dao_id: string;                           // Token contract address (primary DAO ID)

  // Core Identity
  token_address: string;                    // Same as dao_id
  creator: string | null;                   // Account that deployed this DAO

  // Network (derived from environment)
  network: NetworkName;

  // Contract Addresses
  manager_contract: string;
  token_contract: string;
  governor_contract: string;
  auction_contract: string | null;
  treasury_contract: string | null;
  metadata_contract: string | null;

  // Token Metadata (from DaoCreationParams)
  token_name: string | null;
  token_symbol: string | null;
  token_description: string | null;
  token_uri: string | null;

  // Admin & Configuration
  admin_address: string | null;             // launch_admin
  label: string;                            // Display name (may be empty)

  // Lifecycle State
  status: 'pending' | 'operational';        // DAO lifecycle status

  // Blockchain Timeline
  created_ledger: number;
  created_at: string | null;                // ISO timestamp
  created_tx_hash: string | null;

  finalized_ledger: number | null;          // If operational
  finalized_at: string | null;              // If operational
  finalized_tx_hash: string | null;         // If operational

  // Indexing
  indexed_at: string | null;                // When first indexed by Goldsky pipeline
}

/**
 * Get the network for this deployment
 * Determined by NEXT_PUBLIC_NETWORK env var
 */
function getDeploymentNetwork(): NetworkName {
  const network = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as NetworkName;

  // Validate it's a real network
  try {
    getNetworkConfig(network);
  } catch (e) {
    throw new Error(
      `Invalid NEXT_PUBLIC_NETWORK: ${network}. Must be one of: testnet, public, local`
    );
  }

  return network;
}

/**
 * Get DAO configuration by ID (token contract address)
 *
 * Queries the database for the actual deployed DAO state.
 * Returns complete DAO configuration including contracts, metadata, and status.
 *
 * @param daoId - Token contract address (same as dao_id in database)
 * @returns DAO configuration with all contracts, metadata, and lifecycle state
 * @throws Error if DAO not found or database unavailable
 */
export async function getDaoConfigFromDatabase(daoId: string): Promise<DaoConfig> {
  const deploymentId = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;

  if (!deploymentId) {
    throw new Error(
      'NEXT_PUBLIC_DEPLOYMENT_ID environment variable is required'
    );
  }

  // Determine network from environment
  const network = getDeploymentNetwork();

  // Query manager.daos table for complete DAO configuration
  const query = `
    SELECT
      deployment_id,
      dao_id,
      token_address,
      creator,
      manager_contract,
      token_contract,
      governor_contract,
      auction_contract,
      treasury_contract,
      metadata_contract,
      token_name,
      token_symbol,
      token_description,
      token_uri,
      admin_address,
      status,
      created_ledger,
      created_at,
      created_tx_hash,
      finalized_ledger,
      finalized_at,
      finalized_tx_hash,
      indexed_at
    FROM manager.daos
    WHERE deployment_id = $1 AND dao_id = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [deploymentId, daoId]);

  if (result.rows.length === 0) {
    throw new Error(`DAO not found: ${daoId}`);
  }

  const row = result.rows[0];

  return {
    deployment_id: row.deployment_id,
    dao_id: row.dao_id,
    token_address: row.token_address,
    creator: row.creator,
    network,
    manager_contract: row.manager_contract,
    token_contract: row.token_contract,
    governor_contract: row.governor_contract,
    auction_contract: row.auction_contract,
    treasury_contract: row.treasury_contract,
    metadata_contract: row.metadata_contract,
    token_name: row.token_name,
    token_symbol: row.token_symbol,
    token_description: row.token_description,
    token_uri: row.token_uri,
    admin_address: row.admin_address,
    label: '', // Not yet stored in database, can be added later
    status: row.status || 'pending',
    created_ledger: row.created_ledger,
    created_at: row.created_at,
    created_tx_hash: row.created_tx_hash,
    finalized_ledger: row.finalized_ledger,
    finalized_at: row.finalized_at,
    finalized_tx_hash: row.finalized_tx_hash,
    indexed_at: row.indexed_at
  };
}

/**
 * Get all DAOs in this deployment
 *
 * Returns all DAOs for directory listing, filtered by deployment.
 * Ordered by creation time (newest first).
 * Can optionally filter by status.
 *
 * @param status - Optional: filter by 'pending' or 'operational'
 * @returns Array of DAO configurations
 */
export async function getAllDaosFromDatabase(status?: 'pending' | 'operational'): Promise<DaoConfig[]> {
  const deploymentId = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;

  if (!deploymentId) {
    throw new Error(
      'NEXT_PUBLIC_DEPLOYMENT_ID environment variable is required'
    );
  }

  const network = getDeploymentNetwork();

  // Build query with optional status filter
  let query = `
    SELECT
      deployment_id,
      dao_id,
      token_address,
      creator,
      manager_contract,
      token_contract,
      governor_contract,
      auction_contract,
      treasury_contract,
      metadata_contract,
      token_name,
      token_symbol,
      token_description,
      token_uri,
      admin_address,
      status,
      created_ledger,
      created_at,
      created_tx_hash,
      finalized_ledger,
      finalized_at,
      finalized_tx_hash,
      indexed_at
    FROM manager.daos
    WHERE deployment_id = $1
  `;

  const params: any[] = [deploymentId];

  if (status) {
    query += ` AND status = $${params.length + 1}`;
    params.push(status);
  }

  query += ` ORDER BY created_ledger DESC`;

  const result = await pool.query(query, params);

  return result.rows.map((row) => ({
    deployment_id: row.deployment_id,
    dao_id: row.dao_id,
    token_address: row.token_address,
    creator: row.creator,
    network,
    manager_contract: row.manager_contract,
    token_contract: row.token_contract,
    governor_contract: row.governor_contract,
    auction_contract: row.auction_contract,
    treasury_contract: row.treasury_contract,
    metadata_contract: row.metadata_contract,
    token_name: row.token_name,
    token_symbol: row.token_symbol,
    token_description: row.token_description,
    token_uri: row.token_uri,
    admin_address: row.admin_address,
    label: '',
    status: row.status || 'pending',
    created_ledger: row.created_ledger,
    created_at: row.created_at,
    created_tx_hash: row.created_tx_hash,
    finalized_ledger: row.finalized_ledger,
    finalized_at: row.finalized_at,
    finalized_tx_hash: row.finalized_tx_hash,
    indexed_at: row.indexed_at
  }));
}
