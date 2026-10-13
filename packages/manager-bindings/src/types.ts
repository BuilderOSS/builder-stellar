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
   * An implementation is already registered for this WASM hash
   */
  7109 : { message: "ImplementationAlreadyRegistered" },
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
  7128 : { message: "SlugNotFound" },
  /**
   * `change_slug` to the slug the DAO already has
   */
  7129 : { message: "SlugUnchanged" },
  /**
   * The Manager's own upgrade was approved less than `upgrade_delay()` ledgers ago.
   */
  7130 : { message: "UpgradeDelayNotElapsed" },
  /**
   * `upgrade_manager` to a hash that is not the latest Manager implementation.
   */
  7131 : { message: "UpgradeNotLatest" },
  /**
   * A module's payment asset differs from the one recorded when it was
   * created (the launch admin changed it in Setup); change it back first
   */
  7132 : { message: "PaymentAssetMismatch" },
  /**
   * `modules` lists a kind twice
   */
  7133 : { message: "InvalidModules" },
  /**
   * `create_module`'s `expected_n` is not `module_count(token, kind)`: a
   * module of this kind was created since the proposal was drafted
   */
  7134 : { message: "StaleModuleIndex" },
  /**
   * The DAO has no ClaimMinter registered (or no claims payment asset)
   */
  7135 : { message: "NoClaimMinter" },
  /**
   * An assurance drive is already recorded for this DAO
   */
  7136 : { message: "AssuranceExists" },
  /**
   * The assurance deadline is more than `MAX_ASSURANCE_WINDOW` (90 days) out
   */
  7137 : { message: "DeadlineTooFar" },
  /**
   * The pending DAO is in an assurance drive: its slug is reserved and
   * fixed
   */
  7138 : { message: "AssuranceOpen" },
  /**
   * No assurance drive is recorded for this DAO
   */
  7139 : { message: "NoAssurance" },
  /**
   * The assurance list has not reached its threshold of claimers
   */
  7140 : { message: "AssuranceNotMet" },
  /**
   * The deadline passed without a launch: the drive ends in refunds
   */
  7141 : { message: "AssuranceFailed" },
  /**
   * `release_slug` / `recover_claims` before the drive has failed
   */
  7142 : { message: "AssuranceNotFailed" },
  /**
   * `transfer_agents` names a kind (or names it twice) that `modules`
   * does not create exactly once
   */
  7143 : { message: "UnknownAgentKind" }
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
    /**
     * The registered modules at launch (the Token's registry): the
     * indexer knows the launch set without the Token's `ModuleRegistered`.
     */
    registry?: Array<ModuleEntry>;
  };
}

/**
 * Emitted by `change_slug`: a launched DAO moved to `new_slug` and released
 * `old_slug`, which any DAO may claim from the same ledger on.
 */
export interface SlugChangedEvent {
  name: "SlugChanged";
  data: {
    token_address: string;
    new_slug: string;
    old_slug?: string;
  };
}

/**
 * Emitted by `launch_dao` when the DAO's slug becomes its unique id (it can
 * later change by vote, see `SlugChanged`).
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
 * Emitted by `release_slug`: a failed drive's reserved slug is free again.
 */
