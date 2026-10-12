#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Events, MockAuth, MockAuthInvoke},
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, Event, IntoVal, String, Vec,
};
use token::DaoTokenContract;

use crate::{
    events::{MerkleClaimEvent, MerkleRootSetEvent},
    ClaimStatus, MinterContract, MinterContractClient, MinterError,
};
use common::testutils::{MockManager, MockManagerClient};

/// Fixed treasury address wired into every test token, so tests can launch it.
fn treasury(env: &Env) -> Address {
    Address::from_str(
        env,
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAITA4",
    )
}

/// Launch the token the way the Manager does: treasury becomes owner (admin of
/// the minter) and `minter` receives mint authority.
fn launch_token(env: &Env, token: &token::DaoTokenContractClient, minter: &Address) {
    let t = treasury(env);
    token.launch(
        &t,
        &Vec::from_array(env, [t.clone(), minter.clone()]),
        minter,
    );
}

fn create_token_contract(env: &Env, owner: &Address) -> Address {
    env.register(
        DaoTokenContract,
        (
            owner.clone(),
            treasury(env),
            Address::generate(env), // auction
            Address::generate(env), // marketplace
            String::from_str(env, "Test Token"),
            String::from_str(env, "TEST"),
            Address::generate(env), // metadata address (placeholder)
            Address::generate(env), // manager address (placeholder)
            BytesN::from_array(env, &[0u8; 32]),
        ),
    )
}

/// The Minter's own code hash in tests, registered as "0.1.0".
fn minter_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0x31; 32])
}

/// A tree URI for roots set in tests.
fn uri(env: &Env) -> String {
    String::from_str(env, "ipfs://bafytree")
}

/// A shared Minter wired to a mock Manager that knows its hash.
fn register_minter<'a>(env: &Env) -> (MinterContractClient<'a>, MockManagerClient<'a>) {
    let mgr = MockManagerClient::new(env, &env.register(MockManager, ()));
    mgr.register(&minter_hash(env), &String::from_str(env, "0.1.0"));
    let id = env.register(MinterContract, (mgr.address.clone(), minter_hash(env)));
    (MinterContractClient::new(env, &id), mgr)
}

fn setup<'a>(env: &Env) -> (Address, Address, MinterContractClient<'a>) {
    let admin = Address::generate(env);
    let token = create_token_contract(env, &admin);
    let (minter_contract, _mgr) = register_minter(env);

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
    launch_token(&env, &token_client, &minter.address);

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
    launch_token(&env, &token_client, &minter.address);

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
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let recipient = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    // Launch under full auth first, so the only failing check is the minter's admin auth.
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    let recipients = Vec::from_array(&env, [recipient.clone()]);
    let amounts = Vec::from_array(&env, [5u128]);

    // Now only an unauthorized address signs.
    env.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &minter.address,
            fn_name: "mint_batch",
            args: (token.clone(), recipients.clone(), amounts.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    // Panics with Auth/InvalidAction: the token owner (treasury) did not authorize.
    minter.mint_batch(&token, &recipients, &amounts);
}

#[test]
#[should_panic(expected = "Error(Contract, #7809)")] // InvalidInput
fn test_mint_batch_mismatched_lengths() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    // Different length arrays should panic
    let recipients = Vec::from_array(&env, [alice, bob]);
    let amounts = Vec::from_array(&env, [5u128]); // Only 1 amount for 2 recipients

    minter.mint_batch(&token, &recipients, &amounts);
}

#[test]
#[should_panic(expected = "Error(Contract, #7803)")] // BatchTooLarge
fn test_mint_batch_too_many_recipients() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    // One more recipient than MAX_BATCH_RECIPIENTS
    let mut recipients = Vec::new(&env);
    let mut amounts = Vec::new(&env);
    for _ in 0..=crate::MAX_BATCH_RECIPIENTS {
        recipients.push_back(Address::generate(&env));
        amounts.push_back(1u128);
    }

    minter.mint_batch(&token, &recipients, &amounts);
}

