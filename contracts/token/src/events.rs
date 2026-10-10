//! Events published by the Token contract.
//!
//! Standard NFT lifecycle events (Transfer, Mint, Approve) and vote events
//! (DelegateChanged, DelegateVotesChanged) come from OpenZeppelin. The events
//! below add what those lack: the minter of each token or batch, mint-authority changes
//! and the launch handoff. Admin changes are `common::admin::AdminChanged`.

use soroban_sdk::{contractevent, Address, Env, String, Vec};

/// Emitted once by the constructor.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInitialized {
    #[topic]
    pub admin: Address,
    pub uri: String,
    pub name: String,
    pub symbol: String,
    pub version: String,
}

/// Emitted when minting authority is granted or revoked for an address.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintAuthorityChanged {
    #[topic]
    pub authority: Address,
    pub old_enabled: bool,
    pub enabled: bool,
    pub changed_by: Address,
}

/// Emitted for every token minted by `mint`, next to OpenZeppelin's `Mint`, to
/// record who performed the mint (admin, auction, marketplace, minter).
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
    pub uri: String,
}

/// Emitted once when the Manager launches the token (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenLaunched {
    #[topic]
    pub treasury: Address,
    pub minters: Vec<Address>,
}

pub fn emit_token_initialized(
    e: &Env,
    admin: &Address,
    uri: &String,
    name: &String,
    symbol: &String,
    version: &String,
) {
    TokenInitialized {
        admin: admin.clone(),
        uri: uri.clone(),
        name: name.clone(),
        symbol: symbol.clone(),
        version: version.clone(),
    }
    .publish(e);
}

pub fn emit_mint_authority_changed(
    e: &Env,
    authority: &Address,
    old_enabled: bool,
    enabled: bool,
    changed_by: &Address,
) {
    MintAuthorityChanged {
        authority: authority.clone(),
        old_enabled,
        enabled,
        changed_by: changed_by.clone(),
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

pub fn emit_launched(e: &Env, treasury: &Address, minters: &Vec<Address>) {
    TokenLaunched {
        treasury: treasury.clone(),
        minters: minters.clone(),
    }
    .publish(e);
}

pub fn emit_metadata_updated(e: &Env, uri: &String, name: &String, symbol: &String) {
    MetadataUpdated {
        name: name.clone(),
        symbol: symbol.clone(),
        uri: uri.clone(),
    }
    .publish(e);
}
