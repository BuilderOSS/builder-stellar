#![cfg(test)]

extern crate std;

use soroban_sdk::{
    contract, contractimpl,
    testutils::Address as _,
    xdr::{LedgerEntryData, Limits, ScAddress, ScVal, WriteXdr},
    Address, Bytes, BytesN, Env, String,
};

use crate::{ManagerContract, ManagerContractClient};

fn setup() -> (Env, ManagerContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(
        ManagerContract,
        (
            admin.clone(),
            BytesN::from_array(&env, &[0u8; 32]),
            String::from_str(&env, "0.1.0"),
        ),
    );
    let client = ManagerContractClient::new(&env, &contract_id);

    (env, client, admin)
}

#[test]
fn test_initialization() {
    let (env, client, admin) = setup();

    assert_eq!(client.version(), String::from_str(&env, "0.1.0"));
    assert_eq!(client.wasm_hash(), BytesN::from_array(&env, &[0u8; 32]));
    let _ = client;
    let _ = admin;
}

#[test]
fn implementation_version_is_available_by_hash() {
    let (env, client, _admin) = setup();
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    let version = String::from_str(&env, "1.2.3");

    client.register_implementation(&String::from_str(&env, "Token"), &version, &wasm_hash);

    assert_eq!(client.get_implementation_version(&wasm_hash), Some(version));
}

#[test]
#[should_panic(expected = "Error(Contract, #1005)")]
fn reject_cross_module_upgrade_approval() {
    let (env, client, _admin) = setup();
    let token_hash = BytesN::from_array(&env, &[1u8; 32]);
    let auction_hash = BytesN::from_array(&env, &[2u8; 32]);

    client.register_implementation(
        &String::from_str(&env, "Token"),
        &String::from_str(&env, "1.0.0"),
        &token_hash,
    );
    client.register_implementation(
        &String::from_str(&env, "Auction"),
        &String::from_str(&env, "1.0.0"),
        &auction_hash,
    );

    client.approve_upgrade(&token_hash, &auction_hash);
}

#[test]
fn test_register_implementation() {
    let (env, client, admin) = setup();

    let name = String::from_str(&env, "Token");
    let version = String::from_str(&env, "1");
    let wasm_hash = BytesN::from_array(&env, &[0u8; 32]);

    client.register_implementation(&name, &version, &wasm_hash);

    // Verify implementation was registered
    let implementation = client.get_latest_implementation(&name);
    assert!(implementation.is_some());

    let impl_data = implementation.unwrap();
    assert_eq!(impl_data.name, name);
    assert_eq!(impl_data.version, version);
    assert_eq!(impl_data.wasm_hash, wasm_hash);
    assert!(!impl_data.revoked);

    let _ = admin;
}

