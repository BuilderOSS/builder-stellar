//! Storage keys for the Treasury contract.
//!
//! The Treasury has minimal storage requirements - it only needs to track
//! the authorized Governor contract. Ownership is managed via the Ownable
//! trait's storage keys.

use soroban_sdk::contracttype;

/// Storage keys for treasury-specific instance data.
///
/// The Treasury maintains minimal state, storing only the Governor address.
/// All other data (ownership) is managed by the Ownable trait.
#[contracttype]
pub enum TreasuryKey {
    /// Address of the Governor contract authorized to execute proposals.
    ///
    /// Only this contract can invoke the `execute()` function. The owner
    /// can update this address if needed.
    Governor,
}
