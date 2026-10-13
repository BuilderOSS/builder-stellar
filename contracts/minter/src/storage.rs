//! Storage for the ClaimMinter module (docs/designs/membership-models.md §3).
//!
//! One ClaimMinter per DAO. Its instance holds the wiring (`Config`), the
//! list counter, the assurance list id, and the common admin, lifecycle and
//! upgrade keys. Each list is one persistent entry, `List(id)`, DAO-owned and
//! listed by `renewal_keys`. Each claimer's progress on a list is one
//! persistent entry, `Claim(id, claimer)`: it belongs to the claimer (holder
//! class), so the DAO's renewal sweep leaves it out and the claimer's next
//! claim or refund restores it if it archived. Both use the shared long-lived
//! persistent TTL policy (`common::ttl`) and are renewed on every touch.

use soroban_sdk::{contracttype, Address, BytesN, Env, String};

/// Layout version of the ClaimMinter's storage (`common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;

/// Maximum merkle proof depth (supports 2^32 leaves).
pub const MAX_PROOF_LEN: u32 = 32;

/// Wiring fixed at construction.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimsConfig {
    pub token: Address,
    /// Receives every payment once the DAO is Live, and the assurance escrow
    /// at launch. Fixed here, so nobody can redirect the escrow.
    pub treasury: Address,
    /// Registry for `version()` and upgrade approvals; the only caller of
    /// `launch`, `handoff` and `recovery_upgrade`.
    pub manager: Address,
    /// The asset every list opened in Setup is priced in (`ClaimsConfig` at
    /// `create_dao` / `create_module`). Lists opened after launch may use any
    /// asset.
    pub payment_asset: Address,
}

pub use common::modules::{AssuranceState, AssuranceTerms};

/// One claim list: a merkle root of `(claimer, amount)` leaves.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimList {
    pub root: BytesN<32>,
    /// `ipfs://<cid>` of the full tree (`builder-stellar-merkle-v1`). A hint:
    /// consumers recompute the root from it before offering a claim.
    pub tree_uri: String,
    pub asset: Address,
    /// Price per token in `asset`, 0 for a free list.
    pub price: i128,
    /// Claims stop at this ledger timestamp.
    pub expires_at: u64,
    /// Most tokens this list mints across all claimers.
    pub total: u32,
    pub minted: u32,
    /// Distinct addresses that claimed at least once.
    pub claimers: u32,
    /// Assurance terms, flattened: a threshold of 0 means none (see
    /// [`ClaimList::assurance`]).
    pub threshold_claimers: u32,
    pub deadline: u64,
    /// Payments held until launch (assurance list in Setup only).
    pub escrow: i128,
}

impl ClaimList {
    /// The list's assurance terms, if it is the assurance list.
    pub fn assurance(&self) -> Option<AssuranceTerms> {
        (self.threshold_claimers > 0).then_some(AssuranceTerms {
            threshold_claimers: self.threshold_claimers,
            deadline: self.deadline,
        })
    }
}

/// A claimer's progress on one list.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ClaimRecord {
    /// Tokens claimed so far, at most the leaf amount.
    pub claimed: u32,
    /// Payments in escrow for this claimer (refundable while `Failed`).
    pub escrowed: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimsKey {
    /// Instance: [`ClaimsConfig`].
    Config,
    /// Instance: u32, the id the next list receives.
    NextListId,
    /// Instance: u32, the one assurance list, once opened.
    AssuranceList,
    /// Persistent: list id -> [`ClaimList`] (DAO-owned).
    List(u32),
    /// Persistent: (list id, claimer) -> [`ClaimRecord`] (holder class).
    Claim(u32, Address),
}

fn get<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &ClaimsKey) -> Option<V> {
    let key = common::ns(env, key.clone());
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        common::ttl::extend_persistent(env, &key);
    }
    value
}

fn set<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &ClaimsKey, value: &V) {
    let key = common::ns(env, key.clone());
    env.storage().persistent().set(&key, value);
    common::ttl::extend_persistent(env, &key);
}

pub fn get_config(env: &Env) -> ClaimsConfig {
    env.storage()
        .instance()
        .get(&common::ns(env, ClaimsKey::Config))
        .unwrap_or_else(|| soroban_sdk::panic_with_error!(env, common::CommonError::ManagerNotSet))
}

pub fn set_config(env: &Env, config: &ClaimsConfig) {
    env.storage()
        .instance()
        .set(&common::ns(env, ClaimsKey::Config), config);
}

pub fn next_list_id(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&common::ns(env, ClaimsKey::NextListId))
        .unwrap_or(0)
}

/// Returns the next list id and advances the counter (ids start at 0).
pub fn take_list_id(env: &Env) -> u32 {
    let id = next_list_id(env);
    env.storage()
        .instance()
        .set(&common::ns(env, ClaimsKey::NextListId), &(id + 1));
    id
}

pub fn assurance_list(env: &Env) -> Option<u32> {
    env.storage()
        .instance()
        .get(&common::ns(env, ClaimsKey::AssuranceList))
}

pub fn set_assurance_list(env: &Env, list_id: u32) {
    env.storage()
        .instance()
        .set(&common::ns(env, ClaimsKey::AssuranceList), &list_id);
}

pub fn get_list(env: &Env, list_id: u32) -> Option<ClaimList> {
    get(env, &ClaimsKey::List(list_id))
}

pub fn set_list(env: &Env, list_id: u32, list: &ClaimList) {
    set(env, &ClaimsKey::List(list_id), list);
}

pub fn get_claim(env: &Env, list_id: u32, claimer: &Address) -> ClaimRecord {
    get(env, &ClaimsKey::Claim(list_id, claimer.clone())).unwrap_or_default()
}

pub fn set_claim(env: &Env, list_id: u32, claimer: &Address, record: &ClaimRecord) {
    set(env, &ClaimsKey::Claim(list_id, claimer.clone()), record);
}

/// Every `ClaimsKey` variant with sample arguments, for the key guard test.
/// `index` fails to compile when a variant is added: give it the next index,
/// raise `VARIANTS` and add a sample to `all`, or the guard test fails.
#[cfg(test)]
pub(crate) mod key_samples {
    extern crate std;
    use super::*;
    #[allow(unused_imports)]
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, IntoVal, Val};

    pub const VARIANTS: usize = 5;

    pub fn index(key: &ClaimsKey) -> usize {
        match key {
            ClaimsKey::Config => 0,
            ClaimsKey::NextListId => 1,
            ClaimsKey::AssuranceList => 2,
            ClaimsKey::List(_) => 3,
            ClaimsKey::Claim(..) => 4,
        }
    }

    pub fn all(e: &Env) -> std::vec::Vec<Val> {
        let a = soroban_sdk::Address::generate(e);
        let keys = std::vec![
            ClaimsKey::Config,
            ClaimsKey::NextListId,
            ClaimsKey::AssuranceList,
            ClaimsKey::List(0),
            ClaimsKey::Claim(0, a.clone()),
        ];
        common::testutils::assert_every_variant_sampled(
            "ClaimsKey",
            &keys.iter().map(index).collect::<std::vec::Vec<_>>(),
            VARIANTS,
        );
        keys.into_iter().map(|k| k.into_val(e)).collect()
    }
}
