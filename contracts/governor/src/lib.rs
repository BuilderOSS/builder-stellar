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
//! - **Quorum System**: Basis-points (BPS) based quorum with ceiling division ensuring
//!   minimum participation requirements are met
//! - **Queue Delay**: Mandatory five-minute delay between approval and execution for
//!   transparency and security
//! - **Flexible Authority**: Owner can grant proposal creation rights to other addresses
//! - **Treasury Integration**: Approved proposals execute actions through a separate
//!   Treasury contract for security isolation
//!
//! ## Proposal Flow
//!
//! 1. **Creation**: Authorized user creates proposal with targets, values, and calldata
//! 2. **Voting Delay**: Short delay before voting starts (allows delegation changes)
//! 3. **Active Voting**: Token holders vote For/Against/Abstain based on snapshot
//! 4. **Success/Defeat**: Determined by quorum and majority at vote end
//! 5. **Queue**: Successful proposals queued with execution timestamp (ETA)
//! 6. **Execution**: After queue delay passes, proposal actions execute via Treasury
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

#[cfg(test)]
mod test;
