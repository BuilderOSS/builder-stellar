//! # Minter Contract
//!
//! A pluggable minting contract that supports multiple minting strategies.
//! Token contracts delegate all minting operations to this contract.
//!
//! ## Features
//!
//! - **Pluggable Strategies**: Register multiple minting strategies dynamically
//! - **Strategy Types**: Batch, Merkle, Allowlist, Tiered, Custom
//! - **Admin Control**: Admin can register, pause, resume, and update strategies
//! - **Per-Recipient Tracking**: Prevents double-claiming for single-claim strategies
//! - **Extensible Design**: New strategies can be added without redeploying

#![no_std]

mod contract;
mod errors;
mod events;
mod storage;
mod strategy;

pub use contract::*;
pub use errors::MinterError;
pub use storage::*;
