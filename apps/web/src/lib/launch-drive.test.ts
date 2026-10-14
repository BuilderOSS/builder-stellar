import { describe, expect, it } from 'vitest';

import { launchDriveEnded, launchDriveState } from './launch-drive';

const DEADLINE = 1_900_000_000;
const drive = (
  assuranceOutcome: 'open' | 'launched' | 'released' | null,
  assuranceDeadline: number | null = DEADLINE
) => ({
  assuranceOutcome,
  assuranceDeadline
});

describe('launchDriveEnded', () => {
  it('follows the Manager: a drive fails only once the clock is past the deadline', () => {
    expect(launchDriveEnded(DEADLINE, DEADLINE - 1)).toBe(false);
    expect(launchDriveEnded(DEADLINE, DEADLINE)).toBe(false);
    expect(launchDriveEnded(DEADLINE, DEADLINE + 0.5)).toBe(true);
  });
});

describe('launchDriveState', () => {
  it('shows no drive without one or once the community launched', () => {
    expect(launchDriveState(drive(null, null), DEADLINE + 10)).toBeNull();
    expect(launchDriveState(drive('launched'), DEADLINE + 10)).toBeNull();
    expect(launchDriveState(drive('launched'), DEADLINE - 10)).toBeNull();
  });

  it('says ended once the deadline passes, before anyone releases the slug', () => {
    expect(launchDriveState(drive('open'), DEADLINE - 10)).toBe('open');
    expect(launchDriveState(drive('open'), DEADLINE + 10)).toBe('ended');
  });

  it('agrees with the setup page for the same deadline and clock', () => {
    for (const now of [DEADLINE - 60, DEADLINE, DEADLINE + 60]) {
      expect(launchDriveState(drive('open'), now) === 'ended').toBe(launchDriveEnded(DEADLINE, now));
    }
  });

  it('treats a released slug as ended, and stays open until the clock or a deadline is known', () => {
    expect(launchDriveState(drive('released'), DEADLINE + 10)).toBe('ended');
    expect(launchDriveState(drive('released'), null)).toBe('ended');
    expect(launchDriveState(drive('open'), null)).toBe('open');
    expect(launchDriveState(drive('open', null), DEADLINE + 10)).toBe('open');
  });
});
