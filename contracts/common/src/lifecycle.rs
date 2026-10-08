//! Setup/live lifecycle flag.
//!
//! Stored in instance storage under `LifecycleKey::Live` (one bool). Absent
//! means setup phase (`false`). Modules call [`mark_live`] exactly once from
//! their manager-gated `launch`.

use soroban_sdk::{contracttype, panic_with_error, Env};

use crate::error::CommonError;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LifecycleKey {
    Live,
}

pub fn is_live(e: &Env) -> bool {
    e.storage()
        .instance()
        .get(&LifecycleKey::Live)
        .unwrap_or(false)
}

/// Panics with `NotLive` unless the module has been launched.
pub fn require_live(e: &Env) {
    if !is_live(e) {
        panic_with_error!(e, CommonError::NotLive);
    }
}

/// Panics with `AlreadyLive` if the module has been launched.
pub fn require_setup(e: &Env) {
    if is_live(e) {
        panic_with_error!(e, CommonError::AlreadyLive);
    }
}

/// Sets `Live = true`. Panics with `AlreadyLive` on a second call.
pub fn mark_live(e: &Env) {
    require_setup(e);
    e.storage().instance().set(&LifecycleKey::Live, &true);
}
