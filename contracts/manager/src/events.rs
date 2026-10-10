//! Event emission functions for the Manager contract.

use soroban_sdk::{contractevent, Address, BytesN, Env, String};

use crate::storage::{DaoAddresses, DaoWasmHashes};

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
pub struct PlatformMinterSet {
    #[topic]
    pub minter: Address,
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

/// Emitted by `launch_dao` when the DAO's slug becomes its permanent, unique id.
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
    pub enable_minter: bool,
}
#[contractevent]
pub struct CurrentImplementationsUpdated {
    pub token: BytesN<32>,
    pub metadata: BytesN<32>,
    pub auction: BytesN<32>,
    pub governor: BytesN<32>,
    pub treasury: BytesN<32>,
    pub marketplace: BytesN<32>,
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
    enable_minter: bool,
) {
    DaoLaunched {
        token_address: token_address.clone(),
        launched_ledger,
        modules: modules.clone(),
        launch_auction,
        launch_marketplace,
        enable_minter,
    }
    .publish(env);
}

// ============================================================================
// Admin Events
// ============================================================================

/// Emitted when current implementation WASMs are updated.
pub fn emit_current_implementations_updated(
    env: &Env,
    token: &BytesN<32>,
    metadata: &BytesN<32>,
    auction: &BytesN<32>,
    governor: &BytesN<32>,
    treasury: &BytesN<32>,
    marketplace: &BytesN<32>,
) {
    CurrentImplementationsUpdated {
        token: token.clone(),
        metadata: metadata.clone(),
        auction: auction.clone(),
        governor: governor.clone(),
        treasury: treasury.clone(),
        marketplace: marketplace.clone(),
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

/// Emitted when the platform minter is set.
pub fn emit_platform_minter_set(env: &Env, minter: &Address) {
    PlatformMinterSet {
        minter: minter.clone(),
    }
    .publish(env);
}
