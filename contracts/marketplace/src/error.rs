use soroban_sdk::contracterror;

/// Marketplace errors (block `common::error::codes::MARKETPLACE`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MarketplaceError {
    /// Contract configuration missing
    NotInitialized = 7701,
    /// Price is not positive
    InvalidPrice = 7702,
    /// Expiry is not in the future
    InvalidExpiry = 7703,
    /// The token is already listed
    ListingExists = 7704,
    /// No such listing
    ListingNotFound = 7705,
    /// The listing has expired
    ListingExpired = 7706,
    /// The listing has not expired yet
    ListingActive = 7707,
    /// The caller is not the token owner / listing seller
    NotSeller = 7708,
    /// Fee above `common::MAX_FEE_BPS`
    InvalidFee = 7709,
    /// Arithmetic overflow in fee calculations
    ArithmeticOverflow = 7710,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 7711,
    /// The payment asset differs from the one the caller expected
    PaymentAssetMismatch = 7712,
    /// The marketplace is paused (new listings and purchases are rejected)
    Paused = 7713,
    /// The current fee exceeds the seller's `max_fee_bps`
    FeeAboveMax = 7714,
    /// The listing price exceeds the buyer's `max_price`
    PriceAboveMax = 7715,
}
