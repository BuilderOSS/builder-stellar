import { describe, expect, it } from 'vitest';

import {
  assessEntries,
  classifyRemainingLedgers,
  describeMissing,
  estimateExpiryDate,
  LEDGERS_PER_DAY,
  pluralDays,
  worstTtlStatus
} from './ttl-expiry';

const DAY = LEDGERS_PER_DAY;

describe('classifyRemainingLedgers', () => {
  it('uses 17,280 ledgers per day', () => {
    expect(LEDGERS_PER_DAY).toBe(17_280);
  });

  it('treats the live-until ledger itself and anything after it as expired', () => {
    expect(classifyRemainingLedgers(0)).toBe('expired');
    expect(classifyRemainingLedgers(-1)).toBe('expired');
    expect(classifyRemainingLedgers(-1_000_000)).toBe('expired');
  });

  it('is critical below 14 days and includes one ledger under the boundary', () => {
    expect(classifyRemainingLedgers(1)).toBe('critical');
    expect(classifyRemainingLedgers(14 * DAY - 1)).toBe('critical');
  });

  it('is soon from 14 days up to but not including 45 days', () => {
    expect(classifyRemainingLedgers(14 * DAY)).toBe('soon');
    expect(classifyRemainingLedgers(45 * DAY - 1)).toBe('soon');
  });

  it('is healthy at 45 days and above', () => {
    expect(classifyRemainingLedgers(45 * DAY)).toBe('healthy');
    expect(classifyRemainingLedgers(170 * DAY)).toBe('healthy');
  });

  it('rejects non-finite input instead of classifying it', () => {
    expect(() => classifyRemainingLedgers(Number.NaN)).toThrow();
  });
});

describe('assessEntries', () => {
  const latest = 1_000_000;

  it('uses the minimum live-until across entries as the limiting entry', () => {
    const result = assessEntries(
      [
        { label: 'metadata instance', liveUntilLedgerSeq: latest + 170 * DAY },
        { label: 'Property(0)', liveUntilLedgerSeq: latest + 180 * DAY },
        { label: 'Item(0,0)', liveUntilLedgerSeq: latest + 30 * DAY + 5 },
        { label: 'IpfsGroup(0)', liveUntilLedgerSeq: latest + 90 * DAY }
      ],
      latest
    );

    expect(result.status).toBe('soon');
    expect(result.limitingLabel).toBe('Item(0,0)');
    expect(result.liveUntilLedgerSeq).toBe(latest + 30 * DAY + 5);
    expect(result.remainingLedgers).toBe(30 * DAY + 5);
    expect(result.remainingDays).toBe(30);
    expect(result.missingLabels).toEqual([]);
  });

  it('floors remaining days and reports zero days inside the last day', () => {
    const result = assessEntries([{ label: 'code token', liveUntilLedgerSeq: latest + 15 * DAY + 100 }], latest);
    expect(result.status).toBe('soon');
    expect(result.remainingDays).toBe(15);

    const nearEnd = assessEntries([{ label: 'code token', liveUntilLedgerSeq: latest + 1 }], latest);
    expect(nearEnd.status).toBe('critical');
    expect(nearEnd.remainingDays).toBe(0);
  });

  it('reports a group as expired when its earliest entry has reached live-until', () => {
    const result = assessEntries([{ label: 'code token', liveUntilLedgerSeq: latest }], latest);
    expect(result.status).toBe('expired');
    expect(result.remainingDays).toBe(0);
  });

  it('marks the whole group expired and names every missing entry when one is absent', () => {
    const result = assessEntries(
      [
        { label: 'metadata instance', liveUntilLedgerSeq: latest + 170 * DAY },
        { label: 'Property(2)', liveUntilLedgerSeq: null },
        { label: 'Item(2,0)', liveUntilLedgerSeq: null },
        { label: 'Property(0)', liveUntilLedgerSeq: latest + 180 * DAY }
      ],
      latest
    );

    expect(result.status).toBe('expired');
    expect(result.remainingLedgers).toBeNull();
    expect(result.remainingDays).toBeNull();
    expect(result.liveUntilLedgerSeq).toBeNull();
    expect(result.missingLabels).toEqual(['Property(2)', 'Item(2,0)']);
    expect(result.limitingLabel).toBe('Property(2)');
  });

  it('never reports a missing entry as healthy, even when the others are fresh', () => {
    const result = assessEntries(
      [
        { label: 'code token (abcd1234)', liveUntilLedgerSeq: latest + 170 * DAY },
        { label: 'code metadata (ef011234)', liveUntilLedgerSeq: null }
      ],
      latest
    );
    expect(result.status).toBe('expired');
    expect(result.missingLabels).toEqual(['code metadata (ef011234)']);
  });

  it('treats a non-finite live-until as missing', () => {
    const result = assessEntries([{ label: 'Item(0,1)', liveUntilLedgerSeq: Number.NaN }], latest);
    expect(result.status).toBe('expired');
    expect(result.missingLabels).toEqual(['Item(0,1)']);
  });

  it('rejects an empty group and a bad latest ledger', () => {
    expect(() => assessEntries([], latest)).toThrow();
    expect(() => assessEntries([{ label: 'x', liveUntilLedgerSeq: 1 }], -1)).toThrow();
  });
});

describe('describeMissing', () => {
  it('lists up to three labels and counts the rest', () => {
    expect(describeMissing([])).toBe('');
    expect(describeMissing(['a', 'b'])).toBe('a, b');
    expect(describeMissing(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c and 2 more');
  });
});

describe('worstTtlStatus and copy helpers', () => {
  it('returns the most severe status', () => {
    expect(worstTtlStatus(['healthy', 'soon'])).toBe('soon');
    expect(worstTtlStatus(['critical', 'soon', 'expired'])).toBe('expired');
    expect(worstTtlStatus([])).toBe('healthy');
  });

  it('pluralises days', () => {
    expect(pluralDays(1)).toBe('1 day');
    expect(pluralDays(0)).toBe('0 days');
    expect(pluralDays(44)).toBe('44 days');
  });

  it('estimates expiry at 5 seconds per ledger', () => {
    const now = Date.UTC(2026, 9, 8);
    expect(estimateExpiryDate(DAY, now).getTime()).toBe(now + 86_400_000);
  });
});
