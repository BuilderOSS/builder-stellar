extern crate std;

use common::CommonError;
use soroban_sdk::{testutils::Address as _, vec, Address, BytesN, Env, String};
use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
    IntoVal,
};

use crate::{DaoTokenContract, DaoTokenContractClient};

/// Register a token with `admin`, `treasury`, `manager` and `hash`; the
/// auction, marketplace and metadata addresses are fresh dummies.
fn deploy(
    e: &Env,
    admin: Address,
    treasury: Address,
    manager: Address,
    hash: BytesN<32>,
) -> Address {
    e.register(
        DaoTokenContract,
        (
            admin,
            treasury,
            Address::generate(e),
            Address::generate(e),
            String::from_str(e, "https://example.com/"),
            String::from_str(e, "DAO Vote NFT"),
            String::from_str(e, "vDAO"),
            Address::generate(e),
            manager,
            hash,
            String::from_str(e, "0.1.0"),
        ),
    )
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
            .get(&crate::storage::TokenKey::Treasury)
            .unwrap()
    })
}

/// Launch with `minters` (the wired treasury is always included, as the
/// Manager does); returns the treasury address.
fn launch(e: &Env, client: &DaoTokenContractClient, minters: &[Address]) -> Address {
    let treasury = wired_treasury(e, client);
    let mut v = soroban_sdk::Vec::new(e);
    v.push_back(treasury.clone());
    for m in minters {
        v.push_back(m.clone());
    }
    client.launch(&treasury, &v);
    treasury
}

#[test]
fn launch_sets_owner_and_exact_minter_set() {
    let (e, client, owner, _m) = setup_with_manager();
    let a = Address::generate(&e);
    let b = Address::generate(&e);
    let stranger = Address::generate(&e);
    let treasury = launch(&e, &client, &[a.clone(), b.clone()]);

    assert_eq!(client.admin(), treasury);
    assert!(client.mint_authority(&a));
    assert!(client.mint_authority(&b));
    assert!(!client.mint_authority(&stranger));
    assert!(!client.mint_authority(&owner));
}

#[test]
fn second_launch_panics_already_live() {
    let (e, client, _owner, _m) = setup_with_manager();
    launch(&e, &client, &[]);
    let r = client.try_launch(&Address::generate(&e), &vec![&e, Address::generate(&e)]);
    assert_eq!(r.err().unwrap().unwrap(), CommonError::AlreadyLive.into());
}

#[test]
fn set_mint_authority_before_launch_is_not_live() {
    let (e, client, _owner, _m) = setup_with_manager();
    let r = client.try_set_mint_authority(&Address::generate(&e), &true);
    assert_eq!(r.err().unwrap().unwrap(), CommonError::NotLive.into());
}

