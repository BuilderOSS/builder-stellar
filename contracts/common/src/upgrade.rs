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
//! The Treasury is the exception: it runs a proposal on the code it started
//! with until the proposal ends, so a `migrate` action after its own
//! `upgrade` still runs the old code and fails `NothingToMigrate`. Its
//! migration is a second step, a separate `treasury.migrate()` call after the
//! upgrade proposal has executed.
//!
//! A module that checks [`is_current_layout`] at its entry points, and fails
//! with its own `StorageVersionMismatch` error when it is false, refuses to
//! run while the stored layout differs from its code's, so new code never
//! reads data it has not migrated, and old code never reads data a newer
//! release rewrote. Such a module must keep `upgrade`, `migrate` and the
//! upgrade views outside the gate, so a skipped migration can still be
//! completed. The Governor and the Treasury do this.
//!
//! Storage: two instance entries (`CurrentHash`: 32 bytes, `StorageVersion`:
//! u32). The release version is not stored: [`version`] looks `CurrentHash` up
//! in the Manager registry on every read, so the version string lives once, in
//! the Manager, which the platform renews (D6). Cross-contract calls:
//! `manager.is_upgrade_approved` and `manager.get_implementation_version`,
//! both read-only.

use soroban_sdk::{contractevent, contracttype, panic_with_error, Address, BytesN, Env, String};

use crate::{clients::ManagerRegistryClient, error::CommonError, ttl};

/// Instance keys of the upgrade state (wrapped with [`crate::ns`]).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum UpgradeKey {
    /// Instance: WASM hash of the running code, kept in step by [`apply`].
    CurrentHash,
    /// Instance: layout version of the stored data, set at construction and
    /// advanced only by [`migrate`].
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
    /// The hash announced as latest.
    pub wasm_hash: BytesN<32>,
    /// The ledger it was announced at; the notice counts from here or later.
    pub set_ledger: u64,
}

/// A lowered upgrade notice that applies only once the notice in force when
/// it was requested has passed, so it cannot be used to skip that notice.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingUpgradeDelay {
    /// The lowered notice, in ledgers.
    pub ledgers: u32,
    /// The ledger from which it applies.
    pub effective_ledger: u32,
}

/// The upgrade notice recommended for a public network (~7 days). It is a
/// constructor argument of the platform contracts (short on testnet).
pub const RECOMMENDED_UPGRADE_DELAY: u32 = 7 * crate::ttl::DAY_IN_LEDGERS;

/// Record the notice at construction (platform contracts only).
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
    let effective_ledger = if ledgers >= current {
        instance.set(&crate::ns(e, UpgradeKey::UpgradeDelay), &ledgers);
        instance.remove(&crate::ns(e, UpgradeKey::PendingUpgradeDelay));
        e.ledger().sequence()
    } else {
        let effective_ledger = e.ledger().sequence().saturating_add(current);
        instance.set(
            &crate::ns(e, UpgradeKey::PendingUpgradeDelay),
            &PendingUpgradeDelay {
                ledgers,
                effective_ledger,
            },
        );
        effective_ledger
    };
    UpgradeDelayChanged {
        from_ledgers: current,
        to_ledgers: ledgers,
        effective_ledger,
    }
    .publish(e);
}

/// Whether an upgrade approved at `approved_ledger` may apply now.
pub fn notice_passed(e: &Env, approved_ledger: u64) -> bool {
    (e.ledger().sequence() as u64) >= approved_ledger.saturating_add(delay(e) as u64)
}

/// Emitted by `apply`. The emitting contract address is the event's contract id.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Upgraded {
    /// The code hash before the upgrade.
    #[topic]
    pub from_hash: BytesN<32>,
    /// The code hash after it.
    #[topic]
    pub to_hash: BytesN<32>,
    /// The registry's release version for `to_hash`.
    pub version: String,
}

/// Emitted by `set_delay` (Manager and shared Minter only). A shorter notice
/// is in force from `effective_ledger`; a longer one at once. This is the
/// change a member wants told about: it shortens the window to react to a
/// platform upgrade.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeDelayChanged {
    /// The notice in force before the change, in ledgers.
    pub from_ledgers: u32,
    /// The requested notice, in ledgers.
    pub to_ledgers: u32,
    /// The ledger from which `to_ledgers` applies.
    pub effective_ledger: u32,
}

/// Emitted by [`migrate`] when the stored layout moves forward. The emitting
/// contract address is the event's contract id.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Migrated {
    /// The layout version before the migration.
    pub from_storage_version: u32,
    /// The layout version after it (the code's `STORAGE_VERSION`).
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

/// Whether the stored layout version equals `code_storage_version`, the
/// layout the running code was written for. Panics `StorageVersionNotSet` if
/// none was recorded.
///
/// A WASM upgrade swaps the code and leaves the data as it was, so between an
/// upgrade and its `migrate`, or after an upgrade to code with an older
/// layout, the code and the data disagree. Reading or writing data in a
/// layout the code does not know could misread it or corrupt it, so a gated
/// entry point refuses instead, with the module's own error (each crate keeps
/// its error codes in its own block). One read of the already-loaded instance.
pub fn is_current_layout(e: &Env, code_storage_version: u32) -> bool {
    storage_version(e) == code_storage_version
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

/// WASM hash of the running code. Panics `CurrentHashNotSet` if the module
/// was never initialized.
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

/// Perform an upgrade the Manager itself has already checked (the registry
/// approved `from -> to` and `version` is `to`'s release). For calls the
/// Manager makes, where asking the Manager back would be contract re-entry,
/// which Soroban forbids (ClaimMinter's `recovery_upgrade`). The caller must
/// already have authorized the upgrade, and only the Manager may reach it.
pub fn apply_checked_by_manager(e: &Env, from: &BytesN<32>, to: &BytesN<32>, version: String) {
    ttl::extend_instance(e);
    if *from != current_hash(e) {
        panic_with_error!(e, CommonError::HashMismatch);
    }
    e.storage()
        .instance()
        .set(&crate::ns(e, UpgradeKey::CurrentHash), to);
    Upgraded {
        from_hash: from.clone(),
        to_hash: to.clone(),
        version,
    }
    .publish(e);
    e.deployer().update_current_contract_wasm(to.clone());
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
