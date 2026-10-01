use soroban_sdk::{contracttype, panic_with_error, Address, BytesN, Env, String};

use crate::error::MarketplaceError;

const TTL: u32 = 518_400;
const MAX_TTL: u32 = 518_400;
pub const MAX_FEE_BPS: u32 = 10_000;

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum ListingKind {
    Primary,
    Secondary,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Listing {
    pub seller: Address,
    pub price: i128,
    pub expires_at: u64,
    pub fee_bps: u32,
    pub kind: ListingKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct MarketplaceConfig {
    pub token: Address,
    pub treasury: Address,
    pub payment_asset: Address,
    pub default_secondary_fee_bps: u32,
    pub manager: Address,
    pub current_hash: BytesN<32>,
    pub version: String,
    pub paused: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum DataKey {
    Config,
    Listing(u32),
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
