import { describe, expect, it } from 'vitest';

import { MAX_OFFSET, parseLimit, parseList, parseNonNegativeInteger, parseOffset } from '@/lib/api-pagination';

describe('API pagination parsing', () => {
  it('accepts zero and rejects malformed offsets', () => {
    expect(parseNonNegativeInteger('0', 7)).toBe(0);
    expect(parseNonNegativeInteger('24', 7)).toBe(24);
    expect(parseNonNegativeInteger('-1', 7)).toBe(7);
    expect(parseNonNegativeInteger('2.5', 7)).toBe(7);
    expect(parseNonNegativeInteger('2foo', 7)).toBe(7);
  });

  it('caps limits; raw integers are not capped', () => {
    expect(parseLimit('101', 8)).toBe(100);
    expect(parseLimit('0', 8)).toBe(8);
    expect(parseLimit(null, 8)).toBe(8);
    expect(parseNonNegativeInteger('200', 0)).toBe(200);
  });

  it('bounds list offsets so a deep OFFSET cannot be used as a scan', () => {
    expect(parseOffset('200')).toBe(200);
    expect(parseOffset(null)).toBe(0);
    expect(parseOffset('nope')).toBe(0);
    expect(parseOffset(String(MAX_OFFSET + 1))).toBe(MAX_OFFSET);
  });

  it('parses comma lists trimmed, de-duplicated and capped', () => {
    expect(parseList(' a, b ,,a')).toEqual(['a', 'b']);
    expect(parseList(undefined)).toEqual([]);
    expect(parseList(Array.from({ length: 30 }, (_, i) => `k${i}`).join(','))).toHaveLength(20);
    expect(parseList('a,b,c', 2)).toEqual(['a', 'b']);
  });
});
