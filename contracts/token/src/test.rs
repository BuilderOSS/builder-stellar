extern crate std;

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};
use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
    IntoVal,
};

use crate::{DaoTokenContract, DaoTokenContractClient};

fn setup() -> (Env, DaoTokenContractClient<'static>, Address) {
    let e = Env::default();
    e.mock_all_auths();

    let owner = Address::generate(&e);
    let metadata = Address::generate(&e); // Dummy metadata address for tests
    let contract_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            metadata,
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
        ),
    );
    let client = DaoTokenContractClient::new(&e, &contract_id);
    (e, client, owner)
}

fn setup_no_auth() -> (Env, DaoTokenContractClient<'static>, Address) {
    let e = Env::default();
    let owner = Address::generate(&e);
    let metadata = Address::generate(&e); // Dummy metadata address for tests
    let contract_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            metadata,
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
        ),
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

#[test]
fn manager_can_finalize_ownership_to_treasury() {
    let (e, client, _owner) = setup();
    let treasury = Address::generate(&e);

    client.finalize_ownership(&treasury);

    assert_eq!(client.get_owner(), Some(treasury));
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

    client.set_mint_authority(&bob, &true);

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

    client.set_mint_authority(&treasury, &true);

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
// See contracts/Minter/tests/ for batch minting tests
