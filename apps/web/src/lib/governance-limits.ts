/**
 * On-chain limits enforced by the Manager and Governor contracts. Keep in sync with
 * contracts/governor (MAX_VOTING_DELAY etc.), contracts/manager and docs/SECURITY_MODEL.md.
 */
export const MIN_GOVERNANCE_TIMING_SECONDS = 300;
export const MAX_GOVERNANCE_TIMING_SECONDS = 2_592_000; // 30 days
export const MIN_AUCTION_TIME_BUFFER_SECONDS = 1;
export const MAX_AUCTION_TIME_BUFFER_SECONDS = 86_400;
export const MIN_QUORUM_BPS = 1;
export const MAX_QUORUM_BPS = 10_000;
/** Proposal threshold is an absolute number of votes (not basis points). */
export const MIN_PROPOSAL_THRESHOLD_VOTES = 1n;
/** Governor MAX_PROPOSAL_ACTIONS */
export const MAX_PROPOSAL_ACTIONS = 20;

function formatLimit(seconds: number) {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} day${seconds === 86_400 ? '' : 's'}`;
  if (seconds % 60 === 0) return `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

function validateTiming(label: string, seconds: number): string | null {
  if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) return `${label} must be a whole number of seconds`;
  if (seconds < MIN_GOVERNANCE_TIMING_SECONDS) {
    return `${label} must be at least ${formatLimit(MIN_GOVERNANCE_TIMING_SECONDS)}`;
  }
  if (seconds > MAX_GOVERNANCE_TIMING_SECONDS) {
    return `${label} cannot exceed ${formatLimit(MAX_GOVERNANCE_TIMING_SECONDS)}`;
  }
  return null;
}

export const validateVotingDelay = (seconds: number) => validateTiming('Voting delay', seconds);
export const validateVotingPeriod = (seconds: number) => validateTiming('Voting period', seconds);
export const validateQueueDelay = (seconds: number) => validateTiming('Queue delay', seconds);

export function validateAuctionTimeBuffer(seconds: number): string | null {
  if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) return 'Time buffer must be a whole number of seconds';
  if (seconds < MIN_AUCTION_TIME_BUFFER_SECONDS || seconds > MAX_AUCTION_TIME_BUFFER_SECONDS) {
    return `Time buffer must be between ${MIN_AUCTION_TIME_BUFFER_SECONDS} and ${MAX_AUCTION_TIME_BUFFER_SECONDS} seconds`;
  }
  return null;
}

export function validateQuorumBps(bps: number): string | null {
  if (!Number.isFinite(bps) || !Number.isInteger(bps)) return 'Quorum must be a whole number of basis points';
  if (bps < MIN_QUORUM_BPS || bps > MAX_QUORUM_BPS) {
    return `Quorum must be between 0.01% and 100% (${MIN_QUORUM_BPS}-${MAX_QUORUM_BPS} basis points)`;
  }
  return null;
}

/** Proposal threshold is an absolute vote count and must be at least 1. */
export function validateProposalThreshold(votes: number | bigint): string | null {
  if (typeof votes === 'number' && (!Number.isFinite(votes) || !Number.isInteger(votes))) {
    return 'Proposal threshold must be a whole number of votes';
  }
  if (BigInt(votes) < MIN_PROPOSAL_THRESHOLD_VOTES) return 'Proposal threshold must be at least 1 vote';
  return null;
}

export function validateProposalActionCount(count: number): string | null {
  if (count > MAX_PROPOSAL_ACTIONS) {
    return `A proposal can have at most ${MAX_PROPOSAL_ACTIONS} actions (currently ${count}).`;
  }
  return null;
}
