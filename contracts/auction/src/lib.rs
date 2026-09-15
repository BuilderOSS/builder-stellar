//! # DAO Auction Contract
//!
//! A continuous auction system for minting and distributing governance NFTs,
//! inspired by Nouns DAO. Each auction mints a new token and the winning bidder
//! receives it, with proceeds going to the treasury. Once an auction settles,
//! a new one immediately begins, creating a perpetual NFT distribution mechanism.
//!
//! ## Key Features
//!
//! - **Continuous Auctions**: New auctions start immediately after the previous one settles
//! - **SAC Payment**: Requires a configured SAC payment token (payment type locked per auction)
//! - **Time Extension**: Anti-sniping mechanism extends auction if bids come near the end
//! - **Pausable**: Owner can pause for emergencies, configuration changes, or settlement
//! - **Reserve Price**: Minimum bid requirement prevents low-value sales
//! - **Bid Increment**: Ensures meaningful competition between bidders
//! - **Refund System**: Outbid participants automatically receive their funds back
//!
//! ## Auction Lifecycle
//!
//! 1. **Launch**: Owner unpauses contract, creating the first auction with token ID 0
//! 2. **Bidding**: Users place bids (must exceed reserve + increment). Payment type
//!    locks on first bid (all subsequent bids must use same currency)
//! 3. **Time Extension**: If bid arrives within `time_buffer` of end, auction extends
//!    (max 10 extensions to prevent DoS)
//! 4. **Settlement**: Anyone can settle once time expires. Token mints to winner,
//!    funds transfer to treasury, previous bidder gets refunded
//! 5. **New Auction**: Next token ID auction begins immediately
//!
//! ## Security Features
//!
//! - CEI pattern (Checks-Effects-Interactions) prevents reentrancy
//! - Extension limit prevents DoS via endless time extensions
//! - Reserve price prevents dust/spam auctions
//! - Pausable for emergency response
//! - Payment type locking prevents confusion/errors

#![no_std]

mod contract;
mod error;
mod events;
mod helpers;
mod storage;

#[cfg(test)]
mod test;

pub use contract::*;
