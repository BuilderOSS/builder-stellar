extern crate std;

use common::CommonError;
use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, vec, Address, BytesN, Env, String, Symbol,
};
use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
    IntoVal,
};

use crate::error::TokenError;
use crate::{DaoTokenContract, DaoTokenContractClient};
use common::modules::MintGrant;

/// A deployed Wasm-executable stand-in for a module contract.
#[contract]
pub struct ModuleStub;

#[contractimpl]
impl ModuleStub {
    pub fn ping() {}
}

fn stub(e: &Env) -> Address {
    e.register(ModuleStub, ())
}

/// Registers a fresh stub module of `kind` (Setup: the Manager's auth is mocked).
fn module(e: &Env, client: &DaoTokenContractClient, kind: &str, non_voting: bool) -> Address {
    let address = stub(e);
    client.register_module(&Symbol::new(e, kind), &address, &non_voting);
    address
}

fn grants(e: &Env, pairs: &[(&Address, u32)]) -> soroban_sdk::Vec<MintGrant> {
    let mut v = soroban_sdk::Vec::new(e);
    for (module, allowance) in pairs {
        v.push_back(MintGrant {
            module: (*module).clone(),
            allowance: *allowance,
        });
    }
    v
}

/// Register a token with `admin`, `treasury`, `manager` and `hash` (the
/// metadata address is a dummy), then register stub Auction and Marketplace
/// modules the way the Manager's `create_dao` does.
fn deploy(
    e: &Env,
    admin: Address,
    treasury: Address,
    manager: Address,
    hash: BytesN<32>,
) -> Address {
    let id = e.register(
        DaoTokenContract,
        (
            admin,
            treasury,
            String::from_str(e, "DAO Vote NFT"),
            String::from_str(e, "vDAO"),
            Address::generate(e),
            manager,
            hash,
        ),
    );
    let client = DaoTokenContractClient::new(e, &id).mock_all_auths();
    for kind in ["auction", "marketplace"] {
        client.register_module(&Symbol::new(e, kind), &stub(e), &true);
    }
    id
}

fn setup() -> (Env, DaoTokenContractClient<'static>, Address) {
    let (e, client, owner, _manager) = setup_with_manager();
    (e, client, owner)
}

/// Setup-phase token plus the manager address, so tests can drive `launch`.
fn setup_with_manager() -> (Env, DaoTokenContractClient<'static>, Address, Address) {
    let e = Env::default();
    e.mock_all_auths();
    let manager = Address::generate(&e);

    let owner = Address::generate(&e);
    let contract_id = deploy(
        &e,
        owner.clone(),
        Address::generate(&e),
        manager.clone(),
        BytesN::from_array(&e, &[0u8; 32]),
    );
    let client = DaoTokenContractClient::new(&e, &contract_id);
    (e, client, owner, manager)
}

fn setup_no_auth() -> (Env, DaoTokenContractClient<'static>, Address) {
    let e = Env::default();
    let owner = Address::generate(&e);
    let contract_id = deploy(
        &e,
        owner.clone(),
        Address::generate(&e),
        Address::generate(&e),
        BytesN::from_array(&e, &[0u8; 32]),
    );
    let client = DaoTokenContractClient::new(&e, &contract_id);
    (e, client, owner)
}

#[test]
fn mint_defaults_to_self_delegate() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    let _token_id = client.mint(&owner, &alice);

    assert_eq!(client.balance(&alice), 1);
    assert_eq!(client.get_delegate(&alice), Some(alice.clone()));
    assert_eq!(client.get_votes(&alice), 1);
}

#[test]
fn consecutive_mints_create_new_checkpoints() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    client.mint(&owner, &alice);
    client.mint(&owner, &alice);

    assert_eq!(client.balance(&alice), 2);
    assert_eq!(client.get_votes(&alice), 2);
    assert_eq!(client.get_total_supply(), 2);
}

#[test]
fn transfer_preserves_existing_delegate() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let carol = Address::generate(&e);

    let token_id = client.mint(&owner, &alice);
    client.delegate(&bob, &carol);
    client.transfer(&alice, &bob, &token_id);

    assert_eq!(client.balance(&bob), 1);
    assert_eq!(client.get_delegate(&bob), Some(carol.clone()));
    assert_eq!(client.get_votes(&carol), 1);
}

#[test]
fn transfer_to_new_holder_defaults_self_delegate() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    let token_id = client.mint(&owner, &alice);
    client.transfer(&alice, &bob, &token_id);

    assert_eq!(client.balance(&bob), 1);
    assert_eq!(client.get_delegate(&bob), Some(bob.clone()));
    assert_eq!(client.get_votes(&bob), 1);
}

/// Treasury wired into the token constructor.
fn wired_treasury(e: &Env, client: &DaoTokenContractClient) -> Address {
    e.as_contract(&client.address, || {
        e.storage()
            .instance()
            .get(&common::ns(e, crate::storage::TokenKey::Treasury))
            .unwrap()
    })
}

/// Launch with `grants` (each module must already be registered); returns the
/// treasury address.
fn launch(e: &Env, client: &DaoTokenContractClient, pairs: &[(&Address, u32)]) -> Address {
    let treasury = wired_treasury(e, client);
    client.launch(&treasury, &grants(e, pairs));
    treasury
}

#[test]
fn launch_writes_allowances_for_registered_modules() {
    let (e, client, owner, _m) = setup_with_manager();
    let claims = module(&e, &client, "claims", false);
    let custom = module(&e, &client, "custom_shop", false);
    let stranger = Address::generate(&e);
    let treasury = launch(&e, &client, &[(&claims, 5), (&custom, 7)]);

    assert_eq!(client.admin(), treasury);
    assert_eq!(client.mint_allowance(&claims), 5);
    assert_eq!(client.mint_allowance(&custom), 7);
    assert_eq!(client.mint_allowance(&stranger), 0);
    assert_eq!(client.mint_allowance(&owner), 0);
}

#[test]
fn launch_refuses_a_grant_for_an_unregistered_address() {
    let (e, client, _owner, _m) = setup_with_manager();
    let treasury = wired_treasury(&e, &client);
    let stranger = stub(&e);
    let r = client.try_launch(&treasury, &grants(&e, &[(&stranger, 1)]));
    assert_eq!(r.err().unwrap().unwrap(), TokenError::NotAModule.into());
    assert!(!client.is_live());
}

#[test]
fn second_launch_panics_already_live() {
    let (e, client, _owner, _m) = setup_with_manager();
    launch(&e, &client, &[]);
    let other = Address::generate(&e);
    let r = client.try_launch(&other, &vec![&e]);
    assert_eq!(r.err().unwrap().unwrap(), CommonError::AlreadyLive.into());
}

#[test]
fn allowances_add_subtract_and_release() {
    let (e, client, _owner, _m) = setup_with_manager();
    let claims = module(&e, &client, "claims", false);
    // The admin (the launch admin in Setup) manages allowances in any phase.
    client.increase_mint_allowance(&claims, &3);
    client.increase_mint_allowance(&claims, &4);
    assert_eq!(client.mint_allowance(&claims), 7);
    client.decrease_mint_allowance(&claims, &2);
    assert_eq!(client.mint_allowance(&claims), 5);
    client.release_mint_allowance(&claims, &10);
    assert_eq!(client.mint_allowance(&claims), 0);
    // Raising needs a registered module.
    let r = client.try_increase_mint_allowance(&stub(&e), &1);
    assert_eq!(r.err().unwrap().unwrap(), TokenError::NotAModule.into());
}