#[test]
fn test_approve_upgrade() {
    let (env, client, admin) = setup();

    let name = String::from_str(&env, "Token");
    let from_hash = BytesN::from_array(&env, &[1u8; 32]);
    let to_hash = BytesN::from_array(&env, &[2u8; 32]);

    // Register both implementations
    client.register_implementation(&name, &String::from_str(&env, "1"), &from_hash);
    client.register_implementation(&name, &String::from_str(&env, "2"), &to_hash);

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
    client.register_implementation(&name, &String::from_str(&env, "1"), &wasm_hash);

    // Revoke it
    client.revoke_implementation(&wasm_hash);

    // Verify it's revoked
    let implementation = client.get_implementation(&wasm_hash);
    assert!(implementation.is_some());
    assert!(implementation.unwrap().revoked);

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
fn test_set_current_implementations() {
    let (env, client, admin) = setup();

    // Register implementations first
    let token_name = String::from_str(&env, "Token");
    let metadata_name = String::from_str(&env, "Metadata");
    let auction_name = String::from_str(&env, "Auction");
    let governor_name = String::from_str(&env, "Governor");
    let treasury_name = String::from_str(&env, "Treasury");
    let marketplace_name = String::from_str(&env, "Marketplace");

    let token_wasm = BytesN::from_array(&env, &[1u8; 32]);
    let metadata_wasm = BytesN::from_array(&env, &[2u8; 32]);
    let auction_wasm = BytesN::from_array(&env, &[3u8; 32]);
    let governor_wasm = BytesN::from_array(&env, &[4u8; 32]);
    let treasury_wasm = BytesN::from_array(&env, &[5u8; 32]);
    let marketplace_wasm = BytesN::from_array(&env, &[6u8; 32]);

    client.register_implementation(&token_name, &String::from_str(&env, "1"), &token_wasm);
    client.register_implementation(&metadata_name, &String::from_str(&env, "1"), &metadata_wasm);
    client.register_implementation(&auction_name, &String::from_str(&env, "1"), &auction_wasm);
    client.register_implementation(&governor_name, &String::from_str(&env, "1"), &governor_wasm);
    client.register_implementation(&treasury_name, &String::from_str(&env, "1"), &treasury_wasm);
    client.register_implementation(
        &marketplace_name,
        &String::from_str(&env, "1"),
        &marketplace_wasm,
    );

    // Set current implementations
    client.set_current_implementations(
        &token_wasm,
        &metadata_wasm,
        &auction_wasm,
        &governor_wasm,
        &treasury_wasm,
        &marketplace_wasm,
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
    let marketplace_wasm = BytesN::from_array(&env, &[6u8; 32]);

    client.set_current_implementations(
        &token_wasm,
        &metadata_wasm,
        &auction_wasm,
        &governor_wasm,
        &treasury_wasm,
        &marketplace_wasm,
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
    let marketplace_name = String::from_str(&env, "Marketplace");

    let token_wasm = BytesN::from_array(&env, &[1u8; 32]);
    let metadata_wasm = BytesN::from_array(&env, &[2u8; 32]);
    let auction_wasm = BytesN::from_array(&env, &[3u8; 32]);
    let governor_wasm = BytesN::from_array(&env, &[4u8; 32]);
    let treasury_wasm = BytesN::from_array(&env, &[5u8; 32]);
    let marketplace_wasm = BytesN::from_array(&env, &[6u8; 32]);

    client.register_implementation(&token_name, &String::from_str(&env, "1"), &token_wasm);
    client.register_implementation(&metadata_name, &String::from_str(&env, "1"), &metadata_wasm);
    client.register_implementation(&auction_name, &String::from_str(&env, "1"), &auction_wasm);
    client.register_implementation(&governor_name, &String::from_str(&env, "1"), &governor_wasm);
    client.register_implementation(&treasury_name, &String::from_str(&env, "1"), &treasury_wasm);
    client.register_implementation(
        &marketplace_name,
        &String::from_str(&env, "1"),
        &marketplace_wasm,
    );

    client.set_current_implementations(
        &token_wasm,
        &metadata_wasm,
        &auction_wasm,
        &governor_wasm,
        &treasury_wasm,
        &marketplace_wasm,
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
#[should_panic]
fn test_create_dao_when_paused_fails() {
    use crate::storage::DaoCreationParams;

    let (env, client, _admin) = setup();

    // Pause the factory
    client.pause_factory();

    // Try to create DAO - should fail
    let deployer = Address::generate(&env);
    let params = DaoCreationParams {
        deployer: deployer.clone(),
        nonce: 1,
        launch_admin: deployer,
        initial_config: crate::storage::InitialDaoConfigValues {
            token_name: String::from_str(&env, "DAO"),
            token_symbol: String::from_str(&env, "DAO"),
            token_uri: String::from_str(&env, "https://example.com/token"),
            project_uri: String::from_str(&env, "https://example.com"),
            description: String::from_str(&env, "Test DAO"),
            contract_image: String::from_str(&env, "https://example.com/image.png"),
            renderer_base: String::from_str(&env, "https://example.com/render"),
            governance: crate::storage::GovernanceConfig {
                voting_delay: 1,
                voting_period: 1,
                queue_delay: 1,
                proposal_threshold: 1,
                quorum_bps: 1,
            },
            auction: crate::storage::AuctionConfig {
                duration: 1,
                reserve_price: 1,
                time_buffer: 1,
                payment_asset: Address::generate(&env),
            },
            marketplace: crate::storage::MarketplaceConfig {
                payment_asset: Address::generate(&env),
                secondary_fee_bps: 1,
            },
        },
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
    client.register_implementation(&name, &String::from_str(&env, "1"), &v1_wasm);
    client.register_implementation(&name, &String::from_str(&env, "2"), &v2_wasm);
    client.register_implementation(&name, &String::from_str(&env, "3"), &v3_wasm);

    // Latest should be v3
    let latest = client.get_latest_implementation(&name).unwrap();
    assert_eq!(latest.version, String::from_str(&env, "3"));
    assert_eq!(latest.wasm_hash, v3_wasm);

    // All versions should be retrievable by hash
    let v1_impl = client.get_implementation(&v1_wasm).unwrap();
    assert_eq!(v1_impl.version, String::from_str(&env, "1"));

    let v2_impl = client.get_implementation(&v2_wasm).unwrap();
    assert_eq!(v2_impl.version, String::from_str(&env, "2"));

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
    client.register_implementation(&name, &String::from_str(&env, "1"), &v1_wasm);
    client.register_implementation(&name, &String::from_str(&env, "2"), &v2_wasm);
    client.register_implementation(&name, &String::from_str(&env, "3"), &v3_wasm);

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
fn test_register_same_hash_twice_is_rejected() {
    let (env, client, _admin) = setup();

    let name = String::from_str(&env, "Token");
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);

    client.register_implementation(&name, &String::from_str(&env, "1"), &wasm_hash);

    // Re-registering (same or different metadata) must not overwrite.
    for (n, v) in [("Token", "1"), ("Auction", "9")] {
        let r = client.try_register_implementation(
            &String::from_str(&env, n),
            &String::from_str(&env, v),
            &wasm_hash,
        );
        assert_eq!(
            r.err().unwrap().unwrap(),
            crate::ManagerError::ImplementationAlreadyRegistered
        );
    }

    // Revoked records cannot be un-revoked by re-registering.
    client.revoke_implementation(&wasm_hash);
    let r = client.try_register_implementation(&name, &String::from_str(&env, "1"), &wasm_hash);
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::ManagerError::ImplementationAlreadyRegistered
    );
    let implementation = client.get_implementation(&wasm_hash).unwrap();
    assert!(implementation.revoked);
    assert_eq!(implementation.version, String::from_str(&env, "1"));
}

#[test]
fn test_revoked_source_can_be_approved_and_migrate_away() {
    let (env, client, _admin) = setup();
    let name = String::from_str(&env, "Token");
    let b = BytesN::from_array(&env, &[2u8; 32]);
    let c = BytesN::from_array(&env, &[3u8; 32]);
    client.register_implementation(&name, &String::from_str(&env, "2"), &b);
    client.register_implementation(&name, &String::from_str(&env, "3"), &c);

    client.revoke_implementation(&b);
    client.approve_upgrade(&b, &c);
    assert!(client.is_upgrade_approved(&b, &c));
    // The revoked version is still readable for sync_version.
    assert_eq!(
        client.get_implementation_version(&b),
        Some(String::from_str(&env, "2"))
    );
}

#[test]
fn test_revoked_target_is_rejected_for_approval_and_for_existing_approval() {
    let (env, client, _admin) = setup();
    let name = String::from_str(&env, "Token");
    let a = BytesN::from_array(&env, &[1u8; 32]);
    let b = BytesN::from_array(&env, &[2u8; 32]);
    let c = BytesN::from_array(&env, &[3u8; 32]);
    client.register_implementation(&name, &String::from_str(&env, "1"), &a);
    client.register_implementation(&name, &String::from_str(&env, "2"), &b);
    client.register_implementation(&name, &String::from_str(&env, "3"), &c);

    client.approve_upgrade(&a, &b);
    client.revoke_implementation(&b);
    assert!(!client.is_upgrade_approved(&a, &b));

    client.revoke_implementation(&c);
    let r = client.try_approve_upgrade(&a, &c);
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::ManagerError::InvalidUpgradePath
    );
}

#[test]
fn test_cancel_pending_admin() {
    let (env, client, admin) = setup();
    let new_admin = Address::generate(&env);

    // Nothing pending.
    let r = client.try_cancel_pending_admin();
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::ManagerError::NoPendingAdmin
    );

    client.propose_admin(&new_admin);
    client.cancel_pending_admin();
    assert_eq!(client.get_pending_admin(), None);
    assert_eq!(client.get_admin(), Some(admin));
    // The cancelled proposal can no longer be accepted.
    let r = client.try_accept_admin();
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::ManagerError::NoPendingAdmin
    );
}

#[test]
fn test_cancel_pending_admin_requires_admin_auth() {
    let (env, client, admin) = setup();
    client.propose_admin(&Address::generate(&env));
    client.cancel_pending_admin();
    let auths = env.auths();
    assert_eq!(auths.last().unwrap().0, admin);
}

#[test]
#[should_panic]
fn test_revoke_already_revoked_implementation_fails() {
    let (env, client, _admin) = setup();

    let name = String::from_str(&env, "Token");
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);

    client.register_implementation(&name, &String::from_str(&env, "1"), &wasm_hash);
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

    client.register_implementation(&name, &String::from_str(&env, "1"), &from_hash);
    client.register_implementation(&name, &String::from_str(&env, "2"), &to_hash);

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

    client.register_implementation(&name, &String::from_str(&env, "1"), &v1_wasm);
    client.register_implementation(&name, &String::from_str(&env, "2"), &v2_wasm);

    // Revoke v2 (latest)
    client.revoke_implementation(&v2_wasm);

    // Revoked implementations must never be returned as deployable latest versions.
    assert!(client.get_latest_implementation(&name).is_none());

    let _ = env;
}

// ============================================================================
// Storage-growth tests (instance entry must stay bounded)
// ============================================================================

use crate::storage::{
    AuctionConfig, DaoCreationParams, GovernanceConfig, InitialDaoConfigValues, LaunchConfig,
    ManagerKey, MarketplaceConfig, PendingDao,
};

/// Minimal valid Soroban WASM exporting `__constructor(ctor_arity)` and
/// `initialize(init_arity)` (unused now that every module has a constructor), both returning void. Lets `create_dao` run its real
/// deploy path without the full module WASMs.
fn stub_wasm(env: &Env, tag: &str, ctor_arity: usize, init_arity: usize) -> Bytes {
    fn func_type(out: &mut std::vec::Vec<u8>, arity: usize) {
        out.push(0x60);
        out.push(arity as u8);
        out.extend(core::iter::repeat_n(0x7e, arity));
        out.extend([0x01, 0x7e]);
    }
    fn section(out: &mut std::vec::Vec<u8>, id: u8, body: &[u8]) {
        out.push(id);
        out.push(body.len() as u8);
        out.extend(body);
    }
    let mut m: std::vec::Vec<u8> = std::vec![0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
    // Env meta: interface version 27 (matches soroban-sdk 27).
    let mut meta = std::vec![17u8];
    meta.extend(b"contractenvmetav0");
    meta.extend([0, 0, 0, 0, 0, 0, 0, 27, 0, 0, 0, 0]);
    section(&mut m, 0, &meta);
    let mut types = std::vec![2u8];
    func_type(&mut types, ctor_arity);
    func_type(&mut types, init_arity);
    section(&mut m, 1, &types);
    section(&mut m, 3, &[2, 0, 1]);
    let mut exports = std::vec![2u8, 13];
    exports.extend(b"__constructor");
    exports.extend([0x00, 0x00, 10]);
    exports.extend(b"initialize");
    exports.extend([0x00, 0x01]);
    section(&mut m, 7, &exports);
    section(&mut m, 10, &[2, 4, 0, 0x42, 2, 0x0b, 4, 0, 0x42, 2, 0x0b]);
    // Trailing custom section makes each stub's hash unique even when arities match.
    let mut tail = std::vec![tag.len() as u8];
    tail.extend(tag.as_bytes());
    section(&mut m, 0, &tail);
    Bytes::from_slice(env, &m)
}

/// Registers stub implementations matching the current constructor arities and
/// sets them as the factory defaults.
fn register_stub_implementations(env: &Env, client: &ManagerContractClient) {
    let specs: [(&str, usize, usize); 6] = [
        ("Token", 9, 0),
        ("Metadata", 13, 0),
        ("Auction", 11, 0),
        ("Governor", 11, 0),
        ("Treasury", 5, 0),
        ("Marketplace", 8, 0),
    ];
    let mut hashes = std::vec::Vec::new();
    for (name, ctor, init) in specs {
        let hash = env
            .deployer()
            .upload_contract_wasm(stub_wasm(env, name, ctor, init));
        client.register_implementation(
            &String::from_str(env, name),
            &String::from_str(env, "1"),
            &hash,
        );
        hashes.push(hash);
    }
    client.set_current_implementations(
        &hashes[0], &hashes[1], &hashes[2], &hashes[3], &hashes[4], &hashes[5],
    );
}

fn dao_params(env: &Env, deployer: &Address, nonce: u64) -> DaoCreationParams {
    DaoCreationParams {
        deployer: deployer.clone(),
        nonce,
        launch_admin: deployer.clone(),
        initial_config: InitialDaoConfigValues {
            token_name: String::from_str(env, "DAO"),
            token_symbol: String::from_str(env, "DAO"),
            token_uri: String::from_str(env, "https://example.com/token"),
            project_uri: String::from_str(env, "https://example.com"),
            description: String::from_str(env, "Test DAO"),
            contract_image: String::from_str(env, "https://example.com/image.png"),
            renderer_base: String::from_str(env, "https://example.com/render"),
            governance: GovernanceConfig {
                voting_delay: 300,
                voting_period: 300,
                queue_delay: 300,
                proposal_threshold: 1,
                quorum_bps: 1000,
            },
            auction: AuctionConfig {
                duration: 300,
                reserve_price: 1000,
                time_buffer: 1,
                payment_asset: Address::generate(env),
            },
            marketplace: MarketplaceConfig {
                payment_asset: Address::generate(env),
                secondary_fee_bps: 100,
            },
        },
    }
}

/// XDR length of the Manager contract instance ledger entry.
fn instance_entry_xdr_len(env: &Env, manager: &Address) -> usize {
    let target = ScAddress::from(manager);
    let snapshot = env.to_ledger_snapshot();
    for (_, (entry, _)) in snapshot.ledger_entries.iter() {
        if let LedgerEntryData::ContractData(cd) = &entry.data {
            if cd.contract == target && cd.key == ScVal::LedgerKeyContractInstance {
                return entry.to_xdr(Limits::none()).unwrap().len();
            }
        }
    }
    panic!("manager instance entry not found");
}

/// Mock module used to let `launch_dao` complete for a seeded PendingDao.
/// Real-module launch behavior is covered by the `real_dao` tests below.
#[contract]
struct MockModule;

#[contractimpl]
impl MockModule {
    pub fn owner(e: Env) -> Address {
        e.storage().instance().get(&1u32).unwrap()
    }
    pub fn total_supply(_e: Env) -> i128 {
        1
    }
    pub fn launch(_e: Env, _treasury: Address, _minters: soroban_sdk::Vec<Address>) {}
}

#[contract]
struct MockLaunchModule;

#[contractimpl]
impl MockLaunchModule {
    pub fn launch(_e: Env, _treasury: Address) {}
}

#[contract]
struct MockToggleModule;

#[contractimpl]
impl MockToggleModule {
    pub fn launch(_e: Env, _treasury: Address, _flag: bool, _asset: Address) {}
}

/// Provide auth for `create_dao` from exactly the given signers.
fn mock_create_dao_auth(
    env: &Env,
    client: &ManagerContractClient,
    signers: &[&Address],
    params: &DaoCreationParams,
) {
    use soroban_sdk::{
        testutils::{MockAuth, MockAuthInvoke},
        IntoVal,
    };
    let invoke = MockAuthInvoke {
        contract: &client.address,
        fn_name: "create_dao",
        args: (params.clone(),).into_val(env),
        sub_invokes: &[],
    };
    let auths: std::vec::Vec<MockAuth> = signers
        .iter()
        .map(|a| MockAuth {
            address: a,
            invoke: &invoke,
        })
        .collect();
    env.mock_auths(&auths);
}

fn split_params(env: &Env) -> (Address, Address, DaoCreationParams) {
    let deployer = Address::generate(env);
    let admin = Address::generate(env);
    let mut params = dao_params(env, &deployer, 1);
    params.launch_admin = admin.clone();
    (deployer, admin, params)
}

#[test]
fn create_dao_fails_with_only_deployer_auth() {
    let (env, client, _a) = setup();
    register_stub_implementations(&env, &client);
    let (deployer, _admin, params) = split_params(&env);
    mock_create_dao_auth(&env, &client, &[&deployer], &params);
    assert!(client.try_create_dao(&params).is_err());
}

#[test]
fn create_dao_fails_with_only_launch_admin_auth() {
    let (env, client, _a) = setup();
    register_stub_implementations(&env, &client);
    let (_deployer, admin, params) = split_params(&env);
    mock_create_dao_auth(&env, &client, &[&admin], &params);
    assert!(client.try_create_dao(&params).is_err());
}

#[test]
fn create_dao_succeeds_with_both_auths() {
    let (env, client, _a) = setup();
    register_stub_implementations(&env, &client);
    let (deployer, admin, params) = split_params(&env);
    mock_create_dao_auth(&env, &client, &[&deployer, &admin], &params);
    let addrs = client.create_dao(&params);
    let pending = client.get_pending_dao(&addrs.token).unwrap();
    assert_eq!(pending.launch_admin, admin);
}

#[test]
fn create_dao_succeeds_with_single_auth_when_deployer_is_launch_admin() {
    let (env, client, _a) = setup();
    register_stub_implementations(&env, &client);
    let deployer = Address::generate(&env);
    let params = dao_params(&env, &deployer, 1);
    mock_create_dao_auth(&env, &client, &[&deployer], &params);
    assert!(client.try_create_dao(&params).is_ok());
}

#[test]
fn test_instance_entry_size_constant_across_500_create_dao() {
    let (env, client, _admin) = setup();
    register_stub_implementations(&env, &client);
    let deployer = Address::generate(&env);

    env.cost_estimate().budget().reset_unlimited();
    client.create_dao(&dao_params(&env, &deployer, 0));
    let before = instance_entry_xdr_len(&env, &client.address);

    let mut last = None;
    for nonce in 1..=500u64 {
        env.cost_estimate().budget().reset_unlimited();
        last = Some(client.create_dao(&dao_params(&env, &deployer, nonce)));
    }
    let after = instance_entry_xdr_len(&env, &client.address);
    assert_eq!(before, after, "instance entry grew with create_dao calls");

    // Pending entries live in persistent storage and remain readable.
    let first = client.predict_addresses(&deployer, &0u64);
    assert!(client.get_pending_dao(&first.token).is_some());
    assert!(client.get_pending_dao(&last.unwrap().token).is_some());
}

#[test]
fn test_registry_reads_work_after_500_registrations() {
    let (env, client, _admin) = setup();
    let name = String::from_str(&env, "Token");
    let base = BytesN::from_array(&env, &[0xAA; 32]);
    client.register_implementation(&name, &String::from_str(&env, "base"), &base);
    let before = instance_entry_xdr_len(&env, &client.address);

    let hash_for = |i: u32| {
        let mut raw = [0u8; 32];
        raw[..4].copy_from_slice(&i.to_be_bytes());
        BytesN::from_array(&env, &raw)
    };

    let mut prev = base.clone();
    for i in 0..500u32 {
        env.cost_estimate().budget().reset_unlimited();
        let next = hash_for(i);
        client.register_implementation(&name, &String::from_str(&env, "v"), &next);
        client.approve_upgrade(&prev, &next);
        prev = next;
    }
    assert_eq!(before, instance_entry_xdr_len(&env, &client.address));

    assert!(client.is_upgrade_approved(&base, &hash_for(0)));
    assert!(client.is_upgrade_approved(&hash_for(498), &hash_for(499)));
    assert!(!client.is_upgrade_approved(&base, &hash_for(499)));
    assert_eq!(
        client.get_latest_implementation(&name).unwrap().wasm_hash,
        hash_for(499)
    );
    assert!(client.get_implementation(&base).is_some());
}

#[test]
fn test_pending_dao_launches_after_500_unrelated_create_dao() {
    let (env, client, _admin) = setup();
    register_stub_implementations(&env, &client);

    // Seed a PendingDao whose modules are mocks so launch_dao can complete.
    let launch_admin = Address::generate(&env);
    let token = env.register(MockModule, ());
    let governor = env.register(MockLaunchModule, ());
    let treasury = env.register(MockLaunchModule, ());
    let metadata = env.register(MockLaunchModule, ());
    let auction = env.register(MockToggleModule, ());
    let marketplace = env.register(MockToggleModule, ());
    env.as_contract(&token, || {
        env.storage().instance().set(&1u32, &launch_admin);
    });
    let pending = PendingDao {
        addresses: crate::storage::DaoAddresses {
            token: token.clone(),
            metadata,
            auction,
            governor,
            treasury,
            marketplace,
        },
        launch_admin: launch_admin.clone(),
        auction_payment_asset: Address::generate(&env),
        marketplace_payment_asset: Address::generate(&env),
    };
    env.as_contract(&client.address, || {
        crate::storage::set_persistent(&env, &ManagerKey::PendingDao(token.clone()), &pending);
    });

    let deployer = Address::generate(&env);
    for nonce in 0..500u64 {
        env.cost_estimate().budget().reset_unlimited();
        client.create_dao(&dao_params(&env, &deployer, nonce));
    }

    assert_eq!(client.get_pending_dao(&token), Some(pending));
    client.launch_dao(
        &token,
        &LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
            enable_minter: false,
            expected_minter: None,
        },
    );
    assert!(client.get_pending_dao(&token).is_none());
}

// ============================================================================
// Admin handover and platform minter
// ============================================================================

#[test]
fn test_two_step_admin_handover() {
    let (env, client, admin) = setup();
    let new_admin = Address::generate(&env);
    assert_eq!(client.get_admin(), Some(admin));

    client.propose_admin(&new_admin);
    assert_eq!(client.get_pending_admin(), Some(new_admin.clone()));
    assert_ne!(client.get_admin(), Some(new_admin.clone()));

    client.accept_admin();
    assert_eq!(client.get_admin(), Some(new_admin));
    assert_eq!(client.get_pending_admin(), None);
}

#[test]
#[should_panic]
fn test_accept_admin_without_proposal_fails() {
    let (_env, client, _admin) = setup();
    client.accept_admin();
}

#[test]
fn test_set_platform_minter() {
    let (env, client, _admin) = setup();
    assert_eq!(client.get_platform_minter(), None);
    let minter = Address::generate(&env);
    client.set_platform_minter(&minter);
    assert_eq!(client.get_platform_minter(), Some(minter));
}

#[test]
#[should_panic]
fn test_set_platform_minter_requires_admin() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let id = env.register(
        ManagerContract,
        (
            admin,
            BytesN::from_array(&env, &[0u8; 32]),
            String::from_str(&env, "0.1.0"),
        ),
    );
    // No mocked auths: admin auth is not provided.
    ManagerContractClient::new(&env, &id).set_platform_minter(&Address::generate(&env));
}

