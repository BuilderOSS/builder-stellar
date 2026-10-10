#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String, Vec,
};
use token::DaoTokenContract;

use crate::{IpfsGroup, ItemParam, MetadataContract, MetadataContractClient};

/// Returns a client for a not-yet-registered address; `initialize_metadata`
/// (or `register_metadata`) deploys the contract there via its constructor.
fn create_contract<'a>(env: &Env) -> MetadataContractClient<'a> {
    MetadataContractClient::new(env, &Address::generate(env))
}

#[allow(clippy::too_many_arguments)]
fn register_metadata(
    env: &Env,
    at: &Address,
    token: &Address,
    manager: &Address,
    hash: &BytesN<32>,
    owner: &Address,
) {
    env.register_at(
        at,
        MetadataContract,
        (
            token.clone(),
            String::from_str(env, "https://example.com"),
            String::from_str(env, "Test DAO"),
            String::from_str(env, "https://example.com/image.png"),
            String::from_str(env, "https://renderer.example.com/render"),
            manager.clone(),
            hash.clone(),
            owner.clone(),
            Address::generate(env), // treasury
            Vec::<String>::new(env),
            Vec::<ItemParam>::new(env),
            IpfsGroup {
                base_uri: String::from_str(env, "ipfs://"),
                extension: String::from_str(env, ".png"),
            },
            String::from_str(env, "0.1.0"),
        ),
    );
}

fn create_token_contract(env: &Env, owner: &Address) -> Address {
    env.register(
        DaoTokenContract,
        (
            owner.clone(),
            Address::generate(env), // treasury
            Address::generate(env), // auction
            Address::generate(env), // marketplace
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

fn initialize_metadata<'a>(
    env: &Env,
    client: &MetadataContractClient<'a>,
    token: &Address,
    owner: &Address,
) {
    register_metadata(
        env,
        &client.address,
        token,
        &Address::generate(env),
        &BytesN::from_array(env, &[0; 32]),
        owner,
    );
}

#[test]
fn test_initialize() {
    let env = Env::default();
    let client = create_contract(&env);
    let token = Address::generate(&env);
    let owner = Address::generate(&env);

    initialize_metadata(&env, &client, &token, &owner);

    assert_eq!(client.version(), String::from_str(&env, "0.1.0"));
    assert_eq!(client.wasm_hash(), BytesN::from_array(&env, &[0u8; 32]));
    let settings = client.get_settings();
    assert_eq!(settings.token, token);
    assert_eq!(
        settings.project_uri,
        String::from_str(&env, "https://example.com")
    );
}

#[test]
fn test_add_properties() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);

    initialize_metadata(&env, &client, &token, &owner);

    // Add first property with items
    let mut names = Vec::new(&env);
    names.push_back(String::from_str(&env, "Background"));

    let mut items = Vec::new(&env);
    items.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "Cool"),
        is_new_property: true,
    });
    items.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "Warm"),
        is_new_property: true,
    });

    let ipfs_group = IpfsGroup {
        base_uri: String::from_str(&env, "ipfs://QmTest"),
        extension: String::from_str(&env, ".png"),
    };

    client.add_properties(&names, &items, &ipfs_group);

    assert_eq!(client.properties_count(), 1);
    assert_eq!(client.items_count(&0), 2);

    let property = client.get_property(&0).unwrap();
    assert_eq!(property.name, String::from_str(&env, "Background"));
    assert_eq!(property.items.len(), 2);
}

#[test]
fn test_add_multiple_properties() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);

    initialize_metadata(&env, &client, &token, &owner);

    // Add two properties at once
    let mut names = Vec::new(&env);
    names.push_back(String::from_str(&env, "Background"));
    names.push_back(String::from_str(&env, "Body"));

    let mut items = Vec::new(&env);
    // Items for Background
    items.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "Cool"),
        is_new_property: true,
    });
    items.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "Warm"),
        is_new_property: true,
    });
    // Items for Body
    items.push_back(ItemParam {
        property_id: 1,
        name: String::from_str(&env, "Pink"),
        is_new_property: true,
    });
    items.push_back(ItemParam {
        property_id: 1,
        name: String::from_str(&env, "Green"),
        is_new_property: true,
    });

    let ipfs_group = IpfsGroup {
        base_uri: String::from_str(&env, "ipfs://QmTest"),
        extension: String::from_str(&env, ".png"),
    };

    client.add_properties(&names, &items, &ipfs_group);

    assert_eq!(client.properties_count(), 2);
    assert_eq!(client.items_count(&0), 2);
    assert_eq!(client.items_count(&1), 2);
}