#[test]
fn launch_admin_cannot_mint_after_launch() {
    let (e, client, owner, _m) = setup_with_manager();
    launch(&e, &client, &[]);
    let r = client.try_mint(&owner, &Address::generate(&e));
    assert!(r.is_err());
}

#[test]
fn launch_hands_admin_to_treasury() {
    let (e, client, owner, _m) = setup_with_manager();
    assert_eq!(client.admin(), owner);
    let treasury = launch(&e, &client, &[]);
    assert_eq!(client.admin(), treasury);
    // The launch admin lost every admin power: set_metadata now needs the treasury.
    e.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_metadata",
            args: (String::from_str(&e, "n"), String::from_str(&e, "s")).into_val(&e),
            sub_invokes: &[],
        },
    }]);
    assert!(client
        .try_set_metadata(&String::from_str(&e, "n"), &String::from_str(&e, "s"))
        .is_err());
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn mint_requires_minter_auth() {
    let (e, client, owner) = setup_no_auth();
    let alice = Address::generate(&e);
    let other = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &other,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "mint",
            args: (&alice,).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    let _ = owner;
    let _token_id = client.mint(&owner, &alice);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn increase_mint_allowance_requires_admin_auth() {
    let (e, client, _owner) = setup_no_auth();
    client.increase_mint_allowance(&stub(&e), &1);
}

#[test]
fn module_mints_within_its_allowance_and_stops_at_zero() {
    let (e, client, _owner, _m) = setup_with_manager();
    let shop = module(&e, &client, "custom_shop", false);
    let alice = Address::generate(&e);
    launch(&e, &client, &[(&shop, 3)]);

    assert_eq!(client.mint(&shop, &alice), 0);
    client.batch_mint(&shop, &vec![&e, alice.clone()], &vec![&e, 2u128]);
    assert_eq!(client.balance(&alice), 3);
    assert_eq!(client.mint_allowance(&shop), 0);
    let r = client.try_mint(&shop, &alice);
    assert_eq!(
        r.err().unwrap().unwrap(),
        TokenError::AllowanceExceeded.into()
    );
    // A batch larger than what is left fails whole.
    client.increase_mint_allowance(&shop, &1);
    let r = client.try_batch_mint(&shop, &vec![&e, alice.clone()], &vec![&e, 2u128]);
    assert_eq!(
        r.err().unwrap().unwrap(),
        TokenError::AllowanceExceeded.into()
    );
    assert_eq!(client.mint_allowance(&shop), 1);
}

#[test]
fn before_launch_only_the_claims_module_mints() {
    let (e, client, _owner, _m) = setup_with_manager();
    let claims = module(&e, &client, "claims", false);
    let circle = module(&e, &client, "circle", false);
    let auction = client.auction().unwrap();
    let alice = Address::generate(&e);
    client.increase_mint_allowance(&claims, &2);
    client.increase_mint_allowance(&circle, &2);
    client.increase_mint_allowance(&auction, &u32::MAX);

    client.mint(&claims, &alice);
    assert_eq!(client.mint_allowance(&claims), 1);
    for minter in [&circle, &auction] {
        let r = client.try_mint(minter, &alice);
        assert_eq!(
            r.err().unwrap().unwrap(),
            TokenError::MintAuthorityNotAllowed.into()
        );
    }
    // An unregistered address never mints.
    let r = client.try_mint(&stub(&e), &alice);
    assert_eq!(
        r.err().unwrap().unwrap(),
        TokenError::MintAuthorityNotAllowed.into()
    );
}

#[test]
fn explicit_delegation_moves_votes() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    let _ = client.mint(&owner, &alice);
    client.delegate(&alice, &bob);

    assert_eq!(client.get_delegate(&alice), Some(bob.clone()));
    assert_eq!(client.get_votes(&bob), 1);
}

// Batch minting tests removed - functionality moved to Minter contract

#[test]
fn test_batch_mint_single_recipient() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    e.mock_all_auths();

    let recipients = soroban_sdk::vec![&e, alice.clone()];
    let amounts = soroban_sdk::vec![&e, 5u128];

    let token_ids = client.batch_mint(&owner, &recipients, &amounts);

    assert_eq!(token_ids.len(), 5);
    assert_eq!(client.balance(&alice), 5);
    assert_eq!(client.get_votes(&alice), 5);
    assert_eq!(client.total_supply(), 5);
}

#[test]
fn test_batch_mint_multiple_recipients() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let carol = Address::generate(&e);

    e.mock_all_auths();

    let recipients = soroban_sdk::vec![&e, alice.clone(), bob.clone(), carol.clone()];
    let amounts = soroban_sdk::vec![&e, 6u128, 9u128, 5u128];

    let token_ids = client.batch_mint(&owner, &recipients, &amounts);

    assert_eq!(token_ids.len(), 20);
    assert_eq!(client.balance(&alice), 6);
    assert_eq!(client.balance(&bob), 9);
    assert_eq!(client.balance(&carol), 5);
    assert_eq!(client.get_votes(&alice), 6);
    assert_eq!(client.get_votes(&bob), 9);
    assert_eq!(client.get_votes(&carol), 5);
    assert_eq!(client.total_supply(), 20);
}

#[test]
fn test_batch_mint_delegation_check_once_per_recipient() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    e.mock_all_auths();

    // Mint first batch - should set delegation
    let recipients1 = soroban_sdk::vec![&e, alice.clone()];
    let amounts1 = soroban_sdk::vec![&e, 3u128];
    client.batch_mint(&owner, &recipients1, &amounts1);

    assert_eq!(client.get_delegate(&alice), Some(alice.clone()));
    assert_eq!(client.get_votes(&alice), 3);

    // Mint second batch to same recipient - delegation already set, should skip check
    let recipients2 = soroban_sdk::vec![&e, alice.clone()];
    let amounts2 = soroban_sdk::vec![&e, 7u128];
    client.batch_mint(&owner, &recipients2, &amounts2);

    assert_eq!(client.balance(&alice), 10);
    assert_eq!(client.get_votes(&alice), 10);
    assert_eq!(client.get_delegate(&alice), Some(alice.clone()));
}

#[test]
fn test_batch_mint_preserves_existing_delegation() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    e.mock_all_auths();

    // Mint one token to alice and delegate to bob
    client.mint(&owner, &alice);
    client.delegate(&alice, &bob);

    assert_eq!(client.get_delegate(&alice), Some(bob.clone()));
    assert_eq!(client.get_votes(&bob), 1);

    // Batch mint more tokens to alice - should preserve delegation to bob
    let recipients = soroban_sdk::vec![&e, alice.clone()];
    let amounts = soroban_sdk::vec![&e, 9u128];
    client.batch_mint(&owner, &recipients, &amounts);

    assert_eq!(client.balance(&alice), 10);
    assert_eq!(client.get_delegate(&alice), Some(bob.clone()));
    assert_eq!(client.get_votes(&bob), 10); // All votes still go to bob
}

#[test]
#[should_panic(expected = "Error(Contract, #7202)")] // TokenError::InvalidInput
fn test_batch_mint_mismatched_lengths() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    e.mock_all_auths();

    let recipients = soroban_sdk::vec![&e, alice.clone()];
    let amounts = soroban_sdk::vec![&e, 5u128, 10u128]; // Mismatch!

    client.batch_mint(&owner, &recipients, &amounts);
}

