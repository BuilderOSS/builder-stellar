//! # DAO Governor Contract
//!
//! A timestamp-based governance contract implementing proposal creation, voting,
//! queueing, and execution with checkpoint-based vote tracking. Built on OpenZeppelin's
//! Governor trait for Stellar with custom timestamp-based voting periods.
//!
//! ## Key Features
//!
//! - **Timestamp-Based Voting**: Uses block timestamps instead of ledger sequences for
//!   voting periods, providing predictable voting windows regardless of network conditions
//! - **Proposal Lifecycle**: Complete state machine from creation through execution:
//!   Pending → Active → Succeeded/Defeated → Queued → Executed/Expired/Canceled
//! - **Quorum System**: Basis-points (BPS) quorum of the voting supply at the
//!   proposal snapshot, with ceiling division. The voting supply excludes
//!   tokens held by the Treasury, Auction and Marketplace (see the token)
//! - **Queue Delay**: A configurable delay (5 minutes to 30 days) between approval
//!   and execution
//! - **Admin**: The launch admin configures parameters during setup; after launch
//!   the Treasury is the admin, so parameter changes need a passed proposal
//! - **Treasury Integration**: Approved proposals execute actions through a separate
//!   Treasury contract (`treasury.execute` -> `governor.consume`)
//!
//! ## Proposal Flow
//!
//! 1. **Creation**: A holder with at least `votes_needed_to_propose` votes (the
//!    `proposal_threshold`, capped at the voting supply) proposes targets, functions
//!    and arguments; votes are read at the ledger before `propose`
//! 2. **Voting Delay**: A notice period before voting starts. It does not move
//!    the snapshot, so delegating during it does not change this proposal's votes
//! 3. **Active Voting**: Token holders vote For/Against/Abstain based on snapshot
//! 4. **Success/Defeat**: Determined by quorum and majority at vote end
//! 5. **Queue**: Successful proposals queued with execution timestamp (ETA)
//! 6. **Execution**: After the queue delay, anyone calls `treasury.execute`, which
//!    consumes the proposal and dispatches its actions
//!
//! ## Security
//!
//! - CEI pattern (Checks-Effects-Interactions) prevents reentrancy
//! - Proposal hashing prevents tampering with queued proposals
//! - TTL management keeps a proposal live for its whole lifecycle (up to 118
//!   days): `propose` and `queue` each set the TTL for the stage that follows
//! - A proposal action cannot call `consume` (refused at `propose`, and by the
//!   Treasury inside an `authorize` tree), and its mints must fit one
//!   execution's event limit (refused at `propose`)
//! - Every entry point that reads or writes proposal data refuses to run while
//!   the stored layout differs from the code's (`StorageVersionMismatch`);
//!   anyone can call `migrate` to complete a pending migration

#![no_std]

mod contract;
mod error;
mod events;
mod storage;

pub use contract::*;
pub use error::CustomGovernorError;
pub use storage::{
    ProposalInfo, MAX_PROPOSAL_ACTIONS, MAX_PROPOSAL_IDS_PAGE, MAX_PROPOSAL_LIFETIME,
    MAX_QUEUED_LIFETIME, MAX_QUEUE_DELAY, MAX_UNQUEUED_LIFETIME, MAX_VOTING_DELAY,
    MAX_VOTING_PERIOD, PROPOSAL_TTL_EXTEND_TO, STORAGE_VERSION,
};

#[cfg(test)]
mod test;
