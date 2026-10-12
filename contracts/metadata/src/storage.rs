use soroban_sdk::{contracttype, Address, Bytes, BytesN, Env, String, Vec};

use crate::error::Error;

/// Storage-layout version of this code (see `common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;
// Still 1: the compact layout ships before any network runs the paged one
// (pre-mainnet, fresh redeploy), so there is nothing to migrate.

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
fn extend_persistent_ttl<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
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
    /// Instance: fingerprint of the event-only DAO profile.
    Profile,
    /// Instance: item count of each property, in property order (<= 16).
    /// Its length is the property count. The only artwork state mint reads.
    ItemCounts,
    /// Instance: number of IPFS groups in use (<= `MAX_IPFS_GROUPS`).
    IpfsGroupCount,
    /// Persistent: every property name, in property order (<= 16).
    PropertyNames,
    /// Persistent: `(property, page)` -> up to `ITEMS_PER_PAGE` items, as an
    /// [`ItemPage`].
    Items(u32, u32),
    /// Persistent: every IPFS group in absolute index order (one entry).
    IpfsGroups,
    /// Persistent: `page` -> packed attributes of tokens
    /// `[page * TOKENS_PER_ATTRIBUTE_PAGE, (page + 1) * TOKENS_PER_ATTRIBUTE_PAGE)`
    /// (see "Attributes pages" below).
    AttributesPage(u32),
    Manager,
    Treasury,
}

// Data structures

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settings {
    pub token: Address,
    /// Base URL of the image compositor; `token_uri` points `image` here.
    pub renderer_base: String,
}

/// The chain's record of the event-only profile: the SHA-256 of the latest
/// profile bytes and how many updates have been made. The profile text lives
/// only in `ProfileUpdated` events.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProfileState {
    pub hash: BytesN<32>,
    pub seq: u32,
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
        .get(&common::ns(env, DataKey::Settings))
        .ok_or(Error::NotInitialized);
    if settings.is_ok() {
        extend_instance_ttl(env);
    }
    settings
}

pub fn set_settings(env: &Env, settings: &Settings) {
    env.storage()
        .instance()
        .set(&common::ns(env, DataKey::Settings), settings);
    extend_instance_ttl(env);
}

pub fn get_profile_state(env: &Env) -> Result<ProfileState, Error> {
    env.storage()
        .instance()
        .get(&common::ns(env, DataKey::Profile))
        .ok_or(Error::NotInitialized)
}

pub fn set_profile_state(env: &Env, state: &ProfileState) {
    env.storage()
        .instance()
        .set(&common::ns(env, DataKey::Profile), state);
    extend_instance_ttl(env);
}

pub fn get_item_counts(env: &Env) -> Vec<u32> {
    env.storage()
        .instance()
        .get(&common::ns(env, DataKey::ItemCounts))
        .unwrap_or(Vec::new(env))
}

pub fn set_item_counts(env: &Env, counts: &Vec<u32>) {
    env.storage()
        .instance()
        .set(&common::ns(env, DataKey::ItemCounts), counts);
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
        .get(&common::ns(env, DataKey::IpfsGroupCount))
        .unwrap_or(0)
}

pub fn set_ipfs_group_count(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&common::ns(env, DataKey::IpfsGroupCount), &count);
    extend_instance_ttl(env);
}

/// Every property name, in property order, bounded by the item counts (one
/// entry for all of them: 16 separate keys cost ~120 bytes of key and entry
/// overhead each, more than the names).
pub fn get_property_names(env: &Env) -> Vec<String> {
    let count = get_property_count(env);
    if count == 0 {
        return Vec::new(env);
    }
    let key = common::ns(env, DataKey::PropertyNames);
    let names: Option<Vec<String>> = env.storage().persistent().get(&key);
    if names.is_some() {
        extend_persistent_ttl(env, &key);
    }
    let names = names.unwrap_or(Vec::new(env));
    names.slice(0..count.min(names.len()))
}

/// Name of an existing property (bounded by the item counts).
pub fn get_property_name(env: &Env, index: u32) -> Option<String> {
    get_property_names(env).get(index)
}

