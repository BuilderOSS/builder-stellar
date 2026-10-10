import { describe, expect, it } from 'vitest';

import { artworkBatches, inspectArtworkDirectory } from './artwork-configuration';

const file = (path: string, type = 'image/png') => {
  const value = new File(['bytes'], path.split('/').pop()!, { type });
  Object.defineProperty(value, 'webkitRelativePath', { value: path });
  return value;
};
describe('artwork planning preserved in Setup', () => {
  it('retains every uploaded trait and creates contract-bounded explicit batches', () => {
    const properties = Array.from({ length: 16 }, (_, i) => ({
      name: `layer-${i}`,
      items: Array.from({ length: 12 }, (_, j) => `item-${j}`)
    }));
    const batches = artworkBatches(properties);
    expect(batches[0].names).toEqual(properties.map((p) => p.name));
    expect(batches[0].items.filter((item) => item.is_new_property)).toHaveLength(30);
    expect(new Set(batches[0].items.map((item) => item.property_id)).size).toBe(16);
    expect(batches.every((batch) => batch.items.length <= 30)).toBe(true);
    expect(batches.flatMap((batch) => batch.items)).toHaveLength(192);
    expect(
      batches.slice(1).every((batch) => batch.names.length === 0 && batch.items.every((item) => !item.is_new_property))
    ).toBe(true);
  });
  it('uses durable directory paths without the local root folder', () => {
    expect(inspectArtworkDirectory([file('collection/background/blue.png'), file('collection/head/cat.png')])).toEqual({
      properties: [
        { name: 'background', items: ['blue'] },
        { name: 'head', items: ['cat'] }
      ],
      paths: ['background/blue.png', 'head/cat.png'],
      extension: '.png'
    });
  });
  it('rejects ambiguous mixed extensions, nested directories, duplicate items, and unsupported files', () => {
    expect(() =>
      inspectArtworkDirectory([file('collection/a/b.png'), file('collection/a/c.webp', 'image/webp')])
    ).toThrow('same extension');
    expect(() => inspectArtworkDirectory([file('collection/a/nested/b.png')])).toThrow('directories');
    expect(() => inspectArtworkDirectory([file('collection/a/b.png'), file('collection/a/b.png')])).toThrow(
      'Duplicate'
    );
    expect(() => inspectArtworkDirectory([file('collection/a/b.svg', 'image/svg+xml')])).toThrow('PNG');
  });
  it('rejects empty/new layers without items instead of producing a contract-invalid batch', () => {
    expect(() => artworkBatches([])).toThrow('16');
    expect(() => artworkBatches([{ name: 'head', items: [] }])).toThrow('item');
    expect(() =>
      artworkBatches([
        { name: 'head', items: ['cat'] },
        { name: 'head', items: ['dog'] }
      ])
    ).toThrow('unique');
  });
});
