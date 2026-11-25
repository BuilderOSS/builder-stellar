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
//! - **Self calls**: A proposal may call the Treasury's own `upgrade` and
//!   `migrate` (allowlisted). A layout-changing upgrade migrates in a second
//!   step: anyone calls `migrate` after the upgrade proposal has executed,
//!   because the proposal itself keeps running the old code
//! - **No `consume` actions**: no action, and no node of an `authorize` tree,
//!   may call the Governor's `consume`, so a proposal cannot mark another one
//!   Executed without running it
//! - **Storage-layout gate**: `execute`, `launch` and `handoff` refuse to run
//!   while the stored layout differs from the code's (`StorageVersionMismatch`)
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
pub use storage::{AuthNode, MAX_AUTH_DEPTH, MAX_AUTH_NODES, STORAGE_VERSION};

#[cfg(test)]
mod test;
