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

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getNetworkConfig, type NetworkName } from '@/config/networks';
import { prisma } from '@/lib/prisma';

/**
 * DAO Configuration from Database
 *
 * Represents a complete DAO record including contracts, token metadata,
 * and lifecycle state (pending/operational).
 */
export interface DaoConfig {
  // Multi-tenant keys
  deployment_id: string;
  dao_id: string; // Token contract address (primary DAO ID)

  // Core Identity
  token_address: string; // Same as dao_id
  /** The DAO's permanent URL slug once launched; null while it is only requested. */
  slug?: string | null;
  creator: string | null; // Account that deployed this DAO
  launch_admin: string | null;

  // Network (derived from environment)
  network: NetworkName;

  // Contract Addresses
  manager_contract: string;
  token_contract: string;
  governor_contract: string;
  auction_contract: string | null;
  marketplace_contract: string | null;
  treasury_contract: string | null;
  metadata_contract: string | null;
  contract_image: string | null;

  // Token Metadata (from DaoCreationParams)
  token_name: string | null;
  token_symbol: string | null;
  token_description: string | null;
  token_uri: string | null;

  // Admin & Configuration
  admin_address: string | null; // current admin: launch admin in setup, the Treasury after launch
  label: string; // Display name (may be empty)

  // Lifecycle State
  status: 'pending' | 'operational'; // DAO lifecycle status

  /**
   * Auction enabled state: Was auction EVER enabled?
   * - null: DAO still pending (hasn't launched yet)
   * - true: Enabled at launch OR re-enabled after being disabled (via unpause)
   * - false: Launched with auctions disabled, but can be reactivated later
   */
  auction_enabled: boolean | null;

  /**
   * Auction pause state: Is auction currently paused?
   * - null: DAO still pending (hasn't launched yet)
   * - true: Auction is paused or disabled (can be resumed if ever enabled)
   * - false: Auction is active and accepting bids
   */
  auction_paused: boolean | null;

  /**
   * Marketplace enabled state, mirrored from the launch configuration.
   * - null: DAO still pending, or not recorded by the indexer
   */
  marketplace_enabled: boolean | null;

  // Blockchain Timeline
  created_ledger: number;
  created_at: string | null; // ISO timestamp
  created_tx_hash: string | null;

  finalized_ledger: number | null; // If operational
  finalized_at: string | null; // If operational
  finalized_tx_hash: string | null; // If operational

