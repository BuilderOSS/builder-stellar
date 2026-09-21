use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::error::Error;

// Storage keys
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Initialized,
    Settings,
    Properties,
    IpfsData,
    Attributes(u32), // token_id -> [u16; 16]
}

// Data structures

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settings {
    pub token: Address,
    pub project_uri: String,
    pub description: String,
    pub contract_image: String,
    pub renderer_base: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IpfsGroup {
    pub base_uri: String,
    pub extension: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Item {
    pub name: String,
    pub reference_slot: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Property {
    pub name: String,
    pub items: Vec<Item>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ItemParam {
    pub property_id: u32,
    pub name: String,
    pub is_new_property: bool,
}

// Storage helpers

pub fn is_initialized(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Initialized)
        .unwrap_or(false)
}

pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
}

pub fn get_settings(env: &Env) -> Result<Settings, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Settings)
        .ok_or(Error::NotInitialized)
}

pub fn set_settings(env: &Env, settings: &Settings) {
    env.storage().instance().set(&DataKey::Settings, settings);
}

pub fn get_properties(env: &Env) -> Vec<Property> {
    env.storage()
        .persistent()
        .get(&DataKey::Properties)
        .unwrap_or(Vec::new(env))
}

pub fn set_properties(env: &Env, properties: &Vec<Property>) {
    env.storage()
        .persistent()
        .set(&DataKey::Properties, properties);
}

pub fn get_ipfs_data(env: &Env) -> Vec<IpfsGroup> {
    env.storage()
        .persistent()
        .get(&DataKey::IpfsData)
        .unwrap_or(Vec::new(env))
}

pub fn set_ipfs_data(env: &Env, ipfs_data: &Vec<IpfsGroup>) {
    env.storage()
        .persistent()
        .set(&DataKey::IpfsData, ipfs_data);
}

pub fn set_attributes(env: &Env, token_id: u32, attributes: &Vec<u32>) {
    // Keep the temporary entry below the network's maximum TTL.
    let ledgers_to_live = 5_000_000;
    env.storage()
        .temporary()
        .set(&DataKey::Attributes(token_id), attributes);
    env.storage().temporary().extend_ttl(
        &DataKey::Attributes(token_id),
        ledgers_to_live,
        ledgers_to_live,
    );
}
