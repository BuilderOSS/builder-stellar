//! Test helpers for modules exercising `upgrade::apply` (feature `testutils`).

use soroban_sdk::{
    contract, contractimpl, contracttype, testutils::storage::Instance as _, testutils::Ledger,
    Address, Bytes, BytesN, Env, String,
};

/// Remaining instance TTL (in ledgers) of `contract`.
pub fn instance_ttl(e: &Env, contract: &Address) -> u32 {
    e.as_contract(contract, || e.storage().instance().get_ttl())
}

/// Advance the ledger sequence by `n` ledgers (entries age, nothing expires
/// as long as `n` stays below the remaining TTL).
pub fn advance_ledgers(e: &Env, n: u32) {
    e.ledger().with_mut(|l| l.sequence_number += n);
}

/// Minimal valid Soroban wasm (env-meta section only). Uploading it yields a
/// hash that `update_current_contract_wasm` accepts.
pub fn empty_wasm(e: &Env) -> BytesN<32> {
    e.deployer().upload_contract_wasm(Bytes::from_slice(
        e,
        include_bytes!("../testdata/empty.wasm"),
    ))
}

#[contracttype]
pub enum MockKey {
    Approved(BytesN<32>, BytesN<32>),
    Version(BytesN<32>),
}

#[contract]
pub struct MockManager;

#[contractimpl]
impl MockManager {
    pub fn approve(e: Env, from: BytesN<32>, to: BytesN<32>) {
        e.storage()
            .instance()
            .set(&MockKey::Approved(from, to), &true);
    }
    pub fn register(e: Env, hash: BytesN<32>, version: String) {
        e.storage()
            .instance()
            .set(&MockKey::Version(hash), &version);
    }
    pub fn is_upgrade_approved(e: Env, from: BytesN<32>, to: BytesN<32>) -> bool {
        e.storage()
            .instance()
            .get(&MockKey::Approved(from, to))
            .unwrap_or(false)
    }
    pub fn get_implementation_version(e: Env, hash: BytesN<32>) -> Option<String> {
        e.storage().instance().get(&MockKey::Version(hash))
    }
}