#[test]
#[should_panic(expected = "Error(Contract, #7202)")] // TokenError::InvalidInput
fn test_batch_mint_zero_amount() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    e.mock_all_auths();

    let recipients = soroban_sdk::vec![&e, alice.clone()];
    let amounts = soroban_sdk::vec![&e, 0u128];

    client.batch_mint(&owner, &recipients, &amounts);
}

#[test]
fn test_batch_mint_checkpoint_efficiency() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    e.mock_all_auths();

    // Batch mint 10 tokens
    let recipients = soroban_sdk::vec![&e, alice.clone()];
    let amounts = soroban_sdk::vec![&e, 10u128];
    client.batch_mint(&owner, &recipients, &amounts);

    // Should have created only 1 checkpoint, not 10
    assert_eq!(client.num_checkpoints(&alice), 1);
    assert_eq!(client.get_votes(&alice), 10);
}

#[test]
fn test_batch_mint_sequential_token_ids() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    e.mock_all_auths();

    let recipients = soroban_sdk::vec![&e, alice.clone(), bob.clone()];
    let amounts = soroban_sdk::vec![&e, 3u128, 2u128];

    let token_ids = client.batch_mint(&owner, &recipients, &amounts);

    // Should be sequential: 0,1,2 for alice, then 3,4 for bob
    assert_eq!(token_ids.get(0), Some(0));
    assert_eq!(token_ids.get(1), Some(1));
    assert_eq!(token_ids.get(2), Some(2));
    assert_eq!(token_ids.get(3), Some(3));
    assert_eq!(token_ids.get(4), Some(4));
}
// See contracts/Minter/tests/ for batch minting tests

#[test]
fn batch_mint_assigns_contiguous_ids_owners_and_balances() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    let recipients = soroban_sdk::vec![&e, alice.clone(), bob.clone(), alice.clone()];
    let amounts = soroban_sdk::vec![&e, 2u128, 3u128, 1u128];
    let ids = client.batch_mint(&owner, &recipients, &amounts);

    assert_eq!(ids, soroban_sdk::vec![&e, 0u32, 1, 2, 3, 4, 5]);
    for id in [0u32, 1, 5] {
        assert_eq!(
            client.owner_of(&id),
            if id < 2 || id == 5 {
                alice.clone()
            } else {
                bob.clone()
            }
        );
    }
    assert_eq!(client.balance(&alice), 3);
    assert_eq!(client.balance(&bob), 3);
    assert_eq!(client.total_supply(), 6);

    // Counter advanced by exactly the batch size
    let next = client.batch_mint(
        &owner,
        &soroban_sdk::vec![&e, bob.clone()],
        &soroban_sdk::vec![&e, 1u128],
    );
    assert_eq!(next, soroban_sdk::vec![&e, 6u32]);
}

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
        let id = deploy(
            &e,
            Address::generate(&e),
            Address::generate(&e),
            mgr.address.clone(),
            from.clone(),
        );
        let client = DaoTokenContractClient::new(&e, &id);
        mgr.register(&from, &String::from_str(&e, "0.1.0"));
        assert_eq!(client.version(), String::from_str(&e, "0.1.0"));
        assert_eq!(client.wasm_hash(), from);
        // No sync step (D6): the registry record is the version.
        mgr.register(&from, &String::from_str(&e, "0.1.1"));
        assert_eq!(client.version(), String::from_str(&e, "0.1.1"));
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        client.upgrade(&from, &to);

        // Contract code is swapped to an empty module; read the stored keys directly.
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), to);
            assert_eq!(
                common::upgrade::version(&e, &mgr.address),
                String::from_str(&e, "0.2.0")
            );
        });
    }

    #[test]
    fn upgrade_rejected_when_not_approved() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = deploy(
            &e,
            Address::generate(&e),
            Address::generate(&e),
            mgr.address.clone(),
            from.clone(),
        );
        let client = DaoTokenContractClient::new(&e, &id);
        mgr.register(&from, &String::from_str(&e, "0.1.0"));
        assert_eq!(client.version(), String::from_str(&e, "0.1.0"));
        assert_eq!(client.wasm_hash(), from);
        // No sync step (D6): the registry record is the version.
        mgr.register(&from, &String::from_str(&e, "0.1.1"));
        assert_eq!(client.version(), String::from_str(&e, "0.1.1"));
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        let r = client.try_upgrade(&from, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::UpgradeNotApproved.into()
        );
    }

    #[test]
    fn upgrade_rejects_unauthorized_caller() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = deploy(
            &e,
            Address::generate(&e),
            Address::generate(&e),
            mgr.address.clone(),
            from.clone(),
        );
        let client = DaoTokenContractClient::new(&e, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        mgr.register(&from, &String::from_str(&e, "0.1.1"));
        // Drop mock_all_auths: no authorization is provided for any address.
        e.set_auths(&[]);
        assert!(client.try_upgrade(&from, &to).is_err());
        e.mock_all_auths();
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), from);
            assert_eq!(
                common::upgrade::version(&e, &mgr.address),
                String::from_str(&e, "0.1.1")
            );
        });
    }

    #[test]
    fn upgrade_hash_mismatch_leaves_state_unchanged() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = deploy(
            &e,
            Address::generate(&e),
            Address::generate(&e),
            mgr.address.clone(),
            from.clone(),
        );
        let client = DaoTokenContractClient::new(&e, &id);
        let wrong = BytesN::from_array(&e, &[9u8; 32]);
        mgr.register(&from, &String::from_str(&e, "0.1.0"));
        mgr.approve(&wrong, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        let r = client.try_upgrade(&wrong, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::HashMismatch.into()
        );
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), from);
            assert_eq!(
                common::upgrade::version(&e, &mgr.address),
                String::from_str(&e, "0.1.0")
            );
        });
    }

    #[test]
    fn version_follows_the_registry_after_upgrade() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = deploy(
            &e,
            Address::generate(&e),
            Address::generate(&e),
            mgr.address.clone(),
            from.clone(),
        );
        let client = DaoTokenContractClient::new(&e, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        client.upgrade(&from, &to);
        // The contract code is now an empty module, so call the Rust entrypoints
        // directly in the contract context against the post-upgrade storage.
        e.as_contract(&id, || {
            assert_eq!(DaoTokenContract::version(&e), String::from_str(&e, "0.2.0"));
            assert_eq!(DaoTokenContract::wasm_hash(&e), to);
        });
        mgr.register(&to, &String::from_str(&e, "0.2.1"));
        e.as_contract(&id, || {
            assert_eq!(DaoTokenContract::version(&e), String::from_str(&e, "0.2.1"));
        });
    }
}

#[test]
fn launch_rejects_an_unwired_treasury() {
    let (e, client, _owner, _m) = setup_with_manager();
    let wired = wired_treasury(&e, &client);
    let other = Address::generate(&e);
    let r = client.try_launch(&other, &vec![&e]);
    assert_eq!(
        r.err().unwrap().unwrap(),
        TokenError::TreasuryMismatch.into()
    );
    assert!(!client.is_live());
    client.launch(&wired, &vec![&e]);
    assert!(client.is_live());
}

