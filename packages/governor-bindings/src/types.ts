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
   * Caller is not authorized to perform this action
   */
  1504 : { message: "UnauthorizedCaller" },
  /**
   * Voting delay below minimum (must be >= 5 minutes)
   */
  1505 : { message: "InvalidVotingDelay" },
  /**
   * Voting period below minimum (must be >= 5 minutes)
   */
  1506 : { message: "InvalidVotingPeriod" }
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
 * Event: TreasuryChanged
 */
export interface TreasuryChangedEvent {
  name: "TreasuryChanged";
  data: {
    old_treasury: string;
    new_treasury: string;
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
 * Event: TokenContractChanged
 */
export interface TokenContractChangedEvent {
  name: "TokenContractChanged";
  data: {
    old_token_contract: string;
    new_token_contract: string;
  };
}

/**
 * Event: GovernorAuthorityChanged
 */
export interface GovernorAuthorityChangedEvent {
  name: "GovernorAuthorityChanged";
  data: {
    authority: string;
    old_enabled?: boolean;
    enabled?: boolean;
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
 * Storage keys for governor-specific instance data.
 *
 * Most governance data (name, version, voting parameters, vote tallies) is stored
 * via the stellar_governance library's storage keys. This enum contains only
 * contract-specific keys for custom functionality.
 */
 export type GovernorKey =
  /**
   * Address of the Treasury contract that executes approved proposals.
   */
  { tag: "Treasury"; values: void } |
  /**
   * Delay (in seconds) between queueing and execution eligibility.
   */
  { tag: "QueueDelay"; values: void } |
  /**
   * Proposal core data, indexed by proposal ID hash.
   */
  { tag: "Proposal"; values: readonly [Uint8Array] } |
  /**
   * Tracks whether an address has authority to create proposals.
   */
  { tag: "GovernorAuthority"; values: readonly [string] };

/**
 * Core proposal data using timestamps instead of ledger sequences.
 *
 * This structure extends the library's proposal data with timestamp-based voting
 * periods, allowing for more predictable governance timelines. Timestamps are
 * independent of network performance, unlike ledger-based periods which can vary
 * with block production rate.
 */
export interface ProposalCoreTime {
  /**
   * Estimated Time of Arrival - when proposal becomes executable.
   *
   * Set during queueing: `queue_time + queue_delay`. The proposal can be executed
   * anytime after ETA but before `ETA + PROPOSAL_EXPIRATION_PERIOD`.
   */
  eta: bigint;
  /**
   * Address that created the proposal.
   */
  proposer: string;
  /**
   * Current state in the proposal lifecycle.
   */
  state: ProposalState;
  /**
   * Unix timestamp when voting ends.
   *
   * Equals vote_start + voting period. Votes cast after this time are rejected.
   */
  vote_end: bigint;
  /**
   * Ledger sequence used for vote power snapshot.
   *
   * Voting power is determined by token holdings at this snapshot, preventing
   * vote manipulation via token transfers during voting.
   */
  vote_snapshot: number;
  /**
   * Unix timestamp when voting begins.
   *
   * Equals proposal creation time + voting delay. Votes cast before this time
   * are rejected.
   */
  vote_start: bigint;
}

/**
 * Errors that can occur in votes operations.
 */
export const VotesError = {
  /**
   * The ledger is in the future
   */
  4100 : { message: "FutureLookup" },
  /**
   * Arithmetic overflow occurred
   */
  4101 : { message: "MathOverflow" },
  /**
   * Attempting to transfer more voting units than available
   */
  4102 : { message: "InsufficientVotingUnits" },
  /**
   * Attempting to delegate to the same delegate that is already set
   */
  4103 : { message: "SameDelegate" },
  /**
   * A checkpoint that was expected to exist was not found in storage
   */
  4104 : { message: "CheckpointNotFound" }
}

/**
 * Event emitted when an account changes its delegate.
 */
export interface DelegateChangedEvent {
  name: "DelegateChanged";
  data: {
    /**
     * The account that changed its delegate
     */
    delegator: string;
    /**
     * The previous delegate (if any)
     */
    from_delegate?: string | null;
    /**
     * The new delegate
     */
    to_delegate?: string;
  };
}

/**
 * Event emitted when a delegate's voting power changes.
 */
export interface DelegateVotesChangedEvent {
  name: "DelegateVotesChanged";
  data: {
    /**
     * The delegate whose voting power changed
     */
    delegate: string;
    /**
     * The previous voting power
     */
    previous_votes?: bigint;
    /**
     * The new voting power
     */
    new_votes?: bigint;
  };
}

/**
 * A checkpoint recording voting power at a specific ledger sequence number.
 */
export interface Checkpoint {
  /**
   * The ledger sequence number when this checkpoint was created
   */
  ledger: number;
  /**
   * The voting power at this ledger sequence number
   */
  votes: bigint;
}

/**
 * Selects the checkpoint timeline to operate on.
 *
 * Each variant maps to a different set of storage keys so that
 * per-account voting-power history and aggregate total supply history
 * are kept separate.
 */
 export type CheckpointType =
  /**
   * The global total supply checkpoint.
   */
  { tag: "TotalSupply"; values: void } |
  /**
   * A per-account (delegate) voting-power checkpoint.
   */
  { tag: "Account"; values: readonly [string] };

/**
 * Storage keys for the votes module.
 *
 * Only delegated voting power counts as votes (i.e., only delegatees can
 * vote), so the storage design tracks delegates and their checkpointed
 * voting power separately from the raw voting units held by each account.
 */
 export type VotesStorageKey =
  /**
   * Maps account to its delegate
   */
  { tag: "Delegatee"; values: readonly [string] } |
  /**
   * Number of checkpoints for a delegate
   */
  { tag: "NumCheckpoints"; values: readonly [string] } |
  /**
   * Individual checkpoint for a delegate at index
   */
  { tag: "DelegateCheckpoint"; values: readonly [string, number] } |
  /**
   * Number of total supply checkpoints
   */
  { tag: "NumTotalSupplyCheckpoints"; values: void } |
  /**
   * Individual total supply checkpoint at index
   */
  { tag: "TotalSupplyCheckpoint"; values: readonly [number] } |
  /**
   * Voting units held by an account (tracked separately from delegation)
   */
  { tag: "VotingUnits"; values: readonly [string] };

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
 * Event emitted when a proposal is queued.
 *
 * Note: renamed from "ProposalQueuedEvent" to avoid a collision with another generated name.
 */
export interface ProposalQueuedEvent2 {
  name: "ProposalQueued";
  data: {
    proposal_id: Uint8Array;
    eta?: number;
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

/**
 * Core proposal data stored on-chain.
 */
export interface ProposalCore {
  /**
   * The address that created the proposal.
   */
  proposer: string;
  /**
   * The current state of the proposal.
   */
  state: ProposalState;
  /**
   * The last ledger where voting is active (inclusive).
   */
  vote_end: number;
  /**
   * The ledger at which voting power is snapshotted. Voting opens on
   * the next ledger (`vote_snapshot + 1`).
   */
  vote_snapshot: number;
}

/**
 * A quorum checkpoint recording the quorum value at a specific ledger.
 */
export interface QuorumCheckpoint {
  /**
   * The ledger at which this quorum value took effect.
   */
  ledger: number;
  /**
   * The quorum value.
   */
  quorum: bigint;
}

/**
 * Storage keys for the Governor contract.
 */
 export type GovernorStorageKey =
  /**
   * The name of the governor.
   */
  { tag: "Name"; values: void } |
  /**
   * The version of the governor contract.
   */
  { tag: "Version"; values: void } |
  /**
   * The voting delay in ledgers.
   */
  { tag: "VotingDelay"; values: void } |
  /**
   * The voting period in ledgers.
   */
  { tag: "VotingPeriod"; values: void } |
  /**
   * Minimum voting power required to propose.
   */
  { tag: "ProposalThreshold"; values: void } |
  /**
   * Proposal data indexed by proposal ID.
   */
  { tag: "Proposal"; values: readonly [Uint8Array] } |
  /**
   * Number of quorum checkpoints.
   */
  { tag: "NumQuorumCheckpoints"; values: void } |
  /**
   * Individual quorum checkpoint at index.
   */
  { tag: "QuorumCheckpoint"; values: readonly [number] } |
  /**
   * Vote tallies for a proposal, indexed by proposal ID.
   */
  { tag: "ProposalVote"; values: readonly [Uint8Array] } |
  /**
   * Whether an account has voted on a proposal.
   */
  { tag: "HasVoted"; values: readonly [Uint8Array, string] } |
  /**
   * The address of the token contract that implements the Votes trait.
   */
  { tag: "TokenContract"; values: void };

/**
 * Vote tallies for a proposal.
 */
export interface ProposalVoteCounts {
  /**
   * Total voting power cast as abstain.
   */
  abstain_votes: bigint;
  /**
   * Total voting power cast against the proposal.
   */
  against_votes: bigint;
  /**
   * Total voting power cast in favor of the proposal.
   */
  for_votes: bigint;
}

/**
 * Errors that can occur in timelock operations.
 */
export const TimelockError = {
  /**
   * The operation is already scheduled
   */
  4000 : { message: "OperationAlreadyScheduled" },
  /**
   * The delay is less than the minimum required delay
   */
  4001 : { message: "InsufficientDelay" },
  /**
   * The operation is not in the expected state
   */
  4002 : { message: "InvalidOperationState" },
  /**
   * A predecessor operation has not been executed yet
   */
  4003 : { message: "UnexecutedPredecessor" },
  /**
   * The caller is not authorized to perform this action
   */
  4004 : { message: "Unauthorized" },
  /**
   * The minimum delay has not been set
   */
  4005 : { message: "MinDelayNotSet" },
  /**
   * The operation has not been scheduled
   */
  4006 : { message: "OperationNotScheduled" }
}

/**
 * Event emitted when the minimum delay is changed.
 */
export interface MinDelayChangedEvent {
  name: "MinDelayChanged";
  data: {
    old_delay?: number;
    new_delay?: number;
  };
}

/**
 * Event emitted when an operation is executed.
 */
export interface OperationExecutedEvent {
  name: "OperationExecuted";
  data: {
    id: Uint8Array;
    target: string;
    function?: string;
    args?: Array<any>;
    predecessor?: Uint8Array;
    salt?: Uint8Array;
  };
}

/**
 * Event emitted when an operation is cancelled.
 */
export interface OperationCancelledEvent {
  name: "OperationCancelled";
  data: {
    id: Uint8Array;
  };
}

/**
 * Event emitted when an operation is scheduled.
 */
export interface OperationScheduledEvent {
  name: "OperationScheduled";
  data: {
    id: Uint8Array;
    target: string;
    function?: string;
    args?: Array<any>;
    predecessor?: Uint8Array;
    salt?: Uint8Array;
    delay?: number;
  };
}

/**
 * Represents a operation to be executed by the timelock.
 *
 * An operation encapsulates all the information needed to invoke a function
 * on a target contract after the timelock delay has passed.
 */
export interface Operation {
  /**
   * The serialized arguments to pass to the function
   */
  args: Array<any>;
  /**
   * The function name to invoke on the target contract
   */
  function_: string;
  /**
   * Hash of a predecessor operation that must be executed first.
   * Use BytesN::<32>::from_array(&[0u8; 32]) for no predecessor.
   */
  predecessor: Uint8Array;
  /**
   * A salt value for operation uniqueness.
   * Allows scheduling the same operation multiple times with different IDs.
   */
  salt: Uint8Array;
  /**
   * The contract address to call
   */
  target: string;
}

/**
 * The state of an operation in the timelock system.
 */
 export type OperationState =
  /**
   * Operation has not been scheduled
   */
  { tag: "Unset"; values: void } |
  /**
   * Operation is scheduled but the delay period has not passed
   */
  { tag: "Waiting"; values: void } |
  /**
   * Operation is ready to be executed (delay has passed)
   */
  { tag: "Ready"; values: void } |
  /**
   * Operation has been executed
   */
  { tag: "Done"; values: void };

/**
 * Storage keys for the timelock module.
 */
 export type TimelockStorageKey =
  /**
   * Minimum delay in ledgers for operations
   */
  { tag: "MinDelay"; values: void } |
  /**
   * Maps operation ID to the ledger sequence number when it will be in a
   * [`OperationState::Ready`] state (Note: value is 0 for
   * [`OperationState::Unset`], 1 for [`OperationState::Done`]).
   */
  { tag: "OperationLedger"; values: readonly [Uint8Array] };

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
 * Stores the pending role holder and the explicit deadline for acceptance.
 */
export interface PendingTransfer {
  address: string;
  live_until_ledger: number;
}

/**
 * Event emitted when a role is granted.
 */
export interface RoleGrantedEvent {
  name: "RoleGranted";
  data: {
    role: string;
    account: string;
    caller?: string;
  };
}

/**
 * Event emitted when a role is revoked.
 */
export interface RoleRevokedEvent {
  name: "RoleRevoked";
  data: {
    role: string;
    account: string;
    caller?: string;
  };
}

/**
 * Event emitted when the admin role is renounced.
 */
export interface AdminRenouncedEvent {
  name: "AdminRenounced";
  data: {
    admin: string;
  };
}

/**
 * Event emitted when a role admin is changed.
 */
export interface RoleAdminChangedEvent {
  name: "RoleAdminChanged";
  data: {
    role: string;
    previous_admin_role?: string;
    new_admin_role?: string;
  };
}

/**
 * Error Enum: AccessControlError
 */
export const AccessControlError = {
  2000 : { message: "Unauthorized" },
  2001 : { message: "AdminNotSet" },
  2002 : { message: "IndexOutOfBounds" },
  2003 : { message: "AdminRoleNotFound" },
  2004 : { message: "RoleCountIsNotZero" },
  2005 : { message: "RoleNotFound" },
  2006 : { message: "AdminAlreadySet" },
  2007 : { message: "RoleNotHeld" },
  2008 : { message: "RoleIsEmpty" },
  2009 : { message: "TransferInProgress" },
  2010 : { message: "MaxRolesExceeded" }
}

/**
 * Event emitted when an admin transfer is completed.
 */
export interface AdminTransferCompletedEvent {
  name: "AdminTransferCompleted";
  data: {
    new_admin: string;
    previous_admin?: string;
  };
}

/**
 * Event emitted when an admin transfer is initiated.
 */
export interface AdminTransferInitiatedEvent {
  name: "AdminTransferInitiated";
  data: {
    current_admin: string;
    new_admin?: string;
    live_until_ledger?: number;
  };
}

/**
 * Storage key for enumeration of accounts per role.
 */
export interface RoleAccountKey {
  index: number;
  role: string;
}

/**
 * Storage keys for the data associated with the access control
 */
 export type AccessControlStorageKey =
  { tag: "ExistingRoles"; values: void } |
  { tag: "RoleAccounts"; values: readonly [RoleAccountKey] } |
  { tag: "HasRole"; values: readonly [string, string] } |
  { tag: "RoleAccountsCount"; values: readonly [string] } |
  { tag: "RoleAdmin"; values: readonly [string] } |
  { tag: "Admin"; values: void } |
  { tag: "PendingAdmin"; values: void };

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
 * Storage keys for `Ownable` utility.
 */
 export type OwnableStorageKey =
  { tag: "Owner"; values: void } |
  { tag: "PendingOwner"; values: void };

/**
 * Context of a single authorized call performed by an address.
 *
 * Custom account contracts that implement `__check_auth` special function
 * receive a list of `Context` values corresponding to all the calls that
 * need to be authorized.
 */
 export type Context =
  /**
   * Contract invocation.
   */
  { tag: "Contract"; values: readonly [ContractContext] } |
  /**
   * Contract that has a constructor with no arguments is created.
   */
  { tag: "CreateContractHostFn"; values: readonly [CreateContractHostFnContext] } |
  /**
   * Contract that has a constructor with 1 or more arguments is created.
   */
  { tag: "CreateContractWithCtorHostFn"; values: readonly [CreateContractWithConstructorHostFnContext] };

/**
 * Authorization context of a single contract call.
 *
 * This struct corresponds to a `require_auth_for_args` call for an address
 * from `contract` function with `fn_name` name and `args` arguments.
 */
export interface ContractContext {
  args: Array<any>;
  contract: string;
  fn_name: string;
}

/**
 * Contract executable used for creating a new contract and used in
 * `CreateContractHostFnContext`.
 */
 export type ContractExecutable =
  { tag: "Wasm"; values: readonly [Uint8Array] };

/**
 * Value of contract node in InvokerContractAuthEntry tree.
 */
export interface SubContractInvocation {
  context: ContractContext;
  sub_invocations: Array<InvokerContractAuthEntry>;
}

/**
 * A node in the tree of authorizations performed on behalf of the current
 * contract as invoker of the contracts deeper in the call stack.
 *
 * This is used as an argument of `authorize_as_current_contract` host function.
 *
 * This tree corresponds `require_auth[_for_args]` calls on behalf of the
 * current contract.
 */
 export type InvokerContractAuthEntry =
  /**
   * Invoke a contract.
   */
  { tag: "Contract"; values: readonly [SubContractInvocation] } |
  /**
   * Create a contract passing 0 arguments to constructor.
   */
  { tag: "CreateContractHostFn"; values: readonly [CreateContractHostFnContext] } |
  /**
   * Create a contract passing 0 or more arguments to constructor.
   */
  { tag: "CreateContractWithCtorHostFn"; values: readonly [CreateContractWithConstructorHostFnContext] };

/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 */
export interface CreateContractHostFnContext {
  executable: ContractExecutable;
  salt: Uint8Array;
}

/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 * This is the same as `CreateContractHostFnContext`, but also has
 * contract constructor arguments.
 */
export interface CreateContractWithConstructorHostFnContext {
  constructor_args: Array<any>;
  executable: ContractExecutable;
  salt: Uint8Array;
}

/**
 * Union: Executable
 */
 export type Executable =
  { tag: "Wasm"; values: readonly [Uint8Array] } |
  { tag: "StellarAsset"; values: void } |
  { tag: "Account"; values: void };
    export type ContractEvent = ProposalQueuedEvent | TreasuryChangedEvent | QuorumBpsChangedEvent | QueueDelayChangedEvent | VotingDelayChangedEvent | GovernorInitializedEvent | VotingPeriodChangedEvent | TokenContractChangedEvent | GovernorAuthorityChangedEvent | ProposalThresholdChangedEvent | DelegateChangedEvent | DelegateVotesChangedEvent | VoteCastEvent | QuorumChangedEvent | ProposalQueuedEvent2 | ProposalCreatedEvent | ProposalExecutedEvent | ProposalCancelledEvent | MinDelayChangedEvent | OperationExecutedEvent | OperationCancelledEvent | OperationScheduledEvent | RoleGrantedEvent | RoleRevokedEvent | AdminRenouncedEvent | RoleAdminChangedEvent | AdminTransferCompletedEvent | AdminTransferInitiatedEvent | OwnershipTransferEvent | OwnershipRenouncedEvent | OwnershipTransferCompletedEvent;
    