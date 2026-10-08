//! Shared helpers for the DAO module contracts (token, governor, treasury,
//! auction, marketplace, metadata).
//!
//! Library only: this crate exports no `#[contract]`.
//!
//! - [`lifecycle`]: the `Live` instance flag (setup vs. live phase).
//! - [`upgrade`]: manager-approved WASM upgrade plus `CurrentHash` / `CurrentVersion`.
//! - [`ownership`]: one-shot owner handoff that also clears a pending two-step transfer.
//! - [`ttl`]: the single instance-TTL policy.
//! - [`error`]: typed errors replacing `panic!` strings.

#![no_std]

pub mod error;
pub mod lifecycle;
pub mod ownership;
pub mod ttl;
pub mod upgrade;

pub use error::CommonError;

/// WARNING: exports `MockManager` as a `#[contract]`. Enable the `testutils`
/// feature only through `[dev-dependencies]`. See README.md.
#[cfg(any(test, feature = "testutils"))]
pub mod testutils;

#[cfg(test)]
mod test;
