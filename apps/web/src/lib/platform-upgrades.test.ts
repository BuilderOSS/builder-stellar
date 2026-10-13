import { describe, expect, it } from 'vitest';

import { describePending, memberNotice, type PlatformContractState } from './platform-upgrades';

describe('describePending', () => {
  const running = 'aa'.repeat(32);
  const latest = { hash: 'bb'.repeat(32), version: '0.4.0', announcedLedger: 900 };
  it('is pending only when a newer latest hash has an approval', () => {
    expect(describePending(running, latest, 1_000, 720)).toEqual({
      toHash: latest.hash,
      version: '0.4.0',
      approvedLedger: 1_000,
      announcedLedger: 900,
      earliestLedger: 1_720,
      revoked: false
    });
    // A revoked latest is still the pointer, but can never apply.
    expect(describePending(running, { ...latest, revoked: true }, 1_000, 720)?.revoked).toBe(true);
    // Announced after the approval: the notice counts from the announcement (D42).
    expect(describePending(running, { ...latest, announcedLedger: 5_000 }, 1_000, 720)?.earliestLedger).toBe(5_720);
    expect(describePending(running, latest, null, 720)).toBeNull(); // registered, not approved
    expect(describePending(running, { hash: running, version: '0.3.0', announcedLedger: 1 }, 5, 720)).toBeNull(); // already running
    expect(describePending(null, latest, 1_000, 720)).toBeNull(); // instance unreadable
    expect(describePending(running, null, 1_000, 720)).toBeNull();
  });
});

describe('memberNotice', () => {
  const state = (earliestLedger: number | null, revoked = false): PlatformContractState => ({
    contract: 'manager',
    address: 'C',
    running: 'aa'.repeat(32),
    notice: 720,
    pending:
      earliestLedger === null
        ? null
        : { toHash: 'bb'.repeat(32), version: '0.4.0', approvedLedger: 1, announcedLedger: 1, earliestLedger, revoked }
  });
  it('tells members about a pending Manager upgrade', () => {
    expect(memberNotice({ manager: state(500), errors: [] })).toMatchObject({
      kind: 'pending',
      contract: 'manager',
      earliestLedger: 500
    });
  });
  it('is quiet with nothing pending, and says when the check is incomplete', () => {
    expect(memberNotice({ manager: null, errors: ['rpc'] })).toEqual({ kind: 'unchecked' });
    expect(memberNotice({ manager: state(null), errors: [] })).toBeNull();
  });
  it('ignores a revoked latest, which can never apply', () => {
    expect(memberNotice({ manager: state(900, true), errors: [] })).toBeNull();
  });
});