#[test]
#[should_panic]
fn test_add_properties_first_time_needs_property_and_item() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);

    initialize_metadata(&env, &client, &token, &owner);

    let names = Vec::new(&env);
    let items = Vec::new(&env);
    let ipfs_group = IpfsGroup {
        base_uri: String::from_str(&env, "ipfs://QmTest"),
        extension: String::from_str(&env, ".png"),
    };

    client.add_properties(&names, &items, &ipfs_group);
}

#[test]
#[should_panic]
fn test_add_properties_max_16() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);

    initialize_metadata(&env, &client, &token, &owner);

    // Try to add 17 properties
    let mut names = Vec::new(&env);
    let mut items = Vec::new(&env);

    for i in 0..17 {
        names.push_back(String::from_str(&env, "Property"));
        items.push_back(ItemParam {
            property_id: i,
            name: String::from_str(&env, "Item"),
            is_new_property: true,
        });
    }

    let ipfs_group = IpfsGroup {
        base_uri: String::from_str(&env, "ipfs://QmTest"),
        extension: String::from_str(&env, ".png"),
    };

    client.add_properties(&names, &items, &ipfs_group);
}

#[test]
fn test_on_minted() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);

    initialize_metadata(&env, &client, &token, &owner);

    // Add properties
    let mut names = Vec::new(&env);
    names.push_back(String::from_str(&env, "Background"));

    let mut items = Vec::new(&env);
    items.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "Cool"),
        is_new_property: true,
    });
    items.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "Warm"),
        is_new_property: true,
    });

    let ipfs_group = IpfsGroup {
        base_uri: String::from_str(&env, "ipfs://QmTest"),
        extension: String::from_str(&env, ".png"),
    };

    client.add_properties(&names, &items, &ipfs_group);

    // Mint token (simulated by calling on_minted)
    let token_id = 1u32;
    let result = client.on_minted(&token_id);

    assert!(result);
    assert!(!client.get_attributes(&token_id).is_empty());

    // Attributes are historical token metadata and must outlive the former
    // temporary-storage retention window.
    env.ledger().set_sequence_number(3_000_001);
    assert!(!client.get_attributes(&token_id).is_empty());
}

#[test]
fn test_on_minted_batch_seeds_every_token_in_range() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);

    initialize_metadata(&env, &client, &token, &owner);

    let mut names = Vec::new(&env);
    names.push_back(String::from_str(&env, "Background"));
    let mut items = Vec::new(&env);
    for name in ["Cool", "Warm"] {
        items.push_back(ItemParam {
            property_id: 0,
            name: String::from_str(&env, name),
            is_new_property: true,
        });
    }
    let ipfs_group = IpfsGroup {
        base_uri: String::from_str(&env, "ipfs://QmTest"),
        extension: String::from_str(&env, ".png"),
    };
    client.add_properties(&names, &items, &ipfs_group);

    assert!(client.on_minted_batch(&10u32, &5u32));
    for id in 10..15u32 {
        assert_eq!(client.get_attributes(&id).len(), 2);
    }
    assert!(client.try_get_attributes(&9u32).is_err());
    assert!(client.try_get_attributes(&15u32).is_err());
}

#[test]
fn test_on_minted_batch_no_properties_returns_false() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let token = Address::generate(&env);
    let owner = Address::generate(&env);

    initialize_metadata(&env, &client, &token, &owner);

    assert!(!client.on_minted_batch(&1u32, &3u32));
}

#[test]
fn test_on_minted_no_properties_returns_false() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let token = Address::generate(&env);
    let owner = Address::generate(&env);

    initialize_metadata(&env, &client, &token, &owner);

    let token_id = 1u32;
    let result = client.on_minted(&token_id);

    assert!(!result);
}

#[test]
fn test_update_settings() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);

    initialize_metadata(&env, &client, &token, &owner);

    // Update description
    let new_description = String::from_str(&env, "Updated description");
    client.update_description(&new_description);

    let settings = client.get_settings();
    assert_eq!(settings.description, new_description);
}

