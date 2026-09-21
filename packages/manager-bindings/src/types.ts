import {Address, xdr} from '@stellar/stellar-sdk';

    /**
 * Error Enum: ManagerError
 */
export const ManagerError = {
  /**
   * Not authorized to perform this action
   */
  1000 : { message: "Unauthorized" },
  /**
   * Invalid implementation name
   */
  1001 : { message: "InvalidImplementationName" },
  /**
   * Invalid version number
   */
  1002 : { message: "InvalidVersion" },
  /**
   * Implementation not found
   */
  1003 : { message: "ImplementationNotFound" },
  /**
   * Implementation already revoked
   */
  1004 : { message: "ImplementationAlreadyRevoked" },
  /**
   * Invalid upgrade path
   */
  1005 : { message: "InvalidUpgradePath" },
  /**
   * Admin not set
   */
  1006 : { message: "AdminNotSet" },
  /**
   * DAO creation failed
   */
  1100 : { message: "DaoCreationFailed" },
  /**
   * Factory is paused
   */
  1101 : { message: "FactoryPaused" },
  /**
   * Nonce already used
   */
  1102 : { message: "NonceAlreadyUsed" },
  /**
   * Invalid parameter bounds
   */
  1103 : { message: "InvalidParamBounds" },
  /**
   * Founders exceed 99 percent
   */
  1104 : { message: "FoundersExceed99Percent" },
  /**
   * Invalid quorum basis points
   */
  1105 : { message: "InvalidQuorumBps" },
  /**
   * Invalid proposal threshold basis points
   */
  1106 : { message: "InvalidProposalThresholdBps" },
  /**
   * Invalid duration
   */
  1107 : { message: "InvalidDuration" },
  /**
   * Invalid time buffer
   */
  1108 : { message: "InvalidTimeBuffer" },
  /**
   * Deployment failed
   */
  1109 : { message: "DeploymentFailed" },
  /**
   * Initialization failed
   */
  1110 : { message: "InitializationFailed" },
  /**
   * Invalid payment asset
   */
  1111 : { message: "InvalidPaymentAsset" },
  /**
   * String too long
   */
  1112 : { message: "StringTooLong" },
  /**
   * String empty
   */
  1113 : { message: "StringEmpty" },
  /**
   * Invalid founder allocation
   */
  1114 : { message: "NoFoundersSpecified" },
  /**
   * Invalid founder percentage
   */
  1115 : { message: "InvalidFounderPercentage" },
  /**
   * Governance timing does not fit the Governor contract's u32 fields
   */
  1117 : { message: "InvalidGovernanceTiming" },
  /**
   * Founder allocations exceed the factory resource limit
   */
  1118 : { message: "FounderAllocationTooLarge" },
  /**
   * Current implementations not set
   */
  1116 : { message: "CurrentImplementationsNotSet" },
  /**
   * DAO already registered
   */
  1200 : { message: "DaoAlreadyRegistered" },
  /**
   * DAO not found
   */
  1201 : { message: "DaoNotFound" },
  /**
   * Invalid pagination parameters
   */
  1202 : { message: "InvalidPaginationParams" }
}

/**
 * Event: DaoCreated
 */
export interface DaoCreatedEvent {
  name: "DaoCreated";
  data: {
    token_address: string;
    creator: string;
    created_ledger?: number;
    modules?: DaoModules;
    founders?: Array<FounderAllocation>;
  };
}

/**
 * Event: DaoRegistered
 */
export interface DaoRegisteredEvent {
  name: "DaoRegistered";
  data: {
    token_address: string;
    creator: string;
    modules?: DaoModules;
  };
}

/**
 * Event: FactoryPaused
 */
export interface FactoryPausedEvent {
  name: "FactoryPaused";
  data: {

  };
}

/**
 * Event: FactoryUnpaused
 */
export interface FactoryUnpausedEvent {
  name: "FactoryUnpaused";
  data: {

  };
}

/**
 * Event: UpgradeApproved
 */
export interface UpgradeApprovedEvent {
  name: "UpgradeApproved";
  data: {
    from_hash: Uint8Array;
    to_hash: Uint8Array;
    approved_at?: bigint;
  };
}

/**
 * Event: ImplementationRevoked
 */
export interface ImplementationRevokedEvent {
  name: "ImplementationRevoked";
  data: {
    wasm_hash: Uint8Array;
    revoked_at?: bigint;
  };
}

/**
 * Event: ImplementationRegistered
 */
export interface ImplementationRegisteredEvent {
  name: "ImplementationRegistered";
  data: {
    name?: string;
    version?: number;
    wasm_hash: Uint8Array;
    published_at?: bigint;
  };
}

/**
 * Event: CurrentImplementationsUpdated
 */
export interface CurrentImplementationsUpdatedEvent {
  name: "CurrentImplementationsUpdated";
  data: {
    token?: Uint8Array;
    metadata?: Uint8Array;
    auction?: Uint8Array;
    governor?: Uint8Array;
    treasury?: Uint8Array;
  };
}

/**
 * Module addresses for a DAO (same as DaoAddresses but for registry context).
 */