#[test]
fn launch_requires_manager_auth() {
    let e = Env::default();
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let manager = Address::generate(&e);
    let id = deploy(
        &e,
        owner.clone(),
        treasury.clone(),
        manager.clone(),
        BytesN::from_array(&e, &[0u8; 32]),
    );
    let client = DaoTokenContractClient::new(&e, &id);
    let none: soroban_sdk::Vec<MintGrant> = vec![&e];
    // Only a non-manager address authorizes the call.
    e.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "launch",
            args: (&treasury, &none).into_val(&e),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_launch(&treasury, &none).is_err());
    assert!(!client.is_live());
    // The manager's own authorization succeeds.
    e.mock_auths(&[MockAuth {
        address: &manager,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "launch",
            args: (&treasury, &none).into_val(&e),
            sub_invokes: &[],
        },
    }]);
    client.launch(&treasury, &none);
    assert!(client.is_live());
}

/// Address wired under `key` in the token's instance storage.
fn wired(e: &Env, client: &DaoTokenContractClient, key: crate::storage::TokenKey) -> Address {
    e.as_contract(&client.address, || {
        e.storage().instance().get(&common::ns(e, key)).unwrap()
    })
}

/// Sum of balances that should carry votes: everyone except the three
/// system holders. Checked against `get_total_supply` after every step.
fn assert_voting_supply(client: &DaoTokenContractClient, holders: &[&Address], expected: u128) {
    let sum: u128 = holders.iter().map(|h| client.balance(h) as u128).sum();
    assert_eq!(sum, expected);
    assert_eq!(client.get_total_supply(), expected);
    assert_eq!(client.total_supply(), expected as i128);
}

mod voting_supply {
    use super::*;
    use crate::storage::TokenKey;

    #[test]
    fn system_holders_carry_no_votes_through_every_path() {
        let (e, client, owner) = setup();
        let treasury = wired(&e, &client, TokenKey::Treasury);
        let auction = client.auction().unwrap();
        let marketplace = client.marketplace().unwrap();
        let alice = Address::generate(&e);
        let bob = Address::generate(&e);
        let voters = [&alice, &bob];

        // Founder batch: tokens to the treasury carry no votes.
        client.batch_mint(
            &owner,
            &vec![&e, alice.clone(), treasury.clone()],
            &vec![&e, 3u128, 4u128],
        );
        assert_voting_supply(&client, &voters, 3);
        assert_eq!(client.balance(&treasury), 4);
        assert_eq!(client.get_votes(&treasury), 0);
        assert_eq!(client.get_delegate(&treasury), None);

        // Auction mint (single mint to a system holder): still no votes.
        let auctioned = client.mint(&owner, &auction);
        assert_voting_supply(&client, &voters, 3);

        // Settlement to a bidder mints the voting unit.
        client.transfer(&auction, &bob, &auctioned);
        assert_voting_supply(&client, &voters, 4);
        assert_eq!(client.get_votes(&bob), 1);

        // Listing escrows into the marketplace: the seller's vote is burned.
        client.approve(&alice, &marketplace, &0, &(e.ledger().sequence() + 100));
        client.transfer_from(&marketplace, &alice, &marketplace, &0);
        assert_voting_supply(&client, &voters, 3);
        assert_eq!(client.get_votes(&alice), 2);

        // Buy releases it to the buyer.
        client.transfer(&marketplace, &bob, &0);
        assert_voting_supply(&client, &voters, 4);
        assert_eq!(client.get_votes(&bob), 2);

        // A no-bid settlement moves auction -> treasury: no checkpoint churn.
        let unsold = client.mint(&owner, &auction);
        let before = client.get_total_supply();
        client.transfer(&auction, &treasury, &unsold);
        assert_eq!(client.get_total_supply(), before);
        assert_eq!(client.balance(&treasury), 5);

        // A treasury payout (by proposal) mints the voting unit to the recipient.
        client.transfer(&treasury, &alice, &unsold);
        assert_voting_supply(&client, &voters, 5);
        assert_eq!(client.get_votes(&alice), 3);
    }

    #[test]
    fn delegated_votes_follow_system_transfers() {
        let (e, client, owner) = setup();
        let marketplace = client.marketplace().unwrap();
        let alice = Address::generate(&e);
        let carol = Address::generate(&e);
        let id = client.mint(&owner, &alice);
        client.delegate(&alice, &carol);
        assert_eq!(client.get_votes(&carol), 1);

        client.transfer(&alice, &marketplace, &id);
        assert_eq!(client.get_votes(&carol), 0);
        assert_eq!(client.get_total_supply(), 0);

        client.transfer(&marketplace, &alice, &id);
        assert_eq!(client.get_votes(&carol), 1);
        assert_eq!(client.get_total_supply(), 1);
    }
}

#[test]
fn batch_mint_respects_the_event_budget() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let max = common::MAX_BATCH_MINT as u128;
    let too_large = |r: Result<_, Result<soroban_sdk::Error, _>>| {
        assert_eq!(
            r.err().unwrap().unwrap(),
            crate::error::TokenError::BatchTooLarge.into()
        )
    };

    let ids = client.batch_mint(&owner, &vec![&e, alice.clone()], &vec![&e, max]);
    assert_eq!(ids.len(), common::MAX_BATCH_MINT);
    too_large(client.try_batch_mint(&owner, &vec![&e, alice.clone()], &vec![&e, max + 1]));

    // A second recipient costs more than one token, so the cap drops.
    too_large(client.try_batch_mint(
        &owner,
        &vec![&e, alice.clone(), bob.clone()],
        &vec![&e, max - 1, 1u128],
    ));

    // The recipient cap with one token each.
    let mut recipients = soroban_sdk::Vec::new(&e);
    let mut amounts = soroban_sdk::Vec::new(&e);
    for _ in 0..common::MAX_BATCH_RECIPIENTS {
        recipients.push_back(Address::generate(&e));
        amounts.push_back(1u128);
    }
    let ids = client.batch_mint(&owner, &recipients, &amounts);
    assert_eq!(ids.len(), common::MAX_BATCH_RECIPIENTS);
    recipients.push_back(Address::generate(&e));
    amounts.push_back(1u128);
    too_large(client.try_batch_mint(&owner, &recipients, &amounts));

    // u32 overflow of the running total is reported the same way.
    too_large(client.try_batch_mint(
        &owner,
        &vec![&e, alice.clone(), bob.clone()],
        &vec![&e, u32::MAX as u128, 1u128],
    ));
}

#[test]
fn batch_mint_emits_one_minter_event_for_the_range() {
    use crate::events::MintBatchWithMinter;
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::xdr::{ContractEventBody, ScSymbol, ScVal};
    use soroban_sdk::Event as _;

    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    client.mint(&owner, &alice);
    client.batch_mint(
        &owner,
        &vec![&e, alice.clone(), bob.clone()],
        &vec![&e, 2u128, 3u128],
    );

    let events = e.events().all();
    let events = events.events();
    let named = |name: &str| {
        let sym = ScVal::Symbol(ScSymbol(name.try_into().unwrap()));
        events
            .iter()
            .filter(|ev| match &ev.body {
                ContractEventBody::V0(b) => b.topics.first() == Some(&sym),
            })
            .count()
    };
    assert_eq!(named("mint"), 5);
    assert_eq!(named("mint_with_minter"), 0);
    assert_eq!(named("mint_batch_with_minter"), 1);
    assert!(events.contains(
        &MintBatchWithMinter {
            minter: owner.clone(),
            first_token_id: 1,
            count: 5,
        }
        .to_xdr(&e, &client.address)
    ));
}

