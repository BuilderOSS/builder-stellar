//! # Mock vote adapter (test and testnet only)
//!
//! A vote source for the Governor with weights set by an admin, used to show
//! and test that the Governor works with any source implementing
//! `common::clients::VoteSourceApi` (docs/designs/governance-adapter.md).
//!
//! **Never approve it on mainnet.** Its admin can give anyone any weight at
//! any time, so it controls every tribe that uses it.
//!
//! Each `set_votes` appends a `(ledger, votes)` checkpoint for the account
//! and for the total, or overwrites the last one when it was written in the
//! same ledger, so reads at a past ledger see the value that ledger closed
//! with, as OpenZeppelin `Votes` does.

#![no_std]

mod contract;

pub use contract::*;

#[cfg(test)]
mod test;
