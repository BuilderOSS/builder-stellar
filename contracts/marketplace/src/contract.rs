#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, panic_with_error, vec, Address, BytesN, Env, Executable, IntoVal,
    String, Symbol, Val, Vec,
};

use common::clients::NftClient;
use common::modules::RenewalPage;
use soroban_sdk::token::TokenClient;

use crate::{
    error::MarketplaceError,
    events::{self, *},
    storage::{self, *},
};

/// A DAO's market for its membership tokens: escrowed secondary listings
/// and quick-buy pools of new tokens. See the crate documentation.
#[contract]
pub struct MarketplaceContract;

#[contractimpl]
impl MarketplaceContract {
    /// Deploy-time setup, run once by the Manager at `create_dao` or
    /// `create_module`. Starts paused and in Setup.
    ///
    /// * `token` - the DAO's membership token
    /// * `admin` - setup-phase admin of the parameter setters (the launch admin);
    ///   becomes the Treasury at launch
    /// * `treasury` - receives fees and pool sales
    /// * `payment_asset` - asset of new listings, a Stellar Asset Contract
    ///   (`NotStellarAsset`)
    /// * `manager`, `current_hash` - upgrade approvals and the running hash
    /// * `default_secondary_fee_bps` - fee on secondary sales, at most
    ///   `MAX_FEE_BPS` (`InvalidFee`)
    ///
    /// Emits `MarketplaceInitialized`.
    pub fn __constructor(
        e: &Env,
        token: Address,
        admin: Address,
        treasury: Address,
        payment_asset: Address,
        manager: Address,
        current_hash: BytesN<32>,
        default_secondary_fee_bps: u32,
    ) {
        if default_secondary_fee_bps > MAX_FEE_BPS {
            panic_with_error!(e, MarketplaceError::InvalidFee);
        }
        Self::require_stellar_asset(e, &payment_asset);
        storage::set_config(
            e,
            &MarketplaceConfig {
                token: token.clone(),
                treasury: treasury.clone(),
                payment_asset: payment_asset.clone(),
                default_secondary_fee_bps,
                manager,
                paused: true,
            },
        );
        common::admin::init(e, &admin);
        common::upgrade::init(e, &current_hash, STORAGE_VERSION);
        emit_marketplace_initialized(
            e,
            &token,
            &admin,
            &treasury,
            &payment_asset,
            default_secondary_fee_bps,
        );
    }

    /// The configuration: wiring, payment asset, default fee, and pause state
    /// (read-only).
    pub fn get_config(e: &Env) -> MarketplaceConfig {
        storage::get_config(e)
    }

    /// The live listing of `token_id`, if any (read-only; an expired listing
    /// stays until `expire`).
    pub fn get_listing(e: &Env, token_id: u32) -> Option<Listing> {
        storage::get_listing(e, token_id)
    }

