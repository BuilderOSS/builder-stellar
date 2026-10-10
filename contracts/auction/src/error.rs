use soroban_sdk::contracterror;

/// Auction errors (block `common::error::codes::AUCTION`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AuctionError {
    /// Bid placed for a token id other than the one being auctioned
    InvalidTokenId = 7401,
    /// Bid placed at or after the auction end time
    AuctionOver = 7402,
    /// The auction has no start time
    AuctionNotStarted = 7403,
    /// Settlement attempted before the auction end time
    AuctionActive = 7404,
    /// The auction is already settled (or cancelled)
    AuctionSettled = 7405,
    /// First bid below the reserve price
    ReservePriceNotMet = 7406,
    /// Bid below the previous bid plus the minimum increment
    MinBidNotMet = 7407,
    /// Configuration out of bounds (duration outside 5 minutes ..= 30 days,
    /// increment outside 1..=100%, or payment token locked)
    InvalidConfig = 7408,
    /// No auction has been created yet
    NotLaunched = 7409,
    /// Caller is not the admin
    Unauthorized = 7410,
    /// Arithmetic overflow in bid or time calculations
    ArithmeticOverflow = 7411,
    /// Bid amount not positive, or reserve price below `common::MIN_RESERVE_PRICE`
    InvalidBid = 7412,
    /// Contract configuration missing
    NotInitialized = 7413,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 7414,
    /// `launch` expected payment token differs from the configured one
    PaymentTokenMismatch = 7415,
    /// `withdraw_refund` called with no pending refund balance
    NoPendingRefund = 7416,
    /// `time_buffer` outside 1..=86400 seconds
    InvalidTimeBuffer = 7417,
}
