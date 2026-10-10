import {Address} from '@stellar/stellar-sdk';

    /**
 * Token errors (block `common::error::codes::TOKEN`).
 */
export const TokenError = {
  /**
   * Minter is not authorized to mint tokens
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
   * `launch` minters list does not contain the treasury
   */
  7204 : { message: "TreasuryNotMinter" },
  /**
   * `batch_mint` exceeds the event budget (`common::batch_mint_fits`)
   */
  7205 : { message: "BatchTooLarge" }
}

/**
 * Emitted once when the Manager launches the token (Setup -> Live).
 */
export interface TokenLaunchedEvent {
  name: "TokenLaunched";
  data: {
    treasury: string;
    minters?: Array<string>;
  };
}

/**
 * Emitted for every token minted by `mint`, next to OpenZeppelin's `Mint`, to
 * record who performed the mint (admin, auction, marketplace, minter).
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
 * Emitted once by the constructor.
 */
export interface TokenInitializedEvent {
  name: "TokenInitialized";
  data: {
    admin: string;
    uri?: string;
    name?: string;
    symbol?: string;
    version?: string;
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
 * Emitted when minting authority is granted or revoked for an address.
 */
export interface MintAuthorityChangedEvent {
  name: "MintAuthorityChanged";
  data: {
    authority: string;
    old_enabled?: boolean;
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
    export type ContractEvent = TokenLaunchedEvent | MintWithMinterEvent | TokenInitializedEvent | MintBatchWithMinterEvent | MintAuthorityChangedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent | VersionSyncedEvent | DelegateChangedEvent | DelegateVotesChangedEvent | MintEvent | ApproveEvent | TransferEvent;
    