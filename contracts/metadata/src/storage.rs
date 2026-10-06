use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::error::Error;

const DAY_IN_LEDGERS: u32 = 17_280;
const METADATA_TTL: u32 = 365 * DAY_IN_LEDGERS;
const METADATA_TTL_THRESHOLD: u32 = METADATA_TTL - DAY_IN_LEDGERS;

fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(METADATA_TTL_THRESHOLD, METADATA_TTL);
}

fn extend_persistent_ttl(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, METADATA_TTL_THRESHOLD, METADATA_TTL);
}

// Storage keys
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Initialized,
    Settings,
    Properties,
    IpfsData,
    Attributes(u32), // token_id -> [u16; 16]
    Manager,
    Owner,
    CurrentHash,
    CurrentVersion,
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
    let initialized = env
        .storage()
        .instance()
        .get(&DataKey::Initialized)
        .unwrap_or(false);
    if initialized {
        extend_instance_ttl(env);
    }
    initialized
}

pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
    extend_instance_ttl(env);
}

pub fn get_settings(env: &Env) -> Result<Settings, Error> {
    let settings = env
        .storage()
        .instance()
        .get(&DataKey::Settings)
        .ok_or(Error::NotInitialized);
    if settings.is_ok() {
        extend_instance_ttl(env);
    }
    settings
}

pub fn set_settings(env: &Env, settings: &Settings) {
    env.storage().instance().set(&DataKey::Settings, settings);
    extend_instance_ttl(env);
}

pub fn get_properties(env: &Env) -> Vec<Property> {
    let properties = env.storage().persistent().get(&DataKey::Properties);
    if properties.is_some() {
        extend_persistent_ttl(env, &DataKey::Properties);
    }
    properties.unwrap_or(Vec::new(env))
}

pub fn set_properties(env: &Env, properties: &Vec<Property>) {
    env.storage()
        .persistent()
        .set(&DataKey::Properties, properties);
    extend_persistent_ttl(env, &DataKey::Properties);
}

pub fn get_ipfs_data(env: &Env) -> Vec<IpfsGroup> {
    let ipfs_data = env.storage().persistent().get(&DataKey::IpfsData);
    if ipfs_data.is_some() {
        extend_persistent_ttl(env, &DataKey::IpfsData);
    }
    ipfs_data.unwrap_or(Vec::new(env))
}

pub fn set_ipfs_data(env: &Env, ipfs_data: &Vec<IpfsGroup>) {
    env.storage()
        .persistent()
        .set(&DataKey::IpfsData, ipfs_data);
    extend_persistent_ttl(env, &DataKey::IpfsData);
}

pub fn set_attributes(env: &Env, token_id: u32, attributes: &Vec<u32>) {
    env.storage()
        .persistent()
        .set(&DataKey::Attributes(token_id), attributes);
    extend_persistent_ttl(env, &DataKey::Attributes(token_id));
}

pub fn get_attributes(env: &Env, token_id: u32) -> Vec<u32> {
    let key = DataKey::Attributes(token_id);
    let attributes = env.storage().persistent().get(&key);
    if attributes.is_some() {
        extend_persistent_ttl(env, &key);
    }
    attributes.unwrap_or(Vec::new(env))
}
