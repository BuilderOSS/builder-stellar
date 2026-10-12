//! # Minter Contract
//!
//! The shared platform Minter: one instance for every DAO.
//!
//! - **Two methods**: `mint_batch` (the token's admin) and `mint_merkle`
//!   (self-service claims against a merkle root).
//! - **Token-based admin**: derived from the token's admin, not stored.
//! - **Published trees**: every root carries the `ipfs://` URI of its full
//!   tree; `claim_status` reads root, round, URI and claim marker at once.
//! - **Rounds**: a new root opens a new round; one claim per round.
//! - **Upgradeable**: `common::upgrade` with the Manager admin as authority;
//!   `version()` is read from the Manager registry.

#![no_std]

mod contract;
mod errors;
mod events;
mod storage;

pub use contract::*;
pub use errors::MinterError;
pub use storage::*;

#[cfg(test)]
mod test;
