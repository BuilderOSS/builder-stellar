//! Event definitions and emission helpers for the Minter contract.

use soroban_sdk::{contractevent, Address, Env, String};

/// Emitted when tokens are minted via a strategy.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintEvent {
    #[topic]
    pub strategy_id: u32,
    #[topic]
    pub recipient: Address,
    pub amount: u128,
}

/// Emitted when a batch mint operation completes.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchMintEvent {
    #[topic]
    pub strategy_id: u32,
    pub recipient_count: u32,
    pub total_amount: u128,
}

/// Emitted when a strategy is registered.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StrategyRegistered {
    #[topic]
    pub strategy_id: u32,
    pub name: String,
}

/// Emitted when a strategy is paused.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StrategyPaused {
    #[topic]
    pub strategy_id: u32,
}

/// Emitted when a strategy is resumed.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StrategyResumed {
    #[topic]
    pub strategy_id: u32,
}

/// Emitted when a strategy is updated.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StrategyUpdated {
    #[topic]
    pub strategy_id: u32,
}

/// Emitted when admin is transferred.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminTransferred {
    #[topic]
    pub old_admin: Address,
    #[topic]
    pub new_admin: Address,
}

/// Emitted when token address is updated.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenUpdated {
    #[topic]
    pub old_token: Address,
    #[topic]
    pub new_token: Address,
}

/// Emit a mint event.
pub fn emit_mint(env: &Env, strategy_id: u32, recipient: &Address, amount: u128) {
    MintEvent {
        strategy_id,
        recipient: recipient.clone(),
        amount,
    }
    .publish(env);
}

/// Emit a batch mint event.
pub fn emit_batch_mint(env: &Env, strategy_id: u32, count: u32, total_amount: u128) {
    BatchMintEvent {
        strategy_id,
        recipient_count: count,
        total_amount,
    }
    .publish(env);
}

/// Emit a strategy registered event.
pub fn emit_strategy_registered(env: &Env, strategy_id: u32, name: &String) {
    StrategyRegistered {
        strategy_id,
        name: name.clone(),
    }
    .publish(env);
}

/// Emit a strategy paused event.
pub fn emit_strategy_paused(env: &Env, strategy_id: u32) {
    StrategyPaused { strategy_id }.publish(env);
}

/// Emit a strategy resumed event.
pub fn emit_strategy_resumed(env: &Env, strategy_id: u32) {
    StrategyResumed { strategy_id }.publish(env);
}

/// Emit a strategy updated event.
pub fn emit_strategy_updated(env: &Env, strategy_id: u32) {
    StrategyUpdated { strategy_id }.publish(env);
}

/// Emit an admin transferred event.
pub fn emit_admin_transferred(env: &Env, old_admin: &Address, new_admin: &Address) {
    AdminTransferred {
        old_admin: old_admin.clone(),
        new_admin: new_admin.clone(),
    }
    .publish(env);
}

/// Emit a token updated event.
pub fn emit_token_updated(env: &Env, old_token: &Address, new_token: &Address) {
    TokenUpdated {
        old_token: old_token.clone(),
        new_token: new_token.clone(),
    }
    .publish(env);
}
