//! # Metadata Contract
//!
//! Manages metadata for Nouns-style artwork generation for NFT tokens.
//! Each DAO has its own Metadata contract with custom properties (traits) and items.
//!
//! ## Key Features
//!
//! - **Dynamic Properties**: User-defined traits with variable items
//! - **Pseudo-Random Seeds**: Artwork derived from ledger data + the host PRNG (see Randomness limitation)
//! - **on_minted Hook**: Token contract calls this to generate seeds; no other
//!   caller can write a token's selections
//! - **Token URI**: builds each token's SEP-50 JSON on-chain; its `image`
//!   points at an off-chain compositor (`renderer_base`) with query params
//! - **Governance Control**: Only the admin (launch admin in setup, Treasury once
//!   live) can modify properties and settings
//!
//! ## Randomness limitation
//!
//! The artwork seed is `keccak256(token_id, ledger sequence, ledger timestamp,
//! host PRNG u64)`. None of these inputs is an unbiasable randomness source: a
//! party who controls when the mint happens (for example a bidder or a
//! marketplace buyer choosing which ledger to submit in, or simulating
//! outcomes off-chain and only submitting favourable ones) can grind for traits
//! they prefer. This is a documented limitation, not a bug; a VRF/commit-reveal
//! source is out of scope. Do not rely on trait rarity for anything of
//! financial value that an adversary could grind.
//!
//! ## Usage
//!
//! The contract is initialised by the Manager during DAO creation with renderer settings.
//! The admin can add properties/items and update settings (strings are capped
//! at `common::MAX_STRING_LENGTH`).
//! When tokens are minted, the Token contract calls `on_minted` to generate artwork seeds.
//!
//! ## Storage layout
//!
//! While the stored data layout differs from the code's
//! (`common::upgrade::is_current_layout`), every entry point that changes
//! state fails `StorageVersionMismatch`; `upgrade`, `migrate` and the views
//! stay open. The mint hooks are among them: the Token ignores a failed hook,
//! so a token minted meanwhile has no selections (`token_uri` fails
//! `NotSeeded`) until the admin calls `regenerate` after the migration.

#![no_std]

mod contract;
mod error;
mod events;
mod json;
mod storage;

pub use contract::*;
pub use error::Error;
pub use storage::{
    IpfsGroup, Item, ItemParam, ProfileState, Property, PropertyHeader, Settings, ITEMS_PER_PAGE,
    MAX_IPFS_GROUPS, MAX_ITEMS_PER_PROPERTY, MAX_ITEM_PAGES, TOKENS_PER_ATTRIBUTE_PAGE,
};

#[cfg(test)]
mod test;
