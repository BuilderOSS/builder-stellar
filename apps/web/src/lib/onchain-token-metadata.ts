import type { IpfsGroup, Property, Settings } from '@builder-stellar/metadata-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { type DaoNetworkConfig, readSource } from '@/lib/dao-config';
import { prisma } from '@/lib/prisma';
import { cached } from '@/lib/server-cache';

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

type Collection = { properties: Property[]; ipfsGroups: IpfsGroup[]; description: string };

function metadataClient(config: DaoNetworkConfig) {
  return new MetadataClient({
    contractId: config.metadataContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: readSource(config.launchAdmin),
    allowHttp: config.rpcUrl.startsWith('http://')
  });
}

/**
 * Property/item names and IPFS groups are not indexed, so they come from RPC,
 * cached per Metadata contract: artwork is append-only and changes only by an
 * admin action. NOTE: get_properties()/get_ipfs_data() are O(collection size).
 */
function collection(config: DaoNetworkConfig): Promise<Collection> {
  return cached(`artwork:${config.metadataContractId}`, 5 * 60_000, async () => {
    const metadata = metadataClient(config);
    const [settingsResponse, propertiesResponse, ipfsResponse] = await Promise.all([
      metadata.get_settings(),
      metadata.get_properties(),
      metadata.get_ipfs_data()
    ]);
    const settings = unwrapResult<Settings>(settingsResponse.result, 'Unable to read metadata settings');
    return {
      properties: propertiesResponse.result as Property[],
      ipfsGroups: ipfsResponse.result as IpfsGroup[],
      description: settings.description
    };
  });
}

/**
 * A token's selections come from the index (metadata.token_seeds, latest
 * seed), falling back to RPC for a token minted moments ago. Seeded traits only
 * change by regenerate on an unseeded token, so a found value is cached.
 */
async function tokenAttributes(config: DaoNetworkConfig, tokenId: number): Promise<number[]> {
  return cached(`attributes:${config.metadataContractId}:${tokenId}`, 60 * 60_000, async () => {
    const rows = await prisma.$queryRaw<{ selections: unknown }[]>`
      SELECT selections FROM metadata.token_seeds
      WHERE deployment_id = ${DEPLOYMENT_ID} AND dao_id = ${config.tokenContractId}
        AND metadata_contract = ${config.metadataContractId} AND token_id = ${tokenId} AND is_current
      LIMIT 1`;
    const indexed = rows[0]?.selections;
    if (Array.isArray(indexed) && indexed.length > 0 && indexed.every((value) => Number.isInteger(value)))
      return indexed as number[];
    const response = await metadataClient(config).get_attributes({ token_id: tokenId });
    return unwrapResult<number[]>(response.result, `Unable to read attributes for token ${tokenId}`);
  });
}

export async function resolveOnchainTokenMetadata(
  config: DaoNetworkConfig,
  tokenId: number,
  imageUrl: string
): Promise<OnchainTokenMetadata> {
  if (!config.metadataContractId) {
    throw new Error('Missing metadata contract id in the active deployment.');
  }

  const [{ properties, ipfsGroups, description }, attributes] = await Promise.all([
    collection(config),
    tokenAttributes(config, tokenId)
  ]);
  const settings = { description: config.tokenDescription || description };

  if (!attributes?.length || !properties || !ipfsGroups) {
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