export interface SlugReleasedEvent {
  name: "SlugReleased";
  data: {
    token_address: string;
    slug: string;
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
 * Emitted by `create_module`: the `n`th module of `kind` for the DAO,
 * at `predict_module_address(token, kind, n)`.
 */
export interface ModuleCreatedEvent {
  name: "ModuleCreated";
  data: {
    token_address: string;
    kind: string;
    n?: number;
    address?: string;
  };
}

/**
 * Emitted by `open_assurance`: the drive's list, its deadline and the
 * launch config every launch path will use. The slug is reserved
 * (`SlugClaimed`) in the same call.
 */
export interface AssuranceOpenedEvent {
  name: "AssuranceOpened";
  data: {
    token_address: string;
    claim_minter?: string;
    list_id?: number;
    deadline?: bigint;
    launch_auction?: boolean;
    launch_marketplace?: boolean;
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
    claims?: Uint8Array;
  };
}

/**
 * A recorded assurance drive: the ClaimMinter list, its deadline and the
 * launch config every launch path uses.
 */
export interface Assurance {
  claim_minter: string;
  deadline: bigint;
  launch_config: LaunchConfig;
  list_id: number;
}

/**
 * A module the Manager deploys for a DAO (`create_dao` / `create_module`),
 * with its creation config. Each variant is one registry kind.
 */
 export type ModuleSpec =
  { tag: "Auction"; values: readonly [AuctionConfig] } |
  { tag: "Marketplace"; values: readonly [MarketplaceConfig] } |
  { tag: "Claims"; values: readonly [ClaimsConfig] };

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
   * Payment assets fixed in each module's creation config; launch refuses
   * a module whose `payment_asset()` changed (`PaymentAssetMismatch`).
   * `None` for a kind the DAO does not have.
   */
  auction_payment_asset: string | null;
  claims_payment_asset: string | null;
  launch_admin: string;
  marketplace_payment_asset: string | null;
  /**
   * Requested slug; claimed at `launch_dao`, changeable with `update_pending_slug`.
   */
  slug: string;
}

/**
 * ClaimMinter creation config: the asset Setup lists are priced in.
 */
export interface ClaimsConfig {
  payment_asset: string;
}

/**
 * Struct: DaoAddresses
 */
export interface DaoAddresses {
  /**
   * Modules deployed with the DAO (or added in Setup by `create_module`);
   * `None` for a kind it does not have. The Token's registry is the
   * source of truth for modules added later.
   */
  auction: string | null;
  claims: string | null;
  governor: string;
  marketplace: string | null;
  metadata: string;
  token: string;
  treasury: string;
}

/**
 * Struct: LaunchConfig
 */
export interface LaunchConfig {
  /**
   * Start the Auction (if the DAO has one) and grant it an allowance.
   */
  launch_auction: boolean;
  /**
   * Open the Marketplace (if the DAO has one).
   */
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
 * WASM hashes a DAO's contracts were deployed from (emitted in
 * `DaoCreated`); a module the DAO was created without is `None`.
 */
export interface DaoWasmHashes {
  auction: Uint8Array | null;
  claims: Uint8Array | null;
  governor: Uint8Array;
  marketplace: Uint8Array | null;
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
 * The paid claim list a pending DAO's assurance drive opens (`open_assurance`),
 * priced in the DAO's recorded `claims_payment_asset`.
 */
export interface AssuranceListParams {
  /**
   * Ledger timestamp after which an unlaunched drive has failed.
   */
  deadline: bigint;
  /**
   * Claims stop at this ledger timestamp (after launch, too).
   */
  expires_at: bigint;
  /**
   * Price per token (0 for a free drive that still needs its threshold).
   */
  price: bigint;
  root: Uint8Array;
  /**
   * Distinct claimers needed before the DAO may launch.
   */
  threshold_claimers: number;
  total: number;
  tree_uri: string;
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
 * The implementation hashes `create_dao` and `create_module` deploy from.
 */
export interface CurrentImplementations {
  auction: Uint8Array;
  claims: Uint8Array;
  governor: Uint8Array;
  marketplace: Uint8Array;
  metadata: Uint8Array;
  token: Uint8Array;
  treasury: Uint8Array;
}

/**
 * Struct: InitialDaoConfigValues
 */
export interface InitialDaoConfigValues {
  governance: GovernanceConfig;
  /**
   * The modules to deploy with the DAO, each kind at most once; all are
   * optional (docs/designs/membership-models.md §2). More can be added
   * later with `create_module`.
   */
  modules: Array<ModuleSpec>;
  /**
   * DAO profile JSON (description, links, image), 1 to
   * `common::MAX_PROFILE_LENGTH` bytes. Event-only: the Metadata contract
   * emits it and stores its hash.
   */
  profile: string;
  /**
   * Base URL of the image compositor used by the on-chain `token_uri`.
   */
  renderer_base: string;
  /**
   * Requested human-friendly DAO identifier (`[a-z0-9-]`, 4-63 chars).
   * Claimed (unique) only at `launch_dao`; a launched DAO can move to a new
   * slug by vote (`change_slug`).
   */
  slug: string;
  token_name: string;
  /**
   * The membership switches the Token starts with
   * (docs/designs/locked-tokens.md); all off is an open DAO.
   */
  token_settings: TokenSettings;
  token_symbol: string;
  /**
   * Kinds in `modules` whose module becomes a transfer agent at creation
   * (visible to every member before they join); later agents need a
   * proposal once Live.
   */
  transfer_agents: Array<string>;
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
 * What the Manager's `LatestImplementation(name)` holds: the hash announced
 * as latest and the ledger it was announced at. A platform contract (the
 * Manager itself, the shared Minter) upgrades only to this hash, and its
 * notice counts from the later of the approval and this announcement, so
 * every possible platform upgrade is visible as "running → latest" for the
 * whole notice (D42).
 */
export interface LatestPointer {
  set_ledger: bigint;
  wasm_hash: Uint8Array;
}

/**
 * Emitted by `set_delay` (Manager and shared Minter only). A shorter notice
 * is in force from `effective_ledger`; a longer one at once. This is the
 * change a member wants told about: it shortens the window to react to a
 * platform upgrade.
 */
export interface UpgradeDelayChangedEvent {
  name: "UpgradeDelayChanged";
  data: {
    from_ledgers?: number;
    to_ledgers?: number;
    effective_ledger?: number;
  };
}
    export type ContractEvent = DaoCreatedEvent | DaoLaunchedEvent | SlugChangedEvent | SlugClaimedEvent | AdminChangedEvent | SlugReleasedEvent | AdminProposedEvent | FactoryPausedEvent | ModuleCreatedEvent | AssuranceOpenedEvent | FactoryUnpausedEvent | ManagerUpgradedEvent | UpgradeApprovedEvent | ManagerInitializedEvent | PendingSlugUpdatedEvent | ImplementationRevokedEvent | AdminProposalCancelledEvent | LatestImplementationSetEvent | ImplementationRegisteredEvent | CurrentImplementationsUpdatedEvent | UpgradeDelayChangedEvent;
    