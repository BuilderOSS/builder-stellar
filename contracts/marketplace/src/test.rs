#![cfg(test)]

extern crate std;

use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    xdr::ToXdr,
    Address, BytesN, Env, IntoVal, String, Val,
};

use crate::{
    contract::MarketplaceContract, error::MarketplaceError, storage::DataKey, MarketplaceConfig,
};

#[contract]
struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn initialize(e: &Env) {
        e.storage()
            .instance()
            .set(&soroban_sdk::symbol_short!("next"), &0u32);
    }

    pub fn set_fail_mint(e: &Env, fail: bool) {
        e.storage()
            .instance()
            .set(&soroban_sdk::symbol_short!("fail"), &fail);
    }

    pub fn mint(e: &Env, _minter: Address, to: Address) -> u32 {
        let fail: bool = e
            .storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("fail"))
            .unwrap_or(false);
        assert!(!fail, "mint failed");
        let id: u32 = e
            .storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("next"))
            .unwrap_or(0);
        e.storage()
            .instance()
            .set(&soroban_sdk::symbol_short!("next"), &(id + 1));
        e.storage().persistent().set(&id, &to);
        id
    }

    pub fn total_supply(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("next"))
            .unwrap_or(0)
    }

    pub fn minted(e: &Env) -> u32 {
        Self::total_supply(e)
    }

    pub fn owner_of(e: &Env, token_id: u32) -> Address {
        e.storage().persistent().get(&token_id).unwrap()
    }

    pub fn transfer(e: &Env, _from: Address, to: Address, token_id: u32) {
        e.storage().persistent().set(&token_id, &to);
    }

    pub fn transfer_from(e: &Env, _spender: Address, _from: Address, to: Address, token_id: u32) {
        e.storage().persistent().set(&token_id, &to);
    }

    /// Sequential ids, spending the minter's allowance like the real Token.
    pub fn batch_mint(
        e: &Env,
        minter: Address,
        recipients: soroban_sdk::Vec<Address>,
        amounts: soroban_sdk::Vec<u128>,
    ) -> soroban_sdk::Vec<u32> {
        let mut ids = soroban_sdk::Vec::new(e);
        for (to, amount) in recipients.iter().zip(amounts.iter()) {
            let allowance = Self::mint_allowance(e, minter.clone());
            assert!(u128::from(allowance) >= amount, "allowance exceeded");
            Self::set_mint_allowance(e, minter.clone(), allowance - amount as u32);
            for _ in 0..amount {
                ids.push_back(Self::mint(e, minter.clone(), to.clone()));
            }
        }
        ids
    }

    pub fn set_mint_allowance(e: &Env, module: Address, allowance: u32) {
        e.storage()
            .instance()
            .set(&(symbol_short!("allow"), module), &allowance);
    }

    pub fn mint_allowance(e: &Env, module: Address) -> u32 {
        e.storage()
            .instance()
            .get(&(symbol_short!("allow"), module))
            .unwrap_or(0)
    }

    pub fn release_mint_allowance(e: &Env, module: Address, amount: u32) {
        module.require_auth();
        let allowance = Self::mint_allowance(e, module.clone());
        Self::set_mint_allowance(e, module, allowance.saturating_sub(amount));
    }
}

#[contract]
struct MockPayment;

#[contractimpl]
impl MockPayment {
    pub fn mint(e: &Env, to: Address, amount: i128) {
        let balance = Self::balance(e, to.clone());
        e.storage().persistent().set(&to, &(balance + amount));
    }

    pub fn balance(e: &Env, account: Address) -> i128 {
        e.storage().persistent().get(&account).unwrap_or(0)
    }

    pub fn transfer(e: &Env, from: Address, to: Address, amount: i128) {
        let from_balance = Self::balance(e, from.clone());
        assert!(from_balance >= amount);
        let to_balance = Self::balance(e, to.clone());
        e.storage()
            .persistent()
            .set(&from, &(from_balance - amount));
        e.storage().persistent().set(&to, &(to_balance + amount));
    }
}

struct Fixture {
    env: Env,
    marketplace: crate::contract::MarketplaceContractClient<'static>,
    token: MockTokenClient<'static>,
    payment: MockPaymentClient<'static>,
    treasury: Address,
    launch_admin: Address,
    seller: Address,
    buyer: Address,
}

/// Fully launched (live, open) marketplace.
fn fixture() -> Fixture {
    let fixture = fixture_setup();
    fixture.marketplace.launch(&fixture.treasury, &true);
    fixture
}

/// Marketplace still in the setup phase (paused, gated by `launch_admin`).
fn fixture_setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);
    let treasury = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let manager = Address::generate(&env);
    let launch_admin = Address::generate(&env);
    let token_id = env.register(MockToken, ());
    let token = MockTokenClient::new(&env, &token_id);
    token.initialize();
    let payment_id = env.register(MockPayment, ());
    let payment = MockPaymentClient::new(&env, &payment_id);
    let marketplace_id = env.register(
        MarketplaceContract,
        (
            token_id,
            launch_admin.clone(),
            treasury.clone(),
            payment_id,
            manager,
            BytesN::from_array(&env, &[0; 32]),
            250u32,
        ),
    );
    let marketplace = crate::contract::MarketplaceContractClient::new(&env, &marketplace_id);
    Fixture {
        env,
        marketplace,
        token,
        payment,
        treasury,
        launch_admin,
        seller,
        buyer,
    }
}

