//! Storage keys and constants for the Governor contract.
//!
//! This module defines the storage structure for proposals, governance parameters,
//! and TTL management. The Governor uses a hybrid storage approach with some data
//! in the library's storage and custom data in contract-specific keys.

use soroban_sdk::{contracttype, Address, BytesN};
use stellar_governance::governor::ProposalState;

/// Storage-layout version of this code (see `common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;

/// Proposal TTL requested on every read/write (~120 days).
///
/// The longest lifecycle is voting delay + voting period + queue delay (30
/// days each at most) plus the 14 day execution window: 104 days. One touch
/// therefore keeps a proposal alive to its end; any later touch renews it.
pub const PROPOSAL_TTL_EXTEND_TO: u32 = 120 * common::ttl::DAY_IN_LEDGERS;

/// Re-extend a proposal only when fewer than ~30 days remain, so reads do not
/// re-pay rent on every touch.
pub const PROPOSAL_TTL_THRESHOLD: u32 = 30 * common::ttl::DAY_IN_LEDGERS;

// Basis points constants for quorum calculation
// BPS = basis points (1 BPS = 0.01%)

/// Denominator for basis points calculations (10,000 = 100.00%).
///
/// Quorum is expressed in basis points where 1 BPS = 0.01%. For example:
/// - 5000 BPS = 50.00% quorum
/// - 2500 BPS = 25.00% quorum
/// - 100 BPS = 1.00% quorum
pub const BPS_DENOMINATOR: u128 = common::BPS_DENOMINATOR as u128;

/// Rounding adjustment for ceiling division in quorum calculations.
///
/// Used to round UP when calculating the minimum vote threshold from basis points.
/// This ensures fractional tokens always round in favor of requiring more votes,
/// making it slightly harder to reach quorum rather than easier.
///
/// Formula: `required_votes = (total_supply * quorum_bps + BPS_ROUNDING_ADJUSTMENT) / BPS_DENOMINATOR`
pub const BPS_ROUNDING_ADJUSTMENT: u128 = BPS_DENOMINATOR - 1; // 9,999 for ceiling division

// Proposal expiration period for queued proposals

/// Expiration window for queued proposals (14 days in seconds).
///
/// After a proposal is queued, it must be executed within this window after its ETA.
/// If not executed within `ETA + PROPOSAL_EXPIRATION_PERIOD`, the proposal expires
/// and cannot be executed. This prevents indefinitely queued proposals from being
/// executed far in the future when context may have changed.
///
/// The same window applies to a Succeeded proposal that is never queued: it
/// expires `PROPOSAL_EXPIRATION_PERIOD` after its vote ends. Pending, Active and
/// Defeated proposals do not expire.
pub const PROPOSAL_EXPIRATION_PERIOD: u64 = 1_209_600; // 14 days in seconds (14 * 24 * 3600)

// Validation constants

/// Minimum voting delay (5 minutes in seconds).
///
/// Minimum delay between proposal creation and vote start. This is a NOTICE
/// period only: voting power and total supply are snapshotted at proposal
/// creation (the ledger before `propose`), so delegation or transfers during
/// the delay cannot change that proposal's weights. The default minimum is
/// five minutes.
pub const MIN_VOTING_DELAY: u32 = common::MIN_GOVERNANCE_DELAY;

/// Maximum actions per proposal, so a passed proposal always fits the
/// execution budget of `treasury.execute`.
pub const MAX_PROPOSAL_ACTIONS: u32 = 20;

/// Minimum voting period (5 minutes in seconds).
///
/// Enforces a minimum duration for voting to remain open.
/// Ensures sufficient time for community participation. The default minimum is
/// five minutes.
pub const MIN_VOTING_PERIOD: u32 = common::MIN_GOVERNANCE_DELAY;

/// Minimum queue delay (5 minutes in seconds).
///
/// Enforces a minimum delay between proposal approval and execution to ensure
/// sufficient time for:
/// - Community review of approved proposals
/// - Detection of malicious proposals
/// - Emergency response if needed
///
/// This is the default deployment minimum; callers can select a longer delay.
pub const MIN_QUEUE_DELAY: u32 = common::MIN_GOVERNANCE_DELAY;

/// Maximum voting delay (30 days in seconds). Bounds governance timing so a
/// passed proposal cannot freeze governance with an absurd value.
pub const MAX_VOTING_DELAY: u32 = common::MAX_GOVERNANCE_DELAY;

/// Maximum voting period (30 days in seconds).
pub const MAX_VOTING_PERIOD: u32 = common::MAX_GOVERNANCE_DELAY;

/// Maximum queue delay (30 days in seconds).
pub const MAX_QUEUE_DELAY: u32 = common::MAX_GOVERNANCE_DELAY;

/// Storage keys for governor-specific instance data.
///
/// Most governance data (name, version, voting parameters, vote tallies) is stored
/// via the stellar_governance library's storage keys. This enum contains only
/// contract-specific keys for custom functionality.
#[contracttype]
pub enum GovernorKey {
    /// Address of the Treasury contract that executes approved proposals.
    Treasury,
    /// Delay (in seconds) between queueing and execution eligibility.
    QueueDelay,
    /// Proposal core data, indexed by proposal ID hash.
    Proposal(BytesN<32>),
    Manager,
}

/// Core proposal data using timestamps instead of ledger sequences.
///
/// This structure extends the library's proposal data with timestamp-based voting
/// periods, allowing for more predictable governance timelines. Timestamps are
/// independent of network performance, unlike ledger-based periods which can vary
/// with block production rate.
#[contracttype]
#[derive(Clone)]
pub struct ProposalCoreTime {
    /// Address that created the proposal.
    pub proposer: Address,
    /// Ledger sequence used for vote power snapshot.
    ///
    /// Voting power is determined by token holdings at this snapshot, preventing
    /// vote manipulation via token transfers during voting.
    pub vote_snapshot: u32,
    /// Unix timestamp when voting begins.
    ///
    /// Equals proposal creation time + voting delay. Votes cast before this time
    /// are rejected.
    pub vote_start: u64,
    /// Unix timestamp when voting ends.
    ///
    /// Equals vote_start + voting period. Votes cast after this time are rejected.
    pub vote_end: u64,
    /// Estimated Time of Arrival - when proposal becomes executable.
    ///
    /// Set during queueing: `queue_time + queue_delay`. The proposal can be executed
    /// anytime after ETA but before `ETA + PROPOSAL_EXPIRATION_PERIOD`.
    pub eta: u64,
    /// Current state in the proposal lifecycle.
    pub state: ProposalState,
}
