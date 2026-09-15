extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, String};
use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
    IntoVal,
};

use crate::{DaoTokenContract, DaoTokenContractClient};

fn setup() -> (Env, DaoTokenContractClient<'static>, Address) {
    let e = Env::default();
    e.mock_all_auths();

    let owner = Address::generate(&e);
    let contract_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
        ),
    );
    let client = DaoTokenContractClient::new(&e, &contract_id);
    (e, client, owner)
}

fn setup_no_auth() -> (Env, DaoTokenContractClient<'static>, Address) {
    let e = Env::default();
    let owner = Address::generate(&e);
    let contract_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
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

#[test]
fn batch_mint_creates_multiple_tokens() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    let last_token_id = client.batch_mint(&owner, &alice, &10);

    assert_eq!(last_token_id, 9); // 0-9 = 10 tokens
    assert_eq!(client.balance(&alice), 10);
    assert_eq!(client.get_delegate(&alice), Some(alice.clone()));
    assert_eq!(client.get_votes(&alice), 10);
}

#[test]
fn batch_mint_returns_correct_last_token_id() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    // Mint some tokens first
    let _ = client.mint(&owner, &alice);
    let _ = client.mint(&owner, &alice);

    // Batch mint should continue from token_id 2
    let last_token_id = client.batch_mint(&owner, &alice, &5);

    assert_eq!(last_token_id, 6); // tokens 2-6 = 5 tokens
    assert_eq!(client.balance(&alice), 7); // 2 + 5
}

#[test]
fn batch_mint_large_amount() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    // Test with 20 to stay within test event budget limits
    // (Larger amounts emit too many events for test environment)
    let last_token_id = client.batch_mint(&owner, &alice, &20);

    assert_eq!(last_token_id, 19);
    assert_eq!(client.balance(&alice), 20);
    assert_eq!(client.get_votes(&alice), 20);
}

#[test]
#[should_panic(expected = "Error(Contract, #1101)")]
fn batch_mint_fails_with_zero_amount() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    let _ = e;
    client.batch_mint(&owner, &alice, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #1101)")]
fn batch_mint_fails_above_max() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    let _ = e;
    client.batch_mint(&owner, &alice, &101);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn batch_mint_requires_minter_auth() {
    let (e, client, owner) = setup_no_auth();
    let alice = Address::generate(&e);
    let other = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &other,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "batch_mint",
            args: (&alice, &10u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    let _ = owner;
    client.batch_mint(&owner, &alice, &10);
}

#[test]
fn whitelisted_minter_can_batch_mint() {
    let (e, client, owner) = setup();
    let bob = Address::generate(&e);
    let alice = Address::generate(&e);

    client.set_mint_authority(&bob, &true);

    e.mock_auths(&[MockAuth {
        address: &bob,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "batch_mint",
            args: (&bob, &alice, &10u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    let last_token_id = client.batch_mint(&bob, &alice, &10);
    assert_eq!(last_token_id, 9);
    assert_eq!(client.balance(&alice), 10);
    assert_eq!(client.get_votes(&alice), 10);

    let _ = owner;
}

#[test]
fn batch_mint_defaults_to_self_delegate() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);

    client.batch_mint(&owner, &alice, &5);

    assert_eq!(client.get_delegate(&alice), Some(alice.clone()));
    assert_eq!(client.get_votes(&alice), 5);

    let _ = e;
}

#[test]
fn batch_mint_preserves_existing_delegation() {
    let (e, client, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    // First mint and delegate
    client.mint(&owner, &alice);
    client.delegate(&alice, &bob);
    assert_eq!(client.get_votes(&bob), 1);

    // Batch mint should preserve delegation
    client.batch_mint(&owner, &alice, &5);

    assert_eq!(client.balance(&alice), 6);
    assert_eq!(client.get_delegate(&alice), Some(bob.clone()));
    assert_eq!(client.get_votes(&bob), 6);
}