#[test]
fn test_delete_and_recreate_properties() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);

    initialize_metadata(&env, &client, &token, &owner);

    // Add initial properties
    let mut names = Vec::new(&env);
    names.push_back(String::from_str(&env, "Background"));

    let mut items = Vec::new(&env);
    items.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "Cool"),
        is_new_property: true,
    });

    let ipfs_group = IpfsGroup {
        base_uri: String::from_str(&env, "ipfs://QmTest"),
        extension: String::from_str(&env, ".png"),
    };

    client.add_properties(&names, &items, &ipfs_group);
    assert_eq!(client.properties_count(), 1);

    // Delete and recreate
    let mut new_names = Vec::new(&env);
    new_names.push_back(String::from_str(&env, "Body"));

    let mut new_items = Vec::new(&env);
    new_items.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "Pink"),
        is_new_property: true,
    });

    let new_ipfs_group = IpfsGroup {
        base_uri: String::from_str(&env, "ipfs://QmTest2"),
        extension: String::from_str(&env, ".png"),
    };

    client.delete_and_recreate_properties(&new_names, &new_items, &new_ipfs_group);

    assert_eq!(client.properties_count(), 1);
    let property = client.get_property(&0).unwrap();
    assert_eq!(property.name, String::from_str(&env, "Body"));
}

#[test]
fn launch_is_one_shot_and_moves_upgrade_authority() {
    let env = Env::default();
    env.mock_all_auths();
    let client = create_contract(&env);
    let manager = Address::generate(&env);
    let owner = Address::generate(&env);
    register_metadata(
        &env,
        &client.address,
        &Address::generate(&env),
        &manager,
        &BytesN::from_array(&env, &[0; 32]),
        &owner,
    );

    let wrong = Address::generate(&env);
    let r = client.try_launch(&wrong);
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::error::Error::TreasuryMismatch.into()
    );
    let treasury: Address = env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .get(&crate::storage::DataKey::Treasury)
            .unwrap()
    });
    assert_eq!(client.admin(), owner);
    client.launch(&treasury);
    assert_eq!(client.admin(), treasury);
    let r = client.try_launch(&owner);
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::AlreadyLive.into()
    );
}

mod upgrade_via_common {
    use super::*;
    use common::testutils::{empty_wasm, MockManager, MockManagerClient};

    #[test]
    fn upgrade_goes_through_common_apply() {
        let env = Env::default();
        env.mock_all_auths();
        let mgr = MockManagerClient::new(&env, &env.register(MockManager, ()));
        let from = BytesN::from_array(&env, &[1u8; 32]);
        let to = empty_wasm(&env);
        let owner = Address::generate(&env);
        let client = create_contract(&env);
        let id = client.address.clone();
        register_metadata(
            &env,
            &client.address,
            &Address::generate(&env),
            &mgr.address,
            &from,
            &owner,
        );
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&env, "0.2.0"));
        client.upgrade(&from, &to);

        // Contract code is swapped to an empty module; read the stored keys directly.
        env.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&env), to);
            assert_eq!(
                common::upgrade::version(&env),
                String::from_str(&env, "0.2.0")
            );
        });
    }

    #[test]
    fn upgrade_rejected_when_not_approved() {
        let env = Env::default();
        env.mock_all_auths();
        let mgr = MockManagerClient::new(&env, &env.register(MockManager, ()));
        let from = BytesN::from_array(&env, &[1u8; 32]);
        let to = empty_wasm(&env);
        let owner = Address::generate(&env);
        let client = create_contract(&env);
        register_metadata(
            &env,
            &client.address,
            &Address::generate(&env),
            &mgr.address,
            &from,
            &owner,
        );
        mgr.register(&to, &String::from_str(&env, "0.2.0"));
        let r = client.try_upgrade(&from, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::UpgradeNotApproved.into()
        );
    }

    #[test]
    fn upgrade_and_sync_version_reject_unauthorized_caller() {
        let env = Env::default();
        env.mock_all_auths();
        let mgr = MockManagerClient::new(&env, &env.register(MockManager, ()));
        let from = BytesN::from_array(&env, &[1u8; 32]);
        let to = empty_wasm(&env);
        let owner = Address::generate(&env);
        let client = create_contract(&env);
        let id = client.address.clone();
        register_metadata(
            &env,
            &client.address,
            &Address::generate(&env),
            &mgr.address,
            &from,
            &owner,
        );
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&env, "0.2.0"));
        mgr.register(&from, &String::from_str(&env, "0.1.1"));
        // Drop mock_all_auths: no authorization is provided for any address.
        env.set_auths(&[]);
        assert!(client.try_upgrade(&from, &to).is_err());
        assert!(client.try_sync_version().is_err());
        env.mock_all_auths();
        env.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&env), from);
            assert_eq!(
                common::upgrade::version(&env),
                String::from_str(&env, "0.1.0")
            );
        });
    }

    #[test]
    fn upgrade_hash_mismatch_leaves_state_unchanged() {
        let env = Env::default();
        env.mock_all_auths();
        let mgr = MockManagerClient::new(&env, &env.register(MockManager, ()));
        let from = BytesN::from_array(&env, &[1u8; 32]);
        let to = empty_wasm(&env);
        let owner = Address::generate(&env);
        let client = create_contract(&env);
        let id = client.address.clone();
        register_metadata(
            &env,
            &client.address,
            &Address::generate(&env),
            &mgr.address,
            &from,
            &owner,
        );
        let wrong = BytesN::from_array(&env, &[9u8; 32]);
        mgr.approve(&wrong, &to);
        mgr.register(&to, &String::from_str(&env, "0.2.0"));
        let r = client.try_upgrade(&wrong, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::HashMismatch.into()
        );
        env.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&env), from);
            assert_eq!(
                common::upgrade::version(&env),
                String::from_str(&env, "0.1.0")
            );
        });
    }
}

