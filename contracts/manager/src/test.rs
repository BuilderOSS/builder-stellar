#![cfg(test)]

extern crate std;

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

use crate::{ManagerContract, ManagerContractClient};

fn setup() -> (Env, ManagerContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(ManagerContract, (admin.clone(),));
    let client = ManagerContractClient::new(&env, &contract_id);

    (env, client, admin)
}

#[test]
fn test_initialization() {
    let (env, client, admin) = setup();

    // Test passes if contract initializes without panic
    let _ = env;
    let _ = client;
    let _ = admin;
}

#[test]
fn test_register_implementation() {
    let (env, client, admin) = setup();

    let name = String::from_str(&env, "Token");
    let version = 1u32;
    let wasm_hash = BytesN::from_array(&env, &[0u8; 32]);

    client.register_implementation(&name, &version, &wasm_hash);

    // Verify implementation was registered
    let implementation = client.get_latest_implementation(&name);
    assert!(implementation.is_some());

    let impl_data = implementation.unwrap();
    assert_eq!(impl_data.name, name);
    assert_eq!(impl_data.version, version);
    assert_eq!(impl_data.wasm_hash, wasm_hash);
    assert_eq!(impl_data.revoked, false);

    let _ = admin;
}

#[test]
fn test_approve_upgrade() {
    let (env, client, admin) = setup();

    let name = String::from_str(&env, "Token");
    let from_hash = BytesN::from_array(&env, &[1u8; 32]);
    let to_hash = BytesN::from_array(&env, &[2u8; 32]);

    // Register both implementations
    client.register_implementation(&name, &1u32, &from_hash);
    client.register_implementation(&name, &2u32, &to_hash);

    // Approve upgrade
    client.approve_upgrade(&from_hash, &to_hash);

    // Verify upgrade is approved
    assert!(client.is_upgrade_approved(&from_hash, &to_hash));

    let _ = admin;
}

#[test]
fn test_revoke_implementation() {
    let (env, client, admin) = setup();

    let name = String::from_str(&env, "Token");
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);

    // Register implementation
    client.register_implementation(&name, &1u32, &wasm_hash);

    // Revoke it
    client.revoke_implementation(&wasm_hash);

    // Verify it's revoked
    let implementation = client.get_implementation(&wasm_hash);
    assert!(implementation.is_some());
    assert_eq!(implementation.unwrap().revoked, true);

    let _ = admin;
}

#[test]
fn test_factory_pause() {
    let (env, client, admin) = setup();

    // Pause factory
    client.pause_factory();

    // Unpause factory
    client.unpause_factory();

    let _ = env;
    let _ = admin;
}

#[test]
fn test_dao_enumeration_empty() {
    let (env, client, admin) = setup();

    // Initially no DAOs
    assert_eq!(client.get_dao_count(), 0);

    // Enumerate should return empty
    let daos = client.enumerate_daos(&0, &10);
    assert_eq!(daos.len(), 0);

    let _ = env;
    let _ = admin;
}