  // Indexing
  indexed_at: string | null; // When first indexed by Goldsky pipeline
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
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_NETWORK: ${network}. Must be one of: testnet, public, local`);
  }

  return network;
}

const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

/**
 * Resolve a route segment to the canonical dao_id (token contract address).
 * Accepts either the contract id itself or the DAO's on-chain slug.
 *
 * @throws Error if the value is neither a contract id nor a known slug
 */
export async function resolveDaoId(idOrSlug: string): Promise<string> {
  if (CONTRACT_ID_PATTERN.test(idOrSlug)) return idOrSlug;
  // A claimed slug is unique and permanent (claimed at launch). Several pending
  // DAOs may request the same slug, so a request only resolves when unambiguous.
  const claimed = await prisma.managerDao.findFirst({
    where: { deploymentId: DEPLOYMENT_ID, claimedSlug: idOrSlug },
    select: { daoId: true }
  });
  if (claimed) return claimed.daoId;
  const requested = await prisma.managerDao.findMany({
    where: { deploymentId: DEPLOYMENT_ID, slugClaimed: false, requestedSlug: idOrSlug },
    select: { daoId: true },
    orderBy: { createdLedger: 'asc' },
    take: 2
  });
  if (requested.length !== 1) throw new Error(`DAO not found: ${idOrSlug}`);
  return requested[0].daoId;
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
  const deploymentId = DEPLOYMENT_ID;
  const network = getDeploymentNetwork();

  const row = await prisma.managerDao.findFirst({
    where: { deploymentId, daoId }
  });

  if (!row) {
    throw new Error(`DAO not found: ${daoId}`);
  }

  const metadata = await prisma.metadataConfiguration.findFirst({
    where: { deploymentId, daoId }
  });

  return mapDaoConfig(row, network, metadata?.contractImage ?? null);
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
  const deploymentId = DEPLOYMENT_ID;
  const network = getDeploymentNetwork();

  const rows = await prisma.managerDao.findMany({
    where: { deploymentId, ...(status ? { status } : {}) },
    orderBy: { createdLedger: 'desc' }
  });
  const metadata = await prisma.metadataConfiguration.findMany({
    where: { deploymentId }
  });
  const images = new Map(metadata.map((item) => [item.daoId, item.contractImage]));

  return rows.map((row) => mapDaoConfig(row, network, images.get(row.daoId) ?? null));
}

export async function getPendingDaosForLaunchAdmin(address: string): Promise<DaoConfig[]> {
  const launchAdmin = address.trim();
  if (!launchAdmin) return [];

  const deploymentId = DEPLOYMENT_ID;
  const network = getDeploymentNetwork();
  const rows = await prisma.managerDao.findMany({
    where: {
      deploymentId,
      status: 'pending',
      launchAdmin: { equals: launchAdmin, mode: 'insensitive' }
    },
    orderBy: { createdLedger: 'desc' }
  });
  const metadata = await prisma.metadataConfiguration.findMany({
    where: { deploymentId, daoId: { in: rows.map((row) => row.daoId) } }
  });
  const images = new Map(metadata.map((item) => [item.daoId, item.contractImage]));

  return rows.map((row) => mapDaoConfig(row, network, images.get(row.daoId) ?? null));
}

function mapDaoConfig(
  row: Awaited<ReturnType<typeof prisma.managerDao.findFirst>> extends infer T ? Exclude<T, null> : never,
  network: NetworkName,
  contractImage: string | null
): DaoConfig {
  return {
    deployment_id: row.deploymentId,
    dao_id: row.daoId,
    token_address: row.tokenAddress,
    // Only a claimed slug is stable: a requested one can be taken by a DAO that launches first.
    slug: row.slugClaimed ? row.claimedSlug : null,
    creator: row.deployer,
    launch_admin: row.launchAdmin,
    network,
    manager_contract: row.managerContract,
    token_contract: row.tokenContract,
    governor_contract: row.governorContract,
    auction_contract: row.auctionContract,
    marketplace_contract: row.marketplaceContract,
    treasury_contract: row.treasuryContract,
    metadata_contract: row.metadataContract,
    contract_image: contractImage,
    token_name: row.tokenName,
    token_symbol: row.tokenSymbol,
    token_description: row.tokenDescription,
    token_uri: row.tokenUri,
    admin_address: row.adminAddress,
    label: '',
    status: row.status === 'operational' ? 'operational' : 'pending',
    auction_enabled: row.auctionEnabled,
    auction_paused: row.auctionPaused,
    marketplace_enabled: row.marketplaceEnabled,
    created_ledger: Number(row.createdLedger),
    created_at: row.createdAt?.toISOString() ?? null,
    created_tx_hash: row.createdTxHash,
    finalized_ledger: row.launchedLedger === null ? null : Number(row.launchedLedger),
    finalized_at: row.launchedAt?.toISOString() ?? null,
    finalized_tx_hash: row.launchedTxHash,
    indexed_at: row.indexedAt?.toISOString() ?? null
  };
}

/**
 * DAO status is now derived from DaoLaunched event presence
 *
 * When launch_dao is called on-chain:
 * 1. Manager emits DaoLaunched event
 * 2. Goldsky indexes the event
 * 3. manager.daos view derives status = 'operational'
 *
 * No manual database updates needed.
 */

/**
 * Wait for DAO to be indexed in the database
 *
 * After create_dao is called on-chain, Goldsky takes time to index the event.
 * This function polls the database until the DAO appears.
 *
 * @param daoId - Token contract address (DAO ID)
 * @param timeoutMs - Maximum time to wait (default 30000ms)
 * @throws Error if DAO not found within timeout
 */
export async function waitForDaoIndexed(daoId: string, timeoutMs = 30000): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 1000; // 1 second

  while (Date.now() - startTime < timeoutMs) {
    try {
      const config = await getDaoConfigFromDatabase(daoId);
      if (config) {
        // DAO found!
        return;
      }
    } catch {
      // DAO not found yet, continue polling
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`DAO ${daoId} not indexed after ${timeoutMs}ms. Please check Goldsky indexer status.`);
}
