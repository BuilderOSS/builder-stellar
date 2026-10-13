import {Address} from '@stellar/stellar-sdk';

    /**
 * Token errors (block `common::error::codes::TOKEN`).
 */
export const TokenError = {
  /**
   * The minter is neither the admin nor a registered module allowed to mint
   * now (before launch only the `claims` module may)
   */
  7201 : { message: "MintAuthorityNotAllowed" },
  /**
   * Invalid input parameters (mismatched lengths, zero amounts, etc.)
   */
  7202 : { message: "InvalidInput" },
  /**
   * `launch` treasury differs from the treasury wired at construction
   */
  7203 : { message: "TreasuryMismatch" },
  /**
   * `batch_mint` exceeds the event budget (`common::batch_mint_fits`)
   */
  7205 : { message: "BatchTooLarge" },
  /**
   * The collection name contains `"`, `\` or a control character
   */
  7207 : { message: "InvalidName" },
  /**
   * The metadata contract address is missing from the instance
   */
  7208 : { message: "MetadataNotSet" },
  /**
   * The address is not a registered module
   */
  7209 : { message: "NotAModule" },
  /**
   * Only deployed Wasm contracts can be modules (not wallets, Stellar Asset
   * Contracts or predicted addresses)
   */
  7210 : { message: "NotAContract" },
  /**
   * The kind is not a built-in kind or `custom_<name>`
   */
  7211 : { message: "InvalidKind" },
  /**
   * Another module already has this kind
   */
  7212 : { message: "KindTaken" },
  /**
   * The address is already registered
   */
  7213 : { message: "ModuleAlreadyRegistered" },
  /**
   * The registry already holds `common::modules::MAX_MODULES` modules
   */
  7214 : { message: "TooManyModules" },
  /**
   * The mint exceeds the module's remaining allowance
   */
  7215 : { message: "AllowanceExceeded" },
  /**
   * The token is locked and this movement or approval is not one of the
   * DAO-controlled paths (docs/designs/locked-tokens.md)
   */
  7216 : { message: "TransfersLocked" },
  /**
   * A switch or transfer agent was set to the value it already has
   */
  7217 : { message: "SettingUnchanged" },
  /**
   * `dao_transfer` while `dao_recovery` is off
   */
  7218 : { message: "RecoveryOff" },
  /**
   * `agent_transfer` by a module the DAO has not made a transfer agent
   */
  7219 : { message: "NotTransferAgent" },
  /**
   * `dao_transfer` from or to a registered module (custody keeps its own
   * records)
   */
  7220 : { message: "ModuleCustody" },
  /**
   * Members-only delegation: the delegatee holds no token or holds no votes
   */
  7221 : { message: "DelegateNotMember" }
}

/**
 * The DAO moved a token by proposal (`dao_transfer`; next to
 * OpenZeppelin's `Transfer`): lost-key recovery or recall.
 */
export interface DaoTransferEvent {
  name: "DaoTransfer";
  data: {
    from: string;
    to: string;
    token_id?: number;
    changed_by?: string;
  };
}

/**
 * A transfer agent moved a token (next to OpenZeppelin's `Transfer`).
 */
export interface AgentTransferEvent {
  name: "AgentTransfer";
  data: {
    agent: string;
    from?: string;
    to?: string;
    token_id?: number;
  };
}

/**
 * Emitted once when the Manager launches the token (Setup -> Live).
 */
export interface TokenLaunchedEvent {
  name: "TokenLaunched";
  data: {
    treasury: string;
    /**
     * The initial mint allowances `launch` wrote.
     */
    grants?: Array<MintGrant>;
  };
}

/**
 * Emitted for every token minted by `mint`, next to OpenZeppelin's `Mint`, to
 * record who performed the mint (the admin or a module).
 * `batch_mint` emits `MintBatchWithMinter` instead.
 */
