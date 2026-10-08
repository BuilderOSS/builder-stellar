#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events, MockAuth, MockAuthInvoke},
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, Event, IntoVal, String, Vec,
};
use token::DaoTokenContract;

use crate::{
    events::AllowlistClaimEvent, events::MerkleClaimEvent, MinterContract, MinterContractClient,
};

fn create_token_contract<'a>(env: &Env, owner: &Address) -> Address {
    env.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(env, "https://test.com"),
            String::from_str(env, "Test Token"),
            String::from_str(env, "TEST"),
            Address::generate(env), // metadata address (placeholder)
            Address::generate(env), // manager address (placeholder)
            BytesN::from_array(env, &[0u8; 32]),
            String::from_str(env, "0.1.0"),
        ),
    )
}

fn setup<'a>(env: &Env) -> (Address, Address, MinterContractClient<'a>) {
    let admin = Address::generate(env);
    let token = create_token_contract(env, &admin);
    let minter_contract = MinterContractClient::new(env, &env.register(MinterContract, ()));

    (admin, token, minter_contract)
}

// ============================================================================
// BATCH MINT TESTS
// ============================================================================

#[test]
fn test_mint_batch_single_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let recipient = Address::generate(&env);

    // Grant mint authority to minter contract
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Mint 5 tokens to one recipient
    let recipients = Vec::from_array(&env, [recipient.clone()]);
    let amounts = Vec::from_array(&env, [5u128]);

    minter.mint_batch(&token, &recipients, &amounts);

    // Verify tokens were minted
    assert_eq!(token_client.balance(&recipient), 5);
    assert_eq!(token_client.total_supply(), 5);
}

#[test]
fn test_mint_batch_multiple_recipients() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Mint to multiple recipients
    let recipients = Vec::from_array(&env, [alice.clone(), bob.clone(), charlie.clone()]);
    let amounts = Vec::from_array(&env, [3u128, 5u128, 2u128]);

    minter.mint_batch(&token, &recipients, &amounts);

    // Verify each recipient got their tokens
    assert_eq!(token_client.balance(&alice), 3);
    assert_eq!(token_client.balance(&bob), 5);
    assert_eq!(token_client.balance(&charlie), 2);
    assert_eq!(token_client.total_supply(), 10);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_mint_batch_requires_admin_auth() {
    let env = Env::default();

    let (_admin, token, minter) = setup(&env);
    let recipient = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    // Mock auth as unauthorized address
    env.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &minter.address,
            fn_name: "mint_batch",
            args: (
                token.clone(),
                Vec::from_array(&env, [recipient.clone()]),
                Vec::from_array(&env, [5u128]),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    let recipients = Vec::from_array(&env, [recipient.clone()]);
    let amounts = Vec::from_array(&env, [5u128]);

    // This should panic because unauthorized is not the admin
    minter.mint_batch(&token, &recipients, &amounts);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")] // InvalidInput
fn test_mint_batch_mismatched_lengths() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Different length arrays should panic
    let recipients = Vec::from_array(&env, [alice, bob]);
    let amounts = Vec::from_array(&env, [5u128]); // Only 1 amount for 2 recipients

    minter.mint_batch(&token, &recipients, &amounts);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")] // BatchTooLarge
fn test_mint_batch_too_many_recipients() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Create 101 recipients (exceeds MAX_BATCH of 100)
    let mut recipients = Vec::new(&env);
    let mut amounts = Vec::new(&env);
    for _ in 0..101 {
        recipients.push_back(Address::generate(&env));
        amounts.push_back(1u128);
    }

    minter.mint_batch(&token, &recipients, &amounts);
}

#[test]
#[should_panic(expected = "Error(Contract, #1104)")] // InvalidInput (from Token contract)
fn test_mint_batch_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let recipient = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Zero amount should panic
    let recipients = Vec::from_array(&env, [recipient]);
    let amounts = Vec::from_array(&env, [0u128]);

    minter.mint_batch(&token, &recipients, &amounts);
}

#[test]
fn test_mint_batch_preserves_delegation() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Alice delegates to Bob before minting
    token_client.delegate(&alice, &bob);

    // Mint tokens to Alice
    let recipients = Vec::from_array(&env, [alice.clone()]);
    let amounts = Vec::from_array(&env, [5u128]);
    minter.mint_batch(&token, &recipients, &amounts);

    // Verify Alice still delegates to Bob and Bob has the votes
    assert_eq!(token_client.get_delegate(&alice), Some(bob.clone()));
    assert_eq!(token_client.get_votes(&bob), 5);
}