    /// One-shot, Manager-only launch (Setup -> Live), `DaoModule::launch`.
    ///
    /// `treasury` must equal the treasury wired at construction (wiring is
    /// immutable). Hands the admin to the treasury unless `handoff` already
    /// did. The marketplace is left unpaused when `open` is true and forced
    /// paused otherwise. The Manager checks the payment asset against the one
    /// recorded at `create_dao` before calling. A second call panics with
    /// `AlreadyLive`.
    pub fn launch(e: &Env, treasury: Address, open: bool) {
        Self::require_current_layout(e);
        let mut config = Self::get_config(e);
        config.manager.require_auth();
        common::lifecycle::mark_live(e);
        if treasury != config.treasury {
            panic_with_error!(e, MarketplaceError::TreasuryMismatch);
        }
        common::admin::handoff_once(e, &treasury);
        // `open == false` forces paused even if the launch admin unpaused in setup.
        let was_paused = config.paused;
        config.paused = !open;
        storage::set_config(e, &config);
        if was_paused && open {
            MarketplaceUnpaused {
                changed_by: config.manager.clone(),
            }
            .publish(e);
        } else if !was_paused && !open {
            MarketplacePaused {
                changed_by: config.manager.clone(),
            }
            .publish(e);
        }
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury, open);
    }

    /// Manager-only early handoff: the admin moves to `treasury` and the
    /// module stays in Setup, so its setters and upgrades are frozen until
    /// launch. Panics `AlreadyLive` once launched.
    pub fn handoff(e: &Env, treasury: Address) {
        Self::require_current_layout(e);
        let config = Self::get_config(e);
        config.manager.require_auth();
        common::lifecycle::require_setup(e);
        if treasury != config.treasury {
            panic_with_error!(e, MarketplaceError::TreasuryMismatch);
        }
        common::admin::handoff_once(e, &treasury);
        common::ttl::extend_instance(e);
    }

    /// The configured payment asset (`DaoModule::payment_asset`; read-only).
    /// The Manager compares it with the asset recorded at `create_dao`
    /// before launch.
    pub fn payment_asset(e: &Env) -> Address {
        Self::get_config(e).payment_asset
    }

    /// DAO-owned keys for the renewal sweep (`DaoModule::renewal_keys`).
    ///
    /// The key space is `Listing(0..minted)`, then for each open pool its
    /// `Pool(id)` and `PoolStock(id, 0..pages)` (a 100-token pool is 3 pages,
    /// eng review R8). The bounds come from instance storage only, so the
    /// page answers even when the entries have archived. Most listing slots
    /// hold nothing; the sweep renews only what it finds. `PoolBuyer` counts
    /// are the buyers' (holder class). The balances held are the escrowed and
    /// stocked tokens and the payment assets (a listing created before
    /// `set_payment_asset` may be priced in an older one; the sweep reads
    /// those from the listings it finds).
    pub fn renewal_keys(e: &Env, cursor: u32, limit: u32) -> RenewalPage {
        let config = Self::get_config(e);
        let minted = NftClient::new(e, &config.token).minted();
        let slots = storage::open_pools(e);
        // Pool `p`'s keys: `Pool(p)` then `PoolStock(p, 0..pages)`.
        let mut spans: Vec<(u32, u32)> = Vec::new(e);
        for slot in slots.iter() {
            spans.push_back((slot.pool_id, 1 + slot.pages));
        }
        let pool_keys: u32 = spans.iter().map(|(_, span)| span).sum();
        let total = minted.saturating_add(pool_keys);
        let (end, next_cursor) = common::modules::renewal_window(cursor, limit, total);
        let mut keys: Vec<(Val, bool)> = Vec::new(e);
        for at in cursor..end {
            let key: Val = if at < minted {
                common::ns(e, DataKey::Listing(at)).into_val(e)
            } else {
                let mut offset = at - minted;
                let mut key = None;
                for (pool_id, span) in spans.iter() {
                    if offset < span {
                        key = Some(if offset == 0 {
                            common::ns(e, DataKey::Pool(pool_id)).into_val(e)
                        } else {
                            common::ns(e, DataKey::PoolStock(pool_id, offset - 1)).into_val(e)
                        });
                        break;
                    }
                    offset -= span;
                }
                key.unwrap()
            };
            keys.push_back((key, true));
        }
        // Pool payments go straight to the Treasury, so the only balances
        // held here are the token (escrow and stock) and the listing asset.
        RenewalPage {
            keys,
            assets: vec![e, config.token, config.payment_asset],
            next_cursor,
        }
    }

    // ========================================================================
    // Quick-buy pools (docs/designs/membership-models.md §4)
    // ========================================================================
    //
    //   proposal: token.increase_mint_allowance(marketplace, n) + open_pool(.., n, ..)
    //       │        (reserves n of the allowance for this pool alone)
    //       ▼
    //   restock() ×k ──► batch_mint into custody ──► PoolStock(pool, page ≤ 64 ids)
    //       │
    //   buy_from_pool(pool, page, id) ──► caps, rate, closed checks ──► pay Treasury, send id
    //       │
    //   close_pool() ──► release_mint_allowance(unstocked) ; sweep_pool() ×k ──► unsold to Treasury

    /// Open a pool of `size` tokens (the Treasury, by proposal, once Live;
    /// refused while paused).
    ///
    /// Buyers pay `price` of `asset`, a Stellar Asset Contract
    /// (`NotStellarAsset`), until `expires_at`. Each buyer may buy at most
    /// `max_per_buyer`, and the pool sells at most `max_sold_per_period` per
    /// `period_secs` (`InvalidPool` if any of these is zero). The pool
    /// reserves `size` of the Marketplace's mint allowance for itself: the
    /// allowance not reserved by other open pools must cover it
    /// (`AllowanceNotReserved`), so closing one pool never starves another.
    /// At most `MAX_OPEN_POOLS` are open (`TooManyPools`). Emits `PoolOpened`
    /// and returns the pool id.
    #[allow(clippy::too_many_arguments)]
    pub fn open_pool(
        e: &Env,
        price: i128,
        asset: Address,
        expires_at: u64,
        size: u32,
        max_per_buyer: u32,
        max_sold_per_period: u32,
        period_secs: u64,
    ) -> u32 {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        let (config, _) = Self::require_admin(e);
        if config.paused {
            panic_with_error!(e, MarketplaceError::Paused);
        }
        let now = e.ledger().timestamp();
        if price <= 0 {
            panic_with_error!(e, MarketplaceError::InvalidPrice);
        }
        if expires_at <= now {
            panic_with_error!(e, MarketplaceError::InvalidExpiry);
        }
        if size == 0 || max_per_buyer == 0 || max_sold_per_period == 0 || period_secs == 0 {
            panic_with_error!(e, MarketplaceError::InvalidPool);
        }
        Self::require_stellar_asset(e, &asset);
        let mut slots = storage::open_pools(e);
        if slots.len() >= MAX_OPEN_POOLS {
            panic_with_error!(e, MarketplaceError::TooManyPools);
        }
        let reserved: u64 = slots.iter().map(|slot| u64::from(slot.unstocked)).sum();
        let allowance = u64::from(
            NftClient::new(e, &config.token).mint_allowance(&e.current_contract_address()),
        );
        if allowance.saturating_sub(reserved) < u64::from(size) {
            panic_with_error!(e, MarketplaceError::AllowanceNotReserved);
        }

        let pool_id = storage::take_pool_id(e);
        let pool = Pool {
            price,
            asset: asset.clone(),
            expires_at,
            size,
            stocked: 0,
            sold: 0,
            max_per_buyer,
            max_sold_per_period,
            period_secs,
            period_start: now,
            sold_in_period: 0,
            closed: false,
        };
        storage::set_pool(e, pool_id, &pool);
        slots.push_back(PoolSlot {
            pool_id,
            unstocked: size,
            pages: 0,
        });
        storage::set_open_pools(e, &slots);
        PoolOpened {
            pool_id,
            price,
            asset,
            expires_at,
            size,
            max_per_buyer,
            max_sold_per_period,
            period_secs,
        }
        .publish(e);
        pool_id
    }

    /// Mint the pool's next chunk (at most `common::MAX_RESTOCK`) into this
    /// contract's custody and append the ids to its stock pages. Anyone may
    /// call it until the pool closes or expires (`PoolClosed`) or has stocked
    /// its size (`PoolFullyStocked`); it spends this contract's allowance.
    /// Emits `PoolRestocked` and returns how many it minted.
    pub fn restock(e: &Env, pool_id: u32) -> u32 {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        let config = Self::get_config(e);
        let mut pool = Self::load_pool(e, pool_id);
        if pool.closed || e.ledger().timestamp() >= pool.expires_at {
            panic_with_error!(e, MarketplaceError::PoolClosed);
        }
        let (mut slots, index) = Self::slot(e, pool_id);
        let mut slot = slots.get(index).unwrap();
        if slot.unstocked == 0 {
            panic_with_error!(e, MarketplaceError::PoolFullyStocked);
        }
        let count = slot.unstocked.min(common::MAX_RESTOCK);
        let this = e.current_contract_address();
        // The Token spends this contract's allowance; it is a non-voting
        // holder, so no votes move.
        let ids = NftClient::new(e, &config.token).batch_mint(
            &this,
            &vec![e, this.clone()],
            &vec![e, u128::from(count)],
        );
        let mut page_ids = if slot.pages == 0 {
            Vec::new(e)
        } else {
            storage::get_stock(e, pool_id, slot.pages - 1).unwrap_or(Vec::new(e))
        };
        if slot.pages == 0 || page_ids.len() >= POOL_PAGE_SIZE {
            slot.pages += 1;
            page_ids = Vec::new(e);
        }
        for id in ids.iter() {
            if page_ids.len() >= POOL_PAGE_SIZE {
                storage::set_stock(e, pool_id, slot.pages - 1, &page_ids);
                slot.pages += 1;
                page_ids = Vec::new(e);
            }
            page_ids.push_back(id);
        }
        storage::set_stock(e, pool_id, slot.pages - 1, &page_ids);
        slot.unstocked -= count;
        pool.stocked += count;
        slots.set(index, slot);
        storage::set_open_pools(e, &slots);
        storage::set_pool(e, pool_id, &pool);
        PoolRestocked {
            pool_id,
            first_token_id: ids.first().unwrap_or(0),
            count,
            stocked: pool.stocked,
        }
        .publish(e);
        count
    }

    /// Buy `token_id` from page `page` of a pool (`buyer` signs; refused
    /// while paused): pays the pool price to the Treasury and sends the
    /// token to `buyer`. Refuses once the pool is closed or expired
    /// (`PoolClosed`), past the buyer's cap (`BuyerLimitReached`) or the
    /// period's sales (`PoolRateLimited`), above `max_price`
    /// (`PriceAboveMax`), or when the token is not on that page
    /// (`NotInPool`). Emits `PoolPurchased`.
    pub fn buy_from_pool(
        e: &Env,
        pool_id: u32,
        page: u32,
        token_id: u32,
        buyer: Address,
        max_price: i128,
    ) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        let config = Self::get_config(e);
        if config.paused {
            panic_with_error!(e, MarketplaceError::Paused);
        }
        buyer.require_auth();
        let mut pool = Self::load_pool(e, pool_id);
        let now = e.ledger().timestamp();
        if pool.closed || now >= pool.expires_at {
            panic_with_error!(e, MarketplaceError::PoolClosed);
        }
        if pool.price > max_price {
            panic_with_error!(e, MarketplaceError::PriceAboveMax);
        }
        let bought = storage::get_bought(e, pool_id, &buyer);
        if bought >= pool.max_per_buyer {
            panic_with_error!(e, MarketplaceError::BuyerLimitReached);
        }
        if now >= pool.period_start.saturating_add(pool.period_secs) {
            pool.period_start = now;
            pool.sold_in_period = 0;
        }
        if pool.sold_in_period >= pool.max_sold_per_period {
            panic_with_error!(e, MarketplaceError::PoolRateLimited);
        }
        let mut ids = storage::get_stock(e, pool_id, page)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::NotInPool));
        let at = ids
            .first_index_of(token_id)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::NotInPool));
        ids.remove(at);
        storage::set_stock(e, pool_id, page, &ids);
        pool.sold += 1;
        pool.sold_in_period += 1;
        storage::set_pool(e, pool_id, &pool);
        storage::set_bought(e, pool_id, &buyer, bought + 1);

        Self::payment_transfer(e, &pool.asset, &buyer, &config.treasury, pool.price);
        Self::token_transfer(
            e,
            &config.token,
            &e.current_contract_address(),
            &buyer,
            token_id,
        );
        PoolPurchased {
            pool_id,
            buyer,
            token_id,
            price: pool.price,
            asset: pool.asset,
        }
        .publish(e);
    }

    /// Close a pool: the Treasury (by proposal) at any time, anyone once it
    /// has expired. Gives the unstocked rest of the pool's reservation back
    /// to the Token (`release_mint_allowance`, which saturates if the
    /// Treasury lowered the allowance meanwhile). Unsold stock stays here
    /// until `sweep_pool`. Emits `PoolClosed`.
    pub fn close_pool(e: &Env, pool_id: u32) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        let config = Self::get_config(e);
        let mut pool = Self::load_pool(e, pool_id);
        if pool.closed {
            panic_with_error!(e, MarketplaceError::PoolClosed);
        }
        if e.ledger().timestamp() < pool.expires_at {
            common::admin::require_admin(e);
        }
        pool.closed = true;
        storage::set_pool(e, pool_id, &pool);
        let (mut slots, index) = Self::slot(e, pool_id);
        let mut slot = slots.get(index).unwrap();
        let released = slot.unstocked;
        slot.unstocked = 0;
        if slot.pages == 0 {
            slots.remove(index);
        } else {
            slots.set(index, slot);
        }
        storage::set_open_pools(e, &slots);
        if released > 0 {
            NftClient::new(e, &config.token)
                .release_mint_allowance(&e.current_contract_address(), &released);
        }
        PoolClosed { pool_id, released }.publish(e);
    }

    /// Return up to `MAX_SWEEP` unsold tokens of a closed pool to the
    /// Treasury, emptying its stock pages from the last. Anyone may call it
    /// until it returns 0 (pages left); `PoolOpen` before `close_pool`. Both
    /// holders are non-voting, so no votes move. Emits `PoolSwept`.
    pub fn sweep_pool(e: &Env, pool_id: u32) -> u32 {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        let config = Self::get_config(e);
        let pool = Self::load_pool(e, pool_id);
        if !pool.closed {
            panic_with_error!(e, MarketplaceError::PoolOpen);
        }
        let mut slots = storage::open_pools(e);
        let Some(index) = slots.iter().position(|slot| slot.pool_id == pool_id) else {
            return 0;
        };
        let index = index as u32;
        let mut slot = slots.get(index).unwrap();
        let this = e.current_contract_address();
        let mut moved = 0u32;
        while moved < MAX_SWEEP && slot.pages > 0 {
            let page = slot.pages - 1;
            let mut ids = storage::get_stock(e, pool_id, page).unwrap_or(Vec::new(e));
            while moved < MAX_SWEEP {
                let Some(token_id) = ids.pop_back() else {
                    break;
                };
                Self::token_transfer(e, &config.token, &this, &config.treasury, token_id);
                moved += 1;
            }
            if ids.is_empty() {
                storage::remove_stock(e, pool_id, page);
                slot.pages -= 1;
            } else {
                storage::set_stock(e, pool_id, page, &ids);
            }
        }
        let pages_left = slot.pages;
        if pages_left == 0 {
            slots.remove(index);
        } else {
            slots.set(index, slot);
        }
        storage::set_open_pools(e, &slots);
        PoolSwept {
            pool_id,
            count: moved,
            pages_left,
        }
        .publish(e);
        pages_left
    }

    /// Pool `pool_id`, if it was opened (read-only; kept after it closes).
    pub fn get_pool(e: &Env, pool_id: u32) -> Option<Pool> {
        storage::get_pool(e, pool_id)
    }

    /// The token ids on one stock page (empty once sold or swept).
    pub fn pool_stock(e: &Env, pool_id: u32, page: u32) -> Vec<u32> {
        storage::get_stock(e, pool_id, page).unwrap_or(Vec::new(e))
    }

    /// How many tokens `buyer` bought from a pool.
    pub fn pool_purchases(e: &Env, pool_id: u32, buyer: Address) -> u32 {
        storage::get_bought(e, pool_id, &buyer)
    }

    /// Pools opened and not yet swept empty, with their unstocked
    /// reservations and page counts.
    pub fn open_pools(e: &Env) -> Vec<PoolSlot> {
        storage::open_pools(e)
    }

    /// Id the next pool will receive.
    pub fn next_pool_id(e: &Env) -> u32 {
        storage::next_pool_id(e)
    }

    /// List `token_id` for `price` until `expires_at` (`seller` signs and
    /// must own it; Live only; refused while paused). The token moves into
    /// this contract's custody until it is bought, cancelled, expired, or
    /// returned. The seller must first approve the Marketplace for the
    /// token; in a locked DAO the Token refuses that approval, so no new
    /// listing can be made. Emits `SecondaryListingCreated`.
    ///
    /// The fee and payment asset in force are captured in the listing.
    /// `max_fee_bps` and `payment_asset` are the terms the seller signed for:
    /// the call fails (`FeeAboveMax` / `PaymentAssetMismatch`) if the current
    /// config is worse, so a fee or asset change landing between signing and
    /// inclusion cannot apply to this listing.
    pub fn list(
        e: &Env,
        token_id: u32,
        seller: Address,
        price: i128,
        expires_at: u64,
        max_fee_bps: u32,
        payment_asset: Address,
    ) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        // Setup-window listings could pin a custom asset/fee past launch.
        common::lifecycle::require_live(e);
        let config = Self::get_config(e);
        Self::check_open_listing(e, price, expires_at);
        seller.require_auth();
        if config.default_secondary_fee_bps > max_fee_bps {
            panic_with_error!(e, MarketplaceError::FeeAboveMax);
        }
        if config.payment_asset != payment_asset {
            panic_with_error!(e, MarketplaceError::PaymentAssetMismatch);
        }
        if storage::get_listing(e, token_id).is_some() {
            panic_with_error!(e, MarketplaceError::ListingExists);
        }

        let owner = NftClient::new(e, &config.token).owner_of(&token_id);
        if owner != seller {
            panic_with_error!(e, MarketplaceError::NotSeller);
        }

        let transfer_args = vec![
            e,
            e.current_contract_address().into_val(e),
            seller.clone().into_val(e),
            e.current_contract_address().into_val(e),
            token_id.into_val(e),
        ];
        Self::authorize(
            e,
            &config.token,
            "transfer_from",
            transfer_args,
            Vec::new(e),
        );
        NftClient::new(e, &config.token).transfer_from(
            &e.current_contract_address(),
            &seller,
            &e.current_contract_address(),
            &token_id,
        );

        let listing = Listing {
            seller,
            price,
            expires_at,
            fee_bps: config.default_secondary_fee_bps,
            payment_asset: config.payment_asset.clone(),
        };
        storage::set_listing(e, token_id, &listing);
        events::emit_secondary_created(e, token_id, &listing);
    }

    /// Buy a secondary listing (`buyer` signs; refused while paused or once
    /// the listing expired, `ListingExpired`). Rejects (`PriceAboveMax`) if
    /// the listing price exceeds `max_price`. The buyer pays the fee to the
    /// Treasury and the rest to the seller, in the asset captured at list
    /// time, and receives the token. Emits `ListingPurchased`.
    pub fn buy(e: &Env, token_id: u32, buyer: Address, max_price: i128) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        let config = Self::get_config(e);
        if config.paused {
            panic_with_error!(e, MarketplaceError::Paused);
        }
        buyer.require_auth();
        let listing = storage::get_listing(e, token_id)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::ListingNotFound));
        if e.ledger().timestamp() >= listing.expires_at {
            panic_with_error!(e, MarketplaceError::ListingExpired);
        }
        if listing.price > max_price {
            panic_with_error!(e, MarketplaceError::PriceAboveMax);
        }
        let fee = listing
            .price
            .checked_mul(listing.fee_bps as i128)
            .and_then(|value| value.checked_div(common::BPS_DENOMINATOR as i128))
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::ArithmeticOverflow));
        let seller_amount = listing
            .price
            .checked_sub(fee)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::ArithmeticOverflow));
        storage::remove_listing(e, token_id);

        // Charged in the asset captured at list time, not the current config asset.
        Self::payment_transfer(e, &listing.payment_asset, &buyer, &config.treasury, fee);
        Self::payment_transfer(
            e,
            &listing.payment_asset,
            &buyer,
            &listing.seller,
            seller_amount,
        );
        Self::token_transfer(
            e,
            &config.token,
            &e.current_contract_address(),
            &buyer,
            token_id,
        );
        ListingPurchased {
            token_id,
            buyer,
            seller: listing.seller,
            price: listing.price,
            fee,
            payment_asset: listing.payment_asset,
        }
        .publish(e);
    }

    /// Cancel a listing and take the token back (`seller` signs and must be
    /// the listing's seller, `NotSeller`). Works while paused and after
    /// expiry. Emits `ListingCancelled`.
    pub fn cancel(e: &Env, token_id: u32, seller: Address) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        seller.require_auth();
        let listing = Self::load_listing(e, token_id);
        if listing.seller != seller {
            panic_with_error!(e, MarketplaceError::NotSeller);
        }
        storage::remove_listing(e, token_id);
        let config = Self::get_config(e);
        Self::token_transfer(
            e,
            &config.token,
            &e.current_contract_address(),
            &seller,
            token_id,
        );
        ListingCancelled { token_id, seller }.publish(e);
    }

    /// Return an expired listing's token to its seller (anyone may call;
    /// `ListingActive` before the expiry). Works while paused. Emits
    /// `ListingExpired`.
    pub fn expire(e: &Env, token_id: u32) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        let listing = Self::load_listing(e, token_id);
        if e.ledger().timestamp() < listing.expires_at {
            panic_with_error!(e, MarketplaceError::ListingActive);
        }
        storage::remove_listing(e, token_id);
        let config = Self::get_config(e);
        Self::token_transfer(
            e,
            &config.token,
            &e.current_contract_address(),
            &listing.seller,
            token_id,
        );
        ListingExpired {
            token_id,
            seller: listing.seller,
        }
        .publish(e);
    }

    /// Return a listing's token to its seller and remove the listing, before
    /// its expiry and without the seller (the admin: the Treasury, by
    /// proposal; only while paused, `NotPaused`). No payment moves. Emits
    /// `ListingCancelled`.
    ///
    /// This is how the DAO empties the Marketplace's escrow, for example
    /// before unregistering it, which the Token refuses while the Marketplace
    /// holds tokens. Without it, one listing with a distant expiry would keep
    /// the Marketplace registered.
    pub fn return_listing(e: &Env, token_id: u32) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        let (config, _) = Self::require_admin(e);
        // Pausing first stops new listings and purchases, so the DAO cannot
        // pull single listings out of an open market.
        if !config.paused {
            panic_with_error!(e, MarketplaceError::NotPaused);
        }
        let listing = Self::load_listing(e, token_id);
        storage::remove_listing(e, token_id);
        Self::token_transfer(
            e,
            &config.token,
            &e.current_contract_address(),
            &listing.seller,
            token_id,
        );
        ListingCancelled {
            token_id,
            seller: listing.seller,
        }
        .publish(e);
    }

    /// Send `token_id`, a membership token this contract holds that no
    /// listing or pool records, to the Treasury (the admin, while paused,
    /// `NotPaused`). A listed token is refused (`ListingExists`: use
    /// `return_listing`), and so is any token while a pool is not yet swept
    /// empty (`PoolOpen`), because stock pages are not indexed by token. The
    /// Token's `Transfer` records the move; no marketplace event is emitted.
    ///
    /// The Token refuses to unregister the Marketplace while it holds
    /// tokens. It also refuses a token sent here by anyone but this contract
    /// (`ModuleCustodyClosed`), so such a token was sent before that rule;
    /// without this call it would keep the Marketplace registered.
    pub fn recover_token(e: &Env, token_id: u32) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        let (config, _) = Self::require_admin(e);
        if !config.paused {
            panic_with_error!(e, MarketplaceError::NotPaused);
        }
        // A listed token is the seller's; pool stock is the pool's.
        if storage::get_listing(e, token_id).is_some() {
            panic_with_error!(e, MarketplaceError::ListingExists);
        }
        if !storage::open_pools(e).is_empty() {
            panic_with_error!(e, MarketplaceError::PoolOpen);
        }
        Self::token_transfer(
            e,
            &config.token,
            &e.current_contract_address(),
            &config.treasury,
            token_id,
        );
    }

    /// Comment on `token_id`'s secondary listings. No active listing is
    /// required, so the thread survives relisting. Anyone may comment, even
    /// while paused. Event-only: emits `ListingCommented`, writes no storage.
    pub fn comment_listing(e: &Env, token_id: u32, body: String, author: Address) {
        Self::require_current_layout(e);
        author.require_auth();
        Self::check_comment(e, &body);
        ListingCommented {
            token_id,
            author,
            body,
        }
        .publish(e);
    }

    /// Pause new listings, purchases, and pools (the admin). Cancel, expire,
    /// restock, close, and sweep keep working. Emits `MarketplacePaused`.
    pub fn pause(e: &Env) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        let (mut config, admin) = Self::require_admin(e);
        config.paused = true;
        storage::set_config(e, &config);
        MarketplacePaused { changed_by: admin }.publish(e);
    }

    /// Reopen the marketplace (the admin). Emits `MarketplaceUnpaused`.
    pub fn unpause(e: &Env) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        let (mut config, admin) = Self::require_admin(e);
        config.paused = false;
        storage::set_config(e, &config);
        MarketplaceUnpaused { changed_by: admin }.publish(e);
    }

    /// Fee applied to new listings (the admin; existing listings keep
    /// theirs). At most `common::MAX_FEE_BPS` (25%, `InvalidFee`). Emits
    /// `SecondaryFeeUpdated`.
    pub fn set_secondary_fee_bps(e: &Env, fee_bps: u32) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        let (mut config, admin) = Self::require_admin(e);
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(e, MarketplaceError::InvalidFee);
        }
        config.default_secondary_fee_bps = fee_bps;
        storage::set_config(e, &config);
        SecondaryFeeUpdated {
            fee_bps,
            changed_by: admin,
        }
        .publish(e);
    }

    /// Asset used by new listings (the admin; existing listings keep
    /// theirs). It must be a Stellar Asset Contract (`NotStellarAsset`).
    /// Emits `PaymentAssetUpdated`.
    pub fn set_payment_asset(e: &Env, payment_asset: Address) {
        Self::require_current_layout(e);
        common::ttl::extend_instance(e);
        let (mut config, admin) = Self::require_admin(e);
        Self::require_stellar_asset(e, &payment_asset);
        config.payment_asset = payment_asset.clone();
        storage::set_config(e, &config);
        PaymentAssetUpdated {
            payment_asset,
            changed_by: admin,
        }
        .publish(e);
    }

    /// Replaces this contract's WASM with `to_hash` (admin only: the launch
    /// admin in Setup, the Treasury by proposal once live). `from_hash` must
    /// be the running hash, and the Manager must have approved the
    /// `from_hash` to `to_hash` step (`common::upgrade::apply`).
    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        let (config, _) = Self::require_admin(e);
        common::upgrade::apply(e, &config.manager, &from_hash, &to_hash);
    }

    /// Advance the storage layout after an upgrade (admin only;
    /// `NothingToMigrate` when already current). Until it runs, every entry
    /// point that changes state fails `StorageVersionMismatch`. A governance
    /// upgrade runs `upgrade` and `migrate` in one proposal; the Treasury does
    /// not depend on this module, so a skipped migration can always be
    /// completed by proposal.
    pub fn migrate(e: &Env) {
        Self::require_admin(e);
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    /// Storage-layout version of the data held by this contract. While it
    /// differs from the code's `STORAGE_VERSION`, every entry point that
    /// changes state fails `StorageVersionMismatch`.
    pub fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }

    /// Module admin: the launch admin during setup, the Treasury once live.
    pub fn admin(e: &Env) -> Address {
        common::admin::admin(e)
    }

    /// The release version registered in the Manager for the running WASM
    /// (read-only; `ImplementationNotFound` if the registry has none).
    pub fn version(e: &Env) -> String {
        common::upgrade::version(e, &Self::get_config(e).manager)
    }

    /// The running WASM hash (read-only).
    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    /// Panics `StorageVersionMismatch` unless the stored data layout is the
    /// one this code expects, so this code never writes data in a layout it
    /// does not know. The first check of every entry point that changes
    /// state; `upgrade`, `migrate` and the views stay outside it.
    fn require_current_layout(e: &Env) {
        if !common::upgrade::is_current_layout(e, STORAGE_VERSION) {
            panic_with_error!(e, MarketplaceError::StorageVersionMismatch);
        }
    }

    /// Refuse an asset that is not a Stellar Asset Contract
    /// (`NotStellarAsset`).
    ///
    /// Purchases pay through the asset's `transfer`. A custom contract could
    /// report a payment that never happened or refuse chosen transfers, so
    /// only Stellar Asset Contracts, whose behaviour is fixed, are taken.
    fn require_stellar_asset(e: &Env, asset: &Address) {
        if !matches!(asset.executable(), Some(Executable::StellarAsset)) {
            panic_with_error!(e, MarketplaceError::NotStellarAsset);
        }
    }

    /// Require the admin's auth (launch admin in setup, Treasury once live);
    /// returns the config and the admin.
    fn require_admin(e: &Env) -> (MarketplaceConfig, Address) {
        let admin = common::admin::require_admin(e);
        (Self::get_config(e), admin)
    }

    fn check_open_listing(e: &Env, price: i128, expires_at: u64) {
        if Self::get_config(e).paused {
            panic_with_error!(e, MarketplaceError::Paused);
        }
        if price <= 0 {
            panic_with_error!(e, MarketplaceError::InvalidPrice);
        }
        if expires_at <= e.ledger().timestamp() {
            panic_with_error!(e, MarketplaceError::InvalidExpiry);
        }
    }

    fn check_comment(e: &Env, body: &String) {
        if body.is_empty() {
            panic_with_error!(e, MarketplaceError::CommentEmpty);
        }
        if body.len() > common::MAX_COMMENT_LENGTH {
            panic_with_error!(e, MarketplaceError::CommentTooLong);
        }
    }

    fn load_listing(e: &Env, token_id: u32) -> Listing {
        storage::get_listing(e, token_id)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::ListingNotFound))
    }

    fn load_pool(e: &Env, pool_id: u32) -> Pool {
        storage::get_pool(e, pool_id)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::PoolNotFound))
    }

    /// The open-pool slots and the index of `pool_id`'s (`PoolClosed` once
    /// it was swept empty).
    fn slot(e: &Env, pool_id: u32) -> (Vec<PoolSlot>, u32) {
        let slots = storage::open_pools(e);
        let index = slots
            .iter()
            .position(|slot| slot.pool_id == pool_id)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::PoolClosed));
        (slots, index as u32)
    }

    fn authorize(
        e: &Env,
        contract: &Address,
        function: &str,
        args: Vec<Val>,
        sub: Vec<InvokerContractAuthEntry>,
    ) {
        e.authorize_as_current_contract(vec![
            e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: contract.clone(),
                    fn_name: Symbol::new(e, function),
                    args,
                },
                sub_invocations: sub,
            }),
        ]);
    }

    fn token_transfer(e: &Env, token: &Address, from: &Address, to: &Address, token_id: u32) {
        let args = vec![e, from.into_val(e), to.into_val(e), token_id.into_val(e)];
        Self::authorize(e, token, "transfer", args, Vec::new(e));
        NftClient::new(e, token).transfer(from, to, &token_id);
    }

    fn payment_transfer(e: &Env, asset: &Address, from: &Address, to: &Address, amount: i128) {
        if amount == 0 {
            return;
        }
        let args = vec![e, from.into_val(e), to.into_val(e), amount.into_val(e)];
        Self::authorize(e, asset, "transfer", args, Vec::new(e));
        TokenClient::new(e, asset).transfer(from, to, &amount);
    }
}
