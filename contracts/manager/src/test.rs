#![cfg(test)]

extern crate std;

use soroban_sdk::{
    contract, contractimpl,
    testutils::Address as _,
    xdr::{LedgerEntryData, Limits, ScAddress, ScVal, WriteXdr},
    Address, Bytes, BytesN, Env, String,
};

use crate::{ManagerContract, ManagerContractClient};

/// Stand-in for the shared platform Minter: `launch_dao` registers it as the
/// DAO's `claims` module, which requires a deployed Wasm contract.
#[contract]
pub struct StubMinter;

#[contractimpl]
impl StubMinter {
    pub fn ping() {}
}

/// The shared platform Minter every test DAO launches with (a fixed address so
/// launch configs can be built without the Manager at hand), deployed on first
/// use.
fn test_minter(env: &Env) -> Address {
    let address = Address::from_str(
        env,
        "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    );
    if !address.exists() {
        env.register_at(&address, StubMinter, ());
    }
    address
}

/// A fresh deployed stand-in Minter.
fn stub_minter(env: &Env) -> Address {
    env.register(StubMinter, ())
}

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
            TEST_UPGRADE_DELAY,
        ),
    );
    let client = ManagerContractClient::new(&env, &contract_id);
    client.set_platform_minter(&test_minter(&env));

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
#[should_panic(expected = "Error(Contract, #7105)")]
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

    // Registration alone does not select "latest".
    assert!(client.get_latest_implementation(&name).is_none());
    client.set_latest_implementation(&name, &wasm_hash);

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
    assert_eq!(client.current_implementations(), None);

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
    let expected = crate::storage::DaoWasmHashes {
        token: token_wasm.clone(),
        metadata: metadata_wasm,
        auction: auction_wasm,
        governor: governor_wasm,
        treasury: treasury_wasm,
        marketplace: marketplace_wasm,
    };
    assert_eq!(client.current_implementations(), Some(expected.clone()));
    // Revoking a current hash does not hide it: DAOs created from it still run
    // it, and platform code renewal must keep finding it.
    client.revoke_implementation(&token_wasm);
    assert_eq!(client.current_implementations(), Some(expected));

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
            profile: String::from_str(&env, r#"{"v":1,"description":"Test DAO"}"#),
            renderer_base: String::from_str(&env, "https://example.com/render"),
            slug: String::from_str(&env, "dao-one"),
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

    // "Latest" is selected explicitly; registering an older release after it
    // (e.g. a v2 patch) never regresses it.
    client.set_latest_implementation(&name, &v3_wasm);
    client.register_implementation(
        &name,
        &String::from_str(&env, "2.1"),
        &BytesN::from_array(&env, &[4u8; 32]),
    );
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
    // The revoked version is still readable, so the module's version() keeps working.
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
    client.set_latest_implementation(&name, &v2_wasm);

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

/// Platform upgrade notice used by these tests (short; a deploy-time choice).
const TEST_UPGRADE_DELAY: u32 = 1_000;

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
        ("Metadata", 10, 0),
        ("Auction", 10, 0),
        ("Governor", 10, 0),
        ("Treasury", 4, 0),
        ("Marketplace", 7, 0),
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
        client.set_latest_implementation(&String::from_str(env, name), &hash);
        hashes.push(hash);
    }
    client.set_current_implementations(
        &hashes[0], &hashes[1], &hashes[2], &hashes[3], &hashes[4], &hashes[5],
    );
}

/// Unique per-nonce slug ("dao-<nonce>") so tests can create many DAOs.
fn slug_for_nonce(env: &Env, nonce: u64) -> String {
    let mut digits = [0u8; 20];
    let mut n = nonce;
    let mut i = digits.len();
    loop {
        i -= 1;
        digits[i] = b'0' + (n % 10) as u8;
        n /= 10;
        if n == 0 {
            break;
        }
    }
    let mut buf = [0u8; 24];
    buf[..4].copy_from_slice(b"dao-");
    let d = &digits[i..];
    buf[4..4 + d.len()].copy_from_slice(d);
    String::from_bytes(env, &buf[..4 + d.len()])
}

