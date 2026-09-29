import type { ArtworkProperty } from '@/stores/create-dao-store';

function numericPrefix(value: string) {
  const match = value.trim().match(/^(\d+)(?:-|_|\s|$)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function compareArtworkNames(a: string, b: string) {
  const aPrefix = numericPrefix(a);
  const bPrefix = numericPrefix(b);

  if (aPrefix !== null && bPrefix !== null && aPrefix !== bPrefix) return aPrefix - bPrefix;
  if (aPrefix !== null && bPrefix === null) return -1;
  if (aPrefix === null && bPrefix !== null) return 1;

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortArtworkProperties(properties: ArtworkProperty[]) {
  return [...properties]
    .map((property) => ({ ...property, items: [...property.items].sort(compareArtworkNames) }))
    .sort((a, b) => compareArtworkNames(a.name, b.name));
}
