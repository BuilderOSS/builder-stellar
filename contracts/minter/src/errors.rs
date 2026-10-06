//! Error types for the Minter contract.

use soroban_sdk::contracterror;

/// Error types returned by the Minter contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum MinterError {
    /// Authorization failed - caller is not authorized for this operation
    AuthFailed = 1,

    /// Token address not set - contract not properly initialized
    TokenNotSet = 2,

    /// Admin address not set - contract not properly initialized
    AdminNotSet = 3,

    /// Strategy not found - strategy_id does not exist
    StrategyNotFound = 4,

    /// Strategy paused - cannot mint with paused strategy
    StrategyPaused = 5,

    /// Invalid batch size - batch is empty or exceeds maximum
    InvalidBatchSize = 6,

    /// Cap exceeded - mint would exceed strategy cap
    CapExceeded = 7,

    /// Rate limit exceeded - too many mints in block
    RateLimitExceeded = 8,

    /// Invalid amount - amount is zero or invalid
    InvalidAmount = 9,

    /// Invalid configuration - strategy config is invalid
    InvalidConfig = 10,

    /// Merkle proof invalid - proof verification failed
    InvalidProof = 11,

    /// Already claimed - address already claimed from this strategy
    AlreadyClaimed = 12,

    /// Not in allowlist - address not in allowlist
    NotInAllowlist = 13,

    /// Amount mismatch - amount doesn't match allowlist or merkle amount
    AmountMismatch = 14,

    /// Contract not initialized - contract has not been initialized yet
    NotInitialized = 15,

    /// Cross-contract call failed - error calling token contract
    CrossContractFailed = 16,

    /// Strategy already exists - cannot register strategy with duplicate ID
    StrategyExists = 17,

    /// Invalid strategy type - unknown strategy type
    InvalidStrategyType = 18,

    /// Recipient list empty - recipients list is empty
    RecipientsEmpty = 19,

    /// Amounts mismatch - recipients and amounts lists different lengths
    AmountsMismatch = 20,
}
