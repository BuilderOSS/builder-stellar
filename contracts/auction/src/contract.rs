#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use common::clients::NftClient;
use soroban_sdk::token::TokenClient;
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracttrait, panic_with_error, Address, BytesN, Env, IntoVal, String,
    Symbol,
};
use stellar_contract_utils::pausable::{self, Pausable};
use stellar_macros::{when_not_paused, when_paused};

use crate::{
    error::AuctionError,
    events::{
        emit_auction_cancelled, emit_auction_initialized, emit_duration_updated, emit_launched,
        emit_min_bid_increment_updated, emit_payment_token_updated, emit_refund_withdrawn,
        emit_reserve_price_updated, emit_time_buffer_updated,
    },
    helpers::{
        create_auction, process_bid, refund_bid, settle_auction_internal, validate_bid_amount,
    },
    storage::{
        clear_pending_refund, get_auction, get_config, get_pending_refund, has_auction,
        is_payment_token_locked, set_auction, set_config, set_payment_token_locked, AuctionConfig,
        AuctionState, DataKey, MAX_AUCTION_DURATION, MAX_BID_INCREMENT_PERCENT, MAX_TIME_BUFFER,
        MIN_AUCTION_DURATION, MIN_RESERVE_PRICE, STORAGE_VERSION,
    },
};

#[contract]
pub struct DaoAuctionContract;

#[contracttrait]
pub trait DaoAuctionContractTrait {
    /// Initialize the auction contract
    fn __constructor(
        e: &Env,
        admin: Address,
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

    /// Settle an ended auction while paused (no new auction is created)
    fn settle_auction(e: &Env);

    /// Get current auction state
    fn get_auction(e: &Env) -> AuctionState;

    /// Get auction configuration
    fn get_config(e: &Env) -> AuctionConfig;

    /// Cancel the current auction (admin only, when paused)
    fn cancel_auction(e: &Env);

    /// Pull a refund whose push failed (bidder auth required). Panics
    /// `NoPendingRefund` if the balance is zero.
    fn withdraw_refund(e: &Env, bidder: Address);

    /// Refund credited to `bidder` and not yet withdrawn.
    fn pending_refund(e: &Env, bidder: Address) -> i128;

    // Configuration setters (admin only, when paused)
    fn set_duration(e: &Env, duration: u64);
    fn set_reserve_price(e: &Env, reserve_price: i128);
    fn set_min_bid_increment(e: &Env, min_bid_increment_percent: u32);
    fn set_time_buffer(e: &Env, time_buffer: u64);
    fn set_payment_token(e: &Env, payment_token: Address);
    fn launch(e: &Env, treasury: Address, start: bool, expected_payment_token: Address);
    fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>);
    /// Advance the storage layout after an upgrade (admin only).
    fn migrate(e: &Env);
    fn version(e: &Env) -> String;
    fn wasm_hash(e: &Env) -> BytesN<32>;
    /// Storage-layout version of the data held by this contract.
    fn storage_version(e: &Env) -> u32;
    fn sync_version(e: &Env);
    /// Module admin: the launch admin during setup, the Treasury once live.
    fn admin(e: &Env) -> Address;
}

#[contractimpl(contracttrait)]
impl Pausable for DaoAuctionContract {
    fn pause(e: &Env, caller: Address) {
        Self::require_caller_is_admin(e, &caller);
        common::ttl::extend_instance(e);
        pausable::pause(e);
    }

    fn unpause(e: &Env, caller: Address) {
        // Nothing holds mint authority before launch, so unpausing would fail at mint.
        common::lifecycle::require_live(e);
        Self::require_caller_is_admin(e, &caller);
        common::ttl::extend_instance(e);
        pausable::unpause(e);

        // Start the first auction, or a new one if the last was settled while paused.
        if !has_auction(e) || get_auction(e).settled {
            create_auction(e);
        }
    }
}

impl DaoAuctionContract {
    /// `caller` must be the admin and authorize the call.
    fn require_caller_is_admin(e: &Env, caller: &Address) {
        caller.require_auth();
        if *caller != common::admin::admin(e) {
            panic_with_error!(e, AuctionError::Unauthorized);
        }
    }

