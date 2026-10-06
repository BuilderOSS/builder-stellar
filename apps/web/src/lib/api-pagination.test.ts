import { describe, expect, it } from 'vitest';

import { parseLimit, parseNonNegativeInteger } from '@/lib/api-pagination';

describe('API pagination parsing', () => {
  it('accepts zero and rejects malformed offsets', () => {
    expect(parseNonNegativeInteger('0', 7)).toBe(0);
    expect(parseNonNegativeInteger('24', 7)).toBe(24);
    expect(parseNonNegativeInteger('-1', 7)).toBe(7);
    expect(parseNonNegativeInteger('2.5', 7)).toBe(7);
    expect(parseNonNegativeInteger('2foo', 7)).toBe(7);
  });

  it('caps limits without capping offsets', () => {
    expect(parseLimit('101', 8)).toBe(100);
    expect(parseLimit('0', 8)).toBe(8);
    expect(parseLimit(null, 8)).toBe(8);
    expect(parseNonNegativeInteger('200', 0)).toBe(200);
  });
});