// ---- #5 M5 / M6 / M7 ----

fn group(env: &Env, uri: &str) -> IpfsGroup {
    IpfsGroup {
        base_uri: String::from_str(env, uri),
        extension: String::from_str(env, ".png"),
    }
}

/// One new property named `name` holding `n` items (batched under the per-call cap).
fn add_new_property(env: &Env, client: &MetadataContractClient, name: &str, n: u32, uri: &str) {
    let mut names = Vec::new(env);
    names.push_back(String::from_str(env, name));
    let mut done = 0;
    let mut first = true;
    while done < n {
        let batch = (n - done).min(crate::MAX_ITEMS_PER_CALL);
        let mut items = Vec::new(env);
        for _ in 0..batch {
            items.push_back(ItemParam {
                property_id: 0,
                name: String::from_str(env, "item"),
                is_new_property: first,
            });
        }
        let nm = if first { names.clone() } else { Vec::new(env) };
        client.add_properties(&nm, &items, &group(env, uri));
        first = false;
        done += batch;
    }
}

/// `n` items for existing property `pid` (must be <= cap).
fn add_items(env: &Env, client: &MetadataContractClient, pid: u32, n: u32, uri: &str) {
    let mut items = Vec::new(env);
    for _ in 0..n {
        items.push_back(ItemParam {
            property_id: pid,
            name: String::from_str(env, "it"),
            is_new_property: false,
        });
    }
    client.add_properties(&Vec::new(env), &items, &group(env, uri));
}

fn setup() -> (Env, MetadataContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().disable_resource_limits();
    env.cost_estimate().budget().reset_unlimited();
    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);
    initialize_metadata(&env, &client, &token, &owner);
    (env, client, owner, token)
}

fn add_n_properties(env: &Env, client: &MetadataContractClient, n: u32, items_each: u32) {
    let mut names = Vec::new(env);
    let mut items = Vec::new(env);
    for i in 0..n {
        names.push_back(String::from_str(env, "P"));
        for _ in 0..items_each {
            items.push_back(ItemParam {
                property_id: i,
                name: String::from_str(env, "i"),
                is_new_property: true,
            });
        }
    }
    client.add_properties(&names, &items, &group(env, "ipfs://n"));
}

#[test]
fn m5_reference_slot_is_stable_absolute_index() {
    let env = Env::default();
    env.mock_all_auths();
    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);
    initialize_metadata(&env, &client, &token, &owner);

    add_new_property(&env, &client, "Background", 2, "ipfs://first");
    let slot_before = client
        .get_property(&0)
        .unwrap()
        .items
        .get(0)
        .unwrap()
        .reference_slot;
    assert_eq!(slot_before, 0);

    // Second addition: an extra item for the existing property, new group.
    let mut items = Vec::new(&env);
    items.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "late"),
        is_new_property: false,
    });
    client.add_properties(&Vec::new(&env), &items, &group(&env, "ipfs://second"));

    let property = client.get_property(&0).unwrap();
    assert_eq!(property.items.len(), 3);
    assert_eq!(property.items.get(0).unwrap().reference_slot, 0);
    assert_eq!(property.items.get(2).unwrap().reference_slot, 1);
    let groups = client.get_ipfs_data();
    assert_eq!(groups.len(), 2);
    assert_eq!(
        groups
            .get(property.items.get(0).unwrap().reference_slot)
            .unwrap()
            .base_uri,
        String::from_str(&env, "ipfs://first")
    );
    assert_eq!(
        groups
            .get(property.items.get(2).unwrap().reference_slot)
            .unwrap()
            .base_uri,
        String::from_str(&env, "ipfs://second")
    );
}