    fn manager(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage().instance().get(&DataKey::Manager),
            common::CommonError::ManagerNotSet,
        )
    }
}

#[contractimpl]
impl DaoAuctionContractTrait for DaoAuctionContract {
    /// One-shot, Manager-only launch handoff (Setup -> Live).
    ///
    /// Marks the module live first, then hands the admin to `treasury` and,
    /// when `start` is true, unpauses and creates the first auction (the token
    /// must already be live so the auction holds mint authority). Panics
    /// `PaymentTokenMismatch` if the configured payment token differs from
    /// `expected_payment_token`. A second call panics with `AlreadyLive`.
    fn launch(e: &Env, treasury: Address, start: bool, expected_payment_token: Address) {
        Self::manager(e).require_auth();
        common::lifecycle::mark_live(e);
        if treasury != get_config(e).treasury {
            panic_with_error!(e, AuctionError::TreasuryMismatch);
        }
        // The payment token is a tunable setup param; the Manager records the one
        // chosen at create_dao and launch refuses if the launch_admin changed it.
        if expected_payment_token != get_config(e).payment_token {
            panic_with_error!(e, AuctionError::PaymentTokenMismatch);
        }
        common::admin::handoff(e, &treasury);
        if start {
            pausable::unpause(e);
            if !has_auction(e) {
                create_auction(e);
            }
        }
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury, start);
    }

    fn __constructor(
        e: &Env,
        admin: Address,
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
        if !(MIN_AUCTION_DURATION..=MAX_AUCTION_DURATION).contains(&duration)
            || min_bid_increment_percent == 0
        {
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

        if time_buffer == 0 || time_buffer > MAX_TIME_BUFFER {
            panic_with_error!(e, AuctionError::InvalidTimeBuffer);
        }

        common::admin::init(e, &admin);

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
        common::upgrade::init(e, &current_hash, &version, STORAGE_VERSION);

        emit_auction_initialized(
            e,
            &admin,
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
        common::admin::require_admin(e);
        common::upgrade::apply(e, &Self::manager(e), &from_hash, &to_hash);
    }

    fn migrate(e: &Env) {
        common::admin::require_admin(e);
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }

    fn admin(e: &Env) -> Address {
        common::admin::admin(e)
    }

    fn version(e: &Env) -> String {
        common::upgrade::version(e)
    }

    fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    fn sync_version(e: &Env) {
        common::admin::require_admin(e);
        common::upgrade::sync_version(e, &Self::manager(e));
    }

    #[when_not_paused]
    fn create_bid(e: &Env, bidder: Address, token_id: u128, amount: i128) {
        bidder.require_auth();
        common::ttl::extend_instance(e);

        let mut auction = get_auction(e);
        let config = get_config(e);

        if auction.token_id != token_id {
            panic_with_error!(e, AuctionError::InvalidTokenId);
        }
        if e.ledger().timestamp() >= auction.end_time {
            panic_with_error!(e, AuctionError::AuctionOver);
        }
        // Validate the bid economics before any payment moves, rather than
        // relying on rollback to protect the bidder.
        validate_bid_amount(e, &auction, &config, amount);

        if !is_payment_token_locked(e) {
            set_payment_token_locked(e);
        }
        // Covered by the bidder's `require_auth` above.
        TokenClient::new(e, &config.payment_token).transfer(
            &bidder,
            e.current_contract_address(),
            &amount,
        );

        process_bid(e, &mut auction, &config, &bidder, amount);
    }

    /// DESIGN NOTE: settle_and_create_new is intentionally permissionless.
    /// Anyone can call this after an auction ends to settle it and create the next one.
    /// This is a deliberate design choice to ensure auctions continue automatically.
    /// The only griefing vector is settling at exact end time, which is minimal impact.
    #[when_not_paused]
    fn settle_and_create_new(e: &Env) {
        common::ttl::extend_instance(e);
        settle_auction_internal(e);
        create_auction(e);
    }

    /// Permissionless like `settle_and_create_new`, and likewise only after
    /// the auction has ended (`AuctionActive` otherwise).
    #[when_paused]
    fn settle_auction(e: &Env) {
        common::ttl::extend_instance(e);
        settle_auction_internal(e);
    }

    fn get_auction(e: &Env) -> AuctionState {
        get_auction(e)
    }

    fn get_config(e: &Env) -> AuctionConfig {
        get_config(e)
    }

    /// Cancel the current auction and refund the highest bidder (admin only,
    /// when paused). The emergency exit for a running auction.
    #[when_paused]
    fn cancel_auction(e: &Env) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
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

        // Mark as settled to prevent further bids (before the NFT transfer, CEI)
        let mut cancelled_auction = auction.clone();
        cancelled_auction.settled = true;
        set_auction(e, &cancelled_auction);

        // The minted-but-unsold NFT is held by this contract; hand it to the
        // Treasury so it is not stranded. The auth entry matches the exact call.
        let nft_args = soroban_sdk::vec![
            e,
            e.current_contract_address().to_val(),
            config.treasury.to_val(),
            (auction.token_id as u32).into_val(e)
        ];
        e.authorize_as_current_contract(soroban_sdk::vec![
            e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: config.token_contract.clone(),
                    fn_name: Symbol::new(e, "transfer"),
                    args: nft_args,
                },
                sub_invocations: soroban_sdk::vec![e],
            }),
        ]);
        NftClient::new(e, &config.token_contract).transfer(
            &e.current_contract_address(),
            &config.treasury,
            &(auction.token_id as u32),
        );

        emit_auction_cancelled(e, auction.token_id, 0, &admin); // reason: 0 = admin cancelled
    }

    fn withdraw_refund(e: &Env, bidder: Address) {
        bidder.require_auth();
        common::ttl::extend_instance(e);

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
        TokenClient::new(e, &config.payment_token).transfer(
            &e.current_contract_address(),
            &bidder,
            &amount,
        );

        emit_refund_withdrawn(e, &bidder, amount);
    }

    fn pending_refund(e: &Env, bidder: Address) -> i128 {
        get_pending_refund(e, &bidder)
    }

    #[when_paused]
    fn set_duration(e: &Env, duration: u64) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        if !(MIN_AUCTION_DURATION..=MAX_AUCTION_DURATION).contains(&duration) {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        let mut config = get_config(e);
        config.duration = duration;
        set_config(e, &config);

        emit_duration_updated(e, duration, &admin);
    }

    #[when_paused]
    fn set_reserve_price(e: &Env, reserve_price: i128) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        // SECURITY: Validate reserve price is reasonable
        if reserve_price < MIN_RESERVE_PRICE {
            panic_with_error!(e, AuctionError::InvalidBid);
        }

        let mut config = get_config(e);
        config.reserve_price = reserve_price;
        set_config(e, &config);

        emit_reserve_price_updated(e, reserve_price, &admin);
    }

    #[when_paused]
    fn set_min_bid_increment(e: &Env, min_bid_increment_percent: u32) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        if min_bid_increment_percent == 0 || min_bid_increment_percent > MAX_BID_INCREMENT_PERCENT {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        let mut config = get_config(e);
        config.min_bid_increment_percent = min_bid_increment_percent;
        set_config(e, &config);

        emit_min_bid_increment_updated(e, min_bid_increment_percent, &admin);
    }

    #[when_paused]
    fn set_time_buffer(e: &Env, time_buffer: u64) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        if time_buffer == 0 || time_buffer > MAX_TIME_BUFFER {
            panic_with_error!(e, AuctionError::InvalidTimeBuffer);
        }

        let mut config = get_config(e);
        config.time_buffer = time_buffer;
        set_config(e, &config);

        emit_time_buffer_updated(e, time_buffer, &admin);
    }

    #[when_paused]
    fn set_payment_token(e: &Env, payment_token: Address) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        if is_payment_token_locked(e) {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        let mut config = get_config(e);
        config.payment_token = payment_token.clone();
        set_config(e, &config);

        emit_payment_token_updated(e, &payment_token, &admin);
    }
}
