//! The single admin model shared by every DAO module.
//!
//! A module's admin is the launch admin during setup and the DAO Treasury
//! once the Manager launches it ([`handoff`] from each module's `launch`).
//! There is deliberately no transfer, two-step handover or renounce: after
//! launch the admin is the Treasury for the module's whole life, and the
//! Treasury only acts through passed proposals.
//!
//! Storage: one instance entry (`AdminKey::Admin`).

use soroban_sdk::{contractevent, contracttype, Address, Env};

use crate::error::{require, CommonError};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AdminKey {
    Admin,
}

/// Emitted by [`handoff`]. The emitting contract address is the event's contract id.
///
/// Same shape as the Manager's own `AdminChanged`, so indexers decode both
/// with one schema.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminChanged {
    #[topic]
    pub old_admin: Address,
    #[topic]
    pub new_admin: Address,
}

/// Record the initial (setup-phase) admin at construction time.
pub fn init(e: &Env, admin: &Address) {
    e.storage().instance().set(&AdminKey::Admin, admin);
}

/// Current admin. Panics `AdminNotSet` if the module was never initialized.
pub fn admin(e: &Env) -> Address {
    require(
        e,
        e.storage().instance().get(&AdminKey::Admin),
        CommonError::AdminNotSet,
    )
}

/// Require the admin's authorization and return the admin.
pub fn require_admin(e: &Env) -> Address {
    let admin = admin(e);
    admin.require_auth();
    admin
}

/// Move the admin to `new_admin` (the launch handoff) and emit `AdminChanged`.
pub fn handoff(e: &Env, new_admin: &Address) {
    let previous = admin(e);
    e.storage().instance().set(&AdminKey::Admin, new_admin);
    AdminChanged {
        old_admin: previous,
        new_admin: new_admin.clone(),
    }
    .publish(e);
}
