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
   * The upgrade notice has not passed: `upgrade_manager` less than
   * `upgrade_delay()` ledgers after the approval or the announcement, or
   * `recover_claims` before that notice has also passed since the drive's
   * deadline
   */
  7130 : { message: "UpgradeDelayNotElapsed" },
  /**
   * `upgrade_manager` or `recover_claims` to a hash that is not the one
   * announced as latest for its name (`latest_pointer`)
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
  7143 : { message: "UnknownAgentKind" },
  /**
   * The vote source is not one the Manager admin approved
   */
  7144 : { message: "VoteSourceNotApproved" },
  /**
   * The address does not answer the vote source interface
   * (`common::clients::VoteSourceApi`)
   */
  7145 : { message: "InvalidVoteSource" },
  /**
   * A payment asset is not a Stellar Asset Contract (`create_dao`,
   * `create_module`, `open_assurance`)
   */
  7146 : { message: "InvalidPaymentAsset" },
  /**
   * The stored data layout is not the one this code expects: an
   * `upgrade_manager` whose `migrate` has not run yet, or an upgrade to
   * code with an older layout. Every entry point that changes state
   * refuses, apart from `migrate`, `upgrade_manager` and the registry
   * steps for the Manager's own upgrade
   */
  7147 : { message: "StorageVersionMismatch" },
  /**
   * `open_assurance`: the DAO's ClaimMinter runs neither the current
   * ClaimMinter implementation (what `create_dao` deploys now) nor the
   * hash announced as the latest ClaimMinter at least `upgrade_delay()`
   * ledgers ago
   */
  7148 : { message: "DriveCodeNotAllowed" }
}

export type ManagerError = typeof ManagerError[keyof typeof ManagerError];

/**
 * Emitted by `create_dao`: the DAO's addresses, the code it was deployed
 * from and its requested slug. Creators verify `wasm_hashes` before launch.
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
 * Emitted by `launch_dao` and `launch_when_ready`: every contract is Live
 * with the Treasury as admin, and the Manager holds no further authority.
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
 * Emitted when the DAO's slug becomes its unique id: at launch, or earlier
 * when `open_assurance` reserves it (it can later change by vote, see
 * `SlugChanged`, or be freed after a failed drive, see `SlugReleased`).
 */
export interface SlugClaimedEvent {
  name: "SlugClaimed";
  data: {
    token_address: string;
    slug: string;
  };
}

/**
 * Emitted by `accept_admin`.
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
 * Emitted by `propose_admin`; the handover completes at `accept_admin`.
 */
export interface AdminProposedEvent {
  name: "AdminProposed";
  data: {
    current_admin: string;
    proposed_admin: string;
  };
}

/**
 * Emitted by `pause_factory`.
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
 * Emitted by `unpause_factory`.
 */
export interface FactoryUnpausedEvent {
  name: "FactoryUnpaused";
  data: {

  };
}

/**
 * Emitted by `upgrade_manager`, before the Manager's code is swapped.
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
 * Emitted by `approve_upgrade` (once per path: re-approving emits nothing).
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
 * Emitted by the constructor.
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
 * A vote source approved (or its approval withdrawn) for new DAOs.
 */
export interface VoteSourceApprovedEvent {
  name: "VoteSourceApproved";
  data: {
    source: string;
    approved?: boolean;
    name?: string;
  };
}

/**
 * Emitted by `revoke_implementation`.
 */
export interface ImplementationRevokedEvent {
  name: "ImplementationRevoked";
  data: {
    wasm_hash: Uint8Array;
    revoked_ledger?: bigint;
  };
}

/**
 * Emitted by `cancel_pending_admin`.
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
 * Emitted by `register_implementation`.
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
 * Emitted by `set_current_implementations`: the hashes new DAOs and modules
 * deploy from.
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
  /**
   * The DAO's ClaimMinter holding the escrow.
   */
  claim_minter: string;
  /**
   * Ledger timestamp after which an unlaunched drive has failed.
   */
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
 * The only factory state retained until the launch administrator finalises a DAO.
 *
 * Module WASM hashes are deliberately NOT stored: launch reads the code each
 * contract runs now (`executable()`) and checks it against the registry, so
 * a pre-launch admin `upgrade` is honoured and a revoked hash is rejected.
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
  /**
   * The only address that may launch, rename, open a drive or recover.
   */
  launch_admin: string;
  marketplace_payment_asset: string | null;
  /**
   * Requested slug; claimed at `launch_dao` (or reserved by
   * `open_assurance`), changeable with `update_pending_slug` until a
   * drive opens.
   */
  slug: string;
}

/**
 * ClaimMinter creation config: the asset Setup lists are priced in, which
 * must be a Stellar Asset Contract.
 */
export interface ClaimsConfig {
  payment_asset: string;
}

/**
 * A DAO's contract addresses (returned by `create_dao`, emitted in
 * `DaoCreated` and `DaoLaunched`).
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
 * What launch opens. An assurance drive stores this at `open_assurance`
 * and every launch path then uses the stored copy.
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
 * Auction creation config. Every payment asset must be a Stellar Asset
 * Contract (`InvalidPaymentAsset`).
 */
