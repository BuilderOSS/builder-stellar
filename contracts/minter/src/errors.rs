//! Error types for the Minter contract.

use soroban_sdk::contracterror;

/// Error types returned by the Minter contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum MinterError {
    /// Authorization failed - caller is not authorized for this operation
    Unauthorized = 1,

    /// Invalid amount - amount is zero or invalid
    InvalidAmount = 2,

    /// Invalid token ID - token contract does not exist or is invalid
    InvalidTokenId = 3,

    /// Batch too large - batch exceeds maximum recipients (100)
    BatchTooLarge = 4,

    /// Merkle root not set - no merkle root configured for this token
    MerkleRootNotSet = 5,

    /// Allowlist not set - no allowlist configured for this token
    AllowlistNotSet = 6,

    /// Not in allowlist - address is not in the allowlist
    NotInAllowlist = 7,

    /// Already claimed - address already claimed from this token
    AlreadyClaimed = 8,

    /// Merkle proof invalid - proof verification failed
    MerkleProofInvalid = 9,

    /// Invalid input - input validation failed
    InvalidInput = 10,

    /// Token contract error - error calling token contract
    TokenContractError = 11,

    /// Storage error - error accessing storage
    StorageError = 12,

    /// Token not live - the token has not been launched yet, so setup-window
    /// minter configuration and claims are refused
    TokenNotLive = 13,
}
