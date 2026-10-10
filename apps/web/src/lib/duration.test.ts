import { describe, expect, it } from 'vitest';

import { combineDuration, formatCountdown, formatDuration, splitDuration } from './duration';

describe('formatDuration', () => {
  it('uses short units, largest first, two at most by default', () => {
    expect(formatDuration(300)).toBe('5m');
    expect(formatDuration(86400 * 2 + 3600 * 4)).toBe('2d 4h');
    expect(formatDuration(86400 + 1800)).toBe('1d 30m');
    expect(formatDuration(86400 + 3600 + 60 + 1)).toBe('1d 1h');
    expect(formatDuration(86400 + 3600 + 60 + 1, { maxUnits: 4 })).toBe('1d 1h 1m 1s');
  });

  it('spells units out in long style', () => {
    expect(formatDuration(86400 * 2 + 3600, { style: 'long' })).toBe('2 days 1 hour');
    expect(formatDuration(1, { style: 'long' })).toBe('1 second');
  });

  it('handles zero, negatives and non-finite input', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('formatCountdown', () => {
  it('shows the two most useful units', () => {
    expect(formatCountdown(86400 * 3 + 3600 * 5 + 7)).toBe('3d 5h');
    expect(formatCountdown(3600 * 4 + 60 * 7)).toBe('4h 07m');
    expect(formatCountdown(60 * 12 + 5)).toBe('12m 05s');
    expect(formatCountdown(45)).toBe('45s');
    expect(formatCountdown(0)).toBe('0s');
  });
});

describe('splitDuration', () => {
  it('round-trips through combineDuration', () => {
    const seconds = 86400 * 2 + 3600 * 3 + 60 * 4 + 5;
    expect(combineDuration(splitDuration(seconds))).toBe(seconds);
  });
});