#[test]
#[should_panic(expected = "Error(Contract, #7202)")] // InvalidInput (from Token contract)
fn test_mint_batch_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let recipient = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

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
    launch_token(&env, &token_client, &minter.address);

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
// ALLOWLIST TESTS (retired)
// ============================================================================

// Retired: test_set_and_mint_allowlist, test_allowlist_claim_event_shape,
// test_allowlist_failed_claim_emits_no_success_event,
// test_mint_allowlist_not_in_list, test_mint_allowlist_wrong_amount,
// test_mint_allowlist_double_claim, test_allowlist_requires_recipient_auth,
// test_set_allowlist_replaces_previous_list,
// test_allowlist_reclaim_allowed_after_new_allowlist_but_not_within_round,
// test_set_allowlist_does_not_reopen_merkle_claims,
// test_set_merkle_root_does_not_reopen_allowlist_claims,
// test_recipient_can_claim_once_on_each_method.
// Value: protects=(none now) allowlist claims and their isolation from merkle
// rounds; retired_because=the allowlist mode is removed by
// docs/STORAGE_DIET.md (D8: merkle-only claims); replacement=the merkle tests
// below (amounts, double claim, new round, stale proof, recipient auth) and
// `merkle_root_tree_uri_and_round_are_stored_and_emitted`.

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
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);
    minter.set_merkle_root(&token, &BytesN::from_array(&env, &[1u8; 32]), &uri(&env));
}

/// Setup-window configuration must not survive launch: before the token is
/// live every minter entrypoint refuses with TokenNotLive.
#[test]
fn test_setup_window_configuration_is_refused_before_launch() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let not_live = crate::errors::MinterError::TokenNotLive;

    assert_eq!(
        minter
            .try_set_merkle_root(&token, &BytesN::from_array(&env, &[1u8; 32]), &uri(&env))
            .err()
            .unwrap()
            .unwrap(),
        not_live
    );
    assert_eq!(
        minter
            .try_mint_merkle(&token, &alice, &5u128, &Vec::new(&env))
            .err()
            .unwrap()
            .unwrap(),
        not_live
    );
    assert_eq!(
        minter
            .try_mint_batch(
                &token,
                &Vec::from_array(&env, [alice.clone()]),
                &Vec::from_array(&env, [1u128])
            )
            .err()
            .unwrap()
            .unwrap(),
        not_live
    );

    // After launch the treasury (token owner) can configure the minter.
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);
    minter.set_merkle_root(&token, &BytesN::from_array(&env, &[1u8; 32]), &uri(&env));
}

