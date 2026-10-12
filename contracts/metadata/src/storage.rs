use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::error::Error;

/// Storage-layout version of this code (see `common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;

/// Items stored per `Items(property, page)` entry. A call that touches every
/// property rewrites at most one full page each: measured worst case 89,496
/// bytes written (16 full pages of 64-byte names plus a maximum group), under
/// the 132,096-byte per-transaction write limit. 64-item pages measured
/// 155,032 bytes and did not fit.
pub const ITEMS_PER_PAGE: u32 = 32;
/// Pages per property, so at most `ITEMS_PER_PAGE * MAX_ITEM_PAGES` items.
pub const MAX_ITEM_PAGES: u32 = 32;
/// Most items one property can hold.
pub const MAX_ITEMS_PER_PROPERTY: u32 = ITEMS_PER_PAGE * MAX_ITEM_PAGES;
/// Most IPFS groups (distinct base URI and extension pairs) a collection uses.
pub const MAX_IPFS_GROUPS: u32 = 64;
/// Tokens stored per `AttributesPage(page)` entry.
pub const TOKENS_PER_ATTRIBUTE_PAGE: u32 = 64;

fn extend_instance_ttl(env: &Env) {
    common::ttl::extend_instance(env);
}

/// Artwork entries use the shared long-lived persistent policy.
fn extend_persistent_ttl(env: &Env, key: &DataKey) {
    common::ttl::extend_persistent(env, key);
}

// Storage keys
//
// The artwork is laid out so a whole collection is a handful of entries
// (renewable in one transaction) and minting reads only `ItemCounts`.
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Settings,
    /// Instance: item count of each property, in property order (<= 16).
    /// Its length is the property count. The only artwork state mint reads.
    ItemCounts,
    /// Instance: number of IPFS groups in use (<= `MAX_IPFS_GROUPS`).
    IpfsGroupCount,
    /// Persistent: property name by index (<= 16 entries).
    PropertyName(u32),
    /// Persistent: `(property, page)` -> up to `ITEMS_PER_PAGE` items.
    Items(u32, u32),
    /// Persistent: every IPFS group in absolute index order (one entry).
    IpfsGroups,
    /// Persistent: `page` -> attributes of tokens
    /// `[page * TOKENS_PER_ATTRIBUTE_PAGE, (page + 1) * TOKENS_PER_ATTRIBUTE_PAGE)`;
    /// an empty vector marks a token without attributes.
    AttributesPage(u32),
    Manager,
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

/// A property's name and item count, without its items.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PropertyHeader {
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

pub fn get_item_counts(env: &Env) -> Vec<u32> {
    env.storage()
        .instance()
        .get(&DataKey::ItemCounts)
        .unwrap_or(Vec::new(env))
}

pub fn set_item_counts(env: &Env, counts: &Vec<u32>) {
    env.storage().instance().set(&DataKey::ItemCounts, counts);
    extend_instance_ttl(env);
}

pub fn get_property_count(env: &Env) -> u32 {
    get_item_counts(env).len()
}

/// Item count of `index`, or `None` when the property does not exist.
pub fn get_item_count(env: &Env, index: u32) -> Option<u32> {
    get_item_counts(env).get(index)
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

/// Name of an existing property (bounded by the item counts).
pub fn get_property_name(env: &Env, index: u32) -> Option<String> {
    if index >= get_property_count(env) {
        return None;
    }
    let key = DataKey::PropertyName(index);
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        extend_persistent_ttl(env, &key);
    }
    value
}

pub fn set_property_name(env: &Env, index: u32, name: &String) {
    let key = DataKey::PropertyName(index);
    env.storage().persistent().set(&key, name);
    extend_persistent_ttl(env, &key);
}

pub fn remove_property_name(env: &Env, index: u32) {
    env.storage()
        .persistent()
        .remove(&DataKey::PropertyName(index));
}