fn dao_params(env: &Env, deployer: &Address, nonce: u64) -> DaoCreationParams {
    DaoCreationParams {
        deployer: deployer.clone(),
        nonce,
        launch_admin: deployer.clone(),
        initial_config: InitialDaoConfigValues {
            token_name: String::from_str(env, "DAO"),
            token_symbol: String::from_str(env, "DAO"),
            profile: String::from_str(env, r#"{"v":1,"description":"Test DAO"}"#),
            renderer_base: String::from_str(env, "https://example.com/render"),
            slug: slug_for_nonce(env, nonce),
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
    pub fn wasm_hash(e: Env) -> BytesN<32> {
        e.storage()
            .instance()
            .get(&2u32)
            .unwrap_or(BytesN::from_array(&e, &[0u8; 32]))
    }
    pub fn admin(e: Env) -> Address {
        e.storage().instance().get(&1u32).unwrap()
    }
    pub fn total_supply(_e: Env) -> i128 {
        1
    }
    pub fn launch(
        _e: Env,
        _treasury: Address,
        _grants: soroban_sdk::Vec<common::modules::MintGrant>,
    ) {
    }
    pub fn register_module(
        _e: Env,
        _kind: soroban_sdk::Symbol,
        _address: Address,
        _non_voting: bool,
    ) {
    }
}

#[contract]
struct MockLaunchModule;

#[contractimpl]
impl MockLaunchModule {
    pub fn wasm_hash(e: Env) -> BytesN<32> {
        e.storage()
            .instance()
            .get(&2u32)
            .unwrap_or(BytesN::from_array(&e, &[0u8; 32]))
    }
    pub fn launch(_e: Env, _treasury: Address) {}
}

#[contract]
struct MockToggleModule;

#[contractimpl]
impl MockToggleModule {
    pub fn wasm_hash(e: Env) -> BytesN<32> {
        e.storage()
            .instance()
            .get(&2u32)
            .unwrap_or(BytesN::from_array(&e, &[0u8; 32]))
    }
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
    let last = last.unwrap();
    assert!(client.get_pending_dao(&last.token).is_some());
    // Pending DAOs only hold their requested slug; nothing is claimed yet.
    for dao in [&first, &last] {
        let slug = client.get_pending_dao(&dao.token).unwrap().slug;
        assert!(client.get_slug(&dao.token).is_none());
        assert!(client.try_get_dao_by_slug(&slug).is_err());
    }
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
    client.set_latest_implementation(&name, &hash_for(499));
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
    // Mocks report the all-zero hash, which must be registered.
    client.register_implementation(
        &String::from_str(&env, "Mock"),
        &String::from_str(&env, "1"),
        &BytesN::from_array(&env, &[0u8; 32]),
    );
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
        slug: String::from_str(&env, "mock-dao"),
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
            minter: test_minter(&env),
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
    assert_eq!(client.get_platform_minter(), Some(test_minter(&env)));
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
            TEST_UPGRADE_DELAY,
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
                addresses.auction.clone(),
                addresses.marketplace.clone(),
                String::from_str(&env, "DAO"),
                String::from_str(&env, "DAO"),
                addresses.metadata.clone(),
                manager.clone(),
                hash.clone(),
            ),
        );
        env.register_at(
            &addresses.metadata,
            metadata::MetadataContract,
            (
                addresses.token.clone(),
                String::from_str(&env, r#"{"v":1,"description":"desc"}"#),
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
                250_u32,
            ),
        );

        // The modules report the all-zero hash; launch_dao requires it registered.
        client.register_implementation(
            &String::from_str(&env, "Mock"),
            &String::from_str(&env, "0.1.0"),
            &hash,
        );
        let token = token::DaoTokenContractClient::new(&env, &addresses.token);
        token.mint(&launch_admin, &launch_admin);

        let pending = PendingDao {
            addresses: addresses.clone(),
            launch_admin: launch_admin.clone(),
            slug: String::from_str(&env, "real-dao"),
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

    fn cfg(env: &Env, launch_auction: bool, launch_marketplace: bool) -> LaunchConfig {
        LaunchConfig {
            launch_auction,
            launch_marketplace,
            minter: test_minter(env),
        }
    }

    fn cfg_pinned(minter: &Address) -> LaunchConfig {
        LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
            minter: minter.clone(),
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
            .launch_dao(&dao.addresses.token, &cfg(&dao.env, true, true));

        let env = &dao.env;
        let attacker = Address::generate(env);
        let no_grants = Vec::<common::modules::MintGrant>::new(env);
        let results: [(&str, soroban_sdk::Error); 6] = [
            (
                "token",
                dao.token
                    .try_launch(&attacker, &no_grants)
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
                .try_launch_dao(&dao.addresses.token, &cfg(&dao.env, true, true))
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
            .launch_dao(&dao.addresses.token, &cfg(&dao.env, true, true));
        let env = &dao.env;
        let treasury = dao.addresses.treasury.clone();
        let attacker = Address::generate(env);

        let metadata_owner = || -> Option<Address> { Some(dao.metadata.admin()) };
        let snapshot = || {
            (
                dao.token.admin(),
                dao.governor.admin(),
                dao.treasury.admin(),
                dao.auction.admin(),
                dao.auction.paused(),
                dao.marketplace.get_config(),
                {
                    let c = dao.auction.get_config();
                    (c.treasury, c.payment_token, c.duration, c.reserve_price)
                },
                metadata_owner(),
                dao.token.mint_allowance(&attacker),
                dao.token.mint_allowance(&dao.addresses.auction),
            )
        };
        let before = snapshot();

        // Every previously Manager-gated entrypoint is now `launch`; every call
        // must be rejected with AlreadyLive (not silently ignored).
        let rejected: [(&str, Option<soroban_sdk::Error>); 6] = [
            (
                "token",
                dao.token
                    .try_launch(&attacker, &Vec::new(env))
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
            (&dao.addresses.token, "set_mint_authority"),
            (&dao.addresses.token, "minter"),
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
        assert_eq!(dao.token.admin(), treasury.clone());
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
        // The display strings moved to the event-only profile, and artwork
        // renewal to the footprint sweep. Each is called with arguments of its
        // old signature, so only a missing function can fail.
        let text = soroban_sdk::String::from_str(env, "x").to_val();
        for (function, args) in [
            ("update_description", vec![env, text]),
            ("update_project_uri", vec![env, text]),
            ("update_contract_image", vec![env, text]),
            ("description", vec![env]),
            ("project_uri", vec![env]),
            ("contract_image", vec![env]),
            (
                "bump_artwork_ttl",
                vec![env, 0u32.into_val(env), 1u32.into_val(env)],
            ),
        ] {
            assert!(
                env.try_invoke_contract::<soroban_sdk::Val, soroban_sdk::Error>(
                    &dao.addresses.metadata,
                    &Symbol::new(env, function),
                    args,
                )
                .is_err(),
                "{function} must not exist"
            );
        }
    }

    /// Acceptance (d): exactly the canonical mint set, including the shared
    /// platform Minter, which the token records.
    #[test]
    fn launch_grants_exactly_the_canonical_mint_set() {
        let dao = build();
        let minter = stub_minter(&dao.env);
        dao.client.set_platform_minter(&minter);
        dao.client
            .launch_dao(&dao.addresses.token, &cfg_pinned(&minter));

        let a = &dao.addresses;
        // The Treasury mints as admin without an allowance; the canonical
        // modules get unlimited ones (Phase 1, docs/designs/membership-models.md).
        assert_eq!(dao.token.mint_allowance(&a.treasury), 0);
        assert_eq!(dao.token.mint_allowance(&a.marketplace), u32::MAX);
        assert_eq!(dao.token.mint_allowance(&a.auction), u32::MAX);
        assert_eq!(dao.token.mint_allowance(&minter), u32::MAX);
        assert_eq!(
            dao.token
                .module(&soroban_sdk::Symbol::new(&dao.env, "claims")),
            Some(minter.clone())
        );
        assert_eq!(dao.token.mint_allowance(&dao.launch_admin), 0);
        assert_eq!(dao.token.mint_allowance(&a.governor), 0);
        assert_eq!(dao.token.admin(), a.treasury.clone());
        assert_eq!(dao.governor.admin(), a.treasury.clone());
        assert_eq!(dao.treasury.admin(), a.treasury.clone());
        assert_eq!(dao.auction.admin(), a.treasury.clone());
        assert_eq!(dao.marketplace.admin(), a.treasury.clone());
        assert_eq!(dao.metadata.admin(), a.treasury.clone());
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
            .launch_dao(&dao.addresses.token, &cfg(&dao.env, false, false));
        let a = &dao.addresses;
        assert_eq!(dao.token.mint_allowance(&a.auction), 0);
        assert_eq!(dao.token.mint_allowance(&a.marketplace), u32::MAX);
        assert!(dao.auction.paused());
        assert!(dao.marketplace.get_config().paused);
    }

    #[test]
    fn launch_requires_the_pinned_minter_to_match() {
        let dao = build();
        let minter = stub_minter(&dao.env);
        dao.client.set_platform_minter(&minter);
        let token = &dao.addresses.token;

        // A minter other than the registered one is rejected.
        let r = dao
            .client
            .try_launch_dao(token, &cfg_pinned(&stub_minter(&dao.env)));
        assert_eq!(
            r.err().unwrap().unwrap(),
            ManagerError::PlatformMinterMismatch
        );

        // A stale pin is rejected after the Manager admin swaps the minter.
        let swapped = stub_minter(&dao.env);
        dao.client.set_platform_minter(&swapped);
        let r = dao.client.try_launch_dao(token, &cfg_pinned(&minter));
        assert_eq!(
            r.err().unwrap().unwrap(),
            ManagerError::PlatformMinterMismatch
        );
        assert!(dao.client.get_pending_dao(token).is_some());

        // The current minter pinned explicitly succeeds.
        dao.client.launch_dao(token, &cfg_pinned(&swapped));
        assert_eq!(dao.token.mint_allowance(&swapped), u32::MAX);
        assert_eq!(dao.token.mint_allowance(&minter), 0);
    }

    // Retired: expected_minter_is_ignored_when_enable_minter_is_false.
    // Value: protects=(none now) launching without a platform Minter;
    // retired_because=the Minter is required for every DAO (docs/STORAGE_DIET.md
    // D15) and `enable_minter`/`expected_minter` are removed (eng review D10);
    // replacement=launch_requires_the_pinned_minter_to_match.

    #[test]
    fn launch_without_platform_minter_fails_and_launches_nothing() {
        let dao = build();
        dao.env.as_contract(&dao.client.address, || {
            dao.env.storage().persistent().remove(&common::ns(
                &dao.env,
                crate::storage::ManagerKey::PlatformMinter,
            ));
        });
        let r = dao
            .client
            .try_launch_dao(&dao.addresses.token, &cfg(&dao.env, true, true));
        assert_eq!(
            r.err().unwrap().unwrap(),
            ManagerError::PlatformMinterNotSet
        );
        // Nothing launched: still pending, token still owned by launch_admin.
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_some());
        assert_eq!(dao.token.admin(), dao.launch_admin.clone());
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
                dao.addresses.auction.clone(),
                dao.addresses.marketplace.clone(),
                String::from_str(env, "n"),
                String::from_str(env, "s"),
                Address::generate(env),
                dao.client.address.clone(),
                BytesN::from_array(env, &[0u8; 32]),
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
                    slug: String::from_str(env, "empty-dao"),
                    auction_payment_asset: dao.payment.clone(),
                    marketplace_payment_asset: dao.payment.clone(),
                },
            );
        });
        let r = dao
            .client
            .try_launch_dao(&empty_token, &cfg(&dao.env, true, true));
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

    /// Acceptance (c) with the real token: the launch admin cannot give an
    /// arbitrary address mint rights in setup, only a registered module (and
    /// only the Manager registers modules before launch).
    #[test]
    fn launch_admin_cannot_grant_mint_rights_to_a_non_module_in_setup() {
        let dao = build();
        let r = dao
            .token
            .try_increase_mint_allowance(&Address::generate(&dao.env), &1);
        assert_eq!(
            r.err().unwrap().unwrap(),
            soroban_sdk::Error::from_contract_error(7209)
        );
    }

    /// Acceptance (h): no module exposes an admin transfer, two-step handover or
    /// renounce; the launch handoff is the only admin change.
    #[test]
    fn no_module_exposes_admin_transfer_or_renounce() {
        let dao = build();
        let env = &dao.env;
        let who = Address::generate(env);
        let a = &dao.addresses;
        for contract in [
            &a.token,
            &a.governor,
            &a.treasury,
            &a.auction,
            &a.marketplace,
            &a.metadata,
        ] {
            for function in [
                "transfer_ownership",
                "accept_ownership",
                "renounce_ownership",
                "set_admin",
                "get_owner",
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
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(&dao.env, true, true));
        let t = dao.addresses.treasury.clone();
        assert_eq!(dao.token.admin(), t);
        assert_eq!(dao.governor.admin(), t);
        assert_eq!(dao.treasury.admin(), t);
        assert_eq!(dao.auction.admin(), t);
        assert_eq!(dao.marketplace.admin(), t);
        assert_eq!(dao.metadata.admin(), t);
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

    /// The Manager and the governor validate against the same `common` bounds.
    #[test]
    fn governance_timing_cap_matches_governor_constants() {
        assert_eq!(governor::MAX_VOTING_DELAY, common::MAX_GOVERNANCE_DELAY);
        assert_eq!(governor::MAX_VOTING_PERIOD, common::MAX_GOVERNANCE_DELAY);
        assert_eq!(governor::MAX_QUEUE_DELAY, common::MAX_GOVERNANCE_DELAY);
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
            .try_launch_dao(&dao.addresses.token, &cfg(&dao.env, true, true));
        assert!(r.is_err());
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_some());
        assert_eq!(dao.token.admin(), dao.launch_admin.clone());
        dao.auction.set_payment_token(&dao.payment);

        // ...and the marketplace payment asset.
        dao.marketplace.set_payment_asset(&other);
        let r = dao
            .client
            .try_launch_dao(&dao.addresses.token, &cfg(&dao.env, true, true));
        assert!(r.is_err());
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_some());
        dao.marketplace.set_payment_asset(&dao.payment);

        // Unchanged assets launch fine.
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(&dao.env, true, true));
        assert!(dao.client.get_pending_dao(&dao.addresses.token).is_none());
    }

    /// Item 7: launch_marketplace=false forces paused even if unpaused in setup.
    #[test]
    fn launch_without_marketplace_forces_paused() {
        let dao = build();
        dao.marketplace.unpause();
        assert!(!dao.marketplace.get_config().paused);
        dao.client
            .launch_dao(&dao.addresses.token, &cfg(&dao.env, true, false));
        assert!(dao.marketplace.get_config().paused);
    }

    /// Item 5: negative-auth tests WITHOUT mock_all_auths.
    #[test]
    fn launch_dao_requires_launch_admin_auth() {
        let dao = build();
        let env = &dao.env;
        let stranger = Address::generate(env);
        let config = cfg(env, true, true);
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
        assert_eq!(dao.token.admin(), dao.launch_admin.clone());
    }

    #[test]
    fn module_launch_requires_manager_auth_for_every_module() {
        let dao = build();
        let env = &dao.env;
        let t = dao.addresses.treasury.clone();
        let stranger = Address::generate(env);
        let grants = Vec::<common::modules::MintGrant>::new(env);

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
        only_stranger!(&dao.addresses.token, "launch", (&t, &grants));
        assert!(dao.token.try_launch(&t, &grants).is_err());
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
        slug: String::from_str(&env, "dao-7"),
    }
    .to_xdr(&env, &client.address);
    assert!(emitted.events().contains(&expected));
}

/// Module on a REVOKED hash can still migrate to an approved active hash, and
/// still answers `version()`; a revoked TARGET is rejected by the module.
#[test]
fn module_on_revoked_hash_migrates_away_and_keeps_its_version() {
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

    // version() still answers for a module whose current hash is revoked.
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
            common::upgrade::version(&env, &client.address),
            String::from_str(&env, "0.3.0")
        );
    });
}