#[test]
fn test_mint_merkle_basic() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    let (root, alice_proof, bob_proof) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root, &uri(&env));

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
    launch_token(&env, &token_client, &minter.address);
    let (root, alice_proof, _) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root, &uri(&env));

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
    launch_token(&env, &token_client, &minter.address);
    let (root, alice_proof, _) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root, &uri(&env));
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
    launch_token(&env, &token_client, &minter.address);
    let (root, alice_proof, bob_proof) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root, &uri(&env));

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
#[should_panic(expected = "Error(Contract, #7804)")] // MerkleRootNotSet
fn test_mint_merkle_no_root_set() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    minter.mint_merkle(&token, &alice, &5u128, &Vec::new(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #7807)")] // AlreadyClaimed
fn test_mint_merkle_double_claim() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    let (root, alice_proof, _) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root, &uri(&env));

    minter.mint_merkle(&token, &alice, &5u128, &alice_proof);
    minter.mint_merkle(&token, &alice, &5u128, &alice_proof);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_merkle_requires_recipient_auth() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let proof: Vec<BytesN<32>> = Vec::new(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);
    minter.set_merkle_root(&token, &BytesN::from_array(&env, &[1u8; 32]), &uri(&env));

    env.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &minter.address,
            fn_name: "mint_merkle",
            args: (token.clone(), alice.clone(), 5u128, proof.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    // Panics with Auth/InvalidAction: Alice (the recipient) did not authorize.
    minter.mint_merkle(&token, &alice, &5u128, &proof);
}

#[test]
fn test_claim_uses_single_checkpoint() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    let (root, alice_proof, _) = two_leaf_tree(&env, &alice, 10, &Address::generate(&env), 1);
    minter.set_merkle_root(&token, &root, &uri(&env));
    minter.mint_merkle(&token, &alice, &10u128, &alice_proof);

    assert_eq!(token_client.balance(&alice), 10);
    assert_eq!(token_client.num_checkpoints(&alice), 1);
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
    let charlie = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    // 1. Batch mint to Alice
    let recipients = Vec::from_array(&env, [alice.clone()]);
    let amounts = Vec::from_array(&env, [5u128]);
    minter.mint_batch(&token, &recipients, &amounts);

    // 2. Set merkle root and mint for Charlie
    let (root, charlie_proof, _) = two_leaf_tree(&env, &charlie, 7, &alice, 1);
    minter.set_merkle_root(&token, &root, &uri(&env));
    minter.mint_merkle(&token, &charlie, &7u128, &charlie_proof);

    // Verify all mints worked
    assert_eq!(token_client.balance(&alice), 5);
    assert_eq!(token_client.balance(&charlie), 7);
    assert_eq!(token_client.total_supply(), 12);
}

#[test]
fn test_minter_with_contract_as_minter() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let recipient = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);

    // Grant mint authority to the minter contract itself
    launch_token(&env, &token_client, &minter.address);

    // Mint batch
    let recipients = Vec::from_array(&env, [recipient.clone()]);
    let amounts = Vec::from_array(&env, [10u128]);
    minter.mint_batch(&token, &recipients, &amounts);

    assert_eq!(token_client.balance(&recipient), 10);
}

#[test]
fn test_batch_mint_founder_allocation_in_two_calls() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let founder1 = Address::generate(&env);
    let founder2 = Address::generate(&env);
    let founder3 = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    // DAO founder allocation: 3 founders x 10 tokens = 30, above the 20 token
    // per-call cap, so it is minted in two calls (20 + 10).
    minter.mint_batch(
        &token,
        &Vec::from_array(&env, [founder1.clone(), founder2.clone()]),
        &Vec::from_array(&env, [10u128, 10u128]),
    );
    minter.mint_batch(
        &token,
        &Vec::from_array(&env, [founder3.clone()]),
        &Vec::from_array(&env, [10u128]),
    );

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
    launch_token(&env, &token_client, &minter.address);

    // A full batch (the token's per-call cap) to a single recipient.
    let max = common::MAX_BATCH_MINT as u128;
    let recipients = Vec::from_array(&env, [recipient.clone()]);
    let amounts = Vec::from_array(&env, [max]);

    minter.mint_batch(&token, &recipients, &amounts);

    assert_eq!(token_client.balance(&recipient), max as u32);
    assert_eq!(token_client.get_votes(&recipient), max);
    assert_eq!(token_client.total_supply(), max as i128);

    // One more token than the cap is rejected by the token (error propagates).
    let r = minter.try_mint_batch(&token, &recipients, &Vec::from_array(&env, [max + 1]));
    // TokenError::BatchTooLarge is not a MinterError, so it surfaces as a
    // raw contract error code.
    assert!(matches!(
        r,
        Err(Err(soroban_sdk::InvokeError::Contract(7205)))
    ));

    // Verify checkpoint efficiency - only 1 checkpoint created, not one per token
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
    launch_token(&env, &token_client, &minter.address);

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

// ============================================================================
// CLAIM ROUNDS
// ============================================================================

