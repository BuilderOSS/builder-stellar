import {Address} from '@stellar/stellar-sdk';

    /**
 * Error Enum: TreasuryError
 */
export const TreasuryError = {
  /**
   * `launch` treasury argument is not this contract's address
   */
  1401 : { message: "TreasuryMismatch" },
  /**
   * A proposal targeted the Treasury with a function outside the allowlist
   */
  1402 : { message: "UnknownSelfCall" },
  /**
   * Malformed arguments for an allowlisted self call
   */
  1403 : { message: "InvalidSelfCallArgs" },
  /**
   * targets/functions/args lengths differ
   */
  1404 : { message: "InvalidProposalLength" }
}

/**
 * Event: Execute
 */
export interface ExecuteEvent {
  name: "Execute";
  data: {
    governor: string;
    target: string;
    proposal_id: Uint8Array;
    function?: string;
    /**
     * Position of the call within the proposal.
     */
    index?: number;
  };
}

/**
 * Emitted once when the Manager launches the treasury (Setup -> Live).
 */
export interface LaunchedEvent {
  name: "Launched";
  data: {
    treasury: string;
  };
}

/**
 * Event: TreasuryInitialized
 */
export interface TreasuryInitializedEvent {
  name: "TreasuryInitialized";
  data: {
    owner: string;
    governor?: string;
    version?: string;
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
    export type ContractEvent = ExecuteEvent | LaunchedEvent | TreasuryInitializedEvent | UpgradedEvent | VersionSyncedEvent | OwnershipTransferEvent | OwnershipRenouncedEvent | OwnershipTransferCompletedEvent;
    