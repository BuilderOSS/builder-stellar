use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, panic_with_error, vec, Address, BytesN, Env, IntoVal, String, Symbol,
    Val, Vec,
};

use crate::{
    error::MarketplaceError,
    events::{self, *},
    storage::{self, *},
};

#[contract]
pub struct MarketplaceContract;

#[contractimpl]
impl MarketplaceContract {
    pub fn __constructor(
        e: &Env,
        token: Address,
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
                current_hash,
                version: version.clone(),
                paused: true,
            },
        );
        MarketplaceInitialized {
            token,
            treasury,
            payment_asset,
            version,
        }
        .publish(e);
    }

    pub fn get_config(e: &Env) -> MarketplaceConfig {
        storage::get_config(e)
    }

    pub fn get_listing(e: &Env, token_id: u32) -> Option<Listing> {
        storage::get_listing(e, token_id)
    }

    pub fn finalize_ownership(e: &Env, new_treasury: Address) {
        let mut config = Self::get_config(e);
        config.manager.require_auth();
        config.treasury = new_treasury;
        storage::set_config(e, &config);
    }

    pub fn mint_and_list(e: &Env, price: i128, expires_at: u64) -> u32 {
        let config = Self::require_treasury(e);
        Self::check_open_listing(e, price, expires_at);

        let mint_args = vec![
            e,
            e.current_contract_address().into_val(e),
            e.current_contract_address().into_val(e),
        ];
        Self::authorize(e, &config.token, "mint", mint_args.clone(), Vec::new(e));
        let token_id: u32 = e.invoke_contract(&config.token, &Symbol::new(e, "mint"), mint_args);

        let listing = Listing {
            seller: config.treasury.clone(),
            price,
            expires_at,
            fee_bps: 0,
            kind: ListingKind::Primary,
        };
        storage::set_listing(e, token_id, &listing);
        events::emit_created(e, token_id, &listing);
        token_id
    }

    pub fn list(e: &Env, token_id: u32, seller: Address, price: i128, expires_at: u64) {
        let config = Self::get_config(e);
        Self::check_open_listing(e, price, expires_at);
        seller.require_auth();
        if storage::get_listing(e, token_id).is_some() {
            panic_with_error!(e, MarketplaceError::ListingExists);
        }

        let owner: Address = e.invoke_contract(
            &config.token,
            &Symbol::new(e, "owner_of"),
            vec![e, token_id.into_val(e)],
        );
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
            transfer_args.clone(),
            Vec::new(e),
        );
        e.invoke_contract::<()>(
            &config.token,
            &Symbol::new(e, "transfer_from"),
            transfer_args,
        );

        let listing = Listing {
            seller,
            price,
            expires_at,
            fee_bps: config.default_secondary_fee_bps,
            kind: ListingKind::Secondary,
        };
        storage::set_listing(e, token_id, &listing);
        events::emit_created(e, token_id, &listing);
    }

    pub fn buy(e: &Env, token_id: u32, buyer: Address) {
        let config = Self::get_config(e);
        if config.paused {
            panic_with_error!(e, MarketplaceError::Unauthorized);
        }
        buyer.require_auth();
        let listing = storage::get_listing(e, token_id)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::ListingNotFound));
        if e.ledger().timestamp() >= listing.expires_at {
            panic_with_error!(e, MarketplaceError::ListingExpired);
        }
        let fee = match &listing.kind {
            ListingKind::Primary => 0,
            ListingKind::Secondary => listing
                .price
                .checked_mul(listing.fee_bps as i128)
                .and_then(|value| value.checked_div(10_000))
                .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::ArithmeticOverflow)),
        };
        let seller_amount = listing
            .price
            .checked_sub(fee)
            .unwrap_or_else(|| panic_with_error!(e, MarketplaceError::ArithmeticOverflow));
        storage::remove_listing(e, token_id);

        let treasury_amount = if listing.kind == ListingKind::Primary {
            listing.price
        } else {
            fee
        };
        Self::payment_transfer(
            e,
            &config.payment_asset,
            &buyer,
            &config.treasury,
            treasury_amount,
        );
        if listing.kind == ListingKind::Secondary {
            Self::payment_transfer(
                e,
                &config.payment_asset,
                &buyer,
                &listing.seller,
                seller_amount,
            );
        }
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
            payment_asset: config.payment_asset,
        }
        .publish(e);
    }

    pub fn cancel(e: &Env, token_id: u32, seller: Address) {
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
        let listing = Self::load_listing(e, token_id);
        if e.ledger().timestamp() < listing.expires_at {
            panic_with_error!(e, MarketplaceError::ListingActive);
        }
        storage::remove_listing(e, token_id);
        let config = Self::get_config(e);
        let recipient = if listing.kind == ListingKind::Primary {
            config.treasury
        } else {
            listing.seller.clone()
        };
        Self::token_transfer(
            e,
            &config.token,
            &e.current_contract_address(),
            &recipient,
            token_id,
        );
        ListingExpired {
            token_id,
            seller: listing.seller,
        }
        .publish(e);
    }

    pub fn pause(e: &Env) {
        let mut config = Self::require_treasury(e);
        config.paused = true;
        storage::set_config(e, &config);
        MarketplacePaused {}.publish(e);
    }

    pub fn unpause(e: &Env) {
        let mut config = Self::require_treasury(e);
        config.paused = false;
        storage::set_config(e, &config);
        MarketplaceUnpaused {}.publish(e);
    }

    pub fn set_secondary_fee_bps(e: &Env, fee_bps: u32) {
        let mut config = Self::require_treasury(e);
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(e, MarketplaceError::InvalidFee);
        }
        config.default_secondary_fee_bps = fee_bps;
        storage::set_config(e, &config);
        SecondaryFeeUpdated { fee_bps }.publish(e);
    }

    pub fn set_payment_asset(e: &Env, payment_asset: Address) {
        let mut config = Self::require_treasury(e);
        config.payment_asset = payment_asset.clone();
        storage::set_config(e, &config);
        PaymentAssetUpdated { payment_asset }.publish(e);
    }

    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        let config = Self::require_treasury(e);
        if config.current_hash != from_hash {
            panic_with_error!(e, MarketplaceError::Unauthorized);
        }
        let approved: bool = e.invoke_contract(
            &config.manager,
            &Symbol::new(e, "is_upgrade_approved"),
            vec![
                e,
                from_hash.clone().into_val(e),
                to_hash.clone().into_val(e),
            ],
        );
        if !approved {
            panic_with_error!(e, MarketplaceError::Unauthorized);
        }
        let mut updated = config;
        updated.current_hash = to_hash.clone();
        storage::set_config(e, &updated);
        MarketplaceUpgraded {
            from_hash,
            to_hash: to_hash.clone(),
        }
        .publish(e);
        e.deployer().update_current_contract_wasm(to_hash);
    }

    fn require_treasury(e: &Env) -> MarketplaceConfig {
        let config = Self::get_config(e);
        config.treasury.require_auth();
        config
    }

    fn check_open_listing(e: &Env, price: i128, expires_at: u64) {
        if Self::get_config(e).paused {
            panic_with_error!(e, MarketplaceError::Unauthorized);
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
        Self::authorize(e, token, "transfer", args.clone(), Vec::new(e));
        e.invoke_contract::<()>(token, &Symbol::new(e, "transfer"), args);
    }

    fn payment_transfer(e: &Env, asset: &Address, from: &Address, to: &Address, amount: i128) {
        if amount == 0 {
            return;
        }
        let args = vec![e, from.into_val(e), to.into_val(e), amount.into_val(e)];
        Self::authorize(e, asset, "transfer", args.clone(), Vec::new(e));
        e.invoke_contract::<()>(asset, &Symbol::new(e, "transfer"), args);
    }
}