#[test]
fn constructor_starts_paused_and_stores_config() {
    let env = Env::default();
    let token = Address::generate(&env);
    let treasury = Address::generate(&env);
    let payment = Address::generate(&env);
    let manager = Address::generate(&env);
    let launch_admin = Address::generate(&env);
    let address = env.register(
        MarketplaceContract,
        (
            token.clone(),
            launch_admin.clone(),
            treasury.clone(),
            payment.clone(),
            manager.clone(),
            BytesN::from_array(&env, &[0; 32]),
            250u32,
        ),
    );
    let config: MarketplaceConfig = env.invoke_contract(
        &address,
        &soroban_sdk::Symbol::new(&env, "get_config"),
        soroban_sdk::Vec::new(&env),
    );
    assert_eq!(config.token, token);
    assert_eq!(config.treasury, treasury);
    assert_eq!(config.payment_asset, payment);
    assert_eq!(config.manager, manager);
    assert!(config.paused);
    let marketplace = crate::contract::MarketplaceContractClient::new(&env, &address);
    assert_eq!(marketplace.admin(), launch_admin);
    assert_eq!(
        marketplace.wasm_hash(),
        BytesN::from_array(&env, &[0u8; 32])
    );
}

#[test]
fn launch_opens_marketplace_and_is_one_shot() {
    let fixture = fixture_setup();
    assert!(fixture.marketplace.get_config().paused);

    fixture.marketplace.launch(&fixture.treasury, &true);
    assert!(!fixture.marketplace.get_config().paused);

    let r = fixture.marketplace.try_launch(&fixture.treasury, &true);
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::AlreadyLive.into()
    );
}

#[test]
fn launch_without_open_keeps_marketplace_paused() {
    let fixture = fixture_setup();
    fixture.marketplace.launch(&fixture.treasury, &false);
    assert!(fixture.marketplace.get_config().paused);
}

#[test]
fn launch_rejects_treasury_other_than_wired() {
    let fixture = fixture_setup();
    let other = Address::generate(&fixture.env);
    let r = fixture.marketplace.try_launch(&other, &true);
    assert_eq!(
        r.err().unwrap().unwrap(),
        MarketplaceError::TreasuryMismatch.into()
    );
}

#[test]
fn secondary_list_and_buy_before_launch_are_not_live() {
    let fixture = fixture_setup();
    let seller = Address::generate(&fixture.env);
    let r = fixture.marketplace.try_list(
        &0,
        &seller,
        &100,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::NotLive.into()
    );
    let r = fixture.marketplace.try_buy(&0, &seller, &i128::MAX);
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::NotLive.into()
    );
}

#[test]
fn setters_are_gated_by_launch_admin_then_treasury() {
    let fixture = fixture_setup();
    let env = &fixture.env;
    let mp = &fixture.marketplace;

    // Setup: only launch_admin authorizes; the treasury cannot.
    env.mock_auths(&[MockAuth {
        address: &fixture.treasury,
        invoke: &MockAuthInvoke {
            contract: &mp.address,
            fn_name: "set_secondary_fee_bps",
            args: (500u32,).into_val(env),
            sub_invokes: &[],
        },
    }]);
    assert!(mp.try_set_secondary_fee_bps(&500).is_err());
    env.mock_auths(&[MockAuth {
        address: &fixture.launch_admin,
        invoke: &MockAuthInvoke {
            contract: &mp.address,
            fn_name: "set_secondary_fee_bps",
            args: (500u32,).into_val(env),
            sub_invokes: &[],
        },
    }]);
    mp.set_secondary_fee_bps(&500);
    assert_eq!(mp.get_config().default_secondary_fee_bps, 500);

    // Live: the treasury authorizes; launch_admin no longer can.
    env.mock_all_auths();
    mp.launch(&fixture.treasury, &true);
    env.mock_auths(&[MockAuth {
        address: &fixture.launch_admin,
        invoke: &MockAuthInvoke {
            contract: &mp.address,
            fn_name: "set_secondary_fee_bps",
            args: (600u32,).into_val(env),
            sub_invokes: &[],
        },
    }]);
    assert!(mp.try_set_secondary_fee_bps(&600).is_err());
    env.mock_auths(&[MockAuth {
        address: &fixture.treasury,
        invoke: &MockAuthInvoke {
            contract: &mp.address,
            fn_name: "set_secondary_fee_bps",
            args: (600u32,).into_val(env),
            sub_invokes: &[],
        },
    }]);
    mp.set_secondary_fee_bps(&600);
    assert_eq!(mp.get_config().default_secondary_fee_bps, 600);
}

#[test]
fn buy_is_rejected_while_paused_with_paused_error() {
    let fixture = fixture();
    let mp = &fixture.marketplace;
    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    mp.list(
        &token_id,
        &fixture.seller,
        &100,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );
    mp.pause();
    fixture.payment.mint(&fixture.buyer, &100);
    assert_eq!(
        mp.try_buy(&token_id, &fixture.buyer, &i128::MAX)
            .err()
            .unwrap()
            .unwrap(),
        MarketplaceError::Paused.into()
    );
}

#[test]
fn cancel_and_expire_work_while_paused() {
    let fixture = fixture();
    let mp = &fixture.marketplace;
    let t1 = fixture.token.mint(&fixture.seller, &fixture.seller);
    let t2 = fixture.token.mint(&fixture.seller, &fixture.seller);
    mp.list(
        &t1,
        &fixture.seller,
        &100,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );
    mp.list(
        &t2,
        &fixture.seller,
        &100,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );
    mp.pause();

    mp.cancel(&t1, &fixture.seller);
    assert_eq!(fixture.token.owner_of(&t1), fixture.seller);
    fixture.env.ledger().set_timestamp(2_000);
    mp.expire(&t2);
    assert_eq!(fixture.token.owner_of(&t2), fixture.seller);
}

