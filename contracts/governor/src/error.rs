use soroban_sdk::contracterror;

// Custom errors for governor contract-specific validations
// Using 1500+ range to avoid conflicts with stellar_governance library errors
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CustomGovernorError {
    /// Queue delay below minimum (must be >= 5 minutes)
    InvalidQueueDelay = 1500,
    /// Proposal threshold exceeds total token supply
    InvalidProposalThreshold = 1501,
    /// Quorum basis points invalid (must be <= 10000)
    InvalidQuorumBps = 1502,
    /// Owner not set in contract storage
    OwnerNotSet = 1503,
    /// Voting delay below minimum (must be >= 5 minutes)
    InvalidVotingDelay = 1505,
    /// Voting period below minimum (must be >= 5 minutes)
    InvalidVotingPeriod = 1506,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 1507,
    /// `execute` is disabled; call `treasury.execute` instead
    UseTreasuryExecute = 1508,
    /// Proposal has more than `MAX_PROPOSAL_ACTIONS` actions
    TooManyActions = 1509,
    /// Voting delay above `MAX_VOTING_DELAY` (30 days)
    VotingDelayTooLong = 1510,
    /// Voting period above `MAX_VOTING_PERIOD` (30 days)
    VotingPeriodTooLong = 1511,
    /// Queue delay above `MAX_QUEUE_DELAY` (30 days)
    QueueDelayTooLong = 1512,
}