pub fn set_property_names(env: &Env, names: &Vec<String>) {
    let key = common::ns(env, DataKey::PropertyNames);
    env.storage().persistent().set(&key, names);
    extend_persistent_ttl(env, &key);
}

/// Stored form of an `Items(property, page)` entry: the item names, and one
/// byte per item holding its `reference_slot` (an IPFS group index, below
/// `MAX_IPFS_GROUPS`). A vector of `Item` structs would spend ~60 bytes per
/// item on field names; this layout is the name plus one byte.
/// Storage only: no function takes or returns it, so spec shaking keeps it
/// out of the published interface.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ItemPage(pub Vec<String>, pub Bytes);

fn read_item_page(env: &Env, property_index: u32, page: u32) -> Option<ItemPage> {
    let key = common::ns(env, DataKey::Items(property_index, page));
    let value: Option<ItemPage> = env.storage().persistent().get(&key);
    if value.is_some() {
        extend_persistent_ttl(env, &key);
    }
    value
}

/// Raw page read; callers bound it by the property's item count (a page past
/// the count may hold stale items from before a reset).
pub fn get_item_page(env: &Env, property_index: u32, page: u32) -> Vec<Item> {
    let mut items = Vec::new(env);
    let Some(ItemPage(names, slots)) = read_item_page(env, property_index, page) else {
        return items;
    };
    for (i, name) in names.iter().enumerate() {
        let reference_slot = slots.get(i as u32).unwrap_or(0) as u32;
        items.push_back(Item {
            name,
            reference_slot,
        });
    }
    items
}

/// The name of item `index` of a property, without assembling the page.
pub fn get_item_name(env: &Env, property_index: u32, index: u32) -> Option<String> {
    let ItemPage(names, _) = read_item_page(env, property_index, index / ITEMS_PER_PAGE)?;
    names.get(index % ITEMS_PER_PAGE)
}

pub fn set_item_page(env: &Env, property_index: u32, page: u32, items: &Vec<Item>) {
    let mut names = Vec::new(env);
    let mut slots = Bytes::new(env);
    for item in items.iter() {
        // add_properties assigns slots from the group count, capped at
        // MAX_IPFS_GROUPS (64), so a slot always fits one byte.
        assert!(
            item.reference_slot < MAX_IPFS_GROUPS,
            "reference slot out of range"
        );
        names.push_back(item.name);
        slots.push_back(item.reference_slot as u8);
    }
    let key = common::ns(env, DataKey::Items(property_index, page));
    env.storage()
        .persistent()
        .set(&key, &ItemPage(names, slots));
    extend_persistent_ttl(env, &key);
}

