use soroban_sdk::{contractevent, Address, Env, String};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceInitialized {
    #[topic]
    pub token: Address,
    #[topic]
    pub admin: Address,
    pub treasury: Address,
    pub payment_asset: Address,
    pub default_secondary_fee_bps: u32,
}

/// Emitted once when the Manager launches the marketplace (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceLaunched {
    #[topic]
    pub treasury: Address,
    /// Whether the marketplace was unpaused at launch.
    pub opened: bool,
}

pub fn emit_launched(e: &Env, treasury: &Address, opened: bool) {
    MarketplaceLaunched {
        treasury: treasury.clone(),
        opened,
    }
    .publish(e);
}

/// A quick-buy pool opened (by proposal).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolOpened {
    #[topic]
    pub pool_id: u32,
    pub price: i128,
    pub asset: Address,
    pub expires_at: u64,
    pub size: u32,
    pub max_per_buyer: u32,
    pub max_sold_per_period: u32,
    pub period_secs: u64,
}

/// `count` tokens from `first_token_id` minted into the pool's custody.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolRestocked {
    #[topic]
    pub pool_id: u32,
    pub first_token_id: u32,
    pub count: u32,
    pub stocked: u32,
}

/// A buyer picked `token_id` from a pool.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolPurchased {
    #[topic]
    pub pool_id: u32,
    #[topic]
    pub buyer: Address,
    pub token_id: u32,
    pub price: i128,
    pub asset: Address,
}

/// A pool closed; `released` is the unstocked allowance given back.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolClosed {
    #[topic]
    pub pool_id: u32,
    pub released: u32,
}

/// `count` unsold tokens returned to the Treasury; `pages_left` 0 when done.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolSwept {
    #[topic]
    pub pool_id: u32,
    pub count: u32,
    pub pages_left: u32,
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

/// A comment on a token's secondary listings. Keyed by token, so the thread
/// carries over relistings. Event-only: the body is never stored.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListingCommented {
    #[topic]
    pub token_id: u32,
    #[topic]
    pub author: Address,
    pub body: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentAssetUpdated {
    pub payment_asset: Address,
    #[topic]
    pub changed_by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SecondaryFeeUpdated {
    pub fee_bps: u32,
    #[topic]
    pub changed_by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplacePaused {
    /// The admin, or the Manager when `launch` forces the pause.
    #[topic]
    pub changed_by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceUnpaused {
    /// The admin, or the Manager when `launch` opens the marketplace.
    #[topic]
    pub changed_by: Address,
}

pub fn emit_marketplace_initialized(
    e: &Env,
    token: &Address,
    admin: &Address,
    treasury: &Address,
    payment_asset: &Address,
    default_secondary_fee_bps: u32,
) {
    MarketplaceInitialized {
        token: token.clone(),
        admin: admin.clone(),
        treasury: treasury.clone(),
        payment_asset: payment_asset.clone(),
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
