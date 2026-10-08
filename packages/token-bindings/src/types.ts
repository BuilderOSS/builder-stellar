import {Address} from '@stellar/stellar-sdk';

    /**
 * Error Enum: TokenError
 */
export const TokenError = {
  /**
   * Owner not set in contract storage
   */
  1102 : { message: "OwnerNotSet" },
  /**
   * Minter is not authorized to mint tokens
   */
  1103 : { message: "MintAuthorityNotAllowed" },
  /**
   * Invalid input parameters (mismatched lengths, zero amounts, etc.)
   */
  1104 : { message: "InvalidInput" },
  /**
   * `launch` treasury differs from the treasury wired at construction
   */
  1105 : { message: "TreasuryMismatch" },
  /**
   * `launch` minters list does not contain the treasury
   */
  1106 : { message: "TreasuryNotMinter" }
}

/**
 * Emitted once when the Manager launches the token (Setup -> Live).
 */
export interface LaunchedEvent {
  name: "Launched";
  data: {
    treasury: string;
    minters?: Array<string>;
  };
}

/**
 * Custom event to track minter information during single token mints.
 *
 * OpenZeppelin's standard Mint event doesn't include the minter address, only
 * the recipient. This custom event supplements it by tracking who performed the mint,
 * which is useful for auditing and analytics (e.g., distinguishing owner mints
 * from auction contract mints).
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
 * Emitted when the token contract is initialized.
 *
 * Contains the initial owner and token metadata. This event is emitted once
 * during contract deployment via the `__constructor` function.
 */
export interface TokenInitializedEvent {
  name: "TokenInitialized";
  data: {
    owner: string;
    uri?: string;
    name?: string;
    symbol?: string;
    version?: string;
  };
}

/**
 * Emitted when minting authority is granted or revoked for an address.
 *
 * Tracks changes to mint permissions, including who made the change (always the owner).
 * The owner always has implicit minting authority regardless of this flag.
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
    export type ContractEvent = LaunchedEvent | MintWithMinterEvent | TokenInitializedEvent | MintAuthorityChangedEvent | OwnershipTransferEvent | OwnershipRenouncedEvent | OwnershipTransferCompletedEvent | DelegateChangedEvent | DelegateVotesChangedEvent | MintEvent | ApproveEvent | TransferEvent;
    