/// Every IPFS group in use, in absolute index order.
pub fn get_ipfs_data(env: &Env) -> Vec<IpfsGroup> {
    let count = get_ipfs_group_count(env);
    if count == 0 {
        return Vec::new(env);
    }
    let key = common::ns(env, DataKey::IpfsGroups);
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
    let key = common::ns(env, DataKey::IpfsGroups);
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

// Attributes pages
//
// `AttributesPage(p)` holds the selections of tokens
// `[p * TOKENS_PER_ATTRIBUTE_PAGE, (p + 1) * TOKENS_PER_ATTRIBUTE_PAGE)` as one
// byte string. Each token is a record, in token order: a header byte whose
// low 7 bits are `n` (its number of properties, 0 for a token without
// attributes), then `n` item indexes, one byte each, or two bytes big-endian
// when the header's high bit (`WIDE`) is set because some index is 256 or
// more. A vector of `u32` vectors spent ~150 bytes per token on value tags; a
// 16-property record is 17 bytes (33 when wide). Records are scanned (at most
// 64 per page) in a stack buffer, so a lookup is one storage read.

/// Most properties a collection holds.
pub const MAX_PROPERTIES: u32 = 16;
const MAX_RECORD_BYTES: usize = 1 + 2 * MAX_PROPERTIES as usize;
/// Header bit: the record's indexes are two bytes each.
const WIDE: u8 = 0x80;
const MAX_ATTRIBUTE_PAGE_BYTES: usize = TOKENS_PER_ATTRIBUTE_PAGE as usize * MAX_RECORD_BYTES;

/// One token's selections in stored form.
#[derive(Clone, Copy)]
struct Record {
    len: u8,
    items: [u16; MAX_PROPERTIES as usize],
}

const EMPTY_RECORD: Record = Record {
    len: 0,
    items: [0; MAX_PROPERTIES as usize],
};

/// A decoded page: `count` records, the rest empty.
struct AttributesPage {
    count: usize,
    records: [Record; TOKENS_PER_ATTRIBUTE_PAGE as usize],
}

fn attributes_key(env: &Env, page: u32) -> (soroban_sdk::Symbol, DataKey) {
    common::ns(env, DataKey::AttributesPage(page))
}

fn decode_page(bytes: &Bytes) -> AttributesPage {
    let len = bytes.len() as usize;
    assert!(len <= MAX_ATTRIBUTE_PAGE_BYTES, "attributes page too large");
    let mut buf = [0u8; MAX_ATTRIBUTE_PAGE_BYTES];
    bytes.copy_into_slice(&mut buf[..len]);
    let mut page = AttributesPage {
        count: 0,
        records: [EMPTY_RECORD; TOKENS_PER_ATTRIBUTE_PAGE as usize],
    };
    let mut at = 0;
    while at < len {
        let wide = buf[at] & WIDE != 0;
        let n = (buf[at] & !WIDE) as usize;
        let width = if wide { 2 } else { 1 };
        assert!(
            n <= MAX_PROPERTIES as usize && at + 1 + width * n <= len,
            "corrupt attributes page"
        );
        assert!(
            page.count < TOKENS_PER_ATTRIBUTE_PAGE as usize,
            "corrupt attributes page"
        );
        let record = &mut page.records[page.count];
        record.len = n as u8;
        for k in 0..n {
            record.items[k] = if wide {
                ((buf[at + 1 + 2 * k] as u16) << 8) | buf[at + 2 + 2 * k] as u16
            } else {
                buf[at + 1 + k] as u16
            };
        }
        page.count += 1;
        at += 1 + width * n;
    }
    page
}

fn encode_page(env: &Env, page: &AttributesPage) -> Bytes {
    let mut buf = [0u8; MAX_ATTRIBUTE_PAGE_BYTES];
    let mut at = 0;
    for record in page.records.iter().take(page.count) {
        let n = record.len as usize;
        let wide = record.items[..n]
            .iter()
            .any(|&index| index > u8::MAX as u16);
        buf[at] = if wide { record.len | WIDE } else { record.len };
        for k in 0..n {
            if wide {
                buf[at + 1 + 2 * k] = (record.items[k] >> 8) as u8;
                buf[at + 2 + 2 * k] = record.items[k] as u8;
            } else {
                buf[at + 1 + k] = record.items[k] as u8;
            }
        }
        at += 1 + if wide { 2 * n } else { n };
    }
    Bytes::from_slice(env, &buf[..at])
}

/// `[n, index_0, .., index_{n-1}]` (the public `get_attributes` form) to a record.
fn to_record(selections: &Vec<u32>) -> Record {
    let mut record = EMPTY_RECORD;
    let Some(n) = selections.get(0) else {
        return record;
    };
    assert!(
        n <= MAX_PROPERTIES && selections.len() == n + 1,
        "malformed selections"
    );
    record.len = n as u8;
    for k in 0..n {
        let index = selections.get(k + 1).unwrap();
        // MAX_ITEMS_PER_PROPERTY (1,024) keeps every index within u16.
        assert!(index < MAX_ITEMS_PER_PROPERTY, "item index out of range");
        record.items[k as usize] = index as u16;
    }
    record
}

fn from_record(env: &Env, record: &Record) -> Vec<u32> {
    let mut out = Vec::new(env);
    if record.len == 0 {
        return out;
    }
    out.push_back(record.len as u32);
    for k in 0..record.len as usize {
        out.push_back(record.items[k] as u32);
    }
    out
}

/// Write the attributes of the contiguous tokens
/// `[first_token_id, first_token_id + attributes.len())`, rewriting each
/// touched page once. Each element is `[n, index..]`; an empty vector stores
/// a token without attributes.
pub fn set_attributes_range(env: &Env, first_token_id: u32, attributes: &Vec<Vec<u32>>) {
    let n = attributes.len();
    let mut i = 0;
    while i < n {
        let page_index = (first_token_id + i) / TOKENS_PER_ATTRIBUTE_PAGE;
        let key = attributes_key(env, page_index);
        let stored: Option<Bytes> = env.storage().persistent().get(&key);
        let mut page = match stored {
            Some(bytes) => decode_page(&bytes),
            None => AttributesPage {
                count: 0,
                records: [EMPTY_RECORD; TOKENS_PER_ATTRIBUTE_PAGE as usize],
            },
        };
        while i < n && (first_token_id + i) / TOKENS_PER_ATTRIBUTE_PAGE == page_index {
            let slot = ((first_token_id + i) % TOKENS_PER_ATTRIBUTE_PAGE) as usize;
            // Slots before this one that were never written hold empty records.
            page.count = page.count.max(slot + 1);
            page.records[slot] = to_record(&attributes.get(i).unwrap());
            i += 1;
        }
        env.storage()
            .persistent()
            .set(&key, &encode_page(env, &page));
        extend_persistent_ttl(env, &key);
    }
}

pub fn set_attributes(env: &Env, token_id: u32, attributes: &Vec<u32>) {
    let mut one = Vec::new(env);
    one.push_back(attributes.clone());
    set_attributes_range(env, token_id, &one);
}

/// A token's attributes as `[n, index..]`, or an empty vector when it has none.
pub fn get_attributes(env: &Env, token_id: u32) -> Vec<u32> {
    let key = attributes_key(env, token_id / TOKENS_PER_ATTRIBUTE_PAGE);
    let Some(bytes) = env.storage().persistent().get::<_, Bytes>(&key) else {
        return Vec::new(env);
    };
    extend_persistent_ttl(env, &key);
    let page = decode_page(&bytes);
    let slot = (token_id % TOKENS_PER_ATTRIBUTE_PAGE) as usize;
    if slot >= page.count {
        return Vec::new(env);
    }
    from_record(env, &page.records[slot])
}

/// Every `DataKey` variant with sample arguments, for the key guard test.
/// `index` fails to compile when a variant is added: give it the next index,
/// raise `VARIANTS` and add a sample to `all`, or the guard test fails.
#[cfg(test)]
pub(crate) mod key_samples {
    extern crate std;
    use super::*;
    #[allow(unused_imports)]
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, IntoVal, Val};

    pub const VARIANTS: usize = 10;

    pub fn index(key: &DataKey) -> usize {
        match key {
            DataKey::Settings => 0,
            DataKey::Profile => 1,
            DataKey::ItemCounts => 2,
            DataKey::IpfsGroupCount => 3,
            DataKey::PropertyNames => 4,
            DataKey::Items(..) => 5,
            DataKey::IpfsGroups => 6,
            DataKey::AttributesPage(_) => 7,
            DataKey::Manager => 8,
            DataKey::Treasury => 9,
        }
    }

    #[allow(unused_variables)]
    pub fn all(e: &Env) -> std::vec::Vec<Val> {
        let a = soroban_sdk::Address::generate(e);
        let id = soroban_sdk::BytesN::<32>::from_array(e, &[0; 32]);
        let text = soroban_sdk::String::from_str(e, "x");
        let keys = std::vec![
            DataKey::Settings,
            DataKey::Profile,
            DataKey::ItemCounts,
            DataKey::IpfsGroupCount,
            DataKey::PropertyNames,
            DataKey::Items(0, 0),
            DataKey::IpfsGroups,
            DataKey::AttributesPage(0),
            DataKey::Manager,
            DataKey::Treasury,
        ];
        common::testutils::assert_every_variant_sampled(
            "DataKey",
            &keys.iter().map(index).collect::<std::vec::Vec<_>>(),
            VARIANTS,
        );
        keys.into_iter().map(|k| k.into_val(e)).collect()
    }
}