// ============================================================================
// Negative authorization: admin-only registry/governance methods
// ============================================================================

mod admin_auth {
    use super::*;
    use soroban_sdk::{
        testutils::{MockAuth, MockAuthInvoke},
        IntoVal, Val, Vec,
    };

    fn h(env: &Env, n: u8) -> BytesN<32> {
        BytesN::from_array(env, &[n; 32])
    }

    /// Runs `call` with no auths, then with only a stranger's auth (both must
    /// fail), then with the admin's auth (must succeed). `args` must match the call.
    fn check<T: core::fmt::Debug, E: core::fmt::Debug>(
        env: &Env,
        client: &ManagerContractClient,
        admin: &Address,
        fn_name: &'static str,
        args: Vec<Val>,
        call: impl Fn() -> Result<T, E>,
    ) {
        env.mock_auths(&[]);
        assert!(call().is_err(), "{fn_name} must fail with no auths");

        let stranger = Address::generate(env);
        for (who, ok) in [(&stranger, false), (admin, true)] {
            let invoke = MockAuthInvoke {
                contract: &client.address,
                fn_name,
                args: args.clone(),
                sub_invokes: &[],
            };
            env.mock_auths(&[MockAuth {
                address: who,
                invoke: &invoke,
            }]);
            let r = call();
            assert_eq!(
                r.is_ok(),
                ok,
                "{fn_name} as {}",
                if ok { "admin" } else { "stranger" }
            );
        }
    }

