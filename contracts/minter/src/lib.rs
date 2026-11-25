//! # ClaimMinter
//!
//! A per-DAO module (registry kind `claims`) that mints tokens against merkle
//! claim lists (docs/designs/membership-models.md §3). It replaces the shared
//! platform Minter: every DAO has its own, upgraded only by that DAO.
//!
//! - **Lists**: a root, its published tree (`ipfs://`), an asset, a price
//!   (0 for free), an expiry and a total. Claimers mint their own leaf, in
//!   parts if they like.
//! - **Before launch**: the launch admin opens free lists; a paid list is the
//!   one assurance list, opened only through `manager.open_assurance`, whose
//!   payments stay in escrow until the DAO launches or the drive fails.
//! - **After launch**: the Treasury opens lists by proposal; payments go to
//!   the Treasury.
//! - **Allowance**: every mint spends this module's Token allowance. All
//!   lists share it, so a free Setup list still open during a drive draws on
//!   the allowance `open_assurance` granted for the drive.
//! - **Escrow**: `release` pays a list's escrow only to the wired Treasury,
//!   and `refund` only to the claimer who paid it. Assets sent to this
//!   contract outside `claim` are in no escrow, and nothing moves them. An
//!   upgrade replaces this code and could change these rules.
//! - **Hashing**: leaves and nodes are told apart by length, not by a tag;
//!   see the module docs of `contract.rs` and `test-vectors/merkle-v1.json`.
//! - **Upgrades**: `common::upgrade` with the DAO admin, plus the Manager's
//!   `recovery_upgrade` for a failed, frozen drive.

#![no_std]

mod contract;
mod errors;
mod events;
mod storage;

pub use contract::*;
pub use errors::ClaimMinterError;
pub use events::*;
pub use storage::*;

#[cfg(test)]
mod test;
