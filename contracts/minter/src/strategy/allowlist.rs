//! Allowlist-based fixed amount minting strategy.

use crate::errors::MinterError;
use crate::storage::{get_ledger, AllowlistConfig, StrategyInfo, StrategyState};
use soroban_sdk::{Address, Env};

/// Validate allowlist mint.
pub fn validate_allowlist_mint(
    _env: &Env,
    strategy: &StrategyInfo,
    _recipient: &Address,
    amount: u128,
) -> Result<(), MinterError> {
    // Parse allowlist config
    let AllowlistConfig { amount_per_address } = match &strategy.config {
        crate::storage::StrategyConfig::Allowlist(cfg) => cfg.clone(),
        _ => return Err(MinterError::InvalidConfig),
    };

    // Verify amount matches allowlist amount
    if amount != amount_per_address {
        return Err(MinterError::AmountMismatch);
    }

    Ok(())
}

/// Update state after allowlist mint.
pub fn update_allowlist_state(env: &Env, mut state: StrategyState, amount: u128) -> StrategyState {
    state.record_mint(amount, get_ledger(env));
    state
}
