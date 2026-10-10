import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import useSWR from 'swr';

import { type DaoNetworkConfig, readSource } from '@/lib/dao-config';

export function adminReadOptions(config: DaoNetworkConfig, contractId: string, address?: string | null) {
  return {
    contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: readSource(address, config.launchAdmin),
    allowHttp: config.rpcUrl.startsWith('http://')
  };
}

/** Live authority, not the historical indexed administrator. */
export function useAdminTokenState(config: DaoNetworkConfig, address?: string | null) {
  return useSWR(
    config.tokenContractId
      ? ['admin-token-state', config.tokenContractId, config.rpcUrl, config.passphrase, address || '']
      : null,
    async () => {
      const token = new TokenClient(adminReadOptions(config, config.tokenContractId, address));
      const [admin, live, supply, authority] = await Promise.all([
        token.admin(),
        token.is_live(),
        token.total_supply(),
        address ? token.mint_authority({ authority: address }) : Promise.resolve(null)
      ]);
      return {
        admin: admin.result,
        live: live.result,
        supply: supply.result,
        mintAuthority: authority?.result === true
      };
    }
  );
}

export function useAdminArtwork(config: DaoNetworkConfig, address?: string | null) {
  return useSWR(
    config.metadataContractId
      ? ['admin-artwork', config.metadataContractId, config.rpcUrl, config.passphrase, address || '']
      : null,
    async () => {
      const client = new MetadataClient(adminReadOptions(config, config.metadataContractId, address));
      const [settings, count, groups, admin] = await Promise.all([
        client.get_settings(),
        client.properties_count(),
        client.ipfs_data_count(),
        client.admin()
      ]);
      // Count headers first; never fetch all artwork items to render a summary.
      const properties = await Promise.all(
        Array.from({ length: count.result }, async (_, property_id) => {
          const items = await client.items_count({ property_id });
          return { id: property_id, count: items.result };
        })
      );
      return { settings: settings.result.unwrap(), properties, groupCount: groups.result, admin: admin.result };
    }
  );
}
