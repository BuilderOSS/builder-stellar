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
import { contractLabel, coreContracts, type DaoContract } from '@/lib/contract-search';
import { type DaoProfile, EMPTY_PROFILE } from '@/lib/dao-profile';
import { type ProfileView, verifyProfiles } from '@/lib/dao-profile-server';
import { buyableOfferWhere } from '@/lib/marketplace/query';
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
  /** The DAO's current URL slug once launched; null while it is only requested. */
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
  /** The DAO's ClaimMinter from its module registry; null when it has none. */
  claims_contract: string | null;
  /** An assurance drive's outcome (open, launched, released); null without one. */
  assurance_outcome: 'open' | 'launched' | 'released' | null;

  // Token Metadata (from DaoCreationParams)
  token_name: string | null;
  token_symbol: string | null;

  /**
   * The community profile, verified against the chain's profile_hash(); empty
   * (status `unavailable`) when the index and chain disagree or the chain could
   * not be read. `image` and `description` are shortcuts into it.
   */
  profile: DaoProfile;
  profile_status: ProfileView['status'];
  profile_seq: number | null;
  image: string;
  description: string;

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

  /**
   * Something to buy right now, from the index. Only set by withLiveAvailability:
   * an open auction still taking bids, and listings and pools that are open,
   * unexpired and (pools) in stock.
   */
  auction_live?: boolean;
  listings_open?: number;

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
export function getDeploymentNetwork(): NetworkName {
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
  // A claimed slug is unique (claimed at launch, moved only by a vote to change it).
  const claimed = await prisma.managerDao.findFirst({
    where: { deploymentId: DEPLOYMENT_ID, claimedSlug: idOrSlug },
    select: { daoId: true },
    orderBy: { launchedLedger: 'desc' }
  });
  if (claimed) return claimed.daoId;
  // An old link keeps working while no DAO holds it: the latest DAO that moved away from it.
  const previous = await prisma.managerDaoPreviousSlug.findFirst({
    where: { deploymentId: DEPLOYMENT_ID, slug: idOrSlug },
    select: { daoId: true },
    orderBy: [{ ledgerSequence: 'desc' }, { transactionIndex: 'desc' }, { eventIndex: 'desc' }]
  });
  if (previous) return previous.daoId;
  // Several pending DAOs may request the same slug, so a request only resolves when unambiguous.
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

  const views = await verifyRows(network, [row]);
  return mapDaoConfig(row, network, views.get(row.daoId));
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
  const views = await verifyRows(network, rows);
  return rows.map((row) => mapDaoConfig(row, network, views.get(row.daoId)));
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
  const views = await verifyRows(network, rows);
  return rows.map((row) => mapDaoConfig(row, network, views.get(row.daoId)));
}

type DaoRow = Awaited<ReturnType<typeof prisma.managerDao.findFirst>> extends infer T ? Exclude<T, null> : never;

/** Verify each row's indexed profile against the chain (cached per contract and revision). */
export function verifyRows(network: NetworkName, rows: DaoRow[]) {
  return verifyProfiles(
    network,
    rows.map((row) => ({
      key: row.daoId,
      metadataContract: row.metadataContract,
      profile: row.profile,
      profileSeq: row.profileSeq
    }))
  );
}

