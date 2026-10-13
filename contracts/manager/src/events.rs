//! Event emission functions for the Manager contract.

use common::modules::ModuleEntry;
use soroban_sdk::{contractevent, Address, BytesN, Env, String, Symbol, Vec};

use crate::storage::{CurrentImplementations, DaoAddresses, DaoWasmHashes};

#[contractevent]
pub struct ManagerInitialized {
    #[topic]
    pub admin: Address,
    pub version: String,
    pub deployed_ledger: u64,
}

#[contractevent]
pub struct AdminProposed {
    #[topic]
    pub current_admin: Address,
    #[topic]
    pub proposed_admin: Address,
}

#[contractevent]
pub struct AdminChanged {
    #[topic]
    pub old_admin: Address,
    #[topic]
    pub new_admin: Address,
}

#[contractevent]
pub struct ImplementationRegistered {
    pub name: String,
    pub version: String,
    #[topic]
    pub wasm_hash: BytesN<32>,
    pub published_ledger: u64,
}

/// Emitted by `set_latest_implementation`.
#[contractevent]
pub struct LatestImplementationSet {
    #[topic]
    pub name: String,
    #[topic]
    pub wasm_hash: BytesN<32>,
    pub version: String,
}
#[contractevent]
pub struct UpgradeApproved {
    #[topic]
    pub from_hash: BytesN<32>,
    #[topic]
    pub to_hash: BytesN<32>,
    pub approved_ledger: u64,
}
#[contractevent]
pub struct ImplementationRevoked {
    #[topic]
    pub wasm_hash: BytesN<32>,
    pub revoked_ledger: u64,
}
#[contractevent]
pub struct DaoCreated {
    #[topic]
    pub token_address: Address,
    #[topic]
    pub deployer: Address,
    #[topic]
    pub launch_admin: Address,
    pub created_ledger: u64,
    pub modules: DaoAddresses,
    /// WASM hashes the modules were deployed from.
    pub wasm_hashes: DaoWasmHashes,
    /// Requested slug. Not unique until claimed at launch (`SlugClaimed`).
    pub slug: String,
}

/// Emitted by `update_pending_slug`.
#[contractevent]
pub struct PendingSlugUpdated {
    #[topic]
    pub token_address: Address,
    pub slug: String,
}

/// Emitted by `launch_dao` when the DAO's slug becomes its unique id (it can
/// later change by vote, see `SlugChanged`).
#[contractevent]
pub struct SlugClaimed {
    #[topic]
    pub token_address: Address,
    #[topic]
    pub slug: String,
}
#[contractevent]
pub struct AdminProposalCancelled {
    #[topic]
    pub current_admin: Address,
    #[topic]
    pub cancelled_admin: Address,
}
#[contractevent]
pub struct FactoryPaused {}
#[contractevent]
pub struct FactoryUnpaused {}
#[contractevent]
pub struct DaoLaunched {
    #[topic]
    pub token_address: Address,
    pub launched_ledger: u64,
    pub modules: DaoAddresses,
    pub launch_auction: bool,
    pub launch_marketplace: bool,
    /// The registered modules at launch (the Token's registry): the
    /// indexer knows the launch set without the Token's `ModuleRegistered`.
    pub registry: Vec<ModuleEntry>,
}

/// Emitted by `create_module`: the `n`th module of `kind` for the DAO,
/// at `predict_module_address(token, kind, n)`.
#[contractevent]
pub struct ModuleCreated {
    #[topic]
    pub token_address: Address,
    #[topic]
    pub kind: Symbol,
    pub n: u32,
    pub address: Address,
}
#[contractevent]
pub struct CurrentImplementationsUpdated {
    pub token: BytesN<32>,
    pub metadata: BytesN<32>,
    pub auction: BytesN<32>,
    pub governor: BytesN<32>,
    pub treasury: BytesN<32>,
    pub marketplace: BytesN<32>,
    pub claims: BytesN<32>,
}
#[contractevent]
pub struct ManagerUpgraded {
    #[topic]
    pub from_hash: BytesN<32>,
    #[topic]
    pub to_hash: BytesN<32>,
    pub from_version: String,
    pub to_version: String,
    pub upgraded_ledger: u64,
}

// ============================================================================
// Implementation Management Events
// ============================================================================

/// Emitted when a new implementation is registered.
pub fn emit_implementation_registered(
    env: &Env,
    name: &String,
    version: &String,
    wasm_hash: &BytesN<32>,
    published_ledger: u64,
) {
    ImplementationRegistered {
        name: name.clone(),
        version: version.clone(),
        wasm_hash: wasm_hash.clone(),
        published_ledger,
    }
    .publish(env);
}

/// Emitted when an upgrade path is approved.
pub fn emit_upgrade_approved(
    env: &Env,
    from_hash: &BytesN<32>,
    to_hash: &BytesN<32>,
    approved_ledger: u64,
) {
    UpgradeApproved {
        from_hash: from_hash.clone(),
        to_hash: to_hash.clone(),
        approved_ledger,
    }
    .publish(env);
}

/// Emitted when an implementation is revoked.
pub fn emit_implementation_revoked(env: &Env, wasm_hash: &BytesN<32>, revoked_ledger: u64) {
    ImplementationRevoked {
        wasm_hash: wasm_hash.clone(),
        revoked_ledger,
    }
    .publish(env);
}

// ============================================================================
// Factory Events
// ============================================================================

