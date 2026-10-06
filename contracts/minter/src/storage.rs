//! Storage definitions for the Minter contract.

use soroban_sdk::{contracttype, Address, Bytes, Env};

/// Maximum number of recipients in a single batch mint.
pub const MAX_BATCH_RECIPIENTS: u32 = 100;

/// Storage keys for the Minter contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MinterKey {
    /// Merkle root for proof-based claims
    /// Maps token_id -> merkle root bytes
    MerkleRoot(Address),

    /// Allowlist for fixed-amount claims
    /// Maps token_id -> Vec<Address>
    Allowlist(Address),

    /// Fixed amount for allowlist claims
    /// Maps token_id -> u128
    AllowlistAmount(Address),

    /// Track who's already claimed
    /// Maps (token_id, recipient) -> bool
    Claimed(Address, Address),
}

/// Get the current ledger sequence.
pub fn get_ledger(env: &Env) -> u32 {
    env.ledger().sequence()
}

/// Load merkle root from storage.
pub fn get_merkle_root(env: &Env, token_id: &Address) -> Option<Bytes> {
    env.storage()
        .instance()
        .get(&MinterKey::MerkleRoot(token_id.clone()))
}

/// Load allowlist from storage.
pub fn get_allowlist(env: &Env, token_id: &Address) -> Option<soroban_sdk::Vec<Address>> {
    env.storage()
        .instance()
        .get(&MinterKey::Allowlist(token_id.clone()))
}

/// Load allowlist amount from storage.
pub fn get_allowlist_amount(env: &Env, token_id: &Address) -> Option<u128> {
    env.storage()
        .instance()
        .get(&MinterKey::AllowlistAmount(token_id.clone()))
}

/// Check if a recipient has already claimed.
pub fn is_claimed(env: &Env, token_id: &Address, recipient: &Address) -> bool {
    env.storage()
        .instance()
        .get(&MinterKey::Claimed(token_id.clone(), recipient.clone()))
        .unwrap_or(false)
}

/// Save merkle root to storage.
pub fn set_merkle_root(env: &Env, token_id: &Address, root: &Bytes) {
    env.storage()
        .instance()
        .set(&MinterKey::MerkleRoot(token_id.clone()), root);
}

/// Save allowlist to storage.
pub fn set_allowlist(env: &Env, token_id: &Address, addresses: &soroban_sdk::Vec<Address>) {
    env.storage()
        .instance()
        .set(&MinterKey::Allowlist(token_id.clone()), addresses);
}

/// Save allowlist amount to storage.
pub fn set_allowlist_amount(env: &Env, token_id: &Address, amount: &u128) {
    env.storage()
        .instance()
        .set(&MinterKey::AllowlistAmount(token_id.clone()), amount);
}

/// Mark a recipient as claimed.
pub fn mark_claimed(env: &Env, token_id: &Address, recipient: &Address) {
    env.storage().instance().set(
        &MinterKey::Claimed(token_id.clone(), recipient.clone()),
        &true,
    );
}
