//! Storage keys and constants for the Token contract.
//!
//! This module defines the storage structure and TTL (Time-To-Live) management
//! for token-specific data, particularly mint authorities and delegation persistence.

use soroban_sdk::{contracttype, Address};

// Batch minting has been moved to the Minter contract

// TTL constants for delegation storage
// Delegations should persist long-term as they represent voting power delegation

/// Approximate number of ledgers in a day.
///
/// Stellar produces a new ledger approximately every 5 seconds, resulting in
/// ~17,280 ledgers per day. Used for converting time-based TTLs to ledger counts.
pub const DAY_IN_LEDGERS: u32 = 17280; // ~5 seconds per ledger

/// Delegation storage TTL extension amount (nominally 1 year in ledgers; the
/// network caps entries at ~180 days, so the effective lifetime is ~180 days
/// and renews on touch).
///
/// When delegation data is accessed (e.g., during minting, transfer, or voting),
/// its TTL is automatically extended by this amount to ensure the delegation
/// persists long-term. Set to 1 year for balance between persistence and storage cost.
pub const DELEGATION_TTL_EXTEND_AMOUNT: u32 = 365 * DAY_IN_LEDGERS; // 1 year

/// Delegation storage TTL threshold for triggering extension (~30 days).
///
/// When remaining TTL falls below this threshold, the storage entry is extended.
/// A short threshold avoids re-paying rent on nearly every touch.
pub const DELEGATION_TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS; // ~30 days

/// Storage keys for token-specific instance data.
///
/// Token metadata (name, symbol, URI) and ownership are stored via OpenZeppelin's
/// Base and Ownable traits. This enum only contains keys for contract-specific data.
#[contracttype]
pub enum TokenKey {
    /// Tracks whether an address has minting authority.
    ///
    /// Maps `Address -> bool` where `true` means the address can mint tokens.
    /// The owner has implicit minting authority without needing an entry here.
    MintAuthority(Address),
    /// The metadata contract address for artwork generation.
    ///
    /// This contract is called during minting to generate artwork seeds.
    Metadata,
    Manager,
    /// Treasury wired at construction; the only address `launch` accepts.
    Treasury,
}

/// Keeps the instance entry alive on state-changing paths (shared policy:
/// see `common::ttl`).
pub fn extend_instance_ttl(e: &soroban_sdk::Env) {
    common::ttl::extend_instance(e);
}
