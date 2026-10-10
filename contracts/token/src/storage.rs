//! Storage keys for the Token contract.
//!
//! Token metadata (name, symbol, URI), ownership records and vote checkpoints
//! live under OpenZeppelin's keys. The module admin lives under
//! `common::admin`. This enum only holds the contract-specific keys.

use soroban_sdk::{contracttype, Address};

/// Storage-layout version of this code (see `common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;

#[contracttype]
pub enum TokenKey {
    /// Persistent: `Address -> bool`, whether the address may mint once the
    /// token is live. The admin has implicit authority and needs no entry.
    MintAuthority(Address),
    /// Instance: metadata contract called on every mint to seed artwork.
    Metadata,
    /// Instance: Manager that approves upgrades and performs the launch.
    Manager,
    /// Instance: DAO Treasury; the only address `launch` accepts. Holds no
    /// voting power (see `voting_holder`).
    Treasury,
    /// Instance: DAO Auction. Holds no voting power.
    Auction,
    /// Instance: DAO Marketplace (escrow). Holds no voting power.
    Marketplace,
}
