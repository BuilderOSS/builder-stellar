//! # Metadata Contract
//!
//! Manages metadata for Nouns-style artwork generation for NFT tokens.
//! Each DAO has its own Metadata contract with custom properties (traits) and items.
//!
//! ## Key Features
//!
//! - **Dynamic Properties**: User-defined traits with variable items
//! - **Pseudo-Random Seeds**: Unpredictable artwork using ledger data + PRNG
//! - **on_minted Hook**: Token contract calls this to generate seeds
//! - **Image Composition**: Generates URL with query params for frontend renderer
//! - **Governance Control**: Only token owner can modify properties and settings
//!
//! ## Usage
//!
//! The contract is initialized by the Manager during DAO creation with renderer settings.
//! The token owner (governance) can add properties/items and update settings.
//! When tokens are minted, the Token contract calls `on_minted` to generate artwork seeds.

#![no_std]

mod contract;
mod error;
mod events;
mod storage;

pub use contract::*;
pub use error::Error;
pub use storage::{IpfsGroup, Item, ItemParam, Property, Settings};

#[cfg(test)]
mod test;
