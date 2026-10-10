//! # DAO Treasury Contract
//!
//! An execution boundary contract that acts as the authorized caller for proposals
//! approved by the Governor. This separation provides security isolation by ensuring
//! the Governor contract cannot directly execute arbitrary actions - instead, approved
//! proposals are executed through this Treasury with the Treasury's authority.
//!
//! ## Key Features
//!
//! - **Governor-Controlled Execution**: `execute` runs only proposals the
//!   Governor has queued; `governor.consume` marks them Executed first
//! - **Authorization**: The Treasury authorizes each external call it makes;
//!   an `authorize` action can add the deeper authorization trees a call
//!   needs (see `AuthNode`)
//! - **Self calls**: A proposal may call the Treasury's own `upgrade`,
//!   `migrate` and `sync_version` (allowlisted)
//! - **Admin of the DAO**: After launch the Treasury is the admin of every DAO
//!   module, so every privileged change goes through a proposal
//!
//! ## Typical Flow
//!
//! 1. A proposal passes and is queued on the Governor
//! 2. Anyone calls `treasury.execute(targets, functions, args, description_hash)`
//! 3. The Treasury calls `governor.consume`, which validates and marks the proposal
//! 4. The Treasury dispatches each action with its own authority

#![no_std]

mod contract;
mod error;
mod events;
mod storage;

pub use contract::*;
pub use error::TreasuryError;
pub use storage::{AuthNode, MAX_AUTH_DEPTH, MAX_AUTH_NODES};

#[cfg(test)]
mod test;
