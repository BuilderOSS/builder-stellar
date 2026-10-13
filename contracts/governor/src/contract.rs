#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use core::convert::TryInto;

use soroban_sdk::{
    contract, contractimpl, panic_with_error, Address, BytesN, Env, String, Symbol, Val, Vec,
};
use stellar_governance::{
    governor::{
        self as governor, emit_proposal_cancelled, emit_proposal_created, emit_proposal_executed,
        emit_vote_cast, Governor, GovernorError, ProposalState,
    },
    votes::VotesClient,
};

use crate::error::CustomGovernorError;
use crate::events::{
    emit_governor_initialized, emit_launched, emit_proposal_commented, emit_proposal_queued,
    emit_proposal_scheduled, emit_proposal_threshold_changed, emit_queue_delay_changed,
    emit_quorum_bps_changed, emit_voting_delay_changed, emit_voting_period_changed,
};
use crate::storage::*;

/// The governor's `name()`.
pub const GOVERNOR_NAME: &str = "MvpDaoGovernor";

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
    /// Hands the admin to `treasury`, marks the module live, and emits
    /// `GovernorLaunched`. A second call panics with `AlreadyLive`.
    pub fn launch(e: &Env, treasury: Address) {
        let manager = Self::manager(e);
        manager.require_auth();
        common::lifecycle::mark_live(e);
        if treasury != Self::treasury(e) {
            panic_with_error!(e, CustomGovernorError::TreasuryMismatch);
        }
        common::admin::handoff_once(e, &treasury);
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury);
    }

    /// Manager-only early handoff (`manager.open_assurance`): the admin moves
    /// to the Treasury and the contract stays in Setup, so the governance
    /// settings are frozen until launch.
    pub fn handoff(e: &Env, treasury: Address) {
        Self::manager(e).require_auth();
        common::lifecycle::require_setup(e);
        if treasury != Self::treasury(e) {
            panic_with_error!(e, CustomGovernorError::TreasuryMismatch);
        }
        common::admin::handoff_once(e, &treasury);
        common::ttl::extend_instance(e);
    }

    /// Initializes the governor contract with governance parameters.
    ///
    /// Sets up all governance parameters including voting periods, quorum requirements,
    /// and associated contracts. All parameters are configurable post-deployment by
    /// authorized addresses.
    ///
    /// # Arguments
    ///
    /// * `admin` - Setup-phase admin (the launch admin); becomes the Treasury at launch
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
        admin: Address,
        token_contract: Address,
        treasury_contract: Address,
        voting_delay: u32,
        voting_period: u32,
        queue_delay: u32,
        proposal_threshold: u128,
        quorum_bps: u32,
        manager: Address,
        current_hash: BytesN<32>,
    ) {
        Self::validate_params(
            e,
            voting_delay,
            voting_period,
            queue_delay,
            proposal_threshold,
            quorum_bps,
        );

        common::admin::init(e, &admin);
        e.storage()
            .instance()
            .set(&common::ns(e, GovernorKey::Manager), &manager);
        common::upgrade::init(e, &current_hash, STORAGE_VERSION);

        governor::set_token_contract(e, &token_contract);
        governor::set_voting_delay(e, voting_delay);
        governor::set_voting_period(e, voting_period);
        e.storage()
            .instance()
            .set(&common::ns(e, GovernorKey::QueueDelay), &queue_delay);
        governor::set_proposal_threshold(e, proposal_threshold);
        governor::set_quorum(e, quorum_bps as u128);
        e.storage()
            .instance()
            .set(&common::ns(e, GovernorKey::Treasury), &treasury_contract);

        emit_governor_initialized(
            e,
            &admin,
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
        common::admin::require_admin(e);
        let manager = Self::manager(e);
        common::upgrade::apply(e, &manager, &from_hash, &to_hash);
    }

    /// Advance the storage layout after an upgrade (admin only).
    pub fn migrate(e: &Env) {
        common::admin::require_admin(e);
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    /// Storage-layout version of the data held by this contract.
    pub fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }

    /// Number of proposals ever created; ids have sequence numbers
    /// `0..proposal_count()`.
    pub fn proposal_count(e: &Env) -> u32 {
        Self::next_proposal_seq(e)
    }

    /// Ids of the proposals with sequence numbers `start..start + limit`, in
    /// creation order. `limit` is capped at `MAX_PROPOSAL_IDS_PAGE`; the page
    /// ends early at `proposal_count()`. An id entry archived after its
    /// proposal ended must be restored before it can be read.
    pub fn proposal_ids(e: &Env, start: u32, limit: u32) -> Vec<BytesN<32>> {
        let end = start
            .saturating_add(limit.min(MAX_PROPOSAL_IDS_PAGE))
            .min(Self::next_proposal_seq(e));
        let mut ids = Vec::new(e);
        let persistent = e.storage().persistent();
        for seq in start..end {
            if let Some(id) = persistent.get(&Self::proposal_id_key(e, seq)) {
                ids.push_back(id);
            }
        }
        ids
    }

    /// The proposal's stored window, eta and sequence number, and its state
    /// now. Panics `ProposalNotFound` for an unknown id.
    pub fn proposal(e: &Env, proposal_id: BytesN<32>) -> ProposalInfo {
        let core = Self::get_proposal(e, &proposal_id);
        let state = Self::proposal_state_internal(e, &proposal_id, &core);
        ProposalInfo {
            id: proposal_id,
            seq: core.seq,
            proposer: core.proposer,
            vote_snapshot: core.vote_snapshot,
            vote_start: core.vote_start,
            vote_end: core.vote_end,
            eta: core.eta,
            state,
            quorum: core.quorum,
        }
    }

    /// Module admin: the launch admin during setup, the Treasury once live.
    pub fn admin(e: &Env) -> Address {
        common::admin::admin(e)
    }

    fn manager(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&common::ns(e, GovernorKey::Manager))
            .unwrap_or_else(|| {
                soroban_sdk::panic_with_error!(e, common::CommonError::ManagerNotSet)
            })
    }

    pub fn set_queue_delay(e: &Env, queue_delay: u32) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_queue_delay(e, queue_delay);

        let old_value = Self::queue_delay(e);

        e.storage()
            .instance()
            .set(&common::ns(e, GovernorKey::QueueDelay), &queue_delay);

        emit_queue_delay_changed(e, &admin, old_value, queue_delay);
    }

    pub fn set_voting_delay(e: &Env, voting_delay: u32) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_voting_delay(e, voting_delay);

        let old_value = Self::voting_delay(e);
        governor::set_voting_delay(e, voting_delay);

        emit_voting_delay_changed(e, &admin, old_value, voting_delay);
    }

    pub fn set_voting_period(e: &Env, voting_period: u32) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_voting_period(e, voting_period);

        let old_value = Self::voting_period(e);
        governor::set_voting_period(e, voting_period);

        emit_voting_period_changed(e, &admin, old_value, voting_period);
    }

    pub fn set_proposal_threshold(e: &Env, proposal_threshold: u128) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_proposal_threshold(e, proposal_threshold);

        // A threshold above the voting supply would lock governance. Only
        // checked once votes exist (setup may configure before minting).
        let token = governor::get_token_contract(e);
        let total_supply = VotesClient::new(e, &token).get_total_supply();
        if total_supply > 0 && proposal_threshold > total_supply {
            panic_with_error!(e, CustomGovernorError::InvalidProposalThreshold);
        }

        let old_value = governor::get_proposal_threshold(e);
        governor::set_proposal_threshold(e, proposal_threshold);

        emit_proposal_threshold_changed(e, &admin, old_value, proposal_threshold);
    }

    pub fn set_quorum_bps(e: &Env, quorum_bps: u32) {
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_quorum_bps(e, quorum_bps);

        let old_value = Self::quorum_bps(e);
        governor::set_quorum(e, quorum_bps as u128);

        emit_quorum_bps_changed(e, &admin, old_value, quorum_bps);
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
            panic_with_error!(e, CustomGovernorError::ProposalNotReady);
        }

        proposal.state = ProposalState::Executed;
        Self::set_proposal(e, &proposal_id, &proposal);
        emit_proposal_executed(e, &proposal_id);

        proposal_id
    }

    /// Posts a comment on an existing proposal, in any state. Anyone may
    /// comment. Event-only: emits `ProposalCommented` and writes no storage.
    pub fn comment(e: &Env, proposal_id: BytesN<32>, body: String, author: Address) {
        author.require_auth();
        if !e
            .storage()
            .persistent()
            .has(&Self::proposal_key(e, &proposal_id))
        {
            panic_with_error!(e, GovernorError::ProposalNotFound);
        }
        if body.is_empty() {
            panic_with_error!(e, CustomGovernorError::CommentEmpty);
        }
        Self::check_comment_length(e, &body);
        emit_proposal_commented(e, &proposal_id, &author, &body);
    }

    pub fn treasury(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage()
                .instance()
                .get(&common::ns(e, GovernorKey::Treasury)),
            common::CommonError::TreasuryNotSet,
        )
    }

    fn queue_delay(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&common::ns(e, GovernorKey::QueueDelay))
            .unwrap_or(0)
    }

    pub fn quorum_bps(e: &Env) -> u32 {
        governor::get_quorum(e, e.ledger().sequence()) as u32
    }

    /// The quorum a proposal created now needs: `ceil(voting_supply *
    /// quorum_bps / 10_000)` from the voting supply **at the previous
    /// ledger** (the ledger votes are snapshotted at) and the current rate.
    /// Using this ledger's supply instead would let a holder escrow tokens
    /// in the Marketplace in the proposing ledger (lowering the supply) while
    /// still voting with them (contract review H1). Both reads touch only
    /// the latest checkpoints, never archived history.
    fn quorum_now(e: &Env) -> u128 {
        let token = governor::get_token_contract(e);
        let supply = common::clients::NftClient::new(e, &token).voting_supply_at_previous_ledger();
        Self::quorum_of(e, supply, Self::quorum_bps(e) as u128)
    }

    fn quorum_of(e: &Env, total_supply: u128, quorum_bps: u128) -> u128 {
        if quorum_bps == 0 || total_supply == 0 {
            return 0;
        }
        // Ceiling division: never less than the intended percentage.
        let Some(product) = total_supply.checked_mul(quorum_bps) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };
        let Some(adjusted) = product.checked_add(BPS_ROUNDING_ADJUSTMENT) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };
        adjusted / BPS_DENOMINATOR
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

    fn check_comment_length(e: &Env, body: &String) {
        if body.len() > common::MAX_PROPOSAL_COMMENT_LENGTH {
            panic_with_error!(e, CustomGovernorError::CommentTooLong);
        }
    }

    fn proposal_key(e: &Env, proposal_id: &BytesN<32>) -> (soroban_sdk::Symbol, GovernorKey) {
        common::ns(e, GovernorKey::ProposalTime(proposal_id.clone()))
    }

    fn proposal_id_key(e: &Env, seq: u32) -> (soroban_sdk::Symbol, GovernorKey) {
        common::ns(e, GovernorKey::ProposalId(seq))
    }

    /// Extends the TTL of a proposal and its `ProposalId(seq)` entry so
    /// neither expires before the proposal's lifecycle ends.
    fn extend_proposal_ttl(e: &Env, proposal_id: &BytesN<32>, seq: u32) {
        let persistent = e.storage().persistent();
        persistent.extend_ttl(
            &Self::proposal_key(e, proposal_id),
            PROPOSAL_TTL_THRESHOLD,
            PROPOSAL_TTL_EXTEND_TO,
        );
        persistent.extend_ttl(
            &Self::proposal_id_key(e, seq),
            PROPOSAL_TTL_THRESHOLD,
            PROPOSAL_TTL_EXTEND_TO,
        );
    }

    fn get_proposal(e: &Env, proposal_id: &BytesN<32>) -> ProposalCoreTime {
        let stored: StoredProposal = e
            .storage()
            .persistent()
            .get(&Self::proposal_key(e, proposal_id))
            .unwrap_or_else(|| panic_with_error!(e, GovernorError::ProposalNotFound));
        let proposal = ProposalCoreTime::unpack(e, &stored);

        // Extend TTL when proposal is accessed
        Self::extend_proposal_ttl(e, proposal_id, proposal.seq);

        proposal
    }

    fn set_proposal(e: &Env, proposal_id: &BytesN<32>, proposal: &ProposalCoreTime) {
        e.storage()
            .persistent()
            .set(&Self::proposal_key(e, proposal_id), &proposal.pack(e));

        // Extend TTL when proposal is updated
        Self::extend_proposal_ttl(e, proposal_id, proposal.seq);
    }

    /// Next proposal sequence number (= proposals created so far).
    fn next_proposal_seq(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&common::ns(e, GovernorKey::ProposalCount))
            .unwrap_or(0)
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

        let quorum = proposal.quorum;
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
impl Governor for DaoGovernorContract {
    /// A constant, not stored (D6): OZ would keep it in an instance entry.
    fn name(e: &Env) -> String {
        String::from_str(e, GOVERNOR_NAME)
    }

