import {Address, xdr} from '@stellar/stellar-sdk';

    /**
 * Error Enum: CustomGovernorError
 */
export const CustomGovernorError = {
  /**
   * Queue delay below minimum (must be >= 5 minutes)
   */
  1500 : { message: "InvalidQueueDelay" },
  /**
   * Proposal threshold exceeds total token supply
   */
  1501 : { message: "InvalidProposalThreshold" },
  /**
   * Quorum basis points invalid (must be <= 10000)
   */
  1502 : { message: "InvalidQuorumBps" },
  /**
   * Owner not set in contract storage
   */
  1503 : { message: "OwnerNotSet" },
  /**
   * Voting delay below minimum (must be >= 5 minutes)
   */
  1505 : { message: "InvalidVotingDelay" },
  /**
   * Voting period below minimum (must be >= 5 minutes)
   */
  1506 : { message: "InvalidVotingPeriod" },
  /**
   * `launch` treasury differs from the treasury wired at construction
   */
  1507 : { message: "TreasuryMismatch" },
  /**
   * `execute` is disabled; call `treasury.execute` instead
   */
  1508 : { message: "UseTreasuryExecute" },
  /**
   * Proposal has more than `MAX_PROPOSAL_ACTIONS` actions
   */
  1509 : { message: "TooManyActions" },
  /**
   * Voting delay above `MAX_VOTING_DELAY` (30 days)
   */
  1510 : { message: "VotingDelayTooLong" },
  /**
   * Voting period above `MAX_VOTING_PERIOD` (30 days)
   */
  1511 : { message: "VotingPeriodTooLong" },
  /**
   * Queue delay above `MAX_QUEUE_DELAY` (30 days)
   */
  1512 : { message: "QueueDelayTooLong" }
}

/**
 * Emitted once when the Manager launches the governor (Setup -> Live).
 */
export interface LaunchedEvent {
  name: "Launched";
  data: {
    treasury: string;
  };
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
 * Event: QuorumBpsChanged
 */
export interface QuorumBpsChangedEvent {
  name: "QuorumBpsChanged";
  data: {
    caller: string;
    old_value?: number;
    new_value?: number;
  };
}

/**
 * Event: QueueDelayChanged
 */
export interface QueueDelayChangedEvent {
  name: "QueueDelayChanged";
  data: {
    caller: string;
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
    caller: string;
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
    owner: string;
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
    caller: string;
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
    caller: string;
    old_value?: bigint;
    new_value?: bigint;
  };
}

/**
 * Errors shared by all module contracts. Codes live in the 9000 range so
 * they never collide with module (11xx-13xx, 3, 30) or manager (10xx) codes.
 */
export const CommonError = {
  /**
   * Operation requires the module to be live (launched).
   */
  9001 : { message: "NotLive" },
  /**
   * Operation is only valid during setup; the module is already live.
   */
  9002 : { message: "AlreadyLive" },
  /**
   * Manager address missing from storage.
   */
  9003 : { message: "ManagerNotSet" },
  /**
   * `CurrentHash` missing from storage.
   */
  9004 : { message: "CurrentHashNotSet" },
  /**
   * `from_hash` does not equal the stored `CurrentHash`.
   */
  9005 : { message: "HashMismatch" },
  /**
   * Manager did not approve this upgrade path.
   */
  9006 : { message: "UpgradeNotApproved" },
  /**
   * Manager has no registry entry for the requested hash.
   */
  9007 : { message: "ImplementationNotFound" },
  /**
   * Owner missing from storage.
   */
  9008 : { message: "OwnerNotSet" },
  /**
   * `CurrentVersion` missing from storage.
   */
  9009 : { message: "VersionNotSet" },
  /**
   * Treasury address missing from storage.
   */
  9010 : { message: "TreasuryNotSet" },
  /**
   * Governor address missing from storage.
   */
  9011 : { message: "GovernorNotSet" }
}

/**
 * Error Enum: RoleTransferError
 */
export const RoleTransferError = {
  2200 : { message: "NoPendingTransfer" },
  2201 : { message: "InvalidLiveUntilLedger" },
  2202 : { message: "InvalidPendingAccount" },
  2203 : { message: "TransferExpired" }
}

/**
 * Error Enum: OwnableError
 */
export const OwnableError = {
  2100 : { message: "OwnerNotSet" },
  2101 : { message: "TransferInProgress" },
  2102 : { message: "OwnerAlreadySet" }
}

/**
 * Event emitted when an ownership transfer is initiated.
 */
export interface OwnershipTransferEvent {
  name: "OwnershipTransfer";
  data: {
    old_owner?: string;
    new_owner?: string;
    live_until_ledger?: number;
  };
}

/**
 * Event emitted when ownership is renounced.
 */
export interface OwnershipRenouncedEvent {
  name: "OwnershipRenounced";
  data: {
    old_owner?: string;
  };
}

/**
 * Event emitted when an ownership transfer is completed.
 */
export interface OwnershipTransferCompletedEvent {
  name: "OwnershipTransferCompleted";
  data: {
    new_owner?: string;
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
    export type ContractEvent = LaunchedEvent | ProposalQueuedEvent | QuorumBpsChangedEvent | QueueDelayChangedEvent | VotingDelayChangedEvent | GovernorInitializedEvent | VotingPeriodChangedEvent | ProposalThresholdChangedEvent | OwnershipTransferEvent | OwnershipRenouncedEvent | OwnershipTransferCompletedEvent | VoteCastEvent | QuorumChangedEvent | ProposalCreatedEvent | ProposalExecutedEvent | ProposalCancelledEvent;
    