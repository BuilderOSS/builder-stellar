//! # DAO Token Contract
//!
//! A non-fungible governance token (NFT) that integrates voting power delegation
//! with checkpoint-based vote tracking. Built on OpenZeppelin's Stellar NFT
//! implementation with the Votes trait for on-chain governance.
//!
//! ## Key Features
//!
//! - **Sequential NFT Minting**: Tokens are minted with sequential IDs starting from 0
//! - **Voting Power**: Each token represents voting power that can be delegated
//! - **Voting supply**: Tokens held by the DAO's Treasury, Auction and Marketplace
//!   carry no votes and are excluded from the voting supply the Governor's
//!   quorum is computed from
//! - **Auto-Delegation**: New token holders are automatically self-delegated for better UX
//! - **Checkpoint System**: Voting power is tracked via historical checkpoints for proposals
//! - **Mint Authority**: The admin grants/revokes minting permissions once live
//! - **Batch Minting**: Up to `common::MAX_BATCH_MINT` (43) tokens per call, fewer
//!   when spread over several recipients (`common::batch_mint_fits`)
//!
//! ## Usage
//!
//! The Manager deploys the token with the launch admin as admin. During setup
//! only the admin mints (founder allocation). `launch` hands the admin to the
//! Treasury and grants mint authority to the Treasury, Marketplace and,
//! optionally, the Auction and the platform Minter.

#![no_std]

mod contract;
mod error;
mod events;
mod storage;

pub use contract::*;
pub use error::TokenError;

#[cfg(test)]
mod test;