#[test]
fn batch_mint_extends_owner_entries() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    client.batch_mint(&owner, &vec![&e, alice.clone()], &vec![&e, 2u128]);
    let ttl = e.as_contract(&client.address, || {
        e.storage()
            .persistent()
            .get_ttl(&stellar_tokens::non_fungible::NFTStorageKey::Owner(1))
    });
    assert!(ttl >= common::ttl::PERSISTENT_TTL_THRESHOLD);
}

#[test]
fn mint_allowance_lives_in_persistent_storage() {
    let (e, client, _owner, _m) = setup_with_manager();
    let claims = module(&e, &client, "claims", false);
    launch(&e, &client, &[(&claims, 9)]);
    let key = common::ns(&e, crate::storage::TokenKey::MintAllowance(claims.clone()));
    e.as_contract(&client.address, || {
        assert!(!e.storage().instance().has(&key));
        assert_eq!(e.storage().persistent().get::<_, u32>(&key), Some(9));
    });
}

#[test]
fn migrate_is_admin_gated_and_needs_a_newer_layout() {
    let (e, client, _owner) = setup();
    assert_eq!(client.storage_version(), crate::storage::STORAGE_VERSION);
    e.set_auths(&[]);
    assert!(client.try_migrate().is_err());
    e.mock_all_auths();
    assert_eq!(
        client.try_migrate().err().unwrap().unwrap(),
        CommonError::NothingToMigrate.into()
    );
}

/// Voting power and delegation around the three non-voting system holders
/// (Treasury, Auction, Marketplace). Each test checks votes, delegates and the
/// voting supply after every step, because a mistake here either inflates
/// quorum (governance freeze) or conjures votes (governance capture).
mod delegation_security {
    use super::*;
    use crate::storage::TokenKey;

    struct World {
        e: Env,
        token: DaoTokenContractClient<'static>,
        admin: Address,
        treasury: Address,
        auction: Address,
        marketplace: Address,
    }

    fn world() -> World {
        let (e, token, admin) = setup();
        let treasury = wired(&e, &token, TokenKey::Treasury);
        let auction = token.auction().unwrap();
        let marketplace = token.marketplace().unwrap();
        World {
            e,
            token,
            admin,
            treasury,
            auction,
            marketplace,
        }
    }

    impl World {
        fn mint_to(&self, to: &Address) -> u32 {
            self.token.mint(&self.admin, to)
        }
        /// Escrow `id` from `seller` into the marketplace the way `list` does.
        fn list(&self, seller: &Address, id: u32) {
            self.token.approve(
                seller,
                &self.marketplace,
                &id,
                &(self.e.ledger().sequence() + 100),
            );
            self.token
                .transfer_from(&self.marketplace, seller, &self.marketplace, &id);
        }
        fn assert_system_holders_vote_free(&self) {
            for h in [&self.treasury, &self.auction, &self.marketplace] {
                assert_eq!(self.token.get_votes(h), 0, "system holder has votes");
                assert_eq!(
                    self.token.get_delegate(h),
                    None,
                    "system holder auto-delegated"
                );
            }
        }
    }

    #[test]
    fn system_holders_are_never_auto_delegated_on_any_receive_path() {
        let w = world();
        let alice = Address::generate(&w.e);
        // mint, batch_mint, transfer and transfer_from into each system holder.
        let a = w.mint_to(&w.auction);
        w.token.batch_mint(
            &w.admin,
            &vec![&w.e, w.treasury.clone(), w.marketplace.clone()],
            &vec![&w.e, 2u128, 1u128],
        );
        let b = w.mint_to(&alice);
        w.token.transfer(&alice, &w.treasury, &b);
        let c = w.mint_to(&alice);
        w.list(&alice, c);
        w.token.transfer(&w.auction, &w.treasury, &a);
        w.assert_system_holders_vote_free();
        assert_eq!(w.token.get_total_supply(), 0);
        assert_eq!(w.token.balance(&w.treasury), 4);
        // Alice keeps her own self-delegation, now with no units behind it.
        assert_eq!(w.token.get_delegate(&alice), Some(alice.clone()));
        assert_eq!(w.token.get_votes(&alice), 0);
    }

    #[test]
    fn listing_moves_votes_off_the_sellers_delegate_and_cancel_restores_them() {
        let w = world();
        let seller = Address::generate(&w.e);
        let carol = Address::generate(&w.e);
        let id = w.mint_to(&seller);
        w.mint_to(&seller);
        w.token.delegate(&seller, &carol);
        assert_eq!(w.token.get_votes(&carol), 2);

        w.list(&seller, id);
        assert_eq!(w.token.get_votes(&carol), 1);
        assert_eq!(w.token.get_delegate(&seller), Some(carol.clone()));
        assert_eq!(w.token.get_total_supply(), 1);
        w.assert_system_holders_vote_free();

        // Cancel: the token returns and the vote goes back to the same delegate.
        w.token.transfer(&w.marketplace, &seller, &id);
        assert_eq!(w.token.get_votes(&carol), 2);
        assert_eq!(w.token.get_delegate(&seller), Some(carol));
        assert_eq!(w.token.get_total_supply(), 2);
    }

    #[test]
    fn a_buyer_keeps_their_delegation_and_their_delegate_gains_the_vote() {
        let w = world();
        let seller = Address::generate(&w.e);
        let carol = Address::generate(&w.e);
        let buyer = Address::generate(&w.e);
        let dave = Address::generate(&w.e);
        let id = w.mint_to(&seller);
        w.token.delegate(&seller, &carol);
        // The buyer already holds a token and delegates it to dave.
        w.mint_to(&buyer);
        w.token.delegate(&buyer, &dave);

        w.list(&seller, id);
        w.token.transfer(&w.marketplace, &buyer, &id);
        assert_eq!(w.token.get_votes(&carol), 0);
        assert_eq!(w.token.get_votes(&dave), 2);
        assert_eq!(w.token.get_delegate(&buyer), Some(dave));
        assert_eq!(w.token.get_votes(&buyer), 0);
        assert_eq!(w.token.get_total_supply(), 2);
    }

    #[test]
    fn a_first_time_buyer_is_self_delegated() {
        let w = world();
        let seller = Address::generate(&w.e);
        let buyer = Address::generate(&w.e);
        let id = w.mint_to(&seller);
        w.list(&seller, id);
        assert_eq!(w.token.get_delegate(&buyer), None);
        w.token.transfer(&w.marketplace, &buyer, &id);
        assert_eq!(w.token.get_delegate(&buyer), Some(buyer.clone()));
        assert_eq!(w.token.get_votes(&buyer), 1);
    }

    #[test]
    fn redelegating_while_listed_moves_nothing_until_the_token_returns() {
        let w = world();
        let seller = Address::generate(&w.e);
        let carol = Address::generate(&w.e);
        let erin = Address::generate(&w.e);
        let id = w.mint_to(&seller);
        w.token.delegate(&seller, &carol);
        w.list(&seller, id);
        // Zero units held: changing delegate moves no votes.
        w.token.delegate(&seller, &erin);
        assert_eq!(w.token.get_votes(&carol), 0);
        assert_eq!(w.token.get_votes(&erin), 0);
        assert_eq!(w.token.get_total_supply(), 0);
        w.token.transfer(&w.marketplace, &seller, &id);
        assert_eq!(w.token.get_votes(&erin), 1);
        assert_eq!(w.token.get_votes(&carol), 0);
    }

