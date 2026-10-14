import { describe, expect, it } from 'vitest';

import { formatCardAmount, formatTimeLeft, proposalChip, shortAddress } from './format';

describe('share card formatting', () => {
  it('rounds amounts for a card, with the asset code', () => {
    expect(formatCardAmount('12500000000', 'XLM')).toBe('1,250 XLM');
    expect(formatCardAmount('5000000', 'USDC')).toBe('0.5 USDC');
    expect(formatCardAmount(10_000_000n)).toBe('1');
    expect(formatCardAmount('1234567', 'XLM')).toBe('0.12 XLM');
  });

  it('writes time left the way the app does', () => {
    const now = 1_000_000;
    expect(formatTimeLeft(now + 2 * 86_400 + 4 * 3600 + 59, now)).toBe('2d 4h');
    expect(formatTimeLeft(now + 3 * 3600 + 12 * 60, now)).toBe('3h 12m');
    expect(formatTimeLeft(now + 30, now)).toBe('1m');
    expect(formatTimeLeft(now, now)).toBe('Ended');
  });

  it('shortens addresses and pairs a proposal state with its colour', () => {
    expect(shortAddress('GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO')).toBe('GCLG…U6CO');
    expect(proposalChip('Active')).toMatchObject({ tone: 'live' });
    expect(proposalChip('Defeated')).toMatchObject({ tone: 'danger' });
    expect(proposalChip('Executed')).toMatchObject({ tone: 'success' });
  });
});
