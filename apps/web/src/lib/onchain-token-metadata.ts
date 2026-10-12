import type { IpfsGroup, Item, PropertyHeader } from '@builder-stellar/metadata-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { type ArtworkReader, tokenLayers } from '@/lib/chain-reads/token-layers';
import { type DaoNetworkConfig, readSource } from '@/lib/dao-config';
import { plainSummary } from '@/lib/dao-profile';
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

function metadataClient(config: DaoNetworkConfig) {
  return new MetadataClient({
    contractId: config.metadataContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: readSource(config.launchAdmin),
    allowHttp: config.rpcUrl.startsWith('http://')
  });
}

/** A Metadata reader for `tokenLayers`, with each read cached per contract. */
function artworkReader(config: DaoNetworkConfig): ArtworkReader {
  const metadata = metadataClient(config);
  const contract = config.metadataContractId;
  return {
    getAttributes: (tokenId) => tokenAttributes(config, tokenId),
    // Names and items change only by an artwork reset; groups are append-only.
    propertyNames: () =>
      cached(`artwork-names:${contract}`, 5 * 60_000, async () =>
        (await metadata.property_headers()).result.map((header: PropertyHeader) => header.name)
      ),
    getItem: (propertyId, index) =>
      cached(`artwork-item:${contract}:${propertyId}:${index}`, 5 * 60_000, async () => {
        const items = unwrapResult<Item[]>(
          (await metadata.get_items({ property_id: propertyId, start: index, limit: 1 })).result,
          `Unable to read item ${index} of property ${propertyId}`
        );
        const item = items[0];
        return item ? { name: item.name, referenceSlot: item.reference_slot } : null;
      }),
    getIpfsGroup: (slot) =>
      cached(`artwork-group:${contract}:${slot}`, 60 * 60_000, async () => {
        const group = (await metadata.get_ipfs_group({ index: slot })).result as IpfsGroup | null;
        return group ? { baseUri: group.base_uri, extension: group.extension } : null;
      })
  };
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
  const artwork = await tokenLayers(artworkReader(config), tokenId);
  if (!artwork.length) throw new Error(`No metadata found for token ${tokenId}`);
  return {
    name: `${config.tokenName} #${tokenId}`,
    // The on-chain token JSON omits the description (it lives in the profile).
    description: plainSummary(config.profile.description),
    image: imageUrl,
    attributes: [
      { trait_type: 'Token ID', value: String(tokenId) },
      { trait_type: 'Token Symbol', value: config.tokenSymbol },
      ...artwork.map(({ property, item }) => ({ trait_type: property, value: item }))
    ],
    artwork
  };
}
