//! # Manager Contract
//!
//! The Tribe Builder platform contract, providing:
//!
//! ## 1. Implementation registry
//!
//! - Register contract implementation versions with WASM hashes (records are
//!   immutable; revocation is permanent)
//! - Approve directional upgrade paths between implementations of one name
//! - Announce the latest implementation per name (`latest_pointer`): the only
//!   target of the Manager's own upgrade and of `recover_claims`, each after
//!   the upgrade notice (D42)
//!
//! ## 2. DAO factory
//!
//! - `create_dao` deploys the four core contracts (Token, Metadata, Governor,
//!   Treasury) and any of the Auction, Marketplace and ClaimMinter modules
//!   atomically; `create_module` adds a module later
//! - `create_dao` requires auth from both the deployer and the launch admin
//! - Deterministic address prediction before deployment (`predict_addresses`,
//!   `predict_module_address`)
//! - Payment assets must be Stellar Asset Contracts
//!
//! ## 3. Launch
//!
//! - The launch admin configures the DAO in Setup (founder mints, artwork,
//!   parameters), then `launch_dao` hands every contract to the Treasury
//! - Or an assurance drive (`open_assurance`): members pay into the
//!   ClaimMinter's escrow, anyone launches once the threshold is met
//!   (`launch_when_ready`), and a missed deadline ends in refunds
//! - Launch checks the code every contract runs (`executable()`) against the
//!   registry before calling into it
//!
//! ## 4. Slug registry
//!
//! - A DAO requests a slug at `create_dao`; it becomes the DAO's unique id
//!   when `launch_dao` claims it, or when `open_assurance` reserves it. A
//!   launched DAO can move to a new slug by vote (`change_slug`), which
//!   releases the old one; a failed drive's slug is freed by `release_slug`
//! - `get_dao_by_slug` / `get_slug` resolve slugs; DAO enumeration and
//!   pagination are served by the indexer, not the contract
//!
//! ## Security
//!
//! - Admin-controlled implementation registry and two-step admin handover
//! - Factory pause blocks `create_dao`, `create_module`, `open_assurance`,
//!   `launch_dao`, `launch_when_ready`, and `change_slug`; refunds,
//!   `release_slug`, and `recover_claims` stay open
//! - Per-deployer deterministic salts (creator + nonce + module)
//! - Input validation against the shared bounds in `common`
//! - Storage-layout gate: while the stored layout differs from the code's
//!   `STORAGE_VERSION` (after an `upgrade_manager` whose `migrate` has not
//!   run), every entry point that changes state fails
//!   `StorageVersionMismatch`, apart from `migrate` (anyone may call it),
//!   `upgrade_manager`, and the registry steps for the Manager's own upgrade
//!   (`register_implementation`, `set_latest_implementation` and
//!   `approve_upgrade` for the `Manager` name only). The views stay open, so
//!   every DAO can still read the registry
//! - See `docs/SECURITY_MODEL.md` for the trust model

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
    ArtworkIpfsGroup, Assurance, AssuranceListParams, AuctionConfig, ClaimsConfig,
    CurrentImplementations, DaoAddresses, DaoCreationParams, DaoWasmHashes, GovernanceConfig,
    ImplementationVersion, InitialDaoConfigValues, LaunchConfig, MarketplaceConfig, ModuleSpec,
    PendingDao, UpgradeApproval,
};
