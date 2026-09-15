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
    /// Invalid configuration parameters (e.g., duration < 5 minutes, zero increment)
    InvalidConfig = 1208,
    /// Token minting failed
    MintFailed = 1209,
    /// Token or payment transfer failed
    TransferFailed = 1210,
    /// Payment token not configured for SAC bids
    NoPaymentTokenSet = 1211,
    /// Auction not launched yet
    NotLaunched = 1212,
    /// Cannot create new auction
    CannotCreateAuction = 1213,
    /// Unauthorized access
    Unauthorized = 1214,
    /// Arithmetic overflow in calculations
    ArithmeticOverflow = 1215,
    /// Invalid bid amount (too low or unreasonable)
    InvalidBid = 1216,
    /// Inconsistent payment type between bids
    InconsistentPaymentType = 1217,
    /// Maximum auction extensions exceeded
    MaxExtensionsExceeded = 1218,
    /// Contract not initialized properly
    NotInitialized = 1219,
    /// Token ID exceeds valid range
    TokenIdOverflow = 1220,
    /// External contract call failed
    ExternalCallFailed = 1221,
}
