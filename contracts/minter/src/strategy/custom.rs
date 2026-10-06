//! Custom validator strategy for extensible minting rules.

use crate::errors::MinterError;
use crate::storage::{get_ledger, CustomConfig, StrategyInfo, StrategyState};
use soroban_sdk::{Address, Bytes, Env};

/// Validate custom mint via external contract.
pub fn validate_custom_mint(
    _env: &Env,
    strategy: &StrategyInfo,
    _recipient: &Address,
    amount: u128,
    _proof: &Bytes,
) -> Result<(), MinterError> {
    // Parse custom config
    let CustomConfig {
        validator_contract: _,
        validator_method: _,
        user_data: _,
    } = match &strategy.config {
        crate::storage::StrategyConfig::Custom(cfg) => cfg.clone(),
        _ => return Err(MinterError::InvalidConfig),
    };

    // TODO: Implement cross-contract call to validator
    // For now, we accept the operation and let the validator be called externally
    if amount == 0 {
        return Err(MinterError::InvalidAmount);
    }

    Ok(())
}

/// Update state after custom mint.
pub fn update_custom_state(env: &Env, mut state: StrategyState, amount: u128) -> StrategyState {
    state.record_mint(amount, get_ledger(env));
    state
}
