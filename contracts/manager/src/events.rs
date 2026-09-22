//! Event emission functions for the Manager contract.

use soroban_sdk::{contractevent, Address, BytesN, Env, String, Vec};

use crate::storage::{DaoModules, FounderAllocation};

#[contractevent]
pub struct ImplementationRegistered {
    pub name: String,
    pub version: u32,
    #[topic]
    pub wasm_hash: BytesN<32>,
    pub published_at: u64,
}
#[contractevent]
pub struct UpgradeApproved {
    #[topic]
    pub from_hash: BytesN<32>,
    #[topic]
    pub to_hash: BytesN<32>,
    pub approved_at: u64,
}
#[contractevent]
pub struct ImplementationRevoked {
    #[topic]
    pub wasm_hash: BytesN<32>,
    pub revoked_at: u64,
}
#[contractevent]
pub struct DaoCreated {
    #[topic]
    pub token_address: Address,
    #[topic]
    pub creator: Address,
    pub created_ledger: u32,
    pub modules: DaoModules,
    pub founders: Vec<FounderAllocation>,
}
#[contractevent]
pub struct FactoryPaused {}
#[contractevent]
pub struct FactoryUnpaused {}
#[contractevent]
pub struct DaoRegistered {
    #[topic]
    pub token_address: Address,
    #[topic]
    pub creator: Address,
    pub modules: DaoModules,
}

#[contractevent]
pub struct DaoFinalized {
    #[topic]
    pub token_address: Address,
    pub finalized_ledger: u32,
    pub modules: DaoModules,
    pub launch_auction: bool,
}
#[contractevent]
pub struct CurrentImplementationsUpdated {
    pub token: BytesN<32>,
    pub metadata: BytesN<32>,
    pub auction: BytesN<32>,
    pub governor: BytesN<32>,
    pub treasury: BytesN<32>,
}

// ============================================================================
// Implementation Management Events
// ============================================================================

/// Emitted when a new implementation is registered.
pub fn emit_implementation_registered(
    env: &Env,
    name: &String,
    version: u32,
    wasm_hash: &BytesN<32>,
    published_at: u64,
) {
    ImplementationRegistered {
        name: name.clone(),
        version,
        wasm_hash: wasm_hash.clone(),
        published_at,
    }
    .publish(env);
}

/// Emitted when an upgrade path is approved.
pub fn emit_upgrade_approved(
    env: &Env,
    from_hash: &BytesN<32>,
    to_hash: &BytesN<32>,
    approved_at: u64,
) {
    UpgradeApproved {
        from_hash: from_hash.clone(),
        to_hash: to_hash.clone(),
        approved_at,
    }
    .publish(env);
}

/// Emitted when an implementation is revoked.
pub fn emit_implementation_revoked(env: &Env, wasm_hash: &BytesN<32>, revoked_at: u64) {
    ImplementationRevoked {
        wasm_hash: wasm_hash.clone(),
        revoked_at,
    }
    .publish(env);
}

// ============================================================================
// Factory Events
// ============================================================================

/// Emitted when a new DAO is created.
pub fn emit_dao_created(
    env: &Env,
    token_address: &Address,
    creator: &Address,
    created_ledger: u32,
    modules: &DaoModules,
    founders: &Vec<FounderAllocation>,
) {
    DaoCreated {
        token_address: token_address.clone(),
        creator: creator.clone(),
        created_ledger,
        modules: modules.clone(),
        founders: founders.clone(),
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

// ============================================================================
// Registry Events
// ============================================================================

/// Emitted when a DAO is registered.
pub fn emit_dao_registered(
    env: &Env,
    token_address: &Address,
    creator: &Address,
    modules: &DaoModules,
) {
    DaoRegistered {
        token_address: token_address.clone(),
        creator: creator.clone(),
        modules: modules.clone(),
    }
    .publish(env);
}

pub fn emit_dao_finalized(
    env: &Env,
    token_address: &Address,
    finalized_ledger: u32,
    modules: &DaoModules,
    launch_auction: bool,
) {
    DaoFinalized {
        token_address: token_address.clone(),
        finalized_ledger,
        modules: modules.clone(),
        launch_auction,
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
) {
    CurrentImplementationsUpdated {
        token: token.clone(),
        metadata: metadata.clone(),
        auction: auction.clone(),
        governor: governor.clone(),
        treasury: treasury.clone(),
    }
    .publish(env);
}
