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
//! 1. **Creation**: A holder with at least `proposal_threshold` votes proposes targets,
//!    functions and arguments
//! 2. **Voting Delay**: Short delay before voting starts (allows delegation changes)
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
//! - TTL management ensures proposals persist through governance lifecycle

#![no_std]

mod contract;
mod error;
mod events;
mod storage;

pub use contract::*;
pub use error::CustomGovernorError;
pub use storage::{MAX_QUEUE_DELAY, MAX_VOTING_DELAY, MAX_VOTING_PERIOD};

#[cfg(test)]
mod test;
