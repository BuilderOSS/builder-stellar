use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AuctionError {
    /// Bid placed for incorrect token ID
    InvalidTokenId = 1201,
    /// Bid placed after auction ended
    AuctionOver = 1202,
    /// Auction hasn't started yet
    AuctionNotStarted = 1203,
    /// Attempting to settle an active auction
    AuctionActive = 1204,
    /// Auction already settled
    AuctionSettled = 1205,
    /// First bid doesn't meet reserve price
    ReservePriceNotMet = 1206,
    /// Bid doesn't meet minimum increment
    MinBidNotMet = 1207,
    /// Invalid configuration parameters (e.g., duration outside 5 minutes ..= 30 days, zero increment)
    InvalidConfig = 1208,
    /// Auction not launched yet
    NotLaunched = 1212,
    /// Unauthorized access
    Unauthorized = 1214,
    /// Arithmetic overflow in calculations
    ArithmeticOverflow = 1215,
    /// Invalid bid amount (too low or unreasonable)
    InvalidBid = 1216,
    /// Contract not initialized properly
    NotInitialized = 1219,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 1222,
    /// `launch` expected payment token differs from the configured one
    PaymentTokenMismatch = 1223,
    /// `withdraw_refund` called with no pending refund balance
    NoPendingRefund = 1224,
    /// `set_time_buffer` value outside 1..=86400 seconds
    InvalidTimeBuffer = 1225,
}
