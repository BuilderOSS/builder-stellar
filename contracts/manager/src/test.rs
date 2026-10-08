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
fn test_register_same_implementation_twice() {
    let (env, client, _admin) = setup();

    let name = String::from_str(&env, "Token");
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);

    // Register once
    client.register_implementation(&name, &String::from_str(&env, "1"), &wasm_hash);

    // Register again with same version - should succeed (overwrites)
    client.register_implementation(&name, &String::from_str(&env, "1"), &wasm_hash);

    let implementation = client.get_implementation(&wasm_hash).unwrap();
    assert_eq!(implementation.version, String::from_str(&env, "1"));

    let _ = env;
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
/// `initialize(init_arity)`, both returning void. Lets `create_dao` run its real
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
        ("Token", 8, 0),
        ("Metadata", 0, 12),
        ("Auction", 11, 0),
        ("Governor", 11, 0),
        ("Treasury", 5, 0),
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
    pub fn enable_mint_authority_by_manager(_e: Env, _who: Address) {}
    pub fn finalize_ownership(_e: Env, _treasury: Address) {}
    pub fn finalize_upgrade_authority(_e: Env, _treasury: Address) {}
}

#[contract]
struct MockToggleModule;

#[contractimpl]
impl MockToggleModule {
    pub fn finalize_ownership(_e: Env, _treasury: Address, _flag: bool) {}
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
    let governor = env.register(MockModule, ());
    let treasury = env.register(MockModule, ());
    let metadata = env.register(MockModule, ());
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
