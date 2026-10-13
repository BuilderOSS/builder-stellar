import { describe, expect, it } from 'vitest';

import { type ArtworkReader, layerUrl, tokenLayers } from './token-layers';

const reader = (overrides: Partial<ArtworkReader> = {}): ArtworkReader => ({
  getAttributes: async () => [2, 1, 0],
  propertyNames: async () => ['0-backgrounds', 'Köpfe & Hüte'],
  getItem: async (property, index) =>
    property === 0
      ? index === 1
        ? { name: 'bg warm', referenceSlot: 0 }
        : null
      : { name: 'crown ✦', referenceSlot: 1 },
  getIpfsGroup: async (slot) =>
    slot === 0 ? { baseUri: 'ipfs://bafyA/', extension: '.png' } : { baseUri: 'ipfs://bafyB/', extension: '.webp' },
  ...overrides
});

describe('token layers from chain', () => {
  it('derives each layer URL with percent-encoded name segments', async () => {
    expect(await tokenLayers(reader(), 7)).toEqual([
      { property: '0-backgrounds', item: 'bg warm', url: 'ipfs://bafyA/0-backgrounds/bg%20warm.png' },
      {
        property: 'Köpfe & Hüte',
        item: 'crown ✦',
        url: 'ipfs://bafyB/K%C3%B6pfe%20%26%20H%C3%BCte/crown%20%E2%9C%A6.webp'
      }
    ]);
  });

  it('skips traits whose property or item no longer exists, as the on-chain JSON does', async () => {
    const layers = await tokenLayers(reader({ propertyNames: async () => ['only-one'] }), 7);
    expect(layers.map((layer) => layer.property)).toEqual(['only-one']);
  });

  it('has no layers for an unseeded token and rejects a truncated record', async () => {
    expect(await tokenLayers(reader({ getAttributes: async () => [] }), 1)).toEqual([]);
    await expect(tokenLayers(reader({ getAttributes: async () => [2, 1] }), 1)).rejects.toThrow('incomplete');
  });

  it('concatenates onto the stored base URI exactly', () => {
    expect(layerUrl('ipfs://x/', 'a', 'b', '.png')).toBe('ipfs://x/a/b.png');
  });
});
