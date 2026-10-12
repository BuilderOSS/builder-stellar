import { describe, expect, it } from 'vitest';

import { type CommunitySort, compareCommunities } from './community-grid';

const communities = [
  { name: 'Lantern', createdLedger: 20 },
  { name: 'Anchor', createdLedger: 30 },
  { name: 'Mesa', createdLedger: 10 }
];

const order = (sort: CommunitySort) =>
  [...communities].sort((a, b) => compareCommunities(sort, a, b)).map((item) => item.name);

describe('compareCommunities', () => {
  it('sorts by creation in both directions', () => {
    expect(order('newest')).toEqual(['Anchor', 'Lantern', 'Mesa']);
    expect(order('oldest')).toEqual(['Mesa', 'Lantern', 'Anchor']);
  });

  it('sorts by name in both directions', () => {
    expect(order('name')).toEqual(['Anchor', 'Lantern', 'Mesa']);
    expect(order('name-desc')).toEqual(['Mesa', 'Lantern', 'Anchor']);
  });
});
