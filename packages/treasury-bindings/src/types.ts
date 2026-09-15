import {Address, xdr} from '@stellar/stellar-sdk';

    /**
 * Event: Execute
 */
export interface ExecuteEvent {
  name: "Execute";
  data: {
    governor: string;
    target: string;
    function?: string;
  };
}

/**
 * Event: GovernorChanged
 */
export interface GovernorChangedEvent {
  name: "GovernorChanged";
  data: {
    old_governor: string;
    new_governor: string;
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
  };
}

/**
 * Storage keys for treasury-specific instance data.
 *
 * The Treasury maintains minimal state, storing only the Governor address.
 * All other data (ownership) is managed by the Ownable trait.
 */
 export type TreasuryKey =
  /**
   * Address of the Governor contract authorized to execute proposals.
   *
   * Only this contract can invoke the `execute()` function. The owner
   * can update this address if needed.
   */
  { tag: "Governor"; values: void };

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
    export type ContractEvent = ExecuteEvent | GovernorChangedEvent | TreasuryInitializedEvent | RoleGrantedEvent | RoleRevokedEvent | AdminRenouncedEvent | RoleAdminChangedEvent | AdminTransferCompletedEvent | AdminTransferInitiatedEvent | OwnershipTransferEvent | OwnershipRenouncedEvent | OwnershipTransferCompletedEvent;
    