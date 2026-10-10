#![allow(clippy::too_many_arguments)] // emit helpers mirror the event fields 1:1

//! Events published by the Governor contract.
//!
//! OpenZeppelin's governor library emits the core lifecycle events
//! (`ProposalCreated`, `VoteCast`, `ProposalExecuted`, `ProposalCancelled`).
//! The events below add initialization, parameter changes, queueing, the
//! launch handoff and `ProposalScheduled`, which carries everything an indexer
//! needs to compute a proposal's state without guessing (vote window, snapshot
//! and the quorum fixed at proposal time). Admin changes are
//! `common::admin::AdminChanged`.

use soroban_sdk::{contractevent, Address, BytesN, Env, String};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernorInitialized {
    #[topic]
    pub admin: Address,
    pub token_contract: Address,
    pub treasury_contract: Address,
    pub voting_delay: u32,
    pub voting_period: u32,
    pub queue_delay: u32,
    pub proposal_threshold: u128,
    pub quorum_bps: u32,
    pub version: String,
}

/// Emitted by `propose` next to OpenZeppelin's `ProposalCreated`.
///
/// `vote_start` / `vote_end` are unix timestamps (seconds); `snapshot_ledger`
/// is the ledger voting power and voting supply are read at; `quorum_votes` is
/// the For + Abstain total the proposal needs. Quorum is fully determined at
/// proposal time because the snapshot precedes the proposal.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalScheduled {
    #[topic]
    pub proposal_id: BytesN<32>,
    pub vote_start: u64,
    pub vote_end: u64,
    pub snapshot_ledger: u32,
    pub quorum_votes: u128,
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
pub struct QueueDelayChanged {
    #[topic]
    pub changed_by: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VotingDelayChanged {
    #[topic]
    pub changed_by: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VotingPeriodChanged {
    #[topic]
    pub changed_by: Address,
    pub old_value: u32,
    pub new_value: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalThresholdChanged {
    #[topic]
    pub changed_by: Address,
    pub old_value: u128,
    pub new_value: u128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuorumBpsChanged {
    #[topic]
    pub changed_by: Address,
    pub old_value: u32,
    pub new_value: u32,
}

/// Emitted once when the Manager launches the governor (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernorLaunched {
    #[topic]
    pub treasury: Address,
}

pub fn emit_governor_initialized(
    e: &Env,
    admin: &Address,
    version: &String,
    token_contract: &Address,
    treasury_contract: &Address,
    voting_delay: u32,
    voting_period: u32,
    queue_delay: u32,
    proposal_threshold: u128,
    quorum_bps: u32,
) {
    GovernorInitialized {
        admin: admin.clone(),
        token_contract: token_contract.clone(),
        treasury_contract: treasury_contract.clone(),
        voting_delay,
        voting_period,
        queue_delay,
        proposal_threshold,
        quorum_bps,
        version: version.clone(),
    }
    .publish(e);
}

pub fn emit_proposal_scheduled(
    e: &Env,
    proposal_id: &BytesN<32>,
    vote_start: u64,
    vote_end: u64,
    snapshot_ledger: u32,
    quorum_votes: u128,
) {
    ProposalScheduled {
        proposal_id: proposal_id.clone(),
        vote_start,
        vote_end,
        snapshot_ledger,
        quorum_votes,
    }
    .publish(e);
}

pub fn emit_queue_delay_changed(e: &Env, changed_by: &Address, old_value: u32, new_value: u32) {
    QueueDelayChanged {
        changed_by: changed_by.clone(),
        old_value,
        new_value,
    }
    .publish(e);
}

pub fn emit_voting_delay_changed(e: &Env, changed_by: &Address, old_value: u32, new_value: u32) {
    VotingDelayChanged {
        changed_by: changed_by.clone(),
        old_value,
        new_value,
    }
    .publish(e);
}

pub fn emit_voting_period_changed(e: &Env, changed_by: &Address, old_value: u32, new_value: u32) {
    VotingPeriodChanged {
        changed_by: changed_by.clone(),
        old_value,
        new_value,
    }
    .publish(e);
}

pub fn emit_proposal_threshold_changed(
    e: &Env,
    changed_by: &Address,
    old_value: u128,
    new_value: u128,
) {
    ProposalThresholdChanged {
        changed_by: changed_by.clone(),
        old_value,
        new_value,
    }
    .publish(e);
}

pub fn emit_quorum_bps_changed(e: &Env, changed_by: &Address, old_value: u32, new_value: u32) {
    QuorumBpsChanged {
        changed_by: changed_by.clone(),
        old_value,
        new_value,
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

pub fn emit_launched(e: &Env, treasury: &Address) {
    GovernorLaunched {
        treasury: treasury.clone(),
    }
    .publish(e);
}
