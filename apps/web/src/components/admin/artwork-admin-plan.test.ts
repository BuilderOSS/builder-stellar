import { describe, expect, it } from 'vitest';

import { artworkAppendPlan } from './artwork-admin-plan';

describe('artwork append proposal batching', () => {
  it('uses relative new-property IDs only in the first call and offsets all following batches', () => {
    const batches = artworkAppendPlan(
      {
        baseUri: 'ipfs://collection',
        extension: '.png',
        confirmedBatches: 0,
        properties: [{ name: 'head', items: Array.from({ length: 70 }, (_, id) => `head-${id}`) }]
      },
      4
    );
    expect(batches.map((batch) => batch.items.length)).toEqual([30, 30, 10]);
    expect(batches[0].names).toEqual(['head']);
    expect(batches[0].items.every((item) => item.property_id === 0 && item.is_new_property)).toBe(true);
    expect(
      batches
        .slice(1)
        .every(
          (batch) => !batch.names.length && batch.items.every((item) => item.property_id === 4 && !item.is_new_property)
        )
    ).toBe(true);
    expect(batches.every((batch) => batch.ipfsGroup.base_uri === 'ipfs://collection')).toBe(true);
  });
  it('never exceeds the contract property cap or accepts negative counts', () => {
    const plan = {
      baseUri: 'ipfs://collection',
      extension: '.png',
      confirmedBatches: 0,
      properties: [{ name: 'head', items: ['one'] }]
    };
    expect(() => artworkAppendPlan(plan, 16)).toThrow(/16 properties/);
    expect(() => artworkAppendPlan(plan, -1)).toThrow();
    expect(artworkAppendPlan(plan, 15)).toHaveLength(1);
  });
});