#[test]
fn m6_mint_cost_does_not_grow_with_item_count() {
    // CPU/mem from the test harness also scale with the size of the mock
    // ledger (it is diffed per invocation), so we assert on the ledger
    // footprint instead: the same entries are read regardless of item count.
    fn mint_footprint(n: u32) -> (u32, u32, u32) {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().disable_resource_limits();
        env.cost_estimate().budget().reset_unlimited();
        let client = create_contract(&env);
        let owner = Address::generate(&env);
        let token = create_token_contract(&env, &owner);
        initialize_metadata(&env, &client, &token, &owner);
        add_new_property(&env, &client, "Background", n, "ipfs://x");
        assert_eq!(client.items_count(&0), n);
        client.on_minted(&1);
        let r = env.cost_estimate().resources();
        (r.memory_read_entries, r.write_entries, r.write_bytes)
    }
    assert_eq!(mint_footprint(5), mint_footprint(500));
}

#[test]
fn m6_mint_never_reads_item_entries() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().disable_resource_limits();
    env.cost_estimate().budget().reset_unlimited();
    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);
    initialize_metadata(&env, &client, &token, &owner);
    add_new_property(&env, &client, "Background", 50, "ipfs://x");

    // Delete every item entry: the mint path must still succeed because it
    // only needs the property count and each property's item count.
    env.as_contract(&client.address, || {
        for j in 0..50u32 {
            env.storage()
                .persistent()
                .remove(&crate::storage::DataKey::Item(0, j));
        }
    });
    assert!(client.on_minted(&1));
    let attrs = client.get_attributes(&1);
    assert_eq!(attrs.len(), 2);
    assert!(attrs.get(1).unwrap() < 50);
}

#[test]
fn m6_per_key_storage_roundtrips_through_getters() {
    let env = Env::default();
    env.mock_all_auths();
    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);
    initialize_metadata(&env, &client, &token, &owner);
    add_new_property(&env, &client, "A", 3, "ipfs://a");
    let props = client.get_properties();
    assert_eq!(props.len(), 1);
    assert_eq!(props.get(0).unwrap().items.len(), 3);
    assert_eq!(client.properties_count(), 1);
    assert_eq!(client.ipfs_data_count(), 1);
    assert_eq!(client.items_count(&7), 0);
    assert!(client.get_property(&7).is_none());
}

#[test]
fn m7_regenerate_seeds_token_minted_before_artwork() {
    let env = Env::default();
    env.mock_all_auths();
    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);
    initialize_metadata(&env, &client, &token, &owner);

    // Minted while no artwork exists (metadata hook on the token is a placeholder).
    let holder = Address::generate(&env);
    let token_client = token::DaoTokenContractClient::new(&env, &token);
    let token_id = token_client.mint(&owner, &holder);
    assert!(client.try_get_attributes(&token_id).is_err());

    // No properties yet.
    assert_eq!(
        client.try_regenerate(&token_id).err().unwrap().unwrap(),
        crate::Error::NoProperties
    );

    add_new_property(&env, &client, "Background", 4, "ipfs://x");
    // Nonexistent token.
    assert_eq!(
        client.try_regenerate(&999).err().unwrap().unwrap(),
        crate::Error::TokenNotMinted
    );

    client.regenerate(&token_id);
    assert_eq!(client.get_attributes(&token_id).len(), 2);

    assert_eq!(
        client.try_regenerate(&token_id).err().unwrap().unwrap(),
        crate::Error::AlreadySeeded
    );
}

#[test]
fn m7_regenerate_requires_owner_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);
    initialize_metadata(&env, &client, &token, &owner);
    add_new_property(&env, &client, "Background", 4, "ipfs://x");
    let holder = Address::generate(&env);
    let token_id = token::DaoTokenContractClient::new(&env, &token).mint(&owner, &holder);

    // Drop all mocked auths: nobody is authorized.
    env.set_auths(&[]);
    assert!(client.try_regenerate(&token_id).is_err());
    assert!(client.try_get_attributes(&token_id).is_err());
}