#[test]
fn test_merkle_reclaim_allowed_after_new_root_but_not_within_round() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    // Round 1 (first root bumps the default round 0).
    let (root, alice_proof, _) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root, &uri(&env));
    minter.mint_merkle(&token, &alice, &5u128, &alice_proof);
    assert!(minter
        .try_mint_merkle(&token, &alice, &5u128, &alice_proof)
        .is_err());
    assert_eq!(token_client.balance(&alice), 5);

    // New airdrop including the earlier claimer: round bumps, claim works again.
    let (root2, alice_proof2, _) = two_leaf_tree(&env, &alice, 7, &bob, 1);
    minter.set_merkle_root(&token, &root2, &uri(&env));
    minter.mint_merkle(&token, &alice, &7u128, &alice_proof2);
    assert_eq!(token_client.balance(&alice), 12);
    // Still blocked within the new round.
    assert!(minter
        .try_mint_merkle(&token, &alice, &7u128, &alice_proof2)
        .is_err());
}

#[test]
fn test_stale_root_proof_rejected_after_set_merkle_root() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    let (old_root, _, bob_old_proof) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &old_root, &uri(&env));
    let (new_root, _, _) = two_leaf_tree(&env, &alice, 9, &bob, 1);
    minter.set_merkle_root(&token, &new_root, &uri(&env));

    // Bob never claimed, but his proof is against the superseded root.
    assert!(minter
        .try_mint_merkle(&token, &bob, &3u128, &bob_old_proof)
        .is_err());
    assert_eq!(token_client.balance(&bob), 0);
}

#[test]
fn entry_points_renew_the_minter_instance_ttl() {
    use common::testutils::{advance_ledgers, instance_ttl};
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, token, minter) = setup(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    minter.mint_batch(
        &token,
        &Vec::from_array(&env, [Address::generate(&env)]),
        &Vec::from_array(&env, [1u128]),
    );
    let fresh = instance_ttl(&env, &minter.address);
    assert!(fresh >= common::ttl::INSTANCE_TTL_THRESHOLD);

    // Age it below the threshold; the next call renews it.
    advance_ledgers(&env, fresh - common::ttl::INSTANCE_TTL_THRESHOLD + 1);
    let aged = instance_ttl(&env, &minter.address);
    minter.set_merkle_root(&token, &BytesN::from_array(&env, &[1u8; 32]), &uri(&env));
    assert!(instance_ttl(&env, &minter.address) > aged);
}

// ============================================================================
// TREE URI, CLAIM STATUS, UPGRADES (docs/STORAGE_DIET.md § 4 Minter)
// ============================================================================

/// Each `set_merkle_root` stores its tree URI with the root, opens a new round
/// and emits `{ root, round, tree_uri }`; `claim_status` reads all of it.
#[test]
fn merkle_root_tree_uri_and_round_are_stored_and_emitted() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);

    assert_eq!(
        minter.claim_status(&token, &alice),
        ClaimStatus {
            root: None,
            round: 0,
            tree_uri: None,
            claimed: false,
        }
    );

    let first_uri = String::from_str(&env, "ipfs://bafyfirst");
    let (root, alice_proof, _) = two_leaf_tree(&env, &alice, 5, &bob, 3);
    minter.set_merkle_root(&token, &root, &first_uri);
    assert_eq!(
        env.events().all().events().last().unwrap(),
        &MerkleRootSetEvent {
            token_id: token.clone(),
            root: root.clone(),
            round: 1,
            tree_uri: first_uri.clone(),
        }
        .to_xdr(&env, &minter.address)
    );
    minter.mint_merkle(&token, &alice, &5u128, &alice_proof);
    assert_eq!(
        minter.claim_status(&token, &alice),
        ClaimStatus {
            root: Some(root.clone()),
            round: 1,
            tree_uri: Some(first_uri),
            claimed: true,
        }
    );
    assert!(!minter.claim_status(&token, &bob).claimed);

    let second_uri = String::from_str(&env, "ipfs://bafysecond");
    let (root2, _, _) = two_leaf_tree(&env, &alice, 2, &bob, 1);
    minter.set_merkle_root(&token, &root2, &second_uri);
    assert_eq!(
        minter.claim_status(&token, &alice),
        ClaimStatus {
            root: Some(root2),
            round: 2,
            tree_uri: Some(second_uri),
            claimed: false,
        }
    );
}

