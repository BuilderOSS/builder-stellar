import type { IpfsGroup, Property, Settings } from '@builder-stellar/metadata-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Server } from '@stellar/stellar-sdk/rpc';

import type { DaoNetworkConfig } from '@/lib/dao-config';

export type ResolvedArtwork = {
  property: string;
  item: string;
  url: string;
};

export type OnchainTokenMetadata = {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string }>;
  artwork: ResolvedArtwork[];
};

function joinUrl(base: string, property: string, item: string, extension: string) {
  return `${base.replace(/\/$/, '')}/${property}/${item}${extension}`;
}

function unwrapResult<T>(result: unknown, label: string): T {
  if (result && typeof result === 'object') {
    if ('value' in result) return (result as { value: T }).value;
    if ('error' in result) {
      const message = (result as { error?: { message?: string } }).error?.message;
      throw new Error(`${label}${message ? `: ${message}` : ''}`);
    }
  }

  return result as T;
}

export async function resolveOnchainTokenMetadata(
  config: DaoNetworkConfig,
  tokenId: number,
  imageUrl: string
): Promise<OnchainTokenMetadata> {
  if (!config.metadataContractId) {
    throw new Error('Missing metadata contract id in the active deployment.');
  }

  const server = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  await server.getLatestLedger();

  const metadata = new MetadataClient({
    contractId: config.metadataContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: config.adminAddress
  });

  const [settingsResponse, attributesResponse, propertiesResponse, ipfsResponse] = await Promise.all([
    metadata.get_settings(),
    metadata.get_attributes({ token_id: tokenId }),
    metadata.get_properties(),
    metadata.get_ipfs_data()
  ]);

  const settings = unwrapResult<Settings>(settingsResponse.result, 'Unable to read metadata settings');
  const attributes = unwrapResult<number[]>(attributesResponse.result, `Unable to read attributes for token ${tokenId}`);
  const properties = propertiesResponse.result as Property[];
  const ipfsGroups = ipfsResponse.result as IpfsGroup[];

  if (!settings || !attributes || !properties || !ipfsGroups) {
    throw new Error(`No metadata found for token ${tokenId}`);
  }

  const propertyCount = attributes[0];
  const artwork = properties.slice(0, propertyCount).map((property, propertyId) => {
    const itemIndex = attributes[propertyId + 1];
    const item = property.items[itemIndex];
    if (!item) {
      throw new Error(`Invalid artwork selection for token ${tokenId}`);
    }

    const ipfsGroup = ipfsGroups[item.reference_slot];
    if (!ipfsGroup) {
      throw new Error(`Invalid artwork IPFS group for token ${tokenId}`);
    }

    return {
      property: property.name,
      item: item.name,
      url: joinUrl(ipfsGroup.base_uri, property.name, item.name, ipfsGroup.extension)
    };
  });

  return {
    name: `${config.tokenName} #${tokenId}`,
    description: settings.description,
    image: imageUrl,
    attributes: [
      { trait_type: 'Token ID', value: String(tokenId) },
      { trait_type: 'Token Symbol', value: config.tokenSymbol },
      ...artwork.map(({ property, item }) => ({ trait_type: property, value: item }))
    ],
    artwork
  };
}
