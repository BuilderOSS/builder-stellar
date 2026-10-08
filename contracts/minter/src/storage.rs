//! Storage definitions for the Minter contract.
//!
//! All per-token configuration and claim state lives in persistent storage as
//! one entry per key, so the Minter's instance entry stays tiny and every call
//! only loads the entries it touches. Entries have their TTL bumped on use.

use soroban_sdk::{contracttype, Address, BytesN, Env};

/// Maximum number of recipients in a single batch mint.
pub const MAX_BATCH_RECIPIENTS: u32 = 100;

/// Maximum merkle proof depth (supports 2^32 leaves).
pub const MAX_PROOF_LEN: u32 = 32;

/// Approximate number of ledgers in a day (~5 seconds per ledger).
pub const DAY_IN_LEDGERS: u32 = 17280;

/// TTL extension applied to touched persistent entries (1 year).
pub const TTL_EXTEND_AMOUNT: u32 = 365 * DAY_IN_LEDGERS;

/// Extend when remaining TTL drops below this (~30 days).
pub const TTL_THRESHOLD: u32 = TTL_EXTEND_AMOUNT - 335 * DAY_IN_LEDGERS;

/// Storage keys for the Minter contract (persistent storage).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MinterKey {
    /// Merkle root for proof-based claims: token_id -> BytesN<32>
    MerkleRoot(Address),

    /// Fixed amount for allowlist claims: token_id -> u128
    AllowlistAmount(Address),

    /// Current allowlist version: token_id -> u32. Bumped on every
    /// `set_allowlist`, which invalidates all entries of older versions.
    AllowlistVersion(Address),

    /// Allowlist membership: (token_id, version, address) -> true
    Allowlisted(Address, u32, Address),

    /// Claim marker: (token_id, recipient) -> true
    Claimed(Address, Address),
}

fn get<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &MinterKey) -> Option<V> {
    let value = env.storage().persistent().get(key);
    if value.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_AMOUNT);
    }
    value
}

fn set<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &MinterKey, value: &V) {
    env.storage().persistent().set(key, value);
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_AMOUNT);
}

/// Load merkle root from storage.
pub fn get_merkle_root(env: &Env, token_id: &Address) -> Option<BytesN<32>> {
    get(env, &MinterKey::MerkleRoot(token_id.clone()))
}

/// Load allowlist amount from storage.
pub fn get_allowlist_amount(env: &Env, token_id: &Address) -> Option<u128> {
    get(env, &MinterKey::AllowlistAmount(token_id.clone()))
}

/// Current allowlist version (0 if never set).
pub fn get_allowlist_version(env: &Env, token_id: &Address) -> u32 {
    get(env, &MinterKey::AllowlistVersion(token_id.clone())).unwrap_or(0)
}

/// Whether `recipient` is on the current allowlist.
pub fn is_allowlisted(env: &Env, token_id: &Address, version: u32, recipient: &Address) -> bool {
    get::<bool>(
        env,
        &MinterKey::Allowlisted(token_id.clone(), version, recipient.clone()),
    )
    .unwrap_or(false)
}

/// Check if a recipient has already claimed.
pub fn is_claimed(env: &Env, token_id: &Address, recipient: &Address) -> bool {
    get::<bool>(
        env,
        &MinterKey::Claimed(token_id.clone(), recipient.clone()),
    )
    .unwrap_or(false)
}

/// Save merkle root to storage.
pub fn set_merkle_root(env: &Env, token_id: &Address, root: &BytesN<32>) {
    set(env, &MinterKey::MerkleRoot(token_id.clone()), root);
}

/// Save allowlist amount to storage.
pub fn set_allowlist_amount(env: &Env, token_id: &Address, amount: &u128) {
    set(env, &MinterKey::AllowlistAmount(token_id.clone()), amount);
}

/// Save allowlist version to storage.
pub fn set_allowlist_version(env: &Env, token_id: &Address, version: u32) {
    set(
        env,
        &MinterKey::AllowlistVersion(token_id.clone()),
        &version,
    );
}

/// Add an address to the allowlist of the given version.
pub fn add_allowlisted(env: &Env, token_id: &Address, version: u32, recipient: &Address) {
    set(
        env,
        &MinterKey::Allowlisted(token_id.clone(), version, recipient.clone()),
        &true,
    );
}

/// Mark a recipient as claimed.
pub fn mark_claimed(env: &Env, token_id: &Address, recipient: &Address) {
    set(
        env,
        &MinterKey::Claimed(token_id.clone(), recipient.clone()),
        &true,
    );
}
