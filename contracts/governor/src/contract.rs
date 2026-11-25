#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use core::convert::TryInto;

use soroban_sdk::{
    contract, contractimpl, panic_with_error, Address, BytesN, Env, String, Symbol, TryFromVal,
    Val, Vec,
};
use stellar_governance::governor::{
    self as governor, emit_proposal_cancelled, emit_proposal_created, emit_proposal_executed,
    emit_vote_cast, Governor, GovernorError, ProposalState,
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
    /// `GovernorLaunched`. A second call panics with `AlreadyLive`;
    /// `treasury` must be the Treasury wired at construction
    /// (`TreasuryMismatch`). Proposals can be made only after this.
    pub fn launch(e: &Env, treasury: Address) {
        Self::require_current_layout(e);
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
    /// settings are frozen until launch. `treasury` must be the Treasury
    /// wired at construction (`TreasuryMismatch`); fails `AlreadyLive` once
    /// launched.
    pub fn handoff(e: &Env, treasury: Address) {
        Self::require_current_layout(e);
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
    /// * `token_contract` - The vote source: the DAO's Token, or an approved
    ///   adapter implementing `common::clients::VoteSourceApi`. Permanent.
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

    /// Replaces this Governor's code with `to_hash`. Admin only: the launch
    /// admin during setup, the Treasury (a passed proposal) once live.
    ///
    /// `from_hash` must be the running code's hash and the Manager must
    /// approve `from_hash -> to_hash` (`common::upgrade::apply`). Data is not
    /// touched; if the new code expects a newer layout, call `migrate` next
    /// (the same proposal may do it, as its next action; if that `migrate`
    /// fails, the whole proposal reverts and the old code stays). Not behind
    /// the storage-layout gate. Once live it is reached through a proposal;
    /// while a migration is due, a recovery proposal (only `upgrade` and
    /// `migrate` calls on this Governor or its Treasury) still runs, so a
    /// release whose migration fails can be replaced by fixed code.
    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        common::admin::require_admin(e);
        let manager = Self::manager(e);
        common::upgrade::apply(e, &manager, &from_hash, &to_hash);
    }

    /// Moves the stored data to the layout this code expects (`STORAGE_VERSION`)
    /// and emits `Migrated`. Fails `NothingToMigrate` unless the stored layout
    /// is older than the code's.
    ///
    /// Anyone may call it. It runs only the migration that the installed code
    /// defines, which the Manager approved and the module admin installed, and
    /// only once per layout. It stays open so that a migration that is due
    /// never waits for a proposal: until it runs, the Governor accepts only
    /// recovery proposals (`StorageVersionMismatch` for any other).
    pub fn migrate(e: &Env) {
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    /// WASM hash of the running code, as recorded by the last `upgrade`.
    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    /// Storage-layout version of the data held by this contract. While it
    /// differs from the code's `STORAGE_VERSION`, every gated entry point
    /// fails `StorageVersionMismatch` until `migrate` brings the two back in
    /// step (or, during setup only, the launch admin upgrades again).
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

    /// Sets the delay between `queue` and the earliest `treasury.execute`
    /// (seconds, `MIN_QUEUE_DELAY..=MAX_QUEUE_DELAY`). Admin only: the launch
    /// admin during setup, a passed proposal once live. Applies to proposals
    /// queued after the change. Emits `QueueDelayChanged`.
    pub fn set_queue_delay(e: &Env, queue_delay: u32) {
        Self::require_current_layout(e);
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_queue_delay(e, queue_delay);

        let old_value = Self::queue_delay(e);

        e.storage()
            .instance()
            .set(&common::ns(e, GovernorKey::QueueDelay), &queue_delay);

        emit_queue_delay_changed(e, &admin, old_value, queue_delay);
    }

    /// Sets the notice period between `propose` and the start of voting
    /// (seconds, `MIN_VOTING_DELAY..=MAX_VOTING_DELAY`). Admin only. Applies
    /// to proposals made after the change. Emits `VotingDelayChanged`.
    pub fn set_voting_delay(e: &Env, voting_delay: u32) {
        Self::require_current_layout(e);
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_voting_delay(e, voting_delay);

        let old_value = Self::voting_delay(e);
        governor::set_voting_delay(e, voting_delay);

        emit_voting_delay_changed(e, &admin, old_value, voting_delay);
    }

    /// Sets how long voting stays open (seconds,
    /// `MIN_VOTING_PERIOD..=MAX_VOTING_PERIOD`). Admin only. Applies to
    /// proposals made after the change. Emits `VotingPeriodChanged`.
    pub fn set_voting_period(e: &Env, voting_period: u32) {
        Self::require_current_layout(e);
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_voting_period(e, voting_period);

        let old_value = Self::voting_period(e);
        governor::set_voting_period(e, voting_period);

        emit_voting_period_changed(e, &admin, old_value, voting_period);
    }

    /// Sets the votes a proposer needs (nonzero, and not above the voting
    /// supply once there is one). Admin only. `propose` caps it at the voting
    /// supply (`votes_needed_to_propose`). Emits `ProposalThresholdChanged`.
    pub fn set_proposal_threshold(e: &Env, proposal_threshold: u128) {
        Self::require_current_layout(e);
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_proposal_threshold(e, proposal_threshold);

        // A threshold above the voting supply would lock governance. Only
        // checked once votes exist (setup may configure before minting).
        let total_supply = Self::votes(e).get_total_supply();
        if total_supply > 0 && proposal_threshold > total_supply {
            panic_with_error!(e, CustomGovernorError::InvalidProposalThreshold);
        }

        let old_value = governor::get_proposal_threshold(e);
        governor::set_proposal_threshold(e, proposal_threshold);

        emit_proposal_threshold_changed(e, &admin, old_value, proposal_threshold);
    }

    /// Sets the quorum as basis points of the voting supply (1..=10,000).
    /// Admin only. Each proposal keeps the quorum fixed when it was made.
    /// Emits `QuorumBpsChanged`.
    pub fn set_quorum_bps(e: &Env, quorum_bps: u32) {
        Self::require_current_layout(e);
        let admin = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::check_quorum_bps(e, quorum_bps);

        let old_value = Self::quorum_bps(e);
        governor::set_quorum(e, quorum_bps as u128);

        emit_quorum_bps_changed(e, &admin, old_value, quorum_bps);
    }

    /// Marks a Queued proposal Executed and returns its id. Only callable by
    /// the stored Treasury (`treasury.require_auth()`, satisfied when the
    /// Treasury is the direct invoker). Called from `treasury.execute`, which
    /// then dispatches the actions; if any of them fails the whole tx,
    /// including this state change, reverts.
    ///
    /// The proposal must be Queued, unexpired and past its ETA
    /// (`ProposalNotQueued`, `ProposalAlreadyExecuted`, `ProposalNotReady`).
    /// A proposal can never reach this through one of its own actions:
    /// `propose` refuses an action aimed at `consume` (`CannotConsume`) and
    /// the Treasury refuses to dispatch or authorize one, so `ProposalExecuted`
    /// is emitted only by the `treasury.execute` that runs the actions.
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
        Self::require_current_layout_or_recovery(e, &targets, &functions);
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
        Self::set_proposal(e, &proposal_id, &proposal, PROPOSAL_TTL_THRESHOLD);
        emit_proposal_executed(e, &proposal_id);

        proposal_id
    }

    /// Posts a comment on an existing proposal, in any state. Anyone may
    /// comment. Event-only: emits `ProposalCommented` and writes no storage.
    pub fn comment(e: &Env, proposal_id: BytesN<32>, body: String, author: Address) {
        Self::require_current_layout(e);
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

    /// The Treasury wired at construction: the only caller `consume`
    /// accepts, and the admin once live. Fixed for the Governor's life.
    pub fn treasury(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage()
                .instance()
                .get(&common::ns(e, GovernorKey::Treasury)),
            common::CommonError::TreasuryNotSet,
        )
    }

    /// The votes a proposal made now needs: `proposal_threshold`, capped at
    /// the voting supply at the previous ledger and never below 1 (the rule
    /// `propose` applies). Front ends read this rather than recomputing it,
    /// so a Governor without the cap (which lacks this view) is told apart.
    pub fn votes_needed_to_propose(e: &Env) -> u128 {
        let voting_supply = Self::votes(e).voting_supply_at_previous_ledger();
        Self::threshold_for_supply(e, voting_supply)
    }

    /// Where this Governor's voting power comes from: the DAO's Token, or an
    /// adapter the Manager approved when the DAO was created. Fixed for the
    /// Governor's life (OZ's token-contract slot is set once).
    ///
    /// Stored in OpenZeppelin's token-contract slot, so OZ's
    /// `get_token_contract()` returns the same address; for an adapter DAO it
    /// is the adapter, not the membership NFT (find that through the Treasury
    /// or the Manager).
    pub fn vote_source(e: &Env) -> Address {
        governor::get_token_contract(e)
    }

    fn votes(e: &Env) -> common::clients::VoteSourceClient<'_> {
        common::clients::VoteSourceClient::new(e, &governor::get_token_contract(e))
    }

    fn queue_delay(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&common::ns(e, GovernorKey::QueueDelay))
            .unwrap_or(0)
    }

    /// The quorum rate new proposals use, in basis points of the voting
    /// supply. A proposal keeps the quorum fixed when it was made (`proposal`).
    pub fn quorum_bps(e: &Env) -> u32 {
        governor::get_quorum(e, e.ledger().sequence()) as u32
    }

    /// Panics `StorageVersionMismatch` unless the stored data layout is the
    /// one this code expects. The state-changing entry points that a recovery
    /// proposal does not need (`launch`, `handoff`, the setters, `comment`,
    /// `cancel`) call it first, so this code never writes data in a layout it
    /// does not know (after an upgrade whose `migrate` has not run yet, or an
    /// upgrade to older code). `propose`, `queue` and `consume` use
    /// `require_current_layout_or_recovery`, and `cast_vote` accepts only
    /// recovery proposals while a migration is due. `upgrade`, `migrate`, and
    /// the views stay outside the gate.
    fn require_current_layout(e: &Env) {
        if !common::upgrade::is_current_layout(e, STORAGE_VERSION) {
            panic_with_error!(e, CustomGovernorError::StorageVersionMismatch);
        }
    }

    /// The gate for `propose`, `queue` and `consume`: passes when the layout
    /// is current, and otherwise only for a recovery proposal (see
    /// `is_recovery`), so that a DAO whose migration fails can still upgrade
    /// to fixed code. Returns whether a migration is due.
    ///
    /// The recovery path relies on the storage a release must keep readable
    /// by both its code and the code before it: the proposal records
    /// (`ProposalTime`, `ProposalId`, `ProposalCount`, `RecoveryProposal`),
    /// the settings (`Treasury`, `Manager`, `QueueDelay` and OpenZeppelin's
    /// voting settings, quorum checkpoints and vote tallies), the vote
    /// source, and the admin, lifecycle and upgrade keys.
    fn require_current_layout_or_recovery(
        e: &Env,
        targets: &Vec<Address>,
        functions: &Vec<Symbol>,
    ) -> bool {
        let migration_due = !common::upgrade::is_current_layout(e, STORAGE_VERSION);
        if migration_due && !Self::is_recovery(e, targets, functions) {
            panic_with_error!(e, CustomGovernorError::StorageVersionMismatch);
        }
        migration_due
    }

    /// Whether every action is an `upgrade` or `migrate` call on this
    /// Governor or its Treasury: the only proposals that run while a
    /// migration is due.
    fn is_recovery(e: &Env, targets: &Vec<Address>, functions: &Vec<Symbol>) -> bool {
        if targets.is_empty() || targets.len() != functions.len() {
            return false;
        }
        let this = e.current_contract_address();
        let treasury = Self::treasury(e);
        let upgrade = Symbol::new(e, "upgrade");
        let migrate = Symbol::new(e, "migrate");
        targets
            .iter()
            .zip(functions.iter())
            .all(|(target, function)| {
                (target == this || target == treasury)
                    && (function == upgrade || function == migrate)
            })
    }

    /// Refuses actions this Governor will not put to a vote:
    ///
    /// - an action aimed at this Governor's `consume` (`CannotConsume`).
    ///   Run by `treasury.execute`, it would mark another queued proposal
    ///   Executed, with `ProposalExecuted`, without running that proposal's
    ///   actions. No supported flow uses it: `consume` has a purpose only for
    ///   the proposal `treasury.execute` is running;
    /// - `mint` and `batch_mint` actions that could not all publish their
    ///   events in one `treasury.execute` (`MintsTooLarge`). The Token bounds
    ///   each call (`common::batch_mint_fits`), but a proposal runs all its
    ///   calls in one transaction under one 16 KiB event limit, so two
    ///   calls that each fit could still never execute together. Calls are
    ///   recognised by name and argument shape (`mint(Address, Address)`,
    ///   `batch_mint(Address, Vec<Address>, Vec<u128>)`) on any target;
    ///   every other action is counted at `common::OTHER_ACTION_EVENT_BYTES`
    ///   (see `common::EXECUTION_EVENT_BUDGET`).
    fn check_actions(
        e: &Env,
        targets: &Vec<Address>,
        functions: &Vec<Symbol>,
        args: &Vec<Vec<Val>>,
    ) {
        let this = e.current_contract_address();
        let consume = Symbol::new(e, "consume");
        let mint = Symbol::new(e, "mint");
        let batch_mint = Symbol::new(e, "batch_mint");
        let budget = common::EXECUTION_EVENT_BUDGET as u64;
        let mut mint_actions: u32 = 0;
        let mut mint_bytes: u64 = 0;
        for i in 0..targets.len() {
            let (Some(target), Some(function), Some(call_args)) =
                (targets.get(i), functions.get(i), args.get(i))
            else {
                panic_with_error!(e, GovernorError::InvalidProposalLength);
            };
            if function == consume && target == this {
                panic_with_error!(e, CustomGovernorError::CannotConsume);
            }
            let size = if function == mint {
                Self::mint_size(e, &call_args)
            } else if function == batch_mint {
                Self::batch_mint_size(e, &call_args)
            } else {
                None
            };
            if let Some((tokens, recipients)) = size {
                mint_actions += 1;
                mint_bytes =
                    mint_bytes.saturating_add(common::mint_event_bytes(tokens, recipients));
                // Stop counting as soon as the mints alone are over budget.
                if mint_bytes > budget {
                    panic_with_error!(e, CustomGovernorError::MintsTooLarge);
                }
            }
        }
        if common::execution_event_bytes(targets.len(), mint_actions, mint_bytes) > budget {
            panic_with_error!(e, CustomGovernorError::MintsTooLarge);
        }
    }

    /// `(1, 1)` for arguments shaped like the Token's `mint(minter, to)`.
    fn mint_size(e: &Env, args: &Vec<Val>) -> Option<(u32, u32)> {
        if args.len() != 2 {
            return None;
        }
        for i in 0..2 {
            Address::try_from_val(e, &args.get(i)?).ok()?;
        }
        Some((1, 1))
    }

    /// `(tokens, recipient entries)` for arguments shaped like the Token's
    /// `batch_mint(minter, recipients, amounts)`. Amounts that do not fit a
    /// `u32` count as `u32::MAX` tokens: the Token would refuse the call.
    fn batch_mint_size(e: &Env, args: &Vec<Val>) -> Option<(u32, u32)> {
        if args.len() != 3 {
            return None;
        }
        Address::try_from_val(e, &args.get(0)?).ok()?;
        let recipients = Vec::<Val>::try_from_val(e, &args.get(1)?).ok()?;
        let amounts = Vec::<Val>::try_from_val(e, &args.get(2)?).ok()?;
        let mut tokens: u32 = 0;
        for amount in amounts.iter() {
            let amount = u128::try_from_val(e, &amount).ok()?;
            tokens = tokens.saturating_add(u32::try_from(amount).unwrap_or(u32::MAX));
        }
        Some((tokens, recipients.len()))
    }

    /// The votes `propose` requires from a proposer, given the voting supply
    /// at the snapshot ledger: the configured threshold, capped at that
    /// supply and never below 1. The cap matters only when the supply is
    /// below the threshold; then a proposer must hold (or be delegated)
    /// every vote, which a DAO can always reach, instead of a number no one
    /// can reach. The configured value (`proposal_threshold`) is unchanged.
    fn threshold_for_supply(e: &Env, voting_supply: u128) -> u128 {
        Self::proposal_threshold(e).min(voting_supply).max(1)
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

    /// Extends the TTL of a proposal and its `ProposalId(seq)` entry to
    /// `PROPOSAL_TTL_EXTEND_TO` when fewer than `threshold` ledgers remain.
    /// `propose` and `queue` pass `PROPOSAL_TTL_EXTEND_TO` (always renew),
    /// other touches `PROPOSAL_TTL_THRESHOLD` (see `PROPOSAL_TTL_EXTEND_TO`
    /// for why two renewals cover the whole lifecycle).
    fn extend_proposal_ttl(e: &Env, proposal_id: &BytesN<32>, seq: u32, threshold: u32) {
        let persistent = e.storage().persistent();
        persistent.extend_ttl(
            &Self::proposal_key(e, proposal_id),
            threshold,
            PROPOSAL_TTL_EXTEND_TO,
        );
        persistent.extend_ttl(
            &Self::proposal_id_key(e, seq),
            threshold,
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
        Self::extend_proposal_ttl(e, proposal_id, proposal.seq, PROPOSAL_TTL_THRESHOLD);

        proposal
    }

    /// Writes the proposal and renews its TTL when fewer than `threshold`
    /// ledgers remain (see `extend_proposal_ttl`).
    fn set_proposal(
        e: &Env,
        proposal_id: &BytesN<32>,
        proposal: &ProposalCoreTime,
        threshold: u32,
    ) {
        e.storage()
            .persistent()
            .set(&Self::proposal_key(e, proposal_id), &proposal.pack(e));
        Self::extend_proposal_ttl(e, proposal_id, proposal.seq, threshold);
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

    /// Seconds between `propose` and the start of voting: a notice period.
    /// Votes are read at the ledger before `propose`, so delegating or
    /// transferring during the delay does not change that proposal's votes.
    fn voting_delay(e: &Env) -> u32 {
        governor::get_voting_delay(e)
    }

    /// Seconds voting stays open.
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
        let total_supply = Self::votes(e).get_total_supply_at_checkpoint(&ledger);
        Self::quorum_of(e, total_supply, quorum_bps)
    }

    /// Always true: a proposal must be queued, and wait out the queue delay,
    /// before `treasury.execute` can run it.
    fn proposals_need_queuing(_e: &Env) -> bool {
        true
    }

    /// Queues a Succeeded proposal and returns its id. Anyone may call it;
    /// `_eta` and `_operator` are ignored. Sets the ETA to now plus the queue
    /// delay: `treasury.execute` can run the proposal from the ETA until 14
    /// days after it (`PROPOSAL_EXPIRATION_PERIOD`). Fails
    /// `ProposalAlreadyExecuted` for an Executed proposal and
    /// `ProposalNotSuccessful` in any other state, including a Succeeded
    /// proposal whose 14-day queue window has passed (Expired).
    ///
    /// Renews the proposal's TTL to `PROPOSAL_TTL_EXTEND_TO` unconditionally,
    /// so it lives through the rest of its lifecycle (at most the 30-day
    /// queue delay plus the 14-day execution window) without another touch.
    /// Emits `ProposalQueued`.
    fn queue(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
        _eta: u32,
        _operator: Address,
    ) -> BytesN<32> {
        Self::require_current_layout_or_recovery(e, &targets, &functions);
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
        // Always renew here: the TTL set at `propose` covers the proposal
        // only until its queue window closes (up to 74 days), not the queue
        // delay and execution window that follow (up to 44 more).
        Self::set_proposal(e, &proposal_id, &proposal, PROPOSAL_TTL_EXTEND_TO);

        emit_proposal_queued(e, &proposal_id, eta);

        proposal_id
    }

    /// The proposal's state now (Pending, Active, Defeated, Succeeded,
    /// Queued, Expired, Executed or Canceled). Fails `ProposalNotFound` for
    /// an unknown id.
    fn proposal_state(e: &Env, proposal_id: BytesN<32>) -> ProposalState {
        let proposal = Self::get_proposal(e, &proposal_id);
        Self::proposal_state_internal(e, &proposal_id, &proposal)
    }

    /// The ledger the proposal reads votes at: the ledger before `propose`.
    fn proposal_snapshot(e: &Env, proposal_id: BytesN<32>) -> u32 {
        Self::get_proposal(e, &proposal_id).vote_snapshot
    }

    /// The account that made the proposal (the only one that may cancel it).
    fn proposal_proposer(e: &Env, proposal_id: BytesN<32>) -> Address {
        Self::get_proposal(e, &proposal_id).proposer
    }

    /// When voting ends, in unix seconds (not a ledger number, as
    /// OpenZeppelin documents it).
    fn proposal_deadline(e: &Env, proposal_id: BytesN<32>) -> u32 {
        // Convert u64 timestamp to u32 for trait compatibility
        // This is safe for practical purposes (works until year 2106)
        Self::get_proposal(e, &proposal_id)
            .vote_end
            .try_into()
            .unwrap_or_else(|_| panic_with_error!(e, GovernorError::MathOverflow))
    }

    /// Creates a proposal and returns its id (the hash of its actions and
    /// description). Needs `proposer`'s auth and at least
    /// `votes_needed_to_propose` votes at the previous ledger
    /// (`InsufficientProposerVotes`). Only once launched (`NotLive`).
    ///
    /// The proposal has 1 to `MAX_PROPOSAL_ACTIONS` actions
    /// (`EmptyProposal`, `TooManyActions`), matching lengths
    /// (`InvalidProposalLength`), a description up to OpenZeppelin's limit
    /// (`DescriptionTooLong`), and an id not used before
    /// (`ProposalAlreadyExists`). Its actions may not call `consume`
    /// (`CannotConsume`) or mint more than one execution can publish
    /// (`MintsTooLarge`); see `check_actions`.
    ///
    /// Votes, the quorum supply and the threshold cap are all read at the
    /// previous ledger, so tokens minted in the proposing ledger count toward
    /// none of them. The quorum is fixed now and stored on the proposal.
    /// Voting runs from now plus the voting delay for the voting period.
    /// Emits OpenZeppelin `ProposalCreated` and `ProposalScheduled`.
    fn propose(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description: String,
        proposer: Address,
    ) -> BytesN<32> {
        // While a migration is due, only a recovery proposal may be made
        // (see `is_recovery`); it is marked so that votes on it are accepted.
        let recovering = Self::require_current_layout_or_recovery(e, &targets, &functions);
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        proposer.require_auth();

        // Votes and the voting supply are both read at the previous ledger
        // (the snapshot). Using this ledger's supply instead would let a
        // holder escrow tokens in the Marketplace in the proposing ledger
        // (lowering the supply) while still voting with them. Both reads
        // touch only the latest checkpoints, never archived history.
        //
        // The supply fixes the quorum, `ceil(voting_supply * quorum_bps /
        // 10_000)`, and caps the threshold, so a DAO whose voting supply is
        // below its threshold (set before founder tokens were minted, or
        // after members gave tokens back) can still propose.
        let voting_supply = Self::votes(e).voting_supply_at_previous_ledger();
        let proposal_threshold = Self::threshold_for_supply(e, voting_supply);
        let current_ledger = e.ledger().sequence();
        let snapshot_ledger = current_ledger.saturating_sub(1);
        let proposer_votes = Self::votes(e).get_votes_at_checkpoint(&proposer, &snapshot_ledger);
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
        Self::check_actions(e, &targets, &functions, &args);

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
            quorum: Self::quorum_of(e, voting_supply, Self::quorum_bps(e) as u128),
        };

        // The id list entry first: set_proposal renews both.
        e.storage()
            .persistent()
            .set(&Self::proposal_id_key(e, seq), &proposal_id);
        Self::set_proposal(e, &proposal_id, &proposal, PROPOSAL_TTL_EXTEND_TO);
        if recovering {
            // Read only by `cast_vote`, within the voting delay and period
            // (60 days at most), so one TTL covers it.
            let key = common::ns(e, GovernorKey::RecoveryProposal(proposal_id.clone()));
            let persistent = e.storage().persistent();
            persistent.set(&key, &true);
            persistent.extend_ttl(&key, PROPOSAL_TTL_EXTEND_TO, PROPOSAL_TTL_EXTEND_TO);
        }
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

    /// Casts `voter`'s vote and returns its weight: 0 Against, 1 For,
    /// 2 Abstain (`InvalidVoteType` otherwise). Needs `voter`'s auth, an
    /// Active proposal (`ProposalNotActive`), nonzero weight at the
    /// proposal's snapshot (`ZeroVotingWeight`), a reason up to
    /// `MAX_PROPOSAL_COMMENT_LENGTH` (`CommentTooLong`), and no earlier vote
    /// by `voter` on it (`AlreadyVoted`). Emits OpenZeppelin `VoteCast`.
    fn cast_vote(
        e: &Env,
        proposal_id: BytesN<32>,
        vote_type: u32,
        reason: String,
        voter: Address,
    ) -> u128 {
        // While a migration is due, only recovery proposals made during it
        // can be voted on.
        if !common::upgrade::is_current_layout(e, STORAGE_VERSION)
            && !e.storage().persistent().has(&common::ns(
                e,
                GovernorKey::RecoveryProposal(proposal_id.clone()),
            ))
        {
            panic_with_error!(e, CustomGovernorError::StorageVersionMismatch);
        }
        common::ttl::extend_instance(e);
        common::lifecycle::require_live(e);
        voter.require_auth();
        Self::check_comment_length(e, &reason);

        let proposal = Self::get_proposal(e, &proposal_id);
        if Self::proposal_state_internal(e, &proposal_id, &proposal) != ProposalState::Active {
            panic_with_error!(e, GovernorError::ProposalNotActive);
        }

        let voter_weight = Self::votes(e).get_votes_at_checkpoint(&voter, &proposal.vote_snapshot);

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

    /// Cancels a Pending or Active proposal and returns its id. Only its
    /// proposer, as `operator` with auth; anyone else, or any later state,
    /// fails `ProposalNotCancellable`. Emits OpenZeppelin `ProposalCancelled`.
    fn cancel(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
        operator: Address,
    ) -> BytesN<32> {
        Self::require_current_layout(e);
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
        Self::set_proposal(e, &proposal_id, &proposal, PROPOSAL_TTL_THRESHOLD);
        emit_proposal_cancelled(e, &proposal_id);

        proposal_id
    }
}
