import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import useSWR from 'swr';

import type { DaoNetworkConfig } from '@/lib/dao-config';

export function adminReadOptions(config: DaoNetworkConfig, contractId: string, address?: string | null) {
  return {
    contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: address || config.launchAdmin || config.adminAddress,
    allowHttp: config.rpcUrl.startsWith('http://')
  };
}

/** Live authority, not the historical indexed administrator. */
export function useAdminTokenState(config: DaoNetworkConfig, address?: string | null) {
  return useSWR(
    config.tokenContractId
      ? ['admin-token-state', config.tokenContractId, config.rpcUrl, config.passphrase, address || config.adminAddress]
      : null,
    async () => {
      const token = new TokenClient(adminReadOptions(config, config.tokenContractId, address));
      const [owner, live, supply, authority] = await Promise.all([
        token.get_owner(),
        token.is_live(),
        token.total_supply(),
        address ? token.mint_authority({ authority: address }) : Promise.resolve(null)
      ]);
      return {
        owner: owner.result,
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
      ? ['admin-artwork', config.metadataContractId, config.rpcUrl, config.passphrase, address || config.adminAddress]
      : null,
    async () => {
      const client = new MetadataClient(adminReadOptions(config, config.metadataContractId, address));
      const [settings, count, groups] = await Promise.all([
        client.get_settings(),
        client.properties_count(),
        client.ipfs_data_count()
      ]);
      // Count headers first; never fetch all artwork items to render a summary.
      const properties = await Promise.all(
        Array.from({ length: count.result }, async (_, property_id) => {
          const items = await client.items_count({ property_id });
          return { id: property_id, count: items.result };
        })
      );
      return { settings: settings.result.unwrap(), properties, groupCount: groups.result };
    }
  );
}