function mapDaoConfig(row: DaoRow, network: NetworkName, view: ProfileView | undefined): DaoConfig {
  const profile = view?.profile ?? { ...EMPTY_PROFILE };
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
    claims_contract: row.claimsContract,
    assurance_outcome:
      row.assuranceOutcome === 'open' || row.assuranceOutcome === 'launched' || row.assuranceOutcome === 'released'
        ? row.assuranceOutcome
        : null,
    token_name: row.tokenName,
    token_symbol: row.tokenSymbol,
    profile,
    profile_status: view?.status ?? 'unavailable',
    profile_seq: view?.seq ?? (row.profileSeq === null ? null : Number(row.profileSeq)),
    image: profile.image,
    description: profile.description,
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
 * Every contract of each DAO that search can find it by: the contracts on its
 * record plus each module registered now (external ones included). A failed
 * module read falls back to the record's contracts.
 */
export async function getDaoContracts(daos: DaoConfig[]): Promise<Record<string, DaoContract[]>> {
  const index = new Map(daos.map((dao) => [dao.dao_id, coreContracts(dao)]));
  if (!daos.length) return {};
  try {
    const modules = await prisma.managerDaoModule.findMany({
      where: { deploymentId: DEPLOYMENT_ID, registered: true, daoId: { in: [...index.keys()] } },
      select: { daoId: true, moduleRole: true, kind: true, moduleContract: true }
    });
    for (const registered of modules) {
      const contracts = index.get(registered.daoId);
      if (!contracts || contracts.some((contract) => contract.id === registered.moduleContract)) continue;
      contracts.push({
        role: registered.moduleRole,
        label: contractLabel(registered.moduleRole, registered.kind),
        id: registered.moduleContract
      });
    }
  } catch (error) {
    console.error('[dao-db] module registry read failed; searching record contracts only', error);
  }
  return Object.fromEntries(index);
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

/**
 * Adds what each community has for sale right now: whether its current auction
 * is still taking bids, and how many market listings are open. Two or three
 * index queries for the whole list; callers opt in.
 */
export async function withLiveAvailability(daos: DaoConfig[]): Promise<DaoConfig[]> {
  try {
    return await addLiveAvailability(daos);
  } catch {
    // Availability only ranks and filters; the list still works without it.
    return daos;
  }
}

async function addLiveAvailability(daos: DaoConfig[]): Promise<DaoConfig[]> {
  const auctionScopes = daos
    .filter((dao) => dao.auction_contract && dao.auction_paused !== true)
    .map((dao) => ({ daoId: dao.dao_id, contractId: dao.auction_contract! }));
  const marketScopes = daos
    .filter((dao) => dao.marketplace_contract && dao.marketplace_enabled !== false)
    .map((dao) => ({ daoId: dao.dao_id, contractId: dao.marketplace_contract! }));
  if (!auctionScopes.length && !marketScopes.length) return daos;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const [auctions, offers] = await Promise.all([
    auctionScopes.length
      ? prisma.auctionCurrentAuction.findMany({
          where: { deploymentId: DEPLOYMENT_ID, OR: auctionScopes, settled: false, cancelled: false },
          select: { daoId: true, currentEndSeconds: true }
        })
      : [],
    marketScopes.length ? countBuyableOffers(marketScopes) : []
  ]);

  // auction.current_auctions is the newest auction per contract; an open one is
  // live until its end including any extensions (current_end_seconds).
  const live = new Set(auctions.filter((a) => a.currentEndSeconds > now).map((a) => a.daoId));

  const listings = new Map<string, number>();
  for (const row of offers) listings.set(row.daoId, (listings.get(row.daoId) ?? 0) + row.count);

  return daos.map((dao) => ({
    ...dao,
    auction_live: live.has(dao.dao_id),
    listings_open: listings.get(dao.dao_id) ?? 0
  }));
}

/**
 * Pools and resales a buyer can take right now (buyableOfferWhere), counted per DAO and
 * market contract. Without `scopes` it counts every market in this deployment.
 */
export async function countBuyableOffers(scopes?: { daoId: string; contractId: string }[]) {
  const where = buyableOfferWhere();
  const scope = { deploymentId: DEPLOYMENT_ID, ...(scopes ? { OR: scopes } : {}) };
  const by: ['daoId', 'contractId'] = ['daoId', 'contractId'];
  const [pools, secondary] = await Promise.all([
    prisma.marketplacePool.groupBy({ by, where: { ...scope, ...where.pool }, _count: { _all: true } }),
    prisma.marketplaceSecondaryListing.groupBy({ by, where: { ...scope, ...where.secondary }, _count: { _all: true } })
  ]);
  const counts = new Map<string, { daoId: string; contractId: string; count: number }>();
  for (const row of [...pools, ...secondary]) {
    const key = `${row.daoId}:${row.contractId}`;
    const count = (counts.get(key)?.count ?? 0) + row._count._all;
    counts.set(key, { daoId: row.daoId, contractId: row.contractId, count });
  }
  return [...counts.values()];
}

/** The membership switches a DAO's Token has in force (docs/designs/locked-tokens.md). */
export type TokenSettings = { transfersLocked: boolean; membersOnlyDelegation: boolean; daoRecovery: boolean };

export const OPEN_TOKEN_SETTINGS: TokenSettings = {
  transfersLocked: false,
  membersOnlyDelegation: false,
  daoRecovery: false
};

/** The deadline (unix seconds) of a DAO's launch drive from manager.assurance_drives; null without one. */
export async function getAssuranceDeadlineFromDatabase(daoId: string): Promise<number | null> {
  const row = await prisma.managerAssuranceDrive.findFirst({
    where: { deploymentId: DEPLOYMENT_ID, daoId },
    select: { deadline: true }
  });
  return row ? Number(row.deadline.toString()) : null;
}

/** token.settings from the index; all off (an open DAO) until the Token's first event is indexed. */
export async function getTokenSettingsFromDatabase(daoId: string): Promise<TokenSettings> {
  const row = await prisma.tokenSettings.findFirst({ where: { deploymentId: DEPLOYMENT_ID, daoId } });
  if (!row) return { ...OPEN_TOKEN_SETTINGS };
  return {
    transfersLocked: row.transfersLocked,
    membersOnlyDelegation: row.membersOnlyDelegation,
    daoRecovery: row.daoRecovery
  };
}
