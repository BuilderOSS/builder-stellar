import {Address, xdr} from '@stellar/stellar-sdk';

    /**
 * Governor-specific errors (block `common::error::codes::GOVERNOR`).
 * Lifecycle errors shared with OpenZeppelin's governor (proposal not found,
 * not active, already executed, ...) keep their library codes (5000s).
 */
export const CustomGovernorError = {
  /**
   * Queue delay below `MIN_QUEUE_DELAY`
   */
  7501 : { message: "InvalidQueueDelay" },
  /**
   * Proposal threshold is zero or exceeds the voting supply
   */
  7502 : { message: "InvalidProposalThreshold" },
  /**
   * Quorum basis points outside 1..=10000
   */
  7503 : { message: "InvalidQuorumBps" },
  /**
   * Voting delay below `MIN_VOTING_DELAY`
   */
  7504 : { message: "InvalidVotingDelay" },
  /**
   * Voting period below `MIN_VOTING_PERIOD`
   */
  7505 : { message: "InvalidVotingPeriod" },
  /**
   * `launch` treasury differs from the treasury wired at construction
   */
  7506 : { message: "TreasuryMismatch" },
  /**
   * `execute` is disabled; call `treasury.execute` instead
   */
  7507 : { message: "UseTreasuryExecute" },
  /**
   * Proposal has more than `MAX_PROPOSAL_ACTIONS` actions
   */
  7508 : { message: "TooManyActions" },
  /**
   * Voting delay above `MAX_VOTING_DELAY` (30 days)
   */
  7509 : { message: "VotingDelayTooLong" },
  /**
   * Voting period above `MAX_VOTING_PERIOD` (30 days)
   */
  7510 : { message: "VotingPeriodTooLong" },
  /**
   * Queue delay above `MAX_QUEUE_DELAY` (30 days)
   */
  7511 : { message: "QueueDelayTooLong" },
  /**
   * The voter had no voting power at the proposal snapshot
   */
  7512 : { message: "ZeroVotingWeight" },
  /**
   * The proposal is queued but its ETA has not been reached
   */
  7513 : { message: "ProposalNotReady" }
}

/**
 * Event: ProposalQueued
 */
export interface ProposalQueuedEvent {
  name: "ProposalQueued";
  data: {
    proposal_id: Uint8Array;
    eta?: bigint;
  };
}

/**
 * Emitted once when the Manager launches the governor (Setup -> Live).
 */
export interface GovernorLaunchedEvent {
  name: "GovernorLaunched";
  data: {
    treasury: string;
  };
}

/**
 * Event: QuorumBpsChanged
 */
export interface QuorumBpsChangedEvent {
  name: "QuorumBpsChanged";
  data: {
    changed_by: string;
    old_value?: number;
    new_value?: number;
  };
}

/**
 * Emitted by `propose` next to OpenZeppelin's `ProposalCreated`.
 *
 * `vote_start` / `vote_end` are unix timestamps (seconds); `snapshot_ledger`
 * is the ledger voting power and voting supply are read at; `quorum_votes` is
 * the For + Abstain total the proposal needs. Quorum is fully determined at
 * proposal time because the snapshot precedes the proposal.
 */
export interface ProposalScheduledEvent {
  name: "ProposalScheduled";
  data: {
    proposal_id: Uint8Array;
    vote_start?: bigint;
    vote_end?: bigint;
    snapshot_ledger?: number;
    quorum_votes?: bigint;
  };
}

/**
 * Event: QueueDelayChanged
 */
export interface QueueDelayChangedEvent {
  name: "QueueDelayChanged";
  data: {
    changed_by: string;
    old_value?: number;
    new_value?: number;
  };
}

/**
 * Event: VotingDelayChanged
 */
export interface VotingDelayChangedEvent {
  name: "VotingDelayChanged";
  data: {
    changed_by: string;
    old_value?: number;
    new_value?: number;
  };
}

/**
 * Event: GovernorInitialized
 */
export interface GovernorInitializedEvent {
  name: "GovernorInitialized";
  data: {
    admin: string;
    token_contract?: string;
    treasury_contract?: string;
    voting_delay?: number;
    voting_period?: number;
    queue_delay?: number;
    proposal_threshold?: bigint;
    quorum_bps?: number;
    version?: string;
  };
}

/**
 * Event: VotingPeriodChanged
 */
export interface VotingPeriodChangedEvent {
  name: "VotingPeriodChanged";
  data: {
    changed_by: string;
    old_value?: number;
    new_value?: number;
  };
}

/**
 * Event: ProposalThresholdChanged
 */
export interface ProposalThresholdChangedEvent {
  name: "ProposalThresholdChanged";
  data: {
    changed_by: string;
    old_value?: bigint;
    new_value?: bigint;
  };
}

