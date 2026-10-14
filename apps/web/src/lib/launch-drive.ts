import { parseContractErrorCode } from './contract-errors';
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

/**
 * A failed drive still holds its link: the deadline passed without a launch and nobody has freed the
 * link yet (`release_slug`, open to anyone). The indexed outcome flips to `released` once someone has.
 */
export function driveLinkReleasable(
  config: Pick<DaoNetworkConfig, 'assuranceOutcome' | 'assuranceDeadline'>,
  nowSeconds: number | null
) {
  return config.assuranceOutcome === 'open' && launchDriveState(config, nowSeconds) === 'ended';
}

/**
 * How `release_slug` can fail for a reason worth saying plainly: 7128 (`SlugNotFound`) means someone
 * freed the link first, so there is nothing left to do; 7142 (`AssuranceNotFailed`) means the network's
 * clock hasn't passed the deadline yet.
 */
export function releaseSlugFailure(error: unknown): { freed: boolean; title: string; error: unknown } {
  const code = parseContractErrorCode(error);
  if (code === 7128)
    return { freed: true, title: 'The link is already free', error: new Error('Someone freed it first.') };
  if (code === 7142)
    return {
      freed: false,
      title: 'The drive has not ended yet',
      error: new Error('The network’s clock is still before the deadline. Try again in a minute.')
    };
  return { freed: false, title: 'Free the link failed', error };
}
