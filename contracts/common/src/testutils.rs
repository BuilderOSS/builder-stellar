//! Test helpers for modules exercising `upgrade::apply` (feature `testutils`).

extern crate std;

use soroban_sdk::{
    contract, contractimpl, contracttype, testutils::storage::Instance as _, testutils::Ledger,
    Address, Bytes, BytesN, Env, String,
};

/// Remaining instance TTL (in ledgers) of `contract`.
pub fn instance_ttl(e: &Env, contract: &Address) -> u32 {
    e.as_contract(contract, || e.storage().instance().get_ttl())
}

/// Advance the ledger sequence by `n` ledgers (entries age, nothing expires
/// as long as `n` stays below the remaining TTL).
pub fn advance_ledgers(e: &Env, n: u32) {
    e.ledger().with_mut(|l| l.sequence_number += n);
}

/// Minimal valid Soroban wasm (env-meta section only). Uploading it yields a
/// hash that `update_current_contract_wasm` accepts.
pub fn empty_wasm(e: &Env) -> BytesN<32> {
    e.deployer().upload_contract_wasm(Bytes::from_slice(
        e,
        include_bytes!("../testdata/empty.wasm"),
    ))
}

#[contracttype]
pub enum MockKey {
    Approved(BytesN<32>, BytesN<32>),
    Version(BytesN<32>),
}

#[contract]
pub struct MockManager;

#[contractimpl]
impl MockManager {
    pub fn approve(e: Env, from: BytesN<32>, to: BytesN<32>) {
        e.storage()
            .instance()
            .set(&MockKey::Approved(from, to), &true);
    }
    pub fn register(e: Env, hash: BytesN<32>, version: String) {
        e.storage()
            .instance()
            .set(&MockKey::Version(hash), &version);
    }
    pub fn is_upgrade_approved(e: Env, from: BytesN<32>, to: BytesN<32>) -> bool {
        e.storage()
            .instance()
            .get(&MockKey::Approved(from, to))
            .unwrap_or(false)
    }
    pub fn get_implementation_version(e: Env, hash: BytesN<32>) -> Option<String> {
        e.storage().instance().get(&MockKey::Version(hash))
    }
}

/// `(variant symbol, encoded length)` of a `#[contracttype]` storage key. Two
/// keys with the same shape address the same storage slot, whatever their
/// enum's type name (docs/STORAGE_DIET_REVIEW.md Finding 1).
pub fn key_shape(e: &Env, key: soroban_sdk::Val) -> (std::string::String, u32) {
    use soroban_sdk::xdr::ScVal;
    use soroban_sdk::TryFromVal;
    match ScVal::try_from_val(e, &key).expect("storage key converts to ScVal") {
        ScVal::Vec(Some(items)) => match items.first() {
            Some(ScVal::Symbol(sym)) => (sym.to_utf8_string().unwrap(), items.len() as u32),
            other => panic!("storage key does not start with a symbol: {other:?}"),
        },
        other => panic!("storage key is not an enum variant: {other:?}"),
    }
}

/// Shapes of the `common` keys a module uses (admin, upgrade, lifecycle).
pub fn common_key_shapes(e: &Env) -> std::vec::Vec<(std::string::String, u32)> {
    use soroban_sdk::IntoVal;
    [
        crate::admin::AdminKey::Admin.into_val(e),
        crate::upgrade::UpgradeKey::CurrentHash.into_val(e),
        crate::upgrade::UpgradeKey::CurrentVersion.into_val(e),
        crate::upgrade::UpgradeKey::StorageVersion.into_val(e),
        crate::lifecycle::LifecycleKey::Live.into_val(e),
    ]
    .into_iter()
    .map(|k| key_shape(e, k))
    .collect()
}

/// OpenZeppelin key shapes the crate cannot construct (their enums are not
/// exported) at stellar-contracts rev fbfde38. Update on an OZ upgrade.
pub const OZ_SEQUENTIAL_SHAPES: &[(&str, u32)] = &[("TokenIdCounter", 1)];
pub const OZ_PAUSABLE_SHAPES: &[(&str, u32)] = &[("Paused", 1)];

/// Panic if two different key groups (enums) linked into one contract share a
/// shape.
pub fn assert_keys_disjoint(groups: &[(&str, std::vec::Vec<(std::string::String, u32)>)]) {
    let mut collisions = std::vec::Vec::new();
    for (i, (a, shapes_a)) in groups.iter().enumerate() {
        for (b, shapes_b) in groups.iter().skip(i + 1) {
            for shape in shapes_a {
                if shapes_b.contains(shape) {
                    collisions.push(std::format!("{a} and {b} both use {shape:?}"));
                }
            }
        }
    }
    assert!(
        collisions.is_empty(),
        "storage key collisions: {collisions:?}"
    );
}

/// Shapes from literal `(name, len)` pairs.
pub fn shapes(list: &[(&str, u32)]) -> std::vec::Vec<(std::string::String, u32)> {
    list.iter()
        .map(|(n, l)| (std::string::String::from(*n), *l))
        .collect()
}