export interface AuctionConfig {
  /**
   * Seconds per auction (`common::MIN_AUCTION_DURATION ..=
   * common::MAX_AUCTION_DURATION`).
   */
  duration: bigint;
  payment_asset: string;
  /**
   * Lowest first bid, at least `common::MIN_RESERVE_PRICE`.
   */
  reserve_price: bigint;
  /**
   * Seconds a late bid extends the auction to (1 ..=
   * `common::MAX_AUCTION_TIME_BUFFER`).
   */
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
 * The Governor's settings at creation. `create_dao` checks the bounds; the
 * launch admin may change them in Setup.
 */
export interface GovernanceConfig {
  /**
   * Votes needed to propose; at least 1.
   */
  proposal_threshold: bigint;
  /**
   * Seconds between queueing and the earliest execution (same bounds).
   */
  queue_delay: number;
  /**
   * Quorum in basis points of the voting supply, 1 ..= 10,000.
   */
  quorum_bps: number;
  /**
   * Where voting power comes from: `None` (or the DAO's own token) for
   * token-weighted voting, else a vote source the Manager admin approved
   * (`approve_vote_source`). Permanent once the DAO is created
   * (docs/designs/governance-adapter.md).
   */
  vote_source: string | null;
  /**
   * Seconds from `propose` to the start of voting
   * (`common::MIN_GOVERNANCE_DELAY ..= common::MAX_GOVERNANCE_DELAY`).
   */
  voting_delay: number;
  /**
   * Seconds voting stays open (same bounds).
   */
  voting_period: number;
}

/**
 * `create_dao`'s input. Both `deployer` and `launch_admin` authorise it.
 */
export interface DaoCreationParams {
  /**
   * Salts the addresses with `nonce`, so each deployer has its own
   * address space (`predict_addresses`).
   */
  deployer: string;
  initial_config: InitialDaoConfigValues;
  /**
   * Admin of every contract in Setup; consents to being named.
   */
  launch_admin: string;
  nonce: bigint;
}

/**
 * Marketplace creation config. The payment asset must be a Stellar Asset
 * Contract.
 */
export interface MarketplaceConfig {
  payment_asset: string;
  /**
   * The DAO's cut of secondary sales, at most `common::MAX_FEE_BPS`.
   */
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
  /**
   * Merkle root of the claim list.
   */
  root: Uint8Array;
  /**
   * Distinct claimers needed before the DAO may launch.
   */
  threshold_claimers: number;
  /**
   * Tokens the list may mint; also the mint allowance granted.
   */
  total: number;
  /**
   * Where the full tree is published (`ipfs://...`).
   */
  tree_uri: string;
}

/**
 * A registry record (`register_implementation`). Immutable once written,
 * except that `revoke_implementation` sets `revoked`, permanently.
 */
export interface ImplementationVersion {
  /**
   * The slot name (`Token`, `Governor`, `ClaimMinter`, `Manager`, ...);
   * an upgrade path joins two hashes of the same name only.
   */
  name: string;
  /**
   * Ledger sequence of the registration.
   */
  published_ledger: bigint;
  revoked: boolean;
  /**
   * Release version, which contracts running this hash report.
   */
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
 * What `create_dao` builds: the collection, profile, slug, governance,
 * modules, and membership switches.
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
  /**
   * Collection name, 1 to 40 bytes.
   */
  token_name: string;
  /**
   * The membership switches the Token starts with
   * (docs/designs/locked-tokens.md); all off is an open DAO.
   */
  token_settings: TokenSettings;
  /**
   * Collection symbol, 1 to 10 bytes.
   */
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
  /**
   * The module contract.
   */
  address: string;
  /**
   * A built-in kind or `custom_<name>` (see [`is_valid_kind`]).
   */
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
 * Emitted by [`migrate`] when the stored layout moves forward. The emitting
 * contract address is the event's contract id.
 */
export interface MigratedEvent {
  name: "Migrated";
  data: {
    /**
     * The layout version before the migration.
     */
    from_storage_version?: number;
    /**
     * The layout version after it (the code's `STORAGE_VERSION`).
     */
    to_storage_version?: number;
  };
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
  /**
   * The ledger it was announced at; the notice counts from here or later.
   */
  set_ledger: bigint;
  /**
   * The hash announced as latest.
   */
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
    /**
     * The notice in force before the change, in ledgers.
     */
    from_ledgers?: number;
    /**
     * The requested notice, in ledgers.
     */
    to_ledgers?: number;
    /**
     * The ledger from which `to_ledgers` applies.
     */
    effective_ledger?: number;
  };
}
    export type ContractEvent = DaoCreatedEvent | DaoLaunchedEvent | SlugChangedEvent | SlugClaimedEvent | AdminChangedEvent | SlugReleasedEvent | AdminProposedEvent | FactoryPausedEvent | ModuleCreatedEvent | AssuranceOpenedEvent | FactoryUnpausedEvent | ManagerUpgradedEvent | UpgradeApprovedEvent | ManagerInitializedEvent | PendingSlugUpdatedEvent | VoteSourceApprovedEvent | ImplementationRevokedEvent | AdminProposalCancelledEvent | LatestImplementationSetEvent | ImplementationRegisteredEvent | CurrentImplementationsUpdatedEvent | MigratedEvent | UpgradeDelayChangedEvent;
    