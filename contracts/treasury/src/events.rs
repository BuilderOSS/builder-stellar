//! Event definitions and emission helpers for the Treasury contract.
//!
//! This module defines events for tracking treasury operations including:
//! - Contract initialization
//! - Governor address changes
//! - Proposal action executions

use soroban_sdk::{contractevent, Address, Symbol};

// Standard contract events

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryInitialized {
    #[topic]
    pub owner: Address,
    pub governor: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernorChanged {
    #[topic]
    pub old_governor: Address,
    #[topic]
    pub new_governor: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Execute {
    #[topic]
    pub governor: Address,
    #[topic]
    pub target: Address,
    pub function: Symbol,
}

// Event helper functions

use soroban_sdk::Env;

pub fn emit_treasury_initialized(e: &Env, owner: &Address, governor: &Address) {
    TreasuryInitialized {
        owner: owner.clone(),
        governor: governor.clone(),
    }
    .publish(e);
}

pub fn emit_governor_changed(e: &Env, old_governor: &Address, new_governor: &Address) {
    GovernorChanged {
        old_governor: old_governor.clone(),
        new_governor: new_governor.clone(),
    }
    .publish(e);
}

pub fn emit_execute(e: &Env, governor: &Address, target: &Address, function: &Symbol) {
    Execute {
        governor: governor.clone(),
        target: target.clone(),
        function: function.clone(),
    }
    .publish(e);
}