export interface MintWithMinterEvent {
  name: "MintWithMinter";
  data: {
    minter: string;
    to: string;
    token_id?: number;
  };
}

/**
 * Emitted by `set_metadata` (admin only). OpenZeppelin's `set_metadata`
 * writes storage silently; this makes a rename visible to indexers.
 */
export interface MetadataUpdatedEvent {
  name: "MetadataUpdated";
  data: {
    name?: string;
    symbol?: string;
  };
}

/**
 * Emitted when a module joins the registry (the Manager at `create_dao` /
 * `create_module` in Setup, the Treasury by proposal once live).
 * The indexer allowlists modules from this event.
 */
export interface ModuleRegisteredEvent {
  name: "ModuleRegistered";
  data: {
    kind: string;
    address?: string;
    non_voting?: boolean;
  };
}

/**
 * Emitted once by the constructor.
 */
export interface TokenInitializedEvent {
  name: "TokenInitialized";
  data: {
    admin: string;
    name?: string;
    symbol?: string;
    /**
     * The membership switches chosen at creation.
     */
    settings?: TokenSettings;
  };
}

/**
 * `set_dao_recovery`: DAO recovery (`dao_transfer`) was turned on or off.
 */
export interface DaoRecoveryChangedEvent {
  name: "DaoRecoveryChanged";
  data: {
    enabled?: boolean;
    changed_by?: string;
  };
}

/**
 * Emitted when a module leaves the registry.
 */
export interface ModuleUnregisteredEvent {
  name: "ModuleUnregistered";
  data: {
    kind: string;
    address?: string;
  };
}

/**
 * Emitted once per `batch_mint` call for the contiguous range
 * `[first_token_id, first_token_id + count)`, instead of one
 * `MintWithMinter` per token (keeps large batches under the per-transaction
 * event size limit). Recipients come from OpenZeppelin's per-token `Mint`.
 */
export interface MintBatchWithMinterEvent {
  name: "MintBatchWithMinter";
  data: {
    minter: string;
    first_token_id?: number;
    count?: number;
  };
}

/**
 * Emitted when a module's mint allowance is set by `launch`, raised or
 * lowered by the admin, zeroed by `unregister_module`, or released by the
 * module itself. Not emitted when a mint spends allowance (the remaining
 * amount is readable with `mint_allowance`).
 */
export interface MintAllowanceChangedEvent {
  name: "MintAllowanceChanged";
  data: {
    module: string;
    old_allowance?: number;
    allowance?: number;
    changed_by?: string;
  };
}

/**
 * A module became (or stopped being) a transfer agent: `set_transfer_agent`
 * or `unregister_module`.
 */
export interface TransferAgentChangedEvent {
  name: "TransferAgentChanged";
  data: {
    module: string;
    enabled?: boolean;
    changed_by?: string;
  };
}

/**
 * `set_transfers_locked`: the lock was turned on or off.
 */
export interface TransfersLockChangedEvent {
  name: "TransfersLockChanged";
  data: {
    locked?: boolean;
    changed_by?: string;
  };
}

/**
 * `set_members_only_delegation`: the delegation rule changed.
 */
