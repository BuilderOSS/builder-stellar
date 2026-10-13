use soroban_sdk::{contracttype, panic_with_error, Address, Env, Vec};

use crate::error::MarketplaceError;

/// Storage-layout version of this code (see `common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;

/// Upper bound for the secondary-sale fee (25%).
pub const MAX_FEE_BPS: u32 = common::MAX_FEE_BPS;

/// Listings are re-extended to ~30 days whenever fewer than ~7 days remain.
/// An expired listing can be cleared by anyone, so listings only need to
/// outlive their own expiry; any touch renews them.
const LISTING_TTL_EXTEND_TO: u32 = 30 * common::ttl::DAY_IN_LEDGERS;
const LISTING_TTL_THRESHOLD: u32 = 7 * common::ttl::DAY_IN_LEDGERS;

fn extend_listing<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(e: &Env, key: &K) {
    common::ttl::extend_persistent_for(e, key, LISTING_TTL_THRESHOLD, LISTING_TTL_EXTEND_TO);
}

/// Secondary (escrowed-token) listing, keyed by token id.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Listing {
    pub seller: Address,
    pub price: i128,
    pub expires_at: u64,
    pub fee_bps: u32,
    /// Asset captured at list time; later `set_payment_asset` calls do not affect it.
    pub payment_asset: Address,
}

/// Most token ids one pool stock page holds (eng review R8).
pub const POOL_PAGE_SIZE: u32 = 64;
/// Most pools open at once (opened and not yet swept empty). Bounds the
/// instance entry every call reads and the pool walk in `renewal_keys`.
pub const MAX_OPEN_POOLS: u32 = 8;
/// Most tokens one `sweep_pool` call returns to the Treasury.
pub const MAX_SWEEP: u32 = 25;

/// A quick-buy pool: stock minted into the Marketplace's custody and sold at
/// one price, with a per-buyer cap and a pool-wide sales rate
/// (docs/designs/membership-models.md §4).
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Pool {
    pub price: i128,
    pub asset: Address,
    /// Sales and restocks stop at this ledger timestamp.
    pub expires_at: u64,
    /// Tokens the pool may stock in all (its allowance reservation).
    pub size: u32,
    pub stocked: u32,
    pub sold: u32,
    pub max_per_buyer: u32,
    /// Most sales per `period_secs`, pool-wide.
    pub max_sold_per_period: u32,
    pub period_secs: u64,
    pub period_start: u64,
    pub sold_in_period: u32,
    pub closed: bool,
}

/// Instance bookkeeping for an open pool (opened, not yet swept empty).
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct PoolSlot {
    pub pool_id: u32,
    /// The pool's share of the Marketplace's allowance not yet minted.
    pub unstocked: u32,
    /// Stock pages written, `PoolStock(pool_id, 0..pages)`.
    pub pages: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct MarketplaceConfig {
    pub token: Address,
    /// Fee and primary-sale recipient. Also the admin once live (`common::admin`).
    pub treasury: Address,
    pub payment_asset: Address,
    pub default_secondary_fee_bps: u32,
    pub manager: Address,
    pub paused: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum DataKey {
    Config,
    Listing(u32),
    /// Instance: u32, the id the next pool receives.
    NextPoolId,
    /// Instance: Vec<PoolSlot>, at most `MAX_OPEN_POOLS`.
    OpenPools,
    /// Persistent: pool id -> [`Pool`] (DAO-owned).
    Pool(u32),
    /// Persistent: (pool id, page) -> Vec<u32> stocked ids (DAO-owned).
    PoolStock(u32, u32),
    /// Persistent: (pool id, buyer) -> u32 bought (the buyer's; holder class).
    PoolBuyer(u32, Address),
}

pub fn get_config(e: &Env) -> MarketplaceConfig {
    e.storage()
        .instance()
        .get(&common::ns(e, DataKey::Config))
        .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::NotInitialized))
}

pub fn set_config(e: &Env, config: &MarketplaceConfig) {
    e.storage()
        .instance()
        .set(&common::ns(e, DataKey::Config), config);
}

pub fn get_listing(e: &Env, token_id: u32) -> Option<Listing> {
    let key = common::ns(e, DataKey::Listing(token_id));
    let listing = e.storage().persistent().get(&key);
    if listing.is_some() {
        extend_listing(e, &key);
    }
    listing
}

pub fn set_listing(e: &Env, token_id: u32, listing: &Listing) {
    let key = common::ns(e, DataKey::Listing(token_id));
    e.storage().persistent().set(&key, listing);
    extend_listing(e, &key);
}