    #[test]
    fn treasury_delegating_explicitly_cannot_conjure_votes() {
        let w = world();
        let mallory = Address::generate(&w.e);
        let alice = Address::generate(&w.e);
        // e.g. a proposal makes the Treasury call `delegate(treasury, mallory)`.
        w.token.delegate(&w.treasury, &mallory);
        assert_eq!(w.token.get_delegate(&w.treasury), Some(mallory.clone()));
        // Tokens arriving at the Treasury still carry no votes for mallory.
        w.mint_to(&w.treasury);
        let id = w.mint_to(&alice);
        w.token.transfer(&alice, &w.treasury, &id);
        assert_eq!(w.token.get_votes(&mallory), 0);
        assert_eq!(w.token.get_total_supply(), 0);
        // Paying them out never underflows mallory or credits her.
        w.token.transfer(&w.treasury, &alice, &id);
        assert_eq!(w.token.get_votes(&mallory), 0);
        assert_eq!(w.token.get_votes(&alice), 1);
        assert_eq!(w.token.get_total_supply(), 1);
        // The same holds for the auction and marketplace.
        w.token.delegate(&w.auction, &mallory);
        w.token.delegate(&w.marketplace, &mallory);
        w.mint_to(&w.auction);
        w.list(&alice, id);
        assert_eq!(w.token.get_votes(&mallory), 0);
        assert_eq!(w.token.get_total_supply(), 0);
    }

    #[test]
    fn delegating_to_the_treasury_keeps_those_votes_in_the_voting_supply() {
        let w = world();
        let alice = Address::generate(&w.e);
        w.mint_to(&alice);
        w.mint_to(&alice);
        // A holder may delegate to any address, including the Treasury. Those
        // units belong to a voting-capable holder, so they stay in the supply;
        // the Treasury can only use them through a passed proposal.
        w.token.delegate(&alice, &w.treasury);
        assert_eq!(w.token.get_votes(&w.treasury), 2);
        assert_eq!(w.token.get_total_supply(), 2);
        assert_eq!(w.token.get_delegate(&w.treasury), None);
        w.token.delegate(&alice, &alice);
        assert_eq!(w.token.get_votes(&w.treasury), 0);
        assert_eq!(w.token.get_votes(&alice), 2);
    }

    #[test]
    fn moves_between_system_holders_write_no_vote_checkpoints() {
        let w = world();
        let alice = Address::generate(&w.e);
        w.mint_to(&alice); // one voting token, so the supply has a checkpoint
        let id = w.mint_to(&w.auction);
        let supply_at = |w: &World| {
            w.e.as_contract(&w.token.address, || {
                w.e.storage().persistent().get::<_, u32>(
                    &stellar_governance::votes::VotesStorageKey::NumTotalSupplyCheckpoints,
                )
            })
        };
        let before = supply_at(&w);
        w.token.transfer(&w.auction, &w.treasury, &id);
        w.token.transfer(&w.treasury, &w.marketplace, &id);
        assert_eq!(supply_at(&w), before);
        assert_eq!(w.token.get_total_supply(), 1);
    }

    #[test]
    fn past_checkpoints_are_unaffected_by_later_listings() {
        use soroban_sdk::testutils::Ledger as _;
        let w = world();
        let seller = Address::generate(&w.e);
        let id = w.mint_to(&seller);
        w.mint_to(&seller);
        w.e.ledger()
            .set_sequence_number(w.e.ledger().sequence() + 10);
        let snapshot = w.e.ledger().sequence() - 1;
        w.e.ledger()
            .set_sequence_number(w.e.ledger().sequence() + 10);
        w.list(&seller, id);
        // A proposal snapshotted earlier still sees both votes and the full supply.
        assert_eq!(w.token.get_votes_at_checkpoint(&seller, &snapshot), 2);
        assert_eq!(w.token.get_total_supply_at_checkpoint(&snapshot), 2);
        // Current values reflect the listing.
        assert_eq!(w.token.get_votes(&seller), 1);
        assert_eq!(w.token.get_total_supply(), 1);
    }
}

#[test]
fn set_metadata_renames_and_emits_metadata_updated() {
    use crate::events::MetadataUpdated;
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::Event as _;

    let (e, client, _owner) = setup();
    let metadata_contract = client.metadata();
    let name = String::from_str(&e, "Lantern Club");
    let symbol = String::from_str(&e, "LANTERN");
    client.set_metadata(&name, &symbol);

    // Read events first: the next invocation (as_contract) starts a fresh event buffer.
    let events = e.events().all();
    assert!(events.events().contains(
        &MetadataUpdated {
            name: name.clone(),
            symbol: symbol.clone(),
        }
        .to_xdr(&e, &client.address)
    ));
    e.as_contract(&client.address, || {
        assert_eq!(stellar_tokens::non_fungible::Base::name(&e), name);
        assert_eq!(stellar_tokens::non_fungible::Base::symbol(&e), symbol);
    });
    // A rename no longer clobbers the metadata contract address (shared key).
    assert_eq!(client.metadata(), metadata_contract);
}

/// Regression: `TokenKey::MetadataContract` used to encode to the same instance key as
/// OpenZeppelin's `NFTStorageKey::Metadata`, so the metadata contract address
/// overwrote the collection name, symbol and URI at construction.
#[test]
fn name_symbol_and_metadata_contract_are_stored_separately() {
    let (e, client, _owner) = setup();
    assert_eq!(client.name(), String::from_str(&e, "DAO Vote NFT"));
    assert_eq!(client.symbol(), String::from_str(&e, "vDAO"));
    assert!(client.metadata().is_some());
}

// ---- SEP-50 completion ----

/// An operator approved for all moves votes exactly as a direct transfer.
#[test]
fn operator_transfer_moves_votes_like_a_direct_transfer() {
    use soroban_sdk::testutils::Ledger;
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let operator = Address::generate(&e);
    let t1 = client.mint(&owner, &alice);
    let t2 = client.mint(&owner, &alice);
    let until = e.ledger().sequence() + 100;
    client.approve_for_all(&alice, &operator, &until);
    assert!(client.is_approved_for_all(&alice, &operator));
    assert!(!client.is_approved_for_all(&bob, &operator));

    // Direct transfer and operator transfer leave the same vote state.
    client.transfer(&alice, &bob, &t1);
    assert_eq!((client.get_votes(&alice), client.get_votes(&bob)), (1, 1));
    client.transfer_from(&operator, &alice, &bob, &t2);
    assert_eq!((client.get_votes(&alice), client.get_votes(&bob)), (0, 2));
    assert_eq!(client.get_delegate(&bob), Some(bob.clone()));

    // An expired operator approval cannot transfer.
    let t3 = client.mint(&owner, &alice);
    e.ledger().set_sequence_number(until + 1);
    assert!(!client.is_approved_for_all(&alice, &operator));
    assert!(client
        .try_transfer_from(&operator, &alice, &bob, &t3)
        .is_err());
    assert_eq!(client.get_votes(&alice), 1);
}

#[test]
fn single_token_approval_is_readable_expires_and_clears_on_transfer() {
    use soroban_sdk::testutils::Ledger;
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let spender = Address::generate(&e);
    let t = client.mint(&owner, &alice);
    assert_eq!(client.get_approved(&t), None);
    let until = e.ledger().sequence() + 50;
    client.approve(&alice, &spender, &t, &until);
    assert_eq!(client.get_approved(&t), Some(spender.clone()));
    client.transfer(&alice, &owner, &t);
    assert_eq!(client.get_approved(&t), None);

    let t2 = client.mint(&owner, &alice);
    client.approve(&alice, &spender, &t2, &(e.ledger().sequence() + 5));
    e.ledger().set_sequence_number(e.ledger().sequence() + 6);
    assert_eq!(client.get_approved(&t2), None);
    assert!(client
        .try_transfer_from(&spender, &alice, &owner, &t2)
        .is_err());

    // SEP-50: unknown tokens panic.
    assert!(client.try_get_approved(&999).is_err());
    assert!(client.try_token_uri(&999).is_err());
}

