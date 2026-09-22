/**
 * Network Configuration
 *
 * Static configuration for Stellar networks.
 * DAO-specific contracts are loaded from the database via queries.
 *
 * This file should NOT be regenerated - it's manually maintained.
 */

export type NetworkName = 'testnet' | 'local' | 'public';

export interface NetworkConfig {
  name: NetworkName;
  rpcUrl: string;
  networkPassphrase: string;
  label: string;
  description: string;
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    label: 'Testnet',
    description: 'Stellar Test Network'
  },
  public: {
    name: 'public',
    rpcUrl: 'https://soroban-mainnet.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    label: 'Mainnet',
    description: 'Stellar Public Network'
  },
  local: {
    name: 'local',
    rpcUrl: 'http://localhost:8000/rpc',
    networkPassphrase: 'Standalone Network ; February 2017',
    label: 'Local',
    description: 'Local Standalone Network'
  }
};

export function getNetworkConfig(network: NetworkName): NetworkConfig {
  const config = NETWORKS[network];
  if (!config) {
    throw new Error(`Unknown network: ${network}. Available: ${Object.keys(NETWORKS).join(', ')}`);
  }
  return config;
}