/// Emitted when a new DAO is created.
#[allow(clippy::too_many_arguments)] // mirrors the event fields 1:1
pub fn emit_dao_created(
    env: &Env,
    token_address: &Address,
    deployer: &Address,
    launch_admin: &Address,
    created_ledger: u64,
    modules: &DaoAddresses,
    wasm_hashes: &DaoWasmHashes,
    slug: &String,
) {
    DaoCreated {
        token_address: token_address.clone(),
        deployer: deployer.clone(),
        launch_admin: launch_admin.clone(),
        created_ledger,
        modules: modules.clone(),
        wasm_hashes: wasm_hashes.clone(),
        slug: slug.clone(),
    }
    .publish(env);
}

/// Emitted when a pending DAO's requested slug changes.
pub fn emit_pending_slug_updated(env: &Env, token_address: &Address, slug: &String) {
    PendingSlugUpdated {
        token_address: token_address.clone(),
        slug: slug.clone(),
    }
    .publish(env);
}

/// Emitted by `change_slug`: a launched DAO moved to `new_slug` and released
/// `old_slug`, which any DAO may claim from the same ledger on.
#[contractevent]
pub struct SlugChanged {
    #[topic]
    pub token_address: Address,
    #[topic]
    pub new_slug: String,
    pub old_slug: String,
}

/// Emitted when a launched DAO changes its slug.
pub fn emit_slug_changed(env: &Env, token_address: &Address, old_slug: &String, new_slug: &String) {
    SlugChanged {
        token_address: token_address.clone(),
        new_slug: new_slug.clone(),
        old_slug: old_slug.clone(),
    }
    .publish(env);
}

/// Emitted when a DAO's slug is claimed at launch.
pub fn emit_slug_claimed(env: &Env, token_address: &Address, slug: &String) {
    SlugClaimed {
        token_address: token_address.clone(),
        slug: slug.clone(),
    }
    .publish(env);
}

/// Emitted when the admin selects the latest implementation for a name.
pub fn emit_latest_implementation_set(
    env: &Env,
    name: &String,
    wasm_hash: &BytesN<32>,
    version: &String,
) {
    LatestImplementationSet {
        name: name.clone(),
        wasm_hash: wasm_hash.clone(),
        version: version.clone(),
    }
    .publish(env);
}

/// Emitted when factory is paused.
pub fn emit_factory_paused(env: &Env) {
    FactoryPaused {}.publish(env);
}

/// Emitted when factory is unpaused.
pub fn emit_factory_unpaused(env: &Env) {
    FactoryUnpaused {}.publish(env);
}

pub fn emit_dao_launched(
    env: &Env,
    token_address: &Address,
    launched_ledger: u64,
    modules: &DaoAddresses,
    launch_auction: bool,
    launch_marketplace: bool,
    registry: &Vec<ModuleEntry>,
) {
    DaoLaunched {
        token_address: token_address.clone(),
        launched_ledger,
        modules: modules.clone(),
        launch_auction,
        launch_marketplace,
        registry: registry.clone(),
    }
    .publish(env);
}

pub fn emit_module_created(
    env: &Env,
    token_address: &Address,
    kind: &Symbol,
    n: u32,
    address: &Address,
) {
    ModuleCreated {
        token_address: token_address.clone(),
        kind: kind.clone(),
        n,
        address: address.clone(),
    }
    .publish(env);
}

// ============================================================================
// Admin Events
// ============================================================================

/// Emitted when current implementation WASMs are updated.
pub fn emit_current_implementations_updated(env: &Env, current: &CurrentImplementations) {
    CurrentImplementationsUpdated {
        token: current.token.clone(),
        metadata: current.metadata.clone(),
        auction: current.auction.clone(),
        governor: current.governor.clone(),
        treasury: current.treasury.clone(),
        marketplace: current.marketplace.clone(),
        claims: current.claims.clone(),
    }
    .publish(env);
}

/// Emitted when Manager is initialized.
pub fn emit_manager_initialized(
    env: &Env,
    admin: &Address,
    version: &String,
    deployed_ledger: u64,
) {
    ManagerInitialized {
        admin: admin.clone(),
        version: version.clone(),
        deployed_ledger,
    }
    .publish(env);
}

/// Emitted when Manager itself is upgraded.
pub fn emit_manager_upgraded(
    env: &Env,
    from_hash: &BytesN<32>,
    to_hash: &BytesN<32>,
    from_version: &String,
    to_version: &String,
    upgraded_ledger: u64,
) {
    ManagerUpgraded {
        from_hash: from_hash.clone(),
        to_hash: to_hash.clone(),
        from_version: from_version.clone(),
        to_version: to_version.clone(),
        upgraded_ledger,
    }
    .publish(env);
}

/// Emitted when the admin proposes a successor.
pub fn emit_admin_proposed(env: &Env, current_admin: &Address, proposed_admin: &Address) {
    AdminProposed {
        current_admin: current_admin.clone(),
        proposed_admin: proposed_admin.clone(),
    }
    .publish(env);
}

/// Emitted when the admin cancels a pending handover.
pub fn emit_admin_proposal_cancelled(env: &Env, current_admin: &Address, cancelled: &Address) {
    AdminProposalCancelled {
        current_admin: current_admin.clone(),
        cancelled_admin: cancelled.clone(),
    }
    .publish(env);
}

/// Emitted when a proposed admin accepts.
pub fn emit_admin_changed(env: &Env, old_admin: &Address, new_admin: &Address) {
    AdminChanged {
        old_admin: old_admin.clone(),
        new_admin: new_admin.clone(),
    }
    .publish(env);
}
