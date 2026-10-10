/**
 * DAO Configuration Lookup
 *
 * Maps URL daoId parameters to DAO contract addresses and network configuration.
 * Uses database queries for actual DAO state and static network config for infrastructure.
 */

import { getNetworkConfig, type NetworkName } from '@/config/networks';

import { getDaoConfigFromDatabase } from './dao-db';
import { registeredMinterConfig } from './registered-minter-config';

export type DaoNetworkConfig = {
  name: NetworkName;
  label: string;
  rpcUrl: string;
  passphrase: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  /** Historical admin/read-simulation source. Not a module owner after launch. */
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
  status: 'pending' | 'operational';
};

export type DaoNetworkName = NetworkName;

export function isDaoAdmin(config: DaoNetworkConfig, address: string | null | undefined): boolean {
  // Launch hands module ownership to the Treasury. Historical admin_address is
  // still useful as a read-simulation source, never as post-launch authority.
  if (!address || config.status !== 'pending') return false;

  const normalizedAddress = address.trim().toLowerCase();
  const configuredOwner = config.adminAddress.trim().toLowerCase();
  const pendingLaunchAdmin = config.launchAdmin.trim().toLowerCase();

  return Boolean(
    normalizedAddress &&
    (normalizedAddress === configuredOwner || (config.status === 'pending' && normalizedAddress === pendingLaunchAdmin))
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
  // Query database for complete DAO configuration
  const daoConfig = await getDaoConfigFromDatabase(daoId);

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
    rpcUrl: networkConfig.rpcUrl,
    passphrase: networkConfig.networkPassphrase,
    // Token metadata now comes from database (populated by Goldsky)
    tokenName: daoConfig.token_name || '',
    tokenSymbol: daoConfig.token_symbol || '',
    tokenDescription: daoConfig.token_description || '',
    // Before launch, the launch administrator owns the module contracts.
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
    status: daoConfig.status
  };
}
