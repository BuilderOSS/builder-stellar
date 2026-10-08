#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use core::convert::TryInto;

use soroban_sdk::{
    contract, contractimpl, panic_with_error, Address, BytesN, Env, String, Symbol, Val, Vec,
};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_governance::{
    governor::{
        self as governor, emit_proposal_cancelled, emit_proposal_created, emit_proposal_executed,
        emit_vote_cast, Governor, GovernorError, ProposalState,
    },
    votes::VotesClient,
};
use stellar_macros::only_owner;

use crate::error::CustomGovernorError;
use crate::events::{
    emit_governor_initialized, emit_launched, emit_proposal_queued,
    emit_proposal_threshold_changed, emit_queue_delay_changed, emit_quorum_bps_changed,
    emit_voting_delay_changed, emit_voting_period_changed,
};
use crate::storage::*;

/// Main contract for DAO governance with timestamp-based voting.
///
/// This contract manages the complete proposal lifecycle from creation through execution,
/// using block timestamps for voting periods rather than ledger sequences. It integrates
/// with a Token contract for voting power and a Treasury contract for execution.
#[contract]
pub struct DaoGovernorContract;

#[contractimpl]
impl DaoGovernorContract {
    /// One-shot, Manager-only launch handoff (Setup -> Live).
    ///
    /// Sets the owner to `treasury`, clears any pending two-step ownership
    /// transfer, marks the module live, and emits `Launched`. A second call
    /// panics with `AlreadyLive`.
    pub fn launch(e: &Env, treasury: Address) {
        let manager = Self::manager(e);
        manager.require_auth();
        common::lifecycle::mark_live(e);
        if treasury != Self::treasury(e) {
            panic_with_error!(e, CustomGovernorError::TreasuryMismatch);
        }
        common::ownership::handoff_owner(e, &treasury);
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury);
    }

    /// Initializes the governor contract with governance parameters.
    ///
    /// Sets up all governance parameters including voting periods, quorum requirements,
    /// and associated contracts. All parameters are configurable post-deployment by
    /// authorized addresses.
    ///
    /// # Arguments
    ///
    /// * `owner` - The address that will own and control the contract
    /// * `token_contract` - The governance token contract (must implement Votes trait)
    /// * `treasury_contract` - The treasury contract that executes approved proposals
    /// * `voting_delay` - Delay in seconds between proposal creation and vote start
    /// * `voting_period` - Duration in seconds that voting remains open
    /// * `queue_delay` - Delay in seconds between approval and execution (minimum 5 minutes)
    /// * `proposal_threshold` - Minimum voting power required to create proposals
    /// * `quorum_bps` - Minimum participation in basis points (e.g., 2500 = 25%)
    ///
    /// # Panics
    ///
    /// Panics if `quorum_bps` exceeds `BPS_DENOMINATOR` (10,000).
    ///
    /// # Events
    ///
    /// Emits a `GovernorInitialized` event with all initialization parameters.
    pub fn __constructor(
        e: &Env,
        owner: Address,
        token_contract: Address,
        treasury_contract: Address,
        voting_delay: u32,
        voting_period: u32,
        queue_delay: u32,
        proposal_threshold: u128,
        quorum_bps: u32,
        manager: Address,
        current_hash: BytesN<32>,
        version: String,
    ) {
        Self::validate_params(
            e,
            voting_delay,
            voting_period,
            queue_delay,
            proposal_threshold,
            quorum_bps,
        );

        set_owner(e, &owner);
        e.storage().instance().set(&GovernorKey::Manager, &manager);
        common::upgrade::init(e, &current_hash, &version);

        let name = String::from_str(e, "MvpDaoGovernor");
        governor::set_name(e, name.clone());
        governor::set_version(e, version.clone());
        governor::set_token_contract(e, &token_contract);
        governor::set_voting_delay(e, voting_delay);
        governor::set_voting_period(e, voting_period);
        e.storage()
            .instance()
            .set(&GovernorKey::QueueDelay, &queue_delay);
        governor::set_proposal_threshold(e, proposal_threshold);
        governor::set_quorum(e, quorum_bps as u128);
        e.storage()
            .instance()
            .set(&GovernorKey::Treasury, &treasury_contract);

        emit_governor_initialized(
            e,
            &owner,
            &name,
            &version,
            &token_contract,
            &treasury_contract,
            voting_delay,
            voting_period,
            queue_delay,
            proposal_threshold,
            quorum_bps,
        );
    }

    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        let owner = common::error::require(
            e,
            stellar_access::ownable::get_owner(e),
            common::CommonError::OwnerNotSet,
        );
        owner.require_auth();
        let manager = Self::manager(e);
        common::upgrade::apply(e, &manager, &from_hash, &to_hash);
        governor::set_version(e, common::upgrade::version(e));
    }

    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    pub fn sync_version(e: &Env) {
        let owner = common::error::require(
            e,
            stellar_access::ownable::get_owner(e),
            common::CommonError::OwnerNotSet,
        );
        owner.require_auth();
        let manager = Self::manager(e);
        let version = common::upgrade::sync_version(e, &manager);
        governor::set_version(e, version);
    }

    fn manager(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&GovernorKey::Manager)
            .unwrap_or_else(|| {
                soroban_sdk::panic_with_error!(e, common::CommonError::ManagerNotSet)
            })
    }

    #[only_owner]
    pub fn set_queue_delay(e: &Env, queue_delay: u32) {
        common::ttl::extend_instance(e);
        Self::check_queue_delay(e, queue_delay);

        let old_value = Self::queue_delay(e);

        e.storage()
            .instance()
            .set(&GovernorKey::QueueDelay, &queue_delay);

        emit_queue_delay_changed(e, &Self::owner_addr(e), old_value, queue_delay);
    }

    #[only_owner]
    pub fn set_voting_delay(e: &Env, voting_delay: u32) {
        common::ttl::extend_instance(e);
        Self::check_voting_delay(e, voting_delay);

        let old_value = Self::voting_delay(e);
        governor::set_voting_delay(e, voting_delay);

        emit_voting_delay_changed(e, &Self::owner_addr(e), old_value, voting_delay);
    }

    #[only_owner]
    pub fn set_voting_period(e: &Env, voting_period: u32) {
        common::ttl::extend_instance(e);
        Self::check_voting_period(e, voting_period);

        let old_value = Self::voting_period(e);
        governor::set_voting_period(e, voting_period);

        emit_voting_period_changed(e, &Self::owner_addr(e), old_value, voting_period);
    }

    #[only_owner]
    pub fn set_proposal_threshold(e: &Env, proposal_threshold: u128) {
        common::ttl::extend_instance(e);
        Self::check_proposal_threshold(e, proposal_threshold);

        // Validate threshold doesn't exceed total supply (would lock governance)
        // Only check if tokens exist (total_supply > 0)
        let token = governor::get_token_contract(e);
        let total_supply = VotesClient::new(e, &token)
            .get_total_supply_at_checkpoint(&e.ledger().sequence().saturating_sub(1));
        if total_supply > 0 && proposal_threshold > total_supply {
            panic_with_error!(e, CustomGovernorError::InvalidProposalThreshold);
        }

        let old_value = governor::get_proposal_threshold(e);
        governor::set_proposal_threshold(e, proposal_threshold);

        emit_proposal_threshold_changed(e, &Self::owner_addr(e), old_value, proposal_threshold);
    }

    #[only_owner]
    pub fn set_quorum_bps(e: &Env, quorum_bps: u32) {
        common::ttl::extend_instance(e);
        Self::check_quorum_bps(e, quorum_bps);

        let old_value = Self::quorum_bps(e);
        governor::set_quorum(e, quorum_bps as u128);

        emit_quorum_bps_changed(e, &Self::owner_addr(e), old_value, quorum_bps);
    }

    /// Marks a Queued proposal Executed and returns its id. Only callable by
    /// the stored Treasury (`treasury.require_auth()`, satisfied when the
    /// Treasury calls via `authorize_as_current_contract`). Called from
    /// `treasury.execute`, which then dispatches the actions; if any of them
    /// fails the whole tx, including this state change, reverts.
    ///
    /// Storage: one persistent proposal write (TTL re-extended). Emits the
    /// existing `ProposalExecuted` event.
    pub fn consume(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
    ) -> BytesN<32> {
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        Self::treasury(e).require_auth();

        if targets.len() != functions.len() || targets.len() != args.len() {
            panic_with_error!(e, GovernorError::InvalidProposalLength);
        }

        let proposal_id =
            governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
        let mut proposal = Self::get_proposal(e, &proposal_id);

        match Self::proposal_state_internal(e, &proposal_id, &proposal) {
            ProposalState::Queued => {}
            ProposalState::Executed => panic_with_error!(e, GovernorError::ProposalAlreadyExecuted),
            _ => panic_with_error!(e, GovernorError::ProposalNotQueued),
        }

        if e.ledger().timestamp() < proposal.eta {
            panic_with_error!(e, GovernorError::ProposalNotQueued);
        }

        proposal.state = ProposalState::Executed;
        Self::set_proposal(e, &proposal_id, &proposal);
        emit_proposal_executed(e, &proposal_id);

        proposal_id
    }

    pub fn treasury(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage().instance().get(&GovernorKey::Treasury),
            common::CommonError::TreasuryNotSet,
        )
    }

    fn queue_delay(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&GovernorKey::QueueDelay)
            .unwrap_or(0)
    }

    pub fn quorum_bps(e: &Env) -> u32 {
        governor::get_quorum(e, e.ledger().sequence()) as u32
    }

    fn owner_addr(e: &Env) -> Address {
        common::error::require(
            e,
            stellar_access::ownable::get_owner(e),
            common::CommonError::OwnerNotSet,
        )
    }

    /// Single source of truth for governance parameter bounds. Used by the
    /// constructor (all params) and, through the `check_*` helpers it is built
    /// from, by every setter.
    fn validate_params(
        e: &Env,
        voting_delay: u32,
        voting_period: u32,
        queue_delay: u32,
        proposal_threshold: u128,
        quorum_bps: u32,
    ) {
        Self::check_voting_delay(e, voting_delay);
        Self::check_voting_period(e, voting_period);
        Self::check_queue_delay(e, queue_delay);
        Self::check_proposal_threshold(e, proposal_threshold);
        Self::check_quorum_bps(e, quorum_bps);
    }

    fn check_voting_delay(e: &Env, v: u32) {
        if v < MIN_VOTING_DELAY {
            panic_with_error!(e, CustomGovernorError::InvalidVotingDelay);
        }
        if v > MAX_VOTING_DELAY {
            panic_with_error!(e, CustomGovernorError::VotingDelayTooLong);
        }
    }

    fn check_voting_period(e: &Env, v: u32) {
        if v < MIN_VOTING_PERIOD {
            panic_with_error!(e, CustomGovernorError::InvalidVotingPeriod);
        }
        if v > MAX_VOTING_PERIOD {
            panic_with_error!(e, CustomGovernorError::VotingPeriodTooLong);
        }
    }

    fn check_queue_delay(e: &Env, v: u32) {
        if v < MIN_QUEUE_DELAY {
            panic_with_error!(e, CustomGovernorError::InvalidQueueDelay);
        }
        if v > MAX_QUEUE_DELAY {
            panic_with_error!(e, CustomGovernorError::QueueDelayTooLong);
        }
    }

    /// Zero would allow spam proposals.
    fn check_proposal_threshold(e: &Env, v: u128) {
        if v == 0 {
            panic_with_error!(e, CustomGovernorError::InvalidProposalThreshold);
        }
    }

    /// 1..=10000 basis points; zero quorum would let a single vote pass.
    fn check_quorum_bps(e: &Env, v: u32) {
        if v == 0 || v > BPS_DENOMINATOR as u32 {
            panic_with_error!(e, CustomGovernorError::InvalidQuorumBps);
        }
    }

    fn proposal_key(proposal_id: &BytesN<32>) -> GovernorKey {
        GovernorKey::Proposal(proposal_id.clone())
    }

    /// Extends the TTL of a proposal to ensure it doesn't expire before execution
    fn extend_proposal_ttl(e: &Env, proposal_id: &BytesN<32>) {
        let key = Self::proposal_key(proposal_id);
        e.storage().persistent().extend_ttl(
            &key,
            PROPOSAL_TTL_THRESHOLD,
            PROPOSAL_TTL_EXTEND_AMOUNT,
        );
    }

    fn get_proposal(e: &Env, proposal_id: &BytesN<32>) -> ProposalCoreTime {
        let proposal = e
            .storage()
            .persistent()
            .get(&Self::proposal_key(proposal_id))
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::ProposalNotFound));

        // Extend TTL when proposal is accessed
        Self::extend_proposal_ttl(e, proposal_id);

        proposal
    }

    fn set_proposal(e: &Env, proposal_id: &BytesN<32>, proposal: &ProposalCoreTime) {
        e.storage()
            .persistent()
            .set(&Self::proposal_key(proposal_id), proposal);

        // Extend TTL when proposal is updated
        Self::extend_proposal_ttl(e, proposal_id);
    }

    fn proposal_state_internal(
        e: &Env,
        proposal_id: &BytesN<32>,
        proposal: &ProposalCoreTime,
    ) -> ProposalState {
        match proposal.state {
            ProposalState::Queued => {
                // Check if queued proposal has expired (14 days after ETA)
                let now = e.ledger().timestamp();
                let Some(expiration_time) = proposal.eta.checked_add(PROPOSAL_EXPIRATION_PERIOD)
                else {
                    panic_with_error!(e, GovernorError::MathOverflow);
                };
                if now >= expiration_time {
                    return ProposalState::Expired;
                }
                return ProposalState::Queued;
            }
            ProposalState::Canceled | ProposalState::Executed | ProposalState::Expired => {
                return proposal.state;
            }
            _ => {}
        }

        let now = e.ledger().timestamp();
        let start = proposal.vote_start; // Already u64
        let end = proposal.vote_end; // Already u64

        if now < start {
            return ProposalState::Pending;
        }

        if now < end {
            return ProposalState::Active;
        }

        let quorum = Self::quorum(e, proposal.vote_snapshot);
        let counts = governor::get_proposal_vote_counts(e, proposal_id);
        let Some(participation) = counts.for_votes.checked_add(counts.abstain_votes) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };

        if participation >= quorum && counts.for_votes > counts.against_votes {
            // A Succeeded proposal that is never queued expires 14 days after
            // the vote ends (boundary: `now >= vote_end + period` is Expired).
            let Some(expiration_time) = end.checked_add(PROPOSAL_EXPIRATION_PERIOD) else {
                panic_with_error!(e, GovernorError::MathOverflow);
            };
            if now >= expiration_time {
                return ProposalState::Expired;
            }
            ProposalState::Succeeded
        } else {
            ProposalState::Defeated
        }
    }
}

