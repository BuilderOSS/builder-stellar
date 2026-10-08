use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::error::Error;

const DAY_IN_LEDGERS: u32 = 17_280;
/// Nominal 1 year; the network caps entries at ~180 days (max_entry_ttl) and
/// the host clamps the request, so the effective lifetime is ~180 days and
/// renews on touch.
const METADATA_TTL: u32 = 365 * DAY_IN_LEDGERS;
const METADATA_TTL_THRESHOLD: u32 = METADATA_TTL - DAY_IN_LEDGERS;

fn extend_instance_ttl(env: &Env) {
    common::ttl::extend_instance(env);
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
    Settings,
    /// u32 number of properties (instance storage, <= 16).
    PropertyCount,
    /// u32 number of IPFS groups (instance storage).
    IpfsGroupCount,
    /// property_index -> StoredProperty (persistent, one entry per property).
    Property(u32),
    /// (property_index, item_index) -> Item (persistent, one entry per item).
    Item(u32, u32),
    /// group_index -> IpfsGroup (persistent, append-only, absolute index).
    IpfsGroup(u32),
    Attributes(u32), // token_id -> [u16; 16]
    Manager,
    Owner,
    Treasury,
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

/// Per-key stored property header; items live under `DataKey::Item`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredProperty {
    pub name: String,
    pub item_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ItemParam {
    pub property_id: u32,
    pub name: String,
    pub is_new_property: bool,
}

// Storage helpers

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

pub fn get_property_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::PropertyCount)
        .unwrap_or(0)
}

pub fn set_property_count(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&DataKey::PropertyCount, &count);
    extend_instance_ttl(env);
}

pub fn get_ipfs_group_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::IpfsGroupCount)
        .unwrap_or(0)
}

pub fn set_ipfs_group_count(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&DataKey::IpfsGroupCount, &count);
    extend_instance_ttl(env);
}

pub fn get_stored_property(env: &Env, index: u32) -> Option<StoredProperty> {
    if index >= get_property_count(env) {
        return None;
    }
    let key = DataKey::Property(index);
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        extend_persistent_ttl(env, &key);
    }
    value
}

pub fn set_stored_property(env: &Env, index: u32, property: &StoredProperty) {
    let key = DataKey::Property(index);
    env.storage().persistent().set(&key, property);
    extend_persistent_ttl(env, &key);
}

/// Unbounded read; callers must already have checked the bounds.
pub fn get_item_raw(env: &Env, property_index: u32, item_index: u32) -> Option<Item> {
    let key = DataKey::Item(property_index, item_index);
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        extend_persistent_ttl(env, &key);
    }
    value
}

pub fn set_item(env: &Env, property_index: u32, item_index: u32, item: &Item) {
    let key = DataKey::Item(property_index, item_index);
    env.storage().persistent().set(&key, item);
    extend_persistent_ttl(env, &key);
}

pub fn get_ipfs_group(env: &Env, index: u32) -> Option<IpfsGroup> {
    if index >= get_ipfs_group_count(env) {
        return None;
    }
    let key = DataKey::IpfsGroup(index);
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        extend_persistent_ttl(env, &key);
    }
    value
}

pub fn set_ipfs_group(env: &Env, index: u32, group: &IpfsGroup) {
    let key = DataKey::IpfsGroup(index);
    env.storage().persistent().set(&key, group);
    extend_persistent_ttl(env, &key);
}

pub fn remove_stored_property(env: &Env, index: u32) {
    env.storage().persistent().remove(&DataKey::Property(index));
}

/// Extend TTL of an existing persistent entry (no-op if absent).
pub fn bump_key(env: &Env, key: &DataKey) {
    if env.storage().persistent().has(key) {
        extend_persistent_ttl(env, key);
    }
}

pub fn bump_instance(env: &Env) {
    extend_instance_ttl(env);
}

/// Assemble a full `Property` (header + every item). Read-path only; the
/// mint path never calls this.
pub fn assemble_property(env: &Env, index: u32) -> Option<Property> {
    let stored = get_stored_property(env, index)?;
    let mut items = Vec::new(env);
    for j in 0..stored.item_count {
        if let Some(item) = get_item_raw(env, index, j) {
            items.push_back(item);
        }
    }
    Some(Property {
        name: stored.name,
        items,
    })
}

/// Assemble every property. Read-path only.
pub fn get_properties(env: &Env) -> Vec<Property> {
    let mut out = Vec::new(env);
    for i in 0..get_property_count(env) {
        if let Some(p) = assemble_property(env, i) {
            out.push_back(p);
        }
    }
    out
}

/// Assemble every IPFS group in absolute index order. Read-path only.
pub fn get_ipfs_data(env: &Env) -> Vec<IpfsGroup> {
    let mut out = Vec::new(env);
    for i in 0..get_ipfs_group_count(env) {
        if let Some(g) = get_ipfs_group(env, i) {
            out.push_back(g);
        }
    }
    out
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
