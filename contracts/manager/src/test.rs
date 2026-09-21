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

#[test]
fn test_set_current_implementations() {
    let (env, client, admin) = setup();

    // Register implementations first
    let token_name = String::from_str(&env, "Token");
    let metadata_name = String::from_str(&env, "Metadata");
    let auction_name = String::from_str(&env, "Auction");
    let governor_name = String::from_str(&env, "Governor");
    let treasury_name = String::from_str(&env, "Treasury");

    let token_wasm = BytesN::from_array(&env, &[1u8; 32]);
    let metadata_wasm = BytesN::from_array(&env, &[2u8; 32]);
    let auction_wasm = BytesN::from_array(&env, &[3u8; 32]);
    let governor_wasm = BytesN::from_array(&env, &[4u8; 32]);
    let treasury_wasm = BytesN::from_array(&env, &[5u8; 32]);

    client.register_implementation(&token_name, &1u32, &token_wasm);
    client.register_implementation(&metadata_name, &1u32, &metadata_wasm);
    client.register_implementation(&auction_name, &1u32, &auction_wasm);
    client.register_implementation(&governor_name, &1u32, &governor_wasm);
    client.register_implementation(&treasury_name, &1u32, &treasury_wasm);

    // Set current implementations
    client.set_current_implementations(
        &token_wasm,
        &metadata_wasm,
        &auction_wasm,
        &governor_wasm,
        &treasury_wasm,
    );

    // Verify they were set correctly
    let token_impl = client.get_implementation(&token_wasm).unwrap();
    assert_eq!(token_impl.name, token_name);

    let _ = admin;
}

#[test]
#[should_panic]
fn test_set_current_implementations_rejects_unknown_hash() {
    let (env, client, admin) = setup();

    // Unknown implementation hashes must not become deployable defaults.
    let token_wasm = BytesN::from_array(&env, &[1u8; 32]);
    let metadata_wasm = BytesN::from_array(&env, &[2u8; 32]);
    let auction_wasm = BytesN::from_array(&env, &[3u8; 32]);
    let governor_wasm = BytesN::from_array(&env, &[4u8; 32]);
    let treasury_wasm = BytesN::from_array(&env, &[5u8; 32]);

    client.set_current_implementations(
        &token_wasm,
        &metadata_wasm,
        &auction_wasm,
        &governor_wasm,
        &treasury_wasm,
    );

    let _ = admin;
}

#[test]
fn test_predict_addresses() {
    let (env, client, admin) = setup();

    // Need to set current implementations first before predict can work
    let token_name = String::from_str(&env, "Token");
    let metadata_name = String::from_str(&env, "Metadata");
    let auction_name = String::from_str(&env, "Auction");
    let governor_name = String::from_str(&env, "Governor");
    let treasury_name = String::from_str(&env, "Treasury");

    let token_wasm = BytesN::from_array(&env, &[1u8; 32]);
    let metadata_wasm = BytesN::from_array(&env, &[2u8; 32]);
    let auction_wasm = BytesN::from_array(&env, &[3u8; 32]);
    let governor_wasm = BytesN::from_array(&env, &[4u8; 32]);
    let treasury_wasm = BytesN::from_array(&env, &[5u8; 32]);

    client.register_implementation(&token_name, &1u32, &token_wasm);
    client.register_implementation(&metadata_name, &1u32, &metadata_wasm);
    client.register_implementation(&auction_name, &1u32, &auction_wasm);
    client.register_implementation(&governor_name, &1u32, &governor_wasm);
    client.register_implementation(&treasury_name, &1u32, &treasury_wasm);

    client.set_current_implementations(
        &token_wasm,
        &metadata_wasm,
        &auction_wasm,
        &governor_wasm,
        &treasury_wasm,
    );

    let creator = Address::generate(&env);
    let nonce = 123u64;

    // Predict addresses
    let addresses = client.predict_addresses(&creator, &nonce);

    // Verify all addresses are returned
    assert_ne!(addresses.token, addresses.metadata);
    assert_ne!(addresses.token, addresses.auction);
    assert_ne!(addresses.token, addresses.governor);
    assert_ne!(addresses.token, addresses.treasury);

    // Predicting with same parameters should give same addresses
    let addresses2 = client.predict_addresses(&creator, &nonce);
    assert_eq!(addresses.token, addresses2.token);
    assert_eq!(addresses.metadata, addresses2.metadata);
    assert_eq!(addresses.auction, addresses2.auction);
    assert_eq!(addresses.governor, addresses2.governor);
    assert_eq!(addresses.treasury, addresses2.treasury);

    // Different nonce should give different addresses
    let addresses3 = client.predict_addresses(&creator, &456u64);
    assert_ne!(addresses.token, addresses3.token);

    let _ = admin;
}

