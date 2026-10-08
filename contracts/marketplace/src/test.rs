#![cfg(test)]

extern crate std;

use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String,
};

use crate::{contract::MarketplaceContract, MarketplaceConfig};

#[contract]
struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn initialize(e: &Env) {
        e.storage()
            .instance()
            .set(&soroban_sdk::symbol_short!("next"), &0u32);
    }

    pub fn mint(e: &Env, _minter: Address, to: Address) -> u32 {
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

    pub fn owner_of(e: &Env, token_id: u32) -> Address {
        e.storage().persistent().get(&token_id).unwrap()
    }

    pub fn transfer(e: &Env, _from: Address, to: Address, token_id: u32) {
        e.storage().persistent().set(&token_id, &to);
    }

    pub fn transfer_from(e: &Env, _spender: Address, _from: Address, to: Address, token_id: u32) {
        e.storage().persistent().set(&token_id, &to);
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
    seller: Address,
    buyer: Address,
}

fn fixture() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);
    let treasury = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let manager = Address::generate(&env);
    let token_id = env.register(MockToken, ());
    let token = MockTokenClient::new(&env, &token_id);
    token.initialize();
    let payment_id = env.register(MockPayment, ());
    let payment = MockPaymentClient::new(&env, &payment_id);
    let marketplace_id = env.register(
        MarketplaceContract,
        (
            token_id,
            treasury.clone(),
            payment_id,
            manager,
            BytesN::from_array(&env, &[0; 32]),
            String::from_str(&env, "0.1.0"),
            250u32,
        ),
    );
    let marketplace = crate::contract::MarketplaceContractClient::new(&env, &marketplace_id);
    marketplace.unpause();
    Fixture {
        env,
        marketplace,
        token,
        payment,
        treasury,
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
    let address = env.register(
        MarketplaceContract,
        (
            token.clone(),
            treasury.clone(),
            payment.clone(),
            manager.clone(),
            BytesN::from_array(&env, &[0; 32]),
            String::from_str(&env, "0.1.0"),
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
    assert_eq!(marketplace.version(), String::from_str(&env, "0.1.0"));
    assert_eq!(
        marketplace.wasm_hash(),
        BytesN::from_array(&env, &[0u8; 32])
    );
}

#[test]
fn manager_can_finalize_ownership_and_launch_marketplace() {
    let fixture = fixture();
    let new_treasury = Address::generate(&fixture.env);

    fixture.marketplace.pause();
    fixture.marketplace.finalize_ownership(&new_treasury, &true);

    let config = fixture.marketplace.get_config();
    assert_eq!(config.treasury, new_treasury);
    assert!(!config.paused);
}

#[test]
fn manager_can_finalize_ownership_without_launching_marketplace() {
    let fixture = fixture();
    let new_treasury = Address::generate(&fixture.env);

    fixture.marketplace.pause();
    fixture
        .marketplace
        .finalize_ownership(&new_treasury, &false);

    let config = fixture.marketplace.get_config();
    assert_eq!(config.treasury, new_treasury);
    assert!(config.paused);
}

#[test]
fn primary_listing_can_be_purchased() {
    let fixture = fixture();
    let token_id = fixture.marketplace.mint_and_list(&100, &2_000);
    fixture.payment.mint(&fixture.buyer, &100);

    fixture.marketplace.buy(&token_id, &fixture.buyer);

    assert_eq!(fixture.token.owner_of(&token_id), fixture.buyer);
    assert_eq!(fixture.payment.balance(&fixture.treasury), 100);
    assert!(fixture.marketplace.get_listing(&token_id).is_none());
}

#[test]
fn secondary_listing_splits_fee_and_proceeds() {
    let fixture = fixture();
    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    fixture
        .marketplace
        .list(&token_id, &fixture.seller, &1_000, &2_000);
    fixture.payment.mint(&fixture.buyer, &1_000);

    fixture.marketplace.buy(&token_id, &fixture.buyer);

    assert_eq!(fixture.token.owner_of(&token_id), fixture.buyer);
    assert_eq!(fixture.payment.balance(&fixture.treasury), 25);
    assert_eq!(fixture.payment.balance(&fixture.seller), 975);
}

#[test]
fn seller_can_cancel_listing_and_reclaim_token() {
    let fixture = fixture();
    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    fixture
        .marketplace
        .list(&token_id, &fixture.seller, &100, &2_000);

    fixture.marketplace.cancel(&token_id, &fixture.seller);

    assert_eq!(fixture.token.owner_of(&token_id), fixture.seller);
    assert!(fixture.marketplace.get_listing(&token_id).is_none());
}

#[test]
fn expired_listing_can_be_reclaimed() {
    let fixture = fixture();
    let token_id = fixture.token.mint(&fixture.seller, &fixture.seller);
    fixture
        .marketplace
        .list(&token_id, &fixture.seller, &100, &2_000);
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
                mgr.address.clone(),
                from.clone(),
                String::from_str(&env, "0.1.0"),
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
                common::upgrade::version(&env),
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
                mgr.address.clone(),
                from.clone(),
                String::from_str(&env, "0.1.0"),
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
    fn upgrade_and_sync_version_reject_unauthorized_caller() {
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
                mgr.address.clone(),
                from.clone(),
                String::from_str(&env, "0.1.0"),
                250u32,
            ),
        );
        let client = crate::contract::MarketplaceContractClient::new(&env, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&env, "0.2.0"));
        mgr.register(&from, &String::from_str(&env, "0.1.1"));
        // Drop mock_all_auths: no authorization is provided for any address.
        env.set_auths(&[]);
        assert!(client.try_upgrade(&from, &to).is_err());
        assert!(client.try_sync_version().is_err());
        env.mock_all_auths();
        env.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&env), from);
            assert_eq!(
                common::upgrade::version(&env),
                String::from_str(&env, "0.1.0")
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
                mgr.address.clone(),
                from.clone(),
                String::from_str(&env, "0.1.0"),
                250u32,
            ),
        );
        let client = crate::contract::MarketplaceContractClient::new(&env, &id);
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
                common::upgrade::version(&env),
                String::from_str(&env, "0.1.0")
            );
        });
    }
}
