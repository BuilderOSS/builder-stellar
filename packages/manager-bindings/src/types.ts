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
   * Founder allocations exceed the configured maximum
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
   * Invalid founder allocation
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
   * The auction must remain paused when it is not launched
   */
  1119 : { message: "AuctionMustBePaused" },
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

export type ManagerError = typeof ManagerError[keyof typeof ManagerError];

/**
 * Event: DaoCreated
 */
export interface DaoCreatedEvent {
  name: "DaoCreated";
  data: {
    token_address: string;
    deployer: string;
    launch_admin: string;
    created_ledger?: bigint;
    modules?: DaoModules;
  };
}

/**
 * Event: DaoLaunched
 */
export interface DaoLaunchedEvent {
  name: "DaoLaunched";
  data: {
    token_address: string;
    launched_ledger?: bigint;
    modules?: DaoModules;
    launch_auction?: boolean;
    launch_marketplace?: boolean;
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
 * Event: ManagerUpgraded
 */
export interface ManagerUpgradedEvent {
  name: "ManagerUpgraded";
  data: {
    from_hash: Uint8Array;
    to_hash: Uint8Array;
    from_version?: string;
    to_version?: string;
    upgraded_at?: bigint;
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
 * Event: ManagerInitialized
 */
export interface ManagerInitializedEvent {
  name: "ManagerInitialized";
  data: {
    admin: string;
    version?: string;
    deployed_at?: bigint;
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
    version?: string;
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
    marketplace?: Uint8Array;
  };
}

/**
 * Struct: DaoModules
 */
export interface DaoModules {
  auction: string;
  governor: string;
  marketplace: string;
  metadata: string;
  token: string;
  treasury: string;
}

/**
 * Union: ManagerKey
 */
 export type ManagerKey =
  { tag: "Admin"; values: void } |
  { tag: "FactoryPaused"; values: void } |
  { tag: "Implementation"; values: readonly [Uint8Array] } |
  { tag: "LatestImplementation"; values: readonly [string] } |
  { tag: "UpgradeApproval"; values: readonly [Uint8Array, Uint8Array] } |
  { tag: "CurrentTokenWasm"; values: void } |
  { tag: "CurrentMetadataWasm"; values: void } |
  { tag: "CurrentAuctionWasm"; values: void } |
  { tag: "CurrentGovernorWasm"; values: void } |
  { tag: "CurrentTreasuryWasm"; values: void } |
  { tag: "CurrentMarketplaceWasm"; values: void } |
  { tag: "CurrentManagerWasm"; values: void } |
  { tag: "CurrentManagerVersion"; values: void } |
  { tag: "PendingDao"; values: readonly [string] };

/**
 * The only factory state retained until the launch administrator finalizes a DAO.
 */
export interface PendingDao {
  addresses: DaoAddresses;
  launch_admin: string;
}

/**
 * Struct: DaoAddresses
 */
export interface DaoAddresses {
  auction: string;
  governor: string;
  marketplace: string;
  metadata: string;
  token: string;
  treasury: string;
}

/**
 * Struct: LaunchConfig
 */
export interface LaunchConfig {
  launch_auction: boolean;
  launch_marketplace: boolean;
}

/**
 * Struct: AuctionConfig
 */
export interface AuctionConfig {
  duration: bigint;
  payment_asset: string;
  reserve_price: bigint;
  time_buffer: bigint;
}

/**
 * Struct: UpgradeApproval
 */
export interface UpgradeApproval {
  approved_at: bigint;
  from_hash: Uint8Array;
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
 * Struct: GovernanceConfig
 */
export interface GovernanceConfig {
  proposal_threshold: bigint;
  queue_delay: number;
  quorum_bps: number;
  voting_delay: number;
  voting_period: number;
}

/**
 * Struct: DaoCreationParams
 */
export interface DaoCreationParams {
  deployer: string;
  initial_config: InitialDaoConfigValues;
  launch_admin: string;
  nonce: bigint;
}

/**
 * Struct: MarketplaceConfig
 */
export interface MarketplaceConfig {
  payment_asset: string;
  secondary_fee_bps: number;
}

/**
 * Struct: ImplementationVersion
 */
export interface ImplementationVersion {
  name: string;
  published_at: bigint;
  revoked: boolean;
  version: string;
  wasm_hash: Uint8Array;
}

/**
 * Struct: InitialDaoConfigValues
 */
export interface InitialDaoConfigValues {
  auction: AuctionConfig;
  contract_image: string;
  description: string;
  governance: GovernanceConfig;
  marketplace: MarketplaceConfig;
  project_uri: string;
  renderer_base: string;
  token_name: string;
  token_symbol: string;
  token_uri: string;
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
    export type ContractEvent = DaoCreatedEvent | DaoLaunchedEvent | FactoryPausedEvent | FactoryUnpausedEvent | ManagerUpgradedEvent | UpgradeApprovedEvent | ManagerInitializedEvent | ImplementationRevokedEvent | ImplementationRegisteredEvent | CurrentImplementationsUpdatedEvent;
    