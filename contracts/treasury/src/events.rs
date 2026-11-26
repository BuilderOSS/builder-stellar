//! Events published by the Treasury contract. Admin changes are
//! `common::admin::AdminChanged`.

use soroban_sdk::{contractevent, Address, BytesN, Env, Symbol};

/// Emitted once, by the constructor: the setup-phase admin and the Governor
/// whose proposals this Treasury executes (fixed).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryInitialized {
    #[topic]
    pub admin: Address,
    pub governor: Address,
}

/// Emitted once when the Manager launches the treasury (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryLaunched {
    #[topic]
    pub treasury: Address,
}

/// Emitted by `execute` after each proposal action runs, including self
/// calls and `authorize` actions, in order. All of a proposal's `Execute`
/// events share one transaction with the Governor's `ProposalExecuted`; if
/// any action fails, none of them is published.
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

/// Publishes `TreasuryInitialized` from the constructor.
pub fn emit_treasury_initialized(e: &Env, admin: &Address, governor: &Address) {
    TreasuryInitialized {
        admin: admin.clone(),
        governor: governor.clone(),
    }
    .publish(e);
}

/// Publishes `TreasuryLaunched` once, from the Manager's `launch`.
pub fn emit_launched(e: &Env, treasury: &Address) {
    TreasuryLaunched {
        treasury: treasury.clone(),
    }
    .publish(e);
}

/// Publishes `Execute` after each action `execute` runs, `authorize` actions
/// included, with its position in the proposal.
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