    #[test]
    fn register_implementation_requires_admin_auth() {
        let (env, client, admin) = setup();
        let (name, version, hash) = (
            String::from_str(&env, "Token"),
            String::from_str(&env, "1"),
            h(&env, 1),
        );
        check(
            &env,
            &client,
            &admin,
            "register_implementation",
            (name.clone(), version.clone(), hash.clone()).into_val(&env),
            || {
                client
                    .try_register_implementation(&name, &version, &hash)
                    .map(|_| ())
                    .map_err(|_| ())
            },
        );
        assert!(client.get_implementation(&hash).is_some());
    }

    #[test]
    fn approve_upgrade_requires_admin_auth() {
        let (env, client, admin) = setup();
        let name = String::from_str(&env, "Token");
        let v = String::from_str(&env, "1");
        client.register_implementation(&name, &v, &h(&env, 1));
        client.register_implementation(&name, &v, &h(&env, 2));
        let (from, to) = (h(&env, 1), h(&env, 2));
        check(
            &env,
            &client,
            &admin,
            "approve_upgrade",
            (from.clone(), to.clone()).into_val(&env),
            || {
                client
                    .try_approve_upgrade(&from, &to)
                    .map(|_| ())
                    .map_err(|_| ())
            },
        );
        assert!(client.is_upgrade_approved(&from, &to));
    }

    #[test]
    fn revoke_implementation_requires_admin_auth() {
        let (env, client, admin) = setup();
        let hash = h(&env, 1);
        client.register_implementation(
            &String::from_str(&env, "Token"),
            &String::from_str(&env, "1"),
            &hash,
        );
        check(
            &env,
            &client,
            &admin,
            "revoke_implementation",
            (hash.clone(),).into_val(&env),
            || {
                client
                    .try_revoke_implementation(&hash)
                    .map(|_| ())
                    .map_err(|_| ())
            },
        );
        assert!(client.get_implementation(&hash).unwrap().revoked);
    }

    #[test]
    fn set_current_implementations_requires_admin_auth() {
        let (env, client, admin) = setup();
        let names = [
            "Token",
            "Metadata",
            "Auction",
            "Governor",
            "Treasury",
            "Marketplace",
        ];
        for (i, n) in names.iter().enumerate() {
            client.register_implementation(
                &String::from_str(&env, n),
                &String::from_str(&env, "1"),
                &h(&env, i as u8 + 1),
            );
        }
        let hs: std::vec::Vec<BytesN<32>> = (1..=6).map(|i| h(&env, i)).collect();
        check(
            &env,
            &client,
            &admin,
            "set_current_implementations",
            (
                hs[0].clone(),
                hs[1].clone(),
                hs[2].clone(),
                hs[3].clone(),
                hs[4].clone(),
                hs[5].clone(),
            )
                .into_val(&env),
            || {
                client
                    .try_set_current_implementations(&hs[0], &hs[1], &hs[2], &hs[3], &hs[4], &hs[5])
                    .map(|_| ())
                    .map_err(|_| ())
            },
        );
    }