// ============================================================================
// Real-module launch tests (task #1: lifecycle and authority)
// ============================================================================

mod real_dao {
    use super::*;
    use crate::error::ManagerError;
    use common::CommonError;
    use soroban_sdk::{
        testutils::{Ledger, MockAuth, MockAuthInvoke},
        vec, IntoVal, Symbol, Vec,
    };

    pub struct RealDao {
        pub env: Env,
        pub client: ManagerContractClient<'static>,
        pub launch_admin: Address,
        pub addresses: crate::storage::DaoAddresses,
        pub token: token::DaoTokenContractClient<'static>,
        pub governor: governor::DaoGovernorContractClient<'static>,
        pub treasury: treasury::DaoTreasuryContractClient<'static>,
        pub auction: auction::DaoAuctionContractClient<'static>,
        pub marketplace: marketplace::MarketplaceContractClient<'static>,
        pub metadata: metadata::MetadataContractClient<'static>,
        pub payment: Address,
    }

    /// Deploys all six real modules at pre-generated addresses (constructor-only
    /// wiring, as `create_dao` does with predicted addresses), mints one founder
    /// token as launch_admin, and seeds the Manager's PendingDao.
    pub fn build() -> RealDao {
        let (env, client, _admin) = setup();
        env.ledger().set_sequence_number(100);
        env.ledger().set_timestamp(1_000);
        let manager = client.address.clone();
        let launch_admin = Address::generate(&env);
        let hash = BytesN::from_array(&env, &[0u8; 32]);
        let version = String::from_str(&env, "0.1.0");

        let addresses = crate::storage::DaoAddresses {
            token: Address::generate(&env),
            metadata: Address::generate(&env),
            auction: Address::generate(&env),
            governor: Address::generate(&env),
            treasury: Address::generate(&env),
            marketplace: Address::generate(&env),
        };
        let payment = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();

        env.register_at(
            &addresses.token,
            token::DaoTokenContract,
            (
                launch_admin.clone(),
                addresses.treasury.clone(),
                String::from_str(&env, "https://example.com/"),
                String::from_str(&env, "DAO"),
                String::from_str(&env, "DAO"),
                addresses.metadata.clone(),
                manager.clone(),
                hash.clone(),
                version.clone(),
            ),
        );
        env.register_at(
            &addresses.metadata,
            metadata::MetadataContract,
            (
                addresses.token.clone(),
                String::from_str(&env, "https://example.com"),
                String::from_str(&env, "desc"),
                String::from_str(&env, "https://example.com/i.png"),
                String::from_str(&env, "https://example.com/r"),
                manager.clone(),
                hash.clone(),
                launch_admin.clone(),
                addresses.treasury.clone(),
                Vec::<String>::new(&env),
                Vec::<soroban_sdk::Val>::new(&env),
                crate::storage::ArtworkIpfsGroup {
                    base_uri: String::from_str(&env, ""),
                    extension: String::from_str(&env, ""),
                },
                version.clone(),
            ),
        );
        env.register_at(
            &addresses.treasury,
            treasury::DaoTreasuryContract,
            (
                launch_admin.clone(),
                addresses.governor.clone(),
                manager.clone(),
                hash.clone(),
                version.clone(),
            ),
        );
        env.register_at(
            &addresses.governor,
            governor::DaoGovernorContract,
            (
                launch_admin.clone(),
                addresses.token.clone(),
                addresses.treasury.clone(),
                300_u32,
                300_u32,
                300_u32,
                1_u128,
                1_000_u32,
                manager.clone(),
                hash.clone(),
                version.clone(),
            ),
        );
        env.register_at(
            &addresses.auction,
            auction::DaoAuctionContract,
            (
                launch_admin.clone(),
                addresses.token.clone(),
                addresses.treasury.clone(),
                300_u64,
                10_000_000_i128,
                10_u32,
                50_u64,
                payment.clone(),
                manager.clone(),
                hash.clone(),
                version.clone(),
            ),
        );
        env.register_at(
            &addresses.marketplace,
            marketplace::MarketplaceContract,
            (
                addresses.token.clone(),
                launch_admin.clone(),
                addresses.treasury.clone(),
                payment.clone(),
                manager.clone(),
                hash.clone(),
                version.clone(),
                250_u32,
            ),
        );

        let token = token::DaoTokenContractClient::new(&env, &addresses.token);
        token.mint(&launch_admin, &launch_admin);

        let pending = PendingDao {
            addresses: addresses.clone(),
            launch_admin: launch_admin.clone(),
            auction_payment_asset: payment.clone(),
            marketplace_payment_asset: payment.clone(),
        };
        env.as_contract(&manager, || {
            crate::storage::set_persistent(
                &env,
                &ManagerKey::PendingDao(addresses.token.clone()),
                &pending,
            );
        });

        RealDao {
            governor: governor::DaoGovernorContractClient::new(&env, &addresses.governor),
            treasury: treasury::DaoTreasuryContractClient::new(&env, &addresses.treasury),
            auction: auction::DaoAuctionContractClient::new(&env, &addresses.auction),
            marketplace: marketplace::MarketplaceContractClient::new(&env, &addresses.marketplace),
            metadata: metadata::MetadataContractClient::new(&env, &addresses.metadata),
            token,
            addresses,
            launch_admin,
            client,
            payment,
            env,
        }
    }

