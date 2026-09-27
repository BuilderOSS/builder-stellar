import { ArtworkProperty } from '@/stores/create-dao-store';

/**
 * Starter collection metadata.
 * These are pre-configured, validated collections ready for deployment.
 */
export interface StarterCollection {
  id: string;
  name: string;
  description: string;
  baseUri: string;
  extension: '.png' | '.webp';
  properties: ArtworkProperty[];
  previewTokenIds: number[];
  license: string;
  attribution: string;
}

/**
 * Registry of available starter collections.
 * Each collection is hosted on IPFS and compatible with the renderer.
 */
export const STARTER_COLLECTIONS: StarterCollection[] = [
  {
    id: 'nouns-builder-demo',
    name: 'Builder Demo Collection',
    description: 'A colorful, whimsical collection inspired by Nouns DAO. Perfect for testing and learning.',
    baseUri: 'ipfs://bafybeihcsfjvnjmzivm4gxgt75zwajtfxumyxd7j6ibvloykpg4sx47uca/',
    extension: '.png',
    properties: [
      {
        name: '0-backgrounds',
        items: ['bg-cool', 'bg-warm'],
      },
      {
        name: '1-bodies',
        items: ['body-rust', 'body-blue-sky', 'body-darkbrown'],
      },
      {
        name: '2-accessories',
        items: ['accessory-txt-cc2', 'accessory-txt-ico', 'accessory-flash'],
      },
      {
        name: '3-heads',
        items: ['head-hotdog', 'head-ufo', 'head-goldcoin'],
      },
      {
        name: '4-glasses',
        items: ['glasses-square-teal', 'glasses-square-guava', 'glasses-square-black-rgb'],
      },
    ],
    previewTokenIds: [0, 1, 2, 3, 4],
    license: 'CC0',
    attribution: 'Inspired by Nouns DAO artwork',
  },
];

/**
 * Find a starter collection by ID.
 */
export function getStarterCollection(id: string): StarterCollection | undefined {
  return STARTER_COLLECTIONS.find((c) => c.id === id);
}

/**
 * Get all available starter collections.
 */
export function getAvailableCollections(): StarterCollection[] {
  return STARTER_COLLECTIONS;
}

/**
 * Validate that a collection ID is valid.
 */
export function isValidCollectionId(id: string): boolean {
  return STARTER_COLLECTIONS.some((c) => c.id === id);
}

/**
 * Generate a preview URL for a token in a starter collection.
 * Used to show randomized previews in the UI.
 */
export function getTokenPreviewUrl(
  daoId: string,
  collectionId: string,
  tokenId: number,
  rendererBase: string = 'https://builder-stellar-web.vercel.app/api/render/'
): string {
  return `${rendererBase}${daoId}/${tokenId}`;
}

/**
 * Get a random token ID from a collection's preview list.
 */
export function getRandomPreviewTokenId(collection: StarterCollection): number {
  const idx = Math.floor(Math.random() * collection.previewTokenIds.length);
  return collection.previewTokenIds[idx];
}
