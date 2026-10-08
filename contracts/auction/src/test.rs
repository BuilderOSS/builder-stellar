#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, IntoVal, String,
};

use crate::contract::{DaoAuctionContract, DaoAuctionContractClient};
use crate::error::AuctionError;

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
            50_u64,                // time_buffer: 50 seconds
            payment_token.clone(), // SECURITY FIX: SAC-only
            Address::generate(e),
            BytesN::from_array(e, &[0u8; 32]),
            String::from_str(e, "0.1.0"),
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
            payment_token.clone(),
            Address::generate(e),
            BytesN::from_array(e, &[0u8; 32]),
            String::from_str(e, "0.1.0"),
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
    assert_eq!(auction.version(), String::from_str(&e, "0.1.0"));
    assert_eq!(auction.wasm_hash(), BytesN::from_array(&e, &[0u8; 32]));

    let config = auction.get_config();
    assert_eq!(config.token_contract, token_contract);
    assert_eq!(config.treasury, treasury);
    assert_eq!(config.duration, 300);
    assert_eq!(config.reserve_price, 10_000_000);
    assert_eq!(config.min_bid_increment_percent, 10);
    assert_eq!(config.time_buffer, 50);
    assert_eq!(config.payment_token, payment_token);
}

#[test]
fn test_constructor_with_payment_token() {
    let e = Env::default();
    let (auction, _, _, _, _, payment_token) = setup_with_payment_token(&e);

    let config = auction.get_config();
    assert_eq!(config.payment_token, payment_token);
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
            Address::generate(&e),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
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
            Address::generate(&e),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
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

    auction.set_payment_token(&new_payment_token);
    assert_eq!(auction.get_config().payment_token, new_payment_token);
}

#[test]
fn unpause_before_launch_is_not_live() {
    let e = Env::default();
    e.mock_all_auths();
    let (auction, owner, _, _, _, _) = setup_with_payment_token(&e);
    let r = auction.try_unpause(&owner);
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::NotLive.into()
    );
    assert!(auction.paused());
}

#[test]
fn launch_without_start_is_one_shot_and_clears_pending_owner() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let attacker = Address::generate(&e);
    let payment_token = Address::generate(&e);
    let id = e.register(
        DaoAuctionContract,
        (
            owner.clone(),
            Address::generate(&e),
            treasury.clone(),
            300_u64,
            10_000_000_i128,
            10_u32,
            50_u64,
            payment_token.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
        ),
    );
    let auction = DaoAuctionContractClient::new(&e, &id);

    auction.transfer_ownership(&attacker, &(e.ledger().sequence() + 1_000));
    auction.launch(&treasury, &false, &payment_token);
    assert_eq!(auction.get_owner(), Some(treasury.clone()));
    assert!(auction.paused());
    assert!(auction.try_accept_ownership().is_err());
    assert_eq!(auction.get_owner(), Some(treasury.clone()));
    let r = auction.try_launch(&treasury, &true, &payment_token);
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::AlreadyLive.into()
    );
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
    assert_eq!(config.payment_token, payment_token);
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
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
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
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
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

mod upgrade_via_common {
    use super::*;
    use common::testutils::{empty_wasm, MockManager, MockManagerClient};

