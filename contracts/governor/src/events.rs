//! Event definitions and emission helpers for the Governor contract.
//!
//! This module defines events for tracking the complete governance lifecycle including:
//! - Contract initialization and parameter changes
//! - Proposal creation, voting, queueing, and execution
//!
//! Many core governance events (ProposalCreated, VoteCast, etc.) are emitted by the
//! stellar_governance library. Custom events here supplement those with additional
//! metadata specific to this implementation (timestamp-based voting, detailed execution tracking).

use soroban_sdk::{contractevent, Address};

// Standard contract events

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernorInitialized {
    #[topic]
    pub owner: Address,
    pub token_contract: Address,
    pub treasury_contract: Address,
    pub voting_delay: u32,
    pub voting_period: u32,
    pub queue_delay: u32,
    pub proposal_threshold: u128,
    pub quorum_bps: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalQueued {
    #[topic]
    pub proposal_id: BytesN<32>,
    pub eta: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryChanged {
    #[topic]
    pub old_treasury: Address,
    #[topic]
    pub new_treasury: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenContractChanged {
    #[topic]
    pub old_token_contract: Address,
    #[topic]
    pub new_token_contract: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueueDelayChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VotingDelayChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VotingPeriodChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalThresholdChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u128,
    pub new_value: u128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuorumBpsChanged {
    #[topic]
    pub caller: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernorAuthorityChanged {
    #[topic]
    pub authority: Address,
    pub old_enabled: bool,
    pub enabled: bool,
}

// Event helper functions

use soroban_sdk::{BytesN, Env, String};

pub fn emit_governor_initialized(
    e: &Env,
    owner: &Address,
    #[allow(unused_variables)] name: &String,
    #[allow(unused_variables)] version: &String,
    token_contract: &Address,
    treasury_contract: &Address,
    voting_delay: u32,
    voting_period: u32,
    queue_delay: u32,
    proposal_threshold: u128,
    quorum_bps: u32,
) {
    GovernorInitialized {
        owner: owner.clone(),
        token_contract: token_contract.clone(),
        treasury_contract: treasury_contract.clone(),
        voting_delay,
        voting_period,
        queue_delay,
        proposal_threshold,
        quorum_bps,
    }
    .publish(e);
}

pub fn emit_treasury_changed(e: &Env, old_treasury: &Address, new_treasury: &Address) {
    TreasuryChanged {
        old_treasury: old_treasury.clone(),
        new_treasury: new_treasury.clone(),
    }
    .publish(e);
}

pub fn emit_token_contract_changed(
    e: &Env,
    old_token_contract: &Address,
    new_token_contract: &Address,
) {
    TokenContractChanged {
        old_token_contract: old_token_contract.clone(),
        new_token_contract: new_token_contract.clone(),
    }
    .publish(e);
}

pub fn emit_queue_delay_changed(e: &Env, caller: &Address, old_value: u32, new_value: u32) {
    QueueDelayChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);
}

pub fn emit_voting_delay_changed(e: &Env, caller: &Address, old_value: u32, new_value: u32) {
    VotingDelayChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);
}

pub fn emit_voting_period_changed(e: &Env, caller: &Address, old_value: u32, new_value: u32) {
    VotingPeriodChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);
}

pub fn emit_proposal_threshold_changed(
    e: &Env,
    caller: &Address,
    old_value: u128,
    new_value: u128,
) {
    ProposalThresholdChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);
}

pub fn emit_quorum_bps_changed(e: &Env, caller: &Address, old_value: u32, new_value: u32) {
    QuorumBpsChanged {
        caller: caller.clone(),
        old_value,
        new_value,
    }
    .publish(e);
}

pub fn emit_governor_authority_changed(
    e: &Env,
    authority: &Address,
    old_enabled: bool,
    enabled: bool,
) {
    GovernorAuthorityChanged {
        authority: authority.clone(),
        old_enabled,
        enabled,
    }
    .publish(e);
}

pub fn emit_proposal_queued(e: &Env, proposal_id: &BytesN<32>, eta: u64) {
    ProposalQueued {
        proposal_id: proposal_id.clone(),
        eta,
    }
    .publish(e);
}