#[test]
fn secondary_expiry_boundary_is_exclusive_for_buy_inclusive_for_expire() {
    let fixture = fixture();
    let mp = &fixture.marketplace;
    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    mp.list(
        &token_id,
        &fixture.seller,
        &100,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );
    fixture.payment.mint(&fixture.buyer, &100);

    fixture.env.ledger().set_timestamp(1_999);
    assert_eq!(
        mp.try_expire(&token_id).err().unwrap().unwrap(),
        MarketplaceError::ListingActive.into()
    );
    fixture.env.ledger().set_timestamp(2_000);
    assert_eq!(
        mp.try_buy(&token_id, &fixture.buyer, &i128::MAX)
            .err()
            .unwrap()
            .unwrap(),
        MarketplaceError::ListingExpired.into()
    );
    mp.expire(&token_id);
    assert_eq!(fixture.token.owner_of(&token_id), fixture.seller);
}

#[test]
fn secondary_buy_uses_captured_asset_and_fee_after_config_changes() {
    let fixture = fixture();
    let mp = &fixture.marketplace;
    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    mp.list(
        &token_id,
        &fixture.seller,
        &1_000,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    ); // fee 250 bps captured
    let other = fixture.env.register(MockPayment, ());

    mp.set_payment_asset(&other);
    mp.set_secondary_fee_bps(&1_000);

    fixture.payment.mint(&fixture.buyer, &1_000);
    mp.buy(&token_id, &fixture.buyer, &i128::MAX);
    assert_eq!(fixture.payment.balance(&fixture.treasury), 25);
    assert_eq!(fixture.payment.balance(&fixture.seller), 975);
    assert_eq!(
        MockPaymentClient::new(&fixture.env, &other).balance(&fixture.treasury),
        0
    );
}

#[test]
fn listing_keeps_payment_asset_captured_at_list_time() {
    let fixture = fixture();
    let mp = &fixture.marketplace;
    let new_asset_id = fixture.env.register(MockPayment, ());
    let new_asset = MockPaymentClient::new(&fixture.env, &new_asset_id);

    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    mp.list(
        &token_id,
        &fixture.seller,
        &1_000,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );
    assert_eq!(
        mp.get_listing(&token_id).unwrap().payment_asset,
        fixture.payment.address
    );

    mp.set_payment_asset(&new_asset_id);

    // Buyer holds only the OLD asset; the listing still settles in it.
    fixture.payment.mint(&fixture.buyer, &1_000);
    mp.buy(&token_id, &fixture.buyer, &i128::MAX);
    assert_eq!(fixture.payment.balance(&fixture.buyer), 0);
    assert_eq!(fixture.payment.balance(&fixture.treasury), 25);
    assert_eq!(fixture.payment.balance(&fixture.seller), 975);
    assert_eq!(new_asset.balance(&fixture.treasury), 0);

    // New listings use the new asset.
    let token2 = fixture.token.mint(&fixture.seller, &fixture.seller);
    mp.list(
        &token2,
        &fixture.seller,
        &10,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );
    assert_eq!(mp.get_listing(&token2).unwrap().payment_asset, new_asset_id);
}

#[test]
fn secondary_listing_splits_fee_and_proceeds() {
    let fixture = fixture();
    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    fixture.marketplace.list(
        &token_id,
        &fixture.seller,
        &1_000,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );
    fixture.payment.mint(&fixture.buyer, &1_000);

    fixture
        .marketplace
        .buy(&token_id, &fixture.buyer, &i128::MAX);

    assert_eq!(fixture.token.owner_of(&token_id), fixture.buyer);
    assert_eq!(fixture.payment.balance(&fixture.treasury), 25);
    assert_eq!(fixture.payment.balance(&fixture.seller), 975);
}

#[test]
fn seller_can_cancel_listing_and_reclaim_token() {
    let fixture = fixture();
    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    fixture.marketplace.list(
        &token_id,
        &fixture.seller,
        &100,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );

    fixture.marketplace.cancel(&token_id, &fixture.seller);

    assert_eq!(fixture.token.owner_of(&token_id), fixture.seller);
    assert!(fixture.marketplace.get_listing(&token_id).is_none());
}

#[test]
fn expired_listing_can_be_reclaimed() {
    let fixture = fixture();
    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    fixture.marketplace.list(
        &token_id,
        &fixture.seller,
        &100,
        &2_000,
        &crate::storage::MAX_FEE_BPS,
        &fixture.marketplace.get_config().payment_asset,
    );
    fixture.env.ledger().set_timestamp(2_000);

    fixture.marketplace.expire(&token_id);

    assert_eq!(fixture.token.owner_of(&token_id), fixture.seller);
    assert!(fixture.marketplace.get_listing(&token_id).is_none());
}

mod upgrade_via_common {
    use super::*;
    use common::testutils::{empty_wasm, MockManager, MockManagerClient};

    #[test]
    fn upgrade_goes_through_common_apply() {
        let env = Env::default();
        env.mock_all_auths();
        let mgr = MockManagerClient::new(&env, &env.register(MockManager, ()));
        let from = BytesN::from_array(&env, &[1u8; 32]);
        let to = empty_wasm(&env);
        let id = env.register(
            MarketplaceContract,
            (
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                mgr.address.clone(),
                from.clone(),
                250u32,
            ),
        );
        let client = crate::contract::MarketplaceContractClient::new(&env, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&env, "0.2.0"));
        client.upgrade(&from, &to);

