//! Events published by the Token contract.
//!
//! Standard NFT lifecycle events (Transfer, Mint, Approve) and vote events
//! (DelegateChanged, DelegateVotesChanged) come from OpenZeppelin. The events
//! below add what those lack: the minter of each token or batch, mint-allowance changes,
//! module registrations and the launch handoff. Admin changes are
//! `common::admin::AdminChanged`.

use common::modules::{MintGrant, TokenSettings};
use soroban_sdk::{contractevent, Address, Env, String, Symbol, Vec};

/// Emitted once by the constructor.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInitialized {
    #[topic]
    pub admin: Address,
    pub name: String,
    pub symbol: String,
    /// The membership switches chosen at creation.
    pub settings: TokenSettings,
}

/// `set_transfers_locked`: the lock was turned on or off.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransfersLockChanged {
    pub locked: bool,
    pub changed_by: Address,
}

/// `set_members_only_delegation`: the delegation rule changed.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MembersOnlyDelegationChanged {
    pub enabled: bool,
    pub changed_by: Address,
}

/// `set_dao_recovery`: DAO recovery (`dao_transfer`) was turned on or off.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoRecoveryChanged {
    pub enabled: bool,
    pub changed_by: Address,
}

/// A module became (or stopped being) a transfer agent: `set_transfer_agent`
/// or `unregister_module`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferAgentChanged {
    #[topic]
    pub module: Address,
    pub enabled: bool,
    pub changed_by: Address,
}

/// A transfer agent moved a token (next to OpenZeppelin's `Transfer`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentTransfer {
    #[topic]
    pub agent: Address,
    pub from: Address,
    pub to: Address,
    pub token_id: u32,
}

/// The DAO moved a token by proposal (`dao_transfer`; next to
/// OpenZeppelin's `Transfer`): lost-key recovery or recall.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoTransfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub token_id: u32,
    pub changed_by: Address,
}

/// Emitted when a module's mint allowance is set by `launch`, raised or
/// lowered by the admin, zeroed by `unregister_module`, or released by the
/// module itself. Not emitted when a mint spends allowance (the remaining
/// amount is readable with `mint_allowance`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintAllowanceChanged {
    #[topic]
    pub module: Address,
    pub old_allowance: u32,
    pub allowance: u32,
    pub changed_by: Address,
}

/// Emitted when a module joins the registry (the Manager at `create_dao` /
/// `create_module` in Setup, the Treasury by proposal once live).
/// The indexer allowlists modules from this event.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModuleRegistered {
    #[topic]
    pub kind: Symbol,
    pub address: Address,
    pub non_voting: bool,
}

/// Emitted when a module leaves the registry.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModuleUnregistered {
    #[topic]
    pub kind: Symbol,
    pub address: Address,
}

/// Emitted for every token minted by `mint`, next to OpenZeppelin's `Mint`, to
/// record who performed the mint (the admin or a module).
/// `batch_mint` emits `MintBatchWithMinter` instead.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintWithMinter {
    #[topic]
    pub minter: Address,
    #[topic]
    pub to: Address,
    pub token_id: u32,
}

/// Emitted once per `batch_mint` call for the contiguous range
/// `[first_token_id, first_token_id + count)`, instead of one
/// `MintWithMinter` per token (keeps large batches under the per-transaction
/// event size limit). Recipients come from OpenZeppelin's per-token `Mint`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintBatchWithMinter {
    #[topic]
    pub minter: Address,
    pub first_token_id: u32,
    pub count: u32,
}

/// Emitted by `set_metadata` (admin only). OpenZeppelin's `set_metadata`
/// writes storage silently; this makes a rename visible to indexers.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataUpdated {
    pub name: String,
    pub symbol: String,
}

/// Emitted once when the Manager launches the token (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenLaunched {
    #[topic]
    pub treasury: Address,
    /// The initial mint allowances `launch` wrote.
    pub grants: Vec<MintGrant>,
}

pub fn emit_token_initialized(
    e: &Env,
    admin: &Address,
    name: &String,
    symbol: &String,
    settings: &TokenSettings,
) {
    TokenInitialized {
        admin: admin.clone(),
        name: name.clone(),
        symbol: symbol.clone(),
        settings: settings.clone(),
    }
    .publish(e);
}

pub fn emit_mint_allowance_changed(
    e: &Env,
    module: &Address,
    old_allowance: u32,
    allowance: u32,
    changed_by: &Address,
) {
    MintAllowanceChanged {
        module: module.clone(),
        old_allowance,
        allowance,
        changed_by: changed_by.clone(),
    }
    .publish(e);
}

pub fn emit_module_registered(e: &Env, kind: &Symbol, address: &Address, non_voting: bool) {
    ModuleRegistered {
        kind: kind.clone(),
        address: address.clone(),
        non_voting,
    }
    .publish(e);
}

pub fn emit_module_unregistered(e: &Env, kind: &Symbol, address: &Address) {
    ModuleUnregistered {
        kind: kind.clone(),
        address: address.clone(),
    }
    .publish(e);
}

pub fn emit_token_mint(e: &Env, minter: &Address, to: &Address, token_id: u32) {
    MintWithMinter {
        minter: minter.clone(),
        to: to.clone(),
        token_id,
    }
    .publish(e);
}

pub fn emit_token_batch_mint(e: &Env, minter: &Address, first_token_id: u32, count: u32) {
    MintBatchWithMinter {
        minter: minter.clone(),
        first_token_id,
        count,
    }
    .publish(e);
}

pub fn emit_launched(e: &Env, treasury: &Address, grants: &Vec<MintGrant>) {
    TokenLaunched {
        treasury: treasury.clone(),
        grants: grants.clone(),
    }
    .publish(e);
}

pub fn emit_metadata_updated(e: &Env, name: &String, symbol: &String) {
    MetadataUpdated {
        name: name.clone(),
        symbol: symbol.clone(),
    }
    .publish(e);
}
