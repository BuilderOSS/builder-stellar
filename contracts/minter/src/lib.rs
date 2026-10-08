//! # Minter Contract
//!
//! A direct minting contract supporting three minting methods:
//! batch minting (admin-only), merkle proof-based claims, and allowlist-based claims.
//!
//! ## Features
//!
//! - **Three Direct Methods**: mint_batch, mint_merkle, mint_allowlist
//! - **Token-based Admin**: Admin derived from token owner, not stored
//! - **Per-Token Configuration**: Separate merkle roots and allowlists per token
//! - **Double-Claim Prevention**: Tracks claimed addresses per token
//! - **Flexible**: Works with any token contract that has owner() and batch_mint()

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