    #[test]
    fn upgrade_goes_through_common_apply() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoAuctionContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                Address::generate(&e),
                300_u64,
                10_000_000_i128,
                10_u32,
                50_u64,
                Address::generate(&e),
                mgr.address.clone(),
                from.clone(),
                String::from_str(&e, "0.1.0"),
            ),
        );
        let client = DaoAuctionContractClient::new(&e, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        client.upgrade(&from, &to);

        // Contract code is swapped to an empty module; read the stored keys directly.
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), to);
            assert_eq!(common::upgrade::version(&e), String::from_str(&e, "0.2.0"));
        });
    }

    #[test]
    fn upgrade_rejected_when_not_approved() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoAuctionContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                Address::generate(&e),
                300_u64,
                10_000_000_i128,
                10_u32,
                50_u64,
                Address::generate(&e),
                mgr.address.clone(),
                from.clone(),
                String::from_str(&e, "0.1.0"),
            ),
        );
        let client = DaoAuctionContractClient::new(&e, &id);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        let r = client.try_upgrade(&from, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::UpgradeNotApproved.into()
        );
    }

    #[test]
    fn upgrade_and_sync_version_reject_unauthorized_caller() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoAuctionContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                Address::generate(&e),
                300_u64,
                10_000_000_i128,
                10_u32,
                50_u64,
                Address::generate(&e),
                mgr.address.clone(),
                from.clone(),
                String::from_str(&e, "0.1.0"),
            ),
        );
        let client = DaoAuctionContractClient::new(&e, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        mgr.register(&from, &String::from_str(&e, "0.1.1"));
        // Drop mock_all_auths: no authorization is provided for any address.
        e.set_auths(&[]);
        assert!(client.try_upgrade(&from, &to).is_err());
        assert!(client.try_sync_version().is_err());
        e.mock_all_auths();
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), from);
            assert_eq!(common::upgrade::version(&e), String::from_str(&e, "0.1.0"));
        });
    }

    #[test]
    fn upgrade_hash_mismatch_leaves_state_unchanged() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoAuctionContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                Address::generate(&e),
                300_u64,
                10_000_000_i128,
                10_u32,
                50_u64,
                Address::generate(&e),
                mgr.address.clone(),
                from.clone(),
                String::from_str(&e, "0.1.0"),
            ),
        );
        let client = DaoAuctionContractClient::new(&e, &id);
        let wrong = BytesN::from_array(&e, &[9u8; 32]);
        mgr.approve(&wrong, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        let r = client.try_upgrade(&wrong, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::HashMismatch.into()
        );
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), from);
            assert_eq!(common::upgrade::version(&e), String::from_str(&e, "0.1.0"));
        });
    }
}

#[test]
fn launch_rejects_changed_payment_token_and_succeeds_when_unchanged() {
    let e = Env::default();
    e.mock_all_auths();
    let (auction, _owner, treasury, _token, _id, original) = setup_with_payment_token(&e);
    auction.set_payment_token(&Address::generate(&e));
    let r = auction.try_launch(&treasury, &false, &original);
    assert_eq!(
        r.err().unwrap().unwrap(),
        AuctionError::PaymentTokenMismatch.into()
    );
    auction.set_payment_token(&original);
    auction.launch(&treasury, &false, &original);
}

#[test]
fn launch_requires_manager_auth() {
    let e = Env::default();
    e.mock_all_auths();
    let (auction, owner, treasury, _token, id, payment) = setup_with_payment_token(&e);
    e.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "launch",
            args: (&treasury, false, &payment).into_val(&e),
            sub_invokes: &[],
        },
    }]);
    assert!(auction.try_launch(&treasury, &false, &payment).is_err());
    assert!(auction.paused());
}

// ============================================================================
// Refund tests (deferred refund / withdraw_refund)
// ============================================================================

