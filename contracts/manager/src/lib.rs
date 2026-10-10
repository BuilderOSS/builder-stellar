//! # Manager Contract
//!
//! The central hub for the Stellar Builder platform, providing:
//!
//! ## 1. Implementation Management
//!
//! - Register contract implementation versions with WASM hashes
//! - Approve upgrade paths between implementations
//! - Revoke implementations in case of vulnerabilities
//! - Track latest versions for each module type
//!
//! ## 2. DAO Factory
//!
//! - Deploy complete DAOs with all 6 modules atomically
//! - `create_dao` requires auth from both the deployer and the launch admin
//! - Deterministic address prediction before deployment (`predict_addresses`)
//! - The launch admin configures the modules during setup (founder mints,
//!   artwork, parameters), then `launch_dao` hands every module to the Treasury
//!
//! ## 3. Slug Registry
//!
//! - A DAO requests a slug at `create_dao`; it becomes the DAO's unique,
//!   permanent id when `launch_dao` claims it
//! - `get_dao_by_slug` / `get_slug` resolve launched DAOs; DAO enumeration and
//!   pagination are served by the indexer, not the contract
//!
//! ## Security
//!
//! - Admin-controlled implementation registry and two-step admin handover
//! - Factory pause blocks both `create_dao` and `launch_dao`
//! - Per-deployer deterministic salts (creator + nonce + module)
//! - Input validation against the shared bounds in `common`

#![no_std]

mod contract;
mod error;
mod events;
mod storage;

#[cfg(test)]
mod test;

pub use contract::*;
pub use error::*;
pub use storage::{
    ArtworkIpfsGroup, AuctionConfig, DaoAddresses, DaoCreationParams, DaoWasmHashes,
    GovernanceConfig, ImplementationVersion, InitialDaoConfigValues, LaunchConfig,
    MarketplaceConfig, PendingDao, UpgradeApproval,
};
