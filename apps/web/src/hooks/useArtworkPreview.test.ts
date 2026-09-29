import { describe, expect, it } from 'vitest';

import { pickRandomArtworkItem } from '@/hooks/useArtworkPreview';

describe('pickRandomArtworkItem', () => {
  it('selects an item using the provided random value', () => {
    expect(pickRandomArtworkItem(['base', 'alt', 'rare'], () => 0)).toBe('base');
    expect(pickRandomArtworkItem(['base', 'alt', 'rare'], () => 0.5)).toBe('alt');
    expect(pickRandomArtworkItem(['base', 'alt', 'rare'], () => 0.99)).toBe('rare');
  });

  it('handles properties without items', () => {
    expect(pickRandomArtworkItem([])).toBe('');
  });
});
