use soroban_sdk::{
    contract, contractimpl, contracttrait, panic_with_error, Address, Env, IntoVal, Symbol,
};
use stellar_access::ownable::{self, Ownable};
use stellar_contract_utils::pausable::{self, Pausable};
use stellar_macros::{only_owner, when_not_paused, when_paused};

use crate::{
    error::AuctionError,
    events::{
        emit_auction_cancelled, emit_auction_initialized, emit_duration_updated,
        emit_min_bid_increment_updated, emit_payment_token_updated, emit_reserve_price_updated,
        emit_time_buffer_updated, emit_treasury_updated,
    },
    helpers::{create_auction, process_bid, refund_bid, settle_auction_internal},
    storage::{
        get_auction, get_config, is_launched, set_auction, set_config, set_launched, AuctionConfig,
        AuctionState, PaymentType, MAX_BID_INCREMENT_PERCENT, MIN_AUCTION_DURATION,
        MIN_RESERVE_PRICE,
    },
};

#[contract]
pub struct DaoAuctionContract;

#[contracttrait]
pub trait DaoAuctionContractTrait {
    /// Initialize the auction contract
    fn __constructor(
        e: &Env,
        owner: Address,
        token_contract: Address,
        treasury: Address,
        duration: u64,
        reserve_price: i128,
        min_bid_increment_percent: u32,
        time_buffer: u64,
        payment_token: Option<Address>,
    );

    /// Create a bid with SAC token
    fn create_bid(e: &Env, bidder: Address, token_id: u128, amount: i128);

    /// Settle current auction and create new one
    fn settle_and_create_new(e: &Env);

    /// Settle the current auction (when paused)
    fn settle_auction(e: &Env);

    /// Get current auction state
    fn get_auction(e: &Env) -> AuctionState;

    /// Get auction configuration
    fn get_config(e: &Env) -> AuctionConfig;

    /// Cancel current auction (owner only, when paused)
    fn cancel_auction(e: &Env);

    // Configuration setters (owner only, when paused)
    fn set_duration(e: &Env, duration: u64);
    fn set_reserve_price(e: &Env, reserve_price: i128);
    fn set_min_bid_increment(e: &Env, min_bid_increment_percent: u32);
    fn set_time_buffer(e: &Env, time_buffer: u64);
    fn set_payment_token(e: &Env, payment_token: Option<Address>);
    fn set_treasury(e: &Env, treasury: Address);
}

#[contractimpl(contracttrait)]
impl Pausable for DaoAuctionContract {
    fn pause(e: &Env, caller: Address) {
        caller.require_auth();
        let owner = ownable::get_owner(e).unwrap();
        if caller != owner {
            panic_with_error!(e, AuctionError::Unauthorized);
        }
        pausable::pause(e);
    }

    fn unpause(e: &Env, caller: Address) {
        caller.require_auth();
        let owner = ownable::get_owner(e).unwrap();
        if caller != owner {
            panic_with_error!(e, AuctionError::Unauthorized);
        }
        pausable::unpause(e);

        // If first auction, launch
        if !is_launched(e) {
            set_launched(e, true);

            // Create first auction
            create_auction(e);
        } else {
            // If resuming and previous auction was settled, create new one
            let auction = get_auction(e);
            if auction.settled {
                create_auction(e);
            }
        }
    }
}

#[contractimpl(contracttrait)]
impl Ownable for DaoAuctionContract {}

