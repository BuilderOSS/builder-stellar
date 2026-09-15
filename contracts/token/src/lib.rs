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
//! - **Auto-Delegation**: New token holders are automatically self-delegated for better UX
//! - **Checkpoint System**: Voting power is tracked via historical checkpoints for proposals
//! - **Mint Authority**: Owner can grant/revoke minting permissions to other addresses
//! - **Batch Minting**: Efficient batch minting up to 100 tokens in a single transaction
//!
//! ## Usage
//!
//! The contract must be initialized with an owner and token metadata (URI, name, symbol).
//! The owner can then mint tokens directly or grant mint authority to other addresses
//! (e.g., an auction contract). Token holders automatically receive voting power
//! through self-delegation and can delegate to others if desired.

#![no_std]

mod contract;
mod error;
mod events;
mod storage;

pub use contract::*;

#[cfg(test)]
mod test;
