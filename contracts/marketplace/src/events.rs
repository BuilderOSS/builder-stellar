use soroban_sdk::{contractevent, Address, BytesN, Env, String};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceInitialized {
    #[topic]
    pub token: Address,
    pub treasury: Address,
    pub payment_asset: Address,
    pub version: String,
    pub default_secondary_fee_bps: u32,
}

/// Emitted once when the Manager launches the marketplace (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Launched {
    #[topic]
    pub treasury: Address,
    /// Whether the marketplace was unpaused at launch.
    pub opened: bool,
}

pub fn emit_launched(e: &Env, treasury: &Address, opened: bool) {
    Launched {
        treasury: treasury.clone(),
        opened,
    }
    .publish(e);
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrimaryListingCreated {
    #[topic]
    pub listing_id: u64,
    pub price: i128,
    pub expires_at: u64,
    pub payment_asset: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrimaryListingPurchased {
    #[topic]
    pub listing_id: u64,
    #[topic]
    pub buyer: Address,
    pub token_id: u32,
    pub price: i128,
    pub payment_asset: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrimaryListingCancelled {
    #[topic]
    pub listing_id: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrimaryListingExpired {
    #[topic]
    pub listing_id: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SecondaryListingCreated {
    #[topic]
    pub token_id: u32,
    pub seller: Address,
    pub price: i128,
    pub expires_at: u64,
    pub fee_bps: u32,
    pub payment_asset: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListingPurchased {
    #[topic]
    pub token_id: u32,
    #[topic]
    pub buyer: Address,
    pub seller: Address,
    pub price: i128,
    pub fee: i128,
    pub payment_asset: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListingCancelled {
    #[topic]
    pub token_id: u32,
    pub seller: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListingExpired {
    #[topic]
    pub token_id: u32,
    pub seller: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentAssetUpdated {
    pub payment_asset: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SecondaryFeeUpdated {
    pub fee_bps: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplacePaused {}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceUnpaused {}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceUpgraded {
    pub from_hash: BytesN<32>,
    pub to_hash: BytesN<32>,
}

pub fn emit_marketplace_initialized(
    e: &Env,
    token: &Address,
    treasury: &Address,
    payment_asset: &Address,
    version: &String,
    default_secondary_fee_bps: u32,
) {
    MarketplaceInitialized {
        token: token.clone(),
        treasury: treasury.clone(),
        payment_asset: payment_asset.clone(),
        version: version.clone(),
        default_secondary_fee_bps,
    }
    .publish(e);
}

pub fn emit_secondary_created(e: &Env, token_id: u32, listing: &crate::storage::Listing) {
    SecondaryListingCreated {
        token_id,
        seller: listing.seller.clone(),
        price: listing.price,
        expires_at: listing.expires_at,
        fee_bps: listing.fee_bps,
        payment_asset: listing.payment_asset.clone(),
    }
    .publish(e);
}
