#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracttrait, panic_with_error, Address, BytesN, Env, IntoVal, String,
    Symbol,
};
use stellar_access::ownable::{self, Ownable};
use stellar_contract_utils::pausable::{self, Pausable};
use stellar_macros::{only_owner, when_not_paused, when_paused};

use crate::{
    error::AuctionError,
    events::{
        emit_auction_cancelled, emit_auction_initialized, emit_duration_updated, emit_launched,
        emit_min_bid_increment_updated, emit_payment_token_updated, emit_refund_withdrawn,
        emit_reserve_price_updated, emit_time_buffer_updated,
    },
    helpers::{create_auction, process_bid, refund_bid, settle_auction_internal},
    storage::{
        clear_pending_refund, get_auction, get_config, get_pending_refund, is_launched,
        is_payment_token_locked, set_auction, set_config, set_launched, set_payment_token_locked,
        AuctionConfig, AuctionState, DataKey, MAX_BID_INCREMENT_PERCENT, MIN_AUCTION_DURATION,
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
        payment_token: Address,
        manager: Address,
        current_hash: BytesN<32>,
        version: String,
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

    /// Pull a refund whose push failed (bidder auth required). Panics
    /// `NoPendingRefund` if the balance is zero.
    fn withdraw_refund(e: &Env, bidder: Address);

    /// Refund credited to `bidder` and not yet withdrawn.
    fn pending_refund(e: &Env, bidder: Address) -> i128;

    // Configuration setters (owner only, when paused)
    fn set_duration(e: &Env, duration: u64);
    fn set_reserve_price(e: &Env, reserve_price: i128);
    fn set_min_bid_increment(e: &Env, min_bid_increment_percent: u32);
    fn set_time_buffer(e: &Env, time_buffer: u64);
    fn set_payment_token(e: &Env, payment_token: Address);
    fn launch(e: &Env, treasury: Address, start: bool, expected_payment_token: Address);
    fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>);
    fn version(e: &Env) -> String;
    fn wasm_hash(e: &Env) -> BytesN<32>;
    fn sync_version(e: &Env);
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
        // Nothing holds mint authority before launch, so unpausing would fail at mint.
        common::lifecycle::require_live(e);
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
    /// One-shot, Manager-only launch handoff (Setup -> Live).
    ///
    /// Marks the module live first, then hands ownership to `treasury` (clearing
    /// any pending two-step transfer) and, when `start` is true, unpauses and
    /// creates the first auction (the token must already be live so the auction
    /// holds mint authority). Panics `PaymentTokenMismatch` if the configured
    /// payment token differs from `expected_payment_token`. A second call panics with `AlreadyLive`.
    fn launch(e: &Env, treasury: Address, start: bool, expected_payment_token: Address) {
        let manager: Address = e
            .storage()
            .instance()
            .get(&DataKey::Manager)
            .unwrap_or_else(|| {
                soroban_sdk::panic_with_error!(e, common::CommonError::ManagerNotSet)
            });
        manager.require_auth();
        common::lifecycle::mark_live(e);
        if treasury != get_config(e).treasury {
            panic_with_error!(e, AuctionError::TreasuryMismatch);
        }
        // The payment token is a tunable setup param; the Manager records the one
        // chosen at create_dao and launch refuses if the launch_admin changed it.
        if expected_payment_token != get_config(e).payment_token {
            panic_with_error!(e, AuctionError::PaymentTokenMismatch);
        }
        common::ownership::handoff_owner(e, &treasury);
        if start {
            pausable::unpause(e);
            if !is_launched(e) {
                set_launched(e, true);
                create_auction(e);
            }
        }
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury, start);
    }

    fn __constructor(
        e: &Env,
        owner: Address,
        token_contract: Address,
        treasury: Address,
        duration: u64,
        reserve_price: i128,
        min_bid_increment_percent: u32,
        time_buffer: u64,
        payment_token: Address,
        manager: Address,
        current_hash: BytesN<32>,
        version: String,
    ) {
        // Validate config
        if duration < MIN_AUCTION_DURATION || min_bid_increment_percent == 0 {
            panic_with_error!(e, AuctionError::InvalidConfig);
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
        e.storage().instance().set(&DataKey::Manager, &manager);
        common::upgrade::init(e, &current_hash, &version);

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
            &version,
        );
    }

    fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        let owner =
            common::error::require(e, ownable::get_owner(e), common::CommonError::OwnerNotSet);
        owner.require_auth();
        let manager: Address = e
            .storage()
            .instance()
            .get(&DataKey::Manager)
            .unwrap_or_else(|| {
                soroban_sdk::panic_with_error!(e, common::CommonError::ManagerNotSet)
            });
        common::upgrade::apply(e, &manager, &from_hash, &to_hash);
    }

    fn version(e: &Env) -> String {
        common::upgrade::version(e)
    }

    fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    fn sync_version(e: &Env) {
        let owner =
            common::error::require(e, ownable::get_owner(e), common::CommonError::OwnerNotSet);
        owner.require_auth();
        let manager: Address = e
            .storage()
            .instance()
            .get(&DataKey::Manager)
            .unwrap_or_else(|| {
                soroban_sdk::panic_with_error!(e, common::CommonError::ManagerNotSet)
            });
        common::upgrade::sync_version(e, &manager);
    }

    #[when_not_paused]
    fn create_bid(e: &Env, bidder: Address, token_id: u128, amount: i128) {
        bidder.require_auth();

        let mut auction = get_auction(e);
        let config = get_config(e);

        // Validate token ID
        if auction.token_id != token_id {
            panic_with_error!(e, AuctionError::InvalidTokenId);
        }

        // Check auction not ended
        let now = e.ledger().timestamp();
        if now >= auction.end_time {
            panic_with_error!(e, AuctionError::AuctionOver);
        }

        if amount <= 0 {
            panic_with_error!(e, AuctionError::InvalidBid);
        }

        // Validate all bid economics before making the external payment call.
        // This avoids relying on transaction rollback to protect the bidder.
        if auction.highest_bidder.is_none() {
            if amount < config.reserve_price {
                panic_with_error!(e, AuctionError::ReservePriceNotMet);
            }
        } else {
            let increment = auction
                .highest_bid
                .checked_mul(config.min_bid_increment_percent as i128)
                .and_then(|value| value.checked_div(100))
                .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));
            let min_bid = auction
                .highest_bid
                .checked_add(increment)
                .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));
            if amount < min_bid {
                panic_with_error!(e, AuctionError::MinBidNotMet);
            }
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

        if !is_payment_token_locked(e) {
            set_payment_token_locked(e);
        }

        e.invoke_contract::<()>(&config.payment_token, &transfer_symbol, transfer_args);

        process_bid(e, &mut auction, &config, &bidder, amount);
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
        let config = get_config(e);

        // Cannot cancel already settled auction
        if auction.settled {
            panic_with_error!(e, AuctionError::AuctionSettled);
        }

        // Refund highest bidder if there is one
        if let Some(bidder) = &auction.highest_bidder {
            if auction.highest_bid > 0 {
                refund_bid(
                    e,
                    auction.token_id,
                    bidder,
                    auction.highest_bid,
                    &config.payment_token,
                );
            }
        }

        let owner = ownable::get_owner(e).unwrap();

        // Mark as settled to prevent further bids
        let mut cancelled_auction = auction.clone();
        cancelled_auction.settled = true;
        set_auction(e, &cancelled_auction);

        emit_auction_cancelled(e, auction.token_id, 0, &owner); // reason: 0 = owner cancelled
    }

    fn withdraw_refund(e: &Env, bidder: Address) {
        bidder.require_auth();

        let amount = get_pending_refund(e, &bidder);
        if amount <= 0 {
            panic_with_error!(e, AuctionError::NoPendingRefund);
        }

        // Effects before interaction; a failing transfer reverts this too.
        clear_pending_refund(e, &bidder);

        let config = get_config(e);
        let transfer_symbol = Symbol::new(e, "transfer");
        let args = soroban_sdk::vec![
            e,
            e.current_contract_address().to_val(),
            bidder.to_val(),
            amount.into_val(e)
        ];
        e.authorize_as_current_contract(soroban_sdk::vec![
            e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: config.payment_token.clone(),
                    fn_name: transfer_symbol.clone(),
                    args: args.clone(),
                },
                sub_invocations: soroban_sdk::vec![e],
            }),
        ]);
        e.invoke_contract::<()>(&config.payment_token, &transfer_symbol, args);

        emit_refund_withdrawn(e, &bidder, amount);
    }

    fn pending_refund(e: &Env, bidder: Address) -> i128 {
        get_pending_refund(e, &bidder)
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
    fn set_payment_token(e: &Env, payment_token: Address) {
        if is_payment_token_locked(e) {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        let owner = ownable::get_owner(e).unwrap();

        let mut config = get_config(e);
        config.payment_token = payment_token.clone();
        set_config(e, &config);

        emit_payment_token_updated(e, &payment_token, &owner);
    }
}
