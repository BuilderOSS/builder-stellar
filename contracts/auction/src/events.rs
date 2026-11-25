#![allow(clippy::too_many_arguments)] // emit helpers mirror the event fields 1:1

//! Event definitions and emission helpers for the Auction contract.
//!
//! This module defines events for tracking the complete auction lifecycle including:
//! - Contract initialization and configuration changes
//! - Auction creation with new token IDs
//! - Bid placement and refunds
//! - Time extensions and settlement
//! - Auction cancellation
//!
//! Admin changes are `common::admin::AdminChanged`; pause state changes are
//! OpenZeppelin's `Paused` / `Unpaused`.

use soroban_sdk::{contractevent, Address, Env, String};

/// Emitted once by the constructor, with the starting configuration.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionInitialized {
    #[topic]
    pub admin: Address,
    pub token_contract: Address,
    pub treasury: Address,
    pub duration: u64,
    pub reserve_price: i128,
    pub min_bid_increment_percent: u32,
    pub time_buffer: u64,
    pub payment_token: Address,
}

/// A new auction opened for `token_id`, minted into the Auction's custody.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionCreated {
    #[topic]
    pub token_id: u128,
    pub start_time: u64,
    pub end_time: u64,
    pub reserve_price: i128,
    pub payment_token: Address,
}

/// A bid became the highest. `extended` is true when it moved the end time
/// to `new_end_time`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BidPlaced {
    #[topic]
    pub token_id: u128,
    #[topic]
    pub bidder: Address,
    pub amount: i128,
    pub extended: bool,
    pub new_end_time: u64,
    /// Optional bidder comment (empty if none). Event-only, never stored.
    pub comment: String,
}

/// An auction settled: the token went to `winner` and `amount` to the
/// Treasury, or the token went to the Treasury when `winner` is `None`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionSettled {
    #[topic]
    pub token_id: u128,
    pub winner: Option<Address>,
    pub amount: i128,
}

/// `set_duration`: later auctions last `duration` seconds.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DurationUpdated {
    pub duration: u64,
    pub changed_by: Address,
}

/// `set_reserve_price`: the smallest first bid of later auctions.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReservePriceUpdated {
    pub reserve_price: i128,
    pub changed_by: Address,
}

/// `set_min_bid_increment`: the percentage a new bid must add.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MinBidIncrementUpdated {
    pub min_bid_increment_percent: u32,
    pub changed_by: Address,
}

/// `set_time_buffer`: the window in which a bid extends the end time.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimeBufferUpdated {
    pub time_buffer: u64,
    pub changed_by: Address,
}

/// `set_payment_token`: bids are now paid in `payment_token`, a Stellar
/// Asset Contract.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentTokenUpdated {
    pub payment_token: Address,
    pub changed_by: Address,
}

/// Emitted once when the Manager launches the auction (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionLaunched {
    #[topic]
    pub treasury: Address,
    /// Whether the auction was unpaused and the first auction created.
    pub started: bool,
}

/// An outbid or cancelled bid was pushed back to `bidder`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BidRefunded {
    #[topic]
    pub token_id: u128,
    #[topic]
    pub bidder: Address,
    pub amount: i128,
}

/// Emitted when a push refund failed and was credited to `PendingRefund`.
/// `amount` is the amount added by this event, not the running total.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RefundDeferred {
    #[topic]
    pub token_id: u128,
    #[topic]
    pub bidder: Address,
    pub amount: i128,
}

/// Emitted when a bidder pulls their deferred refund via `withdraw_refund`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RefundWithdrawn {
    #[topic]
    pub bidder: Address,
    pub amount: i128,
}

/// `cancel_auction`: the admin ended a running auction. The token went to
/// the Treasury. `reason` is 0 (cancelled by the admin).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionCancelled {
    #[topic]
    pub token_id: u128,
    pub reason: u32,
    pub cancelled_by: Address,
}