export interface MembersOnlyDelegationChangedEvent {
  name: "MembersOnlyDelegationChanged";
  data: {
    enabled?: boolean;
    changed_by?: string;
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
   * The Manager's own `CurrentManagerVersion` missing from storage.
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
 * An initial mint allowance written by the Token's `launch`.
 */
export interface MintGrant {
  allowance: number;
  module: string;
}

/**
 * One registry entry.
 */
export interface ModuleEntry {
  address: string;
  kind: string;
  /**
   * Tokens this module holds carry no votes (custody: Auction, Marketplace).
   */
  non_voting: boolean;
}

/**
 * A DAO's membership token switches (docs/designs/locked-tokens.md), chosen
 * at `create_dao` and changeable by the Token's admin: the launch admin in
 * Setup, the Treasury by proposal once Live. All off reproduces an open DAO.
 */
export interface TokenSettings {
  /**
   * The Treasury may move any member's token by proposal (`dao_transfer`).
   */
  dao_recovery: boolean;
  /**
   * Holders delegate only to themselves or to another voting member.
   */
  members_only_delegation: boolean;
  /**
   * Tokens move only along DAO-controlled paths (`TransfersLocked`).
   */
  transfers_locked: boolean;
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
 * Event emitted when a token is minted.
 */
export interface MintEvent {
  name: "Mint";
  data: {
    to: string;
    token_id?: number;
  };
}

/**
 * Event emitted when an approval is granted.
 */
export interface ApproveEvent {
  name: "Approve";
  data: {
    approver: string;
    token_id: number;
    approved?: string;
    live_until_ledger?: number;
  };
}

/**
 * Event emitted when a token is transferred.
 */
export interface TransferEvent {
  name: "Transfer";
  data: {
    from: string;
    to: string;
    token_id?: number;
  };
}

/**
 * Event emitted when approval for all tokens is granted.
 */
export interface ApproveForAllEvent {
  name: "ApproveForAll";
  data: {
    owner: string;
    operator?: string;
    live_until_ledger?: number;
  };
}

/**
 * Error Enum: NonFungibleTokenError
 */
export const NonFungibleTokenError = {
  /**
   * Indicates a non-existent `token_id`.
   */
  200 : { message: "NonExistentToken" },
  /**
   * Indicates an error related to the ownership over a particular token.
   * Used in transfers.
   */
  201 : { message: "IncorrectOwner" },
  /**
   * Indicates a failure with the `operator`s approval. Used in transfers.
   */
  202 : { message: "InsufficientApproval" },
  /**
   * Indicates a failure with the `approver` of a token to be approved. Used
   * in approvals.
   */
  203 : { message: "InvalidApprover" },
  /**
   * Indicates an invalid value for `live_until_ledger` when setting
   * approvals.
   */
  204 : { message: "InvalidLiveUntilLedger" },
  /**
   * Indicates overflow when adding two values
   */
  205 : { message: "MathOverflow" },
  /**
   * Indicates all possible `token_id`s are already in use.
   */
  206 : { message: "TokenIDsAreDepleted" },
  /**
   * Indicates an invalid amount to batch mint in `consecutive` extension.
   */
  207 : { message: "InvalidAmount" },
  /**
   * Indicates the token does not exist in owner's list.
   */
  208 : { message: "TokenNotFoundInOwnerList" },
  /**
   * Indicates the token does not exist in global list.
   */
  209 : { message: "TokenNotFoundInGlobalList" },
  /**
   * Indicates access to unset metadata.
   */
  210 : { message: "UnsetMetadata" },
  /**
   * Indicates the length of the base URI exceeds the maximum allowed.
   */
  211 : { message: "BaseUriMaxLenExceeded" },
  /**
   * Indicates the royalty amount is higher than 10_000 (100%) basis points.
   */
  212 : { message: "InvalidRoyaltyAmount" },
  /**
   * Indicates the length of the name exceeds the maximum allowed.
   */
  213 : { message: "NameMaxLenExceeded" },
  /**
   * Indicates the length of the symbol exceeds the maximum allowed.
   */
  214 : { message: "SymbolMaxLenExceeded" }
}
    export type ContractEvent = DaoTransferEvent | AgentTransferEvent | TokenLaunchedEvent | MintWithMinterEvent | MetadataUpdatedEvent | ModuleRegisteredEvent | TokenInitializedEvent | DaoRecoveryChangedEvent | ModuleUnregisteredEvent | MintBatchWithMinterEvent | MintAllowanceChangedEvent | TransferAgentChangedEvent | TransfersLockChangedEvent | MembersOnlyDelegationChangedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent | DelegateChangedEvent | DelegateVotesChangedEvent | MintEvent | ApproveEvent | TransferEvent | ApproveForAllEvent;
    