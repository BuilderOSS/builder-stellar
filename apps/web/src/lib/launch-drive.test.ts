import { describe, expect, it } from 'vitest';

import { driveLinkReleasable, launchDriveEnded, launchDriveState, releaseSlugFailure } from './launch-drive';

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

describe('driveLinkReleasable', () => {
  it('opens once the deadline passes while the link is still held', () => {
    expect(driveLinkReleasable(drive('open'), DEADLINE - 10)).toBe(false);
    expect(driveLinkReleasable(drive('open'), DEADLINE)).toBe(false);
    expect(driveLinkReleasable(drive('open'), DEADLINE + 1)).toBe(true);
  });

  it('waits for the clock and a deadline', () => {
    expect(driveLinkReleasable(drive('open'), null)).toBe(false);
    expect(driveLinkReleasable(drive('open', null), DEADLINE + 10)).toBe(false);
  });

  it('is gone once the index says the link is released, and never applies to a launched or driveless tribe', () => {
    expect(driveLinkReleasable(drive('released'), DEADLINE + 10)).toBe(false);
    expect(driveLinkReleasable(drive('launched'), DEADLINE + 10)).toBe(false);
    expect(driveLinkReleasable(drive(null, null), DEADLINE + 10)).toBe(false);
  });
});

describe('releaseSlugFailure', () => {
  const contractError = (code: number) => new Error(`HostError: Error(Contract, #${code})`);

  it('treats SlugNotFound (7128) as done: someone freed the link first', () => {
    expect(releaseSlugFailure(contractError(7128))).toMatchObject({ freed: true, title: 'The link is already free' });
  });

  it('explains AssuranceNotFailed (7142) as the deadline not having passed yet', () => {
    const failure = releaseSlugFailure(contractError(7142));
    expect(failure).toMatchObject({ freed: false, title: 'The drive has not ended yet' });
    expect((failure.error as Error).message).toContain('deadline');
  });

  it('passes anything else through unchanged', () => {
    const error = contractError(7101);
    expect(releaseSlugFailure(error)).toEqual({ freed: false, title: 'Free the link failed', error });
    const rejected = new Error('User declined access');
    expect(releaseSlugFailure(rejected).error).toBe(rejected);
  });
});