/**
 * Emitted by [`handoff`]. The emitting contract address is the event's contract id.
 *
 * Same shape as the Manager's own `AdminChanged`, so indexers decode both
 * with one schema.
 */
export interface AdminChangedEvent {
  name: "AdminChanged";
  data: {
    old_admin: string;
    new_admin: string;
  };
}

/**
 * Errors shared by all module contracts (block `codes::COMMON`).
 */
export const CommonError = {
  /**
   * Operation requires the module to be live (launched).
   */
  7001 : { message: "NotLive" },
  /**
   * Operation is only valid during setup; the module is already live.
   */
  7002 : { message: "AlreadyLive" },
  /**
   * Manager address missing from storage.
   */
  7003 : { message: "ManagerNotSet" },
  /**
   * `CurrentHash` missing from storage.
   */
  7004 : { message: "CurrentHashNotSet" },
  /**
   * `from_hash` does not equal the stored `CurrentHash`.
   */
  7005 : { message: "HashMismatch" },
  /**
   * Manager did not approve this upgrade path.
   */
  7006 : { message: "UpgradeNotApproved" },
  /**
   * Manager has no registry entry for the requested hash.
   */
  7007 : { message: "ImplementationNotFound" },
  /**
   * Module admin missing from storage.
   */
  7008 : { message: "AdminNotSet" },
  /**
   * `CurrentVersion` missing from storage.
   */
  7009 : { message: "VersionNotSet" },
  /**
   * Treasury address missing from storage.
   */
  7010 : { message: "TreasuryNotSet" },
  /**
   * Governor address missing from storage.
   */
  7011 : { message: "GovernorNotSet" },
  /**
   * `migrate` called while the stored layout is already current.
   */
  7012 : { message: "NothingToMigrate" },
  /**
   * `StorageVersion` missing from storage.
   */
  7013 : { message: "StorageVersionNotSet" }
}

/**
 * Emitted by `migrate`.
 */
export interface MigratedEvent {
  name: "Migrated";
  data: {
    from_storage_version?: number;
    to_storage_version?: number;
  };
}

/**
 * Emitted by `apply`. The emitting contract address is the event's contract id.
 */
export interface UpgradedEvent {
  name: "Upgraded";
  data: {
    from_hash: Uint8Array;
    to_hash: Uint8Array;
    version?: string;
  };
}

/**
 * Emitted by `sync_version`.
 */
export interface VersionSyncedEvent {
  name: "VersionSynced";
  data: {
    version?: string;
  };
}

/**
 * Event emitted when a vote is cast.
 */
export interface VoteCastEvent {
  name: "VoteCast";
  data: {
    voter: string;
    proposal_id: Uint8Array;
    /**
     * The type of vote cast.
     */
    vote_type?: number;
    /**
     * The voting power used.
     */
    weight?: bigint;
    /**
     * The voter's explanation for their vote.
     */
    reason?: string;
  };
}

/**
 * Errors that can occur in governor operations.
 */
export const GovernorError = {
  /**
   * The proposal was not found.
   */
  5000 : { message: "ProposalNotFound" },
  /**
   * The proposal already exists.
   */
  5001 : { message: "ProposalAlreadyExists" },
  /**
   * The proposer does not have enough voting power.
   */
  5002 : { message: "InsufficientProposerVotes" },
  /**
   * The proposal contains no actions.
   */
  5003 : { message: "EmptyProposal" },
  /**
   * The targets, functions, and args vectors have different lengths.
   */
  5004 : { message: "InvalidProposalLength" },
  /**
   * The proposal is not in the active state.
   */
  5005 : { message: "ProposalNotActive" },
  /**
   * The proposal has not succeeded.
   */
  5006 : { message: "ProposalNotSuccessful" },
  /**
   * The proposal has not been queued.
   */
  5007 : { message: "ProposalNotQueued" },
  /**
   * The proposal has already been executed.
   */
  5008 : { message: "ProposalAlreadyExecuted" },
  /**
   * The proposal is in a non-cancellable state (`Canceled`, `Expired`, or
   * `Executed`).
   */
  5009 : { message: "ProposalNotCancellable" },
  /**
   * The voting delay has not been set.
   */
  5010 : { message: "VotingDelayNotSet" },
  /**
   * The voting period has not been set.
   */
  5011 : { message: "VotingPeriodNotSet" },
  /**
   * The proposal threshold has not been set.
   */
  5012 : { message: "ProposalThresholdNotSet" },
  /**
   * The name has not been set.
   */
  5013 : { message: "NameNotSet" },
  /**
   * The version has not been set.
   */
  5014 : { message: "VersionNotSet" },
  /**
   * Arithmetic overflow occurred.
   */
  5015 : { message: "MathOverflow" },
  /**
   * The account has already voted on this proposal.
   */
  5016 : { message: "AlreadyVoted" },
  /**
   * The vote type is invalid (must be 0, 1, or 2).
   */
  5017 : { message: "InvalidVoteType" },
  /**
   * The quorum has not been set.
   */
  5018 : { message: "QuorumNotSet" },
  /**
   * The token contract has already been set (can only be initialized once).
   */
  5019 : { message: "TokenContractAlreadySet" },
  /**
   * The token contract has not been set.
   */
  5020 : { message: "TokenContractNotSet" },
  /**
   * The proposal description exceeds the maximum allowed length.
   */
  5021 : { message: "DescriptionTooLong" },
  /**
   * Queuing is not enabled for this governor.
   */
  5022 : { message: "QueueNotEnabled" },
  /**
   * The voting period is zero, which would leave every proposal unvotable.
   */
  5023 : { message: "InvalidVotingPeriod" }
}