    fn cfg(launch_auction: bool, launch_marketplace: bool, enable_minter: bool) -> LaunchConfig {
        LaunchConfig {
            launch_auction,
            launch_marketplace,
            enable_minter,
            expected_minter: None,
        }
    }

    fn cfg_pinned(minter: &Address) -> LaunchConfig {
        LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
            enable_minter: true,
            expected_minter: Some(minter.clone()),
        }
    }

    fn already_live() -> soroban_sdk::Error {
        CommonError::AlreadyLive.into()
    }

    /// Acceptance (a): a second `launch` on every module panics AlreadyLive.
    #[test]
    fn second_launch_panics_already_live_for_all_six_modules() {
        let dao = build();
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(true, true, false));

        let env = &dao.env;
        let attacker = Address::generate(env);
        let no_minters = Vec::<Address>::new(env);
        let results: [(&str, soroban_sdk::Error); 6] = [
            (
                "token",
                dao.token
                    .try_launch(&attacker, &no_minters)
                    .err()
                    .unwrap()
                    .unwrap(),
            ),
            (
                "governor",
                dao.governor.try_launch(&attacker).err().unwrap().unwrap(),
            ),
            (
                "treasury",
                dao.treasury.try_launch(&attacker).err().unwrap().unwrap(),
            ),
            (
                "auction",
                dao.auction
                    .try_launch(&attacker, &true, &dao.payment)
                    .err()
                    .unwrap()
                    .unwrap(),
            ),
            (
                "marketplace",
                dao.marketplace
                    .try_launch(&attacker, &true, &dao.payment)
                    .err()
                    .unwrap()
                    .unwrap(),
            ),
            (
                "metadata",
                dao.metadata.try_launch(&attacker).err().unwrap().unwrap(),
            ),
        ];
        for (module, err) in results {
            assert_eq!(err, already_live(), "{module} second launch");
        }
        // The pending record is gone, so the Manager cannot launch it again either.
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_none());
        assert_eq!(
            dao.client
                .try_launch_dao(&dao.addresses.token, &cfg(true, true, false))
                .err()
                .unwrap()
                .unwrap(),
            ManagerError::DaoNotFound
        );
    }

    /// Acceptance (b): with every auth mocked, the Manager (and anyone) cannot
    /// change owners, mint authority, or pause state of a launched DAO.
    #[test]
    fn manager_has_no_authority_after_launch() {
        let dao = build();
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(true, true, false));
        let env = &dao.env;
        let treasury = dao.addresses.treasury.clone();
        let attacker = Address::generate(env);

        // Metadata's upgrade authority is a plain `Owner` instance key.
        let metadata_owner = || -> Option<Address> {
            env.as_contract(&dao.addresses.metadata, || {
                env.storage()
                    .instance()
                    .get(&vec![env, Symbol::new(env, "Owner")])
            })
        };
        let snapshot = || {
            (
                dao.token.get_owner(),
                dao.governor.get_owner(),
                dao.treasury.get_owner(),
                dao.auction.get_owner(),
                dao.auction.paused(),
                dao.marketplace.get_config(),
                {
                    let c = dao.auction.get_config();
                    (c.treasury, c.payment_token, c.duration, c.reserve_price)
                },
                metadata_owner(),
                dao.token.mint_authority(&attacker),
                dao.token.mint_authority(&dao.addresses.auction),
            )
        };
        let before = snapshot();

        // Every previously Manager-gated entrypoint is now `launch`; every call
        // must be rejected with AlreadyLive (not silently ignored).
        let rejected: [(&str, Option<soroban_sdk::Error>); 6] = [
            (
                "token",
                dao.token
                    .try_launch(&attacker, &vec![env, attacker.clone()])
                    .err()
                    .and_then(|e| e.ok()),
            ),
            (
                "governor",
                dao.governor
                    .try_launch(&attacker)
                    .err()
                    .and_then(|e| e.ok()),
            ),
            (
                "treasury",
                dao.treasury
                    .try_launch(&attacker)
                    .err()
                    .and_then(|e| e.ok()),
            ),
            (
                "auction",
                dao.auction
                    .try_launch(&attacker, &false, &dao.payment)
                    .err()
                    .and_then(|e| e.ok()),
            ),
            (
                "marketplace",
                dao.marketplace
                    .try_launch(&attacker, &false, &dao.payment)
                    .err()
                    .and_then(|e| e.ok()),
            ),
            (
                "metadata",
                dao.metadata
                    .try_launch(&attacker)
                    .err()
                    .and_then(|e| e.ok()),
            ),
        ];
        for (module, err) in rejected {
            assert_eq!(
                err,
                Some(already_live()),
                "{module} launch must be AlreadyLive"
            );
        }
        // The old entrypoints no longer exist at all.
        for (contract, function) in [
            (&dao.addresses.token, "finalize_ownership"),
            (&dao.addresses.token, "enable_mint_authority_by_manager"),
            (&dao.addresses.governor, "finalize_ownership"),
            (&dao.addresses.treasury, "finalize_ownership"),
            (&dao.addresses.auction, "finalize_ownership"),
            (&dao.addresses.marketplace, "finalize_ownership"),
            (&dao.addresses.metadata, "finalize_upgrade_authority"),
        ] {
            assert!(
                env.try_invoke_contract::<(), soroban_sdk::Error>(
                    contract,
                    &Symbol::new(env, function),
                    vec![env, treasury.to_val()],
                )
                .is_err(),
                "{function} must not exist"
            );
        }

        assert_eq!(before, snapshot());
        assert_eq!(dao.token.get_owner(), Some(treasury.clone()));
        assert_eq!(metadata_owner(), Some(treasury));
    }

    /// Acceptance (e): wiring setters and the governor authority role are gone.
    /// The Rust clients above no longer expose them (compile-time absence); this
    /// also asserts at runtime that the exported contract functions do not exist.
    #[test]
    fn deleted_setters_are_not_exported_by_any_module() {
        let dao = build();
        let env = &dao.env;
        let who = Address::generate(env);
        for (contract, function) in [
            (&dao.addresses.governor, "set_treasury"),
            (&dao.addresses.governor, "set_token_contract"),
            (&dao.addresses.governor, "set_governor_authority"),
            (&dao.addresses.governor, "governor_authority"),
            (&dao.addresses.treasury, "set_governor"),
            (&dao.addresses.auction, "set_treasury"),
            (&dao.addresses.metadata, "initialize"),
        ] {
            assert!(
                env.try_invoke_contract::<(), soroban_sdk::Error>(
                    contract,
                    &Symbol::new(env, function),
                    vec![env, who.to_val()],
                )
                .is_err(),
                "{function} must not exist"
            );
        }
    }

    /// Acceptance (d): exactly the canonical mint set; no PlatformMinter unless enabled.
    #[test]
    fn launch_grants_exactly_the_canonical_mint_set() {
        let dao = build();
        let minter = Address::generate(&dao.env);
        dao.client.set_platform_minter(&minter);
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(true, true, false));

        let a = &dao.addresses;
        assert!(dao.token.mint_authority(&a.treasury));
        assert!(dao.token.mint_authority(&a.marketplace));
        assert!(dao.token.mint_authority(&a.auction));
        assert!(!dao.token.mint_authority(&minter));
        assert!(!dao.token.mint_authority(&dao.launch_admin));
        assert!(!dao.token.mint_authority(&a.governor));
        assert_eq!(dao.token.get_owner(), Some(a.treasury.clone()));
        assert_eq!(dao.governor.get_owner(), Some(a.treasury.clone()));
        assert_eq!(dao.treasury.get_owner(), Some(a.treasury.clone()));
        assert_eq!(dao.auction.get_owner(), Some(a.treasury.clone()));
        assert!(!dao.auction.paused());
        assert!(!dao.marketplace.get_config().paused);
        // launch_admin can no longer mint.
        assert!(dao
            .token
            .try_mint(&dao.launch_admin, &dao.launch_admin)
            .is_err());
    }

    #[test]
    fn launch_without_auction_omits_auction_minter_and_stays_paused() {
        let dao = build();
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(false, false, false));
        let a = &dao.addresses;
        assert!(!dao.token.mint_authority(&a.auction));
        assert!(dao.token.mint_authority(&a.treasury));
        assert!(dao.token.mint_authority(&a.marketplace));
        assert!(dao.auction.paused());
        assert!(dao.marketplace.get_config().paused);
    }

    #[test]
    fn enable_minter_grants_the_registered_platform_minter() {
        let dao = build();
        let minter = Address::generate(&dao.env);
        dao.client.set_platform_minter(&minter);
        dao.client
            .launch_dao(&dao.addresses.token, &cfg_pinned(&minter));
        assert!(dao.token.mint_authority(&minter));
        assert!(!dao.token.mint_authority(&dao.launch_admin));
    }

    #[test]
    fn enable_minter_requires_the_pinned_minter_to_match() {
        let dao = build();
        let minter = Address::generate(&dao.env);
        dao.client.set_platform_minter(&minter);
        let token = &dao.addresses.token;

        // None is rejected.
        let r = dao.client.try_launch_dao(token, &cfg(true, true, true));
        assert_eq!(
            r.err().unwrap().unwrap(),
            ManagerError::PlatformMinterMismatch
        );

        // A stale pin is rejected after the Manager admin swaps the minter.
        let swapped = Address::generate(&dao.env);
        dao.client.set_platform_minter(&swapped);
        let r = dao.client.try_launch_dao(token, &cfg_pinned(&minter));
        assert_eq!(
            r.err().unwrap().unwrap(),
            ManagerError::PlatformMinterMismatch
        );
        assert!(dao.client.get_pending_dao(token).is_some());

        // The current minter pinned explicitly succeeds.
        dao.client.launch_dao(token, &cfg_pinned(&swapped));
        assert!(dao.token.mint_authority(&swapped));
        assert!(!dao.token.mint_authority(&minter));
    }

    #[test]
    fn expected_minter_is_ignored_when_enable_minter_is_false() {
        let dao = build();
        let mut config = cfg(true, true, false);
        config.expected_minter = Some(Address::generate(&dao.env));
        dao.client.launch_dao(&dao.addresses.token, &config);
    }

    #[test]
    fn enable_minter_without_platform_minter_fails_and_launches_nothing() {
        let dao = build();
        let r = dao
            .client
            .try_launch_dao(&dao.addresses.token, &cfg(true, true, true));
        assert_eq!(
            r.err().unwrap().unwrap(),
            ManagerError::PlatformMinterNotSet
        );
        // Nothing launched: still pending, token still owned by launch_admin.
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_some());
        assert_eq!(dao.token.get_owner(), Some(dao.launch_admin.clone()));
    }

    #[test]
    fn launch_with_zero_supply_returns_launch_supply_zero() {
        let dao = build();
        // A second DAO's pending record whose token has no supply.
        let env = &dao.env;
        let empty_token = env.register(
            token::DaoTokenContract,
            (
                dao.launch_admin.clone(),
                dao.addresses.treasury.clone(),
                String::from_str(env, "u"),
                String::from_str(env, "n"),
                String::from_str(env, "s"),
                Address::generate(env),
                dao.client.address.clone(),
                BytesN::from_array(env, &[0u8; 32]),
                String::from_str(env, "0.1.0"),
            ),
        );
        let mut addresses = dao.addresses.clone();
        addresses.token = empty_token.clone();
        env.as_contract(&dao.client.address, || {
            crate::storage::set_persistent(
                env,
                &ManagerKey::PendingDao(empty_token.clone()),
                &PendingDao {
                    addresses,
                    launch_admin: dao.launch_admin.clone(),
                    auction_payment_asset: dao.payment.clone(),
                    marketplace_payment_asset: dao.payment.clone(),
                },
            );
        });
        let r = dao
            .client
            .try_launch_dao(&empty_token, &cfg(true, true, false));
        assert_eq!(r.err().unwrap().unwrap(), ManagerError::LaunchSupplyZero);
    }

    /// Acceptance (g): nothing can start before launch.
    #[test]
    fn auction_unpause_and_marketplace_primary_listing_are_not_live_before_launch() {
        let dao = build();
        let not_live: soroban_sdk::Error = CommonError::NotLive.into();
        assert_eq!(
            dao.auction
                .try_unpause(&dao.launch_admin)
                .err()
                .unwrap()
                .unwrap(),
            not_live
        );
        assert_eq!(
            dao.marketplace
                .try_create_primary_listing(&100, &10_000)
                .err()
                .unwrap()
                .unwrap(),
            not_live
        );
    }

    /// Acceptance (c) with the real token: launch_admin cannot grant mint authority in setup.
    #[test]
    fn set_mint_authority_before_launch_is_not_live() {
        let dao = build();
        let r = dao
            .token
            .try_set_mint_authority(&Address::generate(&dao.env), &true);
        assert_eq!(
            r.err().unwrap().unwrap(),
            soroban_sdk::Error::from(CommonError::NotLive)
        );
    }

    /// Acceptance (h): a transfer_ownership started in setup cannot be accepted after launch.
    #[test]
    fn pending_ownership_transfer_started_in_setup_is_dead_after_launch() {
        let dao = build();
        let attacker = Address::generate(&dao.env);
        let until = dao.env.ledger().sequence() + 1_000;
        dao.token.transfer_ownership(&attacker, &until);
        dao.governor.transfer_ownership(&attacker, &until);
        dao.treasury.transfer_ownership(&attacker, &until);
        dao.auction.transfer_ownership(&attacker, &until);
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(true, true, false));

        assert!(dao.token.try_accept_ownership().is_err());
        assert!(dao.governor.try_accept_ownership().is_err());
        assert!(dao.treasury.try_accept_ownership().is_err());
        assert!(dao.auction.try_accept_ownership().is_err());
        let t = Some(dao.addresses.treasury.clone());
        assert_eq!(dao.token.get_owner(), t);
        assert_eq!(dao.governor.get_owner(), t);
        assert_eq!(dao.treasury.get_owner(), t);
        assert_eq!(dao.auction.get_owner(), t);
    }

    /// Acceptance (f): create_dao rejects zero quorum and zero proposal threshold.
    #[test]
    fn create_dao_rejects_zero_quorum_and_zero_threshold() {
        let (env, client, _admin) = setup();
        register_stub_implementations(&env, &client);
        let deployer = Address::generate(&env);

        let mut zero_quorum = dao_params(&env, &deployer, 0);
        zero_quorum.initial_config.governance.quorum_bps = 0;
        assert_eq!(
            client.try_create_dao(&zero_quorum).err().unwrap().unwrap(),
            ManagerError::InvalidQuorumBps
        );

        let mut zero_threshold = dao_params(&env, &deployer, 1);
        zero_threshold.initial_config.governance.proposal_threshold = 0;
        assert_eq!(
            client
                .try_create_dao(&zero_threshold)
                .err()
                .unwrap()
                .unwrap(),
            ManagerError::InvalidProposalThreshold
        );

        // Sanity: valid params still succeed.
        client.create_dao(&dao_params(&env, &deployer, 2));
    }

    /// The manager's local cap must track the governor crate's constants.
    #[test]
    fn governance_timing_cap_matches_governor_constants() {
        assert_eq!(governor::MAX_VOTING_DELAY, 2_592_000);
        assert_eq!(governor::MAX_VOTING_PERIOD, 2_592_000);
        assert_eq!(governor::MAX_QUEUE_DELAY, 2_592_000);
    }

    #[test]
    fn create_dao_rejects_governance_timing_above_max_and_accepts_max() {
        let (env, client, _admin) = setup();
        register_stub_implementations(&env, &client);
        let deployer = Address::generate(&env);
        let max = governor::MAX_VOTING_DELAY;

        for field in 0..3u32 {
            let mut p = dao_params(&env, &deployer, u64::from(field));
            let g = &mut p.initial_config.governance;
            match field {
                0 => g.voting_delay = max + 1,
                1 => g.voting_period = governor::MAX_VOTING_PERIOD + 1,
                _ => g.queue_delay = governor::MAX_QUEUE_DELAY + 1,
            }
            assert_eq!(
                client.try_create_dao(&p).err().unwrap().unwrap(),
                ManagerError::InvalidGovernanceTiming
            );
        }

        let mut ok = dao_params(&env, &deployer, 10);
        let g = &mut ok.initial_config.governance;
        g.voting_delay = governor::MAX_VOTING_DELAY;
        g.voting_period = governor::MAX_VOTING_PERIOD;
        g.queue_delay = governor::MAX_QUEUE_DELAY;
        client.create_dao(&ok);
    }

    #[test]
    fn create_dao_validates_time_buffer_upper_bound() {
        let (env, client, _admin) = setup();
        register_stub_implementations(&env, &client);
        let deployer = Address::generate(&env);

        for (nonce, bad) in [(0u64, u64::MAX), (1, 86_401), (2, 0)] {
            let mut p = dao_params(&env, &deployer, nonce);
            p.initial_config.auction.time_buffer = bad;
            assert_eq!(
                client.try_create_dao(&p).err().unwrap().unwrap(),
                ManagerError::InvalidTimeBuffer
            );
        }
        let mut ok = dao_params(&env, &deployer, 3);
        ok.initial_config.auction.time_buffer = 86_400;
        client.create_dao(&ok);
    }

    /// Item 3: payment assets recorded at create_dao are asserted at launch.
    #[test]
    fn launch_dao_rejects_payment_asset_changed_during_setup() {
        let dao = build();
        let other = Address::generate(&dao.env);

        // launch_admin swaps the auction payment token in setup.
        dao.auction.set_payment_token(&other);
        let r = dao
            .client
            .try_launch_dao(&dao.addresses.token, &cfg(true, true, false));
        assert!(r.is_err());
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_some());
        assert_eq!(dao.token.get_owner(), Some(dao.launch_admin.clone()));
        dao.auction.set_payment_token(&dao.payment);

        // ...and the marketplace payment asset.
        dao.marketplace.set_payment_asset(&other);
        let r = dao
            .client
            .try_launch_dao(&dao.addresses.token, &cfg(true, true, false));
        assert!(r.is_err());
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_some());
        dao.marketplace.set_payment_asset(&dao.payment);

        // Unchanged assets launch fine.
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(true, true, false));
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_none());
    }

    /// Item 7: launch_marketplace=false forces paused even if unpaused in setup.
    #[test]
    fn launch_without_marketplace_forces_paused() {
        let dao = build();
        dao.marketplace.unpause();
        assert!(!dao.marketplace.get_config().paused);
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(true, false, false));
        assert!(dao.marketplace.get_config().paused);
    }

    /// Item 5: negative-auth tests WITHOUT mock_all_auths.
    #[test]
    fn launch_dao_requires_launch_admin_auth() {
        let dao = build();
        let env = &dao.env;
        let stranger = Address::generate(env);
        let config = cfg(true, true, false);
        env.mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &dao.client.address,
                fn_name: "launch_dao",
                args: (dao.addresses.token.clone(), config.clone()).into_val(env),
                sub_invokes: &[],
            },
        }]);
        assert!(dao
            .client
            .try_launch_dao(&dao.addresses.token, &config)
            .is_err());
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_some());
        assert_eq!(dao.token.get_owner(), Some(dao.launch_admin.clone()));
    }

    #[test]
    fn module_launch_requires_manager_auth_for_every_module() {
        let dao = build();
        let env = &dao.env;
        let t = dao.addresses.treasury.clone();
        let stranger = Address::generate(env);
        let minters = vec![env, t.clone()];

        // Authorize only a non-manager address for each call, one at a time.
        macro_rules! only_stranger {
            ($addr:expr, $fn_name:expr, $args:expr) => {
                env.mock_auths(&[MockAuth {
                    address: &stranger,
                    invoke: &MockAuthInvoke {
                        contract: $addr,
                        fn_name: $fn_name,
                        args: $args.into_val(env),
                        sub_invokes: &[],
                    },
                }]);
            };
        }
        only_stranger!(&dao.addresses.token, "launch", (&t, &minters));
        assert!(dao.token.try_launch(&t, &minters).is_err());
        only_stranger!(&dao.addresses.governor, "launch", (&t,));
        assert!(dao.governor.try_launch(&t).is_err());
        only_stranger!(&dao.addresses.treasury, "launch", (&t,));
        assert!(dao.treasury.try_launch(&t).is_err());
        only_stranger!(&dao.addresses.auction, "launch", (&t, true, &dao.payment));
        assert!(dao.auction.try_launch(&t, &true, &dao.payment).is_err());
        only_stranger!(
            &dao.addresses.marketplace,
            "launch",
            (&t, true, &dao.payment)
        );
        assert!(dao.marketplace.try_launch(&t, &true, &dao.payment).is_err());
        only_stranger!(&dao.addresses.metadata, "launch", (&t,));
        assert!(dao.metadata.try_launch(&t).is_err());

        // None of them went live.
        env.mock_all_auths();
        assert!(!dao.token.is_live());
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_some());
    }
}

