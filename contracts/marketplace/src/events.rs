use soroban_sdk::{contractevent, Address, BytesN, Env, String};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceInitialized {
    #[topic]
    pub token: Address,
    pub treasury: Address,
    pub payment_asset: Address,
    pub version: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrimaryListingCreated {
    #[topic]
    pub token_id: u32,
    pub seller: Address,
    pub price: i128,
    pub expires_at: u64,
    pub fee_bps: u32,
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

pub fn emit_created(e: &Env, id: u32, listing: &crate::storage::Listing) {
    match &listing.kind {
        crate::storage::ListingKind::Primary => PrimaryListingCreated {
            token_id: id,
            seller: listing.seller.clone(),
            price: listing.price,
            expires_at: listing.expires_at,
            fee_bps: listing.fee_bps,
        }
        .publish(e),
        crate::storage::ListingKind::Secondary => SecondaryListingCreated {
            token_id: id,
            seller: listing.seller.clone(),
            price: listing.price,
            expires_at: listing.expires_at,
            fee_bps: listing.fee_bps,
        }
        .publish(e),
    }
}
