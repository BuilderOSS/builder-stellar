//! Batch minting strategy implementation.

use crate::errors::MinterError;
use crate::storage::{get_ledger, BatchCaps, BatchConfig, StrategyInfo, StrategyState};
use soroban_sdk::{Env, Vec};

/// Validate batch mint operation.
pub fn validate_batch_mint(
    env: &Env,
    strategy: &StrategyInfo,
    recipients_count: u32,
    amounts: &Vec<u128>,
) -> Result<(), MinterError> {
    // Check batch size
    if recipients_count == 0 || recipients_count > 100 {
        return Err(MinterError::InvalidBatchSize);
    }

    // Parse batch config
    let BatchConfig {
        max_recipients_per_tx,
        rate_limit_per_block: _,
        caps,
    } = match &strategy.config {
        crate::storage::StrategyConfig::Batch(cfg) => cfg.clone(),
        _ => return Err(MinterError::InvalidConfig),
    };

    // Check max recipients per tx
    if recipients_count > max_recipients_per_tx {
        return Err(MinterError::InvalidBatchSize);
    }

    // Validate amounts
    let mut total_amount = 0u128;
    for i in 0..amounts.len() {
        let amount = amounts.get(i).unwrap();
        if amount == 0 {
            return Err(MinterError::InvalidAmount);
        }
        total_amount = total_amount
            .checked_add(amount)
            .ok_or(MinterError::CapExceeded)?;
    }

    // Check global cap if present
    if let Some(BatchCaps { global_cap, .. }) = caps {
        if total_amount > global_cap {
            return Err(MinterError::CapExceeded);
        }
    }

    Ok(())
}

/// Validate individual mint within batch.
pub fn validate_batch_mint_item(
    _env: &Env,
    _strategy: &StrategyInfo,
    _amount: u128,
) -> Result<(), MinterError> {
    // Individual item validation for batch
    // Amount validation done at batch level
    Ok(())
}

/// Update state after batch mint.
pub fn update_batch_state(
    env: &Env,
    mut state: StrategyState,
    total_amount: u128,
) -> StrategyState {
    state.record_mint(total_amount, get_ledger(env));
    state
}