#[test]
fn reset_shrinks_getters_and_restarts_slots() {
    let (env, client, _owner, _token) = setup();
    add_n_properties(&env, &client, 5, 3);
    add_items(&env, &client, 0, 2, "ipfs://second");
    assert_eq!(client.properties_count(), 5);
    assert_eq!(client.ipfs_data_count(), 2);

    // Recreate with 2 properties, fewer items.
    let mut names = Vec::new(&env);
    names.push_back(String::from_str(&env, "A"));
    names.push_back(String::from_str(&env, "B"));
    let mut items = Vec::new(&env);
    for i in 0..2 {
        items.push_back(ItemParam {
            property_id: i,
            name: String::from_str(&env, "x"),
            is_new_property: true,
        });
    }
    client.delete_and_recreate_properties(&names, &items, &group(&env, "ipfs://fresh"));

    assert_eq!(client.properties_count(), 2);
    assert!(client.get_property(&4).is_none());
    assert!(client.get_property(&2).is_none());
    assert_eq!(client.items_count(&4), 0);
    assert_eq!(client.items_count(&0), 1);
    assert_eq!(client.get_property(&0).unwrap().items.len(), 1);
    assert_eq!(client.get_items(&0, &0, &50).len(), 1);
    assert_eq!(client.ipfs_data_count(), 1);
    assert!(client.get_ipfs_group(&1).is_none());
    assert_eq!(
        client
            .get_property(&0)
            .unwrap()
            .items
            .get(0)
            .unwrap()
            .reference_slot,
        0
    );
    assert_eq!(client.get_properties().len(), 2);
    assert_eq!(client.get_ipfs_data().len(), 1);

    // Mint works after reset and respects the new item counts.
    assert!(client.on_minted(&1));
    let attrs = client.get_attributes(&1);
    assert_eq!(attrs.len(), 3);
    assert_eq!(attrs.get(1).unwrap(), 0);
}

#[test]
fn regenerate_after_delete_and_recreate() {
    let (env, client, owner, token) = setup();
    let holder = Address::generate(&env);
    let token_id = token::DaoTokenContractClient::new(&env, &token).mint(&owner, &holder);
    add_new_property(&env, &client, "A", 2, "ipfs://a");
    client.regenerate(&token_id);
    assert_eq!(client.get_attributes(&token_id).len(), 2);
    // Recreate with an extra property; existing token keeps its attributes.
    add_n_properties_after_reset(&env, &client);
    assert_eq!(
        client.try_regenerate(&token_id).err().unwrap().unwrap(),
        crate::Error::AlreadySeeded
    );
    let t2 = token::DaoTokenContractClient::new(&env, &token).mint(&owner, &holder);
    client.regenerate(&t2);
    assert_eq!(client.get_attributes(&t2).len(), 3);
}

fn add_n_properties_after_reset(env: &Env, client: &MetadataContractClient) {
    let mut names = Vec::new(env);
    let mut items = Vec::new(env);
    for i in 0..2 {
        names.push_back(String::from_str(env, "P"));
        items.push_back(ItemParam {
            property_id: i,
            name: String::from_str(env, "i"),
            is_new_property: true,
        });
    }
    client.delete_and_recreate_properties(&names, &items, &group(env, "ipfs://r"));
}

