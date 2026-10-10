#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, panic_with_error, vec, Address, BytesN, Env, IntoVal, String, Symbol,
    Val, Vec,
};

use common::clients::NftClient;
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
        version: String,
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
        common::upgrade::init(e, &current_hash, &version, STORAGE_VERSION);
        emit_marketplace_initialized(
            e,
            &token,
            &admin,
            &treasury,
            &payment_asset,
            &version,
            default_secondary_fee_bps,
        );
    }

    pub fn get_config(e: &Env) -> MarketplaceConfig {
        storage::get_config(e)
    }

    pub fn get_listing(e: &Env, token_id: u32) -> Option<Listing> {
        storage::get_listing(e, token_id)
    }

    /// One-shot, Manager-only launch handoff (Setup -> Live).
    ///
    /// `treasury` must equal the treasury wired at construction (wiring is
    /// immutable). Hands the admin to the treasury. The marketplace is left
    /// unpaused when `open` is true and forced paused otherwise. Panics
    /// `PaymentAssetMismatch` if the payment asset differs from
    /// `expected_payment_asset`. A second call panics with `AlreadyLive`.
    pub fn launch(e: &Env, treasury: Address, open: bool, expected_payment_asset: Address) {
        let mut config = Self::get_config(e);
        config.manager.require_auth();
        common::lifecycle::mark_live(e);
        if treasury != config.treasury {
            panic_with_error!(e, MarketplaceError::TreasuryMismatch);
        }
        if expected_payment_asset != config.payment_asset {
            panic_with_error!(e, MarketplaceError::PaymentAssetMismatch);
        }
        common::admin::handoff(e, &treasury);
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

    pub fn get_primary_listing(e: &Env, listing_id: u64) -> Option<PrimaryListing> {
        storage::get_primary_listing(e, listing_id)
    }

    /// Id the next primary listing will receive.
    pub fn next_listing_id(e: &Env) -> u64 {
        storage::peek_next_listing_id(e)
    }

    /// Create a primary sale listing (treasury-gated, Live, not paused).
    ///
    /// Nothing is minted or escrowed: the token is minted straight to the
    /// buyer inside `buy_primary`. Returns the new listing id.
    pub fn create_primary_listing(e: &Env, price: i128, expires_at: u64) -> u64 {
        common::ttl::extend_instance(e);
        // Nothing holds mint authority before launch.
        common::lifecycle::require_live(e);
        let (config, _) = Self::require_admin(e);
        Self::check_open_listing(e, price, expires_at);

        let listing = PrimaryListing {
            price,
            expires_at,
            payment_asset: config.payment_asset,
        };
        let listing_id = storage::take_next_listing_id(e);
        storage::set_primary_listing(e, listing_id, &listing);
        PrimaryListingCreated {
            listing_id,
            price,
            expires_at,
            payment_asset: listing.payment_asset,
        }
        .publish(e);
        listing_id
    }

    /// Buy a primary listing: pays the treasury, mints one token to `buyer`.
    /// Rejects (`PriceAboveMax`) if the listing price exceeds `max_price`.
    pub fn buy_primary(e: &Env, listing_id: u64, buyer: Address, max_price: i128) -> u32 {
        common::ttl::extend_instance(e);
        let config = Self::get_config(e);
        if config.paused {
            panic_with_error!(e, MarketplaceError::Paused);
        }
        buyer.require_auth();
        let listing = Self::load_primary(e, listing_id);
        if e.ledger().timestamp() >= listing.expires_at {
            panic_with_error!(e, MarketplaceError::ListingExpired);
        }
        if listing.price > max_price {
            panic_with_error!(e, MarketplaceError::PriceAboveMax);
        }
        // Remove before any external call (single-use listing, no reentrancy window).
        storage::remove_primary_listing(e, listing_id);

        Self::payment_transfer(
            e,
            &listing.payment_asset,
            &buyer,
            &config.treasury,
            listing.price,
        );

        let this = e.current_contract_address();
        let mint_args = vec![e, this.into_val(e), buyer.clone().into_val(e)];
        Self::authorize(e, &config.token, "mint", mint_args, Vec::new(e));
        let token_id = NftClient::new(e, &config.token).mint(&this, &buyer);

        PrimaryListingPurchased {
            listing_id,
            buyer,
            token_id,
            price: listing.price,
            payment_asset: listing.payment_asset,
        }
        .publish(e);
        token_id
    }

    /// Treasury cancels an unsold primary listing (nothing is escrowed).
    pub fn cancel_primary(e: &Env, listing_id: u64) {
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        Self::require_admin(e);
        Self::load_primary(e, listing_id);
        storage::remove_primary_listing(e, listing_id);
        PrimaryListingCancelled { listing_id }.publish(e);
    }

    /// Anyone may clear an expired primary listing.
    pub fn expire_primary(e: &Env, listing_id: u64) {
        common::ttl::extend_instance(e);
        let listing = Self::load_primary(e, listing_id);
        if e.ledger().timestamp() < listing.expires_at {
            panic_with_error!(e, MarketplaceError::ListingActive);
        }
        storage::remove_primary_listing(e, listing_id);
        PrimaryListingExpired { listing_id }.publish(e);
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
        common::upgrade::version(e)
    }

    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    pub fn sync_version(e: &Env) {
        let (config, _) = Self::require_admin(e);
        common::upgrade::sync_version(e, &config.manager);
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

    fn load_listing(e: &Env, token_id: u32) -> Listing {
        storage::get_listing(e, token_id)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::ListingNotFound))
    }

    fn load_primary(e: &Env, listing_id: u64) -> PrimaryListing {
        storage::get_primary_listing(e, listing_id)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::ListingNotFound))
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
