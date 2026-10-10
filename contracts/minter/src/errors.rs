//! Error types for the Minter contract.

use soroban_sdk::contracterror;

/// Minter errors (block `common::error::codes::MINTER`). Errors raised by the
/// token during a mint (for example `BatchTooLarge` or a missing mint
/// authority) propagate unchanged with the token's code.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum MinterError {
    /// Amount is zero or does not match the allowlist amount
    InvalidAmount = 7801,
    /// `token_id` is not a token contract
    InvalidTokenId = 7802,
    /// Batch is empty or has more recipients than `MAX_BATCH_RECIPIENTS`
    BatchTooLarge = 7803,
    /// No merkle root configured for this token
    MerkleRootNotSet = 7804,
    /// No allowlist configured for this token
    AllowlistNotSet = 7805,
    /// Address is not on the current allowlist
    NotInAllowlist = 7806,
    /// Address already claimed in this round
    AlreadyClaimed = 7807,
    /// Merkle proof verification failed
    MerkleProofInvalid = 7808,
    /// Input validation failed (mismatched lengths)
    InvalidInput = 7809,
    /// The token has not been launched yet, so setup-window minter
    /// configuration and claims are refused
    TokenNotLive = 7810,
}