// Event publishing helpers
pub fn emit_auction_initialized(
    e: &Env,
    admin: &Address,
    token_contract: &Address,
    treasury: &Address,
    duration: u64,
    reserve_price: i128,
    min_bid_increment_percent: u32,
    time_buffer: u64,
    payment_token: &Address,
) {
    AuctionInitialized {
        admin: admin.clone(),
        token_contract: token_contract.clone(),
        treasury: treasury.clone(),
        duration,
        reserve_price,
        min_bid_increment_percent,
        time_buffer,
        payment_token: payment_token.clone(),
    }
    .publish(e);
}

pub fn emit_auction_created(
    e: &Env,
    token_id: u128,
    start_time: u64,
    end_time: u64,
    reserve_price: i128,
    payment_token: &Address,
) {
    AuctionCreated {
        token_id,
        start_time,
        end_time,
        reserve_price,
        payment_token: payment_token.clone(),
    }
    .publish(e);
}

pub fn emit_bid_placed(
    e: &Env,
    token_id: u128,
    bidder: &Address,
    amount: i128,
    extended: bool,
    new_end_time: u64,
    comment: &String,
) {
    BidPlaced {
        token_id,
        bidder: bidder.clone(),
        amount,
        extended,
        new_end_time,
        comment: comment.clone(),
    }
    .publish(e);
}

pub fn emit_auction_settled(e: &Env, token_id: u128, winner: &Option<Address>, amount: i128) {
    AuctionSettled {
        token_id,
        winner: winner.clone(),
        amount,
    }
    .publish(e);
}

pub fn emit_duration_updated(e: &Env, duration: u64, changed_by: &Address) {
    DurationUpdated {
        duration,
        changed_by: changed_by.clone(),
    }
    .publish(e);
}

pub fn emit_reserve_price_updated(e: &Env, reserve_price: i128, changed_by: &Address) {
    ReservePriceUpdated {
        reserve_price,
        changed_by: changed_by.clone(),
    }
    .publish(e);
}

pub fn emit_min_bid_increment_updated(
    e: &Env,
    min_bid_increment_percent: u32,
    changed_by: &Address,
) {
    MinBidIncrementUpdated {
        min_bid_increment_percent,
        changed_by: changed_by.clone(),
    }
    .publish(e);
}

pub fn emit_time_buffer_updated(e: &Env, time_buffer: u64, changed_by: &Address) {
    TimeBufferUpdated {
        time_buffer,
        changed_by: changed_by.clone(),
    }
    .publish(e);
}

pub fn emit_payment_token_updated(e: &Env, payment_token: &Address, changed_by: &Address) {
    PaymentTokenUpdated {
        payment_token: payment_token.clone(),
        changed_by: changed_by.clone(),
    }
    .publish(e);
}

pub fn emit_launched(e: &Env, treasury: &Address, started: bool) {
    AuctionLaunched {
        treasury: treasury.clone(),
        started,
    }
    .publish(e);
}

pub fn emit_bid_refunded(e: &Env, token_id: u128, bidder: &Address, amount: i128) {
    BidRefunded {
        token_id,
        bidder: bidder.clone(),
        amount,
    }
    .publish(e);
}

pub fn emit_auction_cancelled(e: &Env, token_id: u128, reason: u32, cancelled_by: &Address) {
    AuctionCancelled {
        token_id,
        reason,
        cancelled_by: cancelled_by.clone(),
    }
    .publish(e);
}

pub fn emit_refund_deferred(e: &Env, token_id: u128, bidder: &Address, amount: i128) {
    RefundDeferred {
        token_id,
        bidder: bidder.clone(),
        amount,
    }
    .publish(e);
}

pub fn emit_refund_withdrawn(e: &Env, bidder: &Address, amount: i128) {
    RefundWithdrawn {
        bidder: bidder.clone(),
        amount,
    }
    .publish(e);
}