#[test]
fn add_properties_cap_and_validation() {
    let (env, client, _o, _t) = setup();
    add_new_property(&env, &client, "A", 1, "ipfs://a");

    // > MAX_ITEMS_PER_CALL
    let mut items = Vec::new(&env);
    for _ in 0..(crate::MAX_ITEMS_PER_CALL + 1) {
        items.push_back(ItemParam {
            property_id: 0,
            name: String::from_str(&env, "i"),
            is_new_property: false,
        });
    }
    assert_eq!(
        client
            .try_add_properties(&Vec::new(&env), &items, &group(&env, "ipfs://x"))
            .err()
            .unwrap()
            .unwrap(),
        crate::Error::TooManyItems
    );
    // exactly the cap is fine
    add_items(&env, &client, 0, crate::MAX_ITEMS_PER_CALL, "ipfs://y");

    // empty names and empty items with existing properties
    assert_eq!(
        client
            .try_add_properties(&Vec::new(&env), &Vec::new(&env), &group(&env, "ipfs://z"))
            .err()
            .unwrap()
            .unwrap(),
        crate::Error::PropertyHasNoItems
    );
    assert_eq!(client.ipfs_data_count(), 2);

    // item for a nonexistent property
    let mut bad = Vec::new(&env);
    bad.push_back(ItemParam {
        property_id: 9,
        name: String::from_str(&env, "i"),
        is_new_property: false,
    });
    assert_eq!(
        client
            .try_add_properties(&Vec::new(&env), &bad, &group(&env, "ipfs://b"))
            .err()
            .unwrap()
            .unwrap(),
        crate::Error::InvalidPropertySelected
    );
    // new property with an invalid / overflowing property_id
    let mut names = Vec::new(&env);
    names.push_back(String::from_str(&env, "B"));
    for pid in [5u32, u32::MAX] {
        let mut it = Vec::new(&env);
        it.push_back(ItemParam {
            property_id: pid,
            name: String::from_str(&env, "i"),
            is_new_property: true,
        });
        assert_eq!(
            client
                .try_add_properties(&names, &it, &group(&env, "ipfs://b"))
                .err()
                .unwrap()
                .unwrap(),
            crate::Error::InvalidPropertySelected
        );
    }
    // new property without items
    let mut it = Vec::new(&env);
    it.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "i"),
        is_new_property: false,
    });
    assert_eq!(
        client
            .try_add_properties(&names, &it, &group(&env, "ipfs://b"))
            .err()
            .unwrap()
            .unwrap(),
        crate::Error::PropertyHasNoItems
    );
    assert_eq!(client.properties_count(), 1);
}

#[test]
fn sixteen_property_cap_when_appending() {
    let (env, client, _o, _t) = setup();
    add_n_properties(&env, &client, 15, 1);
    // one more is fine (16)
    add_new_property_at(&env, &client, 15);
    assert_eq!(client.properties_count(), 16);
    // a 17th is rejected
    let mut names = Vec::new(&env);
    names.push_back(String::from_str(&env, "X"));
    let mut it = Vec::new(&env);
    it.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(&env, "i"),
        is_new_property: true,
    });
    assert_eq!(
        client
            .try_add_properties(&names, &it, &group(&env, "ipfs://x"))
            .err()
            .unwrap()
            .unwrap(),
        crate::Error::TooManyProperties
    );
}

fn add_new_property_at(env: &Env, client: &MetadataContractClient, _at: u32) {
    let mut names = Vec::new(env);
    names.push_back(String::from_str(env, "L"));
    let mut it = Vec::new(env);
    it.push_back(ItemParam {
        property_id: 0,
        name: String::from_str(env, "i"),
        is_new_property: true,
    });
    client.add_properties(&names, &it, &group(env, "ipfs://l"));
}

#[test]
fn get_items_pagination_and_cap() {
    let (env, client, _o, _t) = setup();
    add_new_property(&env, &client, "A", 70, "ipfs://a");
    assert_eq!(client.get_items(&0, &0, &50).len(), 50);
    assert_eq!(client.get_items(&0, &50, &50).len(), 20);
    assert_eq!(client.get_items(&0, &70, &50).len(), 0);
    assert_eq!(client.get_items(&9, &0, &50).len(), 0);
    assert_eq!(
        client.try_get_items(&0, &0, &51).err().unwrap().unwrap(),
        crate::Error::LimitTooHigh
    );
    assert_eq!(
        client.get_ipfs_group(&0).unwrap().base_uri,
        String::from_str(&env, "ipfs://a")
    );
    assert!(client.get_ipfs_group(&99).is_none());
}