mod refunds {
    use super::*;
    use crate::events::{BidRefunded, RefundDeferred, RefundWithdrawn};
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{Events, IssuerFlags},
        token::{StellarAssetClient, TokenClient},
    };

    /// Minimal NFT: `mint` returns sequential ids, `transfer` is a no-op.
    #[contract]
    struct MockNft;

    #[contractimpl]
    impl MockNft {
        pub fn mint(e: Env, _auth: Address, _to: Address) -> u32 {
            let id: u32 = e.storage().instance().get(&1u32).unwrap_or(0) + 1;
            e.storage().instance().set(&1u32, &id);
            id
        }
        pub fn transfer(_e: Env, _from: Address, _to: Address, _id: u32) {}
    }

    const T0: u64 = 1_000;

    struct Ctx {
        e: Env,
        auction: DaoAuctionContractClient<'static>,
        addr: Address,
        treasury: Address,
        sac: StellarAssetClient<'static>,
        token: TokenClient<'static>,
        /// Bidders whose PendingRefund we expect the contract to hold.
        bidders: std::vec::Vec<Address>,
    }

    fn setup() -> Ctx {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().with_mut(|l| l.timestamp = T0);
        let admin = Address::generate(&e);
        let sac_reg = e.register_stellar_asset_contract_v2(admin);
        // Allow set_authorized(false) to simulate a recipient that cannot receive.
        sac_reg.issuer().set_flag(IssuerFlags::RevocableFlag);
        let sac_addr = sac_reg.address();
        let nft = e.register(MockNft, ());
        let treasury = Address::generate(&e);
        let addr = e.register(
            DaoAuctionContract,
            (
                Address::generate(&e),
                nft,
                treasury.clone(),
                300_u64,
                10_000_000_i128,
                10_u32,
                50_u64,
                sac_addr.clone(),
                Address::generate(&e),
                BytesN::from_array(&e, &[0u8; 32]),
                String::from_str(&e, "0.1.0"),
            ),
        );
        let auction = DaoAuctionContractClient::new(&e, &addr);
        auction.launch(&treasury, &true, &sac_addr);
        let sac = StellarAssetClient::new(&e, &sac_addr);
        let token = TokenClient::new(&e, &sac_addr);
        Ctx {
            e,
            auction,
            addr,
            treasury,
            sac,
            token,
            bidders: std::vec::Vec::new(),
        }
    }

    impl Ctx {
        fn funded(&mut self, amount: i128) -> Address {
            let a = Address::generate(&self.e);
            self.sac.mint(&a, &amount);
            self.bidders.push(a.clone());
            a
        }
        fn bid(&self, who: &Address, amount: i128) {
            let id = self.auction.get_auction().token_id;
            self.auction.create_bid(who, &id, &amount);
        }
        /// contract balance == live highest bid + sum(PendingRefund)
        fn assert_invariant(&self) {
            let a = self.auction.get_auction();
            let live = if !a.settled && a.highest_bidder.is_some() {
                a.highest_bid
            } else {
                0
            };
            let pending: i128 = self
                .bidders
                .iter()
                .map(|b| self.auction.pending_refund(b))
                .sum();
            assert_eq!(self.token.balance(&self.addr), live + pending);
        }
        /// True if the last invocation emitted exactly this event (topics + data).
        fn emitted<E: soroban_sdk::events::Event>(&self, ev: &E) -> bool {
            let x = ev.to_xdr(&self.e, &self.addr);
            self.e.events().all().events().contains(&x)
        }
        fn pause(&self) {
            let owner = self.auction.get_owner().unwrap();
            self.auction.pause(&owner);
        }
    }

    #[test]
    fn happy_path_no_pending_refund_and_invariant() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.assert_invariant();
        c.bid(&b, 12_000_000);
        // existing refund event preserved, no deferral event
        let tid = 1u128; // first auction; read before the last invocation would clear events
        assert!(c.emitted(&BidRefunded {
            token_id: tid,
            bidder: a.clone(),
            amount: 10_000_000
        }));
        assert!(!c.emitted(&RefundDeferred {
            token_id: tid,
            bidder: a.clone(),
            amount: 10_000_000
        }));
        assert_eq!(c.token.balance(&a), 100_000_000);
        assert_eq!(c.auction.pending_refund(&a), 0);
        assert_eq!(c.auction.pending_refund(&b), 0);
        c.assert_invariant();
    }

    #[test]
    fn deferred_refund_then_withdraw() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.sac.set_authorized(&a, &false);

        // B's higher bid succeeds despite A being unable to receive.
        c.bid(&b, 12_000_000);
        let tid = 1u128; // first auction; read before the last invocation would clear events
        assert!(c.emitted(&RefundDeferred {
            token_id: tid,
            bidder: a.clone(),
            amount: 10_000_000
        }));
        assert!(!c.emitted(&BidRefunded {
            token_id: tid,
            bidder: a.clone(),
            amount: 10_000_000
        }));
        assert_eq!(c.auction.pending_refund(&a), 10_000_000);
        assert_eq!(c.auction.get_auction().highest_bidder, Some(b.clone()));
        c.assert_invariant();

        // Withdraw while still unauthorized reverts and keeps the balance.
        assert!(c.auction.try_withdraw_refund(&a).is_err());
        assert_eq!(c.auction.pending_refund(&a), 10_000_000);
        c.assert_invariant();

        c.sac.set_authorized(&a, &true);
        c.auction.withdraw_refund(&a);
        assert_eq!(c.token.balance(&a), 100_000_000);
        assert_eq!(c.auction.pending_refund(&a), 0);
        c.assert_invariant();

        assert_eq!(
            c.auction.try_withdraw_refund(&a).err(),
            Some(Ok(AuctionError::NoPendingRefund.into()))
        );
    }

    #[test]
    fn consecutive_deferred_refunds_accumulate() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.sac.set_authorized(&a, &false);
        c.bid(&b, 12_000_000);
        assert_eq!(c.auction.pending_refund(&a), 10_000_000);
        // A (still unauthorized) cannot bid, so re-authorize, rebid, revoke again.
        c.sac.set_authorized(&a, &true);
        c.bid(&a, 20_000_000);
        c.sac.set_authorized(&a, &false);
        c.bid(&b, 30_000_000);
        assert_eq!(c.auction.pending_refund(&a), 30_000_000);
        c.assert_invariant();
    }

    #[test]
    fn settle_with_pending_refund_keeps_invariant() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.sac.set_authorized(&a, &false);
        c.bid(&b, 12_000_000);
        c.assert_invariant();

        c.e.ledger().with_mut(|l| l.timestamp = T0 + 10_000);
        c.auction.settle_and_create_new();
        assert_eq!(c.token.balance(&c.treasury), 12_000_000);
        c.assert_invariant();

        c.sac.set_authorized(&a, &true);
        c.auction.withdraw_refund(&a);
        c.assert_invariant();
    }

    #[test]
    fn cancel_with_deferred_refund_credits_pending() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.sac.set_authorized(&a, &false);
        c.pause();
        c.auction.cancel_auction();
        assert!(c.auction.get_auction().settled);
        assert_eq!(c.auction.pending_refund(&a), 10_000_000);
        c.assert_invariant();
        c.sac.set_authorized(&a, &true);
        c.auction.withdraw_refund(&a);
        c.assert_invariant();
    }

    #[test]
    fn cancel_normal_refund_keeps_invariant() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.pause();
        c.auction.cancel_auction();
        assert_eq!(c.auction.pending_refund(&a), 0);
        assert_eq!(c.token.balance(&a), 100_000_000);
        c.assert_invariant();
    }

    #[test]
    fn withdraw_requires_bidder_auth() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.sac.set_authorized(&a, &false);
        c.bid(&b, 12_000_000);
        c.sac.set_authorized(&a, &true);

        // Drop blanket mocking; supply no auth at all.
        c.e.set_auths(&[]);
        let r = c.auction.try_withdraw_refund(&a);
        assert!(r.is_err());
        assert_eq!(c.auction.pending_refund(&a), 10_000_000);

        // Auth from a different address is not enough.
        c.e.mock_auths(&[MockAuth {
            address: &b,
            invoke: &MockAuthInvoke {
                contract: &c.addr,
                fn_name: "withdraw_refund",
                args: (a.clone(),).into_val(&c.e),
                sub_invokes: &[],
            },
        }]);
        assert!(c.auction.try_withdraw_refund(&a).is_err());
    }

    /// Only the bidder's own auth is mocked; the contract's refund sub-call
    /// auth must come from authorize_as_current_contract.
    fn bid_real_auth(c: &Ctx, who: &Address, amount: i128) {
        let id = c.auction.get_auction().token_id;
        c.e.mock_auths(&[MockAuth {
            address: who,
            invoke: &MockAuthInvoke {
                contract: &c.addr,
                fn_name: "create_bid",
                args: (who.clone(), id, amount).into_val(&c.e),
                sub_invokes: &[MockAuthInvoke {
                    contract: &c.token.address,
                    fn_name: "transfer",
                    args: (who.clone(), c.addr.clone(), amount).into_val(&c.e),
                    sub_invokes: &[],
                }],
            },
        }]);
        c.auction.create_bid(who, &id, &amount);
    }

    #[test]
    fn real_auth_refund_is_pushed_not_deferred() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        bid_real_auth(&c, &a, 10_000_000);
        bid_real_auth(&c, &b, 12_000_000);
        let tid = 1u128; // first auction; read before the last invocation would clear events
        assert!(c.emitted(&BidRefunded {
            token_id: tid,
            bidder: a.clone(),
            amount: 10_000_000
        }));
        assert!(!c.emitted(&RefundDeferred {
            token_id: tid,
            bidder: a.clone(),
            amount: 10_000_000
        }));
        assert_eq!(c.token.balance(&a), 100_000_000);
        assert_eq!(c.auction.pending_refund(&a), 0);
        c.assert_invariant();
    }

    #[test]
    fn real_auth_withdraw_transfer_succeeds() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.sac.set_authorized(&a, &false);
        c.bid(&b, 12_000_000);
        c.sac.set_authorized(&a, &true);

        c.e.mock_auths(&[MockAuth {
            address: &a,
            invoke: &MockAuthInvoke {
                contract: &c.addr,
                fn_name: "withdraw_refund",
                args: (a.clone(),).into_val(&c.e),
                sub_invokes: &[],
            },
        }]);
        c.auction.withdraw_refund(&a);
        assert!(c.emitted(&RefundWithdrawn {
            bidder: a.clone(),
            amount: 10_000_000
        }));
        assert_eq!(c.token.balance(&a), 100_000_000);
        assert_eq!(c.auction.pending_refund(&a), 0);
        c.assert_invariant();
    }

    #[test]
    fn self_outbid_while_deferral_pending() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.sac.set_authorized(&a, &false);
        c.bid(&b, 12_000_000);
        c.sac.set_authorized(&a, &true);
        c.bid(&a, 20_000_000);
        c.bid(&a, 30_000_000); // A outbids A; push of 20M to A succeeds
        assert_eq!(c.auction.pending_refund(&a), 10_000_000);
        assert_eq!(c.token.balance(&c.addr), 40_000_000);
        c.assert_invariant();
        c.auction.withdraw_refund(&a);
        c.assert_invariant();
    }

    #[test]
    fn pending_survives_rollover_to_next_auction() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.sac.set_authorized(&a, &false);
        c.bid(&b, 12_000_000);
        let first = c.auction.get_auction().token_id;
        c.e.ledger().with_mut(|l| l.timestamp = T0 + 10_000);
        c.auction.settle_and_create_new();
        assert_eq!(c.auction.get_auction().token_id, first + 1);
        c.assert_invariant();

        let d = c.funded(100_000_000);
        c.bid(&d, 10_000_000);
        c.assert_invariant();
        c.sac.set_authorized(&a, &true);
        c.auction.withdraw_refund(&a);
        assert_eq!(c.token.balance(&a), 100_000_000);
        c.assert_invariant();
    }

    #[test]
    fn cancel_after_multiple_deferrals() {
        let mut c = setup();
        let a = c.funded(100_000_000);
        let b = c.funded(100_000_000);
        let d = c.funded(100_000_000);
        c.bid(&a, 10_000_000);
        c.sac.set_authorized(&a, &false);
        c.bid(&b, 12_000_000);
        c.sac.set_authorized(&b, &false);
        c.bid(&d, 15_000_000);
        c.assert_invariant();
        c.sac.set_authorized(&d, &false);
        c.pause();
        c.auction.cancel_auction();
        assert_eq!(c.auction.pending_refund(&a), 10_000_000);
        assert_eq!(c.auction.pending_refund(&b), 12_000_000);
        assert_eq!(c.auction.pending_refund(&d), 15_000_000);
        assert_eq!(c.token.balance(&c.addr), 37_000_000);
        c.assert_invariant();
        for x in [&a, &b, &d] {
            c.sac.set_authorized(x, &true);
            c.auction.withdraw_refund(x);
            c.assert_invariant();
        }
        assert_eq!(c.token.balance(&c.addr), 0);
    }
}
