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
    /// Comment body is empty
    CommentEmpty = 7716,
    /// Comment body exceeds `MAX_COMMENT_LENGTH`
    CommentTooLong = 7717,
    /// The Marketplace's allowance not reserved by open pools is below the
    /// pool size (grant the allowance first)
    AllowanceNotReserved = 7718,
    /// No such pool
    PoolNotFound = 7719,
    /// The pool is closed or past its expiry
    PoolClosed = 7720,
    /// The buyer reached the pool's `max_per_buyer`
    BuyerLimitReached = 7721,
    /// The pool sold `max_sold_per_period` this period
    PoolRateLimited = 7722,
    /// The token is not in that pool stock page (sold, or another page)
    NotInPool = 7723,
    /// `MAX_OPEN_POOLS` pools are open (close and sweep one first)
    TooManyPools = 7724,
    /// `sweep_pool` on a pool that is still open
    PoolOpen = 7725,
    /// A pool size, buyer cap, sales rate or period of zero
    InvalidPool = 7726,
    /// The pool has stocked its whole size
    PoolFullyStocked = 7727,
}
