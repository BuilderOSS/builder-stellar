#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

use crate::contract::{DaoAuctionContract, DaoAuctionContractClient};

fn setup_auction_contract(
    e: &Env,
) -> (
    DaoAuctionContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
    Address,
) {
    let owner = Address::generate(e);
    let treasury = Address::generate(e);
    let token_contract = Address::generate(e);
    let payment_token = Address::generate(e); // SECURITY FIX: Always require payment token

    let auction_address = e.register(
        DaoAuctionContract,
        (
            owner.clone(),
            token_contract.clone(),
            treasury.clone(),
            300_u64, // duration: 5 minutes (MIN_AUCTION_DURATION)
            10_000_000_i128,
            10_u32,
            50_u64,                      // time_buffer: 50 seconds
            Some(payment_token.clone()), // SECURITY FIX: SAC-only
        ),
    );
    let auction = DaoAuctionContractClient::new(e, &auction_address);

    (
        auction,
        owner,
        treasury,
        token_contract,
        auction_address,
        payment_token,
    )
}

fn setup_with_payment_token(
    e: &Env,
) -> (
    DaoAuctionContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
    Address,
) {
    let owner = Address::generate(e);
    let treasury = Address::generate(e);
    let token_contract = Address::generate(e);
    let payment_token = Address::generate(e);

    let auction_address = e.register(
        DaoAuctionContract,
        (
            owner.clone(),
            token_contract.clone(),
            treasury.clone(),
            500_u64, // duration: 500 seconds
            10_000_000_i128,
            10_u32,
            50_u64, // time_buffer: 50 seconds
            Some(payment_token.clone()),
        ),
    );
    let auction = DaoAuctionContractClient::new(e, &auction_address);

    (
        auction,
        owner,
        treasury,
        token_contract,
        auction_address,
        payment_token,
    )
}

// ============================================================================
// Constructor Tests
// ============================================================================

#[test]
fn test_constructor_initializes_correctly() {
    let e = Env::default();
    let (auction, owner, treasury, token_contract, _, payment_token) = setup_auction_contract(&e);

    assert!(auction.paused());
    assert_eq!(auction.get_owner(), Some(owner));

    let config = auction.get_config();
    assert_eq!(config.token_contract, token_contract);
    assert_eq!(config.treasury, treasury);
    assert_eq!(config.duration, 300);
    assert_eq!(config.reserve_price, 10_000_000);
    assert_eq!(config.min_bid_increment_percent, 10);
    assert_eq!(config.time_buffer, 50);
    assert_eq!(config.payment_token, Some(payment_token));
}

#[test]
fn test_constructor_with_payment_token() {
    let e = Env::default();
    let (auction, _, _, _, _, payment_token) = setup_with_payment_token(&e);

    let config = auction.get_config();
    assert_eq!(config.payment_token, Some(payment_token));
}

#[test]
#[should_panic(expected = "Error(Contract, #1208)")] // InvalidConfig
fn test_constructor_rejects_zero_duration() {
    let e = Env::default();
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let token_contract = Address::generate(&e);

    e.register(
        DaoAuctionContract,
        (
            owner,
            token_contract,
            treasury,
            0_u64, // Invalid
            10_000_000_i128,
            10_u32,
            10_u64,
            None::<Address>,
        ),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #1208)")] // InvalidConfig
fn test_constructor_rejects_zero_min_bid_increment() {
    let e = Env::default();
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let token_contract = Address::generate(&e);

    e.register(
        DaoAuctionContract,
        (
            owner,
            token_contract,
            treasury,
            100_u64,
            10_000_000_i128,
            0_u32, // Invalid
            10_u64,
            None::<Address>,
        ),
    );
}

// ============================================================================
// Pausable Tests
// ============================================================================

#[test]
fn test_pause_unpause() {
    let e = Env::default();
    e.ledger().set_sequence_number(100);

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    // Initially paused
    assert!(auction.paused());

    // Note: Cannot test unpause/pause in unit tests due to owner auth requirements
    // These are tested in e2e tests with proper contract setup
}

// Note: pause/unpause authorization tests are in e2e tests
// Unit tests cannot properly test Ownable auth with mock_all_auths()
// due to manual owner checking in the implementation

// ============================================================================
// Config Setter Tests (only work when paused)
// ============================================================================

#[test]
fn test_set_duration_when_paused() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    auction.set_duration(&1000);
    assert_eq!(auction.get_config().duration, 1000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1208)")] // InvalidConfig
fn test_set_duration_rejects_zero() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);
    auction.set_duration(&0);
}

#[test]
fn test_set_reserve_price_when_paused() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    auction.set_reserve_price(&50_000_000);
    assert_eq!(auction.get_config().reserve_price, 50_000_000);
}

#[test]
fn test_set_min_bid_increment_when_paused() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    auction.set_min_bid_increment(&15);
    assert_eq!(auction.get_config().min_bid_increment_percent, 15);
}

#[test]
#[should_panic(expected = "Error(Contract, #1208)")] // InvalidConfig
fn test_set_min_bid_increment_rejects_zero() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);
    auction.set_min_bid_increment(&0);
}

#[test]
fn test_set_time_buffer_when_paused() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    auction.set_time_buffer(&100);
    assert_eq!(auction.get_config().time_buffer, 100);
}

#[test]
fn test_set_payment_token_when_paused() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_with_payment_token(&e);
    let new_payment_token = Address::generate(&e);

    auction.set_payment_token(&Some(new_payment_token.clone()));
    assert_eq!(auction.get_config().payment_token, Some(new_payment_token));
}

