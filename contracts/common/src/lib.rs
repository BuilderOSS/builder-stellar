//! Shared helpers for the DAO module contracts (token, governor, treasury,
//! auction, marketplace, metadata).
//!
//! Library only: this crate exports no `#[contract]`.
//!
//! - [`lifecycle`]: the `Live` instance flag (setup vs. live phase).
//! - [`upgrade`]: manager-approved WASM upgrade plus `CurrentHash` / `CurrentVersion`.
//! - [`ownership`]: one-shot owner handoff that also clears a pending two-step transfer.
//! - [`ttl`]: the single instance-TTL policy.
//! - [`clients`]: typed `#[contractclient]` traits for cross-contract calls (no linked exports).
//! - [`error`]: typed errors replacing `panic!` strings. Error codes are unique
//!   per contract only; key on (contract id, code). See README.md for overlaps.

#![no_std]

pub mod clients;
pub mod error;
pub mod lifecycle;
pub mod ownership;
pub mod ttl;
pub mod upgrade;

pub use error::CommonError;

/// Upper bound for the auction anti-snipe `time_buffer` (one day, seconds).
/// Shared by the Auction (constructor and `set_time_buffer`) and the Manager.
pub const MAX_AUCTION_TIME_BUFFER: u64 = 86_400;

/// Upper bound for the auction `duration` (30 days, seconds). Shared by the
/// Auction (constructor and `set_duration`) and the Manager. There is no
/// reserve-price cap by design (see docs/SECURITY_MODEL.md).
pub const MAX_AUCTION_DURATION: u64 = 2_592_000;

/// WARNING: exports `MockManager` as a `#[contract]`. Enable the `testutils`
/// feature only through `[dev-dependencies]`. See README.md.
#[cfg(any(test, feature = "testutils"))]
pub mod testutils;

#[cfg(test)]
mod test;