    #[test]
    fn cancel_pending_admin_requires_admin_auth() {
        let (env, client, admin) = setup();
        client.propose_admin(&Address::generate(&env));
        check(
            &env,
            &client,
            &admin,
            "cancel_pending_admin",
            ().into_val(&env),
            || {
                client
                    .try_cancel_pending_admin()
                    .map(|_| ())
                    .map_err(|_| ())
            },
        );
        assert_eq!(client.get_pending_admin(), None);
    }
}

// ============================================================================
// launch_dao re-checks the registry status of every module's current hash
// ============================================================================

mod launch_revocation {
    use super::*;
    use crate::error::ManagerError;

    const HASH: u8 = 0;

    struct Mocks {
        token: Address,
        all: [Address; 6],
        launch_admin: Address,
    }

    fn seed(env: &Env, client: &ManagerContractClient) -> Mocks {
        let launch_admin = Address::generate(env);
        let token = env.register(MockModule, ());
        let metadata = env.register(MockLaunchModule, ());
        let auction = env.register(MockToggleModule, ());
        let governor = env.register(MockLaunchModule, ());
        let treasury = env.register(MockLaunchModule, ());
        let marketplace = env.register(MockToggleModule, ());
        env.as_contract(&token, || {
            env.storage().instance().set(&1u32, &launch_admin);
        });
        let pending = PendingDao {
            addresses: crate::storage::DaoAddresses {
                token: token.clone(),
                metadata: metadata.clone(),
                auction: auction.clone(),
                governor: governor.clone(),
                treasury: treasury.clone(),
                marketplace: marketplace.clone(),
            },
            launch_admin: launch_admin.clone(),
            slug: String::from_str(env, "mock-dao"),
            auction_payment_asset: Address::generate(env),
            marketplace_payment_asset: Address::generate(env),
        };
        env.as_contract(&client.address, || {
            crate::storage::set_persistent(env, &ManagerKey::PendingDao(token.clone()), &pending);
        });
        Mocks {
            all: [
                token.clone(),
                metadata,
                auction,
                governor,
                treasury,
                marketplace,
            ],
            token,
            launch_admin,
        }
    }

    fn cfg(env: &Env) -> LaunchConfig {
        LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
            minter: test_minter(env),
        }
    }

    fn register(env: &Env, client: &ManagerContractClient, n: u8) -> BytesN<32> {
        let hash = BytesN::from_array(env, &[n; 32]);
        client.register_implementation(
            &String::from_str(env, "Token"),
            &String::from_str(env, "1"),
            &hash,
        );
        hash
    }

    #[test]
    fn launch_rejects_revoked_hash_then_succeeds_after_upgrade_to_approved_hash() {
        let (env, client, _admin) = setup();
        let old = register(&env, &client, HASH);
        let new = register(&env, &client, 9);
        let m = seed(&env, &client);
        let _ = &m.launch_admin;

        client.revoke_implementation(&old);
        let r = client.try_launch_dao(&m.token, &cfg(&env));
        assert_eq!(
            r.err().unwrap().unwrap(),
            ManagerError::PendingDaoUsesRevokedImplementation
        );
        // Nothing launched: the pending record is intact.
        assert!(client.get_pending_dao(&m.token).is_some());

        // Upgrading only the token is not enough: every module ran the revoked hash.
        env.as_contract(&m.token, || {
            env.storage().instance().set(&2u32, &new);
        });
        assert_eq!(
            client
                .try_launch_dao(&m.token, &cfg(&env))
                .err()
                .unwrap()
                .unwrap(),
            ManagerError::PendingDaoUsesRevokedImplementation
        );
        // Pre-launch upgrade of every module to a non-revoked approved hash.
        for module in &m.all {
            env.as_contract(module, || {
                env.storage().instance().set(&2u32, &new);
            });
        }
        client.launch_dao(&m.token, &cfg(&env));
        assert!(client.get_pending_dao(&m.token).is_none());
    }

    #[test]
    fn launch_rejects_each_module_on_revoked_or_unregistered_hash() {
        for i in 0..6 {
            let (env, client, _admin) = setup();
            let old = register(&env, &client, HASH);
            let m = seed(&env, &client);
            // Unregistered current hash on module i.
            env.as_contract(&m.all[i], || {
                env.storage()
                    .instance()
                    .set(&2u32, &BytesN::from_array(&env, &[77u8; 32]));
            });
            let r = client.try_launch_dao(&m.token, &cfg(&env));
            assert_eq!(
                r.err().unwrap().unwrap(),
                ManagerError::PendingDaoUsesRevokedImplementation
            );
            // Restoring it to the registered hash allows launch; revoking blocks it again.
            env.as_contract(&m.all[i], || {
                env.storage().instance().set(&2u32, &old);
            });
            client.revoke_implementation(&old);
            let r = client.try_launch_dao(&m.token, &cfg(&env));
            assert_eq!(
                r.err().unwrap().unwrap(),
                ManagerError::PendingDaoUsesRevokedImplementation
            );
        }
    }
}

// ============================================================================
// Slug registry
// ============================================================================

fn params_with_slug(env: &Env, nonce: u64, slug: &str) -> DaoCreationParams {
    let deployer = Address::generate(env);
    let mut p = dao_params(env, &deployer, nonce);
    p.initial_config.slug = String::from_str(env, slug);
    p
}

