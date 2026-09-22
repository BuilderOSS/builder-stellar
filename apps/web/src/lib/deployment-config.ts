// lib/deployment-config.ts

import { getNetworkConfig, type NetworkConfig, type NetworkName } from '@/config/networks';

export interface DeploymentConfig extends NetworkConfig {
  managerAddress: string;
}

/**
 * Get deployment configuration including Manager contract address
 * and network settings for DAO creation
 */
export function getDeploymentConfig(): DeploymentConfig {
  const network = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as NetworkName;
  const managerAddress = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;

  if (!managerAddress) {
    throw new Error(
      'NEXT_PUBLIC_DEPLOYMENT_ID environment variable not configured. ' +
        'This should contain the Manager contract address for DAO creation.'
    );
  }

  const networkConfig = getNetworkConfig(network);

  return {
    ...networkConfig,
    managerAddress
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
