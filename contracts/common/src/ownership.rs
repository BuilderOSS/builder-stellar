//! One-shot owner handoff used by every module's `launch`.
//!
//! OpenZeppelin `Ownable` is a two-step transfer: `transfer_ownership` stores a
//! `PendingTransfer` in *temporary* storage under `OwnableStorageKey::PendingOwner`
//! and `accept_ownership` later promotes it. A launch admin could start such a
//! transfer during setup and accept it after launch. [`handoff_owner`] therefore
//! clears the pending entry together with overwriting the owner.

use soroban_sdk::{Address, Env};
use stellar_access::ownable::OwnableStorageKey;

/// Remove any in-flight two-step ownership transfer.
pub fn clear_pending_owner(e: &Env) {
    e.storage()
        .temporary()
        .remove(&OwnableStorageKey::PendingOwner);
}

/// Set the owner to `new_owner` and clear any pending two-step transfer.
pub fn handoff_owner(e: &Env, new_owner: &Address) {
    clear_pending_owner(e);
    e.storage()
        .instance()
        .set(&OwnableStorageKey::Owner, new_owner);
}