/// Seed a pending DAO backed by mock modules (so `launch_dao` completes)
/// that requests `slug`. Returns its token address.
fn seed_mock_pending(env: &Env, client: &ManagerContractClient, slug: &str) -> Address {
    // Mocks report the all-zero hash, which launch_dao requires registered.
    let zero = BytesN::from_array(env, &[0u8; 32]);
    if client.get_implementation(&zero).is_none() {
        client.register_implementation(
            &String::from_str(env, "Mock"),
            &String::from_str(env, "1"),
            &zero,
        );
    }
    let launch_admin = Address::generate(env);
    let token = env.register(MockModule, ());
    env.as_contract(&token, || {
        env.storage().instance().set(&1u32, &launch_admin);
    });
    let pending = PendingDao {
        addresses: crate::storage::DaoAddresses {
            token: token.clone(),
            metadata: env.register(MockLaunchModule, ()),
            auction: env.register(MockToggleModule, ()),
            governor: env.register(MockLaunchModule, ()),
            treasury: env.register(MockLaunchModule, ()),
            marketplace: env.register(MockToggleModule, ()),
        },
        launch_admin,
        slug: String::from_str(env, slug),
        auction_payment_asset: Address::generate(env),
        marketplace_payment_asset: Address::generate(env),
    };
    env.as_contract(&client.address, || {
        crate::storage::set_persistent(env, &ManagerKey::PendingDao(token.clone()), &pending);
    });
    token
}

fn launch_cfg(env: &Env) -> LaunchConfig {
    LaunchConfig {
        launch_auction: true,
        launch_marketplace: true,
        minter: test_minter(env),
    }
}

#[test]
fn slug_is_requested_at_create_and_claimed_at_launch() {
    let (env, client, _a) = setup();
    register_stub_implementations(&env, &client);
    env.mock_all_auths();
    let addrs = client.create_dao(&params_with_slug(&env, 1, "nouns-builders"));
    let slug = String::from_str(&env, "nouns-builders");
    // Requested only: the pending DAO carries it, nothing resolves yet.
    assert_eq!(client.get_pending_dao(&addrs.token).unwrap().slug, slug);
    assert!(client.get_slug(&addrs.token).is_none());
    assert_eq!(
        client.try_get_dao_by_slug(&slug),
        Err(Ok(crate::ManagerError::SlugNotFound))
    );

    let token = seed_mock_pending(&env, &client, "launched-dao");
    client.launch_dao(&token, &launch_cfg(&env));
    let launched = String::from_str(&env, "launched-dao");
    assert_eq!(client.get_dao_by_slug(&launched), token);
    assert_eq!(client.get_slug(&token), Some(launched));
}

#[test]
fn first_launch_wins_a_contested_slug_and_the_other_can_rename() {
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let first = seed_mock_pending(&env, &client, "contested");
    let second = seed_mock_pending(&env, &client, "contested");
    client.launch_dao(&first, &launch_cfg(&env));
    assert_eq!(
        client.try_launch_dao(&second, &launch_cfg(&env)),
        Err(Ok(crate::ManagerError::SlugTaken))
    );
    // Renaming to a claimed slug is refused, a free one works.
    assert_eq!(
        client.try_update_pending_slug(&second, &String::from_str(&env, "contested")),
        Err(Ok(crate::ManagerError::SlugTaken))
    );
    assert_eq!(
        client.try_update_pending_slug(&second, &String::from_str(&env, "Bad_Slug")),
        Err(Ok(crate::ManagerError::InvalidSlug))
    );
    client.update_pending_slug(&second, &String::from_str(&env, "runner-up"));
    client.launch_dao(&second, &launch_cfg(&env));
    assert_eq!(
        client.get_dao_by_slug(&String::from_str(&env, "runner-up")),
        second
    );
    assert_eq!(
        client.get_dao_by_slug(&String::from_str(&env, "contested")),
        first
    );
}

#[test]
fn create_dao_rejects_a_slug_claimed_by_a_launched_dao() {
    let (env, client, _a) = setup();
    register_stub_implementations(&env, &client);
    env.mock_all_auths();
    // Pending duplicates are allowed: nothing is claimed until launch.
    client.create_dao(&params_with_slug(&env, 1, "taken"));
    client.create_dao(&params_with_slug(&env, 2, "taken"));
    let token = seed_mock_pending(&env, &client, "taken");
    client.launch_dao(&token, &launch_cfg(&env));
    assert_eq!(
        client.try_create_dao(&params_with_slug(&env, 3, "taken")),
        Err(Ok(crate::ManagerError::SlugTaken))
    );
}

#[test]
fn update_pending_slug_requires_the_launch_admin() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    use soroban_sdk::IntoVal;
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let token = seed_mock_pending(&env, &client, "mine");
    let new_slug = String::from_str(&env, "theirs");
    let stranger = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "update_pending_slug",
            args: (token.clone(), new_slug.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_update_pending_slug(&token, &new_slug).is_err());
    assert_eq!(
        client.get_pending_dao(&token).unwrap().slug,
        String::from_str(&env, "mine")
    );
}

#[test]
fn launch_dao_is_blocked_while_the_factory_is_paused() {
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let token = seed_mock_pending(&env, &client, "paused-dao");
    client.pause_factory();
    assert_eq!(
        client.try_launch_dao(&token, &launch_cfg(&env)),
        Err(Ok(crate::ManagerError::FactoryPaused))
    );
    client.unpause_factory();
    client.launch_dao(&token, &launch_cfg(&env));
}

#[test]
fn set_latest_implementation_validates_the_record() {
    let (env, client, _a) = setup();
    let name = String::from_str(&env, "Token");
    let hash = BytesN::from_array(&env, &[5u8; 32]);
    assert_eq!(
        client.try_set_latest_implementation(&name, &hash),
        Err(Ok(crate::ManagerError::ImplementationNotFound))
    );
    client.register_implementation(&name, &String::from_str(&env, "1"), &hash);
    assert_eq!(
        client.try_set_latest_implementation(&String::from_str(&env, "Auction"), &hash),
        Err(Ok(crate::ManagerError::InvalidImplementationName))
    );
    client.revoke_implementation(&hash);
    assert_eq!(
        client.try_set_latest_implementation(&name, &hash),
        Err(Ok(crate::ManagerError::ImplementationNotFound))
    );
}

#[test]
fn invalid_slugs_are_rejected() {
    let (env, client, _a) = setup();
    register_stub_implementations(&env, &client);
    env.mock_all_auths();
    for bad in [
        "abc",
        "-abc",
        "abc-",
        "a--b",
        "Abc",
        "ab_c",
        "ab c",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ] {
        assert_eq!(
            client.try_create_dao(&params_with_slug(&env, 1, bad)),
            Err(Ok(crate::ManagerError::InvalidSlug)),
            "{bad}"
        );
    }
    client.create_dao(&params_with_slug(&env, 1, "a-b-1"));
    client.create_dao(&params_with_slug(&env, 2, "abcd"));
    client.create_dao(&params_with_slug(
        &env,
        3,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ));
}