// ============================================================================
// Hardening: auction duration bound, DaoCreated hashes, revoked-source migration
// ============================================================================

#[test]
fn create_dao_rejects_auction_duration_above_30_days() {
    let (env, client, _admin) = setup();
    register_stub_implementations(&env, &client);
    let deployer = Address::generate(&env);

    let mut params = dao_params(&env, &deployer, 1);
    params.initial_config.auction.duration = 2_592_001;
    let r = client.try_create_dao(&params);
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::ManagerError::InvalidDuration
    );

    // The boundary itself is accepted.
    params.initial_config.auction.duration = 2_592_000;
    env.cost_estimate().budget().reset_unlimited();
    client.create_dao(&params);
}

#[test]
fn create_dao_emits_dao_created_with_module_wasm_hashes() {
    use crate::events::DaoCreated;
    use crate::storage::DaoWasmHashes;
    use soroban_sdk::{testutils::Events, Event as _};

    let (env, client, _admin) = setup();
    register_stub_implementations(&env, &client);
    let deployer = Address::generate(&env);
    env.cost_estimate().budget().reset_unlimited();
    let addresses = client.create_dao(&dao_params(&env, &deployer, 7));
    let emitted = env.events().all();

    let hash_of = |name: &str| {
        // The stub hashes are the registered "latest" implementation per name.
        client
            .get_latest_implementation(&String::from_str(&env, name))
            .unwrap()
            .wasm_hash
    };
    let expected = DaoCreated {
        token_address: addresses.token.clone(),
        deployer: deployer.clone(),
        launch_admin: deployer.clone(),
        created_ledger: env.ledger().sequence() as u64,
        modules: addresses.clone(),
        wasm_hashes: DaoWasmHashes {
            token: hash_of("Token"),
            metadata: hash_of("Metadata"),
            auction: hash_of("Auction"),
            governor: hash_of("Governor"),
            treasury: hash_of("Treasury"),
            marketplace: hash_of("Marketplace"),
        },
    }
    .to_xdr(&env, &client.address);
    assert!(emitted.events().contains(&expected));
}