        // Contract code is swapped to an empty module; read the stored keys directly.
        env.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&env), to);
            assert_eq!(
                common::upgrade::version(&env, &mgr.address),
                String::from_str(&env, "0.2.0")
            );
        });
    }

    #[test]
    fn upgrade_rejected_when_not_approved() {
        let env = Env::default();
        env.mock_all_auths();
        let mgr = MockManagerClient::new(&env, &env.register(MockManager, ()));
        let from = BytesN::from_array(&env, &[1u8; 32]);
        let to = empty_wasm(&env);
        let id = env.register(
            MarketplaceContract,
            (
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                mgr.address.clone(),
                from.clone(),
                250u32,
            ),
        );
        let client = crate::contract::MarketplaceContractClient::new(&env, &id);
        mgr.register(&to, &String::from_str(&env, "0.2.0"));
        let r = client.try_upgrade(&from, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::UpgradeNotApproved.into()
        );
    }

    #[test]
    fn upgrade_rejects_unauthorized_caller() {
        let env = Env::default();
        env.mock_all_auths();
        let mgr = MockManagerClient::new(&env, &env.register(MockManager, ()));
        let from = BytesN::from_array(&env, &[1u8; 32]);
        let to = empty_wasm(&env);
        let id = env.register(
            MarketplaceContract,
            (
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                mgr.address.clone(),
                from.clone(),
                250u32,
            ),
        );
        let client = crate::contract::MarketplaceContractClient::new(&env, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&env, "0.2.0"));
        mgr.register(&from, &String::from_str(&env, "0.1.1"));
        // The module's own version() reads its Manager (D6).
        assert_eq!(client.version(), String::from_str(&env, "0.1.1"));
        // Drop mock_all_auths: no authorization is provided for any address.
        env.set_auths(&[]);
        assert!(client.try_upgrade(&from, &to).is_err());
        env.mock_all_auths();
        env.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&env), from);
            assert_eq!(
                common::upgrade::version(&env, &mgr.address),
                String::from_str(&env, "0.1.1")
            );
        });
    }

    #[test]
    fn upgrade_hash_mismatch_leaves_state_unchanged() {
        let env = Env::default();
        env.mock_all_auths();
        let mgr = MockManagerClient::new(&env, &env.register(MockManager, ()));
        let from = BytesN::from_array(&env, &[1u8; 32]);
        let to = empty_wasm(&env);
        let id = env.register(
            MarketplaceContract,
            (
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                mgr.address.clone(),
                from.clone(),
                250u32,
            ),
        );
        let client = crate::contract::MarketplaceContractClient::new(&env, &id);
        mgr.register(&from, &String::from_str(&env, "0.1.0"));
        let wrong = BytesN::from_array(&env, &[9u8; 32]);
        mgr.approve(&wrong, &to);
        mgr.register(&to, &String::from_str(&env, "0.2.0"));
        let r = client.try_upgrade(&wrong, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::HashMismatch.into()
        );
        env.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&env), from);
            assert_eq!(
                common::upgrade::version(&env, &mgr.address),
                String::from_str(&env, "0.1.0")
            );
        });
    }
}

#[test]
fn payment_asset_reports_the_configured_asset() {
    // The Manager compares this with the asset recorded at create_dao.
    let fixture = fixture_setup();
    let mp = &fixture.marketplace;
    assert_eq!(mp.payment_asset(), fixture.payment.address);
    let other = Address::generate(&fixture.env);
    mp.set_payment_asset(&other);
    assert_eq!(mp.payment_asset(), other);
}

#[test]
fn handoff_moves_the_admin_and_freezes_setup_setters() {
    let fixture = fixture_setup();
    let env = &fixture.env;
    let mp = &fixture.marketplace;
    assert_eq!(mp.admin(), fixture.launch_admin);
    mp.handoff(&fixture.treasury);
    assert_eq!(mp.admin(), fixture.treasury);
    // The launch admin's setter now needs the Treasury, which cannot act
    // before launch.
    env.mock_auths(&[MockAuth {
        address: &fixture.launch_admin,
        invoke: &MockAuthInvoke {
            contract: &mp.address,
            fn_name: "set_secondary_fee_bps",
            args: (100u32,).into_val(env),
            sub_invokes: &[],
        },
    }]);
    assert!(mp.try_set_secondary_fee_bps(&100).is_err());
    env.mock_all_auths();
    assert_eq!(
        mp.try_handoff(&Address::generate(env))
            .err()
            .unwrap()
            .unwrap(),
        MarketplaceError::TreasuryMismatch.into()
    );
    mp.launch(&fixture.treasury, &true);
    assert_eq!(mp.admin(), fixture.treasury);
    assert_eq!(
        mp.try_handoff(&fixture.treasury).err().unwrap().unwrap(),
        common::CommonError::AlreadyLive.into()
    );
}

#[test]
fn renewal_keys_pages_listings_then_open_pools() {
    let fixture = fixture();
    let env = &fixture.env;
    let mp = &fixture.marketplace;
    fixture.token.mint(&fixture.treasury, &fixture.seller);
    fixture.token.mint(&fixture.treasury, &fixture.seller);
    let pool = pools::open(&fixture, 70);
    mp.restock(&pool);
    mp.restock(&pool); // 42 + 28 ids: two pages
                       // Compare encoded keys: a `Val` holding a vector is an object handle.
    let encoded = |keys: soroban_sdk::Vec<(Val, bool)>| {
        let mut vals: soroban_sdk::Vec<Val> = soroban_sdk::Vec::new(env);
        for (key, persistent) in keys.iter() {
            assert!(persistent);
            vals.push_back(key);
        }
        vals.to_xdr(env)
    };
    let expect = |ks: &[DataKey]| {
        let mut vals: soroban_sdk::Vec<Val> = soroban_sdk::Vec::new(env);
        for k in ks {
            vals.push_back(common::ns(env, k.clone()).into_val(env));
        }
        vals.to_xdr(env)
    };
    let minted = fixture.token.total_supply();
    assert_eq!(minted, 72);
    let first = mp.renewal_keys(&0, &2);
    assert_eq!(first.next_cursor, Some(2));
    assert_eq!(
        encoded(first.keys.clone()),
        expect(&[DataKey::Listing(0), DataKey::Listing(1)])
    );
    assert_eq!(
        first.assets,
        soroban_sdk::vec![
            env,
            fixture.token.address.clone(),
            fixture.payment.address.clone()
        ]
    );
    // The pool's entry and its two pages follow the listing slots.
    let last = mp.renewal_keys(&minted, &50);
    assert_eq!(last.next_cursor, None);
    assert_eq!(
        encoded(last.keys.clone()),
        expect(&[
            DataKey::Pool(pool),
            DataKey::PoolStock(pool, 0),
            DataKey::PoolStock(pool, 1)
        ])
    );
}

