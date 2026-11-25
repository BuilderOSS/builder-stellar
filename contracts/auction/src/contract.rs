#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use common::clients::NftClient;
use common::modules::RenewalPage;
use soroban_sdk::token::TokenClient;
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracttrait, panic_with_error, vec, Address, BytesN, Env, IntoVal,
    String, Symbol, Vec,
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
        create_auction, process_bid, refund_bid, require_stellar_asset, settle_auction_internal,
        start_next_or_pause, validate_bid_amount,
    },
    storage::{
        clear_pending_refund, get_auction, get_config, get_pending_refund, has_auction,
        is_payment_token_locked, set_auction, set_config, set_payment_token_locked, AuctionConfig,
        AuctionState, DataKey, MAX_AUCTION_DURATION, MAX_BID_INCREMENT_PERCENT, MAX_TIME_BUFFER,
        MIN_AUCTION_DURATION, MIN_RESERVE_PRICE, STORAGE_VERSION,
    },
};

/// A DAO's continuous auction: one membership token at a time, minted into
/// this contract's custody and sold for the payment token, with the proceeds
/// going to the Treasury. See the crate documentation for the lifecycle.
#[contract]
pub struct DaoAuctionContract;

/// The Auction's public interface. Each function is documented where it is
/// implemented, which is also the text the generated bindings carry.
#[contracttrait]
pub trait DaoAuctionContractTrait {
    /// Deploy-time setup (the Manager, at `create_dao` or `create_module`).
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
    );

    /// Bid on the current auction (the bidder signs).
    fn create_bid(e: &Env, bidder: Address, token_id: u128, amount: i128, comment: String);

    /// Settle the ended auction and start the next one, or pause when the
    /// Auction may no longer mint (anyone, while unpaused).
    fn settle_and_create_new(e: &Env);

    /// Settle the ended auction without starting another (anyone, while
    /// paused).
    fn settle_auction(e: &Env);

    /// The current auction (read-only).
    fn get_auction(e: &Env) -> AuctionState;

    /// The auction configuration (read-only).
    fn get_config(e: &Env) -> AuctionConfig;

    /// Cancel the current auction and refund its leader (the admin, while
    /// paused).
    fn cancel_auction(e: &Env);

    /// Send a token this contract holds but is not auctioning to the
    /// Treasury (the admin, while paused).
    fn recover_token(e: &Env, token_id: u32);

    /// Pull a refund whose push failed (the bidder signs).
    fn withdraw_refund(e: &Env, bidder: Address);

    /// Refund credited to `bidder` and not yet withdrawn (read-only).
    fn pending_refund(e: &Env, bidder: Address) -> i128;

    /// Set the duration of later auctions (the admin, while paused).
    fn set_duration(e: &Env, duration: u64);
    /// Set the reserve price of later auctions (the admin, while paused).
    fn set_reserve_price(e: &Env, reserve_price: i128);
    /// Set the minimum bid increment (the admin, while paused).
    fn set_min_bid_increment(e: &Env, min_bid_increment_percent: u32);
    /// Set the anti-sniping time buffer (the admin, while paused).
    fn set_time_buffer(e: &Env, time_buffer: u64);
    /// Set the payment token before the first bid (the admin, while paused).
    fn set_payment_token(e: &Env, payment_token: Address);
    /// One-shot launch, Setup to Live (the Manager).
    fn launch(e: &Env, treasury: Address, start: bool);
    /// Hand the admin to the Treasury early and stay in Setup (the Manager).
    fn handoff(e: &Env, treasury: Address);
    /// The configured payment token (`DaoModule::payment_asset`).
    fn payment_asset(e: &Env) -> Address;
    /// DAO-owned keys for the renewal sweep (`DaoModule::renewal_keys`).
    fn renewal_keys(e: &Env, cursor: u32, limit: u32) -> RenewalPage;
    /// Replace this contract's code with a Manager-approved hash (the admin).
    fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>);
    /// Advance the storage layout after an upgrade (the admin).
    fn migrate(e: &Env);
    /// The release version of the running code (read-only).
    fn version(e: &Env) -> String;
    /// The running WASM hash (read-only).
    fn wasm_hash(e: &Env) -> BytesN<32>;
    /// Storage-layout version of the data held by this contract.
    fn storage_version(e: &Env) -> u32;
    /// Module admin: the launch admin during setup, the Treasury once live.
    fn admin(e: &Env) -> Address;
}

