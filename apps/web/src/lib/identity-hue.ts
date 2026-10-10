/**
 * Stable, warm-tuned hue for an address or contract id. Used for identicons and
 * community crest tints so every account and community has a recognisable
 * colour without per-community configuration.
 */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function identityHue(value: string): number {
  return hashString(value || 'builder') % 360;
}

/** 5x5 mirrored identicon cells (15 bits used), true = filled. */
export function identiconCells(value: string): boolean[] {
  const seed = hashString(`${value}:cells`);
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row += 1) {
    const half = [0, 1, 2].map((column) => ((seed >> (row * 3 + column)) & 1) === 1);
    cells.push(half[0], half[1], half[2], half[1], half[0]);
  }
  return cells;
}

/** Up to two initials from a community or person name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