/// docs/designs/membership-models.md §4: quick-buy pools.
mod pools {
    use super::*;

    pub const PRICE: i128 = 50;
    pub const EXPIRES: u64 = 100_000;

    /// Fund the Marketplace with `size` and open a pool of that size
    /// (2 per buyer, 3 sales per hour).
    pub fn open(fixture: &Fixture, size: u32) -> u32 {
        let mp = &fixture.marketplace;
        let held = fixture.token.mint_allowance(&mp.address);
        fixture
            .token
            .set_mint_allowance(&mp.address, &(held + size));
        mp.open_pool(
            &PRICE,
            &fixture.payment.address,
            &EXPIRES,
            &size,
            &2,
            &3,
            &3_600,
        )
    }

    fn stocked(fixture: &Fixture, pool: u32) -> std::vec::Vec<u32> {
        let mut all = std::vec::Vec::new();
        for page in 0..4 {
            all.extend(fixture.marketplace.pool_stock(&pool, &page).iter());
        }
        all
    }

    #[test]
    fn a_pool_stocks_in_chunks_and_pages_of_64() {
        let fixture = fixture();
        let mp = &fixture.marketplace;
        let pool = open(&fixture, 100);
        assert_eq!(mp.restock(&pool), common::MAX_RESTOCK);
        assert_eq!(mp.restock(&pool), common::MAX_RESTOCK);
        assert_eq!(mp.restock(&pool), 100 - 2 * common::MAX_RESTOCK);
        assert_eq!(
            mp.try_restock(&pool).err().unwrap().unwrap(),
            MarketplaceError::PoolFullyStocked.into()
        );
        // 100 ids in two pages (64 + 36), all held here.
        assert_eq!(mp.pool_stock(&pool, &0).len(), 64);
        assert_eq!(mp.pool_stock(&pool, &1).len(), 36);
        assert_eq!(mp.open_pools().get(0).unwrap().pages, 2);
        for id in stocked(&fixture, pool) {
            assert_eq!(fixture.token.owner_of(&id), mp.address);
        }
        assert_eq!(mp.get_pool(&pool).unwrap().stocked, 100);
        assert_eq!(fixture.token.mint_allowance(&mp.address), 0);
    }

    #[test]
    fn a_buyer_picks_an_id_pays_the_treasury_and_hits_the_caps() {
        let fixture = fixture();
        let env = &fixture.env;
        let mp = &fixture.marketplace;
        let pool = open(&fixture, 10);
        mp.restock(&pool);
        let ids = stocked(&fixture, pool);
        let buyer = &fixture.buyer;
        fixture.payment.mint(buyer, &1_000);
        assert_eq!(
            mp.try_buy_from_pool(&pool, &0, &ids[3], buyer, &(PRICE - 1))
                .err()
                .unwrap()
                .unwrap(),
            MarketplaceError::PriceAboveMax.into()
        );
        mp.buy_from_pool(&pool, &0, &ids[3], buyer, &PRICE);
        assert_eq!(fixture.token.owner_of(&ids[3]), *buyer);
        assert_eq!(fixture.payment.balance(&fixture.treasury), PRICE);
        // Already sold.
        assert_eq!(
            mp.try_buy_from_pool(&pool, &0, &ids[3], buyer, &PRICE)
                .err()
                .unwrap()
                .unwrap(),
            MarketplaceError::NotInPool.into()
        );
        mp.buy_from_pool(&pool, &0, &ids[4], buyer, &PRICE);
        // max_per_buyer = 2.
        assert_eq!(
            mp.try_buy_from_pool(&pool, &0, &ids[5], buyer, &PRICE)
                .err()
                .unwrap()
                .unwrap(),
            MarketplaceError::BuyerLimitReached.into()
        );
        assert_eq!(mp.pool_purchases(&pool, buyer), 2);
        // max_sold_per_period = 3: one more buyer fills the hour.
        let other = Address::generate(env);
        fixture.payment.mint(&other, &1_000);
        mp.buy_from_pool(&pool, &0, &ids[5], &other, &PRICE);
        let third = Address::generate(env);
        fixture.payment.mint(&third, &1_000);
        assert_eq!(
            mp.try_buy_from_pool(&pool, &0, &ids[6], &third, &PRICE)
                .err()
                .unwrap()
                .unwrap(),
            MarketplaceError::PoolRateLimited.into()
        );
        // The next period opens again.
        env.ledger().set_timestamp(1_000 + 3_600);
        mp.buy_from_pool(&pool, &0, &ids[6], &third, &PRICE);
        assert_eq!(mp.get_pool(&pool).unwrap().sold, 4);
    }

