//! Storage keys and types for the Treasury contract.
//!
//! The Treasury stores only its wiring (Governor, Manager); the module admin
//! lives under `common::admin` and the upgrade keys under `common::upgrade`.

use soroban_sdk::{contracttype, Address, Symbol, Val, Vec};

/// Storage-layout version of this code (see `common::upgrade`).
pub const STORAGE_VERSION: u32 = 1;

/// Deepest `AuthNode` tree an `authorize` action may carry (a root counts as 1).
pub const MAX_AUTH_DEPTH: u32 = 4;
/// Most `AuthNode`s (all levels together) one `authorize` action may carry.
pub const MAX_AUTH_NODES: u32 = 16;

#[contracttype]
pub enum TreasuryKey {
    /// Governor whose queued proposals `execute` consumes. Immutable.
    Governor,
    /// Manager that approves upgrades and performs the launch.
    Manager,
}

/// One contract invocation the Treasury pre-authorizes, with the invocations
/// below it that also need the Treasury's authorization.
///
/// A proposal action aimed at the Treasury itself with function `authorize`
/// and a single `Vec<AuthNode>` argument adds these trees to the Treasury's
/// authorization for the *next* action. Use it when the next call reaches a
/// contract that requires the Treasury's auth deeper in the call stack (for
/// example a token `transfer` from the Treasury made by a marketplace or an
/// AMM). Because it is an ordinary action, the trees are part of the proposal
/// id and voters approve them with the rest of the proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthNode {
    pub contract: Address,
    pub fn_name: Symbol,
    pub args: Vec<Val>,
    pub sub: Vec<AuthNode>,
}

/// Every `TreasuryKey` variant with sample arguments, for the key guard test.
/// `index` fails to compile when a variant is added: give it the next index,
/// raise `VARIANTS` and add a sample to `all`, or the guard test fails.
#[cfg(test)]
pub(crate) mod key_samples {
    extern crate std;
    use super::*;
    #[allow(unused_imports)]
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, IntoVal, Val};

    pub const VARIANTS: usize = 2;

    pub fn index(key: &TreasuryKey) -> usize {
        match key {
            TreasuryKey::Governor => 0,
            TreasuryKey::Manager => 1,
        }
    }

    #[allow(unused_variables)]
    pub fn all(e: &Env) -> std::vec::Vec<Val> {
        let a = soroban_sdk::Address::generate(e);
        let id = soroban_sdk::BytesN::<32>::from_array(e, &[0; 32]);
        let text = soroban_sdk::String::from_str(e, "x");
        let keys = std::vec![TreasuryKey::Governor, TreasuryKey::Manager,];
        common::testutils::assert_every_variant_sampled(
            "TreasuryKey",
            &keys.iter().map(index).collect::<std::vec::Vec<_>>(),
            VARIANTS,
        );
        keys.into_iter().map(|k| k.into_val(e)).collect()
    }
}