pub fn remove_listing(e: &Env, token_id: u32) {
    e.storage()
        .persistent()
        .remove(&common::ns(e, DataKey::Listing(token_id)));
}

fn get_persistent<V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(
    e: &Env,
    key: DataKey,
) -> Option<V> {
    let key = common::ns(e, key);
    let value = e.storage().persistent().get(&key);
    if value.is_some() {
        common::ttl::extend_persistent(e, &key);
    }
    value
}

fn set_persistent<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    e: &Env,
    key: DataKey,
    value: &V,
) {
    let key = common::ns(e, key);
    e.storage().persistent().set(&key, value);
    common::ttl::extend_persistent(e, &key);
}

pub fn get_pool(e: &Env, pool_id: u32) -> Option<Pool> {
    get_persistent(e, DataKey::Pool(pool_id))
}

pub fn set_pool(e: &Env, pool_id: u32, pool: &Pool) {
    set_persistent(e, DataKey::Pool(pool_id), pool);
}

pub fn get_stock(e: &Env, pool_id: u32, page: u32) -> Option<Vec<u32>> {
    get_persistent(e, DataKey::PoolStock(pool_id, page))
}

pub fn set_stock(e: &Env, pool_id: u32, page: u32, ids: &Vec<u32>) {
    set_persistent(e, DataKey::PoolStock(pool_id, page), ids);
}

pub fn remove_stock(e: &Env, pool_id: u32, page: u32) {
    e.storage()
        .persistent()
        .remove(&common::ns(e, DataKey::PoolStock(pool_id, page)));
}

pub fn get_bought(e: &Env, pool_id: u32, buyer: &Address) -> u32 {
    get_persistent(e, DataKey::PoolBuyer(pool_id, buyer.clone())).unwrap_or(0)
}

pub fn set_bought(e: &Env, pool_id: u32, buyer: &Address, count: u32) {
    set_persistent(e, DataKey::PoolBuyer(pool_id, buyer.clone()), &count);
}

pub fn next_pool_id(e: &Env) -> u32 {
    e.storage()
        .instance()
        .get(&common::ns(e, DataKey::NextPoolId))
        .unwrap_or(0)
}

/// Returns the next pool id and advances the counter (ids start at 0).
pub fn take_pool_id(e: &Env) -> u32 {
    let id = next_pool_id(e);
    e.storage()
        .instance()
        .set(&common::ns(e, DataKey::NextPoolId), &(id + 1));
    id
}

pub fn open_pools(e: &Env) -> Vec<PoolSlot> {
    e.storage()
        .instance()
        .get(&common::ns(e, DataKey::OpenPools))
        .unwrap_or(Vec::new(e))
}

pub fn set_open_pools(e: &Env, slots: &Vec<PoolSlot>) {
    e.storage()
        .instance()
        .set(&common::ns(e, DataKey::OpenPools), slots);
}

/// Every `DataKey` variant with sample arguments, for the key guard test.
/// `index` fails to compile when a variant is added: give it the next index,
/// raise `VARIANTS` and add a sample to `all`, or the guard test fails.
#[cfg(test)]
pub(crate) mod key_samples {
    extern crate std;
    use super::*;
    #[allow(unused_imports)]
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, IntoVal, Val};

    pub const VARIANTS: usize = 7;

    pub fn index(key: &DataKey) -> usize {
        match key {
            DataKey::Config => 0,
            DataKey::Listing(_) => 1,
            DataKey::NextPoolId => 2,
            DataKey::OpenPools => 3,
            DataKey::Pool(_) => 4,
            DataKey::PoolStock(..) => 5,
            DataKey::PoolBuyer(..) => 6,
        }
    }

    #[allow(unused_variables)]
    pub fn all(e: &Env) -> std::vec::Vec<Val> {
        let a = soroban_sdk::Address::generate(e);
        let id = soroban_sdk::BytesN::<32>::from_array(e, &[0; 32]);
        let text = soroban_sdk::String::from_str(e, "x");
        let keys = std::vec![
            DataKey::Config,
            DataKey::Listing(0),
            DataKey::NextPoolId,
            DataKey::OpenPools,
            DataKey::Pool(0),
            DataKey::PoolStock(0, 0),
            DataKey::PoolBuyer(0, a.clone()),
        ];
        common::testutils::assert_every_variant_sampled(
            "DataKey",
            &keys.iter().map(index).collect::<std::vec::Vec<_>>(),
            VARIANTS,
        );
        keys.into_iter().map(|k| k.into_val(e)).collect()
    }
}
