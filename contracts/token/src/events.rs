//! Event definitions and emission helpers for the Token contract.
//!
//! This module defines standard Soroban events published via the `contractevent` macro
//! for on-chain indexing. Most NFT lifecycle events (Transfer, Mint, Approve) are emitted
//! automatically by OpenZeppelin's Base and NonFungibleVotes implementations. This module
//! only defines custom events that add information not included in the standard events,
//! such as tracking the minter address and batch minting operations.

use soroban_sdk::{contractevent, Address};

// Standard contract events

/// Emitted when the token contract is initialized.
///
/// Contains the initial owner and token metadata. This event is emitted once
/// during contract deployment via the `__constructor` function.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInitialized {
    #[topic]
    pub owner: Address,
    pub uri: String,
    pub name: String,
    pub symbol: String,
}

/// Emitted when minting authority is granted or revoked for an address.
///
/// Tracks changes to mint permissions, including who made the change (always the owner).
/// The owner always has implicit minting authority regardless of this flag.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintAuthorityChanged {
    #[topic]
    pub authority: Address,
    pub old_enabled: bool,
    pub enabled: bool,
    pub changed_by: Address,
}

/// Custom event to track minter information during single token mints.
///
/// OpenZeppelin's standard Mint event doesn't include the minter address, only
/// the recipient. This custom event supplements it by tracking who performed the mint,
/// which is useful for auditing and analytics (e.g., distinguishing owner mints
/// from auction contract mints).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintWithMinter {
    #[topic]
    pub minter: Address,
    #[topic]
    pub to: Address,
    pub token_id: u32,
}

/// Emitted when multiple tokens are minted in a single batch operation.
///
/// Supplements the individual Mint events (emitted per token) with a summary
/// of the batch operation, including the total amount and final token ID.
/// Useful for tracking bulk minting operations like initial distribution.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchMint {
    #[topic]
    pub minter: Address,
    #[topic]
    pub to: Address,
    pub amount: u32,
    pub last_token_id: u32,
}

// Note: Transfer, Approve, and standard Mint events are emitted automatically by OpenZeppelin's Base trait
// We only define custom events here that add additional information or functionality

// Event helper functions

use soroban_sdk::{Env, String};

/// Emits a TokenInitialized event.
///
/// Called once during contract initialization to record the deployment parameters.
pub fn emit_token_initialized(
    e: &Env,
    owner: &Address,
    uri: &String,
    name: &String,
    symbol: &String,
) {
    TokenInitialized {
        owner: owner.clone(),
        uri: uri.clone(),
        name: name.clone(),
        symbol: symbol.clone(),
    }
    .publish(e);
}

pub fn emit_mint_authority_changed(
    e: &Env,
    authority: &Address,
    old_enabled: bool,
    enabled: bool,
    changed_by: &Address,
) {
    MintAuthorityChanged {
        authority: authority.clone(),
        old_enabled,
        enabled,
        changed_by: changed_by.clone(),
    }
    .publish(e);
}

pub fn emit_token_mint(e: &Env, minter: &Address, to: &Address, token_id: u32) {
    MintWithMinter {
        minter: minter.clone(),
        to: to.clone(),
        token_id,
    }
    .publish(e);
}

pub fn emit_batch_mint(e: &Env, minter: &Address, to: &Address, amount: u32, last_token_id: u32) {
    BatchMint {
        minter: minter.clone(),
        to: to.clone(),
        amount,
        last_token_id,
    }
    .publish(e);
}
