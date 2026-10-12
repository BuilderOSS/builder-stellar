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
    ApprovedAt(BytesN<32>, BytesN<32>),
    Version(BytesN<32>),
    Admin,
}

#[contract]
pub struct MockManager;

#[contractimpl]
impl MockManager {
    pub fn approve(e: Env, from: BytesN<32>, to: BytesN<32>) {
        e.storage()
            .instance()
            .set(&MockKey::Approved(from.clone(), to.clone()), &true);
        e.storage().instance().set(
            &MockKey::ApprovedAt(from, to),
            &(e.ledger().sequence() as u64),
        );
    }
    pub fn upgrade_approved_ledger(e: Env, from: BytesN<32>, to: BytesN<32>) -> Option<u64> {
        e.storage().instance().get(&MockKey::ApprovedAt(from, to))
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
    pub fn set_admin(e: Env, admin: Address) {
        e.storage().instance().set(&MockKey::Admin, &admin);
    }
    pub fn get_admin(e: Env) -> Option<Address> {
        e.storage().instance().get(&MockKey::Admin)
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

/// Panic unless `indexes` (one per sample key, from the enum's exhaustive
/// `index` match) covers every variant `0..variants`. Pair it with a match that
/// fails to compile when a variant is added, so a new variant cannot reach the
/// key guard tests unsampled.
pub fn assert_every_variant_sampled(name: &str, indexes: &[usize], variants: usize) {
    let covered: std::collections::BTreeSet<usize> = indexes.iter().copied().collect();
    let all: std::collections::BTreeSet<usize> = (0..variants).collect();
    assert_eq!(
        covered, all,
        "{name}: sample every variant (indexes from its exhaustive match)"
    );
}

/// The shapes of a list of sample keys.
pub fn key_shapes(
    e: &Env,
    keys: std::vec::Vec<soroban_sdk::Val>,
) -> std::vec::Vec<(std::string::String, u32)> {
    keys.into_iter().map(|k| key_shape(e, k)).collect()
}

/// Every `common` key (admin, upgrade, lifecycle), each enum checked
/// exhaustively.
pub fn common_keys(e: &Env) -> std::vec::Vec<soroban_sdk::Val> {
    use crate::admin::AdminKey;
    use crate::lifecycle::LifecycleKey;
    use crate::upgrade::UpgradeKey;
    use soroban_sdk::IntoVal;
    let admin = [AdminKey::Admin];
    assert_every_variant_sampled(
        "AdminKey",
        &admin
            .iter()
            .map(|k| match k {
                AdminKey::Admin => 0,
            })
            .collect::<std::vec::Vec<_>>(),
        1,
    );
    let upgrade = [
        UpgradeKey::CurrentHash,
        UpgradeKey::StorageVersion,
        UpgradeKey::UpgradeDelay,
        UpgradeKey::PendingUpgradeDelay,
    ];
    assert_every_variant_sampled(
        "UpgradeKey",
        &upgrade
            .iter()
            .map(|k| match k {
                UpgradeKey::CurrentHash => 0,
                UpgradeKey::StorageVersion => 1,
                UpgradeKey::UpgradeDelay => 2,
                UpgradeKey::PendingUpgradeDelay => 3,
            })
            .collect::<std::vec::Vec<_>>(),
        4,
    );
    let lifecycle = [LifecycleKey::Live];
    assert_every_variant_sampled(
        "LifecycleKey",
        &lifecycle
            .iter()
            .map(|k| match k {
                LifecycleKey::Live => 0,
            })
            .collect::<std::vec::Vec<_>>(),
        1,
    );
    let mut keys: std::vec::Vec<soroban_sdk::Val> =
        admin.into_iter().map(|k| k.into_val(e)).collect();
    keys.extend(
        upgrade
            .into_iter()
            .map(|k| -> soroban_sdk::Val { k.into_val(e) }),
    );
    keys.extend(
        lifecycle
            .into_iter()
            .map(|k| -> soroban_sdk::Val { k.into_val(e) }),
    );
    keys
}

/// Shapes of the `common` keys a module uses (admin, upgrade, lifecycle).
pub fn common_key_shapes(e: &Env) -> std::vec::Vec<(std::string::String, u32)> {
    key_shapes(e, common_keys(e))
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

/// Every OpenZeppelin key shape a Builder module may write outside the
/// `builder` namespace, at stellar-contracts rev fbfde38: the
/// non-fungible token and its sequential counter, votes, governor and
/// pausable. Update on an OZ upgrade.
pub const OZ_KEY_SHAPES: &[(&str, u32)] = &[
    // NFTStorageKey
    ("Owner", 2),
    ("Balance", 2),
    ("Approval", 2),
    ("ApprovalForAll", 3),
    ("Metadata", 1),
    // NFTSequentialStorageKey
    ("TokenIdCounter", 1),
    // VotesStorageKey
    ("Delegatee", 2),
    ("NumCheckpoints", 2),
    ("DelegateCheckpoint", 3),
    ("NumTotalSupplyCheckpoints", 1),
    ("TotalSupplyCheckpoint", 2),
    ("VotingUnits", 2),
    // GovernorStorageKey (`Name` and `Version` are never written: the
    // governor overrides `name()` and `version()`, D6)
    ("VotingDelay", 1),
    ("VotingPeriod", 1),
    ("ProposalThreshold", 1),
    ("Proposal", 2),
    ("NumQuorumCheckpoints", 1),
    ("QuorumCheckpoint", 2),
    ("ProposalVote", 2),
    ("HasVoted", 3),
    ("TokenContract", 1),
    // PausableStorageKey
    ("Paused", 1),
];

/// Walk every ledger entry `contracts` own (instance storage and persistent
/// and temporary entries) and panic unless each key is either
/// `(Symbol("builder"), <enum variant>)` or a known OpenZeppelin shape
/// ([`OZ_KEY_SHAPES`]). Also panics if a contract has no namespaced key at
/// all, so a contract the walk silently misses cannot pass.
///
/// Returns the number of keys checked.
pub fn assert_storage_namespaced(e: &Env, contracts: &[(&str, soroban_sdk::Address)]) -> u32 {
    use soroban_sdk::xdr::{LedgerEntryData, LedgerKey, ScAddress, ScVal};

    fn variant(v: &ScVal) -> Option<(std::string::String, u32)> {
        match v {
            ScVal::Vec(Some(items)) => match items.first() {
                Some(ScVal::Symbol(sym)) => {
                    Some((sym.to_utf8_string().unwrap(), items.len() as u32))
                }
                _ => None,
            },
            _ => None,
        }
    }
    // Some(true) = namespaced, Some(false) = known OZ shape, None = stray.
    fn classify(key: &ScVal) -> Option<bool> {
        if let ScVal::Vec(Some(items)) = key {
            if items.len() == 2 {
                if let (ScVal::Symbol(sym), inner) = (&items[0], &items[1]) {
                    if sym.to_utf8_string().unwrap() == crate::STORAGE_NAMESPACE {
                        return variant(inner).map(|_| true);
                    }
                }
            }
        }
        let (name, len) = variant(key)?;
        OZ_KEY_SHAPES
            .iter()
            .any(|(n, l)| *n == name && *l == len)
            .then_some(false)
    }

    let owners: std::vec::Vec<(&str, ScAddress)> = contracts
        .iter()
        .map(|(name, addr)| (*name, ScAddress::from(addr)))
        .collect();
    let mut keys: std::vec::Vec<(&str, ScVal)> = std::vec::Vec::new();
    let snapshot = e.to_ledger_snapshot();
    for (key, (entry, _)) in snapshot.ledger_entries.iter() {
        let LedgerKey::ContractData(data_key) = key.as_ref() else {
            continue;
        };
        let Some((owner, _)) = owners.iter().find(|(_, a)| *a == data_key.contract) else {
            continue;
        };
        // Authorization nonces are written by the host, not by contract code.
        if matches!(data_key.key, ScVal::LedgerKeyNonce(_)) {
            continue;
        }
        if data_key.key != ScVal::LedgerKeyContractInstance {
            keys.push((owner, data_key.key.clone()));
            continue;
        }
        if let LedgerEntryData::ContractData(d) = &entry.data {
            if let ScVal::ContractInstance(instance) = &d.val {
                for item in instance.storage.iter().flat_map(|m| m.iter()) {
                    keys.push((owner, item.key.clone()));
                }
            }
        }
    }

    let mut namespaced = std::collections::BTreeMap::<&str, u32>::new();
    let mut strays = std::vec::Vec::new();
    for (owner, key) in &keys {
        match classify(key) {
            Some(true) => *namespaced.entry(owner).or_default() += 1,
            Some(false) => {}
            None => strays.push(std::format!("{owner}: {key:?}")),
        }
    }
    assert!(strays.is_empty(), "keys outside the namespace: {strays:#?}");
    for (name, _) in contracts {
        assert!(
            namespaced.get(name).copied().unwrap_or(0) > 0,
            "{name} has no namespaced storage key; is it in the ledger?"
        );
    }
    keys.len() as u32
}