#[test]
fn unknown_slug_is_not_found() {
    let (env, client, _a) = setup();
    let slug = String::from_str(&env, "nope");
    assert_eq!(
        client.try_get_dao_by_slug(&slug),
        Err(Ok(crate::ManagerError::SlugNotFound))
    );
}

// Retired: slug_survives_ttl_bump_past_original_expiry.
// Value: protects=(none now) the permissionless `bump_slug_ttl` renewal of the
// slug pair; retired_because=`bump_slug_ttl` is removed by docs/STORAGE_DIET.md
// § 7: the slug pair is renewed with every other DAO key by one
// ExtendFootprintTTL sweep; replacement=e2e `protocol_runs_on_chain_state_only`
// (the renewal inventory lists `SlugToDao` and `DaoSlug` and must match the
// ledger).

// ============================================================================
// change_slug
// ============================================================================

/// A token whose `admin()` must never be reached: `change_slug` has to reject
/// unknown tokens before calling into them.
#[contract]
struct PanickingAdminToken;

#[contractimpl]
impl PanickingAdminToken {
    pub fn admin(_e: Env) -> Address {
        panic!("change_slug called into an unknown token")
    }
}

/// Launch a mock DAO under `slug`, then hand its token admin to a fresh
/// "treasury" address, as the real launch does. Returns (token, treasury).
fn launch_mock(env: &Env, client: &ManagerContractClient, slug: &str) -> (Address, Address) {
    let token = seed_mock_pending(env, client, slug);
    client.launch_dao(&token, &launch_cfg(env));
    let treasury = Address::generate(env);
    env.as_contract(&token, || {
        env.storage().instance().set(&1u32, &treasury);
    });
    (token, treasury)
}

fn s(env: &Env, slug: &str) -> String {
    String::from_str(env, slug)
}

#[test]
fn change_slug_moves_the_dao_and_releases_the_old_slug() {
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let (token, _treasury) = launch_mock(&env, &client, "old-name");
    client.change_slug(&token, &s(&env, "new-name"));

    assert_eq!(client.get_slug(&token), Some(s(&env, "new-name")));
    assert_eq!(client.get_dao_by_slug(&s(&env, "new-name")), token);
    assert_eq!(
        client.try_get_dao_by_slug(&s(&env, "old-name")),
        Err(Ok(crate::ManagerError::SlugNotFound))
    );

    // The freed slug is claimable by another DAO at launch.
    let other = seed_mock_pending(&env, &client, "old-name");
    client.launch_dao(&other, &launch_cfg(&env));
    assert_eq!(client.get_dao_by_slug(&s(&env, "old-name")), other);
}

#[test]
fn change_slug_emits_slug_changed() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::Event as _;
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let (token, _treasury) = launch_mock(&env, &client, "before");
    client.change_slug(&token, &s(&env, "after"));
    let events = env.events().all();
    assert_eq!(
        events.events().last().unwrap(),
        &crate::events::SlugChanged {
            token_address: token.clone(),
            new_slug: s(&env, "after"),
            old_slug: s(&env, "before"),
        }
        .to_xdr(&env, &client.address)
    );
}

#[test]
fn change_slug_round_trips_and_chains() {
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let (token, _treasury) = launch_mock(&env, &client, "first");
    client.change_slug(&token, &s(&env, "second"));
    client.change_slug(&token, &s(&env, "third"));
    assert_eq!(client.get_slug(&token), Some(s(&env, "third")));
    for gone in ["first", "second"] {
        assert_eq!(
            client.try_get_dao_by_slug(&s(&env, gone)),
            Err(Ok(crate::ManagerError::SlugNotFound))
        );
    }
    // Taking back a freed slug of its own is a normal claim.
    client.change_slug(&token, &s(&env, "first"));
    assert_eq!(client.get_dao_by_slug(&s(&env, "first")), token);
}

#[test]
fn change_slug_rejects_bad_targets() {
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let (token, _t) = launch_mock(&env, &client, "mine");
    let (_other, _t2) = launch_mock(&env, &client, "theirs");
    assert_eq!(
        client.try_change_slug(&token, &s(&env, "mine")),
        Err(Ok(crate::ManagerError::SlugUnchanged))
    );
    assert_eq!(
        client.try_change_slug(&token, &s(&env, "theirs")),
        Err(Ok(crate::ManagerError::SlugTaken))
    );
    for bad in ["abc", "Bad_Slug", "a--b", "-abc"] {
        assert_eq!(
            client.try_change_slug(&token, &s(&env, bad)),
            Err(Ok(crate::ManagerError::InvalidSlug)),
            "{bad}"
        );
    }
    assert_eq!(client.get_slug(&token), Some(s(&env, "mine")));
}

#[test]
fn change_slug_rejects_pending_and_unknown_tokens_before_calling_them() {
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let pending = seed_mock_pending(&env, &client, "pending-dao");
    assert_eq!(
        client.try_change_slug(&pending, &s(&env, "elsewhere")),
        Err(Ok(crate::ManagerError::SlugNotFound))
    );
    // An arbitrary contract never gets called: its admin() would panic.
    let unknown = env.register(PanickingAdminToken, ());
    assert_eq!(
        client.try_change_slug(&unknown, &s(&env, "elsewhere")),
        Err(Ok(crate::ManagerError::SlugNotFound))
    );
}

