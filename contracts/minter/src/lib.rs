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
//! - **Allowance**: every mint spends this module's Token allowance.
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