// ============================================================================
// ALLOWLIST TESTS
// ============================================================================

#[test]
fn test_set_and_mint_allowlist() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Set allowlist with fixed amount of 5
    let allowlist_addresses = Vec::from_array(&env, [alice.clone(), bob.clone()]);
    minter.set_allowlist(&token, &allowlist_addresses, &5u128);

    // Both Alice and Bob can mint 5 tokens each (fixed amount)
    minter.mint_allowlist(&token, &alice, &5u128);
    assert_eq!(token_client.balance(&alice), 5);

    minter.mint_allowlist(&token, &bob, &5u128);
    assert_eq!(token_client.balance(&bob), 5);

    assert_eq!(token_client.total_supply(), 10);
}

#[test]
fn test_allowlist_claim_event_shape() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );
    minter.set_allowlist(&token, &Vec::from_array(&env, [alice.clone()]), &5u128);

    minter.mint_allowlist(&token, &alice, &5u128);

    let events = env.events().all();
    assert_eq!(
        events.events().last().unwrap(),
        &AllowlistClaimEvent {
            token_id: token,
            recipient: alice,
            amount: 5,
        }
        .to_xdr(&env, &minter.address)
    );
}

#[test]
fn test_allowlist_failed_claim_emits_no_success_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );
    minter.set_allowlist(&token, &Vec::from_array(&env, [alice.clone()]), &5u128);
    minter.mint_allowlist(&token, &alice, &5u128);

    assert!(minter.try_mint_allowlist(&token, &alice, &5u128).is_err());
    assert!(env.events().all().events().is_empty());
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")] // NotInAllowlist
fn test_mint_allowlist_not_in_list() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Set allowlist with only Alice
    let allowlist_addresses = Vec::from_array(&env, [alice.clone()]);
    minter.set_allowlist(&token, &allowlist_addresses, &5u128);

    // Try to mint for Bob (not in allowlist) - should panic
    minter.mint_allowlist(&token, &bob, &5u128);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // InvalidAmount
fn test_mint_allowlist_wrong_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Set allowlist with Alice at 5 tokens (fixed amount)
    let allowlist_addresses = Vec::from_array(&env, [alice.clone()]);
    minter.set_allowlist(&token, &allowlist_addresses, &5u128);

    // Try to mint wrong amount (10 instead of 5) - should panic
    minter.mint_allowlist(&token, &alice, &10u128);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // AlreadyClaimed
fn test_mint_allowlist_double_claim() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Set allowlist
    let allowlist_addresses = Vec::from_array(&env, [alice.clone()]);
    minter.set_allowlist(&token, &allowlist_addresses, &5u128);

    // First claim - should work
    minter.mint_allowlist(&token, &alice, &5u128);

    // Second claim - should panic
    minter.mint_allowlist(&token, &alice, &5u128);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_allowlist_requires_recipient_auth() {
    let env = Env::default();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    // Mock auth as unauthorized address trying to claim for Alice
    env.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &minter.address,
            fn_name: "mint_allowlist",
            args: (token.clone(), alice.clone(), 5u128).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Set allowlist
    let allowlist_addresses = Vec::from_array(&env, [alice.clone()]);
    minter.set_allowlist(&token, &allowlist_addresses, &5u128);

    // Try to mint for Alice from unauthorized address - should panic
    minter.mint_allowlist(&token, &alice, &5u128);
}

// ============================================================================
// MERKLE TREE TESTS
// ============================================================================

fn leaf(env: &Env, recipient: &Address, amount: u128) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.append(&recipient.clone().to_xdr(env));
    data.extend_from_array(&amount.to_be_bytes());
    env.crypto().sha256(&data).into()
}

fn hash_pair(env: &Env, x: &BytesN<32>, y: &BytesN<32>) -> BytesN<32> {
    let (a, b) = if x.to_array() <= y.to_array() {
        (x, y)
    } else {
        (y, x)
    };
    let mut data = Bytes::new(env);
    data.extend_from_array(&a.to_array());
    data.extend_from_array(&b.to_array());
    env.crypto().sha256(&data).into()
}

/// Builds a two-leaf tree; returns (root, proof for first, proof for second).
fn two_leaf_tree(
    env: &Env,
    a: &Address,
    a_amount: u128,
    b: &Address,
    b_amount: u128,
) -> (BytesN<32>, Vec<BytesN<32>>, Vec<BytesN<32>>) {
    let la = leaf(env, a, a_amount);
    let lb = leaf(env, b, b_amount);
    (
        hash_pair(env, &la, &lb),
        Vec::from_array(env, [lb]),
        Vec::from_array(env, [la]),
    )
}

