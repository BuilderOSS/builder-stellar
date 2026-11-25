//! # DAO Marketplace Contract
//!
//! The DAO's market for its own membership tokens. Two ways to buy:
//!
//! - **Secondary listings**: a holder lists a token, which the Marketplace
//!   holds in custody until it is bought, cancelled, expired, or returned by
//!   the DAO. The fee and payment asset in force at list time stay with the
//!   listing. In a locked DAO no new listing can be made.
//! - **Quick-buy pools**: by proposal, the DAO opens a pool of new tokens
//!   minted into the Marketplace's custody against its allowance, sold at one
//!   price with a per-buyer cap and a sales rate.
//!
//! The Marketplace is a non-voting module: tokens it holds carry no votes.
//! Payment assets must be Stellar Asset Contracts, checked wherever an asset
//! is set. The Token refuses to unregister the Marketplace while it holds
//! tokens; the DAO empties it with `return_listing` and `recover_token`
//! (while paused), `close_pool`, and `sweep_pool`.
//!
//! While the stored data layout differs from the code's
//! (`common::upgrade::is_current_layout`), every entry point that changes
//! state fails `StorageVersionMismatch`; `upgrade`, `migrate` and the views
//! stay open, so the Treasury can still finish or undo an upgrade by
//! proposal.

#![no_std]

mod contract;
mod error;
mod events;
mod storage;

#[cfg(test)]
mod test;

pub use contract::*;
pub use error::MarketplaceError;
pub use storage::{
    Listing, MarketplaceConfig, Pool, PoolSlot, MAX_OPEN_POOLS, MAX_SWEEP, POOL_PAGE_SIZE,
};
