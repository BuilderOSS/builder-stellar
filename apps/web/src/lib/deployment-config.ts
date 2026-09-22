// lib/deployment-config.ts

import { getNetworkConfig, type NetworkConfig, type NetworkName } from '@/config/networks';

export interface DeploymentConfig extends NetworkConfig {
  managerAddress: string;
}

/**
 * Convert the multi-tenant deployment ID into the raw Soroban contract ID.
 * The deployment ID keeps its `manager:` prefix for indexer/database queries,
 * but contract clients only accept the address portion.
 */
export function getManagerAddress(deploymentId: string): string {
  const managerAddress = deploymentId.trim().replace(/^manager:/, '');

  if (!managerAddress) {
    throw new Error('NEXT_PUBLIC_DEPLOYMENT_ID must contain a Manager contract address.');
  }

  return managerAddress;
}

/**
 * Get deployment configuration including Manager contract address
 * and network settings for DAO creation
 */
export function getDeploymentConfig(): DeploymentConfig {
  const network = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as NetworkName;
  const deploymentId = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;

  if (!deploymentId) {
    throw new Error(
      'NEXT_PUBLIC_DEPLOYMENT_ID environment variable not configured. ' +
        'This should contain the Manager deployment ID for DAO creation.'
    );
  }

  const networkConfig = getNetworkConfig(network);

  return {
    ...networkConfig,
    managerAddress: getManagerAddress(deploymentId)
  };
}

/**
 * Check if deployment is configured and ready
 */
export function isDeploymentConfigured(): boolean {
  try {
    getDeploymentConfig();
    return true;
  } catch {
    return false;
  }
}
