use soroban_sdk::{contracttype, panic_with_error, Address, Env};

use crate::error::MarketplaceError;

const TTL: u32 = 518_400;
const MAX_TTL: u32 = 518_400;
pub const MAX_FEE_BPS: u32 = 10_000;

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

/// Primary sale listing, keyed by listing id. No token exists until bought.
#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct PrimaryListing {
    pub price: i128,
    pub expires_at: u64,
    /// Asset captured at creation time.
    pub payment_asset: Address,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct MarketplaceConfig {
    pub token: Address,
    /// Setup-phase admin of the param setters; replaced by `treasury` once Live.
    pub launch_admin: Address,
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
    /// listing_id -> PrimaryListing (persistent)
    PrimaryListing(u64),
    /// u64 counter of primary listing ids (instance)
    NextListingId,
}

pub fn get_config(e: &Env) -> MarketplaceConfig {
    e.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::NotInitialized))
}

pub fn set_config(e: &Env, config: &MarketplaceConfig) {
    e.storage().instance().set(&DataKey::Config, config);
}

pub fn get_listing(e: &Env, token_id: u32) -> Option<Listing> {
    let key = DataKey::Listing(token_id);
    let listing = e.storage().persistent().get(&key);
    if listing.is_some() {
        e.storage().persistent().extend_ttl(&key, TTL, MAX_TTL);
    }
    listing
}

pub fn set_listing(e: &Env, token_id: u32, listing: &Listing) {
    let key = DataKey::Listing(token_id);
    e.storage().persistent().set(&key, listing);
    e.storage().persistent().extend_ttl(&key, TTL, MAX_TTL);
}

pub fn remove_listing(e: &Env, token_id: u32) {
    e.storage().persistent().remove(&DataKey::Listing(token_id));
}

pub fn get_primary_listing(e: &Env, listing_id: u64) -> Option<PrimaryListing> {
    let key = DataKey::PrimaryListing(listing_id);
    let listing = e.storage().persistent().get(&key);
    if listing.is_some() {
        e.storage().persistent().extend_ttl(&key, TTL, MAX_TTL);
    }
    listing
}

pub fn set_primary_listing(e: &Env, listing_id: u64, listing: &PrimaryListing) {
    let key = DataKey::PrimaryListing(listing_id);
    e.storage().persistent().set(&key, listing);
    e.storage().persistent().extend_ttl(&key, TTL, MAX_TTL);
}

pub fn remove_primary_listing(e: &Env, listing_id: u64) {
    e.storage()
        .persistent()
        .remove(&DataKey::PrimaryListing(listing_id));
}

/// Returns the next listing id and advances the counter (ids start at 0).
pub fn take_next_listing_id(e: &Env) -> u64 {
    let id: u64 = e
        .storage()
        .instance()
        .get(&DataKey::NextListingId)
        .unwrap_or(0);
    e.storage()
        .instance()
        .set(&DataKey::NextListingId, &(id + 1));
    id
}

pub fn peek_next_listing_id(e: &Env) -> u64 {
    e.storage()
        .instance()
        .get(&DataKey::NextListingId)
        .unwrap_or(0)
}
