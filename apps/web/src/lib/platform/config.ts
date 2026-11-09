import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';

/** What the platform page needs to reach the chain: the deployment's network and Manager. */
export type PlatformConfig = Pick<DaoNetworkConfig, 'name' | 'rpcUrl' | 'passphrase'> & {
  managerAddress: string;
  /** No DAO here: reads simulate without a source account. */
  launchAdmin: string;
};

export function getPlatformConfig(): PlatformConfig {
  const deployment = getDeploymentConfig();
  return {
    name: deployment.name,
    rpcUrl: deployment.rpcUrl,
    passphrase: deployment.networkPassphrase,
    managerAddress: deployment.managerAddress,
    launchAdmin: ''
  };
}

/**
 * Module names in the registry, in the order the page lists them. `Manager` is the platform's own
 * contract; the rest are what `create_dao` and `create_module` deploy.
 */
export const IMPLEMENTATION_NAMES = [
  'Manager',
  'Token',
  'Metadata',
  'Governor',
  'Treasury',
  'Auction',
  'Marketplace',
  'ClaimMinter'
] as const;
export type ImplementationName = (typeof IMPLEMENTATION_NAMES)[number];

/** `CurrentImplementations` slots and the registry name each must be registered under. */
export const CURRENT_SLOTS = {
  token: 'Token',
  metadata: 'Metadata',
  governor: 'Governor',
  treasury: 'Treasury',
  auction: 'Auction',
  marketplace: 'Marketplace',
  claims: 'ClaimMinter'
} as const satisfies Record<string, Exclude<ImplementationName, 'Manager'>>;
export type CurrentSlot = keyof typeof CURRENT_SLOTS;
