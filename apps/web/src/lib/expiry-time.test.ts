import { describe, expect, it } from 'vitest';

import { expiryInputValue, expiryToUnixSeconds } from './expiry-time';

describe('closing times', () => {
  it('reads datetime-local text in this zone and digits as unix seconds', () => {
    expect(expiryToUnixSeconds('2030-01-01T00:00')).toBe(Math.floor(new Date('2030-01-01T00:00').getTime() / 1000));
    expect(expiryToUnixSeconds('1893456000')).toBe(1893456000);
    expect(expiryToUnixSeconds('')).toBeNull();
    expect(expiryToUnixSeconds('soon')).toBeNull();
    expect(expiryToUnixSeconds('9007199254740993')).toBeNull();
  });

  it('shows stored seconds back in the datetime-local input, round trip', () => {
    const typed = '2030-01-01T09:30';
    const stored = String(expiryToUnixSeconds(typed));
    expect(expiryInputValue(stored)).toBe(typed);
    expect(expiryInputValue(typed)).toBe(typed);
    expect(expiryInputValue('')).toBe('');
  });
});