#[test]
fn test_set_merkle_root() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    minter.set_merkle_root(&token, &BytesN::from_array(&env, &[1u8; 32]));
}

#[test]
fn test_mint_merkle_basic() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    let (root, alice_proof, bob_proof) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root);

    minter.mint_merkle(&token, &alice, &5u128, &alice_proof);
    minter.mint_merkle(&token, &bob, &3u128, &bob_proof);

    assert_eq!(token_client.balance(&alice), 5);
    assert_eq!(token_client.balance(&bob), 3);
    assert_eq!(token_client.total_supply(), 8);
}

#[test]
fn test_merkle_claim_event_shape() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );
    let (root, alice_proof, _) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root);

    minter.mint_merkle(&token, &alice, &5u128, &alice_proof);

    let events = env.events().all();
    assert_eq!(
        events.events().last().unwrap(),
        &MerkleClaimEvent {
            token_id: token,
            recipient: alice,
            amount: 5,
        }
        .to_xdr(&env, &minter.address)
    );
}

#[test]
fn test_merkle_failed_claim_emits_no_success_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );
    let (root, alice_proof, _) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root);
    minter.mint_merkle(&token, &alice, &5u128, &alice_proof);

    assert!(minter
        .try_mint_merkle(&token, &alice, &5u128, &alice_proof)
        .is_err());
    assert!(env.events().all().events().is_empty());
}

#[test]
fn test_mint_merkle_invalid_proof() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let mallory = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );
    let (root, alice_proof, bob_proof) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root);

    // Wrong amount for a valid proof
    assert!(minter
        .try_mint_merkle(&token, &alice, &50u128, &alice_proof)
        .is_err());
    // Someone else's proof
    assert!(minter
        .try_mint_merkle(&token, &mallory, &5u128, &alice_proof)
        .is_err());
    // Empty proof
    assert!(minter
        .try_mint_merkle(&token, &bob, &3u128, &Vec::new(&env))
        .is_err());
    // Bogus sibling
    let bogus = Vec::from_array(&env, [BytesN::from_array(&env, &[9u8; 32])]);
    assert!(minter
        .try_mint_merkle(&token, &bob, &3u128, &bogus)
        .is_err());

    // Failed attempts don't consume the claim
    minter.mint_merkle(&token, &bob, &3u128, &bob_proof);
    assert_eq!(token_client.balance(&bob), 3);
    assert_eq!(token_client.total_supply(), 3);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")] // MerkleRootNotSet
fn test_mint_merkle_no_root_set() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    minter.mint_merkle(&token, &alice, &5u128, &Vec::new(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // AlreadyClaimed
fn test_mint_merkle_double_claim() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    let (root, alice_proof, _) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root);

    minter.mint_merkle(&token, &alice, &5u128, &alice_proof);
    minter.mint_merkle(&token, &alice, &5u128, &alice_proof);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_merkle_requires_recipient_auth() {
    let env = Env::default();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let proof: Vec<BytesN<32>> = Vec::new(&env);

    env.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &minter.address,
            fn_name: "mint_merkle",
            args: (token.clone(), alice.clone(), 5u128, proof.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    minter.set_merkle_root(&token, &BytesN::from_array(&env, &[1u8; 32]));
    minter.mint_merkle(&token, &alice, &5u128, &proof);
}

#[test]
fn test_claim_uses_single_checkpoint() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    minter.set_allowlist(&token, &Vec::from_array(&env, [alice.clone()]), &10u128);
    minter.mint_allowlist(&token, &alice, &10u128);

    assert_eq!(token_client.balance(&alice), 10);
    assert_eq!(token_client.num_checkpoints(&alice), 1);
}

#[test]
fn test_set_allowlist_replaces_previous_list() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    minter.set_allowlist(&token, &Vec::from_array(&env, [alice.clone()]), &2u128);
    minter.set_allowlist(&token, &Vec::from_array(&env, [bob.clone()]), &3u128);

    assert!(minter.try_mint_allowlist(&token, &alice, &2u128).is_err());
    minter.mint_allowlist(&token, &bob, &3u128);
    assert_eq!(token_client.balance(&bob), 3);
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

#[test]
fn test_multiple_mint_methods_together() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // 1. Batch mint to Alice
    let recipients = Vec::from_array(&env, [alice.clone()]);
    let amounts = Vec::from_array(&env, [5u128]);
    minter.mint_batch(&token, &recipients, &amounts);

    // 2. Set and mint from allowlist for Bob (10 tokens fixed amount)
    let allowlist_addresses = Vec::from_array(&env, [bob.clone()]);
    minter.set_allowlist(&token, &allowlist_addresses, &10u128);
    minter.mint_allowlist(&token, &bob, &10u128);

    // 3. Set merkle root and mint for Charlie
    let (root, charlie_proof, _) = two_leaf_tree(&env, &charlie, 7, &alice, 1);
    minter.set_merkle_root(&token, &root);
    minter.mint_merkle(&token, &charlie, &7u128, &charlie_proof);

    // Verify all mints worked
    assert_eq!(token_client.balance(&alice), 5);
    assert_eq!(token_client.balance(&bob), 10);
    assert_eq!(token_client.balance(&charlie), 7);
    assert_eq!(token_client.total_supply(), 22);
}

