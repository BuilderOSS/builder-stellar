//! Manager-approved upgrade flow, the standard `CurrentHash` instance key, the
//! registry-derived `version()`, and the storage-layout migration convention.
//!
//! Authorization (who may call `upgrade` / `migrate`) stays in each module;
//! this crate only performs the checks that follow it.
//!
//! # Migrations
//!
//! Every module declares a `STORAGE_VERSION` constant (the layout its code
//! expects) and records it at construction. A WASM upgrade swaps code but not
//! data, so a release that changes a module's storage layout bumps the
//! constant and does its data rewrite in the module's admin-gated `migrate`
//! entry point, which first calls [`migrate`] here. A governance upgrade
//! proposal runs `upgrade` and then `migrate` as consecutive actions; the new
//! code is active for the second call.
//!
//! Storage: two instance entries (`CurrentHash`: 32 bytes, `StorageVersion`:
//! u32). The release version is not stored: [`version`] looks `CurrentHash` up
//! in the Manager registry on every read, so the version string lives once, in
//! the Manager, which the platform renews (D6). Cross-contract calls:
//! `manager.is_upgrade_approved` and `manager.get_implementation_version`,
//! both read-only.

use soroban_sdk::{contractevent, contracttype, panic_with_error, Address, BytesN, Env, String};

use crate::{clients::ManagerRegistryClient, error::CommonError, ttl};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum UpgradeKey {
    CurrentHash,
    StorageVersion,
}

/// Emitted by `apply`. The emitting contract address is the event's contract id.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Upgraded {
    #[topic]
    pub from_hash: BytesN<32>,
    #[topic]
    pub to_hash: BytesN<32>,
    pub version: String,
}

/// Emitted by `migrate`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Migrated {
    pub from_storage_version: u32,
    pub to_storage_version: u32,
}

/// Record the code hash and storage-layout version at construction time.
pub fn init(e: &Env, current_hash: &BytesN<32>, storage_version: u32) {
    e.storage()
        .instance()
        .set(&crate::ns(e, UpgradeKey::CurrentHash), current_hash);
    e.storage()
        .instance()
        .set(&crate::ns(e, UpgradeKey::StorageVersion), &storage_version);
}

/// Storage-layout version of the data currently held by this contract.
pub fn storage_version(e: &Env) -> u32 {
    e.storage()
        .instance()
        .get(&crate::ns(e, UpgradeKey::StorageVersion))
        .unwrap_or_else(|| panic_with_error!(e, CommonError::StorageVersionNotSet))
}

/// Advance the stored layout version to `code_storage_version` and emit
/// `Migrated`. Panics `NothingToMigrate` unless the stored version is older.
/// Authorization is the caller's responsibility; the module performs its own
/// data rewrite after this returns. Returns the previous version.
pub fn migrate(e: &Env, code_storage_version: u32) -> u32 {
    ttl::extend_instance(e);
    let from = storage_version(e);
    if from >= code_storage_version {
        panic_with_error!(e, CommonError::NothingToMigrate);
    }
    e.storage().instance().set(
        &crate::ns(e, UpgradeKey::StorageVersion),
        &code_storage_version,
    );
    Migrated {
        from_storage_version: from,
        to_storage_version: code_storage_version,
    }
    .publish(e);
    from
}

pub fn current_hash(e: &Env) -> BytesN<32> {
    e.storage()
        .instance()
        .get(&crate::ns(e, UpgradeKey::CurrentHash))
        .unwrap_or_else(|| panic_with_error!(e, CommonError::CurrentHashNotSet))
}

/// The release version of the running code: `CurrentHash` looked up in the
/// Manager registry. Read-only; panics `ImplementationNotFound` if the
/// registry has no record of the hash.
pub fn version(e: &Env, manager: &Address) -> String {
    implementation_version(e, manager, &current_hash(e))
}

fn is_approved(e: &Env, manager: &Address, from: &BytesN<32>, to: &BytesN<32>) -> bool {
    ManagerRegistryClient::new(e, manager).is_upgrade_approved(from, to)
}

fn implementation_version(e: &Env, manager: &Address, hash: &BytesN<32>) -> String {
    let version = ManagerRegistryClient::new(e, manager).get_implementation_version(hash);
    version.unwrap_or_else(|| panic_with_error!(e, CommonError::ImplementationNotFound))
}

/// Perform an upgrade. The caller must already have authorized the upgrade.
///
/// 1. `from` must equal the stored `CurrentHash`.
/// 2. `manager.is_upgrade_approved(from, to)` must be true.
/// 3. Version of `to` is read from the registry.
/// 4. `CurrentHash` is updated, `Upgraded` is emitted and the WASM is swapped.
///
/// A revoked target is rejected by `is_upgrade_approved`; a revoked `from` may
/// still migrate away.
pub fn apply(e: &Env, manager: &Address, from: &BytesN<32>, to: &BytesN<32>) {
    ttl::extend_instance(e);
    if *from != current_hash(e) {
        panic_with_error!(e, CommonError::HashMismatch);
    }
    if !is_approved(e, manager, from, to) {
        panic_with_error!(e, CommonError::UpgradeNotApproved);
    }
    let v = implementation_version(e, manager, to);
    e.storage()
        .instance()
        .set(&crate::ns(e, UpgradeKey::CurrentHash), to);
    Upgraded {
        from_hash: from.clone(),
        to_hash: to.clone(),
        version: v,
    }
    .publish(e);
    e.deployer().update_current_contract_wasm(to.clone());
}