#[test]
fn change_slug_requires_the_token_admin() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    use soroban_sdk::IntoVal;
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let (token, treasury) = launch_mock(&env, &client, "guarded");
    let (_b_token, b_treasury) = launch_mock(&env, &client, "dao-b-slug");
    // The launch admin no longer holds the token after launch.
    let launch_admin = Address::generate(&env);
    let target = s(&env, "hijacked");
    for signer in [&launch_admin, &b_treasury] {
        env.mock_auths(&[MockAuth {
            address: signer,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "change_slug",
                args: (token.clone(), target.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        assert!(client.try_change_slug(&token, &target).is_err());
        assert_eq!(client.get_slug(&token), Some(s(&env, "guarded")));
    }
    env.mock_auths(&[MockAuth {
        address: &treasury,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "change_slug",
            args: (token.clone(), target.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.change_slug(&token, &target);
    assert_eq!(client.get_slug(&token), Some(target));
}

#[test]
fn change_slug_is_blocked_while_the_factory_is_paused() {
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let (token, _t) = launch_mock(&env, &client, "paused-rename");
    client.pause_factory();
    assert_eq!(
        client.try_change_slug(&token, &s(&env, "fresh-name")),
        Err(Ok(crate::ManagerError::FactoryPaused))
    );
    client.unpause_factory();
    client.change_slug(&token, &s(&env, "fresh-name"));
}

#[test]
fn pending_dao_requesting_the_new_slug_is_blocked_and_can_recover() {
    let (env, client, _a) = setup();
    env.mock_all_auths();
    let (token, _t) = launch_mock(&env, &client, "launched-one");
    let pending = seed_mock_pending(&env, &client, "wanted");
    client.change_slug(&token, &s(&env, "wanted"));
    assert_eq!(
        client.try_launch_dao(&pending, &launch_cfg(&env)),
        Err(Ok(crate::ManagerError::SlugTaken))
    );
    client.update_pending_slug(&pending, &s(&env, "launched-one"));
    client.launch_dao(&pending, &launch_cfg(&env));
    assert_eq!(client.get_dao_by_slug(&s(&env, "launched-one")), pending);
}

#[test]
fn storage_keys_do_not_collide() {
    use common::testutils::{assert_keys_disjoint, common_key_shapes, key_shapes};
    use soroban_sdk::Env;
    let e = Env::default();
    // The Manager links no OZ storage. Its keys share the `builder`
    // namespace with `common`'s, so keep them disjoint even though it uses
    // none of them today (it would clash on adopting `common::admin` if its
    // admin key were still `Admin`).
    assert_keys_disjoint(&[
        (
            "ManagerKey",
            key_shapes(&e, crate::storage::key_samples::all(&e)),
        ),
        ("common", common_key_shapes(&e)),
    ]);
}

/// The Manager's own upgrade waits out the notice, re-approval cannot restart
/// the clock, and the notice is changeable with a reduction that waits.
#[test]
fn manager_upgrade_waits_out_its_notice() {
    use crate::error::ManagerError;
    use common::testutils::empty_wasm;
    use soroban_sdk::testutils::Ledger as _;
    let (env, client, _admin) = setup();
    assert_eq!(client.upgrade_delay(), TEST_UPGRADE_DELAY);
    let from = BytesN::from_array(&env, &[0u8; 32]);
    let to = empty_wasm(&env);
    client.register_implementation(
        &String::from_str(&env, "Manager"),
        &String::from_str(&env, "0.1.0"),
        &from,
    );
    client.register_implementation(
        &String::from_str(&env, "Manager"),
        &String::from_str(&env, "0.2.0"),
        &to,
    );
    // Not approved at all.
    assert_eq!(
        client
            .try_upgrade_manager(&from, &to)
            .err()
            .unwrap()
            .unwrap(),
        ManagerError::InvalidUpgradePath
    );
    let approved_at = env.ledger().sequence();
    client.approve_upgrade(&from, &to);
    assert_eq!(
        client.upgrade_approved_ledger(&from, &to),
        Some(approved_at as u64)
    );
    // Approved but not announced as latest: never applies (D42).
    env.ledger()
        .with_mut(|l| l.sequence_number += TEST_UPGRADE_DELAY + 1);
    assert_eq!(
        client
            .try_upgrade_manager(&from, &to)
            .err()
            .unwrap()
            .unwrap(),
        ManagerError::UpgradeNotLatest
    );
    // Announced now: the notice restarts from the announcement.
    let announced = env.ledger().sequence();
    let name = String::from_str(&env, "Manager");
    client.set_latest_implementation(&name, &to);
    assert_eq!(
        client.latest_pointer(&name).unwrap().set_ledger,
        announced as u64
    );
    assert_eq!(
        client
            .try_upgrade_manager(&from, &to)
            .err()
            .unwrap()
            .unwrap(),
        ManagerError::UpgradeDelayNotElapsed
    );
    // Re-approving and re-announcing later keep their first ledgers.
    env.ledger().with_mut(|l| l.sequence_number += 10);
    client.approve_upgrade(&from, &to);
    client.set_latest_implementation(&name, &to);
    assert_eq!(
        client.upgrade_approved_ledger(&from, &to),
        Some(approved_at as u64)
    );
    assert_eq!(
        client.latest_pointer(&name).unwrap().set_ledger,
        announced as u64
    );
    // A reduction waits out the notice in force; a raise applies at once.
    // Either way it is announced: the feed tells members a notice changed.
    let reduced_at = env.ledger().sequence();
    client.set_upgrade_delay(&1);
    {
        use soroban_sdk::{testutils::Events, Event as _};
        assert_eq!(
            env.events().all().events().last().unwrap(),
            &common::upgrade::UpgradeDelayChanged {
                from_ledgers: TEST_UPGRADE_DELAY,
                to_ledgers: 1,
                effective_ledger: reduced_at + TEST_UPGRADE_DELAY,
            }
            .to_xdr(&env, &client.address)
        );
    }
    assert_eq!(client.upgrade_delay(), TEST_UPGRADE_DELAY);
    env.ledger()
        .with_mut(|l| l.sequence_number += TEST_UPGRADE_DELAY - 1);
    assert_eq!(client.upgrade_delay(), TEST_UPGRADE_DELAY);
    env.ledger().with_mut(|l| l.sequence_number += 1);
    assert_eq!(client.upgrade_delay(), 1);
    // The announcement's notice has passed by now too.
    client.upgrade_manager(&from, &to);
    // The empty test wasm exports nothing, so read the stored hash directly.
    let stored: BytesN<32> = env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .get(&common::ns(
                &env,
                crate::storage::ManagerKey::CurrentManagerWasm,
            ))
            .unwrap()
    });
    assert_eq!(stored, to);
}