#[test]
fn test_nonce_tracking() {
    let (env, client, _admin) = setup();

    let creator = Address::generate(&env);
    let nonce = 100u64;

    // Initially nonce is not used
    assert!(!client.is_nonce_used(&creator, &nonce));

    // Note: We can't actually test nonce usage without creating a DAO,
    // which requires all the WASM contracts to be deployed
}

#[test]
#[should_panic]
fn test_create_dao_when_paused_fails() {
    use crate::storage::{ArtworkIpfsGroup, DaoCreationParams};
    use soroban_sdk::Vec;

    let (env, client, _admin) = setup();

    // Pause the factory
    client.pause_factory();

    // Try to create DAO - should fail
    let deployer = Address::generate(&env);
    let payment_asset = Address::generate(&env);

    let params = DaoCreationParams {
        deployer: deployer.clone(),
        nonce: 1,
        token_name: String::from_str(&env, "Test DAO"),
        token_symbol: String::from_str(&env, "TEST"),
        token_uri: String::from_str(&env, "https://test.com"),
        project_uri: String::from_str(&env, "https://project.test"),
        description: String::from_str(&env, "Test description"),
        contract_image: String::from_str(&env, "https://test.com/image.png"),
        renderer_base: String::from_str(&env, "https://renderer.test"),
        artwork_property_names: Vec::new(&env),
        artwork_items: Vec::new(&env),
        artwork_ipfs: ArtworkIpfsGroup {
            base_uri: String::from_str(&env, "ipfs://"),
            extension: String::from_str(&env, ".png"),
        },
        auction_duration: 86400,
        reserve_price: 1000,
        time_buffer: 300,
        payment_asset,
        voting_delay: 1,
        voting_period: 100,
        quorum_bps: 1000,
        proposal_threshold_bps: 100,
        founders: Vec::new(&env),
        launch_admin: deployer,
    };

    client.create_dao(&params);
}

#[test]
fn test_multiple_implementation_versions() {
    let (env, client, admin) = setup();

    let name = String::from_str(&env, "Token");
    let v1_wasm = BytesN::from_array(&env, &[1u8; 32]);
    let v2_wasm = BytesN::from_array(&env, &[2u8; 32]);
    let v3_wasm = BytesN::from_array(&env, &[3u8; 32]);

    // Register multiple versions
    client.register_implementation(&name, &1u32, &v1_wasm);
    client.register_implementation(&name, &2u32, &v2_wasm);
    client.register_implementation(&name, &3u32, &v3_wasm);

    // Latest should be v3
    let latest = client.get_latest_implementation(&name).unwrap();
    assert_eq!(latest.version, 3);
    assert_eq!(latest.wasm_hash, v3_wasm);

    // All versions should be retrievable by hash
    let v1_impl = client.get_implementation(&v1_wasm).unwrap();
    assert_eq!(v1_impl.version, 1);

    let v2_impl = client.get_implementation(&v2_wasm).unwrap();
    assert_eq!(v2_impl.version, 2);

    let _ = admin;
}

#[test]
fn test_implementation_not_found() {
    let (env, client, admin) = setup();

    let nonexistent_hash = BytesN::from_array(&env, &[99u8; 32]);

    // Should return None for nonexistent implementation
    assert!(client.get_implementation(&nonexistent_hash).is_none());

    let name = String::from_str(&env, "NonExistent");
    assert!(client.get_latest_implementation(&name).is_none());

    let _ = admin;
}

