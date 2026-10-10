import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import useSWR from 'swr';

import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';

export const moduleAddressKeys = {
  token: 'tokenContractId',
  governor: 'governorContractId',
  auction: 'auctionContractId',
  treasury: 'treasuryContractId',
  marketplace: 'marketplaceContractId',
  metadata: 'metadataContractId'
} as const;
export type UpgradeModule = keyof typeof moduleAddressKeys;
export function hashToHex(hash: Uint8Array) {
  if (hash.length !== 32) throw new Error('Expected a 32-byte WASM hash.');
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function hashFromHex(hash: string) {
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Use a 64-character hexadecimal WASM hash.');
  return Uint8Array.from(hash.match(/../g)!, (byte) => parseInt(byte, 16));
}
export async function readAdminModuleVersion(
  config: DaoNetworkConfig,
  module: UpgradeModule,
  address?: string | null,
  targetHash?: string
) {
  const deployment = getDeploymentConfig();
  if (deployment.networkPassphrase !== config.passphrase)
    throw new Error('DAO and Manager deployment networks do not match.');
  const contractId = config[moduleAddressKeys[module]];
  if (!contractId) throw new Error('No module address configured.');
  const Clients = {
    token: TokenClient,
    governor: GovernorClient,
    auction: AuctionClient,
    treasury: TreasuryClient,
    marketplace: MarketplaceClient,
    metadata: MetadataClient
  };
  const client = new Clients[module](adminReadOptions(config, contractId, address));
  const manager = new ManagerClient(adminReadOptions(config, deployment.managerAddress, address));
  const [version, hash, admin] = await Promise.all([client.version(), client.wasm_hash(), client.admin()]);
  const source = (await manager.get_implementation({ wasm_hash: hash.result })).result;
  const target = targetHash
    ? (await manager.get_implementation({ wasm_hash: hashFromHex(targetHash) })).result
    : source
      ? (await manager.get_latest_implementation({ name: source.name })).result
      : null;
  const approved = target
    ? (await manager.is_upgrade_approved({ from_hash: hash.result, to_hash: target.wasm_hash })).result
    : false;
  return {
    module,
    contractId,
    version: version.result,
    fromHash: hashToHex(hash.result),
    admin: admin?.result ?? null,
    source,
    target: target
      ? { version: target.version, hash: hashToHex(target.wasm_hash), revoked: target.revoked, name: target.name }
      : null,
    approved
  };
}
export function useAdminModuleVersion(
  config: DaoNetworkConfig,
  module: UpgradeModule,
  address?: string | null,
  targetHash?: string
) {
  return useSWR(
    config[moduleAddressKeys[module]]
      ? [
          'admin-module-version',
          config[moduleAddressKeys[module]],
          config.rpcUrl,
          config.passphrase,
          module,
          address,
          targetHash
        ]
      : null,
    () => readAdminModuleVersion(config, module, address, targetHash)
  );
}