/// Raw page read; callers bound it by the property's item count (a page past
/// the count may hold stale items from before a reset).
pub fn get_item_page(env: &Env, property_index: u32, page: u32) -> Vec<Item> {
    let key = DataKey::Items(property_index, page);
    let value: Option<Vec<Item>> = env.storage().persistent().get(&key);
    if value.is_some() {
        extend_persistent_ttl(env, &key);
    }
    value.unwrap_or(Vec::new(env))
}

pub fn set_item_page(env: &Env, property_index: u32, page: u32, items: &Vec<Item>) {
    let key = DataKey::Items(property_index, page);
    env.storage().persistent().set(&key, items);
    extend_persistent_ttl(env, &key);
}

/// Every IPFS group in use, in absolute index order.
pub fn get_ipfs_data(env: &Env) -> Vec<IpfsGroup> {
    let count = get_ipfs_group_count(env);
    if count == 0 {
        return Vec::new(env);
    }
    let key = DataKey::IpfsGroups;
    let groups: Vec<IpfsGroup> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(Vec::new(env));
    extend_persistent_ttl(env, &key);
    // Entries past the count are stale (left by a reset).
    groups.slice(0..count.min(groups.len()))
}

pub fn get_ipfs_group(env: &Env, index: u32) -> Option<IpfsGroup> {
    get_ipfs_data(env).get(index)
}

pub fn set_ipfs_data(env: &Env, groups: &Vec<IpfsGroup>) {
    let key = DataKey::IpfsGroups;
    env.storage().persistent().set(&key, groups);
    extend_persistent_ttl(env, &key);
    set_ipfs_group_count(env, groups.len());
}

/// Assemble a full `Property` (name + every item). Read-path only; the mint
/// path never calls this.
pub fn assemble_property(env: &Env, index: u32) -> Option<Property> {
    let count = get_item_count(env, index)?;
    let name = get_property_name(env, index)?;
    let mut items = Vec::new(env);
    let pages = count.div_ceil(ITEMS_PER_PAGE);
    for page in 0..pages {
        let stored = get_item_page(env, index, page);
        let take = (count - page * ITEMS_PER_PAGE).min(ITEMS_PER_PAGE);
        items.append(&stored.slice(0..take.min(stored.len())));
    }
    Some(Property { name, items })
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

/// Write the attributes of the contiguous tokens
/// `[first_token_id, first_token_id + attributes.len())`, rewriting each
/// touched page once.
pub fn set_attributes_range(env: &Env, first_token_id: u32, attributes: &Vec<Vec<u32>>) {
    let n = attributes.len();
    let mut i = 0;
    while i < n {
        let page_index = (first_token_id + i) / TOKENS_PER_ATTRIBUTE_PAGE;
        let key = DataKey::AttributesPage(page_index);
        let mut page: Vec<Vec<u32>> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(env));
        while i < n && (first_token_id + i) / TOKENS_PER_ATTRIBUTE_PAGE == page_index {
            let slot = (first_token_id + i) % TOKENS_PER_ATTRIBUTE_PAGE;
            while page.len() < slot {
                page.push_back(Vec::new(env));
            }
            let value = attributes.get(i).unwrap();
            if page.len() == slot {
                page.push_back(value);
            } else {
                page.set(slot, value);
            }
            i += 1;
        }
        env.storage().persistent().set(&key, &page);
        extend_persistent_ttl(env, &key);
    }
}

pub fn set_attributes(env: &Env, token_id: u32, attributes: &Vec<u32>) {
    let mut one = Vec::new(env);
    one.push_back(attributes.clone());
    set_attributes_range(env, token_id, &one);
}

/// A token's attributes, or an empty vector when it has none.
pub fn get_attributes(env: &Env, token_id: u32) -> Vec<u32> {
    let key = DataKey::AttributesPage(token_id / TOKENS_PER_ATTRIBUTE_PAGE);
    let page: Option<Vec<Vec<u32>>> = env.storage().persistent().get(&key);
    if page.is_some() {
        extend_persistent_ttl(env, &key);
    }
    page.and_then(|p| p.get(token_id % TOKENS_PER_ATTRIBUTE_PAGE))
        .unwrap_or(Vec::new(env))
}