#[test]
fn set_merkle_root_rejects_a_bad_tree_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, token, minter) = setup(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    launch_token(&env, &token_client, &minter.address);
    let root = BytesN::from_array(&env, &[1u8; 32]);
    let too_long = std::format!("ipfs://{}", "a".repeat(common::MAX_STRING_LENGTH as usize));
    for bad in [
        "",
        "ipfs://",
        "https://example.com/tree.json",
        "IPFS://bafy",
        too_long.as_str(),
    ] {
        assert_eq!(
            minter
                .try_set_merkle_root(&token, &root, &String::from_str(&env, bad))
                .err()
                .unwrap()
                .unwrap(),
            MinterError::InvalidTreeUri,
            "{bad}"
        );
    }
    assert_eq!(
        minter.claim_status(&token, &Address::generate(&env)).round,
        0
    );
}

/// The shared Minter upgrades through `common::upgrade`: the Manager admin
/// authorizes, the registry approves, and `version()` follows the registry.
#[test]
fn shared_minter_upgrades_under_the_manager_admin() {
    use common::testutils::empty_wasm;
    let env = Env::default();
    env.mock_all_auths();
    let (minter, mgr) = register_minter(&env);
    assert_eq!(minter.version(), String::from_str(&env, "0.1.0"));
    assert_eq!(minter.wasm_hash(), minter_hash(&env));
    assert_eq!(minter.storage_version(), crate::STORAGE_VERSION);
    assert_eq!(minter.manager(), mgr.address);

    let to = empty_wasm(&env);
    mgr.approve(&minter_hash(&env), &to);
    mgr.register(&to, &String::from_str(&env, "0.2.0"));

    // No Manager admin yet: nobody can upgrade.
    assert_eq!(
        minter
            .try_upgrade(&minter_hash(&env), &to)
            .err()
            .unwrap()
            .unwrap(),
        MinterError::ManagerAdminNotSet
    );
    assert_eq!(
        minter.try_migrate().err().unwrap().unwrap(),
        MinterError::ManagerAdminNotSet
    );

    let platform_admin = Address::generate(&env);
    mgr.set_admin(&platform_admin);
    // A stranger's signature is not enough.
    let stranger = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &minter.address,
            fn_name: "upgrade",
            args: (minter_hash(&env), to.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(minter.try_upgrade(&minter_hash(&env), &to).is_err());

    env.mock_auths(&[MockAuth {
        address: &platform_admin,
        invoke: &MockAuthInvoke {
            contract: &minter.address,
            fn_name: "upgrade",
            args: (minter_hash(&env), to.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    minter.upgrade(&minter_hash(&env), &to);
    env.as_contract(&minter.address, || {
        assert_eq!(common::upgrade::current_hash(&env), to);
        assert_eq!(
            common::upgrade::version(&env, &mgr.address),
            String::from_str(&env, "0.2.0")
        );
    });
}

#[test]
fn minter_migrate_needs_a_newer_layout() {
    let env = Env::default();
    env.mock_all_auths();
    let (minter, mgr) = register_minter(&env);
    mgr.set_admin(&Address::generate(&env));
    assert_eq!(
        minter.try_migrate().err().unwrap(),
        Err(soroban_sdk::InvokeError::Contract(
            common::CommonError::NothingToMigrate as u32
        ))
    );
}

#[test]
fn storage_keys_do_not_collide() {
    use common::testutils::{assert_keys_disjoint, common_key_shapes, key_shapes};
    use soroban_sdk::Env;
    let e = Env::default();
    // The Minter writes `common::upgrade` keys beside its own.
    assert_keys_disjoint(&[
        (
            "MinterKey",
            key_shapes(&e, crate::storage::key_samples::all(&e)),
        ),
        ("common", common_key_shapes(&e)),
    ]);
}
