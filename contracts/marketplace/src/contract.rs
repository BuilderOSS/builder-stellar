#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, panic_with_error, vec, Address, BytesN, Env, IntoVal, String, Symbol,
    Val, Vec,
};

use common::clients::NftClient;
use common::modules::RenewalPage;
use soroban_sdk::token::TokenClient;

use crate::{
    error::MarketplaceError,
    events::{self, *},
    storage::{self, *},
};

#[contract]
pub struct MarketplaceContract;

#[contractimpl]
impl MarketplaceContract {
    /// * `admin` - setup-phase admin of the parameter setters (the launch admin);
    ///   becomes the Treasury at launch
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

    pub fn get_config(e: &Env) -> MarketplaceConfig {
        storage::get_config(e)
    }

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
        let config = Self::get_config(e);
        config.manager.require_auth();
        common::lifecycle::require_setup(e);
        if treasury != config.treasury {
            panic_with_error!(e, MarketplaceError::TreasuryMismatch);
        }
        common::admin::handoff_once(e, &treasury);
        common::ttl::extend_instance(e);
    }

    /// The configured payment asset (`DaoModule::payment_asset`).
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

    /// Open a pool of `size` tokens (the Treasury, by proposal, once Live).
    ///
    /// The pool reserves `size` of the Marketplace's mint allowance for
    /// itself: the allowance not reserved by other open pools must cover it
    /// (`AllowanceNotReserved`), so closing one pool never starves another.
    /// Returns the pool id.
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
    /// call it until the pool closes or expires. Returns how many it minted.
    pub fn restock(e: &Env, pool_id: u32) -> u32 {
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

    /// Buy `token_id` from page `page` of a pool: pays the pool price to the
    /// Treasury and sends the token to `buyer`. Refuses once the pool is
    /// closed or expired (`PoolClosed`), past the buyer's cap
    /// (`BuyerLimitReached`) or the period's sales (`PoolRateLimited`), or
    /// above `max_price` (`PriceAboveMax`).
    pub fn buy_from_pool(
        e: &Env,
        pool_id: u32,
        page: u32,
        token_id: u32,
        buyer: Address,
        max_price: i128,
    ) {
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
    /// until `sweep_pool`.
    pub fn close_pool(e: &Env, pool_id: u32) {
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
    /// until it returns 0 (pages left). Both holders are non-voting, so no
    /// votes move.
    pub fn sweep_pool(e: &Env, pool_id: u32) -> u32 {
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

    /// List `token_id` (escrowed here until bought, cancelled or expired).
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

    /// Buy a secondary listing. Rejects (`PriceAboveMax`) if the listing price
    /// exceeds `max_price`.
    pub fn buy(e: &Env, token_id: u32, buyer: Address, max_price: i128) {
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

    pub fn cancel(e: &Env, token_id: u32, seller: Address) {
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

    pub fn expire(e: &Env, token_id: u32) {
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

    /// Comment on `token_id`'s secondary listings. No active listing is
    /// required, so the thread survives relisting. Anyone may comment, even
    /// while paused. Event-only: emits `ListingCommented`, writes no storage.
    pub fn comment_listing(e: &Env, token_id: u32, body: String, author: Address) {
        author.require_auth();
        Self::check_comment(e, &body);
        ListingCommented {
            token_id,
            author,
            body,
        }
        .publish(e);
    }

    pub fn pause(e: &Env) {
        common::ttl::extend_instance(e);
        let (mut config, admin) = Self::require_admin(e);
        config.paused = true;
        storage::set_config(e, &config);
        MarketplacePaused { changed_by: admin }.publish(e);
    }

    pub fn unpause(e: &Env) {
        common::ttl::extend_instance(e);
        let (mut config, admin) = Self::require_admin(e);
        config.paused = false;
        storage::set_config(e, &config);
        MarketplaceUnpaused { changed_by: admin }.publish(e);
    }

    /// Fee applied to new listings (existing listings keep theirs). At most
    /// `common::MAX_FEE_BPS` (25%).
    pub fn set_secondary_fee_bps(e: &Env, fee_bps: u32) {
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

    /// Asset used by new listings (existing listings keep theirs).
    pub fn set_payment_asset(e: &Env, payment_asset: Address) {
        common::ttl::extend_instance(e);
        let (mut config, admin) = Self::require_admin(e);
        config.payment_asset = payment_asset.clone();
        storage::set_config(e, &config);
        PaymentAssetUpdated {
            payment_asset,
            changed_by: admin,
        }
        .publish(e);
    }

    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        let (config, _) = Self::require_admin(e);
        common::upgrade::apply(e, &config.manager, &from_hash, &to_hash);
    }

    /// Advance the storage layout after an upgrade (admin only).
    pub fn migrate(e: &Env) {
        Self::require_admin(e);
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    /// Storage-layout version of the data held by this contract.
    pub fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }

    /// Module admin: the launch admin during setup, the Treasury once live.
    pub fn admin(e: &Env) -> Address {
        common::admin::admin(e)
    }

    pub fn version(e: &Env) -> String {
        common::upgrade::version(e, &Self::get_config(e).manager)
    }

    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
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