#[test]
#[should_panic(expected = "#1211")] // NoPaymentTokenSet
fn test_set_payment_token_rejects_none() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_with_payment_token(&e);

    // SECURITY: Cannot set payment token to None
    auction.set_payment_token(&None);
}

#[test]
fn test_set_treasury_when_paused() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_with_payment_token(&e);
    let new_treasury = Address::generate(&e);

    auction.set_treasury(&new_treasury);
    assert_eq!(auction.get_config().treasury, new_treasury);
}

// ============================================================================
// Ownership Tests
// ============================================================================

#[test]
fn test_get_owner() {
    let e = Env::default();

    let (auction, owner, _, _, _, _) = setup_auction_contract(&e);

    // Owner should be set correctly on initialization
    assert_eq!(auction.get_owner(), Some(owner));
}

// Note: transfer_ownership, renounce_ownership, and ownership transfer on unpause
// are tested in e2e tests due to auth requirements

// ============================================================================
// Getter Tests
// ============================================================================

#[test]
fn test_get_config() {
    let e = Env::default();
    let (auction, _, treasury, token_contract, _, payment_token) = setup_with_payment_token(&e);

    let config = auction.get_config();
    assert_eq!(config.token_contract, token_contract);
    assert_eq!(config.treasury, treasury);
    assert_eq!(config.duration, 500);
    assert_eq!(config.reserve_price, 10_000_000);
    assert_eq!(config.min_bid_increment_percent, 10);
    assert_eq!(config.time_buffer, 50);
    assert_eq!(config.payment_token, Some(payment_token));
}

#[test]
#[should_panic(expected = "Error(Contract, #1212)")] // NotLaunched
fn test_get_auction_fails_before_launch() {
    let e = Env::default();
    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    // Should panic because auction hasn't been launched yet
    auction.get_auction();
}

// ============================================================================
// Auction State Tests (Testing state, not actual token operations)
// ============================================================================

// Note: Auction creation on unpause and SAC currency tests
// are in e2e tests due to unpause requiring owner authorization

// ============================================================================
// Edge Cases
// ============================================================================

#[test]
fn test_paused_state_prevents_operations() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    // Auction is paused, so settle should fail
    assert!(auction.try_settle_auction().is_err());
}

#[test]
fn test_multiple_config_updates() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    // Update multiple configs
    auction.set_duration(&750);
    auction.set_reserve_price(&20_000_000);
    auction.set_min_bid_increment(&20);
    auction.set_time_buffer(&75);

    let config = auction.get_config();
    assert_eq!(config.duration, 750);
    assert_eq!(config.reserve_price, 20_000_000);
    assert_eq!(config.min_bid_increment_percent, 20);
    assert_eq!(config.time_buffer, 75);
}

#[test]
fn test_config_setters_work_when_paused() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    // Config setters should work when paused
    auction.set_duration(&1000);
    auction.set_reserve_price(&30_000_000);
    auction.set_time_buffer(&125);

    let config = auction.get_config();
    assert_eq!(config.duration, 1000);
    assert_eq!(config.reserve_price, 30_000_000);
    assert_eq!(config.time_buffer, 125);
}

// ============================================================================
// Security Tests - Added from audit
// ============================================================================

#[test]
#[should_panic(expected = "#1211")]
fn test_constructor_requires_payment_token() {
    let e = Env::default();
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let token_contract = Address::generate(&e);

    // SECURITY: Constructor should reject None payment token
    e.register(
        DaoAuctionContract,
        (
            owner,
            token_contract,
            treasury,
            300_u64, // Must meet MIN_AUCTION_DURATION
            10_000_000_i128,
            10_u32,
            10_u64,
            None::<Address>,
        ),
    );
}

#[test]
#[should_panic(expected = "#1216")]
fn test_constructor_rejects_low_reserve_price() {
    let e = Env::default();
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let token_contract = Address::generate(&e);
    let payment_token = Address::generate(&e);

    // SECURITY: Reserve price must be >= 1000
    e.register(
        DaoAuctionContract,
        (
            owner,
            token_contract,
            treasury,
            300_u64,  // Must meet MIN_AUCTION_DURATION
            999_i128, // Too low
            10_u32,
            10_u64,
            Some(payment_token),
        ),
    );
}

#[test]
#[should_panic(expected = "#1208")]
fn test_constructor_rejects_high_min_increment() {
    let e = Env::default();
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let token_contract = Address::generate(&e);
    let payment_token = Address::generate(&e);

    // SECURITY: Min increment must be <= 100%
    e.register(
        DaoAuctionContract,
        (
            owner,
            token_contract,
            treasury,
            100_u64,
            10_000_000_i128,
            101_u32, // Too high
            10_u64,
            Some(payment_token),
        ),
    );
}

#[test]
#[should_panic(expected = "#1216")]
fn test_set_reserve_price_rejects_low_value() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    // SECURITY: Reserve price must be >= 1000
    auction.set_reserve_price(&999);
}

#[test]
#[should_panic(expected = "#1208")]
fn test_set_min_increment_rejects_high_value() {
    let e = Env::default();
    e.mock_all_auths();

    let (auction, _, _, _, _, _) = setup_auction_contract(&e);

    // SECURITY: Min increment must be <= 100%
    auction.set_min_bid_increment(&101);
}

// Note: Testing extension_count, overflow, DoS, and auth scenarios require
// mock implementations of token contracts and more complex test infrastructure.
// These are thoroughly tested in e2e tests where full contract interactions exist.
//
// The e2e tests verify:
// - extension_count is properly tracked and incremented
// - Maximum extensions limit prevents DoS
// - Payment currency is locked on first bid
// - Overflow protection in bid increment calculations
// - Authorization checks for owner-only functions
