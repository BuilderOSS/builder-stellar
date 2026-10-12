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
    /// Instance (platform contracts): ledgers between a Manager approval and
    /// the earliest upgrade. See [`delay`].
    UpgradeDelay,
    /// Instance: a reduction of `UpgradeDelay` waiting for its ledger.
    PendingUpgradeDelay,
}

/// What the Manager's `LatestImplementation(name)` holds: the hash announced
/// as latest and the ledger it was announced at. A platform contract (the
/// Manager itself, the shared Minter) upgrades only to this hash, and its
/// notice counts from the later of the approval and this announcement, so
/// every possible platform upgrade is visible as "running → latest" for the
/// whole notice (D42).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LatestPointer {
    pub wasm_hash: BytesN<32>,
    pub set_ledger: u64,
}

/// A lowered upgrade notice that applies only once the notice in force when
/// it was requested has passed, so it cannot be used to skip that notice.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingUpgradeDelay {
    pub ledgers: u32,
    pub effective_ledger: u32,
}

/// The upgrade notice recommended for a public network (~7 days). It is a
/// constructor argument of the platform contracts (short on testnet).
pub const RECOMMENDED_UPGRADE_DELAY: u32 = 7 * crate::ttl::DAY_IN_LEDGERS;

/// Record the notice at construction.
pub fn init_delay(e: &Env, ledgers: u32) {
    e.storage()
        .instance()
        .set(&crate::ns(e, UpgradeKey::UpgradeDelay), &ledgers);
}

/// The notice in force now: a pending reduction once its ledger has come,
/// else the recorded value (the recommended one if never recorded).
pub fn delay(e: &Env) -> u32 {
    let instance = e.storage().instance();
    if let Some(pending) =
        instance.get::<_, PendingUpgradeDelay>(&crate::ns(e, UpgradeKey::PendingUpgradeDelay))
    {
        if e.ledger().sequence() >= pending.effective_ledger {
            return pending.ledgers;
        }
    }
    instance
        .get(&crate::ns(e, UpgradeKey::UpgradeDelay))
        .unwrap_or(RECOMMENDED_UPGRADE_DELAY)
}

/// Change the notice. A longer one applies at once; a shorter one only after
/// the notice in force has passed, so a compromised authority cannot shorten
/// it to rush a hostile upgrade through. The caller checks authority.
pub fn set_delay(e: &Env, ledgers: u32) {
    let current = delay(e);
    let instance = e.storage().instance();
    // Commit a reduction that has taken effect, so a later reduction measures
    // its wait from the value in force, not from the one before it.
    instance.set(&crate::ns(e, UpgradeKey::UpgradeDelay), &current);
    instance.remove(&crate::ns(e, UpgradeKey::PendingUpgradeDelay));
    if ledgers >= current {
        instance.set(&crate::ns(e, UpgradeKey::UpgradeDelay), &ledgers);
        instance.remove(&crate::ns(e, UpgradeKey::PendingUpgradeDelay));
    } else {
        instance.set(
            &crate::ns(e, UpgradeKey::PendingUpgradeDelay),
            &PendingUpgradeDelay {
                ledgers,
                effective_ledger: e.ledger().sequence().saturating_add(current),
            },
        );
    }
}

/// Whether an upgrade approved at `approved_ledger` may apply now.
pub fn notice_passed(e: &Env, approved_ledger: u64) -> bool {
    (e.ledger().sequence() as u64) >= approved_ledger.saturating_add(delay(e) as u64)
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