    /// The registry version of the running code (D6), as for every module.
    /// OZ would store it and need a sync after every upgrade.
    fn version(e: &Env) -> String {
        common::upgrade::version(e, &Self::manager(e))
    }

    fn voting_delay(e: &Env) -> u32 {
        governor::get_voting_delay(e)
    }

    fn voting_period(e: &Env) -> u32 {
        governor::get_voting_period(e)
    }

    /// For + Abstain votes a proposal snapshotted at `ledger` needs:
    /// `ceil(voting_supply(ledger) * quorum_bps / 10_000)`. The voting supply
    /// excludes tokens held by the Treasury, Auction and Marketplace (see the
    /// token), so system-held tokens never inflate the requirement.
    ///
    /// A view for any past ledger. Proposals do not use it: each stores the
    /// quorum it was created with. A lookup far in the past binary-searches
    /// supply and quorum checkpoints, which may have archived (only the
    /// latest of each is renewed by the DAO sweep); restore them to read.
    fn quorum(e: &Env, ledger: u32) -> u128 {
        let quorum_bps = governor::get_quorum(e, ledger);
        let token = governor::get_token_contract(e);
        let total_supply = VotesClient::new(e, &token).get_total_supply_at_checkpoint(&ledger);
        Self::quorum_of(e, total_supply, quorum_bps)
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

    fn proposal_proposer(e: &Env, proposal_id: BytesN<32>) -> Address {
        Self::get_proposal(e, &proposal_id).proposer
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
            .has(&Self::proposal_key(e, &proposal_id))
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

        let seq = Self::next_proposal_seq(e);
        let proposal = ProposalCoreTime {
            proposer: proposer.clone(),
            vote_snapshot: snapshot_ledger,
            vote_start, // No conversion needed - already u64
            vote_end,   // No conversion needed - already u64
            eta: 0,
            state: ProposalState::Pending,
            seq,
            quorum: Self::quorum_now(e),
        };

        // The id list entry first: set_proposal renews both.
        e.storage()
            .persistent()
            .set(&Self::proposal_id_key(e, seq), &proposal_id);
        Self::set_proposal(e, &proposal_id, &proposal);
        let Some(next) = seq.checked_add(1) else {
            panic_with_error!(e, GovernorError::MathOverflow);
        };
        e.storage()
            .instance()
            .set(&common::ns(e, GovernorKey::ProposalCount), &next);

        // OpenZeppelin's ProposalCreated documents `vote_end` as a ledger number; this governor
        // passes the unix-seconds deadline instead. Read the vote window from ProposalScheduled.
        // The u32 holds timestamps until 2106, which is accepted for this contract version.
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
        emit_proposal_scheduled(
            e,
            &proposal_id,
            proposal.vote_start,
            proposal.vote_end,
            proposal.vote_snapshot,
            proposal.quorum,
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
        Self::check_comment_length(e, &reason);

        let proposal = Self::get_proposal(e, &proposal_id);
        if Self::proposal_state_internal(e, &proposal_id, &proposal) != ProposalState::Active {
            panic_with_error!(e, GovernorError::ProposalNotActive);
        }

        let token = governor::get_token_contract(e);
        let voter_weight =
            VotesClient::new(e, &token).get_votes_at_checkpoint(&voter, &proposal.vote_snapshot);

        // Prevent voting with zero weight (spam/griefing protection)
        if voter_weight == 0 {
            panic_with_error!(e, CustomGovernorError::ZeroVotingWeight);
        }

        governor::count_vote(e, &proposal_id, &voter, vote_type, voter_weight);
        // OpenZeppelin writes the tally with only the network's minimum TTL,
        // so a long voting period could let it archive before `queue` reads
        // it. Give it the proposal's own lifetime (review S6). The entry
        // exists here: `count_vote` just wrote it. `HasVoted` stays the
        // voter's.
        e.storage().persistent().extend_ttl(
            &governor::storage::GovernorStorageKey::ProposalVote(proposal_id.clone()),
            PROPOSAL_TTL_THRESHOLD,
            PROPOSAL_TTL_EXTEND_TO,
        );
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
