import {Address} from '@stellar/stellar-sdk';

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
   * No admin handover is pending
   */
  1007 : { message: "NoPendingAdmin" },
  /**
   * Platform minter not configured
   */
  1008 : { message: "PlatformMinterNotSet" },
  /**
   * An implementation is already registered for this WASM hash
   */
  1009 : { message: "ImplementationAlreadyRegistered" },
  /**
   * `enable_minter` requires `expected_minter` to equal the registered platform minter
   */
  1010 : { message: "PlatformMinterMismatch" },
  /**
   * Factory is paused
   */
  1101 : { message: "FactoryPaused" },
  /**
   * Invalid parameter bounds
   */
  1103 : { message: "InvalidParamBounds" },
  /**
   * Invalid quorum basis points
   */
  1105 : { message: "InvalidQuorumBps" },
  /**
   * Invalid duration
   */
  1107 : { message: "InvalidDuration" },
  /**
   * Invalid time buffer
   */
  1108 : { message: "InvalidTimeBuffer" },
  /**
   * String too long
   */
  1112 : { message: "StringTooLong" },
  /**
   * String empty
   */
  1113 : { message: "StringEmpty" },
  /**
   * Governance timing out of range: each of voting delay, voting period and
   * queue delay must be within 300 seconds ..= 30 days (2_592_000 seconds)
   */
  1117 : { message: "InvalidGovernanceTiming" },
  /**
   * Proposal threshold must be at least 1
   */
  1120 : { message: "InvalidProposalThreshold" },
  /**
   * Token total supply is zero; mint at least one token before launch
   */
  1121 : { message: "LaunchSupplyZero" },
  /**
   * A module of the pending DAO currently runs a revoked or unregistered
   * WASM hash; upgrade it (owner `upgrade` to an approved, non-revoked hash)
   * before launching
   */
  1122 : { message: "PendingDaoUsesRevokedImplementation" },
  /**
   * Current implementations not set
   */
  1116 : { message: "CurrentImplementationsNotSet" },
  /**
   * DAO not found
   */
  1201 : { message: "DaoNotFound" }
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
    modules?: DaoAddresses;
    /**
     * WASM hashes the modules were deployed from.
     */
    wasm_hashes?: DaoWasmHashes;
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
    modules?: DaoAddresses;
    launch_auction?: boolean;
    launch_marketplace?: boolean;
    enable_minter?: boolean;
  };
}

/**
 * Event: AdminChanged
 */
export interface AdminChangedEvent {
  name: "AdminChanged";
  data: {
    old_admin: string;
    new_admin: string;
  };
}

/**
 * Event: AdminProposed
 */
export interface AdminProposedEvent {
  name: "AdminProposed";
  data: {
    current_admin: string;
    proposed_admin: string;
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
 * Event: PlatformMinterSet
 */
export interface PlatformMinterSetEvent {
  name: "PlatformMinterSet";
  data: {
    minter: string;
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
 * Event: AdminProposalCancelled
 */
export interface AdminProposalCancelledEvent {
  name: "AdminProposalCancelled";
  data: {
    current_admin: string;
    cancelled_admin: string;
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
 * The only factory state retained until the launch administrator finalizes a DAO.
 *
 * Module WASM hashes are deliberately NOT stored: `launch_dao` reads each
 * module's current `wasm_hash()` and checks it against the registry, so a
 * pre-launch owner `upgrade` is honored and a revoked hash is rejected.
 */
export interface PendingDao {
  addresses: DaoAddresses;
  /**
   * Auction payment token chosen at create_dao; launch refuses if it changed.
   */
  auction_payment_asset: string;
  launch_admin: string;
  /**
   * Marketplace payment asset chosen at create_dao; launch refuses if it changed.
   */
  marketplace_payment_asset: string;
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
  /**
   * Grant mint authority to the Manager-registered PlatformMinter. The
   * caller can never name an arbitrary minter address.
   */
  enable_minter: boolean;
  /**
   * The platform minter the launch admin saw and approves. Required (and
   * must equal the registered PlatformMinter) when `enable_minter` is set,
   * so a Manager admin cannot swap the minter between signing and launch.
   * Ignored when `enable_minter` is false.
   */
  expected_minter: string | null;
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
 * WASM hashes the six modules were deployed from (emitted in `DaoCreated`).
 */
export interface DaoWasmHashes {
  auction: Uint8Array;
  governor: Uint8Array;
  marketplace: Uint8Array;
  metadata: Uint8Array;
  token: Uint8Array;
  treasury: Uint8Array;
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
    export type ContractEvent = DaoCreatedEvent | DaoLaunchedEvent | AdminChangedEvent | AdminProposedEvent | FactoryPausedEvent | FactoryUnpausedEvent | ManagerUpgradedEvent | UpgradeApprovedEvent | PlatformMinterSetEvent | ManagerInitializedEvent | ImplementationRevokedEvent | AdminProposalCancelledEvent | ImplementationRegisteredEvent | CurrentImplementationsUpdatedEvent;
    