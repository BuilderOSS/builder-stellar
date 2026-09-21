//! Event emission functions for the Manager contract.

use soroban_sdk::{Address, BytesN, Env, String, Symbol, Vec};

use crate::storage::{DaoModules, FounderAllocation};

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
    env.events().publish(
        (Symbol::new(env, "implementation_registered"),),
        (name, version, wasm_hash, published_at),
    );
}

/// Emitted when an upgrade path is approved.
pub fn emit_upgrade_approved(
    env: &Env,
    from_hash: &BytesN<32>,
    to_hash: &BytesN<32>,
    approved_at: u64,
) {
    env.events().publish(
        (Symbol::new(env, "upgrade_approved"),),
        (from_hash, to_hash, approved_at),
    );
}

/// Emitted when an implementation is revoked.
pub fn emit_implementation_revoked(env: &Env, wasm_hash: &BytesN<32>, revoked_at: u64) {
    env.events().publish(
        (Symbol::new(env, "implementation_revoked"),),
        (wasm_hash, revoked_at),
    );
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
    env.events().publish(
        (Symbol::new(env, "dao_created"),),
        (token_address, creator, created_ledger, modules, founders),
    );
}

/// Emitted when factory is paused.
pub fn emit_factory_paused(env: &Env) {
    env.events()
        .publish((Symbol::new(env, "factory_paused"),), ());
}

/// Emitted when factory is unpaused.
pub fn emit_factory_unpaused(env: &Env) {
    env.events()
        .publish((Symbol::new(env, "factory_unpaused"),), ());
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
    env.events().publish(
        (Symbol::new(env, "dao_registered"),),
        (token_address, creator, modules),
    );
}

// ============================================================================
// Admin Events
// ============================================================================

/// Emitted when admin changes.
pub fn emit_admin_changed(env: &Env, old_admin: &Option<Address>, new_admin: &Address) {
    env.events()
        .publish((Symbol::new(env, "admin_changed"),), (old_admin, new_admin));
}

/// Emitted when current implementation WASMs are updated.
pub fn emit_current_implementations_updated(
    env: &Env,
    token: &BytesN<32>,
    metadata: &BytesN<32>,
    auction: &BytesN<32>,
    governor: &BytesN<32>,
    treasury: &BytesN<32>,
) {
    env.events().publish(
        (Symbol::new(env, "current_implementations_updated"),),
        (token, metadata, auction, governor, treasury),
    );
}