    #[test]
    fn pools_reserve_their_own_share_of_the_allowance() {
        // Review 2 B1 / D5: two pools on one allowance.
        let fixture = fixture();
        let mp = &fixture.marketplace;
        fixture.token.set_mint_allowance(&mp.address, &60);
        let a = mp.open_pool(
            &PRICE,
            &fixture.payment.address,
            &EXPIRES,
            &40,
            &2,
            &3,
            &3_600,
        );
        // Only 20 unreserved: a 21-token pool does not fit.
        assert_eq!(
            mp.try_open_pool(
                &PRICE,
                &fixture.payment.address,
                &EXPIRES,
                &21,
                &2,
                &3,
                &3_600
            )
            .err()
            .unwrap()
            .unwrap(),
            MarketplaceError::AllowanceNotReserved.into()
        );
        let b = mp.open_pool(
            &PRICE,
            &fixture.payment.address,
            &EXPIRES,
            &20,
            &2,
            &3,
            &3_600,
        );
        mp.restock(&a);
        // Closing the first gives back only its own unstocked rest...
        mp.close_pool(&a);
        assert_eq!(fixture.token.mint_allowance(&mp.address), 20);
        // ...so the second still stocks its full size.
        assert_eq!(mp.restock(&b), 20);
        assert_eq!(mp.get_pool(&b).unwrap().stocked, 20);
    }

    #[test]
    fn closing_stops_sales_and_sweeping_returns_unsold_stock() {
        let fixture = fixture();
        let env = &fixture.env;
        let mp = &fixture.marketplace;
        let pool = open(&fixture, 60);
        mp.restock(&pool); // 42 stocked, 18 unstocked
        let ids = stocked(&fixture, pool);
        fixture.payment.mint(&fixture.buyer, &1_000);
        mp.buy_from_pool(&pool, &0, &ids[0], &fixture.buyer, &PRICE);
        assert_eq!(
            mp.try_sweep_pool(&pool).err().unwrap().unwrap(),
            MarketplaceError::PoolOpen.into()
        );
        // Before expiry only the Treasury closes it.
        env.mock_auths(&[]);
        assert!(mp.try_close_pool(&pool).is_err());
        env.mock_all_auths();
        mp.close_pool(&pool);
        assert_eq!(fixture.token.mint_allowance(&mp.address), 0);
        assert_eq!(
            mp.try_buy_from_pool(&pool, &0, &ids[1], &fixture.buyer, &PRICE)
                .err()
                .unwrap()
                .unwrap(),
            MarketplaceError::PoolClosed.into()
        );
        assert_eq!(
            mp.try_restock(&pool).err().unwrap().unwrap(),
            MarketplaceError::PoolClosed.into()
        );
        // 41 unsold: two sweeps of at most MAX_SWEEP.
        assert_eq!(mp.sweep_pool(&pool), 1);
        assert_eq!(mp.sweep_pool(&pool), 0);
        for id in &ids[1..] {
            assert_eq!(fixture.token.owner_of(id), fixture.treasury);
        }
        assert_eq!(fixture.token.owner_of(&ids[0]), fixture.buyer);
        assert!(mp.open_pools().is_empty());
        assert_eq!(mp.sweep_pool(&pool), 0);
    }

    #[test]
    fn anyone_closes_an_expired_pool_and_restock_stops_at_expiry() {
        let fixture = fixture();
        let env = &fixture.env;
        let mp = &fixture.marketplace;
        let pool = open(&fixture, 10);
        env.ledger().set_timestamp(EXPIRES);
        assert_eq!(
            mp.try_restock(&pool).err().unwrap().unwrap(),
            MarketplaceError::PoolClosed.into()
        );
        env.mock_auths(&[]);
        mp.close_pool(&pool);
        env.mock_all_auths();
        // Nothing was stocked: the whole reservation is given back (no
        // allowance is left behind) and the slot is freed at once.
        assert_eq!(fixture.token.mint_allowance(&mp.address), 0);
        assert!(mp.open_pools().is_empty());
        assert_eq!(
            mp.try_close_pool(&pool).err().unwrap().unwrap(),
            MarketplaceError::PoolClosed.into()
        );
    }

