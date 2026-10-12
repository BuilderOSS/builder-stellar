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
      // One read for every property's name and item count; never fetch all items for a summary.
      const [settings, headers, groups, admin, profileSeq] = await Promise.all([
        client.get_settings(),
        client.property_headers(),
        client.ipfs_data_count(),
        client.admin(),
        client.profile_seq()
      ]);
      const properties = headers.result.map((header, id) => ({ id, name: header.name, count: header.item_count }));
      return {
        settings: settings.result.unwrap(),
        properties,
        groupCount: groups.result,
        admin: admin.result,
        /** The profile revision on chain: update_profile must name it. */
        profileSeq: profileSeq.result.isOk() ? profileSeq.result.unwrap() : null
      };
    }
  );
}
