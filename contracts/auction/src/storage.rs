//! Storage keys, data structures, and constants for the Auction contract.
//!
//! This module defines the auction state machine, configuration parameters,
//! and TTL management for the continuous auction system.

use soroban_sdk::{contracttype, panic_with_error, Address, Env};

use crate::error::AuctionError;

// Storage TTL constants - extend for ~30 days (518,400 seconds)

/// Number of ledgers for TTL extension (30 days).
///
/// Auction data should persist through the entire auction lifecycle plus settlement
/// window. 30 days provides sufficient buffer for auctions with longer durations.
const LEDGERS_TO_LIVE: u32 = 518_400;

/// Maximum TTL for auction storage (30 days).
///
/// Sets the upper bound for TTL extension operations.
const MAX_TTL: u32 = 518_400;

/// Maximum number of time extensions allowed per auction.
///
/// Prevents DoS attacks where a malicious bidder repeatedly bids at the last
/// moment to indefinitely extend the auction. Set to 10 as a reasonable balance
/// between allowing legitimate last-minute competition and preventing abuse.
pub const MAX_AUCTION_EXTENSIONS: u32 = 10;

// Validation constants

/// Minimum reserve price in stroops (0.0001 XLM).
///
/// Prevents dust auctions and ensures meaningful bids. Set to 1000 stroops
/// (0.0001 XLM) as the minimum viable auction amount. This applies to both
/// native XLM and SAC token payments.
pub const MIN_RESERVE_PRICE: i128 = 1000;

/// Maximum bid increment percentage (100 = 100%).
///
/// Prevents unreasonable increment requirements that would make bidding
/// impossible. A 100% increment (doubling the bid) is the maximum allowed.
pub const MAX_BID_INCREMENT_PERCENT: u32 = 100;

/// Denominator for percentage calculations.
///
/// Used to convert bid increment percentages to actual amounts:
/// `increment_amount = current_bid * min_bid_increment_percent / PERCENT_DENOMINATOR`
pub const PERCENT_DENOMINATOR: i128 = 100;

/// Minimum auction duration (5 minutes in seconds).
///
/// Enforces a minimum duration for each auction to ensure sufficient time
/// for bidding activity. Set to 5 minutes for testing purposes. Production
/// deployments may want longer durations for more competitive bidding.
pub const MIN_AUCTION_DURATION: u64 = 300; // 5 minutes in seconds

/// Storage keys for auction instance data.
#[derive(Clone, Debug)]
#[contracttype]
pub enum DataKey {
    /// Auction configuration parameters (duration, reserve price, etc.)
    Config,
    /// Current auction state (token ID, bids, timing, etc.)
    Auction,
    /// Whether the first auction has been launched (prevents re-initialization)
    Launched,
}

/// Auction configuration parameters.
///
/// These settings control the behavior of all auctions. The owner can modify
/// them when the contract is paused, but changes only apply to future auctions,
/// not the currently active one.
#[derive(Clone, Debug)]
#[contracttype]
pub struct AuctionConfig {
    /// The governance token contract to mint NFTs from.
    ///
    /// Must have granted mint authority to this auction contract.
    pub token_contract: Address,
    /// The treasury address to receive auction proceeds.
    ///
    /// All winning bids are transferred to this address upon settlement.
    pub treasury: Address,
    /// Duration of each auction in seconds.
    ///
    /// Standard auction window before time extensions. For example, 86400 = 24 hours.
    pub duration: u64,
    /// Minimum first bid amount.
    ///
    /// Must be >= [`MIN_RESERVE_PRICE`]. Protects against dust auctions.
    pub reserve_price: i128,
    /// Minimum bid increment as percentage (e.g., 10 = 10%).
    ///
    /// Each new bid must be at least `current_bid + (current_bid * increment / 100)`.
    /// Must be <= [`MAX_BID_INCREMENT_PERCENT`].
    pub min_bid_increment_percent: u32,
    /// Time buffer in seconds.
    ///
    /// If a bid arrives within this window of the auction end, the end time extends
    /// by the buffer amount (up to [`MAX_AUCTION_EXTENSIONS`] times).
    pub time_buffer: u64,
    /// Configured SAC token address for payments.
    ///
    /// The constructor requires this value to be `Some`; native XLM payments are
    /// not supported. Payment type locks on the first bid of each auction.
    pub payment_token: Option<Address>,
}

/// Current state of an active auction.
///
/// Tracks all dynamic auction data including bids, timing, and payment type.
/// Updated on every bid and reset on settlement.
#[derive(Clone, Debug)]
#[contracttype]
pub struct AuctionState {
    /// The token ID being auctioned.
    ///
    /// Starts at 1 and increments with each auction. The token is minted to the
    /// winner upon settlement.
    pub token_id: u128,
    /// Current highest bid amount.
    ///
    /// Initialized to 0 (no bids). Must exceed reserve price on first bid.
    pub highest_bid: i128,
    /// Current highest bidder address.
    ///
    /// `None` if no bids yet. The winner receives the minted token upon settlement.
    pub highest_bidder: Option<Address>,
    /// Unix timestamp when auction started.
    ///
    /// Set when auction is created (launch or post-settlement).
    pub start_time: u64,
    /// Unix timestamp when auction ends.
    ///
    /// Can be extended if bids arrive within the time buffer (max 10 times).
    pub end_time: u64,
    /// Whether auction has been settled.
    ///
    /// `true` after `settle_auction()` or `settle_and_create_new()` completes.
    /// Prevents double-settlement.
    pub settled: bool,
    /// Payment type for this auction.
    ///
    /// Locked on the first bid. All subsequent bids must use the same currency.
    /// Resets to undetermined on next auction.
    pub payment_currency: PaymentType,
    /// Number of time extensions applied to this auction.
    ///
    /// Increments when bids extend the end time. Capped at [`MAX_AUCTION_EXTENSIONS`]
    /// to prevent DoS attacks.
    pub extension_count: u32,
}

/// Payment currency type for an auction.
///
/// The first bidder determines which payment type (XLM or SAC token) will be
/// used for the entire auction. All subsequent bids must use the same type.
#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum PaymentType {
    /// Native XLM (Stellar lumens) payment.
    Native,
    /// SAC (Stellar Asset Contract) token payment.
    ///
    /// The address identifies which specific SAC token contract.
    SAC(Address),
}

// Storage helpers with TTL management
pub fn get_config(e: &Env) -> AuctionConfig {
    // Extend TTL on read to prevent expiration
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
    e.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| panic_with_error!(e, AuctionError::NotInitialized))
}

pub fn set_config(e: &Env, config: &AuctionConfig) {
    e.storage().instance().set(&DataKey::Config, config);
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
}

pub fn get_auction(e: &Env) -> AuctionState {
    if !is_launched(e) {
        panic_with_error!(e, AuctionError::NotLaunched);
    }
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
    e.storage()
        .instance()
        .get(&DataKey::Auction)
        .unwrap_or_else(|| panic_with_error!(e, AuctionError::NotInitialized))
}

pub fn set_auction(e: &Env, auction: &AuctionState) {
    e.storage().instance().set(&DataKey::Auction, auction);
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
}

pub fn is_launched(e: &Env) -> bool {
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
    e.storage()
        .instance()
        .get(&DataKey::Launched)
        .unwrap_or(false)
}

pub fn set_launched(e: &Env, launched: bool) {
    e.storage().instance().set(&DataKey::Launched, &launched);
    e.storage().instance().extend_ttl(LEDGERS_TO_LIVE, MAX_TTL);
}
