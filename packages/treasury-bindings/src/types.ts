import {Address, xdr} from '@stellar/stellar-sdk';

    /**
 * Treasury errors (block `common::error::codes::TREASURY`).
 */
export const TreasuryError = {
  /**
   * `launch` treasury is not this contract
   */
  7601 : { message: "TreasuryMismatch" },
  /**
   * A proposal action targets the Treasury with a function outside the allowlist
   */
  7602 : { message: "UnknownSelfCall" },
  /**
   * Wrong number or type of arguments for an allowlisted self call
   */
  7603 : { message: "InvalidSelfCallArgs" },
  /**
   * `targets`, `functions` and `args` lengths differ
   */
  7604 : { message: "InvalidProposalLength" },
  /**
   * An `authorize` action is malformed, too large, or not followed by an
   * external call it can apply to
   */
  7605 : { message: "InvalidAuthorization" }
}

/**
 * Emitted for every executed proposal action, including self calls and
 * `authorize` actions.
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
export interface TreasuryLaunchedEvent {
  name: "TreasuryLaunched";
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
    admin: string;
    governor?: string;
    version?: string;
  };
}

/**
 * One contract invocation the Treasury pre-authorizes, with the invocations
 * below it that also need the Treasury's authorization.
 *
 * A proposal action aimed at the Treasury itself with function `authorize`
 * and a single `Vec<AuthNode>` argument adds these trees to the Treasury's
 * authorization for the *next* action. Use it when the next call reaches a
 * contract that requires the Treasury's auth deeper in the call stack (for
 * example a token `transfer` from the Treasury made by a marketplace or an
 * AMM). Because it is an ordinary action, the trees are part of the proposal
 * id and voters approve them with the rest of the proposal.
 */
export interface AuthNode {
  args: Array<any>;
  contract: string;
  fn_name: string;
  sub: Array<AuthNode>;
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
    export type ContractEvent = ExecuteEvent | TreasuryLaunchedEvent | TreasuryInitializedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent | VersionSyncedEvent;
    