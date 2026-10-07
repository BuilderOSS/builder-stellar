#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, Bytes, BytesN, Env, IntoVal, String, Vec,
};
use token::DaoTokenContract;

use crate::{MinterContract, MinterContractClient};

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
    token_client.set_mint_authority(&minter.address, &true);

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
    token_client.set_mint_authority(&minter.address, &true);

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
    token_client.set_mint_authority(&minter.address, &true);

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
    token_client.set_mint_authority(&minter.address, &true);

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
    token_client.set_mint_authority(&minter.address, &true);

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
#[should_panic(expected = "Error(Contract, #2)")] // InvalidAmount
fn test_mint_batch_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let recipient = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.set_mint_authority(&minter.address, &true);

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
    token_client.set_mint_authority(&minter.address, &true);

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
    token_client.set_mint_authority(&minter.address, &true);

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
#[should_panic(expected = "Error(Contract, #7)")] // NotInAllowlist
fn test_mint_allowlist_not_in_list() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.set_mint_authority(&minter.address, &true);

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
    token_client.set_mint_authority(&minter.address, &true);

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
    token_client.set_mint_authority(&minter.address, &true);

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
    token_client.set_mint_authority(&minter.address, &true);

    // Set allowlist
    let allowlist_addresses = Vec::from_array(&env, [alice.clone()]);
    minter.set_allowlist(&token, &allowlist_addresses, &5u128);

    // Try to mint for Alice from unauthorized address - should panic
    minter.mint_allowlist(&token, &alice, &5u128);
}

// ============================================================================
// MERKLE TREE TESTS
// ============================================================================

#[test]
fn test_set_merkle_root() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);

    // Set merkle root
    let root = Bytes::from_array(&env, &[1u8; 32]);
    minter.set_merkle_root(&token, &root);

    // No way to directly verify the root is set, but the function should not panic
}

#[test]
fn test_mint_merkle_basic() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.set_mint_authority(&minter.address, &true);

    // Set merkle root (dummy root for testing)
    let root = Bytes::from_array(&env, &[1u8; 32]);
    minter.set_merkle_root(&token, &root);

    // Mint with merkle proof (using dummy proof since validation is placeholder)
    let proof = Bytes::from_array(&env, &[0u8; 32]);
    minter.mint_merkle(&token, &alice, &5u128, &proof);

    // Verify tokens were minted
    assert_eq!(token_client.balance(&alice), 5);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")] // MerkleRootNotSet
fn test_mint_merkle_no_root_set() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.set_mint_authority(&minter.address, &true);

    // Try to mint without setting merkle root
    let proof = Bytes::from_array(&env, &[0u8; 32]);
    minter.mint_merkle(&token, &alice, &5u128, &proof);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")] // AlreadyClaimed
fn test_mint_merkle_double_claim() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.set_mint_authority(&minter.address, &true);

    // Set merkle root
    let root = Bytes::from_array(&env, &[1u8; 32]);
    minter.set_merkle_root(&token, &root);

    // First claim
    let proof = Bytes::from_array(&env, &[0u8; 32]);
    minter.mint_merkle(&token, &alice, &5u128, &proof);

    // Second claim - should panic
    minter.mint_merkle(&token, &alice, &5u128, &proof);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn test_merkle_requires_recipient_auth() {
    let env = Env::default();

    let (_admin, token, minter) = setup(&env);
    let alice = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    // Mock auth as unauthorized address
    env.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &minter.address,
            fn_name: "mint_merkle",
            args: (
                token.clone(),
                alice.clone(),
                5u128,
                Bytes::from_array(&env, &[0u8; 32]),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let token_client = token::DaoTokenContractClient::new(&env, &token);
    token_client.set_mint_authority(&minter.address, &true);

    // Set merkle root
    let root = Bytes::from_array(&env, &[1u8; 32]);
    minter.set_merkle_root(&token, &root);

    // Try to mint for Alice from unauthorized address
    let proof = Bytes::from_array(&env, &[0u8; 32]);
    minter.mint_merkle(&token, &alice, &5u128, &proof);
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
    token_client.set_mint_authority(&minter.address, &true);

    // 1. Batch mint to Alice
    let recipients = Vec::from_array(&env, [alice.clone()]);
    let amounts = Vec::from_array(&env, [5u128]);
    minter.mint_batch(&token, &recipients, &amounts);

    // 2. Set and mint from allowlist for Bob (10 tokens fixed amount)
    let allowlist_addresses = Vec::from_array(&env, [bob.clone()]);
    minter.set_allowlist(&token, &allowlist_addresses, &10u128);
    minter.mint_allowlist(&token, &bob, &10u128);

    // 3. Set merkle root and mint for Charlie
    let root = Bytes::from_array(&env, &[1u8; 32]);
    minter.set_merkle_root(&token, &root);
    let proof = Bytes::from_array(&env, &[0u8; 32]);
    minter.mint_merkle(&token, &charlie, &7u128, &proof);

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
    token_client.set_mint_authority(&minter.address, &true);

    // Mint batch
    let recipients = Vec::from_array(&env, [recipient.clone()]);
    let amounts = Vec::from_array(&env, [10u128]);
    minter.mint_batch(&token, &recipients, &amounts);

    assert_eq!(token_client.balance(&recipient), 10);
}
