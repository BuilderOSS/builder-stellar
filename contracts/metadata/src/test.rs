#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String, Vec,
};
use token::DaoTokenContract;

use crate::{IpfsGroup, ItemParam, MetadataContract, MetadataContractClient};

fn create_contract<'a>(env: &Env) -> MetadataContractClient<'a> {
    MetadataContractClient::new(env, &env.register(MetadataContract, ()))
}

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

fn initialize_metadata<'a>(
    env: &Env,
    client: &MetadataContractClient<'a>,
    token: &Address,
    owner: &Address,
) {
    client.initialize(
        token,
        &String::from_str(env, "https://example.com"),
        &String::from_str(env, "Test DAO"),
        &String::from_str(env, "https://example.com/image.png"),
        &String::from_str(env, "https://renderer.example.com/render"),
        &Address::generate(env),
        &soroban_sdk::BytesN::from_array(env, &[0; 32]),
        owner,
        &Vec::new(env),
        &Vec::new(env),
        &IpfsGroup {
            base_uri: String::from_str(env, "ipfs://"),
            extension: String::from_str(env, ".png"),
        },
        &String::from_str(env, "0.1.0"),
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
#[should_panic]
fn test_initialize_twice_fails() {
    let env = Env::default();
    let client = create_contract(&env);
    let token = Address::generate(&env);
    let owner = Address::generate(&env);

    initialize_metadata(&env, &client, &token, &owner);
    initialize_metadata(&env, &client, &token, &owner);
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

    assert_eq!(result, true);
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

    assert_eq!(result, false);
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
        client.initialize(
            &Address::generate(&env),
            &String::from_str(&env, "https://example.com"),
            &String::from_str(&env, "Test DAO"),
            &String::from_str(&env, "https://example.com/image.png"),
            &String::from_str(&env, "https://renderer.example.com/render"),
            &mgr.address,
            &from,
            &owner,
            &Vec::new(&env),
            &Vec::new(&env),
            &IpfsGroup {
                base_uri: String::from_str(&env, "ipfs://"),
                extension: String::from_str(&env, ".png"),
            },
            &String::from_str(&env, "0.1.0"),
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
        client.initialize(
            &Address::generate(&env),
            &String::from_str(&env, "https://example.com"),
            &String::from_str(&env, "Test DAO"),
            &String::from_str(&env, "https://example.com/image.png"),
            &String::from_str(&env, "https://renderer.example.com/render"),
            &mgr.address,
            &from,
            &owner,
            &Vec::new(&env),
            &Vec::new(&env),
            &IpfsGroup {
                base_uri: String::from_str(&env, "ipfs://"),
                extension: String::from_str(&env, ".png"),
            },
            &String::from_str(&env, "0.1.0"),
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
        client.initialize(
            &Address::generate(&env),
            &String::from_str(&env, "https://example.com"),
            &String::from_str(&env, "Test DAO"),
            &String::from_str(&env, "https://example.com/image.png"),
            &String::from_str(&env, "https://renderer.example.com/render"),
            &mgr.address,
            &from,
            &owner,
            &Vec::new(&env),
            &Vec::new(&env),
            &IpfsGroup {
                base_uri: String::from_str(&env, "ipfs://"),
                extension: String::from_str(&env, ".png"),
            },
            &String::from_str(&env, "0.1.0"),
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
        client.initialize(
            &Address::generate(&env),
            &String::from_str(&env, "https://example.com"),
            &String::from_str(&env, "Test DAO"),
            &String::from_str(&env, "https://example.com/image.png"),
            &String::from_str(&env, "https://renderer.example.com/render"),
            &mgr.address,
            &from,
            &owner,
            &Vec::new(&env),
            &Vec::new(&env),
            &IpfsGroup {
                base_uri: String::from_str(&env, "ipfs://"),
                extension: String::from_str(&env, ".png"),
            },
            &String::from_str(&env, "0.1.0"),
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