/// OpenZeppelin `Pausable`: `paused`, `pause`, and `unpause`. While paused,
/// bids and `settle_and_create_new` are refused; the setters,
/// `settle_auction`, `cancel_auction`, and `recover_token` need the pause.
#[contractimpl(contracttrait)]
impl Pausable for DaoAuctionContract {
    /// Pause bidding (`caller` must be the admin and sign; `Unauthorized`).
    /// A running auction keeps its leader and end time: it settles with
    /// `settle_auction` once it ends, or the admin cancels it.
    fn pause(e: &Env, caller: Address) {
        Self::require_caller_is_admin(e, &caller);
        common::ttl::extend_instance(e);
        pausable::pause(e);
    }

    /// Resume bidding (`caller` must be the admin and sign; Live only). If no
    /// auction is running, starts one, which needs the Auction's mint
    /// allowance: with none left the call fails at the mint and stays paused.
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
            e.storage().instance().get(&common::ns(e, DataKey::Manager)),
            common::CommonError::ManagerNotSet,
        )
    }
}

#[contractimpl]
impl DaoAuctionContractTrait for DaoAuctionContract {
    /// One-shot, Manager-only launch (Setup -> Live), `DaoModule::launch`.
    ///
    /// Marks the module live first, then hands the admin to `treasury`
    /// (unless `handoff` already did) and, when `start` is true, unpauses and
    /// creates the first auction (the token must already be live so the
    /// auction holds an allowance). The Manager checks the payment token
    /// against the one recorded at `create_dao` before calling. A second call
    /// panics with `AlreadyLive`.
    fn launch(e: &Env, treasury: Address, start: bool) {
        Self::manager(e).require_auth();
        common::lifecycle::mark_live(e);
        if treasury != get_config(e).treasury {
            panic_with_error!(e, AuctionError::TreasuryMismatch);
        }
        common::admin::handoff_once(e, &treasury);
        if start {
            pausable::unpause(e);
            if !has_auction(e) {
                create_auction(e);
            }
        }
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury, start);
    }

    /// Manager-only early handoff: the admin moves to `treasury` and the
    /// module stays in Setup, so its setters and upgrades are frozen until
    /// launch. Panics `AlreadyLive` once launched.
    fn handoff(e: &Env, treasury: Address) {
        Self::manager(e).require_auth();
        common::lifecycle::require_setup(e);
        if treasury != get_config(e).treasury {
            panic_with_error!(e, AuctionError::TreasuryMismatch);
        }
        common::admin::handoff_once(e, &treasury);
        common::ttl::extend_instance(e);
    }

    /// The configured payment token (`DaoModule::payment_asset`; read-only).
    /// The Manager compares it with the asset recorded at `create_dao`
    /// before launch.
    fn payment_asset(e: &Env) -> Address {
        get_config(e).payment_token
    }

    /// Every auction entry is instance storage; `PendingRefund(bidder)` is
    /// the bidder's own (holder class). So there are no keys, only the
    /// balances the Auction holds: the token it auctions and the bids.
    fn renewal_keys(e: &Env, _cursor: u32, _limit: u32) -> RenewalPage {
        let config = get_config(e);
        RenewalPage {
            keys: Vec::new(e),
            assets: vec![e, config.token_contract, config.payment_token],
            next_cursor: None,
        }
    }

    /// Deploy-time setup, run once by the Manager at `create_dao` or
    /// `create_module`. Starts paused and in Setup.
    ///
    /// * `admin` - the launch admin; becomes the Treasury at launch
    /// * `token_contract` - the DAO's membership token, which mints each
    ///   auctioned token against this contract's allowance
    /// * `treasury` - receives the proceeds and unsold tokens
    /// * `duration` - seconds per auction, 5 minutes to 30 days (`InvalidConfig`)
    /// * `reserve_price` - smallest first bid, at least `MIN_RESERVE_PRICE` (`InvalidBid`)
    /// * `min_bid_increment_percent` - 1 to 100 (`InvalidConfig`)
    /// * `time_buffer` - 1 second to 1 day (`InvalidTimeBuffer`)
    /// * `payment_token` - a Stellar Asset Contract (`NotStellarAsset`)
    /// * `manager`, `current_hash` - upgrade approvals and the running hash
    ///
    /// Emits `AuctionInitialized`.
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
        require_stellar_asset(e, &payment_token);

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
        e.storage()
            .instance()
            .set(&common::ns(e, DataKey::Manager), &manager);
        common::upgrade::init(e, &current_hash, STORAGE_VERSION);

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
        );
    }

    /// Replaces this contract's WASM with `to_hash` (admin only: the launch
    /// admin in Setup, the Treasury by proposal once live). `from_hash` must
    /// be the running hash, and the Manager must have approved the
    /// `from_hash` to `to_hash` step (`common::upgrade::apply`).
    fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        common::admin::require_admin(e);
        common::upgrade::apply(e, &Self::manager(e), &from_hash, &to_hash);
    }

    /// Advances the storage layout to this code's `STORAGE_VERSION` after an
    /// upgrade (admin only; `NothingToMigrate` when already current).
    fn migrate(e: &Env) {
        common::admin::require_admin(e);
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    /// Storage-layout version of the data held by this contract (read-only).
    fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }

    /// The module admin: the launch admin in Setup, the Treasury once live
    /// (read-only).
    fn admin(e: &Env) -> Address {
        common::admin::admin(e)
    }

    /// The release version registered in the Manager for the running WASM
    /// (read-only; `ImplementationNotFound` if the registry has none).
    fn version(e: &Env) -> String {
        common::upgrade::version(e, &Self::manager(e))
    }

    /// The running WASM hash (read-only).
    fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    /// Bid `amount` of the payment token on `token_id`, the token being
    /// auctioned (`bidder` signs; refused while paused). The bid must meet
    /// the reserve price (first bid) or the last bid plus the minimum
    /// increment, and arrive before the end time (`AuctionOver`). The amount
    /// moves into this contract, the previous leader is refunded (pushed, or
    /// credited to `PendingRefund` if the push fails), and a bid inside the
    /// time buffer extends the end time, at most `MAX_AUCTION_EXTENSIONS`
    /// times. `comment` is optional (empty for none), at most
    /// `MAX_COMMENT_LENGTH` bytes, and only emitted in `BidPlaced`. The first
    /// bid locks the payment token.
    #[when_not_paused]
    fn create_bid(e: &Env, bidder: Address, token_id: u128, amount: i128, comment: String) {
        bidder.require_auth();
        common::ttl::extend_instance(e);

        if comment.len() > common::MAX_COMMENT_LENGTH {
            panic_with_error!(e, AuctionError::CommentTooLong);
        }

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

        process_bid(e, &mut auction, &config, &bidder, amount, &comment);
    }

    /// Settle the ended auction and start the next one (anyone may call;
    /// refused while paused). Never before the end time (`AuctionActive`).
    /// The token goes to the winner and the bid to the Treasury, or the
    /// token to the Treasury when nobody bid.
    ///
    /// If the Token will not let the Auction mint the next token (its
    /// allowance is 0, because a proposal lowered it or the last mint of a
    /// finite allowance spent it), the settlement still completes and the
    /// Auction pauses itself instead of starting another auction (OpenZeppelin
    /// `Paused`). The admin's `unpause` resumes once an allowance is granted.
    #[when_not_paused]
    fn settle_and_create_new(e: &Env) {
        common::ttl::extend_instance(e);
        settle_auction_internal(e);
        start_next_or_pause(e);
    }

    /// Settle the ended auction without starting another (anyone may call;
    /// only while paused). Like `settle_and_create_new`, never before the
    /// end time (`AuctionActive`).
    #[when_paused]
    fn settle_auction(e: &Env) {
        common::ttl::extend_instance(e);
        settle_auction_internal(e);
    }

    /// The current or last auction (read-only; `NotLaunched` before the
    /// first one).
    fn get_auction(e: &Env) -> AuctionState {
        get_auction(e)
    }

    /// The auction configuration (read-only).
    fn get_config(e: &Env) -> AuctionConfig {
        get_config(e)
    }

    /// Cancel the current auction (the admin, while paused;
    /// `AuctionSettled` if it already ended that way). The emergency exit
    /// for a running auction: the leader's bid is refunded (pushed, or
    /// credited to `PendingRefund`), the token goes to the Treasury, and no
    /// new auction starts until `unpause`. Emits `AuctionCancelled`.
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

    /// Send `token_id`, a membership token this contract holds but is not
    /// auctioning, to the Treasury (the admin, while paused). For a token
    /// someone transferred here directly, which no auction records. The
    /// token of an auction that has not settled is refused
    /// (`TokenInAuction`): it belongs to the winner or, after
    /// `cancel_auction`, to the Treasury. The Token's `Transfer` records the
    /// move; no auction event is emitted.
    ///
    /// The Token refuses to unregister the Auction while it holds tokens,
    /// so without this anyone could keep it registered by sending it one.
    #[when_paused]
    fn recover_token(e: &Env, token_id: u32) {
        common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        // The running auction's token is owed to its winner or, when
        // cancelled, to the Treasury through `cancel_auction`.
        if has_auction(e) {
            let auction = get_auction(e);
            if !auction.settled && auction.token_id == u128::from(token_id) {
                panic_with_error!(e, AuctionError::TokenInAuction);
            }
        }
        let config = get_config(e);
        let this = e.current_contract_address();
        e.authorize_as_current_contract(soroban_sdk::vec![
            e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: config.token_contract.clone(),
                    fn_name: Symbol::new(e, "transfer"),
                    args: soroban_sdk::vec![
                        e,
                        this.to_val(),
                        config.treasury.to_val(),
                        token_id.into_val(e)
                    ],
                },
                sub_invocations: soroban_sdk::vec![e],
            }),
        ]);
        NftClient::new(e, &config.token_contract).transfer(&this, &config.treasury, &token_id);
    }

    /// Pull the refund credited to `bidder` when a push refund failed
    /// (`bidder` signs; `NoPendingRefund` when there is none). The balance is
    /// cleared before the transfer, and a failing transfer reverts both.
    /// Emits `RefundWithdrawn`.
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

    /// Refund credited to `bidder` and not yet withdrawn (read-only).
    fn pending_refund(e: &Env, bidder: Address) -> i128 {
        get_pending_refund(e, &bidder)
    }

    /// Set the duration of later auctions, 5 minutes to 30 days (the admin,
    /// while paused; `InvalidConfig`). Emits `DurationUpdated`.
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

    /// Set the reserve price of later auctions, at least `MIN_RESERVE_PRICE`
    /// (the admin, while paused; `InvalidBid`). Emits `ReservePriceUpdated`.
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

    /// Set the minimum bid increment, 1 to 100 percent (the admin, while
    /// paused; `InvalidConfig`). Emits `MinBidIncrementUpdated`.
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

    /// Set the anti-sniping time buffer, 1 second to 1 day (the admin, while
    /// paused; `InvalidTimeBuffer`). Emits `TimeBufferUpdated`.
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

    /// Set the payment token (the admin, while paused). It must be a
    /// Stellar Asset Contract (`NotStellarAsset`), and it can no longer
    /// change once anyone has bid (`InvalidConfig`), so bids and refunds
    /// always use one asset. Emits `PaymentTokenUpdated`.
    #[when_paused]
    fn set_payment_token(e: &Env, payment_token: Address) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        if is_payment_token_locked(e) {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }
        require_stellar_asset(e, &payment_token);

        let mut config = get_config(e);
        config.payment_token = payment_token.clone();
        set_config(e, &config);

        emit_payment_token_updated(e, &payment_token, &admin);
    }
}