#[test]
fn set_mint_authority_after_launch_is_owner_gated() {
    let (e, client, _owner, _m) = setup_with_manager();
    launch(&e, &client, &[]);
    let x = Address::generate(&e);
    client.set_mint_authority(&x, &true);
    assert!(client.mint_authority(&x));
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
            args: (
                String::from_str(&e, "u"),
                String::from_str(&e, "n"),
                String::from_str(&e, "s"),
            )
                .into_val(&e),
            sub_invokes: &[],
        },
    }]);
    assert!(client
        .try_set_metadata(
            &String::from_str(&e, "u"),
            &String::from_str(&e, "n"),
            &String::from_str(&e, "s"),
        )
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
fn owner_can_whitelist_and_remove_minter() {
    let (e, client, owner) = setup();
    let bob = Address::generate(&e);
    launch(&e, &client, &[]);

    client.set_mint_authority(&bob, &true);
    assert!(client.mint_authority(&bob));

    client.set_mint_authority(&bob, &false);
    assert!(!client.mint_authority(&bob));

    let _ = e;
    let _ = owner;
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn set_mint_authority_requires_owner_auth() {
    let (e, client, owner) = setup_no_auth();
    let bob = Address::generate(&e);

    let _ = owner;
    client.set_mint_authority(&bob, &true);
}

#[test]
fn whitelisted_minter_can_mint() {
    let (e, client, owner) = setup();
    let bob = Address::generate(&e);
    let alice = Address::generate(&e);

    launch(&e, &client, std::slice::from_ref(&bob));

    e.mock_auths(&[MockAuth {
        address: &bob,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "mint",
            args: (&bob, &alice).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    let token_id = client.mint(&bob, &alice);
    assert_eq!(token_id, 0);
    assert_eq!(client.balance(&alice), 1);

    let _ = owner;
}

#[test]
fn contract_address_can_be_whitelisted() {
    let (e, client, owner) = setup();
    let treasury = Address::generate(&e);
    let recipient = Address::generate(&e);

    launch(&e, &client, std::slice::from_ref(&treasury));

    e.mock_auths(&[MockAuth {
        address: &treasury,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "mint",
            args: (&treasury, &recipient).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    let token_id = client.mint(&treasury, &recipient);
    assert_eq!(token_id, 0);
    assert_eq!(client.balance(&recipient), 1);

    let _ = owner;
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
        assert_eq!(client.version(), String::from_str(&e, "0.1.0"));
        assert_eq!(client.wasm_hash(), from);
        mgr.register(&from, &String::from_str(&e, "0.1.1"));
        client.sync_version();
        assert_eq!(client.version(), String::from_str(&e, "0.1.1"));
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
        let id = deploy(
            &e,
            Address::generate(&e),
            Address::generate(&e),
            mgr.address.clone(),
            from.clone(),
        );
        let client = DaoTokenContractClient::new(&e, &id);
        assert_eq!(client.version(), String::from_str(&e, "0.1.0"));
        assert_eq!(client.wasm_hash(), from);
        mgr.register(&from, &String::from_str(&e, "0.1.1"));
        client.sync_version();
        assert_eq!(client.version(), String::from_str(&e, "0.1.1"));
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
        let id = deploy(
            &e,
            Address::generate(&e),
            Address::generate(&e),
            mgr.address.clone(),
            from.clone(),
        );
        let client = DaoTokenContractClient::new(&e, &id);
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

    #[test]
    fn version_and_sync_version_work_after_upgrade() {
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
            DaoTokenContract::sync_version(&e);
            assert_eq!(DaoTokenContract::version(&e), String::from_str(&e, "0.2.1"));
        });
    }
}

#[test]
fn launch_rejects_unwired_treasury_and_minters_without_treasury() {
    let (e, client, _owner, _m) = setup_with_manager();
    let wired = wired_treasury(&e, &client);
    let other = Address::generate(&e);

    let r = client.try_launch(&other, &vec![&e, other.clone()]);
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::error::TokenError::TreasuryMismatch.into()
    );
    let r = client.try_launch(&wired, &vec![&e, other.clone()]);
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::error::TokenError::TreasuryNotMinter.into()
    );
    assert!(!client.is_live());
    client.launch(&wired, &vec![&e, wired.clone()]);
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
    let minters = vec![&e, treasury.clone()];
    // Only a non-manager address authorizes the call.
    e.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "launch",
            args: (&treasury, &minters).into_val(&e),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_launch(&treasury, &minters).is_err());
    assert!(!client.is_live());
    // The manager's own authorization succeeds.
    e.mock_auths(&[MockAuth {
        address: &manager,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "launch",
            args: (&treasury, &minters).into_val(&e),
            sub_invokes: &[],
        },
    }]);
    client.launch(&treasury, &minters);
    assert!(client.is_live());
}

/// Address wired under `key` in the token's instance storage.
fn wired(e: &Env, client: &DaoTokenContractClient, key: crate::storage::TokenKey) -> Address {
    e.as_contract(&client.address, || {
        e.storage().instance().get(&key).unwrap()
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
        let auction = wired(&e, &client, TokenKey::Auction);
        let marketplace = wired(&e, &client, TokenKey::Marketplace);
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
        let marketplace = wired(&e, &client, TokenKey::Marketplace);
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
fn mint_authority_lives_in_persistent_storage() {
    let (e, client, _owner, _m) = setup_with_manager();
    let minter = Address::generate(&e);
    launch(&e, &client, std::slice::from_ref(&minter));
    let key = crate::storage::TokenKey::MintAuthority(minter.clone());
    e.as_contract(&client.address, || {
        assert!(!e.storage().instance().has(&key));
        assert_eq!(e.storage().persistent().get::<_, bool>(&key), Some(true));
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
        let auction = wired(&e, &token, TokenKey::Auction);
        let marketplace = wired(&e, &token, TokenKey::Marketplace);
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