/// Module on a REVOKED hash can still migrate to an approved active hash, and
/// can `sync_version`; a revoked TARGET is rejected by the module.
#[test]
fn module_on_revoked_hash_migrates_away_and_syncs() {
    use common::testutils::empty_wasm;
    use common::CommonError;
    use marketplace::MarketplaceContractClient;

    let (env, client, _admin) = setup();
    let name = String::from_str(&env, "Marketplace");
    let b = BytesN::from_array(&env, &[0xB; 32]);
    let c = empty_wasm(&env);
    let bad = BytesN::from_array(&env, &[0xD; 32]);
    client.register_implementation(&name, &String::from_str(&env, "0.2.0"), &b);
    client.register_implementation(&name, &String::from_str(&env, "0.3.0"), &c);
    client.register_implementation(&name, &String::from_str(&env, "0.4.0"), &bad);

    let module = |b: &BytesN<32>| {
        let id = env.register(
            marketplace::MarketplaceContract,
            (
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                client.address.clone(),
                b.clone(),
                String::from_str(&env, "stale"),
                250u32,
            ),
        );
        (id.clone(), MarketplaceContractClient::new(&env, &id))
    };
    let (id, m) = module(&b);

    // Vulnerability found in B: revoke it, then approve the emergency migration.
    client.revoke_implementation(&b);
    client.approve_upgrade(&b, &bad);
    client.approve_upgrade(&b, &c);
    client.revoke_implementation(&bad);

    // sync_version still works for a module whose current hash is revoked.
    m.sync_version();
    assert_eq!(m.version(), String::from_str(&env, "0.2.0"));

    // Revoked target is rejected.
    let r = m.try_upgrade(&b, &bad);
    assert_eq!(
        r.err().unwrap().unwrap(),
        CommonError::UpgradeNotApproved.into()
    );

    // Migration off the revoked hash to the active, approved target succeeds.
    m.upgrade(&b, &c);
    // The contract code is now an empty module; read the stored keys directly.
    env.as_contract(&id, || {
        assert_eq!(common::upgrade::current_hash(&env), c);
        assert_eq!(
            common::upgrade::version(&env),
            String::from_str(&env, "0.3.0")
        );
    });
}