#[contractimpl]
impl DaoAuctionContractTrait for DaoAuctionContract {
    fn __constructor(
        e: &Env,
        owner: Address,
        token_contract: Address,
        treasury: Address,
        duration: u64,
        reserve_price: i128,
        min_bid_increment_percent: u32,
        time_buffer: u64,
        payment_token: Option<Address>,
    ) {
        // Validate config
        if duration < MIN_AUCTION_DURATION || min_bid_increment_percent == 0 {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        // SECURITY: Enforce payment token is set (SAC-only, no native XLM)
        // This prevents incomplete native payment code paths from being reached
        if payment_token.is_none() {
            panic_with_error!(e, AuctionError::NoPaymentTokenSet);
        }

        // SECURITY: Validate reserve price is reasonable (prevent 1-stroop auctions)
        if reserve_price < MIN_RESERVE_PRICE {
            panic_with_error!(e, AuctionError::InvalidBid);
        }

        // Validate min increment is reasonable (1-100%)
        if min_bid_increment_percent > MAX_BID_INCREMENT_PERCENT {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        // Set owner
        ownable::set_owner(e, &owner);

        // Start paused
        pausable::pause(e);

        // Store config
        let config = AuctionConfig {
            token_contract: token_contract.clone(),
            treasury: treasury.clone(),
            duration,
            reserve_price,
            min_bid_increment_percent,
            time_buffer,
            payment_token: payment_token.clone(),
        };
        set_config(e, &config);

        // Not launched yet
        set_launched(e, false);

        emit_auction_initialized(
            e,
            &owner,
            &token_contract,
            &treasury,
            duration,
            reserve_price,
            min_bid_increment_percent,
            time_buffer,
            &payment_token,
        );
    }

    #[when_not_paused]
    fn create_bid(e: &Env, bidder: Address, token_id: u128, amount: i128) {
        bidder.require_auth();

        let mut auction = get_auction(e);
        let config = get_config(e);

        // Ensure payment token is configured
        let payment_token = config
            .payment_token
            .as_ref()
            .ok_or(AuctionError::NoPaymentTokenSet)
            .unwrap();

        // Validate token ID
        if auction.token_id != token_id {
            panic_with_error!(e, AuctionError::InvalidTokenId);
        }

        // Check auction not ended
        let now = e.ledger().timestamp();
        if now >= auction.end_time {
            panic_with_error!(e, AuctionError::AuctionOver);
        }

        // Transfer payment tokens from bidder to contract
        // Bidder authorizes this via bidder.require_auth() at function entry
        let transfer_symbol = Symbol::new(e, "transfer");
        let transfer_args = soroban_sdk::vec![
            e,
            bidder.to_val(),
            e.current_contract_address().to_val(),
            amount.into_val(e)
        ];

        e.invoke_contract::<()>(payment_token, &transfer_symbol, transfer_args);

        process_bid(
            e,
            &mut auction,
            &config,
            &bidder,
            amount,
            &PaymentType::SAC(payment_token.clone()),
        );
    }

    /// DESIGN NOTE: settle_and_create_new is intentionally permissionless.
    /// Anyone can call this after an auction ends to settle it and create the next one.
    /// This is a deliberate design choice to ensure auctions continue automatically.
    /// The only griefing vector is settling at exact end time, which is minimal impact.
    #[when_not_paused]
    fn settle_and_create_new(e: &Env) {
        let auction = get_auction(e);

        // Ensure auction has ended
        let now = e.ledger().timestamp();
        if now < auction.end_time {
            panic_with_error!(e, AuctionError::AuctionActive);
        }

        settle_auction_internal(e);
        create_auction(e);
    }

    #[when_paused]
    fn settle_auction(e: &Env) {
        settle_auction_internal(e);
    }

    fn get_auction(e: &Env) -> AuctionState {
        get_auction(e)
    }

    fn get_config(e: &Env) -> AuctionConfig {
        get_config(e)
    }

    /// Cancel the current auction and refund the highest bidder (owner only, when paused)
    /// This allows the owner to cancel an auction in emergency situations
    #[only_owner]
    #[when_paused]
    fn cancel_auction(e: &Env) {
        let auction = get_auction(e);

        // Cannot cancel already settled auction
        if auction.settled {
            panic_with_error!(e, AuctionError::AuctionSettled);
        }

        // Refund highest bidder if there is one
        if let Some(bidder) = &auction.highest_bidder {
            if auction.highest_bid > 0 {
                refund_bid(e, bidder, auction.highest_bid, &auction.payment_currency);
            }
        }

        let owner = ownable::get_owner(e).unwrap();

        // Mark as settled to prevent further bids
        let mut cancelled_auction = auction.clone();
        cancelled_auction.settled = true;
        set_auction(e, &cancelled_auction);

        emit_auction_cancelled(e, auction.token_id, 0, &owner); // reason: 0 = owner cancelled
    }

    #[only_owner]
    #[when_paused]
    fn set_duration(e: &Env, duration: u64) {
        if duration < MIN_AUCTION_DURATION {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        let owner = ownable::get_owner(e).unwrap();

        let mut config = get_config(e);
        config.duration = duration;
        set_config(e, &config);

        emit_duration_updated(e, duration, &owner);
    }

    #[only_owner]
    #[when_paused]
    fn set_reserve_price(e: &Env, reserve_price: i128) {
        // SECURITY: Validate reserve price is reasonable
        if reserve_price < MIN_RESERVE_PRICE {
            panic_with_error!(e, AuctionError::InvalidBid);
        }

        let owner = ownable::get_owner(e).unwrap();

        let mut config = get_config(e);
        config.reserve_price = reserve_price;
        set_config(e, &config);

        emit_reserve_price_updated(e, reserve_price, &owner);
    }

    #[only_owner]
    #[when_paused]
    fn set_min_bid_increment(e: &Env, min_bid_increment_percent: u32) {
        if min_bid_increment_percent == 0 || min_bid_increment_percent > MAX_BID_INCREMENT_PERCENT {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        let owner = ownable::get_owner(e).unwrap();

        let mut config = get_config(e);
        config.min_bid_increment_percent = min_bid_increment_percent;
        set_config(e, &config);

        emit_min_bid_increment_updated(e, min_bid_increment_percent, &owner);
    }

    #[only_owner]
    #[when_paused]
    fn set_time_buffer(e: &Env, time_buffer: u64) {
        let owner = ownable::get_owner(e).unwrap();

        let mut config = get_config(e);
        config.time_buffer = time_buffer;
        set_config(e, &config);

        emit_time_buffer_updated(e, time_buffer, &owner);
    }

    #[only_owner]
    #[when_paused]
    fn set_payment_token(e: &Env, payment_token: Option<Address>) {
        // SECURITY: Require payment token to be set (matching constructor behavior)
        // This prevents configuration errors that would break bidding functionality
        if payment_token.is_none() {
            panic_with_error!(e, AuctionError::NoPaymentTokenSet);
        }

        let owner = ownable::get_owner(e).unwrap();

        let mut config = get_config(e);
        config.payment_token = payment_token.clone();
        set_config(e, &config);

        emit_payment_token_updated(e, &payment_token, &owner);
    }

    #[only_owner]
    #[when_paused]
    fn set_treasury(e: &Env, treasury: Address) {
        let owner = ownable::get_owner(e).unwrap();

        let mut config = get_config(e);
        config.treasury = treasury.clone();
        set_config(e, &config);

        emit_treasury_updated(e, &treasury, &owner);
    }
}
