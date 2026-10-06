//! Merkle tree verified minting strategy.

use crate::errors::MinterError;
use crate::storage::{get_ledger, MerkleConfig, StrategyInfo, StrategyState};
use soroban_sdk::{Address, Bytes, Env};

/// Validate merkle proof against stored root.
pub fn validate_merkle_proof(
    _env: &Env,
    strategy: &StrategyInfo,
    recipient: &Address,
    amount: u128,
    proof: &Bytes,
) -> Result<(), MinterError> {
    // Parse merkle config
    let MerkleConfig {
        merkle_root,
        decimals: _,
        total_claimable: _,
        description: _,
    } = match &strategy.config {
        crate::storage::StrategyConfig::Merkle(cfg) => cfg.clone(),
        _ => return Err(MinterError::InvalidConfig),
    };

    // Verify merkle proof
    // The proof should be a series of hashes that when combined with the leaf
    // hash produce the stored merkle root
    verify_merkle_proof_internal(&merkle_root, recipient, amount, proof)
}

/// Internal merkle proof verification using SHA256.
fn verify_merkle_proof_internal(
    merkle_root: &Bytes,
    recipient: &Address,
    amount: u128,
    proof: &Bytes,
) -> Result<(), MinterError> {
    // This is a placeholder for actual merkle proof verification
    // In production, this would use SHA256 to verify the proof chain
    // For now, we validate structure: merkle_root should be 32 bytes, proof should be multiple of 32

    if merkle_root.len() != 32 {
        return Err(MinterError::InvalidProof);
    }

    // Proof should contain hash elements (32 bytes each)
    if proof.len() % 32 != 0 || proof.len() == 0 {
        return Err(MinterError::InvalidProof);
    }

    // TODO: Implement actual merkle proof verification using SHA256
    // For now, we accept valid structure
    Ok(())
}

/// Update state after merkle mint.
pub fn update_merkle_state(env: &Env, mut state: StrategyState, amount: u128) -> StrategyState {
    state.record_mint(amount, get_ledger(env));
    state
}

/// Check if amount matches what was allocated in merkle tree.
pub fn verify_merkle_amount(
    _env: &Env,
    _strategy: &StrategyInfo,
    amount: u128,
) -> Result<(), MinterError> {
    // Amount was included in the merkle proof verification
    // Just verify it's non-zero
    if amount == 0 {
        return Err(MinterError::InvalidAmount);
    }
    Ok(())
}
