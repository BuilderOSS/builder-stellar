//! Storage definitions for the Minter contract.
//!
//! All per-token configuration and claim state lives in persistent storage as
//! one entry per key, so the Minter's instance entry stays tiny and every call
//! only loads the entries it touches. Entries follow the shared long-lived
//! persistent TTL policy (`common::ttl`) and are renewed on use; every entry
//! point also renews the Minter's own instance (and code) TTL.

use soroban_sdk::{contracttype, Address, BytesN, Env};

/// Maximum number of recipients in a single batch mint (one token each). The
/// token additionally requires the whole batch to fit its event budget
/// (`common::batch_mint_fits`).
pub const MAX_BATCH_RECIPIENTS: u32 = common::MAX_BATCH_RECIPIENTS;

/// Maximum merkle proof depth (supports 2^32 leaves).
pub const MAX_PROOF_LEN: u32 = 32;

/// Storage keys for the Minter contract (persistent storage).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MinterKey {
    /// Merkle root for proof-based claims: token_id -> BytesN<32>
    MerkleRoot(Address),

    /// Fixed amount for allowlist claims: token_id -> u128
    AllowlistAmount(Address),

    /// Current allowlist version: token_id -> u32. Bumped on every
    /// `set_allowlist`, which invalidates all entries of older versions. It is
    /// also the allowlist claim round: `AllowlistClaimed` is keyed by it.
    AllowlistVersion(Address),

    /// Allowlist membership: (token_id, version, address) -> true
    Allowlisted(Address, u32, Address),

    /// Merkle claim round: token_id -> u32 (default 0). Bumped ONLY by
    /// `set_merkle_root`, so a new root lets earlier claimers claim again while
    /// a re-claim within the same round stays blocked.
    MerkleRound(Address),

    /// Merkle claim marker: (token_id, merkle_round, recipient) -> true
    MerkleClaimed(Address, u32, Address),

    /// Allowlist claim marker: (token_id, allowlist_version, recipient) -> true.
    /// Markers are per method: a recipient may claim once per method per round
    /// (this replaces the old single marker shared by both methods; admins
    /// control both lists).
    AllowlistClaimed(Address, u32, Address),
}

fn get<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &MinterKey) -> Option<V> {
    let value = env.storage().persistent().get(key);
    if value.is_some() {
        common::ttl::extend_persistent(env, key);
    }
    value
}

fn set<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &MinterKey, value: &V) {
    env.storage().persistent().set(key, value);
    common::ttl::extend_persistent(env, key);
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

/// Current merkle claim round (0 if no root was ever set).
pub fn get_merkle_round(env: &Env, token_id: &Address) -> u32 {
    get(env, &MinterKey::MerkleRound(token_id.clone())).unwrap_or(0)
}

/// Start a new merkle claim round; returns the new round number.
pub fn bump_merkle_round(env: &Env, token_id: &Address) -> u32 {
    let round = get_merkle_round(env, token_id).saturating_add(1);
    set(env, &MinterKey::MerkleRound(token_id.clone()), &round);
    round
}

/// Whether `recipient` already claimed via merkle in `round`.
pub fn is_merkle_claimed(env: &Env, token_id: &Address, round: u32, recipient: &Address) -> bool {
    get::<bool>(
        env,
        &MinterKey::MerkleClaimed(token_id.clone(), round, recipient.clone()),
    )
    .unwrap_or(false)
}

/// Whether `recipient` already claimed via allowlist in `round`.
pub fn is_allowlist_claimed(
    env: &Env,
    token_id: &Address,
    round: u32,
    recipient: &Address,
) -> bool {
    get::<bool>(
        env,
        &MinterKey::AllowlistClaimed(token_id.clone(), round, recipient.clone()),
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

/// Mark a recipient as having claimed via merkle in `round`.
pub fn mark_merkle_claimed(env: &Env, token_id: &Address, round: u32, recipient: &Address) {
    set(
        env,
        &MinterKey::MerkleClaimed(token_id.clone(), round, recipient.clone()),
        &true,
    );
}

/// Mark a recipient as having claimed via allowlist in `round`.
pub fn mark_allowlist_claimed(env: &Env, token_id: &Address, round: u32, recipient: &Address) {
    set(
        env,
        &MinterKey::AllowlistClaimed(token_id.clone(), round, recipient.clone()),
        &true,
    );
}