/// The name is copied verbatim into the on-chain token JSON.
#[test]
fn collection_name_may_not_contain_json_breaking_characters() {
    let (e, client, _owner) = setup();
    for bad in ["Club \"X\"", "back\\slash", "tab\tname"] {
        assert_eq!(
            client
                .try_set_metadata(&String::from_str(&e, bad), &String::from_str(&e, "X"))
                .err()
                .unwrap()
                .unwrap(),
            crate::error::TokenError::InvalidName.into()
        );
    }
    client.set_metadata(
        &String::from_str(&e, "Lantern's Club"),
        &String::from_str(&e, "LC"),
    );
    assert_eq!(client.name(), String::from_str(&e, "Lantern's Club"));
}

#[test]
fn wiring_getters_expose_every_module() {
    let (e, client, _owner, manager) = setup_with_manager();
    assert_eq!(client.manager(), manager);
    let treasury = wired_treasury(&e, &client);
    assert_eq!(client.treasury(), treasury);
    assert!(client.auction().is_some());
    assert!(client.marketplace().is_some());
    assert!(client.metadata().is_some());
    // The constructor registers the Auction and Marketplace as non-voting modules.
    let entries = client.modules();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries.get(0).unwrap().kind, Symbol::new(&e, "auction"));
    assert_eq!(entries.get(1).unwrap().kind, Symbol::new(&e, "marketplace"));
    assert!(entries.iter().all(|m| m.non_voting));
}

/// docs/STORAGE_DIET_REVIEW.md Finding 1: no token key may encode like an
/// OpenZeppelin key the token links (the old `TokenKey::MetadataContract` did).
#[test]
fn storage_keys_do_not_collide() {
    use common::testutils::{
        assert_keys_disjoint, common_key_shapes, key_shape, shapes, OZ_SEQUENTIAL_SHAPES,
    };
    use soroban_sdk::{IntoVal, Val};
    use stellar_governance::votes::VotesStorageKey;
    use stellar_tokens::non_fungible::NFTStorageKey;
    let e = Env::default();
    let a = Address::generate(&e);
    let all = |keys: std::vec::Vec<Val>| keys.into_iter().map(|k| key_shape(&e, k)).collect();
    // Every variant, checked exhaustively next to the enum.
    let token = all(crate::storage::key_samples::all(&e));
    let nft = all(std::vec![
        NFTStorageKey::Owner(0).into_val(&e),
        NFTStorageKey::Balance(a.clone()).into_val(&e),
        NFTStorageKey::Approval(0).into_val(&e),
        NFTStorageKey::ApprovalForAll(a.clone(), a.clone()).into_val(&e),
        NFTStorageKey::Metadata.into_val(&e),
    ]);
    let votes = all(std::vec![
        VotesStorageKey::Delegatee(a.clone()).into_val(&e),
        VotesStorageKey::NumCheckpoints(a.clone()).into_val(&e),
        VotesStorageKey::DelegateCheckpoint(a.clone(), 0).into_val(&e),
        VotesStorageKey::NumTotalSupplyCheckpoints.into_val(&e),
        VotesStorageKey::TotalSupplyCheckpoint(0).into_val(&e),
        VotesStorageKey::VotingUnits(a.clone()).into_val(&e),
    ]);
    assert_keys_disjoint(&[
        ("TokenKey", token),
        ("common", common_key_shapes(&e)),
        ("NFTStorageKey", nft),
        ("NFTSequentialStorageKey", shapes(OZ_SEQUENTIAL_SHAPES)),
        ("VotesStorageKey", votes),
    ]);
}

/// A rename must leave minting working: the metadata hook survives
/// `set_metadata` and every mint path still seeds attributes.
#[test]
fn mint_and_batch_mint_seed_attributes_after_a_rename() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let metadata = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            treasury,
            String::from_str(&e, "Before"),
            String::from_str(&e, "B"),
            metadata.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    e.register_at(&metadata, HookCounter, ());
    let client = DaoTokenContractClient::new(&e, &token_id);
    client.set_metadata(&String::from_str(&e, "After"), &String::from_str(&e, "A"));
    assert_eq!(client.metadata(), Some(metadata.clone()));
    client.mint(&owner, &owner);
    client.batch_mint(&owner, &vec![&e, owner.clone()], &vec![&e, 3u128]);
    let hooks = HookCounterClient::new(&e, &metadata);
    assert_eq!(hooks.single(), 1);
    assert_eq!(hooks.batch(), 3);
}

/// Stands in for the Metadata contract: counts the mint hooks it receives.
#[soroban_sdk::contract]
struct HookCounter;

#[soroban_sdk::contractimpl]
impl HookCounter {
    pub fn on_minted(e: Env, _token_id: u32) -> bool {
        let n: u32 = e.storage().instance().get(&1u32).unwrap_or(0);
        e.storage().instance().set(&1u32, &(n + 1));
        true
    }
    pub fn on_minted_batch(e: Env, _first: u32, count: u32) -> bool {
        let n: u32 = e.storage().instance().get(&2u32).unwrap_or(0);
        e.storage().instance().set(&2u32, &(n + count));
        true
    }
    pub fn single(e: Env) -> u32 {
        e.storage().instance().get(&1u32).unwrap_or(0)
    }
    pub fn batch(e: Env) -> u32 {
        e.storage().instance().get(&2u32).unwrap_or(0)
    }
}

/// `token_uri` names its own missing dependency, not the Manager's.
#[test]
fn token_uri_without_a_metadata_address_says_so() {
    let (e, client, owner) = setup();
    let id = client.mint(&owner, &owner);
    e.as_contract(&client.address, || {
        e.storage()
            .instance()
            .remove(&common::ns(&e, crate::storage::TokenKey::MetadataContract));
    });
    assert_eq!(
        client.try_token_uri(&id).err().unwrap().unwrap(),
        crate::error::TokenError::MetadataNotSet.into()
    );
}

/// docs/designs/membership-models.md §1: the module registry.
mod registry {
    use super::*;

    /// Σ account checkpoints == TotalSupply == Σ voting-holder balances.
    fn assert_books(client: &DaoTokenContractClient, accounts: &[&Address], voting: u128) {
        let votes: u128 = accounts.iter().map(|a| client.get_votes(a)).sum();
        assert_eq!(client.get_total_supply(), voting);
        assert_eq!(
            votes, voting,
            "account checkpoints must add up to TotalSupply"
        );
    }

    #[test]
    fn registering_a_holder_non_voting_removes_its_votes_from_its_delegate() {
        let (e, client, owner, _m) = setup_with_manager();
        let vault = stub(&e);
        let carol = Address::generate(&e);
        let alice = Address::generate(&e);
        client.batch_mint(
            &owner,
            &vec![&e, vault.clone(), alice.clone()],
            &vec![&e, 3u128, 2u128],
        );
        client.delegate(&vault, &carol);
        assert_books(&client, &[&vault, &carol, &alice], 5);
        assert_eq!(client.get_votes(&carol), 3);

        client.register_module(&Symbol::new(&e, "custom_vault"), &vault, &true);
        // review 2 D2: the delegate loses k, the module's units are zero.
        assert_eq!(client.get_votes(&carol), 0);
        assert_books(&client, &[&vault, &carol, &alice], 2);
        e.as_contract(&client.address, || {
            assert_eq!(stellar_governance::votes::get_voting_units(&e, &vault), 0);
        });
    }

