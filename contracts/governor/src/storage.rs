//! Storage keys and constants for the Governor contract.
//!
//! This module defines the storage structure for proposals, governance parameters,
//! and TTL management. The Governor uses a hybrid storage approach with some data
//! in the library's storage and custom data in contract-specific keys.

use soroban_sdk::{contracttype, Address, Bytes, BytesN, Env};
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
    /// Proposal core data (`ProposalCoreTime`), indexed by proposal ID hash.
    /// Not `Proposal(id)`: that encodes like OpenZeppelin's
    /// `GovernorStorageKey::Proposal(id)`, which holds a different type.
    ProposalTime(BytesN<32>),
    Manager,
    /// Instance: number of proposals ever created (the next sequence number).
    ProposalCount,
    /// Persistent: sequence number -> proposal id. Written by `propose`
    /// (proposer-paid, ~60 bytes) and renewed with the proposal core, so a
    /// client can list proposals from chain state alone (D10).
    ProposalId(u32),
}

/// Most ids `proposal_ids` returns per call (each is one persistent read).
pub const MAX_PROPOSAL_IDS_PAGE: u32 = 50;

/// `proposal(id)`: the stored core plus the state computed now.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalInfo {
    pub id: BytesN<32>,
    pub seq: u32,
    pub proposer: Address,
    pub vote_snapshot: u32,
    pub vote_start: u64,
    pub vote_end: u64,
    pub eta: u64,
    pub state: ProposalState,
    /// For + Abstain votes the proposal needs (fixed at creation).
    pub quorum: u128,
}

/// Core proposal data using timestamps instead of ledger sequences.
///
/// This structure extends the library's proposal data with timestamp-based voting
/// periods, allowing for more predictable governance timelines. Timestamps are
/// independent of network performance, unlike ledger-based periods which can vary
/// with block production rate.
///
/// In memory only: it is stored as a [`StoredProposal`] (D38).
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
    /// Creation order: the key of this proposal's `ProposalId(seq)` entry.
    pub seq: u32,
    /// For + Abstain votes needed, fixed when the proposal is created from the
    /// voting supply and `quorum_bps` at that moment. Storing it means no
    /// later call looks up historical supply or quorum checkpoints, so only
    /// the latest checkpoint of each has to stay live (D33).
    pub quorum: u128,
}

/// Every `GovernorKey` variant with sample arguments, for the key guard test.
/// `index` fails to compile when a variant is added: give it the next index,
/// raise `VARIANTS` and add a sample to `all`, or the guard test fails.
#[cfg(test)]
pub(crate) mod key_samples {
    extern crate std;
    use super::*;
    #[allow(unused_imports)]
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, IntoVal, Val};

    pub const VARIANTS: usize = 6;

    pub fn index(key: &GovernorKey) -> usize {
        match key {
            GovernorKey::Treasury => 0,
            GovernorKey::QueueDelay => 1,
            GovernorKey::ProposalTime(_) => 2,
            GovernorKey::Manager => 3,
            GovernorKey::ProposalCount => 4,
            GovernorKey::ProposalId(_) => 5,
        }
    }

    #[allow(unused_variables)]
    pub fn all(e: &Env) -> std::vec::Vec<Val> {
        let a = soroban_sdk::Address::generate(e);
        let id = soroban_sdk::BytesN::<32>::from_array(e, &[0; 32]);
        let text = soroban_sdk::String::from_str(e, "x");
        let keys = std::vec![
            GovernorKey::Treasury,
            GovernorKey::QueueDelay,
            GovernorKey::ProposalTime(id.clone()),
            GovernorKey::Manager,
            GovernorKey::ProposalCount,
            GovernorKey::ProposalId(0),
        ];
        common::testutils::assert_every_variant_sampled(
            "GovernorKey",
            &keys.iter().map(index).collect::<std::vec::Vec<_>>(),
            VARIANTS,
        );
        keys.into_iter().map(|k| k.into_val(e)).collect()
    }
}

/// Stored form of `ProposalTime(id)`: the proposer, then the numeric fields
/// packed big-endian in [`PACKED_PROPOSAL_LEN`] bytes: `vote_snapshot` u32,
/// `vote_start` u64, `vote_end` u64, `eta` u64, `state` u8, `seq` u32, `quorum`
/// u128. The field-named map it replaces spent ~170 bytes per proposal on
/// names and value tags (D38). Off-chain decoders:
/// `apps/web/src/lib/chain-reads/proposal-core.ts`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredProposal(pub Address, pub Bytes);

pub const PACKED_PROPOSAL_LEN: usize = 4 + 8 + 8 + 8 + 1 + 4 + 16;

fn state_code(state: ProposalState) -> u8 {
    state as u32 as u8
}

fn state_from(e: &Env, code: u8) -> ProposalState {
    match code {
        0 => ProposalState::Pending,
        1 => ProposalState::Active,
        2 => ProposalState::Defeated,
        3 => ProposalState::Canceled,
        4 => ProposalState::Succeeded,
        5 => ProposalState::Queued,
        6 => ProposalState::Expired,
        7 => ProposalState::Executed,
        _ => soroban_sdk::panic_with_error!(
            e,
            stellar_governance::governor::GovernorError::ProposalNotFound
        ),
    }
}

impl ProposalCoreTime {
    pub fn pack(&self, e: &Env) -> StoredProposal {
        let mut buf = [0u8; PACKED_PROPOSAL_LEN];
        buf[0..4].copy_from_slice(&self.vote_snapshot.to_be_bytes());
        buf[4..12].copy_from_slice(&self.vote_start.to_be_bytes());
        buf[12..20].copy_from_slice(&self.vote_end.to_be_bytes());
        buf[20..28].copy_from_slice(&self.eta.to_be_bytes());
        buf[28] = state_code(self.state);
        buf[29..33].copy_from_slice(&self.seq.to_be_bytes());
        buf[33..49].copy_from_slice(&self.quorum.to_be_bytes());
        StoredProposal(self.proposer.clone(), Bytes::from_slice(e, &buf))
    }

    pub fn unpack(e: &Env, stored: &StoredProposal) -> Self {
        let StoredProposal(proposer, bytes) = stored;
        assert!(
            bytes.len() as usize == PACKED_PROPOSAL_LEN,
            "corrupt proposal"
        );
        let mut buf = [0u8; PACKED_PROPOSAL_LEN];
        bytes.copy_into_slice(&mut buf);
        let u32_at = |at: usize| u32::from_be_bytes(buf[at..at + 4].try_into().unwrap());
        let u64_at = |at: usize| u64::from_be_bytes(buf[at..at + 8].try_into().unwrap());
        ProposalCoreTime {
            proposer: proposer.clone(),
            vote_snapshot: u32_at(0),
            vote_start: u64_at(4),
            vote_end: u64_at(12),
            eta: u64_at(20),
            state: state_from(e, buf[28]),
            seq: u32_at(29),
            quorum: u128::from_be_bytes(buf[33..49].try_into().unwrap()),
        }
    }
}
