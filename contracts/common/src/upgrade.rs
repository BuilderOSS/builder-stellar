//! Manager-approved upgrade flow and the standard `CurrentHash` /
//! `CurrentVersion` instance keys.
//!
//! Authorization (who may call `upgrade`) stays in each module; this crate
//! only performs the checks that follow it.
//!
//! Storage: two instance entries (`CurrentHash`: 32 bytes, `CurrentVersion`:
//! string). Cross-contract calls: `manager.is_upgrade_approved` and
//! `manager.get_implementation_version`, both read-only.

use soroban_sdk::{contracttype, panic_with_error, Address, BytesN, Env, String};

use crate::{clients::ManagerRegistryClient, error::CommonError, ttl};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum UpgradeKey {
    CurrentHash,
    CurrentVersion,
}

/// Record hash and version at construction time.
pub fn init(e: &Env, current_hash: &BytesN<32>, version: &String) {
    e.storage()
        .instance()
        .set(&UpgradeKey::CurrentHash, current_hash);
    e.storage()
        .instance()
        .set(&UpgradeKey::CurrentVersion, version);
}

pub fn current_hash(e: &Env) -> BytesN<32> {
    e.storage()
        .instance()
        .get(&UpgradeKey::CurrentHash)
        .unwrap_or_else(|| panic_with_error!(e, CommonError::CurrentHashNotSet))
}

pub fn version(e: &Env) -> String {
    e.storage()
        .instance()
        .get(&UpgradeKey::CurrentVersion)
        .unwrap_or_else(|| panic_with_error!(e, CommonError::VersionNotSet))
}

fn is_approved(e: &Env, manager: &Address, from: &BytesN<32>, to: &BytesN<32>) -> bool {
    ManagerRegistryClient::new(e, manager).is_upgrade_approved(from, to)
}

fn implementation_version(e: &Env, manager: &Address, hash: &BytesN<32>) -> String {
    let version = ManagerRegistryClient::new(e, manager).get_implementation_version(hash);
    version.unwrap_or_else(|| panic_with_error!(e, CommonError::ImplementationNotFound))
}

/// Re-read this contract's version from the Manager registry (by
/// `CurrentHash`) and store it. Authorization is the caller's responsibility.
pub fn sync_version(e: &Env, manager: &Address) -> String {
    ttl::extend_instance(e);
    let v = implementation_version(e, manager, &current_hash(e));
    e.storage().instance().set(&UpgradeKey::CurrentVersion, &v);
    v
}

/// Perform an upgrade. The caller must already have authorized the upgrade.
///
/// 1. `from` must equal the stored `CurrentHash`.
/// 2. `manager.is_upgrade_approved(from, to)` must be true.
/// 3. Version of `to` is read from the registry.
/// 4. `CurrentHash` / `CurrentVersion` are updated and the WASM is swapped.
pub fn apply(e: &Env, manager: &Address, from: &BytesN<32>, to: &BytesN<32>) {
    ttl::extend_instance(e);
    if *from != current_hash(e) {
        panic_with_error!(e, CommonError::HashMismatch);
    }
    if !is_approved(e, manager, from, to) {
        panic_with_error!(e, CommonError::UpgradeNotApproved);
    }
    let v = implementation_version(e, manager, to);
    e.storage().instance().set(&UpgradeKey::CurrentHash, to);
    e.storage().instance().set(&UpgradeKey::CurrentVersion, &v);
    e.deployer().update_current_contract_wasm(to.clone());
}
