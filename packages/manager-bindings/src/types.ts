import {Address} from '@stellar/stellar-sdk';

    /**
 * Manager errors (block `common::error::codes::MANAGER`).
 */
export const ManagerError = {
  /**
   * Implementation name is wrong for the slot it is used in
   */
  7101 : { message: "InvalidImplementationName" },
  /**
   * Manager hash/version missing, or `from_hash` is not the current hash
   */
  7102 : { message: "InvalidVersion" },
  /**
   * Implementation not registered (or revoked where an active one is required)
   */
  7103 : { message: "ImplementationNotFound" },
  /**
   * Implementation already revoked
   */
  7104 : { message: "ImplementationAlreadyRevoked" },
  /**
   * Upgrade target revoked, names differ, or the path is not approved
   */
  7105 : { message: "InvalidUpgradePath" },
  /**
   * Admin not set
   */
  7106 : { message: "AdminNotSet" },
  /**
   * No admin handover is pending
   */
  7107 : { message: "NoPendingAdmin" },
  /**
   * Platform minter not configured
   */
  7108 : { message: "PlatformMinterNotSet" },
  /**
   * An implementation is already registered for this WASM hash
   */
  7109 : { message: "ImplementationAlreadyRegistered" },
  /**
   * `enable_minter` requires `expected_minter` to equal the registered platform minter
   */
  7110 : { message: "PlatformMinterMismatch" },
  /**
   * Factory is paused (no `create_dao` or `launch_dao`)
   */
  7111 : { message: "FactoryPaused" },
  /**
   * Auction reserve price below `common::MIN_RESERVE_PRICE`
   */
  7112 : { message: "InvalidParamBounds" },
  /**
   * Quorum basis points outside 1..=10000
   */
  7113 : { message: "InvalidQuorumBps" },
  /**
   * Auction duration outside 5 minutes ..= 30 days
   */
  7114 : { message: "InvalidDuration" },
  /**
   * Auction time buffer outside 1..=86400 seconds
   */
  7115 : { message: "InvalidTimeBuffer" },
  /**
   * String longer than `common::MAX_STRING_LENGTH`
   */
  7116 : { message: "StringTooLong" },
  /**
   * String empty
   */
  7117 : { message: "StringEmpty" },
  /**
   * Governance timing out of range: each of voting delay, voting period and
   * queue delay must be within 300 seconds ..= 30 days (2_592_000 seconds)
   */
  7118 : { message: "InvalidGovernanceTiming" },
  /**
   * Proposal threshold must be at least 1
   */
  7119 : { message: "InvalidProposalThreshold" },
  /**
   * No voting-capable token exists; mint at least one token to a holder
   * other than the Treasury, Auction or Marketplace before launch
   */
  7120 : { message: "LaunchSupplyZero" },
  /**
   * A module of the pending DAO currently runs a revoked or unregistered
   * WASM hash; upgrade it (admin `upgrade` to an approved, non-revoked hash)
   * before launching
   */
  7121 : { message: "PendingDaoUsesRevokedImplementation" },
  /**
   * Slug is not 4-63 chars of `[a-z0-9-]` without a leading, trailing or
   * doubled hyphen
   */
  7122 : { message: "InvalidSlug" },
  /**
   * Slug is already claimed by a launched DAO
   */
  7123 : { message: "SlugTaken" },
  /**
   * Current implementations not set
   */
  7124 : { message: "CurrentImplementationsNotSet" },
  /**
   * Secondary-sale fee above `common::MAX_FEE_BPS`
   */
  7125 : { message: "InvalidFee" },
  /**
   * The launch admin is no longer the token admin
   */
  7126 : { message: "LaunchAdminNotOwner" },
  /**
   * No pending DAO for this token address
   */
  7127 : { message: "DaoNotFound" },
  /**
   * No launched DAO is registered under this slug
   */
  7128 : { message: "SlugNotFound" }
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
    /**
     * Requested slug. Not unique until claimed at launch (`SlugClaimed`).
     */
    slug?: string;
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
 * Emitted by `launch_dao` when the DAO's slug becomes its permanent, unique id.
 */
export interface SlugClaimedEvent {
  name: "SlugClaimed";
  data: {
    token_address: string;
    slug: string;
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
    upgraded_ledger?: bigint;
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
    approved_ledger?: bigint;
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
    deployed_ledger?: bigint;
  };
}

/**
 * Emitted by `update_pending_slug`.
 */
export interface PendingSlugUpdatedEvent {
  name: "PendingSlugUpdated";
  data: {
    token_address: string;
    slug?: string;
  };
}

/**
 * Event: ImplementationRevoked
 */
export interface ImplementationRevokedEvent {
  name: "ImplementationRevoked";
  data: {
    wasm_hash: Uint8Array;
    revoked_ledger?: bigint;
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
 * Emitted by `set_latest_implementation`.
 */
export interface LatestImplementationSetEvent {
  name: "LatestImplementationSet";
  data: {
    name: string;
    wasm_hash: Uint8Array;
    version?: string;
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
    published_ledger?: bigint;
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
 * pre-launch admin `upgrade` is honored and a revoked hash is rejected.
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
  /**
   * Requested slug; claimed at `launch_dao`, changeable with `update_pending_slug`.
   */
  slug: string;
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
  /**
   * Ledger sequence of the registration.
   */
  published_ledger: bigint;
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
  /**
   * Requested human-friendly DAO identifier (`[a-z0-9-]`, 4-63 chars).
   * Claimed (unique, permanent) only at `launch_dao`.
   */
  slug: string;
  token_name: string;
  token_symbol: string;
  token_uri: string;
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
    export type ContractEvent = DaoCreatedEvent | DaoLaunchedEvent | SlugClaimedEvent | AdminChangedEvent | AdminProposedEvent | FactoryPausedEvent | FactoryUnpausedEvent | ManagerUpgradedEvent | UpgradeApprovedEvent | PlatformMinterSetEvent | ManagerInitializedEvent | PendingSlugUpdatedEvent | ImplementationRevokedEvent | AdminProposalCancelledEvent | LatestImplementationSetEvent | ImplementationRegisteredEvent | CurrentImplementationsUpdatedEvent;
    