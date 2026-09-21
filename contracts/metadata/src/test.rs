#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

use crate::{IpfsGroup, ItemParam, MetadataContract, MetadataContractClient};

// Mock Token contract for testing
mod mock_token {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/token.wasm");
}

fn create_contract<'a>(env: &Env) -> MetadataContractClient<'a> {
    MetadataContractClient::new(env, &env.register(MetadataContract, ()))
}

fn create_token_contract<'a>(env: &Env, owner: &Address) -> Address {
    let token_id = env.register(
        mock_token::WASM,
        (
            owner.clone(),
            String::from_str(env, "https://test.com"),
            String::from_str(env, "Test Token"),
            String::from_str(env, "TEST"),
            Address::generate(env), // metadata address (placeholder)
        ),
    );
    token_id
}

fn initialize_metadata<'a>(env: &Env, client: &MetadataContractClient<'a>, token: &Address) {
    client.initialize(
        token,
        &String::from_str(env, "https://example.com"),
        &String::from_str(env, "Test DAO"),
        &String::from_str(env, "https://example.com/image.png"),
        &String::from_str(env, "https://renderer.example.com/render"),
    );
}

#[test]
fn test_initialize() {
    let env = Env::default();
    let client = create_contract(&env);
    let token = Address::generate(&env);

    initialize_metadata(&env, &client, &token);

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

    initialize_metadata(&env, &client, &token);
    initialize_metadata(&env, &client, &token);
}

#[test]
fn test_add_properties() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let owner = Address::generate(&env);
    let token = create_token_contract(&env, &owner);

    initialize_metadata(&env, &client, &token);

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

    initialize_metadata(&env, &client, &token);

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

    initialize_metadata(&env, &client, &token);

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

    initialize_metadata(&env, &client, &token);

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

    initialize_metadata(&env, &client, &token);

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
}

#[test]
fn test_on_minted_no_properties_returns_false() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let token = Address::generate(&env);

    initialize_metadata(&env, &client, &token);

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

    initialize_metadata(&env, &client, &token);

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

    initialize_metadata(&env, &client, &token);

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