    #[test]
    fn open_pool_is_the_treasurys_and_validates_its_terms() {
        let fixture = fixture();
        let env = &fixture.env;
        let mp = &fixture.marketplace;
        fixture.token.set_mint_allowance(&mp.address, &1_000);
        let asset = fixture.payment.address.clone();
        let err = |price: i128, expires: u64, size: u32, cap: u32, rate: u32, period: u64| {
            mp.try_open_pool(&price, &asset, &expires, &size, &cap, &rate, &period)
                .err()
                .unwrap()
                .unwrap()
        };
        assert_eq!(
            err(0, EXPIRES, 5, 1, 1, 60),
            MarketplaceError::InvalidPrice.into()
        );
        assert_eq!(
            err(PRICE, 1_000, 5, 1, 1, 60),
            MarketplaceError::InvalidExpiry.into()
        );
        for (size, cap, rate, period) in [(0, 1, 1, 60), (5, 0, 1, 60), (5, 1, 0, 60), (5, 1, 1, 0)]
        {
            assert_eq!(
                err(PRICE, EXPIRES, size, cap, rate, period),
                MarketplaceError::InvalidPool.into()
            );
        }
        for _ in 0..crate::MAX_OPEN_POOLS {
            mp.open_pool(&PRICE, &asset, &EXPIRES, &1, &1, &1, &60);
        }
        assert_eq!(
            err(PRICE, EXPIRES, 1, 1, 1, 60),
            MarketplaceError::TooManyPools.into()
        );
        let stranger = Address::generate(env);
        env.mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &mp.address,
                fn_name: "open_pool",
                args: (PRICE, asset.clone(), EXPIRES, 1u32, 1u32, 1u32, 60u64).into_val(env),
                sub_invokes: &[],
            },
        }]);
        assert!(mp
            .try_open_pool(&PRICE, &asset, &EXPIRES, &1, &1, &1, &60)
            .is_err());
    }

    #[test]
    fn pools_are_live_only_and_pause_stops_sales() {
        let setup = fixture_setup();
        assert_eq!(
            setup
                .marketplace
                .try_open_pool(&PRICE, &setup.payment.address, &EXPIRES, &1, &1, &1, &60)
                .err()
                .unwrap()
                .unwrap(),
            common::CommonError::NotLive.into()
        );
        let fixture = fixture();
        let mp = &fixture.marketplace;
        let pool = open(&fixture, 5);
        mp.restock(&pool);
        let ids = stocked(&fixture, pool);
        mp.pause();
        fixture.payment.mint(&fixture.buyer, &1_000);
        assert_eq!(
            mp.try_buy_from_pool(&pool, &0, &ids[0], &fixture.buyer, &PRICE)
                .err()
                .unwrap()
                .unwrap(),
            MarketplaceError::Paused.into()
        );
    }

    /// The indexer reads these shapes (docs/designs/membership-models.md §7).
    #[test]
    fn pool_lifecycle_events() {
        use crate::events::{PoolClosed, PoolOpened, PoolPurchased, PoolRestocked, PoolSwept};
        use soroban_sdk::{testutils::Events as _, Event as _};
        let fixture = fixture();
        let env = &fixture.env;
        let mp = &fixture.marketplace;
        let last = || env.events().all().events().last().unwrap().clone();
        let pool = open(&fixture, 3);
        assert_eq!(
            last(),
            PoolOpened {
                pool_id: pool,
                price: PRICE,
                asset: fixture.payment.address.clone(),
                expires_at: EXPIRES,
                size: 3,
                max_per_buyer: 2,
                max_sold_per_period: 3,
                period_secs: 3_600,
            }
            .to_xdr(env, &mp.address)
        );
        mp.restock(&pool);
        assert_eq!(
            last(),
            PoolRestocked {
                pool_id: pool,
                first_token_id: 0,
                count: 3,
                stocked: 3,
            }
            .to_xdr(env, &mp.address)
        );
        fixture.payment.mint(&fixture.buyer, &1_000);
        mp.buy_from_pool(&pool, &0, &1, &fixture.buyer, &PRICE);
        assert_eq!(
            last(),
            PoolPurchased {
                pool_id: pool,
                buyer: fixture.buyer.clone(),
                token_id: 1,
                price: PRICE,
                asset: fixture.payment.address.clone(),
            }
            .to_xdr(env, &mp.address)
        );
        mp.close_pool(&pool);
        assert_eq!(
            last(),
            PoolClosed {
                pool_id: pool,
                released: 0,
            }
            .to_xdr(env, &mp.address)
        );
        assert_eq!(mp.sweep_pool(&pool), 0);
        assert_eq!(
            last(),
            PoolSwept {
                pool_id: pool,
                count: 2,
                pages_left: 0,
            }
            .to_xdr(env, &mp.address)
        );
    }

    #[test]
    fn buying_needs_the_buyer() {
        let fixture = fixture();
        let env = &fixture.env;
        let mp = &fixture.marketplace;
        let pool = open(&fixture, 5);
        mp.restock(&pool);
        let id = stocked(&fixture, pool)[0];
        fixture.payment.mint(&fixture.buyer, &1_000);
        let stranger = Address::generate(env);
        env.mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &mp.address,
                fn_name: "buy_from_pool",
                args: (pool, 0u32, id, fixture.buyer.clone(), PRICE).into_val(env),
                sub_invokes: &[],
            },
        }]);
        assert!(mp
            .try_buy_from_pool(&pool, &0, &id, &fixture.buyer, &PRICE)
            .is_err());
        assert_eq!(fixture.token.owner_of(&id), mp.address);
    }
}

#[test]
fn launch_without_open_forces_paused_even_if_unpaused_in_setup() {
    let fixture = fixture_setup();
    let mp = &fixture.marketplace;
    mp.unpause();
    assert!(!mp.get_config().paused);
    mp.launch(&fixture.treasury, &false);
    assert!(mp.get_config().paused);
}

#[test]
fn launch_requires_manager_auth() {
    let fixture = fixture_setup();
    let env = &fixture.env;
    let mp = &fixture.marketplace;
    env.mock_auths(&[MockAuth {
        address: &fixture.launch_admin,
        invoke: &MockAuthInvoke {
            contract: &mp.address,
            fn_name: "launch",
            args: (&fixture.treasury, true).into_val(env),
            sub_invokes: &[],
        },
    }]);
    assert!(mp.try_launch(&fixture.treasury, &true).is_err());
    assert!(mp.get_config().paused);
}

#[test]
fn state_changing_entrypoint_extends_instance_ttl() {
    use common::testutils::{advance_ledgers, instance_ttl};
    let f = fixture();
    advance_ledgers(&f.env, 120 * 17_280);
    let before = instance_ttl(&f.env, &f.marketplace.address);
    f.marketplace.pause();
    let after = instance_ttl(&f.env, &f.marketplace.address);
    assert!(
        after > before,
        "instance TTL not extended: {before} -> {after}"
    );
}

mod bounds {
    use super::*;

    fn listed_token(fixture: &Fixture) -> u32 {
        fixture.token.mint(&fixture.seller, &fixture.seller)
    }

