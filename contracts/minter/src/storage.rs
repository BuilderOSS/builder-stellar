//! Storage definitions for the Minter contract.
//!
//! The Minter is one shared platform contract. Its instance holds only the
//! Manager address and the common upgrade keys; per-token claim state lives in
//! persistent storage, one entry per key, renewed on use with the shared
//! long-lived persistent TTL policy (`common::ttl`). Every entry point also
//! renews the Minter's own instance (and, briefly, its code).
//!
//! Per-token keys: `MerkleRoot(token)` (root and `tree_uri`) and
//! `MerkleRound(token)` are DAO-owned and in the DAO's renewal sweep;
//! `MerkleClaimed(token, round, recipient)` markers are per claimer.

use soroban_sdk::{contracttype, Address, BytesN, Env, String};

/// Layout version of the Minter's storage (`common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;

/// Maximum number of recipients in a single batch mint (one token each). The
/// token additionally requires the whole batch to fit its event budget
/// (`common::batch_mint_fits`).
pub const MAX_BATCH_RECIPIENTS: u32 = common::MAX_BATCH_RECIPIENTS;

/// Maximum merkle proof depth (supports 2^32 leaves).
pub const MAX_PROOF_LEN: u32 = 32;
/// The upgrade notice lives in `common::upgrade` (shared with the Manager).
pub use common::upgrade::RECOMMENDED_UPGRADE_DELAY;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MinterKey {
    /// Instance: the Manager (registry and upgrade authority).
    Manager,
    /// Persistent: token -> [`MerkleConfig`] for the current round.
    MerkleRoot(Address),
    /// Persistent: token -> u32 (default 0). Bumped by every
    /// `set_merkle_root`, so a new root lets earlier claimers claim again while
    /// a re-claim within the same round stays blocked.
    MerkleRound(Address),
    /// Persistent: (token, round, recipient) -> true.
    MerkleClaimed(Address, u32, Address),
}

/// The current merkle root of a token and where its full tree is published.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerkleConfig {
    pub root: BytesN<32>,
    /// `ipfs://<cid>` of the full tree (docs/STORAGE_DIET.md § 4 Minter). A
    /// hint: consumers recompute the root from it before offering a claim.
    pub tree_uri: String,
}

/// `claim_status` result. `root` and `tree_uri` are `None` before the first
/// root; `round` is 0 then.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimStatus {
    pub root: Option<BytesN<32>>,
    pub round: u32,
    pub tree_uri: Option<String>,
    pub claimed: bool,
}

fn get<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &MinterKey) -> Option<V> {
    let key = common::ns(env, key.clone());
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        common::ttl::extend_persistent(env, &key);
    }
    value
}

fn set<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &MinterKey, value: &V) {
    let key = common::ns(env, key.clone());
    env.storage().persistent().set(&key, value);
    common::ttl::extend_persistent(env, &key);
}

/// The Manager wired at construction.
pub fn get_manager(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&common::ns(env, MinterKey::Manager))
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, common::CommonError::ManagerNotSet))
}

pub fn set_manager(env: &Env, manager: &Address) {
    env.storage()
        .instance()
        .set(&common::ns(env, MinterKey::Manager), manager);
}

/// The token's current root and tree URI.
pub fn get_merkle_config(env: &Env, token_id: &Address) -> Option<MerkleConfig> {
    get(env, &MinterKey::MerkleRoot(token_id.clone()))
}

pub fn set_merkle_config(env: &Env, token_id: &Address, config: &MerkleConfig) {
    set(env, &MinterKey::MerkleRoot(token_id.clone()), config);
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

/// Whether `recipient` already claimed in `round`.
pub fn is_merkle_claimed(env: &Env, token_id: &Address, round: u32, recipient: &Address) -> bool {
    get::<bool>(
        env,
        &MinterKey::MerkleClaimed(token_id.clone(), round, recipient.clone()),
    )
    .unwrap_or(false)
}

/// Mark a recipient as having claimed in `round`.
pub fn mark_merkle_claimed(env: &Env, token_id: &Address, round: u32, recipient: &Address) {
    set(
        env,
        &MinterKey::MerkleClaimed(token_id.clone(), round, recipient.clone()),
        &true,
    );
}

/// Every `MinterKey` variant with sample arguments, for the key guard test.
/// `index` fails to compile when a variant is added: give it the next index,
/// raise `VARIANTS` and add a sample to `all`, or the guard test fails.
#[cfg(test)]
pub(crate) mod key_samples {
    extern crate std;
    use super::*;
    #[allow(unused_imports)]
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, IntoVal, Val};

    pub const VARIANTS: usize = 4;

    pub fn index(key: &MinterKey) -> usize {
        match key {
            MinterKey::Manager => 0,
            MinterKey::MerkleRoot(_) => 1,
            MinterKey::MerkleRound(_) => 2,
            MinterKey::MerkleClaimed(..) => 3,
        }
    }

    #[allow(unused_variables)]
    pub fn all(e: &Env) -> std::vec::Vec<Val> {
        let a = soroban_sdk::Address::generate(e);
        let id = soroban_sdk::BytesN::<32>::from_array(e, &[0; 32]);
        let text = soroban_sdk::String::from_str(e, "x");
        let keys = std::vec![
            MinterKey::Manager,
            MinterKey::MerkleRoot(a.clone()),
            MinterKey::MerkleRound(a.clone()),
            MinterKey::MerkleClaimed(a.clone(), 0, a.clone()),
        ];
        common::testutils::assert_every_variant_sampled(
            "MinterKey",
            &keys.iter().map(index).collect::<std::vec::Vec<_>>(),
            VARIANTS,
        );
        keys.into_iter().map(|k| k.into_val(e)).collect()
    }
}
