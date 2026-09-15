//! Event definitions and emission helpers for the Auction contract.
//!
//! This module defines events for tracking the complete auction lifecycle including:
//! - Contract initialization and configuration changes
//! - Auction creation with new token IDs
//! - Bid placement and refunds
//! - Time extensions and settlement
//! - Auction cancellation

use soroban_sdk::{contractevent, Address, Env};

use crate::storage::PaymentType;

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionInitialized {
    #[topic]
    pub owner: Address,
    pub token_contract: Address,
    pub treasury: Address,
    pub duration: u64,
    pub reserve_price: i128,
    pub min_bid_increment_percent: u32,
    pub time_buffer: u64,
    pub payment_token: Option<Address>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionCreated {
    #[topic]
    pub token_id: u128,
    pub start_time: u64,
    pub end_time: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BidPlaced {
    #[topic]
    pub token_id: u128,
    #[topic]
    pub bidder: Address,
    pub amount: i128,
    pub payment_type: PaymentType,
    pub extended: bool,
    pub new_end_time: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionSettled {
    #[topic]
    pub token_id: u128,
    pub winner: Option<Address>,
    pub amount: i128,
    pub payment_type: PaymentType,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DurationUpdated {
    pub duration: u64,
    pub changed_by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReservePriceUpdated {
    pub reserve_price: i128,
    pub changed_by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MinBidIncrementUpdated {
    pub min_bid_increment_percent: u32,
    pub changed_by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimeBufferUpdated {
    pub time_buffer: u64,
    pub changed_by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentTokenUpdated {
    pub payment_token: Option<Address>,
    pub changed_by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryUpdated {
    pub treasury: Address,
    pub changed_by: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BidRefunded {
    #[topic]
    pub bidder: Address,
    pub amount: i128,
    pub payment_type: PaymentType,
}

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
    owner: &Address,
    token_contract: &Address,
    treasury: &Address,
    duration: u64,
    reserve_price: i128,
    min_bid_increment_percent: u32,
    time_buffer: u64,
    payment_token: &Option<Address>,
) {
    AuctionInitialized {
        owner: owner.clone(),
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

pub fn emit_auction_created(e: &Env, token_id: u128, start_time: u64, end_time: u64) {
    AuctionCreated {
        token_id,
        start_time,
        end_time,
    }
    .publish(e);
}

pub fn emit_bid_placed(
    e: &Env,
    token_id: u128,
    bidder: &Address,
    amount: i128,
    payment_type: &PaymentType,
    extended: bool,
    new_end_time: u64,
) {
    BidPlaced {
        token_id,
        bidder: bidder.clone(),
        amount,
        payment_type: payment_type.clone(),
        extended,
        new_end_time,
    }
    .publish(e);
}

pub fn emit_auction_settled(
    e: &Env,
    token_id: u128,
    winner: &Option<Address>,
    amount: i128,
    payment_type: &PaymentType,
) {
    AuctionSettled {
        token_id,
        winner: winner.clone(),
        amount,
        payment_type: payment_type.clone(),
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

pub fn emit_payment_token_updated(e: &Env, payment_token: &Option<Address>, changed_by: &Address) {
    PaymentTokenUpdated {
        payment_token: payment_token.clone(),
        changed_by: changed_by.clone(),
    }
    .publish(e);
}

pub fn emit_treasury_updated(e: &Env, treasury: &Address, changed_by: &Address) {
    TreasuryUpdated {
        treasury: treasury.clone(),
        changed_by: changed_by.clone(),
    }
    .publish(e);
}

pub fn emit_bid_refunded(e: &Env, bidder: &Address, amount: i128, payment_type: &PaymentType) {
    BidRefunded {
        bidder: bidder.clone(),
        amount,
        payment_type: payment_type.clone(),
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