    #[test]
    fn unregistering_a_holding_module_self_delegates_before_votes_return() {
        let (e, client, owner, _m) = setup_with_manager();
        let marketplace = client.marketplace().unwrap();
        let alice = Address::generate(&e);
        // Tokens reach the module only while it is non-voting: no delegate.
        client.batch_mint(
            &owner,
            &vec![&e, marketplace.clone(), alice.clone()],
            &vec![&e, 4u128, 1u128],
        );
        assert_eq!(client.get_delegate(&marketplace), None);
        assert_books(&client, &[&marketplace, &alice], 1);

        client.unregister_module(&marketplace);
        // review 2 A1: without the self-delegation TotalSupply would grow by 4
        // with nobody's checkpoint following.
        assert_eq!(client.get_delegate(&marketplace), Some(marketplace.clone()));
        assert_eq!(client.get_votes(&marketplace), 4);
        assert_books(&client, &[&marketplace, &alice], 5);
        assert_eq!(client.marketplace(), None);
    }

    #[test]
    fn only_deployed_wasm_contracts_can_be_modules() {
        let (e, client, _owner, _m) = setup_with_manager();
        let kind = Symbol::new(&e, "claims");
        // A wallet, and a predicted address with nothing deployed (review 2 D6).
        for address in [Address::generate(&e), Address::generate(&e)] {
            let r = client.try_register_module(&kind, &address, &false);
            assert_eq!(r.err().unwrap().unwrap(), TokenError::NotAContract.into());
        }
        // A Stellar Asset Contract is not a module either.
        let sac = e
            .register_stellar_asset_contract_v2(Address::generate(&e))
            .address();
        let r = client.try_register_module(&kind, &sac, &false);
        assert_eq!(r.err().unwrap().unwrap(), TokenError::NotAContract.into());
        // Once deployed, the same kind of address registers.
        client.register_module(&kind, &stub(&e), &false);
    }

    #[test]
    fn kinds_are_built_in_or_custom_and_unique() {
        let (e, client, _owner, _m) = setup_with_manager();
        for bad in ["shop", "custom_", "Claims", "custom"] {
            let r = client.try_register_module(&Symbol::new(&e, bad), &stub(&e), &false);
            assert_eq!(
                r.err().unwrap().unwrap(),
                TokenError::InvalidKind.into(),
                "{bad}"
            );
        }
        client.register_module(
            &Symbol::new(&e, "custom_abcdefghijklmnopqrstuvwxy"),
            &stub(&e),
            &false,
        );
        // The constructor already holds `auction` and `marketplace`.
        let r = client.try_register_module(&Symbol::new(&e, "auction"), &stub(&e), &true);
        assert_eq!(r.err().unwrap().unwrap(), TokenError::KindTaken.into());
        let marketplace = client.marketplace().unwrap();
        let r = client.try_register_module(&Symbol::new(&e, "claims"), &marketplace, &false);
        assert!(r.is_err(), "an address registers once");
    }

    #[test]
    fn the_registry_is_capped() {
        let (e, client, _owner, _m) = setup_with_manager();
        // Two constructor entries plus fourteen custom ones fill the 16 slots.
        for i in 0..14 {
            let kind = std::format!("custom_m{i}");
            client.register_module(&Symbol::new(&e, &kind), &stub(&e), &false);
        }
        let r = client.try_register_module(&Symbol::new(&e, "custom_last"), &stub(&e), &false);
        assert_eq!(r.err().unwrap().unwrap(), TokenError::TooManyModules.into());
    }

    #[test]
    fn unregistering_zeroes_the_allowance_and_emits() {
        let (e, client, _owner, _m) = setup_with_manager();
        let claims = module(&e, &client, "claims", false);
        client.increase_mint_allowance(&claims, &5);
        client.unregister_module(&claims);
        assert_eq!(client.mint_allowance(&claims), 0);
        let r = client.try_unregister_module(&claims);
        assert_eq!(r.err().unwrap().unwrap(), TokenError::NotAModule.into());
    }

    #[test]
    fn registration_needs_the_manager_in_setup_and_the_admin_once_live() {
        let e = Env::default();
        let owner = Address::generate(&e);
        let treasury = Address::generate(&e);
        let manager = Address::generate(&e);
        let id = deploy(
            &e,
            owner.clone(),
            treasury.clone(),
            manager.clone(),
            BytesN::from_array(&e, &[0u8; 32]),
        );
        let client = DaoTokenContractClient::new(&e, &id);
        let kind = Symbol::new(&e, "claims");
        let a = stub(&e);
        let auth = |who: &Address| {
            e.mock_auths(&[MockAuth {
                address: who,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "register_module",
                    args: (&kind, &a, false).into_val(&e),
                    sub_invokes: &[],
                },
            }]);
        };
        // Setup: the launch admin can't, the Manager can.
        auth(&owner);
        assert!(client.try_register_module(&kind, &a, &false).is_err());
        auth(&manager);
        client.register_module(&kind, &a, &false);

        e.mock_all_auths();
        client.launch(&treasury, &vec![&e]);
        let b = stub(&e);
        let circle = Symbol::new(&e, "circle");
        // Live: the Manager can't, the admin (Treasury) can.
        e.mock_auths(&[MockAuth {
            address: &manager,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "register_module",
                args: (&circle, &b, false).into_val(&e),
                sub_invokes: &[],
            },
        }]);
        assert!(client.try_register_module(&circle, &b, &false).is_err());
        e.mock_auths(&[MockAuth {
            address: &treasury,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "register_module",
                args: (&circle, &b, false).into_val(&e),
                sub_invokes: &[],
            },
        }]);
        client.register_module(&circle, &b, &false);
        assert_eq!(client.module(&circle), Some(b));
    }
}

#[test]
fn an_unlimited_allowance_is_never_spent() {
    let (e, client, _owner, _m) = setup_with_manager();
    let shop = module(&e, &client, "custom_shop", false);
    launch(&e, &client, &[(&shop, u32::MAX)]);
    client.batch_mint(&shop, &vec![&e, Address::generate(&e)], &vec![&e, 3u128]);
    assert_eq!(client.mint_allowance(&shop), u32::MAX);
}

#[test]
fn releasing_from_an_unlimited_allowance_keeps_it_unlimited() {
    let (e, client, _owner, manager) = setup_with_manager();
    let pool_module = module(&e, &client, "custom_pool", true);
    launch(&e, &client, &[(&pool_module, u32::MAX)]);
    // A closed pool gives back its unstocked rest: nothing to give back from
    // an allowance that was never spent.
    client.release_mint_allowance(&pool_module, &30);
    assert_eq!(client.mint_allowance(&pool_module), u32::MAX);
    // A finite one is lowered, saturating at zero.
    client.decrease_mint_allowance(&pool_module, &(u32::MAX - 10));
    client.release_mint_allowance(&pool_module, &30);
    assert_eq!(client.mint_allowance(&pool_module), 0);
    let _ = manager;
}
