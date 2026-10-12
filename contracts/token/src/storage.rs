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
    /// Persistent: `Address -> bool`, whether the address may mint once the
    /// token is live. The admin has implicit authority and needs no entry.
    MintAuthority(Address),
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
    /// Instance: DAO Auction. Holds no voting power.
    Auction,
    /// Instance: DAO Marketplace (escrow). Holds no voting power.
    Marketplace,
    /// Instance: the shared platform Minter granted mint authority at launch
    /// (the claim contract this DAO pinned). Set once by `launch`.
    Minter,
    /// Instance: `Option<Address>` allowed to revoke the shared Minter's mint
    /// authority at once (`pause_platform_minter`), without a proposal. The
    /// launch admin at launch; the admin (Treasury) can change or clear it.
    MinterGuardian,
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

    pub const VARIANTS: usize = 8;

    pub fn index(key: &TokenKey) -> usize {
        match key {
            TokenKey::MintAuthority(_) => 0,
            TokenKey::MetadataContract => 1,
            TokenKey::Manager => 2,
            TokenKey::Treasury => 3,
            TokenKey::Auction => 4,
            TokenKey::Marketplace => 5,
            TokenKey::Minter => 6,
            TokenKey::MinterGuardian => 7,
        }
    }

    #[allow(unused_variables)]
    pub fn all(e: &Env) -> std::vec::Vec<Val> {
        let a = soroban_sdk::Address::generate(e);
        let id = soroban_sdk::BytesN::<32>::from_array(e, &[0; 32]);
        let text = soroban_sdk::String::from_str(e, "x");
        let keys = std::vec![
            TokenKey::MintAuthority(a.clone()),
            TokenKey::MetadataContract,
            TokenKey::Manager,
            TokenKey::Treasury,
            TokenKey::Auction,
            TokenKey::Marketplace,
            TokenKey::Minter,
            TokenKey::MinterGuardian,
        ];
        common::testutils::assert_every_variant_sampled(
            "TokenKey",
            &keys.iter().map(index).collect::<std::vec::Vec<_>>(),
            VARIANTS,
        );
        keys.into_iter().map(|k| k.into_val(e)).collect()
    }
}
