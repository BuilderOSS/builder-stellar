/**
 * DAO Configuration Lookup
 *
 * Maps URL daoId parameters to DAO contract addresses and network configuration.
 * Uses database queries for actual DAO state and static network config for infrastructure.
 */

import { getNetworkConfig, type NetworkName } from '@/config/networks';

import { getDaoConfigFromDatabase, resolveDaoId } from './dao-db';
import { registeredMinterConfig } from './registered-minter-config';
import { cached } from './server-cache';

export type DaoNetworkConfig = {
  name: NetworkName;
  /** Permanent URL slug once launched (claimed); null before launch. */
  slug?: string | null;
  label: string;
  rpcUrl: string;
  passphrase: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  /** The token's base URI (token pages are built from it); needed to rename without changing it. */
  tokenUri?: string;
  /**
   * Current DAO admin from the index: the launch admin during setup, the
   * Treasury (a contract address) after launch. Never use it as an SDK
   * simulation source; use `readSource`.
   */
  adminAddress: string;
  launchAdmin: string;
  tokenContractId: string;
  metadataContractId: string;
  contractImage: string;
  governorContractId: string;
  treasuryContractId: string;
  auctionContractId: string;
  marketplaceContractId: string;
  /** Canonical Manager registration + RPC-validated spec; absent means fail closed. */
  minterContractId?: string;
  minterSpec?: string[];
  auctionEnabled: boolean | null;
  auctionPaused: boolean | null;
  /** Indexed launch choice; null while pending or unknown. */
  marketplaceEnabled: boolean | null;
  status: 'pending' | 'operational';
};

export type DaoNetworkName = NetworkName;

const ACCOUNT_RE = /^G[A-Z2-7]{55}$/;

/**
 * Source account for read-only simulations: the first candidate that is a
 * classic account, else undefined (the SDK then simulates from its null
 * account). Contract addresses such as the post-launch Treasury admin cannot be
 * loaded as a source account.
 */
export function readSource(...candidates: Array<string | null | undefined>): string | undefined {
  return candidates.find((value): value is string => typeof value === 'string' && ACCOUNT_RE.test(value));
}

export function isDaoAdmin(config: DaoNetworkConfig, address: string | null | undefined): boolean {
  // Launch hands every module's admin to the Treasury: only the pending launch
  // admin administers the DAO directly.
  if (!address || config.status !== 'pending') return false;

  const normalizedAddress = address.trim().toLowerCase();
  const configuredAdmin = config.adminAddress.trim().toLowerCase();
  const pendingLaunchAdmin = config.launchAdmin.trim().toLowerCase();

  return Boolean(
    normalizedAddress &&
    (normalizedAddress === configuredAdmin || (config.status === 'pending' && normalizedAddress === pendingLaunchAdmin))
  );
}

/**
 * Get DAO configuration by ID (token contract address)
 *
 * Combines DAO configuration from database with network configuration.
 * This is the primary way to look up DAO metadata for rendering pages.
 *
 * @param daoId - Token contract address (dao_id from database)
 * @returns DAO configuration with all contract addresses and network info
 * @throws Error if DAO not found or database query fails
 */
export async function getDaoNetworkConfigById(daoId: string): Promise<DaoNetworkConfig> {
  // Every API route resolves the DAO first; a short cache keeps that off the
  // hot path (the indexed configuration changes only with chain events).
  return cached(`dao-config:${daoId}`, 30_000, () => loadDaoNetworkConfig(daoId));
}

async function loadDaoNetworkConfig(daoId: string): Promise<DaoNetworkConfig> {
  // Query database for complete DAO configuration
  // Accept the canonical Token address or a claimed slug.
  const daoConfig = await getDaoConfigFromDatabase(await resolveDaoId(daoId));

  // Get network configuration from static config
  const networkConfig = getNetworkConfig(daoConfig.network);
  const minter = await registeredMinterConfig(
    networkConfig,
    daoConfig.launch_admin || daoConfig.admin_address || ''
  ).catch(() => ({ minterContractId: '', minterSpec: undefined }));

  return {
    ...minter,
    name: daoConfig.network,
    label: daoConfig.label || '',
    slug: daoConfig.slug ?? null,
    rpcUrl: networkConfig.rpcUrl,
    passphrase: networkConfig.networkPassphrase,
    // Token metadata now comes from database (populated by Goldsky)
    tokenName: daoConfig.token_name || '',
    tokenSymbol: daoConfig.token_symbol || '',
    tokenDescription: daoConfig.token_description || '',
    tokenUri: daoConfig.token_uri || '',
    // The current admin: the launch admin before launch, the Treasury after.
    adminAddress: daoConfig.admin_address || (daoConfig.status === 'pending' ? daoConfig.launch_admin || '' : ''),
    launchAdmin: daoConfig.launch_admin || '',
    tokenContractId: daoConfig.token_address,
    metadataContractId: daoConfig.metadata_contract ?? '',
    contractImage: daoConfig.contract_image ?? '',
    governorContractId: daoConfig.governor_contract,
    treasuryContractId: daoConfig.treasury_contract ?? '',
    auctionContractId: daoConfig.auction_contract ?? '',
    marketplaceContractId: daoConfig.marketplace_contract ?? '',
    auctionEnabled: daoConfig.auction_enabled,
    auctionPaused: daoConfig.auction_paused,
    marketplaceEnabled: daoConfig.marketplace_enabled,
    status: daoConfig.status
  };
}
