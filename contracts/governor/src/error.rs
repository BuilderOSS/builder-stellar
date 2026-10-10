use soroban_sdk::contracterror;

/// Governor-specific errors (block `common::error::codes::GOVERNOR`).
/// Lifecycle errors shared with OpenZeppelin's governor (proposal not found,
/// not active, already executed, ...) keep their library codes (5000s).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CustomGovernorError {
    /// Queue delay below `MIN_QUEUE_DELAY`
    InvalidQueueDelay = 7501,
    /// Proposal threshold is zero or exceeds the voting supply
    InvalidProposalThreshold = 7502,
    /// Quorum basis points outside 1..=10000
    InvalidQuorumBps = 7503,
    /// Voting delay below `MIN_VOTING_DELAY`
    InvalidVotingDelay = 7504,
    /// Voting period below `MIN_VOTING_PERIOD`
    InvalidVotingPeriod = 7505,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 7506,
    /// `execute` is disabled; call `treasury.execute` instead
    UseTreasuryExecute = 7507,
    /// Proposal has more than `MAX_PROPOSAL_ACTIONS` actions
    TooManyActions = 7508,
    /// Voting delay above `MAX_VOTING_DELAY` (30 days)
    VotingDelayTooLong = 7509,
    /// Voting period above `MAX_VOTING_PERIOD` (30 days)
    VotingPeriodTooLong = 7510,
    /// Queue delay above `MAX_QUEUE_DELAY` (30 days)
    QueueDelayTooLong = 7511,
    /// The voter had no voting power at the proposal snapshot
    ZeroVotingWeight = 7512,
    /// The proposal is queued but its ETA has not been reached
    ProposalNotReady = 7513,
}
