//! Storage keys for the Token contract.
//!
//! Token metadata (name, symbol, URI), ownership records and vote checkpoints
//! live under OpenZeppelin's keys. The module admin lives under
//! `common::admin`. This enum only holds the contract-specific keys.

use soroban_sdk::{contracttype, Address};

/// Storage-layout version of this code (see `common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;

#[contracttype]
pub enum TokenKey {
    /// Persistent: `Address -> u32`, how many more tokens a registered module
    /// may mint (docs/designs/membership-models.md §1). The admin mints
    /// without an allowance.
    MintAllowance(Address),
    /// Instance: metadata contract called on every mint to seed artwork.
    /// Not named `Metadata`: a unit variant encodes as `["Metadata"]`, the
    /// same key as OpenZeppelin's `NFTStorageKey::Metadata` (name, symbol,
    /// URI), which this address used to overwrite.
    MetadataContract,
    /// Instance: Manager that approves upgrades and performs the launch.
    Manager,
    /// Instance: DAO Treasury; the only address `launch` accepts. Holds no
    /// voting power (see `voting_holder`).
    Treasury,
    /// Instance: `Vec<common::modules::ModuleEntry>`, the registered modules
    /// (at most `common::modules::MAX_MODULES`). Entries with `non_voting`
    /// hold no voting power.
    Modules,
    /// Instance: `common::modules::TokenSettings`, the three membership
    /// switches (docs/designs/locked-tokens.md); absent = all off.
    Settings,
    /// Instance: `Vec<Address>`, the registered modules that may call
    /// `agent_transfer` (at most `common::modules::MAX_MODULES`).
    TransferAgents,
}

/// Every `TokenKey` variant with sample arguments, for the key guard test.
/// `index` fails to compile when a variant is added: give it the next index,
/// raise `VARIANTS` and add a sample to `all`, or the guard test fails.
#[cfg(test)]
pub(crate) mod key_samples {
    extern crate std;
    use super::*;
    #[allow(unused_imports)]
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, IntoVal, Val};

    pub const VARIANTS: usize = 7;

    pub fn index(key: &TokenKey) -> usize {
        match key {
            TokenKey::MintAllowance(_) => 0,
            TokenKey::MetadataContract => 1,
            TokenKey::Manager => 2,
            TokenKey::Treasury => 3,
            TokenKey::Modules => 4,
            TokenKey::Settings => 5,
            TokenKey::TransferAgents => 6,
        }
    }

    #[allow(unused_variables)]
    pub fn all(e: &Env) -> std::vec::Vec<Val> {
        let a = soroban_sdk::Address::generate(e);
        let id = soroban_sdk::BytesN::<32>::from_array(e, &[0; 32]);
        let text = soroban_sdk::String::from_str(e, "x");
        let keys = std::vec![
            TokenKey::MintAllowance(a.clone()),
            TokenKey::MetadataContract,
            TokenKey::Manager,
            TokenKey::Treasury,
            TokenKey::Modules,
            TokenKey::Settings,
            TokenKey::TransferAgents,
        ];
        common::testutils::assert_every_variant_sampled(
            "TokenKey",
            &keys.iter().map(index).collect::<std::vec::Vec<_>>(),
            VARIANTS,
        );
        keys.into_iter().map(|k| k.into_val(e)).collect()
    }
}
