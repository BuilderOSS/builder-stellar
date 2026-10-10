//! Events published by the Treasury contract. Admin changes are
//! `common::admin::AdminChanged`.

use soroban_sdk::{contractevent, Address, BytesN, Env, String, Symbol};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryInitialized {
    #[topic]
    pub admin: Address,
    pub governor: Address,
    pub version: String,
}

/// Emitted once when the Manager launches the treasury (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryLaunched {
    #[topic]
    pub treasury: Address,
}

/// Emitted for every executed proposal action, including self calls and
/// `authorize` actions.
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

pub fn emit_treasury_initialized(e: &Env, admin: &Address, governor: &Address, version: &String) {
    TreasuryInitialized {
        admin: admin.clone(),
        governor: governor.clone(),
        version: version.clone(),
    }
    .publish(e);
}

pub fn emit_launched(e: &Env, treasury: &Address) {
    TreasuryLaunched {
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
