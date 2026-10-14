import type { DaoNetworkConfig } from './dao-config';

/**
 * The Manager's failure rule: once the deadline passes without a launch, the drive can only
 * refund (`drive_failed`, timestamp > deadline). Every page decides from the deadline, because the
 * indexed `released` outcome only appears once someone frees the slug (`release_slug`) afterwards.
 */
export function launchDriveEnded(deadline: number, nowSeconds: number) {
  return nowSeconds > deadline;
}

/**
 * Where a pending community's launch drive stands; null without a drive or once it launched (the
 * indexed outcome is the only signal for that). Otherwise the deadline decides; a released slug
 * also means it ended, which covers the first render before the clock is known.
 */
export function launchDriveState(
  config: Pick<DaoNetworkConfig, 'assuranceOutcome' | 'assuranceDeadline'>,
  nowSeconds: number | null
): 'open' | 'ended' | null {
  const { assuranceOutcome: outcome, assuranceDeadline: deadline } = config;
  if (outcome !== 'open' && outcome !== 'released') return null;
  if (outcome === 'released') return 'ended';
  return nowSeconds !== null && deadline !== null && launchDriveEnded(deadline, nowSeconds) ? 'ended' : 'open';
}
