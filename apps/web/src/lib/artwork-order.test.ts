import { describe, expect, it } from 'vitest';

import { compareArtworkNames, sortArtworkProperties } from '@/lib/artwork-order';

describe('artwork ordering', () => {
  it('sorts numeric prefixes naturally instead of lexically', () => {
    expect(['10-details', '2-bodies', '0-backgrounds', '1-heads'].sort(compareArtworkNames)).toEqual([
      '0-backgrounds',
      '1-heads',
      '2-bodies',
      '10-details'
    ]);
  });

  it('puts unnumbered names after numbered layers and sorts items', () => {
    expect(
      sortArtworkProperties([
        { name: 'Accessories', items: ['item-10', 'item-2', 'item-1'] },
        { name: '1-bodies', items: ['body-2', 'body-10', 'body-1'] },
        { name: '0-backgrounds', items: ['bg-warm', 'bg-cool'] }
      ])
    ).toEqual([
      { name: '0-backgrounds', items: ['bg-cool', 'bg-warm'] },
      { name: '1-bodies', items: ['body-1', 'body-2', 'body-10'] },
      { name: 'Accessories', items: ['item-1', 'item-2', 'item-10'] }
    ]);
  });
});
