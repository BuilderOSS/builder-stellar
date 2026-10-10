import type { ItemParam } from '@builder-stellar/metadata-bindings';

import type { ArtworkProperty } from '@/stores/create-dao-store';

export type ArtworkPlan = {
  baseUri: string;
  extension: string;
  properties: ArtworkProperty[];
  confirmedBatches: number;
  hash?: string;
  status?: 'submitted' | 'confirmed' | 'failed';
};
export function artworkBatches(properties: ArtworkProperty[]): Array<{ names: string[]; items: ItemParam[] }> {
  if (!properties.length || properties.length > 16) throw new Error('Use between 1 and 16 artwork layers');
  if (new Set(properties.map((p) => p.name)).size !== properties.length) throw new Error('Layer names must be unique');
  for (const p of properties) {
    if (!p.name || /[\\/]/.test(p.name) || !p.items.length || new Set(p.items).size !== p.items.length)
      throw new Error('Each layer needs a unique name and at least one unique item');
  }
  // First call creates all layers with at least one item each. Later calls append
  // to those same absolute property ids, within metadata MAX_ITEMS_PER_CALL (30).
  const items = properties.flatMap((p, property_id) =>
    p.items.slice(1).map((name) => ({ name, property_id, is_new_property: false }))
  );
  const first = properties.map((p, property_id) => ({ name: p.items[0], property_id, is_new_property: true }));
  const batches = [
    {
      names: properties.map((p) => p.name),
      items: [...first, ...items.splice(0, 30 - first.length).map((item) => ({ ...item, is_new_property: true }))]
    }
  ];
  while (items.length) batches.push({ names: [], items: items.splice(0, 30) });
  return batches;
}
export function inspectArtworkDirectory(files: File[]) {
  if (!files.length || files.length > 1000) throw new Error('Choose 1–1,000 artwork files');
  if (files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024)
    throw new Error('Keep the artwork directory under 100 MB');
  const properties = new Map<string, string[]>();
  const seen = new Set<string>();
  let extension = '';
  const paths = files.map((file) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024 || !file.size)
      throw new Error('Each artwork file must be a PNG, JPG, or WebP under 2 MB');
    const segments = file.webkitRelativePath.split('/');
    if (segments.length !== 3 || segments.some((part) => !part || part === '.' || part === '..'))
      throw new Error('Use collection/layer/item.png directories');
    const [, layer, filename] = segments;
    const match = filename.match(/^(.+)\.(png|jpg|jpeg|webp)$/i);
    if (!match) throw new Error('Unsupported artwork filename');
    const ext = `.${match[2].toLowerCase()}`;
    if (extension && extension !== ext) throw new Error('All artwork files must use the same extension');
    extension = ext;
    const path = `${layer}/${filename}`;
    if (seen.has(path)) throw new Error('Duplicate artwork file');
    seen.add(path);
    properties.set(layer, [...(properties.get(layer) ?? []), match[1]]);
    return path;
  });
  const layers = Array.from(properties, ([name, items]) => ({ name, items })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  artworkBatches(layers);
  return { properties: layers, paths, extension };
}