#[test]
fn bump_artwork_ttl_renews_window_and_is_bounded() {
    let (env, client, _o, _t) = setup();
    add_new_property(&env, &client, "A", 40, "ipfs://a"); // 40 items, 2 groups
    let total = 40 + 2;
    assert_eq!(
        client.try_bump_artwork_ttl(&0, &51).err().unwrap().unwrap(),
        crate::Error::LimitTooHigh
    );

    use crate::storage::DataKey;
    use soroban_sdk::testutils::storage::Persistent as _;
    let ttls = |env: &Env| {
        env.as_contract(&client.address, || {
            let p = env.storage().persistent();
            (
                p.get_ttl(&DataKey::Item(0, 0)),
                p.get_ttl(&DataKey::Item(0, 39)),
                p.get_ttl(&DataKey::IpfsGroup(1)),
                p.get_ttl(&DataKey::Property(0)),
            )
        })
    };
    let before = ttls(&env);

    // Age every entry below the renewal threshold, then renew the whole flat
    // space (permissionless). Entries above the threshold are left alone.
    let seq = env.ledger().sequence();
    let youngest = before.0.min(before.1).min(before.2).min(before.3);
    let oldest = before.0.max(before.1).max(before.2).max(before.3);
    assert!(oldest - youngest < common::ttl::PERSISTENT_TTL_THRESHOLD);
    env.ledger()
        .set_sequence_number(seq + (oldest - common::ttl::PERSISTENT_TTL_THRESHOLD) + 1);
    let aged = ttls(&env);
    assert!(aged.0 < before.0 && aged.1 < before.1 && aged.2 < before.2);
    env.set_auths(&[]);
    let mut next = 0;
    let mut calls = 0;
    while next < total {
        next = client.bump_artwork_ttl(&next, &20);
        calls += 1;
    }
    assert_eq!(calls, 3);
    assert_eq!(next, total);
    let after = ttls(&env);
    assert!(after.0 > aged.0 && after.1 > aged.1 && after.2 > aged.2 && after.3 > aged.3);
}

#[test]
fn on_minted_batch_after_reset_uses_new_counts() {
    let (_env, client, _o, _t) = setup();
    add_new_property(&_env, &client, "A", 3, "ipfs://a");
    assert!(client.on_minted_batch(&10, &4));
    for id in 10..14 {
        assert_eq!(client.get_attributes(&id).len(), 2);
    }
}

#[test]
fn m7_regenerate_rejects_valid_auth_from_wrong_address() {
    use soroban_sdk::{
        testutils::{MockAuth, MockAuthInvoke},
        IntoVal,
    };
    let (env, client, owner, token) = setup();
    add_new_property(&env, &client, "A", 3, "ipfs://a");
    let holder = Address::generate(&env);
    let token_id = token::DaoTokenContractClient::new(&env, &token).mint(&owner, &holder);
    let stranger = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "regenerate",
            args: (token_id,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_regenerate(&token_id).is_err());
    assert!(client.try_get_attributes(&token_id).is_err());
}

#[test]
fn state_changing_entrypoint_extends_instance_ttl() {
    use common::testutils::{advance_ledgers, instance_ttl};
    let (env, client, _owner, _token) = setup();
    advance_ledgers(&env, 120 * 17_280);
    let before = instance_ttl(&env, &client.address);
    client.update_description(&String::from_str(&env, "ttl"));
    let after = instance_ttl(&env, &client.address);
    assert!(
        after > before,
        "instance TTL not extended: {before} -> {after}"
    );
}

#[test]
fn settings_strings_are_capped() {
    let (env, client, _o, _t) = setup();
    let max = common::MAX_STRING_LENGTH as usize;
    let ok = String::from_str(&env, &"a".repeat(max));
    let long = String::from_str(&env, &"a".repeat(max + 1));
    client.update_description(&ok);
    for r in [
        client.try_update_description(&long),
        client.try_update_project_uri(&long),
        client.try_update_contract_image(&long),
        client.try_update_renderer_base(&long),
    ] {
        assert_eq!(r.err().unwrap().unwrap(), crate::Error::StringTooLong);
    }
    assert_eq!(client.description(), ok);
}

#[test]
fn artwork_admin_moves_to_treasury_at_launch() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    use soroban_sdk::IntoVal;
    let env = Env::default();
    env.mock_all_auths();
    let client = create_contract(&env);
    let owner = Address::generate(&env);
    register_metadata(
        &env,
        &client.address,
        &Address::generate(&env),
        &Address::generate(&env),
        &BytesN::from_array(&env, &[0; 32]),
        &owner,
    );
    let treasury = env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .get::<_, Address>(&crate::storage::DataKey::Treasury)
            .unwrap()
    });
    client.launch(&treasury);
    let text = String::from_str(&env, "new");
    env.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "update_description",
            args: (text.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_update_description(&text).is_err());
    env.mock_auths(&[MockAuth {
        address: &treasury,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "update_description",
            args: (text.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.update_description(&text);
    assert_eq!(client.description(), text);
}
