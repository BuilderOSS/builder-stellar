import { describe, expect, it } from 'vitest';

import { parseTokenId } from './token-id';

describe('parseTokenId', () => {
  it('accepts non-negative safe integers', () => {
    expect(parseTokenId('0')).toBe(0);
    expect(parseTokenId('123')).toBe(123);
    expect(parseTokenId('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each(['', ' 1', '+1', '-1', '1.5', '1e3', '1junk', '9007199254740992'])('rejects %j', (value) => {
    expect(() => parseTokenId(value)).toThrow('Invalid token id');
  });
});