#[test]
fn test_minter_with_contract_as_minter() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let recipient = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);

    // Grant mint authority to the minter contract itself
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Mint batch
    let recipients = Vec::from_array(&env, [recipient.clone()]);
    let amounts = Vec::from_array(&env, [10u128]);
    minter.mint_batch(&token, &recipients, &amounts);

    assert_eq!(token_client.balance(&recipient), 10);
}

#[test]
fn test_batch_mint_30_tokens_three_founders() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let founder1 = Address::generate(&env);
    let founder2 = Address::generate(&env);
    let founder3 = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Simulate DAO founder allocation: 3 founders × 10 tokens each = 30 total
    let recipients = Vec::from_array(&env, [founder1.clone(), founder2.clone(), founder3.clone()]);
    let amounts = Vec::from_array(&env, [10u128, 10u128, 10u128]);

    // This should work without storage footprint issues due to optimized batch_mint
    minter.mint_batch(&token, &recipients, &amounts);

    // Verify all tokens were minted correctly
    assert_eq!(token_client.balance(&founder1), 10);
    assert_eq!(token_client.balance(&founder2), 10);
    assert_eq!(token_client.balance(&founder3), 10);
    assert_eq!(token_client.total_supply(), 30);

    // Verify voting power
    assert_eq!(token_client.get_votes(&founder1), 10);
    assert_eq!(token_client.get_votes(&founder2), 10);
    assert_eq!(token_client.get_votes(&founder3), 10);

    // Verify delegation was set correctly
    assert_eq!(token_client.get_delegate(&founder1), Some(founder1.clone()));
    assert_eq!(token_client.get_delegate(&founder2), Some(founder2.clone()));
    assert_eq!(token_client.get_delegate(&founder3), Some(founder3.clone()));

    // Verify checkpoint efficiency - should have 1 checkpoint per founder, not 10
    assert_eq!(token_client.num_checkpoints(&founder1), 1);
    assert_eq!(token_client.num_checkpoints(&founder2), 1);
    assert_eq!(token_client.num_checkpoints(&founder3), 1);
}

#[test]
fn test_batch_mint_large_amounts_single_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let recipient = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // Test minting large amount to single recipient (reduced to 25 to avoid budget limits)
    let recipients = Vec::from_array(&env, [recipient.clone()]);
    let amounts = Vec::from_array(&env, [25u128]);

    minter.mint_batch(&token, &recipients, &amounts);

    assert_eq!(token_client.balance(&recipient), 25);
    assert_eq!(token_client.get_votes(&recipient), 25);
    assert_eq!(token_client.total_supply(), 25);

    // Verify checkpoint efficiency - only 1 checkpoint created, not 25
    assert_eq!(token_client.num_checkpoints(&recipient), 1);
}

#[test]
fn test_batch_mint_preserves_delegation_across_batches() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.launch(
        &Address::generate(&env),
        &Vec::from_array(&env, [minter.address.clone()]),
    );

    // First batch to alice
    let recipients1 = Vec::from_array(&env, [alice.clone()]);
    let amounts1 = Vec::from_array(&env, [5u128]);
    minter.mint_batch(&token, &recipients1, &amounts1);

    // Alice delegates to Bob
    token_client.delegate(&alice, &bob);
    assert_eq!(token_client.get_votes(&bob), 5);

    // Second batch to alice - should preserve delegation to bob
    let recipients2 = Vec::from_array(&env, [alice.clone()]);
    let amounts2 = Vec::from_array(&env, [5u128]);
    minter.mint_batch(&token, &recipients2, &amounts2);

    assert_eq!(token_client.balance(&alice), 10);
    assert_eq!(token_client.get_delegate(&alice), Some(bob.clone()));
    assert_eq!(token_client.get_votes(&bob), 10); // All votes go to bob
}