export interface DaoModules {
  auction: string;
  governor: string;
  metadata: string;
  token: string;
  treasury: string;
}

/**
 * Storage keys for the Manager contract.
 */
 export type ManagerKey =
  { tag: "Admin"; values: void } |
  { tag: "FactoryPaused"; values: void } |
  { tag: "FactoryVersion"; values: void } |
  { tag: "Implementation"; values: readonly [Uint8Array] } |
  { tag: "LatestImplementation"; values: readonly [string] } |
  { tag: "UpgradeApproval"; values: readonly [Uint8Array, Uint8Array] } |
  { tag: "CurrentTokenWasm"; values: void } |
  { tag: "CurrentMetadataWasm"; values: void } |
  { tag: "CurrentAuctionWasm"; values: void } |
  { tag: "CurrentGovernorWasm"; values: void } |
  { tag: "CurrentTreasuryWasm"; values: void } |
  { tag: "DaoCreation"; values: readonly [string] } |
  { tag: "NonceUsed"; values: readonly [string, bigint] } |
  { tag: "DaoRegistration"; values: readonly [string] } |
  { tag: "DaoList"; values: void } |
  { tag: "DaoCount"; values: void };

/**
 * Struct: ArtworkItem
 */
export interface ArtworkItem {
  is_new_property: boolean;
  name: string;
  property_id: number;
}

/**
 * Complete record of a DAO creation.
 */
export interface DaoCreation {
  /**
   * All module addresses
   */
  addresses: DaoAddresses;
  /**
   * Timestamp when created
   */
  created_at: bigint;
  /**
   * Ledger sequence when created
   */
  created_ledger: number;
  /**
   * Creator address
   */
  creator: string;
  /**
   * Creation parameters
   */
  params: DaoCreationParams;
}

/**
 * Metadata about a DAO.
 */
export interface DaoMetadata {
  /**
   * Optional description (can be updated by governance)
   */
  description: string | null;
  /**
   * DAO name
   */
  name: string;
}

/**
 * Addresses of all deployed DAO modules.
 */
export interface DaoAddresses {
  auction: string;
  governor: string;
  metadata: string;
  token: string;
  treasury: string;
}

/**
 * Complete registration record for a DAO.
 */
export interface DaoRegistration {
  /**
   * Timestamp when created
   */
  created_at: bigint;
  /**
   * Ledger when created
   */
  created_ledger: number;
  /**
   * Creator address
   */
  creator: string;
  /**
   * Manager version that created this DAO
   */
  factory_version: number;
  /**
   * DAO metadata
   */
  metadata: DaoMetadata;
  /**
   * All module addresses
   */
  modules: DaoModules;
  /**
   * Token address (canonical DAO ID)
   */
  token_address: string;
}

/**
 * Represents an approved upgrade path between two implementations.
 */
export interface UpgradeApproval {
  /**
   * Ledger sequence when approved
   */
  approved_at: bigint;
  /**
   * Source WASM hash
   */
  from_hash: Uint8Array;
  /**
   * Target WASM hash
   */
  to_hash: Uint8Array;
}

/**
 * Struct: ArtworkIpfsGroup
 */
export interface ArtworkIpfsGroup {
  base_uri: string;
  extension: string;
}

/**
 * Complete parameters for creating a new DAO.
 */
export interface DaoCreationParams {
  artwork_ipfs: ArtworkIpfsGroup;
  artwork_items: Array<ArtworkItem>;
  artwork_property_names: Array<string>;
  auction_duration: bigint;
  contract_image: string;
  /**
   * Who's creating this DAO
   */
  deployer: string;
  description: string;
  founders: Array<FounderAllocation>;
  launch_admin: string;
  /**
   * Uniqueness key (user increments to avoid collisions)
   */
  nonce: bigint;
  payment_asset: string;
  project_uri: string;
  proposal_threshold_bps: number;
  quorum_bps: number;
  renderer_base: string;
  reserve_price: bigint;
  time_buffer: bigint;
  token_name: string;
  token_symbol: string;
  token_uri: string;
  voting_delay: bigint;
  voting_period: bigint;
}

/**
 * Fixed founder allocation minted before the DAO is launched.
 */
export interface FounderAllocation {
  /**
   * Founder address receiving tokens
   */
  address: string;
  /**
   * Number of NFTs to mint
   */
  amount: number;
}

/**
 * Represents a registered contract implementation version.
 */
export interface ImplementationVersion {
  /**
   * Implementation name (e.g., "Token", "Governor", "Metadata")
   */
  name: string;
  /**
   * Ledger sequence when published
   */
  published_at: bigint;
  /**
   * Whether this implementation has been revoked (emergency measure)
   */
  revoked: boolean;
  /**
   * Version number (monotonically increasing)
   */
  version: number;
  /**
   * WASM bytecode hash
   */
  wasm_hash: Uint8Array;
}

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
    export type ContractEvent = DaoCreatedEvent | DaoRegisteredEvent | FactoryPausedEvent | FactoryUnpausedEvent | UpgradeApprovedEvent | ImplementationRevokedEvent | ImplementationRegisteredEvent | CurrentImplementationsUpdatedEvent;
    