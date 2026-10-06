#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_minter_initialization() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);

    // Create minter contract
    let minter = create_minter(&env, &token, &admin);

    // Verify initialization worked
    assert_eq!(minter.total_strategies(&env), 1); // Should start at 1 after init
}

#[test]
fn test_register_strategy() {
    let env = Env::default();
    let admin = Address::random(&env);
    let token = Address::random(&env);

    let minter = create_minter(&env, &token, &admin);

    // Admin can register a strategy
    admin.set_as_invoked_contract(&env);
}

fn create_minter(env: &Env, token: &Address, admin: &Address) -> minter::MinterContract {
    minter::MinterContract::__constructor(env, token.clone(), admin.clone());
    minter::MinterContract
}
