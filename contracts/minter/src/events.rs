//! Event definitions and emission helpers for the Minter contract.

use soroban_sdk::{contractevent, Address, Env};

/// Emitted when a token is claimed through a merkle allocation.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerkleClaimEvent {
    #[topic]
    pub token_id: Address,
    #[topic]
    pub recipient: Address,
    pub amount: u128,
}

/// Emitted when a token is claimed through an allowlist allocation.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistClaimEvent {
    #[topic]
    pub token_id: Address,
    #[topic]
    pub recipient: Address,
    pub amount: u128,
}

/// Emitted when a batch mint operation completes.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintBatchEvent {
    #[topic]
    pub token_id: Address,
    pub recipient_count: u32,
    pub total_amount: u128,
    /// First token ID of the contiguous minted range
    /// `[first_token_id, first_token_id + total_amount)`.
    pub first_token_id: u32,
}

/// Emitted when a merkle root is set.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerkleRootSetEvent {
    #[topic]
    pub token_id: Address,
}

/// Emitted when an allowlist is set.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistSetEvent {
    #[topic]
    pub token_id: Address,
    pub member_count: u32,
}

/// Emit a merkle claim event.
pub fn emit_merkle_claim(env: &Env, token_id: &Address, recipient: &Address, amount: u128) {
    MerkleClaimEvent {
        token_id: token_id.clone(),
        recipient: recipient.clone(),
        amount,
    }
    .publish(env);
}

/// Emit an allowlist claim event.
pub fn emit_allowlist_claim(env: &Env, token_id: &Address, recipient: &Address, amount: u128) {
    AllowlistClaimEvent {
        token_id: token_id.clone(),
        recipient: recipient.clone(),
        amount,
    }
    .publish(env);
}

/// Emit a batch mint event.
pub fn emit_mint_batch(
    env: &Env,
    token_id: &Address,
    count: u32,
    total_amount: u128,
    first_token_id: u32,
) {
    MintBatchEvent {
        token_id: token_id.clone(),
        recipient_count: count,
        total_amount,
        first_token_id,
    }
    .publish(env);
}

/// Emit a merkle root set event.
pub fn emit_merkle_root_set(env: &Env, token_id: &Address) {
    MerkleRootSetEvent {
        token_id: token_id.clone(),
    }
    .publish(env);
}

/// Emit an allowlist set event.
pub fn emit_allowlist_set(env: &Env, token_id: &Address, member_count: u32) {
    AllowlistSetEvent {
        token_id: token_id.clone(),
        member_count,
    }
    .publish(env);
}
