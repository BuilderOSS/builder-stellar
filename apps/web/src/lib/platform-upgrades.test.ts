import { describe, expect, it } from 'vitest';

import { describePending } from './platform-upgrades';

describe('describePending', () => {
  const running = 'aa'.repeat(32);
  const latest = { hash: 'bb'.repeat(32), version: '0.4.0' };
  it('is pending only when a newer latest hash has an approval', () => {
    expect(describePending(running, latest, 1_000, 720)).toEqual({
      toHash: latest.hash,
      version: '0.4.0',
      approvedLedger: 1_000,
      earliestLedger: 1_720
    });
    expect(describePending(running, latest, null, 720)).toBeNull(); // registered, not approved
    expect(describePending(running, { hash: running, version: '0.3.0' }, 5, 720)).toBeNull(); // already running
    expect(describePending(null, latest, 1_000, 720)).toBeNull(); // instance unreadable
    expect(describePending(running, null, 1_000, 720)).toBeNull();
  });
});