#[test]
fn test_upgrade_approval_workflow() {
    let (env, client, admin) = setup();

    let name = String::from_str(&env, "Token");
    let v1_wasm = BytesN::from_array(&env, &[1u8; 32]);
    let v2_wasm = BytesN::from_array(&env, &[2u8; 32]);
    let v3_wasm = BytesN::from_array(&env, &[3u8; 32]);

    // Register versions
    client.register_implementation(&name, &1u32, &v1_wasm);
    client.register_implementation(&name, &2u32, &v2_wasm);
    client.register_implementation(&name, &3u32, &v3_wasm);

    // Approve multiple upgrade paths
    client.approve_upgrade(&v1_wasm, &v2_wasm); // v1 -> v2
    client.approve_upgrade(&v2_wasm, &v3_wasm); // v2 -> v3

    // Verify approved paths
    assert!(client.is_upgrade_approved(&v1_wasm, &v2_wasm));
    assert!(client.is_upgrade_approved(&v2_wasm, &v3_wasm));

    // Verify non-approved paths
    assert!(!client.is_upgrade_approved(&v1_wasm, &v3_wasm)); // v1 -> v3 not approved

    let _ = admin;
}

#[test]
fn test_dao_count_starts_at_zero() {
    let (env, client, _admin) = setup();
    assert_eq!(client.get_dao_count(), 0);
    let _ = env;
}

#[test]
fn test_enumerate_daos_with_pagination() {
    let (env, client, _admin) = setup();

    // Test empty enumeration with different limits
    let daos_10 = client.enumerate_daos(&0, &10);
    assert_eq!(daos_10.len(), 0);

    let daos_5 = client.enumerate_daos(&0, &5);
    assert_eq!(daos_5.len(), 0);

    let daos_1 = client.enumerate_daos(&0, &1);
    assert_eq!(daos_1.len(), 0);

    // Test with offset
    let daos_offset = client.enumerate_daos(&5, &10);
    assert_eq!(daos_offset.len(), 0);

    let _ = env;
}

#[test]
fn test_factory_pause_unpause_idempotent() {
    let (env, client, _admin) = setup();

    // Pause twice - should not panic
    client.pause_factory();
    client.pause_factory();

    // Unpause twice - should not panic
    client.unpause_factory();
    client.unpause_factory();

    let _ = env;
}

#[test]
fn test_register_same_implementation_twice() {
    let (env, client, _admin) = setup();

    let name = String::from_str(&env, "Token");
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);

    // Register once
    client.register_implementation(&name, &1u32, &wasm_hash);

    // Register again with same version - should succeed (overwrites)
    client.register_implementation(&name, &1u32, &wasm_hash);

    let implementation = client.get_implementation(&wasm_hash).unwrap();
    assert_eq!(implementation.version, 1);

    let _ = env;
}

#[test]
#[should_panic]
fn test_revoke_already_revoked_implementation_fails() {
    let (env, client, _admin) = setup();

    let name = String::from_str(&env, "Token");
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);

    client.register_implementation(&name, &1u32, &wasm_hash);
    client.revoke_implementation(&wasm_hash);

    // Revoke again - should panic with ImplementationAlreadyRevoked
    client.revoke_implementation(&wasm_hash);

    let _ = env;
}

#[test]
fn test_approve_same_upgrade_twice() {
    let (env, client, _admin) = setup();

    let name = String::from_str(&env, "Token");
    let from_hash = BytesN::from_array(&env, &[1u8; 32]);
    let to_hash = BytesN::from_array(&env, &[2u8; 32]);

    client.register_implementation(&name, &1u32, &from_hash);
    client.register_implementation(&name, &2u32, &to_hash);

    // Approve once
    client.approve_upgrade(&from_hash, &to_hash);

    // Approve again - should not panic
    client.approve_upgrade(&from_hash, &to_hash);

    assert!(client.is_upgrade_approved(&from_hash, &to_hash));

    let _ = env;
}

#[test]
fn test_get_latest_implementation_with_revoked() {
    let (env, client, _admin) = setup();

    let name = String::from_str(&env, "Token");
    let v1_wasm = BytesN::from_array(&env, &[1u8; 32]);
    let v2_wasm = BytesN::from_array(&env, &[2u8; 32]);

    client.register_implementation(&name, &1u32, &v1_wasm);
    client.register_implementation(&name, &2u32, &v2_wasm);

    // Revoke v2 (latest)
    client.revoke_implementation(&v2_wasm);

    // Revoked implementations must never be returned as deployable latest versions.
    assert!(client.get_latest_implementation(&name).is_none());

    let _ = env;
}
