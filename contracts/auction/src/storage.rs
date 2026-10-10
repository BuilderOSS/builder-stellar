//! Storage keys, data structures, and constants for the Auction contract.
//!
//! This module defines the auction state machine, configuration parameters,
//! and TTL management for the continuous auction system.

use soroban_sdk::{contracttype, panic_with_error, Address, Env};

use crate::error::AuctionError;

/// Storage-layout version of this code (see `common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;

/// Maximum number of time extensions allowed per auction.
///
/// Prevents DoS attacks where a malicious bidder repeatedly bids at the last
/// moment to indefinitely extend the auction. Set to 10 as a reasonable balance
/// between allowing legitimate last-minute competition and preventing abuse.
pub const MAX_AUCTION_EXTENSIONS: u32 = 10;

// Validation constants

/// Minimum reserve price (smallest units of the payment asset). Prevents
/// dust auctions.
pub const MIN_RESERVE_PRICE: i128 = common::MIN_RESERVE_PRICE;

/// Maximum bid increment percentage (100 = 100%).
///
/// Prevents unreasonable increment requirements that would make bidding
/// impossible. A 100% increment (doubling the bid) is the maximum allowed.
pub const MAX_BID_INCREMENT_PERCENT: u32 = 100;
/// Upper bound for `set_time_buffer` (one day, in seconds). The lower bound is 1.
pub const MAX_TIME_BUFFER: u64 = common::MAX_AUCTION_TIME_BUFFER;

/// Denominator for percentage calculations.
///
/// Used to convert bid increment percentages to actual amounts:
/// `increment_amount = current_bid * min_bid_increment_percent / PERCENT_DENOMINATOR`
pub const PERCENT_DENOMINATOR: i128 = 100;

/// Minimum auction duration (5 minutes in seconds).
pub const MIN_AUCTION_DURATION: u64 = common::MIN_AUCTION_DURATION;

/// Maximum auction duration (30 days in seconds).
pub const MAX_AUCTION_DURATION: u64 = common::MAX_AUCTION_DURATION;

/// Storage keys for auction instance data.
#[derive(Clone, Debug)]
#[contracttype]
pub enum DataKey {
    /// Auction configuration parameters (duration, reserve price, etc.)
    Config,
    /// Current auction state (token ID, bids, timing, etc.). Absent until the
    /// first auction is created, which is how `has_auction` is derived.
    Auction,
    Manager,
    /// Set by the first bid; the payment token can no longer change.
    PaymentTokenLocked,
    /// Persistent: refund owed to a bidder whose push refund failed (i128).
    PendingRefund(Address),
}

/// Auction configuration parameters.
///
/// These settings control the behavior of all auctions. The admin can modify
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
    /// SAC token address for payments.
    ///
    /// All auctions use this SAC token for bids and payments.
    /// Native XLM payments are not supported.
    pub payment_token: Address,
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
    /// The token is minted to the auction contract when the auction is created
    /// and transferred to the winner (or the Treasury, if nobody bid) on
    /// settlement. Ids follow the token's sequence, so they need not be
    /// consecutive across auctions.
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
    /// Number of time extensions applied to this auction.
    ///
    /// Increments when bids extend the end time. Capped at [`MAX_AUCTION_EXTENSIONS`]
    /// to prevent DoS attacks.
    pub extension_count: u32,
}

// Storage helpers. Instance TTL follows `common::ttl` and is extended on
// every state-changing entry point.
pub fn get_config(e: &Env) -> AuctionConfig {
    e.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| panic_with_error!(e, AuctionError::NotInitialized))
}

pub fn is_payment_token_locked(e: &Env) -> bool {
    e.storage()
        .instance()
        .get(&DataKey::PaymentTokenLocked)
        .unwrap_or(false)
}

pub fn set_payment_token_locked(e: &Env) {
    e.storage()
        .instance()
        .set(&DataKey::PaymentTokenLocked, &true);
}

pub fn set_config(e: &Env, config: &AuctionConfig) {
    e.storage().instance().set(&DataKey::Config, config);
}

/// The current auction. Panics `NotLaunched` before the first auction exists.
pub fn get_auction(e: &Env) -> AuctionState {
    e.storage()
        .instance()
        .get(&DataKey::Auction)
        .unwrap_or_else(|| panic_with_error!(e, AuctionError::NotLaunched))
}

pub fn set_auction(e: &Env, auction: &AuctionState) {
    e.storage().instance().set(&DataKey::Auction, auction);
}

/// Whether the first auction has been created.
pub fn has_auction(e: &Env) -> bool {
    e.storage().instance().has(&DataKey::Auction)
}

// `PendingRefund` entries use the shared long-lived persistent policy.

pub fn get_pending_refund(e: &Env, bidder: &Address) -> i128 {
    let key = DataKey::PendingRefund(bidder.clone());
    let v: Option<i128> = e.storage().persistent().get(&key);
    if v.is_some() {
        common::ttl::extend_persistent(e, &key);
    }
    v.unwrap_or(0)
}

/// Add `amount` to the bidder's pending refund and return the new total.
pub fn add_pending_refund(e: &Env, bidder: &Address, amount: i128) -> i128 {
    let key = DataKey::PendingRefund(bidder.clone());
    let total = get_pending_refund(e, bidder)
        .checked_add(amount)
        .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));
    e.storage().persistent().set(&key, &total);
    common::ttl::extend_persistent(e, &key);
    total
}

pub fn clear_pending_refund(e: &Env, bidder: &Address) {
    e.storage()
        .persistent()
        .remove(&DataKey::PendingRefund(bidder.clone()));
}