/**
 * The state of a proposal in its lifecycle.
 *
 * States are divided into two categories:
 *
 * ## Time-based states (derived, never stored explicitly)
 *
 * These are computed by [`get_proposal_state()`] from the current ledger
 * relative to the proposal's voting schedule. They are only returned when
 * no explicit state has been set.
 *
 * - [`Pending`](ProposalState::Pending) — voting has not started yet.
 * - [`Active`](ProposalState::Active) — voting is ongoing.
 * - [`Defeated`](ProposalState::Defeated) — voting ended **without** the
 * counting logic marking the proposal as `Succeeded`.
 *
 * ## Explicit states
 *
 * Set explicitly by the Governor or its extensions and persisted in
 * storage. Once set, they take precedence over any time-based derivation.
 *
 * - [`Canceled`](ProposalState::Canceled) — set by the Governor.
 * - [`Succeeded`](ProposalState::Succeeded) — set by the counting logic.
 * - [`Queued`](ProposalState::Queued) / [`Expired`](ProposalState::Expired) —
 * set by extensions like `TimelockControl`.
 * - [`Executed`](ProposalState::Execu
 */
export enum ProposalState {
  /**
   * The proposal is pending and voting has not started yet.
   */
  Pending = 0,
  /**
   * The proposal is active and voting is ongoing.
   */
  Active = 1,
  /**
   * The proposal was defeated (did not meet quorum or majority). This is
   * the default outcome when voting ends and the counting logic has
   * not marked the proposal as [`Succeeded`](ProposalState::Succeeded).
   */
  Defeated = 2,
  /**
   * The proposal has been cancelled. Set by the Governor.
   */
  Canceled = 3,
  /**
   * The proposal succeeded and can be executed. Set by the counting
   * logic when the proposal meets the required quorum and vote
   * thresholds. If a queuing extension is enabled, this state means the
   * proposal is ready to be queued.
   */
  Succeeded = 4,
  /**
   * The proposal is queued for execution. Set by extensions like
   * `TimelockControl`.
   */
  Queued = 5,
  /**
   * The proposal has expired and can no longer be executed. Set by
   * extensions like `TimelockControl`.
   */
  Expired = 6,
  /**
   * The proposal has been executed. Set by the Governor.
   */
  Executed = 7
}

/**
 * Event emitted when the quorum value is changed.
 */
export interface QuorumChangedEvent {
  name: "QuorumChanged";
  data: {
    old_quorum?: bigint;
    new_quorum?: bigint;
  };
}

/**
 * Event emitted when a proposal is created.
 */
export interface ProposalCreatedEvent {
  name: "ProposalCreated";
  data: {
    proposal_id: Uint8Array;
    proposer: string;
    targets?: Array<string>;
    functions?: Array<string>;
    args?: Array<Array<any>>;
    vote_snapshot?: number;
    vote_end?: number;
    description?: string;
  };
}

/**
 * Event emitted when a proposal is executed.
 */
export interface ProposalExecutedEvent {
  name: "ProposalExecuted";
  data: {
    proposal_id: Uint8Array;
  };
}

/**
 * Event emitted when a proposal is cancelled.
 */
export interface ProposalCancelledEvent {
  name: "ProposalCancelled";
  data: {
    proposal_id: Uint8Array;
  };
}
    export type ContractEvent = ProposalQueuedEvent | GovernorLaunchedEvent | QuorumBpsChangedEvent | ProposalScheduledEvent | QueueDelayChangedEvent | VotingDelayChangedEvent | GovernorInitializedEvent | VotingPeriodChangedEvent | ProposalThresholdChangedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent | VersionSyncedEvent | VoteCastEvent | QuorumChangedEvent | ProposalCreatedEvent | ProposalExecutedEvent | ProposalCancelledEvent;
    