    #[test]
    fn fee_is_capped_at_25_percent() {
        let fixture = fixture();
        let mp = &fixture.marketplace;
        mp.set_secondary_fee_bps(&crate::storage::MAX_FEE_BPS);
        assert_eq!(
            mp.try_set_secondary_fee_bps(&(crate::storage::MAX_FEE_BPS + 1))
                .err()
                .unwrap()
                .unwrap(),
            MarketplaceError::InvalidFee.into()
        );
        assert_eq!(crate::storage::MAX_FEE_BPS, 2_500);
    }

    #[test]
    fn list_rejects_a_fee_above_the_sellers_bound() {
        let fixture = fixture();
        let mp = &fixture.marketplace;
        let token_id = listed_token(&fixture);
        // Fixture fee is 250 bps; the seller signed for at most 249.
        let r = mp.try_list(
            &token_id,
            &fixture.seller,
            &1_000,
            &2_000,
            &249,
            &fixture.payment.address,
        );
        assert_eq!(
            r.err().unwrap().unwrap(),
            MarketplaceError::FeeAboveMax.into()
        );
        mp.list(
            &token_id,
            &fixture.seller,
            &1_000,
            &2_000,
            &250,
            &fixture.payment.address,
        );
        assert_eq!(mp.get_listing(&token_id).unwrap().fee_bps, 250);
    }

    #[test]
    fn list_rejects_an_unexpected_payment_asset() {
        let fixture = fixture();
        let mp = &fixture.marketplace;
        let token_id = listed_token(&fixture);
        let r = mp.try_list(
            &token_id,
            &fixture.seller,
            &1_000,
            &2_000,
            &250,
            &Address::generate(&fixture.env),
        );
        assert_eq!(
            r.err().unwrap().unwrap(),
            MarketplaceError::PaymentAssetMismatch.into()
        );
        assert!(mp.get_listing(&token_id).is_none());
    }

    #[test]
    fn buy_rejects_a_price_above_the_buyers_bound() {
        let fixture = fixture();
        let mp = &fixture.marketplace;
        let token_id = listed_token(&fixture);
        mp.list(
            &token_id,
            &fixture.seller,
            &1_000,
            &2_000,
            &250,
            &fixture.payment.address,
        );
        fixture.payment.mint(&fixture.buyer, &1_000);
        let r = mp.try_buy(&token_id, &fixture.buyer, &999);
        assert_eq!(
            r.err().unwrap().unwrap(),
            MarketplaceError::PriceAboveMax.into()
        );
        mp.buy(&token_id, &fixture.buyer, &1_000);
        assert_eq!(fixture.token.owner_of(&token_id), fixture.buyer);
    }

    #[test]
    fn launch_hands_admin_to_treasury_and_migrate_is_gated() {
        let fixture = fixture_setup();
        let mp = &fixture.marketplace;
        assert_eq!(mp.admin(), fixture.launch_admin);
        mp.launch(&fixture.treasury, &true);
        assert_eq!(mp.admin(), fixture.treasury);
        assert_eq!(
            mp.try_migrate().err().unwrap().unwrap(),
            common::CommonError::NothingToMigrate.into()
        );
    }
}

mod comments {
    use super::*;
    use crate::events::ListingCommented;
    use soroban_sdk::{testutils::Events as _, Event as _};

    fn text(e: &Env, len: u32) -> String {
        String::from_str(e, &"a".repeat(len as usize))
    }

    #[test]
    fn listing_comment_needs_no_active_listing() {
        let fixture = fixture();
        let mp = &fixture.marketplace;
        let body = String::from_str(&fixture.env, "nice token");
        mp.comment_listing(&7, &body, &fixture.seller);
        assert_eq!(
            fixture.env.events().all().events().last().unwrap(),
            &ListingCommented {
                token_id: 7,
                author: fixture.seller.clone(),
                body,
            }
            .to_xdr(&fixture.env, &mp.address)
        );
    }

    #[test]
    fn comment_body_must_be_non_empty_and_within_cap() {
        let fixture = fixture();
        let mp = &fixture.marketplace;
        let empty = String::from_str(&fixture.env, "");
        let long = text(&fixture.env, common::MAX_COMMENT_LENGTH + 1);
        let err = |r: Result<_, Result<soroban_sdk::Error, _>>| r.err().unwrap().unwrap();
        assert_eq!(
            err(mp.try_comment_listing(&1, &empty, &fixture.buyer)),
            MarketplaceError::CommentEmpty.into()
        );
        assert_eq!(
            err(mp.try_comment_listing(&1, &long, &fixture.buyer)),
            MarketplaceError::CommentTooLong.into()
        );
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
    fn comment_requires_author_auth() {
        let fixture = fixture();
        fixture.env.set_auths(&[]);
        fixture.marketplace.comment_listing(
            &1,
            &String::from_str(&fixture.env, "hi"),
            &fixture.buyer,
        );
    }
}

/// docs/STORAGE_DIET.md D26: no marketplace key may encode like a
/// `common` or OpenZeppelin key the contract links.
#[test]
fn storage_keys_do_not_collide() {
    use common::testutils::{assert_keys_disjoint, common_key_shapes, key_shape};
    #[allow(unused_imports)]
    use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, Val};
    let e = Env::default();
    let _a = Address::generate(&e);
    let all = |keys: std::vec::Vec<Val>| -> std::vec::Vec<(std::string::String, u32)> {
        keys.into_iter().map(|k| key_shape(&e, k)).collect()
    };
    // Every variant, checked exhaustively next to the enum.
    let module = all(crate::storage::key_samples::all(&e));
    assert_keys_disjoint(&[("DataKey", module), ("common", common_key_shapes(&e))]);
}
