/**
 * A token's artwork layers, derived from chain with bounded reads
 * (docs/STORAGE_DIET.md § 5): `get_attributes(token)` (property count, then
 * one item index per property), `property_headers()` for the names, then per
 * trait `get_items(property, index, 1)` for the item name and reference slot,
 * and `get_ipfs_group(slot)` for the base URI and extension. At most
 * 2 + 2 × 16 small reads; never `get_properties()` (it reads every item).
 *
 * Layer URL: `base_uri + encode(property) + "/" + encode(item) + extension`,
 * each name percent-encoded as one path segment.
 */
export type TokenLayer = { property: string; item: string; url: string };

export type ArtworkReader = {
  getAttributes(tokenId: number): Promise<number[]>;
  propertyNames(): Promise<string[]>;
  getItem(propertyId: number, index: number): Promise<{ name: string; referenceSlot: number } | null>;
  getIpfsGroup(slot: number): Promise<{ baseUri: string; extension: string } | null>;
};

/**
 * The published rule: `base_uri` as stored (artwork uploads end it with "/"),
 * then each name as one percent-encoded path segment.
 */
export function layerUrl(baseUri: string, property: string, item: string, extension: string) {
  return `${baseUri}${encodeURIComponent(property)}/${encodeURIComponent(item)}${extension}`;
}

export async function tokenLayers(reader: ArtworkReader, tokenId: number): Promise<TokenLayer[]> {
  const [attributes, names] = await Promise.all([reader.getAttributes(tokenId), reader.propertyNames()]);
  const count = attributes[0] ?? 0;
  if (!count) return [];
  if (attributes.length < count + 1) throw new Error(`Token ${tokenId} has an incomplete attribute record.`);
  const layers = await Promise.all(
    Array.from({ length: count }, async (_, propertyId) => {
      const property = names[propertyId];
      const item = await reader.getItem(propertyId, attributes[propertyId + 1]!);
      // A property or item removed by a reset: the on-chain JSON skips the trait too.
      if (property === undefined || !item) return null;
      const group = await reader.getIpfsGroup(item.referenceSlot);
      if (!group) return null;
      return { property, item: item.name, url: layerUrl(group.baseUri, property, item.name, group.extension) };
    })
  );
  return layers.filter((layer): layer is TokenLayer => layer !== null);
}
