//! Event definitions and emission helpers for the Treasury contract.
//!
//! This module defines events for tracking treasury operations including:
//! - Contract initialization
//! - Launch (Setup -> Live)
//! - Proposal action executions

use soroban_sdk::{contractevent, Address, BytesN, String, Symbol};

// Standard contract events

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryInitialized {
    #[topic]
    pub owner: Address,
    pub governor: Address,
    pub version: String,
}

/// Emitted once when the Manager launches the treasury (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Launched {
    #[topic]
    pub treasury: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Execute {
    #[topic]
    pub governor: Address,
    #[topic]
    pub target: Address,
    #[topic]
    pub proposal_id: BytesN<32>,
    pub function: Symbol,
    /// Position of the call within the proposal.
    pub index: u32,
}

// Event helper functions

use soroban_sdk::Env;

pub fn emit_treasury_initialized(e: &Env, owner: &Address, governor: &Address, version: &String) {
    TreasuryInitialized {
        owner: owner.clone(),
        governor: governor.clone(),
        version: version.clone(),
    }
    .publish(e);
}

pub fn emit_launched(e: &Env, treasury: &Address) {
    Launched {
        treasury: treasury.clone(),
    }
    .publish(e);
}

pub fn emit_execute(
    e: &Env,
    governor: &Address,
    target: &Address,
    function: &Symbol,
    proposal_id: &BytesN<32>,
    index: u32,
) {
    Execute {
        governor: governor.clone(),
        target: target.clone(),
        proposal_id: proposal_id.clone(),
        function: function.clone(),
        index,
    }
    .publish(e);
}
