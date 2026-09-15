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
    /// Caller is not authorized to perform this action
    UnauthorizedCaller = 1504,
    /// Voting delay below minimum (must be >= 5 minutes)
    InvalidVotingDelay = 1505,
    /// Voting period below minimum (must be >= 5 minutes)
    InvalidVotingPeriod = 1506,
}
