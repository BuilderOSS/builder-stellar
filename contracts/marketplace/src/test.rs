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
