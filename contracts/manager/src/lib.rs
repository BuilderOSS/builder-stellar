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
//! - Deploy complete DAOs with all 5 modules atomically
//! - Deterministic address prediction before deployment
//! - Founder allocation configuration (fixed NFT counts)
//! - Governance-owned from initialization
//!
//! ## 3. DAO Registry
//!
//! - Enumerate all deployed DAOs
//! - Query DAO details by token address
//! - Paginated DAO listing
//!
//! ## Architecture
//!
//! The Manager contract combines three responsibilities into a single contract for:
//! - Simplified deployment and maintenance
//! - Atomic DAO creation with guaranteed consistency
//! - Single source of truth for all DAOs and implementations
//!
//! ## Security
//!
//! - Admin-controlled implementation registry
//! - Factory pause mechanism for emergencies
//! - Nonce-based replay protection
//! - Comprehensive input validation

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
    DaoAddresses, DaoCreation, DaoCreationParams, DaoMetadata, DaoModules, DaoRegistration,
    FounderAllocation, ImplementationVersion, UpgradeApproval,
};