#[contractimpl(contracttrait)]
impl Ownable for DaoGovernorContract {}

#[contractimpl(contracttrait)]
impl Governor for DaoGovernorContract {
    fn voting_delay(e: &Env) -> u32 {
        governor::get_voting_delay(e)
    }

    fn voting_period(e: &Env) -> u32 {
        governor::get_voting_period(e)
    }

    fn quorum(e: &Env, ledger: u32) -> u128 {
        let quorum_bps = governor::get_quorum(e, ledger);
        let token = governor::get_token_contract(e);
        let total_supply = VotesClient::new(e, &token).get_total_supply_at_checkpoint(&ledger);

        if quorum_bps == 0 || total_supply == 0 {
            return 0;
        }

        // Calculate quorum with ceiling division (rounds up)
        // Formula: (total_supply * quorum_bps + (BPS_DENOMINATOR - 1)) / BPS_DENOMINATOR
        // Example: 1% of 100 = (100 * 100 + 9999) / 10000 = 10999 / 10000 = 1 (rounds up)
        // This ensures we never require less than the intended quorum percentage
        let Some(product) = total_supply.checked_mul(quorum_bps) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };
        let Some(adjusted) = product.checked_add(BPS_ROUNDING_ADJUSTMENT) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };
        adjusted / BPS_DENOMINATOR
    }

    fn proposals_need_queuing(_e: &Env) -> bool {
        true
    }

    fn queue(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
        _eta: u32,
        _operator: Address,
    ) -> BytesN<32> {
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        let proposal_id =
            governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
        let mut proposal = Self::get_proposal(e, &proposal_id);

        match Self::proposal_state_internal(e, &proposal_id, &proposal) {
            ProposalState::Succeeded => {}
            ProposalState::Executed => panic_with_error!(e, GovernorError::ProposalAlreadyExecuted),
            ProposalState::Queued => panic_with_error!(e, GovernorError::ProposalNotSuccessful),
            _ => panic_with_error!(e, GovernorError::ProposalNotSuccessful),
        }

        let now = e.ledger().timestamp();
        let eta = now
            .checked_add(Self::queue_delay(e) as u64)
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::MathOverflow));

        proposal.eta = eta;
        proposal.state = ProposalState::Queued;
        Self::set_proposal(e, &proposal_id, &proposal);

        emit_proposal_queued(e, &proposal_id, eta);

        proposal_id
    }

    fn proposal_state(e: &Env, proposal_id: BytesN<32>) -> ProposalState {
        let proposal = Self::get_proposal(e, &proposal_id);
        Self::proposal_state_internal(e, &proposal_id, &proposal)
    }

    fn proposal_snapshot(e: &Env, proposal_id: BytesN<32>) -> u32 {
        Self::get_proposal(e, &proposal_id).vote_snapshot
    }

    fn proposal_deadline(e: &Env, proposal_id: BytesN<32>) -> u32 {
        // Convert u64 timestamp to u32 for trait compatibility
        // This is safe for practical purposes (works until year 2106)
        Self::get_proposal(e, &proposal_id)
            .vote_end
            .try_into()
            .unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow))
    }

    fn propose(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description: String,
        proposer: Address,
    ) -> BytesN<32> {
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        proposer.require_auth();

        let proposal_threshold = Self::proposal_threshold(e);
        let current_ledger = e.ledger().sequence();
        let snapshot_ledger = current_ledger.saturating_sub(1);
        let token = governor::get_token_contract(e);
        let proposer_votes =
            VotesClient::new(e, &token).get_votes_at_checkpoint(&proposer, &snapshot_ledger);
        if proposer_votes < proposal_threshold {
            panic_with_error!(e, GovernorError::InsufficientProposerVotes);
        }

        if targets.is_empty() {
            panic_with_error!(e, GovernorError::EmptyProposal);
        }
        if targets.len() > MAX_PROPOSAL_ACTIONS {
            panic_with_error!(e, CustomGovernorError::TooManyActions);
        }
        if targets.len() != functions.len() || targets.len() != args.len() {
            panic_with_error!(e, GovernorError::InvalidProposalLength);
        }
        if description.len() > governor::MAX_DESCRIPTION_LENGTH {
            panic_with_error!(e, GovernorError::DescriptionTooLong);
        }

        let description_hash = e.crypto().keccak256(&description.to_bytes()).to_bytes();
        let proposal_id =
            governor::hash_proposal(e, &targets, &functions, &args, &description_hash);

        if e.storage()
            .persistent()
            .has(&Self::proposal_key(&proposal_id))
        {
            panic_with_error!(e, GovernorError::ProposalAlreadyExists);
        }

        let now = e.ledger().timestamp();
        let vote_start = now
            .checked_add(Self::voting_delay(e) as u64)
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::MathOverflow));
        let vote_end = vote_start
            .checked_add(Self::voting_period(e) as u64)
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::MathOverflow));

        let proposal = ProposalCoreTime {
            proposer: proposer.clone(),
            vote_snapshot: snapshot_ledger,
            vote_start, // No conversion needed - already u64
            vote_end,   // No conversion needed - already u64
            eta: 0,
            state: ProposalState::Pending,
        };

        Self::set_proposal(e, &proposal_id, &proposal);

        let deadline = proposal
            .vote_end
            .try_into()
            .unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow));

        emit_proposal_created(
            e,
            &proposal_id,
            &proposer,
            &targets,
            &functions,
            &args,
            proposal.vote_snapshot,
            deadline,
            &description,
        );

        proposal_id
    }

    fn cast_vote(
        e: &Env,
        proposal_id: BytesN<32>,
        vote_type: u32,
        reason: String,
        voter: Address,
    ) -> u128 {
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        voter.require_auth();

        let proposal = Self::get_proposal(e, &proposal_id);
        if Self::proposal_state_internal(e, &proposal_id, &proposal) != ProposalState::Active {
            panic_with_error!(e, GovernorError::ProposalNotActive);
        }

        let token = governor::get_token_contract(e);
        let voter_weight =
            VotesClient::new(e, &token).get_votes_at_checkpoint(&voter, &proposal.vote_snapshot);

        // Prevent voting with zero weight (spam/griefing protection)
        if voter_weight == 0 {
            panic_with_error!(e, GovernorError::InsufficientProposerVotes);
        }

        governor::count_vote(e, &proposal_id, &voter, vote_type, voter_weight);
        emit_vote_cast(e, &voter, &proposal_id, vote_type, voter_weight, &reason);

        voter_weight
    }

    /// Always fails. Execution is driven by `treasury.execute`, which calls
    /// `consume` and then dispatches the actions with the Governor off the call
    /// stack (Soroban forbids re-entry). Kept only to satisfy the OZ trait.
    fn execute(
        e: &Env,
        _targets: Vec<Address>,
        _functions: Vec<Symbol>,
        _args: Vec<Vec<Val>>,
        _description_hash: BytesN<32>,
        _executor: Address,
    ) -> BytesN<32> {
        panic_with_error!(e, CustomGovernorError::UseTreasuryExecute)
    }

    fn cancel(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
        operator: Address,
    ) -> BytesN<32> {
        common::ttl::extend_instance(e);
        let proposal_id =
            governor::hash_proposal(e, &targets, &functions, &args, &description_hash);
        let mut proposal = Self::get_proposal(e, &proposal_id);

        if operator != proposal.proposer {
            panic_with_error!(e, GovernorError::ProposalNotCancellable);
        }
        operator.require_auth();

        match Self::proposal_state_internal(e, &proposal_id, &proposal) {
            ProposalState::Pending | ProposalState::Active => {}
            _ => panic_with_error!(e, GovernorError::ProposalNotCancellable),
        }

        proposal.state = ProposalState::Canceled;
        Self::set_proposal(e, &proposal_id, &proposal);
        emit_proposal_cancelled(e, &proposal_id);

        proposal_id
    }
}
