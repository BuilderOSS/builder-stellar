//! Shared types for the Token's module registry (docs/designs/membership-models.md §1).
//!
//! A module is a contract registered on a DAO's Token: the Auction, the
//! Marketplace, the ClaimMinter, a Circle or custom DAO code. The Token keeps
//! the registry; the Manager and other modules read and pass these types.

use soroban_sdk::{contracttype, Address, Env, Symbol, SymbolStr, TryFromVal};

/// Most modules one Token can register (instance storage, read on every
/// transfer by `voting_holder`).
pub const MAX_MODULES: u32 = 16;

/// Built-in module kinds. Custom kinds are `custom_<name>`.
pub const KIND_AUCTION: &str = "auction";
pub const KIND_MARKETPLACE: &str = "marketplace";
pub const KIND_CLAIMS: &str = "claims";
pub const KIND_CIRCLE: &str = "circle";
/// Prefix of every custom kind. A `Symbol` holds at most 32 characters from
/// `a-zA-Z0-9_`, so `<name>` is 1 to 25 characters by construction.
pub const CUSTOM_KIND_PREFIX: &str = "custom_";

/// One registry entry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModuleEntry {
    pub kind: Symbol,
    pub address: Address,
    /// Tokens this module holds carry no votes (custody: Auction, Marketplace).
    pub non_voting: bool,
}

/// An initial mint allowance written by the Token's `launch`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintGrant {
    pub module: Address,
    pub allowance: u32,
}

/// `kind` is a built-in kind or `custom_<name>` with a non-empty name.
pub fn is_valid_kind(e: &Env, kind: &Symbol) -> bool {
    let Ok(s) = SymbolStr::try_from_val(e, &kind.to_symbol_val()) else {
        return false;
    };
    let bytes: &[u8] = s.as_ref();
    for builtin in [KIND_AUCTION, KIND_MARKETPLACE, KIND_CLAIMS, KIND_CIRCLE] {
        if bytes == builtin.as_bytes() {
            return true;
        }
    }
    let prefix = CUSTOM_KIND_PREFIX.as_bytes();
    bytes.len() > prefix.len() && bytes.starts_with(prefix)
}

/// `kind` equals the built-in kind `name`.
pub fn kind_is(e: &Env, kind: &Symbol, name: &str) -> bool {
    *kind == Symbol::new(e, name)
}
