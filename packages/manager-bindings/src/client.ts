import {DaoCreationParams, DaoAddresses, ManagerError, LaunchConfig, ModuleSpec, Assurance, LatestPointer, AssuranceListParams, PendingDao, ImplementationVersion, CurrentImplementations, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Moves the stored data to the layout this code expects
   * (`STORAGE_VERSION`) and emits `Migrated`. Panics `NothingToMigrate`
   * (a common error, 7012) unless the stored layout is older than the
   * code's.
   *
   * `upgrade_manager` swaps the code at the end of its own call, so a
   * release that changes the layout is migrated in a second transaction.
   * Anyone may call it: it runs only the migration that the installed code
   * defines, which the admin registered, announced and installed after the
   * notice, and only once per layout.
   *
   * Until it runs, every entry point that changes state fails
   * `StorageVersionMismatch`, except the path that upgrades the Manager
   * again: `register_implementation` and `set_latest_implementation` for
   * the name `Manager`, `approve_upgrade` to a hash registered as
   * `Manager`, and `upgrade_manager`. If a migration fails, the admin
   * installs fixed code through that path, after the usual notice. The
   * path reads and writes only the keys a release must keep readable by
   * both its code and the code before it: the admin, the upgr
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns the active Manager release version.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Slug held by `token_address`, if any: a launched DAO's, or the one a
   * pending DAO's assurance drive reserved. Another pending DAO's
   * requested slug is in `get_pending_dao`. Read-only.
   */
  get_slug({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Current admin. Read-only.
   */
  get_admin(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Returns the active Manager WASM hash.
   */
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Create a new DAO: the four core contracts (Token, Metadata, Governor,
   * Treasury) and the modules listed in `initial_config.modules`, deployed
   * atomically from the current implementations, with each module
   * registered on the Token. Every module's payment asset must be a
   * Stellar Asset Contract.
   *
   * The launch administrator owns the setup window and may configure the
   * contracts before `launch_dao`.
   *
   * # Authorization
   *
   * Requires BOTH `params.deployer` and `params.launch_admin` to authorize
   * the call (one signature if they are the same address). Module
   * constructors do not require auth.
   *
   * The requested slug is validated and must not be held, but it is only
   * claimed at `launch_dao` or when a drive opens (a pending DAO without a
   * drive holds no slug, so an abandoned creation blocks nothing).
   *
   * # Errors
   *
   * * `FactoryPaused` - Factory is paused
   * * `CurrentImplementationsNotSet` - Current WASM hashes not configured
   * * `InvalidModules` - A kind listed twice
   * * `InvalidSlug` / `SlugTaken` - Malformed slug, or held by another DAO
   * * `InvalidPa
   */
  create_dao({ params }: { params: DaoCreationParams }, options?: MethodOptions): Promise<AssembledTransaction<Result<DaoAddresses, ManagerError>>>;
  /**
   * Launch a configured DAO.
   *
   * # Authorization
   *
   * Only callable by the launch_admin who created the DAO.
   *
   * # Validation
   *
   * - The factory must not be paused (`FactoryPaused`)
   * - Token voting supply must be > 0 (at least one token minted to a holder
   * other than the Treasury or a non-voting module)
   * - launch_admin must be the current token admin (`LaunchAdminNotOwner`)
   * - The requested slug must still be unclaimed (`SlugTaken`; change it with
   * `update_pending_slug`)
   * - The core contracts and every registered module must CURRENTLY run a
   * registered, non-revoked hash, as the host reports their code
   * (`executable()`, not their own `wasm_hash()`), checked before the
   * Manager calls into them (`PendingDaoUsesRevokedImplementation`)
   * - Every module's `payment_asset()` must equal the asset recorded at its
   * creation (`PaymentAssetMismatch`)
   *
   * All checks run before any launch call, so a refusal launches nothing.
   *
   * # Effects
   *
   * 1. `token.launch` with an unlimited allowance for the Auction if
   * `launch_auction`; the Marketplace is funded per pool by
   */
  launch_dao({ token_address, launch_config }: { token_address: string | Address; launch_config: LaunchConfig }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Move a launched DAO to a new slug. The old slug is released at once and
   * any DAO may claim it, from this same transaction on.
   *
   * # Authorization
   *
   * The token's admin, which after launch is the DAO's Treasury, so this
   * only runs through a passed proposal (`treasury.execute`). This relies on
   * the token having no admin transfer after launch (`common::admin::handoff`
   * is one-shot); a token release that adds one must revisit this check.
   *
   * # Errors
   *
   * * `FactoryPaused` - Slug claims are stopped while the factory is paused
   * * `SlugNotFound` - no slug is recorded for `token_address`: not a DAO
   * this Manager created, or a pending DAO without a drive (it uses
   * `update_pending_slug`). A DAO in an assurance drive has its slug
   * recorded but cannot rename: its Token admin is the Treasury, which
   * cannot act before launch.
   * * `SlugUnchanged` - `new_slug` is the DAO's current slug
   * * `InvalidSlug` / `SlugTaken` - Malformed slug, or held by another DAO
   */
  change_slug({ token_address, new_slug }: { token_address: string | Address; new_slug: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Accept a pending admin handover. Requires the proposed admin's authorization.
   */
  accept_admin(options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Modules of `kind` `create_module` deployed for `token` so far: the `n`
   * the next one is deployed with. Read-only.
   */
  module_count({ token, kind }: { token: string | Address; kind: string }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Free the slug a failed drive reserved. Anyone may call it.
   *
   * # Errors
   *
   * * `DaoNotFound` / `NoAssurance`
   * * `AssuranceNotFailed` - the drive may still launch
   * * `SlugNotFound` - already released
   */
  release_slug({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Deploy a module for an existing DAO from the current implementation
   * of `spec`'s kind (docs/designs/membership-models.md §2). Needs the
   * authorization of the Token's admin: the launch admin in Setup, the
   * Treasury (by proposal) once Live. The payment asset must be a Stellar
   * Asset Contract.
   *
   * The module lands at `predict_module_address(token, kind, n)` with
   * `n = module_count(token, kind)`, and `expected_n` must equal that `n`
   * (`StaleModuleIndex`). A proposal reads `module_count` while drafting
   * and bakes the same `n` into this action, so it either deploys exactly
   * the module its later actions target or the whole execution reverts.
   *
   * - **Setup:** the module is registered on the Token, and its payment
   * asset recorded for the launch check; `launch_dao` launches it.
   * - **Live:** the module is launched at once (its admin is the
   * Treasury); the same proposal then registers it on the Token and
   * grants its allowance. A module created after launch is not opened:
   * the proposal opens it once it holds an allowance.
   *
   * # Errors
   *
   * * `Fac
   */
  create_module({ token, spec, expected_n }: { token: string | Address; spec: ModuleSpec; expected_n: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<string, ManagerError>>>;
  /**
   * The pending DAO's assurance drive, if one is recorded. Read-only. A
   * failed drive stays recorded: the DAO never launches.
   */
  get_assurance({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Assurance | null>>;
  /**
   * Pause the factory (emergency measure). While paused, `create_dao`,
   * `create_module`, `open_assurance`, `launch_dao`, `launch_when_ready`,
   * and `change_slug` fail with `FactoryPaused`. Refunds, `release_slug`,
   * and `recover_claims` stay open, so a pause can end a drive in refunds
   * but never trap its escrow.
   *
   * # Authorization
   *
   * Only callable by admin.
   */
  pause_factory(options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Propose a new admin. The handover completes when `accept_admin` is called.
   *
   * Only callable by the current admin. Overwrites any earlier proposal.
   */
  propose_admin({ new_admin }: { new_admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * The upgrade notice in force, in ledgers, for `upgrade_manager` and for
   * `recover_claims` (which also measures it from the drive's deadline,
   * at `SECONDS_PER_LEDGER` seconds per ledger and never less than
   * `MIN_RECOVERY_REFUND_WINDOW`).
   */
  upgrade_delay(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * The hash announced as latest for `name` and the ledger it was announced
   * at (D42). Unlike `get_latest_implementation`, a revoked hash is still
   * returned: the pointer is what the platform's upgrade rule and the app's
   * pending-upgrade display read. Read-only.
   */
  latest_pointer({ name }: { name: string }, options?: MethodOptions): Promise<AssembledTransaction<LatestPointer | null>>;
  /**
   * Open a paid claim drive before launch: members claim (and pay into the
   * ClaimMinter's escrow) until `threshold_claimers` distinct addresses
   * have, then anyone may launch the DAO with `launch_config`
   * (`launch_when_ready`). If the deadline passes first, the drive fails
   * and members are refunded. Needs the launch admin's authorization.
   *
   * In one call it:
   * 1. opens the list on the DAO's ClaimMinter, priced in the asset
   * recorded at its creation, and grants the ClaimMinter `total` mint
   * allowance;
   * 2. records the drive (list, deadline, launch config) and reserves the
   * DAO's slug (`SlugClaimed`), so no other DAO can launch with it;
   * 3. hands every contract's admin to the Treasury without going Live,
   * which freezes settings, artwork, mints, allowances, registrations
   * and upgrades until launch. Founders and artwork must be in place
   * before.
   *
   * The ClaimMinter holds members' payments, and the launch admin may have
   * upgraded it in Setup to any approved, registered code. So the drive
   * opens only on the code the platform deploys now (the
   */
  open_assurance({ token_address, list, launch_config }: { token_address: string | Address; list: AssuranceListParams; launch_config: LaunchConfig }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, ManagerError>>>;
  /**
   * Upgrade a failed drive's ClaimMinter, for refunds its code cannot pay
   * (review B2).
   *
   * # Authorization
   *
   * Only the launch admin recorded in `PendingDao`.
   *
   * # Guarantees
   *
   * - The drive has failed by the Manager's own rule (the deadline passed
   * and the Token is not Live; ClaimMinter's state machine is never
   * asked), so the upgrade cannot change whether the DAO launches.
   * - `to_hash` is approved from `from_hash` in the registry, not revoked,
   * and is the hash announced as latest for its name (`latest_pointer`).
   * - The Manager's upgrade notice has passed since the approval and the
   * announcement (`upgrade_delay()` ledgers, at least
   * `MIN_RECOVERY_NOTICE_LEDGERS`) and since the drive's deadline (in
   * seconds, at least `MIN_RECOVERY_REFUND_WINDOW`). Members have at
   * least seven days after the drive fails, and after each recovery
   * target is announced, to refund with the code in place.
   *
   * # Errors
   *
   * * `DaoNotFound` / `NoAssurance`
   * * `AssuranceNotFailed` - the drive may still launch
   * * `InvalidUpgradePath` - the path is not approved, or the t
   */
  recover_claims({ token_address, from_hash, to_hash }: { token_address: string | Address; from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Approve an upgrade path from one implementation to another.
   *
   * # Authorization
   *
   * Only callable by admin.
   *
   * # Arguments
   *
   * * `from_hash` - Source WASM hash
   * * `to_hash` - Target WASM hash
   *
   * # Errors
   *
   * * `ImplementationNotFound` - One or both implementations don't exist
   * * `InvalidUpgradePath` - Target is revoked, or the names differ
   *
   * A revoked SOURCE is allowed on purpose: after revoking a vulnerable
   * hash the admin must still be able to approve a migration off it.
   */
  approve_upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Token address of the DAO holding `slug`: a launched DAO, or a pending
   * DAO whose assurance drive reserved it (until `release_slug`).
   *
   * Plain read: does not extend the slug entry's TTL (the DAO's storage
   * sweep renews the slug entries).
   */
  get_dao_by_slug({ slug }: { slug: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<string, ManagerError>>>;
  /**
   * The pending DAO created at `token_address`, until it launches.
   * Read-only.
   */
  get_pending_dao({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<PendingDao | null>>;
  /**
   * Storage-layout version of the data held by this contract (1 for a
   * Manager deployed before versions were recorded). Read-only. While it
   * differs from the code's `STORAGE_VERSION`, every entry point that
   * changes state fails `StorageVersionMismatch`, apart from the recovery
   * path described at `migrate`.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Unpause the factory.
   *
   * # Authorization
   *
   * Only callable by admin.
   */
  unpause_factory(options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Upgrade the Manager contract itself.
   *
   * # Authorization
   *
   * Only callable by admin.
   *
   * # Arguments
   *
   * * `from_hash` - Current Manager WASM hash (must match stored hash)
   * * `to_hash` - Target Manager WASM hash (must be registered and active)
   *
   * # Errors
   *
   * * `ImplementationNotFound` - Target implementation doesn't exist or is revoked
   * * `InvalidVersion` - from_hash doesn't match current hash
   * * `InvalidUpgradePath` - the target is not named `Manager`, or the
   * path is not approved
   * * `UpgradeNotLatest` - the target is not the announced latest Manager
   * * `UpgradeDelayNotElapsed` - `upgrade_delay()` ledgers have not passed
   * since the later of the approval and the announcement (D42)
   */
  upgrade_manager({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Pending admin awaiting acceptance, if any. Read-only.
   */
  get_pending_admin(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Launch a DAO whose assurance list has met its threshold, with the
   * stored launch config. Anyone may call it; no authorization.
   *
   * # Errors
   *
   * * `DaoNotFound` / `NoAssurance`
   * * `AssuranceFailed` - the deadline passed first
   * * `AssuranceNotMet` - fewer distinct claimers than the threshold
   * * every `launch_dao` check
   */
  launch_when_ready({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Predict DAO addresses without deploying. Read-only.
   *
   * Useful for frontends to show addresses before user confirms deployment.
   * Every module kind `create_dao` can deploy is predicted; a DAO created
   * without one simply never uses its address.
   */
  predict_addresses({ creator, nonce }: { creator: string | Address; nonce: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<DaoAddresses, ManagerError>>>;
  /**
   * Change the Manager's upgrade notice (admin only). A longer notice
   * applies at once; a shorter one only after the notice in force has
   * passed, so the notice cannot be cut to rush an upgrade through.
   */
  set_upgrade_delay({ ledgers }: { ledgers: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Get implementation by WASM hash.
   *
   * # Arguments
   *
   * * `wasm_hash` - WASM hash to query
   *
   * # Returns
   *
   * The implementation version, or `None` if not found.
   */
  get_implementation({ wasm_hash }: { wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<ImplementationVersion | null>>;
  /**
   * Approve `source` as a vote source new DAOs may choose, or withdraw the
   * approval (`approved = false`). Admin only.
   *
   * Approval names an address, not the code behind it: approve only
   * sources whose weights no single party can rewrite and whose upgrades,
   * if any, are gated by this Manager (docs/designs/governance-adapter.md).
   * The mock adapter is for testnet and local networks only.
   *
   * Approving probes every read the Governor makes, plus `decimals`.
   * Withdrawing an approval stops new DAOs and pending DAOs from
   * launching with the source; DAOs already launched keep it (it is
   * permanent in their Governor).
   *
   * # Errors
   *
   * * `InvalidVoteSource` - `source` does not answer the interface
   */
  approve_vote_source({ source, approved, name }: { source: string | Address; approved: boolean; name: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Check if an upgrade is approved.
   *
   * # Arguments
   *
   * * `from_hash` - Source WASM hash
   * * `to_hash` - Target WASM hash
   *
   * # Returns
   *
   * `true` if the path is approved, both hashes are registered under the
   * same name and the TARGET is not revoked. A revoked source may still
   * migrate away.
   */
  is_upgrade_approved({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Change the requested slug of a pending DAO (launch admin only), for
   * example after `launch_dao` failed with `SlugTaken`.
   *
   * # Errors
   *
   * * `DaoNotFound` - No pending DAO for `token_address`
   * * `InvalidSlug` / `SlugTaken` - Malformed slug, or held by another DAO
   */
  update_pending_slug({ token_address, slug }: { token_address: string | Address; slug: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Cancel a pending admin handover (admin only).
   */
  cancel_pending_admin(options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Revoke an implementation (emergency measure). Permanent: a record is
   * never un-revoked.
   *
   * # Authorization
   *
   * Only callable by admin.
   *
   * # Effects
   *
   * A revoked hash can no longer be an upgrade target, a current
   * implementation or the latest (`get_latest_implementation`), and a
   * pending DAO running it cannot launch. Contracts already running it
   * keep running it and may still upgrade away from it.
   *
   * # Arguments
   *
   * * `wasm_hash` - WASM hash to revoke
   *
   * # Errors
   *
   * * `ImplementationNotFound` - Implementation doesn't exist
   * * `ImplementationAlreadyRevoked` - Implementation already revoked
   */
  revoke_implementation({ wasm_hash }: { wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Where `create_module(token, <kind>, n)` deploys. A pure function of
   * its inputs and this Manager's address. Read-only.
   */
  predict_module_address({ token, kind, n }: { token: string | Address; kind: string; n: number }, options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * The hashes `create_dao` and `create_module` deploy from, or `None`
   * before `set_current_implementations`. Read-only. Raw values: a hash revoked since
   * it was set is still returned (DAOs created from it still run it), which
   * is what platform code renewal needs. `create_dao` itself rechecks each.
   */
  current_implementations(options?: MethodOptions): Promise<AssembledTransaction<CurrentImplementations | null>>;
  /**
   * Whether new DAOs may choose `source` as their vote source. Read-only.
   */
  is_vote_source_approved({ source }: { source: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Register a new implementation version.
   *
   * # Authorization
   *
   * Only callable by admin.
   *
   * # Arguments
   *
   * * `name` - Implementation name (e.g., "Token", "Governor")
   * * `version` - Version string (e.g., "0.1.0")
   * * `wasm_hash` - WASM bytecode hash
   *
   * # Errors
   *
   * * `InvalidImplementationName` - Name is empty or too long
   * * `InvalidVersion` - Version is empty or too long
   * * `ImplementationAlreadyRegistered` - A record already exists for this hash
   * (records are immutable: no renaming, re-versioning or un-revoking)
   *
   * Registration does not change the "latest" implementation for `name`;
   * the admin selects it explicitly with `set_latest_implementation`, so
   * registering an older (patch) release never regresses it.
   */
  register_implementation({ name, version, wasm_hash }: { name: string; version: string; wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Ledger at which `approve_upgrade(from, to)` was recorded, if it was.
   * Read-only. `upgrade_manager` and `recover_claims` wait
   * `upgrade_delay()` after it.
   */
  upgrade_approved_ledger({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<bigint | null>>;
  /**
   * Get latest version of an implementation by name.
   *
   * # Arguments
   *
   * * `name` - Implementation name
   *
   * # Returns
   *
   * The latest implementation version, or `None` if not found.
   */
  get_latest_implementation({ name }: { name: string }, options?: MethodOptions): Promise<AssembledTransaction<ImplementationVersion | null>>;
  /**
   * Announce `wasm_hash` as the latest implementation for `name` (admin
   * only). This is the only hash `upgrade_manager` and `recover_claims`
   * may move to, and the app shows it as the available upgrade.
   *
   * Re-announcing the current latest keeps its announcement ledger, so the
   * notice measured from it cannot be restarted (D42).
   *
   * # Errors
   *
   * * `ImplementationNotFound` - `wasm_hash` is not registered or is revoked
   * * `InvalidImplementationName` - `wasm_hash` is registered under another name
   */
  set_latest_implementation({ name, wasm_hash }: { name: string; wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Returns the registered release version for a WASM hash, including
   * revoked hashes (a module still running a revoked hash keeps answering
   * `version()`, which reads this). Callers that must reject revoked targets rely on
   * `is_upgrade_approved`, which checks the target is not revoked.
   */
  get_implementation_version({ wasm_hash }: { wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Set the current implementation WASM hashes used by the factory and by
   * `create_module` (admin only). Each hash must be registered, not
   * revoked, and registered under its slot's name (`Token`, `Metadata`,
   * `Auction`, `Governor`, `Treasury`, `Marketplace`, `ClaimMinter`).
   *
   * # Errors
   *
   * * `ImplementationNotFound` - One or more implementations don't exist or are revoked
   * * `InvalidImplementationName` - A hash is registered under the wrong module name
   */
  set_current_implementations({ current }: { current: CurrentImplementations }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAADdNYW5hZ2VyIGVycm9ycyAoYmxvY2sgYGNvbW1vbjo6ZXJyb3I6OmNvZGVzOjpNQU5BR0VSYCkuAAAAAAAAAAAMTWFuYWdlckVycm9yAAAALgAAADdJbXBsZW1lbnRhdGlvbiBuYW1lIGlzIHdyb25nIGZvciB0aGUgc2xvdCBpdCBpcyB1c2VkIGluAAAAABlJbnZhbGlkSW1wbGVtZW50YXRpb25OYW1lAAAAAAAbvQAAAERNYW5hZ2VyIGhhc2gvdmVyc2lvbiBtaXNzaW5nLCBvciBgZnJvbV9oYXNoYCBpcyBub3QgdGhlIGN1cnJlbnQgaGFzaAAAAA5JbnZhbGlkVmVyc2lvbgAAAAAbvgAAAEpJbXBsZW1lbnRhdGlvbiBub3QgcmVnaXN0ZXJlZCAob3IgcmV2b2tlZCB3aGVyZSBhbiBhY3RpdmUgb25lIGlzIHJlcXVpcmVkKQAAAAAAFkltcGxlbWVudGF0aW9uTm90Rm91bmQAAAAAG78AAAAeSW1wbGVtZW50YXRpb24gYWxyZWFkeSByZXZva2VkAAAAAAAcSW1wbGVtZW50YXRpb25BbHJlYWR5UmV2b2tlZAAAG8AAAABBVXBncmFkZSB0YXJnZXQgcmV2b2tlZCwgbmFtZXMgZGlmZmVyLCBvciB0aGUgcGF0aCBpcyBub3QgYXBwcm92ZWQAAAAAAAASSW52YWxpZFVwZ3JhZGVQYXRoAAAAABvBAAAADUFkbWluIG5vdCBzZXQAAAAAAAALQWRtaW5Ob3RTZXQAAAAbwgAAABxObyBhZG1pbiBoYW5kb3ZlciBpcyBwZW5kaW5nAAAADk5vUGVuZGluZ0FkbWluAAAAABvDAAAAOkFuIGltcGxlbWVudGF0aW9uIGlzIGFscmVhZHkgcmVnaXN0ZXJlZCBmb3IgdGhpcyBXQVNNIGhhc2gAAAAAAB9JbXBsZW1lbnRhdGlvbkFscmVhZHlSZWdpc3RlcmVkAAAAG8UAAAAzRmFjdG9yeSBpcyBwYXVzZWQgKG5vIGBjcmVhdGVfZGFvYCBvciBgbGF1bmNoX2Rhb2ApAAAAAA1GYWN0b3J5UGF1c2VkAAAAAAAbxwAAADdBdWN0aW9uIHJlc2VydmUgcHJpY2UgYmVsb3cgYGNvbW1vbjo6TUlOX1JFU0VSVkVfUFJJQ0VgAAAAABJJbnZhbGlkUGFyYW1Cb3VuZHMAAAAAG8gAAAAlUXVvcnVtIGJhc2lzIHBvaW50cyBvdXRzaWRlIDEuLj0xMDAwMAAAAAAAABBJbnZhbGlkUXVvcnVtQnBzAAAbyQAAAC5BdWN0aW9uIGR1cmF0aW9uIG91dHNpZGUgNSBtaW51dGVzIC4uPSAzMCBkYXlzAAAAAAAPSW52YWxpZER1cmF0aW9uAAAAG8oAAAAtQXVjdGlvbiB0aW1lIGJ1ZmZlciBvdXRzaWRlIDEuLj04NjQwMCBzZWNvbmRzAAAAAAAAEUludmFsaWRUaW1lQnVmZmVyAAAAAAAbywAAAC5TdHJpbmcgbG9uZ2VyIHRoYW4gYGNvbW1vbjo6TUFYX1NUUklOR19MRU5HVEhgAAAAAAANU3RyaW5nVG9vTG9uZwAAAAAAG8wAAAAMU3RyaW5nIGVtcHR5AAAAC1N0cmluZ0VtcHR5AAAAG80AAACOR292ZXJuYW5jZSB0aW1pbmcgb3V0IG9mIHJhbmdlOiBlYWNoIG9mIHZvdGluZyBkZWxheSwgdm90aW5nIHBlcmlvZCBhbmQKcXVldWUgZGVsYXkgbXVzdCBiZSB3aXRoaW4gMzAwIHNlY29uZHMgLi49IDMwIGRheXMgKDJfNTkyXzAwMCBzZWNvbmRzKQAAAAAAF0ludmFsaWRHb3Zlcm5hbmNlVGltaW5nAAAAG84AAAAlUHJvcG9zYWwgdGhyZXNob2xkIG11c3QgYmUgYXQgbGVhc3QgMQAAAAAAABhJbnZhbGlkUHJvcG9zYWxUaHJlc2hvbGQAABvPAAAAgU5vIHZvdGluZy1jYXBhYmxlIHRva2VuIGV4aXN0czsgbWludCBhdCBsZWFzdCBvbmUgdG9rZW4gdG8gYSBob2xkZXIKb3RoZXIgdGhhbiB0aGUgVHJlYXN1cnksIEF1Y3Rpb24gb3IgTWFya2V0cGxhY2UgYmVmb3JlIGxhdW5jaAAAAAAAABBMYXVuY2hTdXBwbHlaZXJvAAAb0AAAAJ5BIG1vZHVsZSBvZiB0aGUgcGVuZGluZyBEQU8gY3VycmVudGx5IHJ1bnMgYSByZXZva2VkIG9yIHVucmVnaXN0ZXJlZApXQVNNIGhhc2g7IHVwZ3JhZGUgaXQgKGFkbWluIGB1cGdyYWRlYCB0byBhbiBhcHByb3ZlZCwgbm9uLXJldm9rZWQgaGFzaCkKYmVmb3JlIGxhdW5jaGluZwAAAAAAI1BlbmRpbmdEYW9Vc2VzUmV2b2tlZEltcGxlbWVudGF0aW9uAAAAG9EAAABTU2x1ZyBpcyBub3QgNC02MyBjaGFycyBvZiBgW2EtejAtOS1dYCB3aXRob3V0IGEgbGVhZGluZywgdHJhaWxpbmcgb3IKZG91YmxlZCBoeXBoZW4AAAAAC0ludmFsaWRTbHVnAAAAG9IAAAApU2x1ZyBpcyBhbHJlYWR5IGNsYWltZWQgYnkgYSBsYXVuY2hlZCBEQU8AAAAAAAAJU2x1Z1Rha2VuAAAAAAAb0wAAAB9DdXJyZW50IGltcGxlbWVudGF0aW9ucyBub3Qgc2V0AAAAABxDdXJyZW50SW1wbGVtZW50YXRpb25zTm90U2V0AAAb1AAAAC5TZWNvbmRhcnktc2FsZSBmZWUgYWJvdmUgYGNvbW1vbjo6TUFYX0ZFRV9CUFNgAAAAAAAKSW52YWxpZEZlZQAAAAAb1QAAAC1UaGUgbGF1bmNoIGFkbWluIGlzIG5vIGxvbmdlciB0aGUgdG9rZW4gYWRtaW4AAAAAAAATTGF1bmNoQWRtaW5Ob3RPd25lcgAAABvWAAAAJU5vIHBlbmRpbmcgREFPIGZvciB0aGlzIHRva2VuIGFkZHJlc3MAAAAAAAALRGFvTm90Rm91bmQAAAAb1wAAAC1ObyBsYXVuY2hlZCBEQU8gaXMgcmVnaXN0ZXJlZCB1bmRlciB0aGlzIHNsdWcAAAAAAAAMU2x1Z05vdEZvdW5kAAAb2AAAAC1gY2hhbmdlX3NsdWdgIHRvIHRoZSBzbHVnIHRoZSBEQU8gYWxyZWFkeSBoYXMAAAAAAAANU2x1Z1VuY2hhbmdlZAAAAAAAG9kAAADSVGhlIHVwZ3JhZGUgbm90aWNlIGhhcyBub3QgcGFzc2VkOiBgdXBncmFkZV9tYW5hZ2VyYCBsZXNzIHRoYW4KYHVwZ3JhZGVfZGVsYXkoKWAgbGVkZ2VycyBhZnRlciB0aGUgYXBwcm92YWwgb3IgdGhlIGFubm91bmNlbWVudCwgb3IKYHJlY292ZXJfY2xhaW1zYCBiZWZvcmUgdGhhdCBub3RpY2UgaGFzIGFsc28gcGFzc2VkIHNpbmNlIHRoZSBkcml2ZSdzCmRlYWRsaW5lAAAAAAAWVXBncmFkZURlbGF5Tm90RWxhcHNlZAAAAAAb2gAAAHdgdXBncmFkZV9tYW5hZ2VyYCBvciBgcmVjb3Zlcl9jbGFpbXNgIHRvIGEgaGFzaCB0aGF0IGlzIG5vdCB0aGUgb25lCmFubm91bmNlZCBhcyBsYXRlc3QgZm9yIGl0cyBuYW1lIChgbGF0ZXN0X3BvaW50ZXJgKQAAAAAQVXBncmFkZU5vdExhdGVzdAAAG9sAAACHQSBtb2R1bGUncyBwYXltZW50IGFzc2V0IGRpZmZlcnMgZnJvbSB0aGUgb25lIHJlY29yZGVkIHdoZW4gaXQgd2FzCmNyZWF0ZWQgKHRoZSBsYXVuY2ggYWRtaW4gY2hhbmdlZCBpdCBpbiBTZXR1cCk7IGNoYW5nZSBpdCBiYWNrIGZpcnN0AAAAABRQYXltZW50QXNzZXRNaXNtYXRjaAAAG9wAAAAcYG1vZHVsZXNgIGxpc3RzIGEga2luZCB0d2ljZQAAAA5JbnZhbGlkTW9kdWxlcwAAAAAb3QAAAINgY3JlYXRlX21vZHVsZWAncyBgZXhwZWN0ZWRfbmAgaXMgbm90IGBtb2R1bGVfY291bnQodG9rZW4sIGtpbmQpYDogYQptb2R1bGUgb2YgdGhpcyBraW5kIHdhcyBjcmVhdGVkIHNpbmNlIHRoZSBwcm9wb3NhbCB3YXMgZHJhZnRlZAAAAAAQU3RhbGVNb2R1bGVJbmRleAAAG94AAABCVGhlIERBTyBoYXMgbm8gQ2xhaW1NaW50ZXIgcmVnaXN0ZXJlZCAob3Igbm8gY2xhaW1zIHBheW1lbnQgYXNzZXQpAAAAAAANTm9DbGFpbU1pbnRlcgAAAAAAG98AAAAzQW4gYXNzdXJhbmNlIGRyaXZlIGlzIGFscmVhZHkgcmVjb3JkZWQgZm9yIHRoaXMgREFPAAAAAA9Bc3N1cmFuY2VFeGlzdHMAAAAb4AAAAEhUaGUgYXNzdXJhbmNlIGRlYWRsaW5lIGlzIG1vcmUgdGhhbiBgTUFYX0FTU1VSQU5DRV9XSU5ET1dgICg5MCBkYXlzKSBvdXQAAAAORGVhZGxpbmVUb29GYXIAAAAAG+EAAABIVGhlIHBlbmRpbmcgREFPIGlzIGluIGFuIGFzc3VyYW5jZSBkcml2ZTogaXRzIHNsdWcgaXMgcmVzZXJ2ZWQgYW5kCmZpeGVkAAAADUFzc3VyYW5jZU9wZW4AAAAAABviAAAAK05vIGFzc3VyYW5jZSBkcml2ZSBpcyByZWNvcmRlZCBmb3IgdGhpcyBEQU8AAAAAC05vQXNzdXJhbmNlAAAAG+MAAAA8VGhlIGFzc3VyYW5jZSBsaXN0IGhhcyBub3QgcmVhY2hlZCBpdHMgdGhyZXNob2xkIG9mIGNsYWltZXJzAAAAD0Fzc3VyYW5jZU5vdE1ldAAAABvkAAAAP1RoZSBkZWFkbGluZSBwYXNzZWQgd2l0aG91dCBhIGxhdW5jaDogdGhlIGRyaXZlIGVuZHMgaW4gcmVmdW5kcwAAAAAPQXNzdXJhbmNlRmFpbGVkAAAAG+UAAAA9YHJlbGVhc2Vfc2x1Z2AgLyBgcmVjb3Zlcl9jbGFpbXNgIGJlZm9yZSB0aGUgZHJpdmUgaGFzIGZhaWxlZAAAAAAAABJBc3N1cmFuY2VOb3RGYWlsZWQAAAAAG+YAAABeYHRyYW5zZmVyX2FnZW50c2AgbmFtZXMgYSBraW5kIChvciBuYW1lcyBpdCB0d2ljZSkgdGhhdCBgbW9kdWxlc2AKZG9lcyBub3QgY3JlYXRlIGV4YWN0bHkgb25jZQAAAAAAEFVua25vd25BZ2VudEtpbmQAABvnAAAANVRoZSB2b3RlIHNvdXJjZSBpcyBub3Qgb25lIHRoZSBNYW5hZ2VyIGFkbWluIGFwcHJvdmVkAAAAAAAAFVZvdGVTb3VyY2VOb3RBcHByb3ZlZAAAAAAAG+gAAABYVGhlIGFkZHJlc3MgZG9lcyBub3QgYW5zd2VyIHRoZSB2b3RlIHNvdXJjZSBpbnRlcmZhY2UKKGBjb21tb246OmNsaWVudHM6OlZvdGVTb3VyY2VBcGlgKQAAABFJbnZhbGlkVm90ZVNvdXJjZQAAAAAAG+kAAABhQSBwYXltZW50IGFzc2V0IGlzIG5vdCBhIFN0ZWxsYXIgQXNzZXQgQ29udHJhY3QgKGBjcmVhdGVfZGFvYCwKYGNyZWF0ZV9tb2R1bGVgLCBgb3Blbl9hc3N1cmFuY2VgKQAAAAAAABNJbnZhbGlkUGF5bWVudEFzc2V0AAAAG+oAAAElVGhlIHN0b3JlZCBkYXRhIGxheW91dCBpcyBub3QgdGhlIG9uZSB0aGlzIGNvZGUgZXhwZWN0czogYW4KYHVwZ3JhZGVfbWFuYWdlcmAgd2hvc2UgYG1pZ3JhdGVgIGhhcyBub3QgcnVuIHlldCwgb3IgYW4gdXBncmFkZSB0bwpjb2RlIHdpdGggYW4gb2xkZXIgbGF5b3V0LiBFdmVyeSBlbnRyeSBwb2ludCB0aGF0IGNoYW5nZXMgc3RhdGUKcmVmdXNlcywgYXBhcnQgZnJvbSBgbWlncmF0ZWAsIGB1cGdyYWRlX21hbmFnZXJgIGFuZCB0aGUgcmVnaXN0cnkKc3RlcHMgZm9yIHRoZSBNYW5hZ2VyJ3Mgb3duIHVwZ3JhZGUAAAAAAAAWU3RvcmFnZVZlcnNpb25NaXNtYXRjaAAAAAAb6wAAANNgb3Blbl9hc3N1cmFuY2VgOiB0aGUgREFPJ3MgQ2xhaW1NaW50ZXIgcnVucyBuZWl0aGVyIHRoZSBjdXJyZW50CkNsYWltTWludGVyIGltcGxlbWVudGF0aW9uICh3aGF0IGBjcmVhdGVfZGFvYCBkZXBsb3lzIG5vdykgbm9yIHRoZQpoYXNoIGFubm91bmNlZCBhcyB0aGUgbGF0ZXN0IENsYWltTWludGVyIGF0IGxlYXN0IGB1cGdyYWRlX2RlbGF5KClgCmxlZGdlcnMgYWdvAAAAABNEcml2ZUNvZGVOb3RBbGxvd2VkAAAAG+w=", "AAAABQAAAJBFbWl0dGVkIGJ5IGBjcmVhdGVfZGFvYDogdGhlIERBTydzIGFkZHJlc3NlcywgdGhlIGNvZGUgaXQgd2FzIGRlcGxveWVkCmZyb20gYW5kIGl0cyByZXF1ZXN0ZWQgc2x1Zy4gQ3JlYXRvcnMgdmVyaWZ5IGB3YXNtX2hhc2hlc2AgYmVmb3JlIGxhdW5jaC4AAAAAAAAACkRhb0NyZWF0ZWQAAAAAAAEAAAALZGFvX2NyZWF0ZWQAAAAABwAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAAhkZXBsb3llcgAAABMAAAABAAAAAAAAAAxsYXVuY2hfYWRtaW4AAAATAAAAAQAAAAAAAAAOY3JlYXRlZF9sZWRnZXIAAAAAAAYAAAAAAAAAAAAAAAdtb2R1bGVzAAAAB9AAAAAMRGFvQWRkcmVzc2VzAAAAAAAAACtXQVNNIGhhc2hlcyB0aGUgbW9kdWxlcyB3ZXJlIGRlcGxveWVkIGZyb20uAAAAAAt3YXNtX2hhc2hlcwAAAAfQAAAADURhb1dhc21IYXNoZXMAAAAAAAAAAAAAQ1JlcXVlc3RlZCBzbHVnLiBOb3QgdW5pcXVlIHVudGlsIGNsYWltZWQgYXQgbGF1bmNoIChgU2x1Z0NsYWltZWRgKS4AAAAABHNsdWcAAAAQAAAAAAAAAAI=", "AAAABQAAAI9FbWl0dGVkIGJ5IGBsYXVuY2hfZGFvYCBhbmQgYGxhdW5jaF93aGVuX3JlYWR5YDogZXZlcnkgY29udHJhY3QgaXMgTGl2ZQp3aXRoIHRoZSBUcmVhc3VyeSBhcyBhZG1pbiwgYW5kIHRoZSBNYW5hZ2VyIGhvbGRzIG5vIGZ1cnRoZXIgYXV0aG9yaXR5LgAAAAAAAAAAC0Rhb0xhdW5jaGVkAAAAAAEAAAAMZGFvX2xhdW5jaGVkAAAABgAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAA9sYXVuY2hlZF9sZWRnZXIAAAAABgAAAAAAAAAAAAAAB21vZHVsZXMAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAAAAAAAAAAAAA5sYXVuY2hfYXVjdGlvbgAAAAAAAQAAAAAAAAAAAAAAEmxhdW5jaF9tYXJrZXRwbGFjZQAAAAAAAQAAAAAAAACBVGhlIHJlZ2lzdGVyZWQgbW9kdWxlcyBhdCBsYXVuY2ggKHRoZSBUb2tlbidzIHJlZ2lzdHJ5KTogdGhlCmluZGV4ZXIga25vd3MgdGhlIGxhdW5jaCBzZXQgd2l0aG91dCB0aGUgVG9rZW4ncyBgTW9kdWxlUmVnaXN0ZXJlZGAuAAAAAAAACHJlZ2lzdHJ5AAAD6gAAB9AAAAALTW9kdWxlRW50cnkAAAAAAAAAAAI=", "AAAABQAAAIZFbWl0dGVkIGJ5IGBjaGFuZ2Vfc2x1Z2A6IGEgbGF1bmNoZWQgREFPIG1vdmVkIHRvIGBuZXdfc2x1Z2AgYW5kIHJlbGVhc2VkCmBvbGRfc2x1Z2AsIHdoaWNoIGFueSBEQU8gbWF5IGNsYWltIGZyb20gdGhlIHNhbWUgbGVkZ2VyIG9uLgAAAAAAAAAAAAtTbHVnQ2hhbmdlZAAAAAABAAAADHNsdWdfY2hhbmdlZAAAAAMAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAIbmV3X3NsdWcAAAAQAAAAAQAAAAAAAAAIb2xkX3NsdWcAAAAQAAAAAAAAAAI=", "AAAABQAAANJFbWl0dGVkIHdoZW4gdGhlIERBTydzIHNsdWcgYmVjb21lcyBpdHMgdW5pcXVlIGlkOiBhdCBsYXVuY2gsIG9yIGVhcmxpZXIKd2hlbiBgb3Blbl9hc3N1cmFuY2VgIHJlc2VydmVzIGl0IChpdCBjYW4gbGF0ZXIgY2hhbmdlIGJ5IHZvdGUsIHNlZQpgU2x1Z0NoYW5nZWRgLCBvciBiZSBmcmVlZCBhZnRlciBhIGZhaWxlZCBkcml2ZSwgc2VlIGBTbHVnUmVsZWFzZWRgKS4AAAAAAAAAAAALU2x1Z0NsYWltZWQAAAAAAQAAAAxzbHVnX2NsYWltZWQAAAACAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAAAAAAABHNsdWcAAAAQAAAAAQAAAAI=", "AAAABQAAABpFbWl0dGVkIGJ5IGBhY2NlcHRfYWRtaW5gLgAAAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABQAAAEhFbWl0dGVkIGJ5IGByZWxlYXNlX3NsdWdgOiBhIGZhaWxlZCBkcml2ZSdzIHJlc2VydmVkIHNsdWcgaXMgZnJlZSBhZ2Fpbi4AAAAAAAAADFNsdWdSZWxlYXNlZAAAAAEAAAANc2x1Z19yZWxlYXNlZAAAAAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAEc2x1ZwAAABAAAAABAAAAAg==", "AAAABQAAAEVFbWl0dGVkIGJ5IGBwcm9wb3NlX2FkbWluYDsgdGhlIGhhbmRvdmVyIGNvbXBsZXRlcyBhdCBgYWNjZXB0X2FkbWluYC4AAAAAAAAAAAAADUFkbWluUHJvcG9zZWQAAAAAAAABAAAADmFkbWluX3Byb3Bvc2VkAAAAAAACAAAAAAAAAA1jdXJyZW50X2FkbWluAAAAAAAAEwAAAAEAAAAAAAAADnByb3Bvc2VkX2FkbWluAAAAAAATAAAAAQAAAAI=", "AAAABQAAABtFbWl0dGVkIGJ5IGBwYXVzZV9mYWN0b3J5YC4AAAAAAAAAAA1GYWN0b3J5UGF1c2VkAAAAAAAAAQAAAA5mYWN0b3J5X3BhdXNlZAAAAAAAAAAAAAI=", "AAAABQAAAHBFbWl0dGVkIGJ5IGBjcmVhdGVfbW9kdWxlYDogdGhlIGBuYHRoIG1vZHVsZSBvZiBga2luZGAgZm9yIHRoZSBEQU8sCmF0IGBwcmVkaWN0X21vZHVsZV9hZGRyZXNzKHRva2VuLCBraW5kLCBuKWAuAAAAAAAAAA1Nb2R1bGVDcmVhdGVkAAAAAAAAAQAAAA5tb2R1bGVfY3JlYXRlZAAAAAAABAAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAARraW5kAAAAEQAAAAEAAAAAAAAAAW4AAAAAAAAEAAAAAAAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAI=", "AAAABQAAAKRFbWl0dGVkIGJ5IGBvcGVuX2Fzc3VyYW5jZWA6IHRoZSBkcml2ZSdzIGxpc3QsIGl0cyBkZWFkbGluZSBhbmQgdGhlCmxhdW5jaCBjb25maWcgZXZlcnkgbGF1bmNoIHBhdGggd2lsbCB1c2UuIFRoZSBzbHVnIGlzIHJlc2VydmVkCihgU2x1Z0NsYWltZWRgKSBpbiB0aGUgc2FtZSBjYWxsLgAAAAAAAAAPQXNzdXJhbmNlT3BlbmVkAAAAAAEAAAAQYXNzdXJhbmNlX29wZW5lZAAAAAYAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAMY2xhaW1fbWludGVyAAAAEwAAAAAAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAAAAAAAAAAACGRlYWRsaW5lAAAABgAAAAAAAAAAAAAADmxhdW5jaF9hdWN0aW9uAAAAAAABAAAAAAAAAAAAAAASbGF1bmNoX21hcmtldHBsYWNlAAAAAAABAAAAAAAAAAI=", "AAAABQAAAB1FbWl0dGVkIGJ5IGB1bnBhdXNlX2ZhY3RvcnlgLgAAAAAAAAAAAAAPRmFjdG9yeVVucGF1c2VkAAAAAAEAAAAQZmFjdG9yeV91bnBhdXNlZAAAAAAAAAAC", "AAAABQAAAENFbWl0dGVkIGJ5IGB1cGdyYWRlX21hbmFnZXJgLCBiZWZvcmUgdGhlIE1hbmFnZXIncyBjb2RlIGlzIHN3YXBwZWQuAAAAAAAAAAAPTWFuYWdlclVwZ3JhZGVkAAAAAAEAAAAQbWFuYWdlcl91cGdyYWRlZAAAAAUAAAAAAAAACWZyb21faGFzaAAAAAAAA+4AAAAgAAAAAQAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAAAAAAADGZyb21fdmVyc2lvbgAAABAAAAAAAAAAAAAAAAp0b192ZXJzaW9uAAAAAAAQAAAAAAAAAAAAAAAPdXBncmFkZWRfbGVkZ2VyAAAAAAYAAAAAAAAAAg==", "AAAABQAAAElFbWl0dGVkIGJ5IGBhcHByb3ZlX3VwZ3JhZGVgIChvbmNlIHBlciBwYXRoOiByZS1hcHByb3ZpbmcgZW1pdHMgbm90aGluZykuAAAAAAAAAAAAAA9VcGdyYWRlQXBwcm92ZWQAAAAAAQAAABB1cGdyYWRlX2FwcHJvdmVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAPYXBwcm92ZWRfbGVkZ2VyAAAAAAYAAAAAAAAAAg==", "AAAABQAAABtFbWl0dGVkIGJ5IHRoZSBjb25zdHJ1Y3Rvci4AAAAAAAAAABJNYW5hZ2VySW5pdGlhbGl6ZWQAAAAAAAEAAAATbWFuYWdlcl9pbml0aWFsaXplZAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAAAAAAAAAAAA9kZXBsb3llZF9sZWRnZXIAAAAABgAAAAAAAAAC", "AAAABQAAACFFbWl0dGVkIGJ5IGB1cGRhdGVfcGVuZGluZ19zbHVnYC4AAAAAAAAAAAAAElBlbmRpbmdTbHVnVXBkYXRlZAAAAAAAAQAAABRwZW5kaW5nX3NsdWdfdXBkYXRlZAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAEc2x1ZwAAABAAAAAAAAAAAg==", "AAAABQAAAEBBIHZvdGUgc291cmNlIGFwcHJvdmVkIChvciBpdHMgYXBwcm92YWwgd2l0aGRyYXduKSBmb3IgbmV3IERBT3MuAAAAAAAAABJWb3RlU291cmNlQXBwcm92ZWQAAAAAAAEAAAAUdm90ZV9zb3VyY2VfYXBwcm92ZWQAAAADAAAAAAAAAAZzb3VyY2UAAAAAABMAAAABAAAAAAAAAAhhcHByb3ZlZAAAAAEAAAAAAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAC", "AAAABQAAACNFbWl0dGVkIGJ5IGByZXZva2VfaW1wbGVtZW50YXRpb25gLgAAAAAAAAAAFUltcGxlbWVudGF0aW9uUmV2b2tlZAAAAAAAAAEAAAAWaW1wbGVtZW50YXRpb25fcmV2b2tlZAAAAAAAAgAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAA5yZXZva2VkX2xlZGdlcgAAAAAABgAAAAAAAAAC", "AAAABQAAACJFbWl0dGVkIGJ5IGBjYW5jZWxfcGVuZGluZ19hZG1pbmAuAAAAAAAAAAAAFkFkbWluUHJvcG9zYWxDYW5jZWxsZWQAAAAAAAEAAAAYYWRtaW5fcHJvcG9zYWxfY2FuY2VsbGVkAAAAAgAAAAAAAAANY3VycmVudF9hZG1pbgAAAAAAABMAAAABAAAAAAAAAA9jYW5jZWxsZWRfYWRtaW4AAAAAEwAAAAEAAAAC", "AAAABQAAACdFbWl0dGVkIGJ5IGBzZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uYC4AAAAAAAAAABdMYXRlc3RJbXBsZW1lbnRhdGlvblNldAAAAAABAAAAGWxhdGVzdF9pbXBsZW1lbnRhdGlvbl9zZXQAAAAAAAADAAAAAAAAAARuYW1lAAAAEAAAAAEAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAACVFbWl0dGVkIGJ5IGByZWdpc3Rlcl9pbXBsZW1lbnRhdGlvbmAuAAAAAAAAAAAAABhJbXBsZW1lbnRhdGlvblJlZ2lzdGVyZWQAAAABAAAAGWltcGxlbWVudGF0aW9uX3JlZ2lzdGVyZWQAAAAAAAAEAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAAAAAAAAQcHVibGlzaGVkX2xlZGdlcgAAAAYAAAAAAAAAAg==", "AAAABQAAAFZFbWl0dGVkIGJ5IGBzZXRfY3VycmVudF9pbXBsZW1lbnRhdGlvbnNgOiB0aGUgaGFzaGVzIG5ldyBEQU9zIGFuZCBtb2R1bGVzCmRlcGxveSBmcm9tLgAAAAAAAAAAAB1DdXJyZW50SW1wbGVtZW50YXRpb25zVXBkYXRlZAAAAAAAAAEAAAAfY3VycmVudF9pbXBsZW1lbnRhdGlvbnNfdXBkYXRlZAAAAAAHAAAAAAAAAAV0b2tlbgAAAAAAA+4AAAAgAAAAAAAAAAAAAAAIbWV0YWRhdGEAAAPuAAAAIAAAAAAAAAAAAAAAB2F1Y3Rpb24AAAAD7gAAACAAAAAAAAAAAAAAAAhnb3Zlcm5vcgAAA+4AAAAgAAAAAAAAAAAAAAAIdHJlYXN1cnkAAAPuAAAAIAAAAAAAAAAAAAAAC21hcmtldHBsYWNlAAAAA+4AAAAgAAAAAAAAAAAAAAAGY2xhaW1zAAAAAAPuAAAAIAAAAAAAAAAC", "AAAAAQAAAGxBIHJlY29yZGVkIGFzc3VyYW5jZSBkcml2ZTogdGhlIENsYWltTWludGVyIGxpc3QsIGl0cyBkZWFkbGluZSBhbmQgdGhlCmxhdW5jaCBjb25maWcgZXZlcnkgbGF1bmNoIHBhdGggdXNlcy4AAAAAAAAACUFzc3VyYW5jZQAAAAAAAAQAAAApVGhlIERBTydzIENsYWltTWludGVyIGhvbGRpbmcgdGhlIGVzY3Jvdy4AAAAAAAAMY2xhaW1fbWludGVyAAAAEwAAADxMZWRnZXIgdGltZXN0YW1wIGFmdGVyIHdoaWNoIGFuIHVubGF1bmNoZWQgZHJpdmUgaGFzIGZhaWxlZC4AAAAIZGVhZGxpbmUAAAAGAAAAAAAAAA1sYXVuY2hfY29uZmlnAAAAAAAH0AAAAAxMYXVuY2hDb25maWcAAAAAAAAAB2xpc3RfaWQAAAAABA==", "AAAAAgAAAIVBIG1vZHVsZSB0aGUgTWFuYWdlciBkZXBsb3lzIGZvciBhIERBTyAoYGNyZWF0ZV9kYW9gIC8gYGNyZWF0ZV9tb2R1bGVgKSwKd2l0aCBpdHMgY3JlYXRpb24gY29uZmlnLiBFYWNoIHZhcmlhbnQgaXMgb25lIHJlZ2lzdHJ5IGtpbmQuAAAAAAAAAAAAAApNb2R1bGVTcGVjAAAAAAADAAAAAQAAAAAAAAAHQXVjdGlvbgAAAAABAAAH0AAAAA1BdWN0aW9uQ29uZmlnAAAAAAAAAQAAAAAAAAALTWFya2V0cGxhY2UAAAAAAQAAB9AAAAARTWFya2V0cGxhY2VDb25maWcAAAAAAAABAAAAAAAAAAZDbGFpbXMAAAAAAAEAAAfQAAAADENsYWltc0NvbmZpZw==", "AAAAAQAAAS5UaGUgb25seSBmYWN0b3J5IHN0YXRlIHJldGFpbmVkIHVudGlsIHRoZSBsYXVuY2ggYWRtaW5pc3RyYXRvciBmaW5hbGlzZXMgYSBEQU8uCgpNb2R1bGUgV0FTTSBoYXNoZXMgYXJlIGRlbGliZXJhdGVseSBOT1Qgc3RvcmVkOiBsYXVuY2ggcmVhZHMgdGhlIGNvZGUgZWFjaApjb250cmFjdCBydW5zIG5vdyAoYGV4ZWN1dGFibGUoKWApIGFuZCBjaGVja3MgaXQgYWdhaW5zdCB0aGUgcmVnaXN0cnksIHNvCmEgcHJlLWxhdW5jaCBhZG1pbiBgdXBncmFkZWAgaXMgaG9ub3VyZWQgYW5kIGEgcmV2b2tlZCBoYXNoIGlzIHJlamVjdGVkLgAAAAAAAAAAAApQZW5kaW5nRGFvAAAAAAAGAAAAAAAAAAlhZGRyZXNzZXMAAAAAAAfQAAAADERhb0FkZHJlc3NlcwAAALFQYXltZW50IGFzc2V0cyBmaXhlZCBpbiBlYWNoIG1vZHVsZSdzIGNyZWF0aW9uIGNvbmZpZzsgbGF1bmNoIHJlZnVzZXMKYSBtb2R1bGUgd2hvc2UgYHBheW1lbnRfYXNzZXQoKWAgY2hhbmdlZCAoYFBheW1lbnRBc3NldE1pc21hdGNoYCkuCmBOb25lYCBmb3IgYSBraW5kIHRoZSBEQU8gZG9lcyBub3QgaGF2ZS4AAAAAAAAVYXVjdGlvbl9wYXltZW50X2Fzc2V0AAAAAAAD6AAAABMAAAAAAAAAFGNsYWltc19wYXltZW50X2Fzc2V0AAAD6AAAABMAAABCVGhlIG9ubHkgYWRkcmVzcyB0aGF0IG1heSBsYXVuY2gsIHJlbmFtZSwgb3BlbiBhIGRyaXZlIG9yIHJlY292ZXIuAAAAAAAMbGF1bmNoX2FkbWluAAAAEwAAAAAAAAAZbWFya2V0cGxhY2VfcGF5bWVudF9hc3NldAAAAAAAA+gAAAATAAAAhVJlcXVlc3RlZCBzbHVnOyBjbGFpbWVkIGF0IGBsYXVuY2hfZGFvYCAob3IgcmVzZXJ2ZWQgYnkKYG9wZW5fYXNzdXJhbmNlYCksIGNoYW5nZWFibGUgd2l0aCBgdXBkYXRlX3BlbmRpbmdfc2x1Z2AgdW50aWwgYQpkcml2ZSBvcGVucy4AAAAAAAAEc2x1ZwAAABA=", "AAAAAQAAAGlDbGFpbU1pbnRlciBjcmVhdGlvbiBjb25maWc6IHRoZSBhc3NldCBTZXR1cCBsaXN0cyBhcmUgcHJpY2VkIGluLCB3aGljaAptdXN0IGJlIGEgU3RlbGxhciBBc3NldCBDb250cmFjdC4AAAAAAAAAAAAADENsYWltc0NvbmZpZwAAAAEAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAAT", "AAAAAQAAAGFBIERBTydzIGNvbnRyYWN0IGFkZHJlc3NlcyAocmV0dXJuZWQgYnkgYGNyZWF0ZV9kYW9gLCBlbWl0dGVkIGluCmBEYW9DcmVhdGVkYCBhbmQgYERhb0xhdW5jaGVkYCkuAAAAAAAAAAAAAAxEYW9BZGRyZXNzZXMAAAAHAAAArk1vZHVsZXMgZGVwbG95ZWQgd2l0aCB0aGUgREFPIChvciBhZGRlZCBpbiBTZXR1cCBieSBgY3JlYXRlX21vZHVsZWApOwpgTm9uZWAgZm9yIGEga2luZCBpdCBkb2VzIG5vdCBoYXZlLiBUaGUgVG9rZW4ncyByZWdpc3RyeSBpcyB0aGUKc291cmNlIG9mIHRydXRoIGZvciBtb2R1bGVzIGFkZGVkIGxhdGVyLgAAAAAAB2F1Y3Rpb24AAAAD6AAAABMAAAAAAAAABmNsYWltcwAAAAAD6AAAABMAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAALbWFya2V0cGxhY2UAAAAD6AAAABMAAAAAAAAACG1ldGFkYXRhAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAh0cmVhc3VyeQAAABM=", "AAAAAQAAAHZXaGF0IGxhdW5jaCBvcGVucy4gQW4gYXNzdXJhbmNlIGRyaXZlIHN0b3JlcyB0aGlzIGF0IGBvcGVuX2Fzc3VyYW5jZWAKYW5kIGV2ZXJ5IGxhdW5jaCBwYXRoIHRoZW4gdXNlcyB0aGUgc3RvcmVkIGNvcHkuAAAAAAAAAAAADExhdW5jaENvbmZpZwAAAAIAAABBU3RhcnQgdGhlIEF1Y3Rpb24gKGlmIHRoZSBEQU8gaGFzIG9uZSkgYW5kIGdyYW50IGl0IGFuIGFsbG93YW5jZS4AAAAAAAAObGF1bmNoX2F1Y3Rpb24AAAAAAAEAAAAqT3BlbiB0aGUgTWFya2V0cGxhY2UgKGlmIHRoZSBEQU8gaGFzIG9uZSkuAAAAAAASbGF1bmNoX21hcmtldHBsYWNlAAAAAAAB", "AAAAAQAAAGZBdWN0aW9uIGNyZWF0aW9uIGNvbmZpZy4gRXZlcnkgcGF5bWVudCBhc3NldCBtdXN0IGJlIGEgU3RlbGxhciBBc3NldApDb250cmFjdCAoYEludmFsaWRQYXltZW50QXNzZXRgKS4AAAAAAAAAAAANQXVjdGlvbkNvbmZpZwAAAAAAAAQAAABWU2Vjb25kcyBwZXIgYXVjdGlvbiAoYGNvbW1vbjo6TUlOX0FVQ1RJT05fRFVSQVRJT04gLi49CmNvbW1vbjo6TUFYX0FVQ1RJT05fRFVSQVRJT05gKS4AAAAAAAhkdXJhdGlvbgAAAAYAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAN0xvd2VzdCBmaXJzdCBiaWQsIGF0IGxlYXN0IGBjb21tb246Ok1JTl9SRVNFUlZFX1BSSUNFYC4AAAAADXJlc2VydmVfcHJpY2UAAAAAAAALAAAAVFNlY29uZHMgYSBsYXRlIGJpZCBleHRlbmRzIHRoZSBhdWN0aW9uIHRvICgxIC4uPQpgY29tbW9uOjpNQVhfQVVDVElPTl9USU1FX0JVRkZFUmApLgAAAAt0aW1lX2J1ZmZlcgAAAAAG", "AAAAAQAAAHtXQVNNIGhhc2hlcyBhIERBTydzIGNvbnRyYWN0cyB3ZXJlIGRlcGxveWVkIGZyb20gKGVtaXR0ZWQgaW4KYERhb0NyZWF0ZWRgKTsgYSBtb2R1bGUgdGhlIERBTyB3YXMgY3JlYXRlZCB3aXRob3V0IGlzIGBOb25lYC4AAAAAAAAAAA1EYW9XYXNtSGFzaGVzAAAAAAAABwAAAAAAAAAHYXVjdGlvbgAAAAPoAAAD7gAAACAAAAAAAAAABmNsYWltcwAAAAAD6AAAA+4AAAAgAAAAAAAAAAhnb3Zlcm5vcgAAA+4AAAAgAAAAAAAAAAttYXJrZXRwbGFjZQAAAAPoAAAD7gAAACAAAAAAAAAACG1ldGFkYXRhAAAD7gAAACAAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAACHRyZWFzdXJ5AAAD7gAAACA=", "AAAAAQAAAG9UaGUgR292ZXJub3IncyBzZXR0aW5ncyBhdCBjcmVhdGlvbi4gYGNyZWF0ZV9kYW9gIGNoZWNrcyB0aGUgYm91bmRzOyB0aGUKbGF1bmNoIGFkbWluIG1heSBjaGFuZ2UgdGhlbSBpbiBTZXR1cC4AAAAAAAAAABBHb3Zlcm5hbmNlQ29uZmlnAAAABgAAACRWb3RlcyBuZWVkZWQgdG8gcHJvcG9zZTsgYXQgbGVhc3QgMS4AAAAScHJvcG9zYWxfdGhyZXNob2xkAAAAAAAKAAAAQlNlY29uZHMgYmV0d2VlbiBxdWV1ZWluZyBhbmQgdGhlIGVhcmxpZXN0IGV4ZWN1dGlvbiAoc2FtZSBib3VuZHMpLgAAAAAAC3F1ZXVlX2RlbGF5AAAAAAQAAAA6UXVvcnVtIGluIGJhc2lzIHBvaW50cyBvZiB0aGUgdm90aW5nIHN1cHBseSwgMSAuLj0gMTAsMDAwLgAAAAAACnF1b3J1bV9icHMAAAAAAAQAAADoV2hlcmUgdm90aW5nIHBvd2VyIGNvbWVzIGZyb206IGBOb25lYCAob3IgdGhlIERBTydzIG93biB0b2tlbikgZm9yCnRva2VuLXdlaWdodGVkIHZvdGluZywgZWxzZSBhIHZvdGUgc291cmNlIHRoZSBNYW5hZ2VyIGFkbWluIGFwcHJvdmVkCihgYXBwcm92ZV92b3RlX3NvdXJjZWApLiBQZXJtYW5lbnQgb25jZSB0aGUgREFPIGlzIGNyZWF0ZWQKKGRvY3MvZGVzaWducy9nb3Zlcm5hbmNlLWFkYXB0ZXIubWQpLgAAAAt2b3RlX3NvdXJjZQAAAAPoAAAAEwAAAHBTZWNvbmRzIGZyb20gYHByb3Bvc2VgIHRvIHRoZSBzdGFydCBvZiB2b3RpbmcKKGBjb21tb246Ok1JTl9HT1ZFUk5BTkNFX0RFTEFZIC4uPSBjb21tb246Ok1BWF9HT1ZFUk5BTkNFX0RFTEFZYCkuAAAADHZvdGluZ19kZWxheQAAAAQAAAAoU2Vjb25kcyB2b3Rpbmcgc3RheXMgb3BlbiAoc2FtZSBib3VuZHMpLgAAAA12b3RpbmdfcGVyaW9kAAAAAAAABA==", "AAAAAQAAAEZgY3JlYXRlX2Rhb2AncyBpbnB1dC4gQm90aCBgZGVwbG95ZXJgIGFuZCBgbGF1bmNoX2FkbWluYCBhdXRob3Jpc2UgaXQuAAAAAAAAAAAAEURhb0NyZWF0aW9uUGFyYW1zAAAAAAAABAAAAGNTYWx0cyB0aGUgYWRkcmVzc2VzIHdpdGggYG5vbmNlYCwgc28gZWFjaCBkZXBsb3llciBoYXMgaXRzIG93bgphZGRyZXNzIHNwYWNlIChgcHJlZGljdF9hZGRyZXNzZXNgKS4AAAAACGRlcGxveWVyAAAAEwAAAAAAAAAOaW5pdGlhbF9jb25maWcAAAAAB9AAAAAWSW5pdGlhbERhb0NvbmZpZ1ZhbHVlcwAAAAAAOkFkbWluIG9mIGV2ZXJ5IGNvbnRyYWN0IGluIFNldHVwOyBjb25zZW50cyB0byBiZWluZyBuYW1lZC4AAAAAAAxsYXVuY2hfYWRtaW4AAAATAAAAAAAAAAVub25jZQAAAAAAAAY=", "AAAAAQAAAFBNYXJrZXRwbGFjZSBjcmVhdGlvbiBjb25maWcuIFRoZSBwYXltZW50IGFzc2V0IG11c3QgYmUgYSBTdGVsbGFyIEFzc2V0CkNvbnRyYWN0LgAAAAAAAAARTWFya2V0cGxhY2VDb25maWcAAAAAAAACAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAEBUaGUgREFPJ3MgY3V0IG9mIHNlY29uZGFyeSBzYWxlcywgYXQgbW9zdCBgY29tbW9uOjpNQVhfRkVFX0JQU2AuAAAAEXNlY29uZGFyeV9mZWVfYnBzAAAAAAAABA==", "AAAAAQAAAIJUaGUgcGFpZCBjbGFpbSBsaXN0IGEgcGVuZGluZyBEQU8ncyBhc3N1cmFuY2UgZHJpdmUgb3BlbnMgKGBvcGVuX2Fzc3VyYW5jZWApLApwcmljZWQgaW4gdGhlIERBTydzIHJlY29yZGVkIGBjbGFpbXNfcGF5bWVudF9hc3NldGAuAAAAAAAAAAAAE0Fzc3VyYW5jZUxpc3RQYXJhbXMAAAAABwAAADxMZWRnZXIgdGltZXN0YW1wIGFmdGVyIHdoaWNoIGFuIHVubGF1bmNoZWQgZHJpdmUgaGFzIGZhaWxlZC4AAAAIZGVhZGxpbmUAAAAGAAAAOUNsYWltcyBzdG9wIGF0IHRoaXMgbGVkZ2VyIHRpbWVzdGFtcCAoYWZ0ZXIgbGF1bmNoLCB0b28pLgAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAARFByaWNlIHBlciB0b2tlbiAoMCBmb3IgYSBmcmVlIGRyaXZlIHRoYXQgc3RpbGwgbmVlZHMgaXRzIHRocmVzaG9sZCkuAAAABXByaWNlAAAAAAAACwAAAB5NZXJrbGUgcm9vdCBvZiB0aGUgY2xhaW0gbGlzdC4AAAAAAARyb290AAAD7gAAACAAAAAzRGlzdGluY3QgY2xhaW1lcnMgbmVlZGVkIGJlZm9yZSB0aGUgREFPIG1heSBsYXVuY2guAAAAABJ0aHJlc2hvbGRfY2xhaW1lcnMAAAAAAAQAAAA6VG9rZW5zIHRoZSBsaXN0IG1heSBtaW50OyBhbHNvIHRoZSBtaW50IGFsbG93YW5jZSBncmFudGVkLgAAAAAABXRvdGFsAAAAAAAABAAAADBXaGVyZSB0aGUgZnVsbCB0cmVlIGlzIHB1Ymxpc2hlZCAoYGlwZnM6Ly8uLi5gKS4AAAAIdHJlZV91cmkAAAAQ", "AAAAAQAAAIdBIHJlZ2lzdHJ5IHJlY29yZCAoYHJlZ2lzdGVyX2ltcGxlbWVudGF0aW9uYCkuIEltbXV0YWJsZSBvbmNlIHdyaXR0ZW4sCmV4Y2VwdCB0aGF0IGByZXZva2VfaW1wbGVtZW50YXRpb25gIHNldHMgYHJldm9rZWRgLCBwZXJtYW5lbnRseS4AAAAAAAAAABVJbXBsZW1lbnRhdGlvblZlcnNpb24AAAAAAAAFAAAAe1RoZSBzbG90IG5hbWUgKGBUb2tlbmAsIGBHb3Zlcm5vcmAsIGBDbGFpbU1pbnRlcmAsIGBNYW5hZ2VyYCwgLi4uKTsKYW4gdXBncmFkZSBwYXRoIGpvaW5zIHR3byBoYXNoZXMgb2YgdGhlIHNhbWUgbmFtZSBvbmx5LgAAAAAEbmFtZQAAABAAAAAkTGVkZ2VyIHNlcXVlbmNlIG9mIHRoZSByZWdpc3RyYXRpb24uAAAAEHB1Ymxpc2hlZF9sZWRnZXIAAAAGAAAAAAAAAAdyZXZva2VkAAAAAAEAAAA6UmVsZWFzZSB2ZXJzaW9uLCB3aGljaCBjb250cmFjdHMgcnVubmluZyB0aGlzIGhhc2ggcmVwb3J0LgAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACA=", "AAAAAQAAAEdUaGUgaW1wbGVtZW50YXRpb24gaGFzaGVzIGBjcmVhdGVfZGFvYCBhbmQgYGNyZWF0ZV9tb2R1bGVgIGRlcGxveSBmcm9tLgAAAAAAAAAAFkN1cnJlbnRJbXBsZW1lbnRhdGlvbnMAAAAAAAcAAAAAAAAAB2F1Y3Rpb24AAAAD7gAAACAAAAAAAAAABmNsYWltcwAAAAAD7gAAACAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAAC21hcmtldHBsYWNlAAAAA+4AAAAgAAAAAAAAAAhtZXRhZGF0YQAAA+4AAAAgAAAAAAAAAAV0b2tlbgAAAAAAA+4AAAAgAAAAAAAAAAh0cmVhc3VyeQAAA+4AAAAg", "AAAAAQAAAGZXaGF0IGBjcmVhdGVfZGFvYCBidWlsZHM6IHRoZSBjb2xsZWN0aW9uLCBwcm9maWxlLCBzbHVnLCBnb3Zlcm5hbmNlLAptb2R1bGVzLCBhbmQgbWVtYmVyc2hpcCBzd2l0Y2hlcy4AAAAAAAAAAAAWSW5pdGlhbERhb0NvbmZpZ1ZhbHVlcwAAAAAACQAAAAAAAAAKZ292ZXJuYW5jZQAAAAAH0AAAABBHb3Zlcm5hbmNlQ29uZmlnAAAAo1RoZSBtb2R1bGVzIHRvIGRlcGxveSB3aXRoIHRoZSBEQU8sIGVhY2gga2luZCBhdCBtb3N0IG9uY2U7IGFsbCBhcmUKb3B0aW9uYWwgKGRvY3MvZGVzaWducy9tZW1iZXJzaGlwLW1vZGVscy5tZCDCpzIpLiBNb3JlIGNhbiBiZSBhZGRlZApsYXRlciB3aXRoIGBjcmVhdGVfbW9kdWxlYC4AAAAAB21vZHVsZXMAAAAD6gAAB9AAAAAKTW9kdWxlU3BlYwAAAAAAlkRBTyBwcm9maWxlIEpTT04gKGRlc2NyaXB0aW9uLCBsaW5rcywgaW1hZ2UpLCAxIHRvCmBjb21tb246Ok1BWF9QUk9GSUxFX0xFTkdUSGAgYnl0ZXMuIEV2ZW50LW9ubHk6IHRoZSBNZXRhZGF0YSBjb250cmFjdAplbWl0cyBpdCBhbmQgc3RvcmVzIGl0cyBoYXNoLgAAAAAAB3Byb2ZpbGUAAAAAEAAAAEJCYXNlIFVSTCBvZiB0aGUgaW1hZ2UgY29tcG9zaXRvciB1c2VkIGJ5IHRoZSBvbi1jaGFpbiBgdG9rZW5fdXJpYC4AAAAAAA1yZW5kZXJlcl9iYXNlAAAAAAAAEAAAAKhSZXF1ZXN0ZWQgaHVtYW4tZnJpZW5kbHkgREFPIGlkZW50aWZpZXIgKGBbYS16MC05LV1gLCA0LTYzIGNoYXJzKS4KQ2xhaW1lZCAodW5pcXVlKSBvbmx5IGF0IGBsYXVuY2hfZGFvYDsgYSBsYXVuY2hlZCBEQU8gY2FuIG1vdmUgdG8gYSBuZXcKc2x1ZyBieSB2b3RlIChgY2hhbmdlX3NsdWdgKS4AAAAEc2x1ZwAAABAAAAAfQ29sbGVjdGlvbiBuYW1lLCAxIHRvIDQwIGJ5dGVzLgAAAAAKdG9rZW5fbmFtZQAAAAAAEAAAAGZUaGUgbWVtYmVyc2hpcCBzd2l0Y2hlcyB0aGUgVG9rZW4gc3RhcnRzIHdpdGgKKGRvY3MvZGVzaWducy9sb2NrZWQtdG9rZW5zLm1kKTsgYWxsIG9mZiBpcyBhbiBvcGVuIERBTy4AAAAAAA50b2tlbl9zZXR0aW5ncwAAAAAH0AAAAA1Ub2tlblNldHRpbmdzAAAAAAAAIUNvbGxlY3Rpb24gc3ltYm9sLCAxIHRvIDEwIGJ5dGVzLgAAAAAAAAx0b2tlbl9zeW1ib2wAAAAQAAAAmEtpbmRzIGluIGBtb2R1bGVzYCB3aG9zZSBtb2R1bGUgYmVjb21lcyBhIHRyYW5zZmVyIGFnZW50IGF0IGNyZWF0aW9uCih2aXNpYmxlIHRvIGV2ZXJ5IG1lbWJlciBiZWZvcmUgdGhleSBqb2luKTsgbGF0ZXIgYWdlbnRzIG5lZWQgYQpwcm9wb3NhbCBvbmNlIExpdmUuAAAAD3RyYW5zZmVyX2FnZW50cwAAAAPqAAAAEQ==", "AAAAAAAABABNb3ZlcyB0aGUgc3RvcmVkIGRhdGEgdG8gdGhlIGxheW91dCB0aGlzIGNvZGUgZXhwZWN0cwooYFNUT1JBR0VfVkVSU0lPTmApIGFuZCBlbWl0cyBgTWlncmF0ZWRgLiBQYW5pY3MgYE5vdGhpbmdUb01pZ3JhdGVgCihhIGNvbW1vbiBlcnJvciwgNzAxMikgdW5sZXNzIHRoZSBzdG9yZWQgbGF5b3V0IGlzIG9sZGVyIHRoYW4gdGhlCmNvZGUncy4KCmB1cGdyYWRlX21hbmFnZXJgIHN3YXBzIHRoZSBjb2RlIGF0IHRoZSBlbmQgb2YgaXRzIG93biBjYWxsLCBzbyBhCnJlbGVhc2UgdGhhdCBjaGFuZ2VzIHRoZSBsYXlvdXQgaXMgbWlncmF0ZWQgaW4gYSBzZWNvbmQgdHJhbnNhY3Rpb24uCkFueW9uZSBtYXkgY2FsbCBpdDogaXQgcnVucyBvbmx5IHRoZSBtaWdyYXRpb24gdGhhdCB0aGUgaW5zdGFsbGVkIGNvZGUKZGVmaW5lcywgd2hpY2ggdGhlIGFkbWluIHJlZ2lzdGVyZWQsIGFubm91bmNlZCBhbmQgaW5zdGFsbGVkIGFmdGVyIHRoZQpub3RpY2UsIGFuZCBvbmx5IG9uY2UgcGVyIGxheW91dC4KClVudGlsIGl0IHJ1bnMsIGV2ZXJ5IGVudHJ5IHBvaW50IHRoYXQgY2hhbmdlcyBzdGF0ZSBmYWlscwpgU3RvcmFnZVZlcnNpb25NaXNtYXRjaGAsIGV4Y2VwdCB0aGUgcGF0aCB0aGF0IHVwZ3JhZGVzIHRoZSBNYW5hZ2VyCmFnYWluOiBgcmVnaXN0ZXJfaW1wbGVtZW50YXRpb25gIGFuZCBgc2V0X2xhdGVzdF9pbXBsZW1lbnRhdGlvbmAgZm9yCnRoZSBuYW1lIGBNYW5hZ2VyYCwgYGFwcHJvdmVfdXBncmFkZWAgdG8gYSBoYXNoIHJlZ2lzdGVyZWQgYXMKYE1hbmFnZXJgLCBhbmQgYHVwZ3JhZGVfbWFuYWdlcmAuIElmIGEgbWlncmF0aW9uIGZhaWxzLCB0aGUgYWRtaW4KaW5zdGFsbHMgZml4ZWQgY29kZSB0aHJvdWdoIHRoYXQgcGF0aCwgYWZ0ZXIgdGhlIHVzdWFsIG5vdGljZS4gVGhlCnBhdGggcmVhZHMgYW5kIHdyaXRlcyBvbmx5IHRoZSBrZXlzIGEgcmVsZWFzZSBtdXN0IGtlZXAgcmVhZGFibGUgYnkKYm90aCBpdHMgY29kZSBhbmQgdGhlIGNvZGUgYmVmb3JlIGl0OiB0aGUgYWRtaW4sIHRoZSB1cGdyAAAAB21pZ3JhdGUAAAAAAAAAAAA=", "AAAAAAAAACtSZXR1cm5zIHRoZSBhY3RpdmUgTWFuYWdlciByZWxlYXNlIHZlcnNpb24uAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAAEA==", "AAAAAAAAALVTbHVnIGhlbGQgYnkgYHRva2VuX2FkZHJlc3NgLCBpZiBhbnk6IGEgbGF1bmNoZWQgREFPJ3MsIG9yIHRoZSBvbmUgYQpwZW5kaW5nIERBTydzIGFzc3VyYW5jZSBkcml2ZSByZXNlcnZlZC4gQW5vdGhlciBwZW5kaW5nIERBTydzCnJlcXVlc3RlZCBzbHVnIGlzIGluIGBnZXRfcGVuZGluZ19kYW9gLiBSZWFkLW9ubHkuAAAAAAAACGdldF9zbHVnAAAAAQAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAD6AAAABA=", "AAAAAAAAABlDdXJyZW50IGFkbWluLiBSZWFkLW9ubHkuAAAAAAAACWdldF9hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAACVSZXR1cm5zIHRoZSBhY3RpdmUgTWFuYWdlciBXQVNNIGhhc2guAAAAAAAACXdhc21faGFzaAAAAAAAAAAAAAABAAAD7gAAACA=", "AAAAAAAABABDcmVhdGUgYSBuZXcgREFPOiB0aGUgZm91ciBjb3JlIGNvbnRyYWN0cyAoVG9rZW4sIE1ldGFkYXRhLCBHb3Zlcm5vciwKVHJlYXN1cnkpIGFuZCB0aGUgbW9kdWxlcyBsaXN0ZWQgaW4gYGluaXRpYWxfY29uZmlnLm1vZHVsZXNgLCBkZXBsb3llZAphdG9taWNhbGx5IGZyb20gdGhlIGN1cnJlbnQgaW1wbGVtZW50YXRpb25zLCB3aXRoIGVhY2ggbW9kdWxlCnJlZ2lzdGVyZWQgb24gdGhlIFRva2VuLiBFdmVyeSBtb2R1bGUncyBwYXltZW50IGFzc2V0IG11c3QgYmUgYQpTdGVsbGFyIEFzc2V0IENvbnRyYWN0LgoKVGhlIGxhdW5jaCBhZG1pbmlzdHJhdG9yIG93bnMgdGhlIHNldHVwIHdpbmRvdyBhbmQgbWF5IGNvbmZpZ3VyZSB0aGUKY29udHJhY3RzIGJlZm9yZSBgbGF1bmNoX2Rhb2AuCgojIEF1dGhvcml6YXRpb24KClJlcXVpcmVzIEJPVEggYHBhcmFtcy5kZXBsb3llcmAgYW5kIGBwYXJhbXMubGF1bmNoX2FkbWluYCB0byBhdXRob3JpemUKdGhlIGNhbGwgKG9uZSBzaWduYXR1cmUgaWYgdGhleSBhcmUgdGhlIHNhbWUgYWRkcmVzcykuIE1vZHVsZQpjb25zdHJ1Y3RvcnMgZG8gbm90IHJlcXVpcmUgYXV0aC4KClRoZSByZXF1ZXN0ZWQgc2x1ZyBpcyB2YWxpZGF0ZWQgYW5kIG11c3Qgbm90IGJlIGhlbGQsIGJ1dCBpdCBpcyBvbmx5CmNsYWltZWQgYXQgYGxhdW5jaF9kYW9gIG9yIHdoZW4gYSBkcml2ZSBvcGVucyAoYSBwZW5kaW5nIERBTyB3aXRob3V0IGEKZHJpdmUgaG9sZHMgbm8gc2x1Zywgc28gYW4gYWJhbmRvbmVkIGNyZWF0aW9uIGJsb2NrcyBub3RoaW5nKS4KCiMgRXJyb3JzCgoqIGBGYWN0b3J5UGF1c2VkYCAtIEZhY3RvcnkgaXMgcGF1c2VkCiogYEN1cnJlbnRJbXBsZW1lbnRhdGlvbnNOb3RTZXRgIC0gQ3VycmVudCBXQVNNIGhhc2hlcyBub3QgY29uZmlndXJlZAoqIGBJbnZhbGlkTW9kdWxlc2AgLSBBIGtpbmQgbGlzdGVkIHR3aWNlCiogYEludmFsaWRTbHVnYCAvIGBTbHVnVGFrZW5gIC0gTWFsZm9ybWVkIHNsdWcsIG9yIGhlbGQgYnkgYW5vdGhlciBEQU8KKiBgSW52YWxpZFBhAAAACmNyZWF0ZV9kYW8AAAAAAAEAAAAAAAAABnBhcmFtcwAAAAAH0AAAABFEYW9DcmVhdGlvblBhcmFtcwAAAAAAAAEAAAPpAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAABABMYXVuY2ggYSBjb25maWd1cmVkIERBTy4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSB0aGUgbGF1bmNoX2FkbWluIHdobyBjcmVhdGVkIHRoZSBEQU8uCgojIFZhbGlkYXRpb24KCi0gVGhlIGZhY3RvcnkgbXVzdCBub3QgYmUgcGF1c2VkIChgRmFjdG9yeVBhdXNlZGApCi0gVG9rZW4gdm90aW5nIHN1cHBseSBtdXN0IGJlID4gMCAoYXQgbGVhc3Qgb25lIHRva2VuIG1pbnRlZCB0byBhIGhvbGRlcgpvdGhlciB0aGFuIHRoZSBUcmVhc3VyeSBvciBhIG5vbi12b3RpbmcgbW9kdWxlKQotIGxhdW5jaF9hZG1pbiBtdXN0IGJlIHRoZSBjdXJyZW50IHRva2VuIGFkbWluIChgTGF1bmNoQWRtaW5Ob3RPd25lcmApCi0gVGhlIHJlcXVlc3RlZCBzbHVnIG11c3Qgc3RpbGwgYmUgdW5jbGFpbWVkIChgU2x1Z1Rha2VuYDsgY2hhbmdlIGl0IHdpdGgKYHVwZGF0ZV9wZW5kaW5nX3NsdWdgKQotIFRoZSBjb3JlIGNvbnRyYWN0cyBhbmQgZXZlcnkgcmVnaXN0ZXJlZCBtb2R1bGUgbXVzdCBDVVJSRU5UTFkgcnVuIGEKcmVnaXN0ZXJlZCwgbm9uLXJldm9rZWQgaGFzaCwgYXMgdGhlIGhvc3QgcmVwb3J0cyB0aGVpciBjb2RlCihgZXhlY3V0YWJsZSgpYCwgbm90IHRoZWlyIG93biBgd2FzbV9oYXNoKClgKSwgY2hlY2tlZCBiZWZvcmUgdGhlCk1hbmFnZXIgY2FsbHMgaW50byB0aGVtIChgUGVuZGluZ0Rhb1VzZXNSZXZva2VkSW1wbGVtZW50YXRpb25gKQotIEV2ZXJ5IG1vZHVsZSdzIGBwYXltZW50X2Fzc2V0KClgIG11c3QgZXF1YWwgdGhlIGFzc2V0IHJlY29yZGVkIGF0IGl0cwpjcmVhdGlvbiAoYFBheW1lbnRBc3NldE1pc21hdGNoYCkKCkFsbCBjaGVja3MgcnVuIGJlZm9yZSBhbnkgbGF1bmNoIGNhbGwsIHNvIGEgcmVmdXNhbCBsYXVuY2hlcyBub3RoaW5nLgoKIyBFZmZlY3RzCgoxLiBgdG9rZW4ubGF1bmNoYCB3aXRoIGFuIHVubGltaXRlZCBhbGxvd2FuY2UgZm9yIHRoZSBBdWN0aW9uIGlmCmBsYXVuY2hfYXVjdGlvbmA7IHRoZSBNYXJrZXRwbGFjZSBpcyBmdW5kZWQgcGVyIHBvb2wgYnkgAAAACmxhdW5jaF9kYW8AAAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAA1sYXVuY2hfY29uZmlnAAAAAAAH0AAAAAxMYXVuY2hDb25maWcAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAA6JNb3ZlIGEgbGF1bmNoZWQgREFPIHRvIGEgbmV3IHNsdWcuIFRoZSBvbGQgc2x1ZyBpcyByZWxlYXNlZCBhdCBvbmNlIGFuZAphbnkgREFPIG1heSBjbGFpbSBpdCwgZnJvbSB0aGlzIHNhbWUgdHJhbnNhY3Rpb24gb24uCgojIEF1dGhvcml6YXRpb24KClRoZSB0b2tlbidzIGFkbWluLCB3aGljaCBhZnRlciBsYXVuY2ggaXMgdGhlIERBTydzIFRyZWFzdXJ5LCBzbyB0aGlzCm9ubHkgcnVucyB0aHJvdWdoIGEgcGFzc2VkIHByb3Bvc2FsIChgdHJlYXN1cnkuZXhlY3V0ZWApLiBUaGlzIHJlbGllcyBvbgp0aGUgdG9rZW4gaGF2aW5nIG5vIGFkbWluIHRyYW5zZmVyIGFmdGVyIGxhdW5jaCAoYGNvbW1vbjo6YWRtaW46OmhhbmRvZmZgCmlzIG9uZS1zaG90KTsgYSB0b2tlbiByZWxlYXNlIHRoYXQgYWRkcyBvbmUgbXVzdCByZXZpc2l0IHRoaXMgY2hlY2suCgojIEVycm9ycwoKKiBgRmFjdG9yeVBhdXNlZGAgLSBTbHVnIGNsYWltcyBhcmUgc3RvcHBlZCB3aGlsZSB0aGUgZmFjdG9yeSBpcyBwYXVzZWQKKiBgU2x1Z05vdEZvdW5kYCAtIG5vIHNsdWcgaXMgcmVjb3JkZWQgZm9yIGB0b2tlbl9hZGRyZXNzYDogbm90IGEgREFPCnRoaXMgTWFuYWdlciBjcmVhdGVkLCBvciBhIHBlbmRpbmcgREFPIHdpdGhvdXQgYSBkcml2ZSAoaXQgdXNlcwpgdXBkYXRlX3BlbmRpbmdfc2x1Z2ApLiBBIERBTyBpbiBhbiBhc3N1cmFuY2UgZHJpdmUgaGFzIGl0cyBzbHVnCnJlY29yZGVkIGJ1dCBjYW5ub3QgcmVuYW1lOiBpdHMgVG9rZW4gYWRtaW4gaXMgdGhlIFRyZWFzdXJ5LCB3aGljaApjYW5ub3QgYWN0IGJlZm9yZSBsYXVuY2guCiogYFNsdWdVbmNoYW5nZWRgIC0gYG5ld19zbHVnYCBpcyB0aGUgREFPJ3MgY3VycmVudCBzbHVnCiogYEludmFsaWRTbHVnYCAvIGBTbHVnVGFrZW5gIC0gTWFsZm9ybWVkIHNsdWcsIG9yIGhlbGQgYnkgYW5vdGhlciBEQU8AAAAAAAtjaGFuZ2Vfc2x1ZwAAAAACAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAAAAAAIbmV3X3NsdWcAAAAQAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAE1BY2NlcHQgYSBwZW5kaW5nIGFkbWluIGhhbmRvdmVyLiBSZXF1aXJlcyB0aGUgcHJvcG9zZWQgYWRtaW4ncyBhdXRob3JpemF0aW9uLgAAAAAAAAxhY2NlcHRfYWRtaW4AAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAHBNb2R1bGVzIG9mIGBraW5kYCBgY3JlYXRlX21vZHVsZWAgZGVwbG95ZWQgZm9yIGB0b2tlbmAgc28gZmFyOiB0aGUgYG5gCnRoZSBuZXh0IG9uZSBpcyBkZXBsb3llZCB3aXRoLiBSZWFkLW9ubHkuAAAADG1vZHVsZV9jb3VudAAAAAIAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAEa2luZAAAABEAAAABAAAABA==", "AAAAAAAAAL1GcmVlIHRoZSBzbHVnIGEgZmFpbGVkIGRyaXZlIHJlc2VydmVkLiBBbnlvbmUgbWF5IGNhbGwgaXQuCgojIEVycm9ycwoKKiBgRGFvTm90Rm91bmRgIC8gYE5vQXNzdXJhbmNlYAoqIGBBc3N1cmFuY2VOb3RGYWlsZWRgIC0gdGhlIGRyaXZlIG1heSBzdGlsbCBsYXVuY2gKKiBgU2x1Z05vdEZvdW5kYCAtIGFscmVhZHkgcmVsZWFzZWQAAAAAAAAMcmVsZWFzZV9zbHVnAAAAAQAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAlZJbml0aWFsaXNlIHRoZSBNYW5hZ2VyLiBSdW5zIG9uY2UsIGF0IGRlcGxveW1lbnQ7IHRoZSBmYWN0b3J5IHN0YXJ0cwp1bnBhdXNlZCBhbmQgdGhlIHJlZ2lzdHJ5IGVtcHR5LgoKIyBBcmd1bWVudHMKCiogYGFkbWluYCAtIGNvbnRyb2xzIHRoZSByZWdpc3RyeSwgdGhlIGZhY3RvcnkgcGF1c2UsIHZvdGUgc291cmNlCmFwcHJvdmFscyBhbmQgdGhlIE1hbmFnZXIncyBvd24gdXBncmFkZQoqIGBjdXJyZW50X2hhc2hgIC0gdGhlIE1hbmFnZXIncyBvd24gV0FTTSBoYXNoLCB0aGUgYGZyb21faGFzaGAgb2YgaXRzCmZpcnN0IGB1cGdyYWRlX21hbmFnZXJgCiogYHZlcnNpb25gIC0gdGhlIE1hbmFnZXIncyByZWxlYXNlIHZlcnNpb24gKGZvciBleGFtcGxlICIwLjEuMCIpCiogYHVwZ3JhZGVfZGVsYXlgIC0gdGhlIHVwZ3JhZGUgbm90aWNlIGluIGxlZGdlcnMsIGZvcgpgdXBncmFkZV9tYW5hZ2VyYCBhbmQgYHJlY292ZXJfY2xhaW1zYAooYGNvbW1vbjo6dXBncmFkZTo6UkVDT01NRU5ERURfVVBHUkFERV9ERUxBWWAgb24gYSBwdWJsaWMgbmV0d29yaywKc2hvcnQgb24gdGVzdG5ldCk7IGNoYW5nZWFibGUgd2l0aCBgc2V0X3VwZ3JhZGVfZGVsYXlgAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAMY3VycmVudF9oYXNoAAAD7gAAACAAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAANdXBncmFkZV9kZWxheQAAAAAAAAQAAAAA", "AAAAAAAABABEZXBsb3kgYSBtb2R1bGUgZm9yIGFuIGV4aXN0aW5nIERBTyBmcm9tIHRoZSBjdXJyZW50IGltcGxlbWVudGF0aW9uCm9mIGBzcGVjYCdzIGtpbmQgKGRvY3MvZGVzaWducy9tZW1iZXJzaGlwLW1vZGVscy5tZCDCpzIpLiBOZWVkcyB0aGUKYXV0aG9yaXphdGlvbiBvZiB0aGUgVG9rZW4ncyBhZG1pbjogdGhlIGxhdW5jaCBhZG1pbiBpbiBTZXR1cCwgdGhlClRyZWFzdXJ5IChieSBwcm9wb3NhbCkgb25jZSBMaXZlLiBUaGUgcGF5bWVudCBhc3NldCBtdXN0IGJlIGEgU3RlbGxhcgpBc3NldCBDb250cmFjdC4KClRoZSBtb2R1bGUgbGFuZHMgYXQgYHByZWRpY3RfbW9kdWxlX2FkZHJlc3ModG9rZW4sIGtpbmQsIG4pYCB3aXRoCmBuID0gbW9kdWxlX2NvdW50KHRva2VuLCBraW5kKWAsIGFuZCBgZXhwZWN0ZWRfbmAgbXVzdCBlcXVhbCB0aGF0IGBuYAooYFN0YWxlTW9kdWxlSW5kZXhgKS4gQSBwcm9wb3NhbCByZWFkcyBgbW9kdWxlX2NvdW50YCB3aGlsZSBkcmFmdGluZwphbmQgYmFrZXMgdGhlIHNhbWUgYG5gIGludG8gdGhpcyBhY3Rpb24sIHNvIGl0IGVpdGhlciBkZXBsb3lzIGV4YWN0bHkKdGhlIG1vZHVsZSBpdHMgbGF0ZXIgYWN0aW9ucyB0YXJnZXQgb3IgdGhlIHdob2xlIGV4ZWN1dGlvbiByZXZlcnRzLgoKLSAqKlNldHVwOioqIHRoZSBtb2R1bGUgaXMgcmVnaXN0ZXJlZCBvbiB0aGUgVG9rZW4sIGFuZCBpdHMgcGF5bWVudAphc3NldCByZWNvcmRlZCBmb3IgdGhlIGxhdW5jaCBjaGVjazsgYGxhdW5jaF9kYW9gIGxhdW5jaGVzIGl0LgotICoqTGl2ZToqKiB0aGUgbW9kdWxlIGlzIGxhdW5jaGVkIGF0IG9uY2UgKGl0cyBhZG1pbiBpcyB0aGUKVHJlYXN1cnkpOyB0aGUgc2FtZSBwcm9wb3NhbCB0aGVuIHJlZ2lzdGVycyBpdCBvbiB0aGUgVG9rZW4gYW5kCmdyYW50cyBpdHMgYWxsb3dhbmNlLiBBIG1vZHVsZSBjcmVhdGVkIGFmdGVyIGxhdW5jaCBpcyBub3Qgb3BlbmVkOgp0aGUgcHJvcG9zYWwgb3BlbnMgaXQgb25jZSBpdCBob2xkcyBhbiBhbGxvd2FuY2UuCgojIEVycm9ycwoKKiBgRmFjAAAADWNyZWF0ZV9tb2R1bGUAAAAAAAADAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABHNwZWMAAAfQAAAACk1vZHVsZVNwZWMAAAAAAAAAAAAKZXhwZWN0ZWRfbgAAAAAABAAAAAEAAAPpAAAAEwAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAHhUaGUgcGVuZGluZyBEQU8ncyBhc3N1cmFuY2UgZHJpdmUsIGlmIG9uZSBpcyByZWNvcmRlZC4gUmVhZC1vbmx5LiBBCmZhaWxlZCBkcml2ZSBzdGF5cyByZWNvcmRlZDogdGhlIERBTyBuZXZlciBsYXVuY2hlcy4AAAANZ2V0X2Fzc3VyYW5jZQAAAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAACUFzc3VyYW5jZQAAAA==", "AAAAAAAAAVlQYXVzZSB0aGUgZmFjdG9yeSAoZW1lcmdlbmN5IG1lYXN1cmUpLiBXaGlsZSBwYXVzZWQsIGBjcmVhdGVfZGFvYCwKYGNyZWF0ZV9tb2R1bGVgLCBgb3Blbl9hc3N1cmFuY2VgLCBgbGF1bmNoX2Rhb2AsIGBsYXVuY2hfd2hlbl9yZWFkeWAsCmFuZCBgY2hhbmdlX3NsdWdgIGZhaWwgd2l0aCBgRmFjdG9yeVBhdXNlZGAuIFJlZnVuZHMsIGByZWxlYXNlX3NsdWdgLAphbmQgYHJlY292ZXJfY2xhaW1zYCBzdGF5IG9wZW4sIHNvIGEgcGF1c2UgY2FuIGVuZCBhIGRyaXZlIGluIHJlZnVuZHMKYnV0IG5ldmVyIHRyYXAgaXRzIGVzY3Jvdy4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4AAAAAAAANcGF1c2VfZmFjdG9yeQAAAAAAAAAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAJBQcm9wb3NlIGEgbmV3IGFkbWluLiBUaGUgaGFuZG92ZXIgY29tcGxldGVzIHdoZW4gYGFjY2VwdF9hZG1pbmAgaXMgY2FsbGVkLgoKT25seSBjYWxsYWJsZSBieSB0aGUgY3VycmVudCBhZG1pbi4gT3ZlcndyaXRlcyBhbnkgZWFybGllciBwcm9wb3NhbC4AAAANcHJvcG9zZV9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAOhUaGUgdXBncmFkZSBub3RpY2UgaW4gZm9yY2UsIGluIGxlZGdlcnMsIGZvciBgdXBncmFkZV9tYW5hZ2VyYCBhbmQgZm9yCmByZWNvdmVyX2NsYWltc2AgKHdoaWNoIGFsc28gbWVhc3VyZXMgaXQgZnJvbSB0aGUgZHJpdmUncyBkZWFkbGluZSwKYXQgYFNFQ09ORFNfUEVSX0xFREdFUmAgc2Vjb25kcyBwZXIgbGVkZ2VyIGFuZCBuZXZlciBsZXNzIHRoYW4KYE1JTl9SRUNPVkVSWV9SRUZVTkRfV0lORE9XYCkuAAAADXVwZ3JhZGVfZGVsYXkAAAAAAAAAAAAAAQAAAAQ=", "AAAAAAAAAP5UaGUgaGFzaCBhbm5vdW5jZWQgYXMgbGF0ZXN0IGZvciBgbmFtZWAgYW5kIHRoZSBsZWRnZXIgaXQgd2FzIGFubm91bmNlZAphdCAoRDQyKS4gVW5saWtlIGBnZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uYCwgYSByZXZva2VkIGhhc2ggaXMgc3RpbGwKcmV0dXJuZWQ6IHRoZSBwb2ludGVyIGlzIHdoYXQgdGhlIHBsYXRmb3JtJ3MgdXBncmFkZSBydWxlIGFuZCB0aGUgYXBwJ3MKcGVuZGluZy11cGdyYWRlIGRpc3BsYXkgcmVhZC4gUmVhZC1vbmx5LgAAAAAADmxhdGVzdF9wb2ludGVyAAAAAAABAAAAAAAAAARuYW1lAAAAEAAAAAEAAAPoAAAH0AAAAA1MYXRlc3RQb2ludGVyAAAA", "AAAAAAAABABPcGVuIGEgcGFpZCBjbGFpbSBkcml2ZSBiZWZvcmUgbGF1bmNoOiBtZW1iZXJzIGNsYWltIChhbmQgcGF5IGludG8gdGhlCkNsYWltTWludGVyJ3MgZXNjcm93KSB1bnRpbCBgdGhyZXNob2xkX2NsYWltZXJzYCBkaXN0aW5jdCBhZGRyZXNzZXMKaGF2ZSwgdGhlbiBhbnlvbmUgbWF5IGxhdW5jaCB0aGUgREFPIHdpdGggYGxhdW5jaF9jb25maWdgCihgbGF1bmNoX3doZW5fcmVhZHlgKS4gSWYgdGhlIGRlYWRsaW5lIHBhc3NlcyBmaXJzdCwgdGhlIGRyaXZlIGZhaWxzCmFuZCBtZW1iZXJzIGFyZSByZWZ1bmRlZC4gTmVlZHMgdGhlIGxhdW5jaCBhZG1pbidzIGF1dGhvcml6YXRpb24uCgpJbiBvbmUgY2FsbCBpdDoKMS4gb3BlbnMgdGhlIGxpc3Qgb24gdGhlIERBTydzIENsYWltTWludGVyLCBwcmljZWQgaW4gdGhlIGFzc2V0CnJlY29yZGVkIGF0IGl0cyBjcmVhdGlvbiwgYW5kIGdyYW50cyB0aGUgQ2xhaW1NaW50ZXIgYHRvdGFsYCBtaW50CmFsbG93YW5jZTsKMi4gcmVjb3JkcyB0aGUgZHJpdmUgKGxpc3QsIGRlYWRsaW5lLCBsYXVuY2ggY29uZmlnKSBhbmQgcmVzZXJ2ZXMgdGhlCkRBTydzIHNsdWcgKGBTbHVnQ2xhaW1lZGApLCBzbyBubyBvdGhlciBEQU8gY2FuIGxhdW5jaCB3aXRoIGl0OwozLiBoYW5kcyBldmVyeSBjb250cmFjdCdzIGFkbWluIHRvIHRoZSBUcmVhc3VyeSB3aXRob3V0IGdvaW5nIExpdmUsCndoaWNoIGZyZWV6ZXMgc2V0dGluZ3MsIGFydHdvcmssIG1pbnRzLCBhbGxvd2FuY2VzLCByZWdpc3RyYXRpb25zCmFuZCB1cGdyYWRlcyB1bnRpbCBsYXVuY2guIEZvdW5kZXJzIGFuZCBhcnR3b3JrIG11c3QgYmUgaW4gcGxhY2UKYmVmb3JlLgoKVGhlIENsYWltTWludGVyIGhvbGRzIG1lbWJlcnMnIHBheW1lbnRzLCBhbmQgdGhlIGxhdW5jaCBhZG1pbiBtYXkgaGF2ZQp1cGdyYWRlZCBpdCBpbiBTZXR1cCB0byBhbnkgYXBwcm92ZWQsIHJlZ2lzdGVyZWQgY29kZS4gU28gdGhlIGRyaXZlCm9wZW5zIG9ubHkgb24gdGhlIGNvZGUgdGhlIHBsYXRmb3JtIGRlcGxveXMgbm93ICh0aGUgAAAADm9wZW5fYXNzdXJhbmNlAAAAAAADAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAAAAAAEbGlzdAAAB9AAAAATQXNzdXJhbmNlTGlzdFBhcmFtcwAAAAAAAAAADWxhdW5jaF9jb25maWcAAAAAAAfQAAAADExhdW5jaENvbmZpZwAAAAEAAAPpAAAABAAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAABABVcGdyYWRlIGEgZmFpbGVkIGRyaXZlJ3MgQ2xhaW1NaW50ZXIsIGZvciByZWZ1bmRzIGl0cyBjb2RlIGNhbm5vdCBwYXkKKHJldmlldyBCMikuCgojIEF1dGhvcml6YXRpb24KCk9ubHkgdGhlIGxhdW5jaCBhZG1pbiByZWNvcmRlZCBpbiBgUGVuZGluZ0Rhb2AuCgojIEd1YXJhbnRlZXMKCi0gVGhlIGRyaXZlIGhhcyBmYWlsZWQgYnkgdGhlIE1hbmFnZXIncyBvd24gcnVsZSAodGhlIGRlYWRsaW5lIHBhc3NlZAphbmQgdGhlIFRva2VuIGlzIG5vdCBMaXZlOyBDbGFpbU1pbnRlcidzIHN0YXRlIG1hY2hpbmUgaXMgbmV2ZXIKYXNrZWQpLCBzbyB0aGUgdXBncmFkZSBjYW5ub3QgY2hhbmdlIHdoZXRoZXIgdGhlIERBTyBsYXVuY2hlcy4KLSBgdG9faGFzaGAgaXMgYXBwcm92ZWQgZnJvbSBgZnJvbV9oYXNoYCBpbiB0aGUgcmVnaXN0cnksIG5vdCByZXZva2VkLAphbmQgaXMgdGhlIGhhc2ggYW5ub3VuY2VkIGFzIGxhdGVzdCBmb3IgaXRzIG5hbWUgKGBsYXRlc3RfcG9pbnRlcmApLgotIFRoZSBNYW5hZ2VyJ3MgdXBncmFkZSBub3RpY2UgaGFzIHBhc3NlZCBzaW5jZSB0aGUgYXBwcm92YWwgYW5kIHRoZQphbm5vdW5jZW1lbnQgKGB1cGdyYWRlX2RlbGF5KClgIGxlZGdlcnMsIGF0IGxlYXN0CmBNSU5fUkVDT1ZFUllfTk9USUNFX0xFREdFUlNgKSBhbmQgc2luY2UgdGhlIGRyaXZlJ3MgZGVhZGxpbmUgKGluCnNlY29uZHMsIGF0IGxlYXN0IGBNSU5fUkVDT1ZFUllfUkVGVU5EX1dJTkRPV2ApLiBNZW1iZXJzIGhhdmUgYXQKbGVhc3Qgc2V2ZW4gZGF5cyBhZnRlciB0aGUgZHJpdmUgZmFpbHMsIGFuZCBhZnRlciBlYWNoIHJlY292ZXJ5CnRhcmdldCBpcyBhbm5vdW5jZWQsIHRvIHJlZnVuZCB3aXRoIHRoZSBjb2RlIGluIHBsYWNlLgoKIyBFcnJvcnMKCiogYERhb05vdEZvdW5kYCAvIGBOb0Fzc3VyYW5jZWAKKiBgQXNzdXJhbmNlTm90RmFpbGVkYCAtIHRoZSBkcml2ZSBtYXkgc3RpbGwgbGF1bmNoCiogYEludmFsaWRVcGdyYWRlUGF0aGAgLSB0aGUgcGF0aCBpcyBub3QgYXBwcm92ZWQsIG9yIHRoZSB0AAAADnJlY292ZXJfY2xhaW1zAAAAAAADAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAclBcHByb3ZlIGFuIHVwZ3JhZGUgcGF0aCBmcm9tIG9uZSBpbXBsZW1lbnRhdGlvbiB0byBhbm90aGVyLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBFcnJvcnMKCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gT25lIG9yIGJvdGggaW1wbGVtZW50YXRpb25zIGRvbid0IGV4aXN0CiogYEludmFsaWRVcGdyYWRlUGF0aGAgLSBUYXJnZXQgaXMgcmV2b2tlZCwgb3IgdGhlIG5hbWVzIGRpZmZlcgoKQSByZXZva2VkIFNPVVJDRSBpcyBhbGxvd2VkIG9uIHB1cnBvc2U6IGFmdGVyIHJldm9raW5nIGEgdnVsbmVyYWJsZQpoYXNoIHRoZSBhZG1pbiBtdXN0IHN0aWxsIGJlIGFibGUgdG8gYXBwcm92ZSBhIG1pZ3JhdGlvbiBvZmYgaXQuAAAAAAAAD2FwcHJvdmVfdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAOhUb2tlbiBhZGRyZXNzIG9mIHRoZSBEQU8gaG9sZGluZyBgc2x1Z2A6IGEgbGF1bmNoZWQgREFPLCBvciBhIHBlbmRpbmcKREFPIHdob3NlIGFzc3VyYW5jZSBkcml2ZSByZXNlcnZlZCBpdCAodW50aWwgYHJlbGVhc2Vfc2x1Z2ApLgoKUGxhaW4gcmVhZDogZG9lcyBub3QgZXh0ZW5kIHRoZSBzbHVnIGVudHJ5J3MgVFRMICh0aGUgREFPJ3Mgc3RvcmFnZQpzd2VlcCByZW5ld3MgdGhlIHNsdWcgZW50cmllcykuAAAAD2dldF9kYW9fYnlfc2x1ZwAAAAABAAAAAAAAAARzbHVnAAAAEAAAAAEAAAPpAAAAEwAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAElUaGUgcGVuZGluZyBEQU8gY3JlYXRlZCBhdCBgdG9rZW5fYWRkcmVzc2AsIHVudGlsIGl0IGxhdW5jaGVzLgpSZWFkLW9ubHkuAAAAAAAAD2dldF9wZW5kaW5nX2RhbwAAAAABAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAPoAAAH0AAAAApQZW5kaW5nRGFvAAA=", "AAAAAAAAAStTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdCAoMSBmb3IgYQpNYW5hZ2VyIGRlcGxveWVkIGJlZm9yZSB2ZXJzaW9ucyB3ZXJlIHJlY29yZGVkKS4gUmVhZC1vbmx5LiBXaGlsZSBpdApkaWZmZXJzIGZyb20gdGhlIGNvZGUncyBgU1RPUkFHRV9WRVJTSU9OYCwgZXZlcnkgZW50cnkgcG9pbnQgdGhhdApjaGFuZ2VzIHN0YXRlIGZhaWxzIGBTdG9yYWdlVmVyc2lvbk1pc21hdGNoYCwgYXBhcnQgZnJvbSB0aGUgcmVjb3ZlcnkKcGF0aCBkZXNjcmliZWQgYXQgYG1pZ3JhdGVgLgAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAD5VbnBhdXNlIHRoZSBmYWN0b3J5LgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgAAAAAAD3VucGF1c2VfZmFjdG9yeQAAAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAppVcGdyYWRlIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IGl0c2VsZi4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGBmcm9tX2hhc2hgIC0gQ3VycmVudCBNYW5hZ2VyIFdBU00gaGFzaCAobXVzdCBtYXRjaCBzdG9yZWQgaGFzaCkKKiBgdG9faGFzaGAgLSBUYXJnZXQgTWFuYWdlciBXQVNNIGhhc2ggKG11c3QgYmUgcmVnaXN0ZXJlZCBhbmQgYWN0aXZlKQoKIyBFcnJvcnMKCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gVGFyZ2V0IGltcGxlbWVudGF0aW9uIGRvZXNuJ3QgZXhpc3Qgb3IgaXMgcmV2b2tlZAoqIGBJbnZhbGlkVmVyc2lvbmAgLSBmcm9tX2hhc2ggZG9lc24ndCBtYXRjaCBjdXJyZW50IGhhc2gKKiBgSW52YWxpZFVwZ3JhZGVQYXRoYCAtIHRoZSB0YXJnZXQgaXMgbm90IG5hbWVkIGBNYW5hZ2VyYCwgb3IgdGhlCnBhdGggaXMgbm90IGFwcHJvdmVkCiogYFVwZ3JhZGVOb3RMYXRlc3RgIC0gdGhlIHRhcmdldCBpcyBub3QgdGhlIGFubm91bmNlZCBsYXRlc3QgTWFuYWdlcgoqIGBVcGdyYWRlRGVsYXlOb3RFbGFwc2VkYCAtIGB1cGdyYWRlX2RlbGF5KClgIGxlZGdlcnMgaGF2ZSBub3QgcGFzc2VkCnNpbmNlIHRoZSBsYXRlciBvZiB0aGUgYXBwcm92YWwgYW5kIHRoZSBhbm5vdW5jZW1lbnQgKEQ0MikAAAAAAA91cGdyYWRlX21hbmFnZXIAAAAAAgAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAADVQZW5kaW5nIGFkbWluIGF3YWl0aW5nIGFjY2VwdGFuY2UsIGlmIGFueS4gUmVhZC1vbmx5LgAAAAAAABFnZXRfcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAATRMYXVuY2ggYSBEQU8gd2hvc2UgYXNzdXJhbmNlIGxpc3QgaGFzIG1ldCBpdHMgdGhyZXNob2xkLCB3aXRoIHRoZQpzdG9yZWQgbGF1bmNoIGNvbmZpZy4gQW55b25lIG1heSBjYWxsIGl0OyBubyBhdXRob3JpemF0aW9uLgoKIyBFcnJvcnMKCiogYERhb05vdEZvdW5kYCAvIGBOb0Fzc3VyYW5jZWAKKiBgQXNzdXJhbmNlRmFpbGVkYCAtIHRoZSBkZWFkbGluZSBwYXNzZWQgZmlyc3QKKiBgQXNzdXJhbmNlTm90TWV0YCAtIGZld2VyIGRpc3RpbmN0IGNsYWltZXJzIHRoYW4gdGhlIHRocmVzaG9sZAoqIGV2ZXJ5IGBsYXVuY2hfZGFvYCBjaGVjawAAABFsYXVuY2hfd2hlbl9yZWFkeQAAAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAO1QcmVkaWN0IERBTyBhZGRyZXNzZXMgd2l0aG91dCBkZXBsb3lpbmcuIFJlYWQtb25seS4KClVzZWZ1bCBmb3IgZnJvbnRlbmRzIHRvIHNob3cgYWRkcmVzc2VzIGJlZm9yZSB1c2VyIGNvbmZpcm1zIGRlcGxveW1lbnQuCkV2ZXJ5IG1vZHVsZSBraW5kIGBjcmVhdGVfZGFvYCBjYW4gZGVwbG95IGlzIHByZWRpY3RlZDsgYSBEQU8gY3JlYXRlZAp3aXRob3V0IG9uZSBzaW1wbHkgbmV2ZXIgdXNlcyBpdHMgYWRkcmVzcy4AAAAAAAARcHJlZGljdF9hZGRyZXNzZXMAAAAAAAACAAAAAAAAAAdjcmVhdG9yAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAEAAAPpAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAMNDaGFuZ2UgdGhlIE1hbmFnZXIncyB1cGdyYWRlIG5vdGljZSAoYWRtaW4gb25seSkuIEEgbG9uZ2VyIG5vdGljZQphcHBsaWVzIGF0IG9uY2U7IGEgc2hvcnRlciBvbmUgb25seSBhZnRlciB0aGUgbm90aWNlIGluIGZvcmNlIGhhcwpwYXNzZWQsIHNvIHRoZSBub3RpY2UgY2Fubm90IGJlIGN1dCB0byBydXNoIGFuIHVwZ3JhZGUgdGhyb3VnaC4AAAAAEXNldF91cGdyYWRlX2RlbGF5AAAAAAAAAQAAAAAAAAAHbGVkZ2VycwAAAAAEAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAJFHZXQgaW1wbGVtZW50YXRpb24gYnkgV0FTTSBoYXNoLgoKIyBBcmd1bWVudHMKCiogYHdhc21faGFzaGAgLSBXQVNNIGhhc2ggdG8gcXVlcnkKCiMgUmV0dXJucwoKVGhlIGltcGxlbWVudGF0aW9uIHZlcnNpb24sIG9yIGBOb25lYCBpZiBub3QgZm91bmQuAAAAAAAAEmdldF9pbXBsZW1lbnRhdGlvbgAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAAqBBcHByb3ZlIGBzb3VyY2VgIGFzIGEgdm90ZSBzb3VyY2UgbmV3IERBT3MgbWF5IGNob29zZSwgb3Igd2l0aGRyYXcgdGhlCmFwcHJvdmFsIChgYXBwcm92ZWQgPSBmYWxzZWApLiBBZG1pbiBvbmx5LgoKQXBwcm92YWwgbmFtZXMgYW4gYWRkcmVzcywgbm90IHRoZSBjb2RlIGJlaGluZCBpdDogYXBwcm92ZSBvbmx5CnNvdXJjZXMgd2hvc2Ugd2VpZ2h0cyBubyBzaW5nbGUgcGFydHkgY2FuIHJld3JpdGUgYW5kIHdob3NlIHVwZ3JhZGVzLAppZiBhbnksIGFyZSBnYXRlZCBieSB0aGlzIE1hbmFnZXIgKGRvY3MvZGVzaWducy9nb3Zlcm5hbmNlLWFkYXB0ZXIubWQpLgpUaGUgbW9jayBhZGFwdGVyIGlzIGZvciB0ZXN0bmV0IGFuZCBsb2NhbCBuZXR3b3JrcyBvbmx5LgoKQXBwcm92aW5nIHByb2JlcyBldmVyeSByZWFkIHRoZSBHb3Zlcm5vciBtYWtlcywgcGx1cyBgZGVjaW1hbHNgLgpXaXRoZHJhd2luZyBhbiBhcHByb3ZhbCBzdG9wcyBuZXcgREFPcyBhbmQgcGVuZGluZyBEQU9zIGZyb20KbGF1bmNoaW5nIHdpdGggdGhlIHNvdXJjZTsgREFPcyBhbHJlYWR5IGxhdW5jaGVkIGtlZXAgaXQgKGl0IGlzCnBlcm1hbmVudCBpbiB0aGVpciBHb3Zlcm5vcikuCgojIEVycm9ycwoKKiBgSW52YWxpZFZvdGVTb3VyY2VgIC0gYHNvdXJjZWAgZG9lcyBub3QgYW5zd2VyIHRoZSBpbnRlcmZhY2UAAAATYXBwcm92ZV92b3RlX3NvdXJjZQAAAAADAAAAAAAAAAZzb3VyY2UAAAAAABMAAAAAAAAACGFwcHJvdmVkAAAAAQAAAAAAAAAEbmFtZQAAABAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAARFDaGVjayBpZiBhbiB1cGdyYWRlIGlzIGFwcHJvdmVkLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBSZXR1cm5zCgpgdHJ1ZWAgaWYgdGhlIHBhdGggaXMgYXBwcm92ZWQsIGJvdGggaGFzaGVzIGFyZSByZWdpc3RlcmVkIHVuZGVyIHRoZQpzYW1lIG5hbWUgYW5kIHRoZSBUQVJHRVQgaXMgbm90IHJldm9rZWQuIEEgcmV2b2tlZCBzb3VyY2UgbWF5IHN0aWxsCm1pZ3JhdGUgYXdheS4AAAAAAAATaXNfdXBncmFkZV9hcHByb3ZlZAAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAAB", "AAAAAAAAAP5DaGFuZ2UgdGhlIHJlcXVlc3RlZCBzbHVnIG9mIGEgcGVuZGluZyBEQU8gKGxhdW5jaCBhZG1pbiBvbmx5KSwgZm9yCmV4YW1wbGUgYWZ0ZXIgYGxhdW5jaF9kYW9gIGZhaWxlZCB3aXRoIGBTbHVnVGFrZW5gLgoKIyBFcnJvcnMKCiogYERhb05vdEZvdW5kYCAtIE5vIHBlbmRpbmcgREFPIGZvciBgdG9rZW5fYWRkcmVzc2AKKiBgSW52YWxpZFNsdWdgIC8gYFNsdWdUYWtlbmAgLSBNYWxmb3JtZWQgc2x1Zywgb3IgaGVsZCBieSBhbm90aGVyIERBTwAAAAAAE3VwZGF0ZV9wZW5kaW5nX3NsdWcAAAAAAgAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAAAAAAABHNsdWcAAAAQAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAC1DYW5jZWwgYSBwZW5kaW5nIGFkbWluIGhhbmRvdmVyIChhZG1pbiBvbmx5KS4AAAAAAAAUY2FuY2VsX3BlbmRpbmdfYWRtaW4AAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAjtSZXZva2UgYW4gaW1wbGVtZW50YXRpb24gKGVtZXJnZW5jeSBtZWFzdXJlKS4gUGVybWFuZW50OiBhIHJlY29yZCBpcwpuZXZlciB1bi1yZXZva2VkLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFZmZlY3RzCgpBIHJldm9rZWQgaGFzaCBjYW4gbm8gbG9uZ2VyIGJlIGFuIHVwZ3JhZGUgdGFyZ2V0LCBhIGN1cnJlbnQKaW1wbGVtZW50YXRpb24gb3IgdGhlIGxhdGVzdCAoYGdldF9sYXRlc3RfaW1wbGVtZW50YXRpb25gKSwgYW5kIGEKcGVuZGluZyBEQU8gcnVubmluZyBpdCBjYW5ub3QgbGF1bmNoLiBDb250cmFjdHMgYWxyZWFkeSBydW5uaW5nIGl0CmtlZXAgcnVubmluZyBpdCBhbmQgbWF5IHN0aWxsIHVwZ3JhZGUgYXdheSBmcm9tIGl0LgoKIyBBcmd1bWVudHMKCiogYHdhc21faGFzaGAgLSBXQVNNIGhhc2ggdG8gcmV2b2tlCgojIEVycm9ycwoKKiBgSW1wbGVtZW50YXRpb25Ob3RGb3VuZGAgLSBJbXBsZW1lbnRhdGlvbiBkb2Vzbid0IGV4aXN0CiogYEltcGxlbWVudGF0aW9uQWxyZWFkeVJldm9rZWRgIC0gSW1wbGVtZW50YXRpb24gYWxyZWFkeSByZXZva2VkAAAAABVyZXZva2VfaW1wbGVtZW50YXRpb24AAAAAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAHVXaGVyZSBgY3JlYXRlX21vZHVsZSh0b2tlbiwgPGtpbmQ+LCBuKWAgZGVwbG95cy4gQSBwdXJlIGZ1bmN0aW9uIG9mCml0cyBpbnB1dHMgYW5kIHRoaXMgTWFuYWdlcidzIGFkZHJlc3MuIFJlYWQtb25seS4AAAAAAAAWcHJlZGljdF9tb2R1bGVfYWRkcmVzcwAAAAAAAwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAARraW5kAAAAEQAAAAAAAAABbgAAAAAAAAQAAAABAAAAEw==", "AAAAAAAAASRUaGUgaGFzaGVzIGBjcmVhdGVfZGFvYCBhbmQgYGNyZWF0ZV9tb2R1bGVgIGRlcGxveSBmcm9tLCBvciBgTm9uZWAKYmVmb3JlIGBzZXRfY3VycmVudF9pbXBsZW1lbnRhdGlvbnNgLiBSZWFkLW9ubHkuIFJhdyB2YWx1ZXM6IGEgaGFzaCByZXZva2VkIHNpbmNlCml0IHdhcyBzZXQgaXMgc3RpbGwgcmV0dXJuZWQgKERBT3MgY3JlYXRlZCBmcm9tIGl0IHN0aWxsIHJ1biBpdCksIHdoaWNoCmlzIHdoYXQgcGxhdGZvcm0gY29kZSByZW5ld2FsIG5lZWRzLiBgY3JlYXRlX2Rhb2AgaXRzZWxmIHJlY2hlY2tzIGVhY2guAAAAF2N1cnJlbnRfaW1wbGVtZW50YXRpb25zAAAAAAAAAAABAAAD6AAAB9AAAAAWQ3VycmVudEltcGxlbWVudGF0aW9ucwAA", "AAAAAAAAAEVXaGV0aGVyIG5ldyBEQU9zIG1heSBjaG9vc2UgYHNvdXJjZWAgYXMgdGhlaXIgdm90ZSBzb3VyY2UuIFJlYWQtb25seS4AAAAAAAAXaXNfdm90ZV9zb3VyY2VfYXBwcm92ZWQAAAAAAQAAAAAAAAAGc291cmNlAAAAAAATAAAAAQAAAAE=", "AAAAAAAAArNSZWdpc3RlciBhIG5ldyBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYG5hbWVgIC0gSW1wbGVtZW50YXRpb24gbmFtZSAoZS5nLiwgIlRva2VuIiwgIkdvdmVybm9yIikKKiBgdmVyc2lvbmAgLSBWZXJzaW9uIHN0cmluZyAoZS5nLiwgIjAuMS4wIikKKiBgd2FzbV9oYXNoYCAtIFdBU00gYnl0ZWNvZGUgaGFzaAoKIyBFcnJvcnMKCiogYEludmFsaWRJbXBsZW1lbnRhdGlvbk5hbWVgIC0gTmFtZSBpcyBlbXB0eSBvciB0b28gbG9uZwoqIGBJbnZhbGlkVmVyc2lvbmAgLSBWZXJzaW9uIGlzIGVtcHR5IG9yIHRvbyBsb25nCiogYEltcGxlbWVudGF0aW9uQWxyZWFkeVJlZ2lzdGVyZWRgIC0gQSByZWNvcmQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgaGFzaAoocmVjb3JkcyBhcmUgaW1tdXRhYmxlOiBubyByZW5hbWluZywgcmUtdmVyc2lvbmluZyBvciB1bi1yZXZva2luZykKClJlZ2lzdHJhdGlvbiBkb2VzIG5vdCBjaGFuZ2UgdGhlICJsYXRlc3QiIGltcGxlbWVudGF0aW9uIGZvciBgbmFtZWA7CnRoZSBhZG1pbiBzZWxlY3RzIGl0IGV4cGxpY2l0bHkgd2l0aCBgc2V0X2xhdGVzdF9pbXBsZW1lbnRhdGlvbmAsIHNvCnJlZ2lzdGVyaW5nIGFuIG9sZGVyIChwYXRjaCkgcmVsZWFzZSBuZXZlciByZWdyZXNzZXMgaXQuAAAAABdyZWdpc3Rlcl9pbXBsZW1lbnRhdGlvbgAAAAADAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAJdMZWRnZXIgYXQgd2hpY2ggYGFwcHJvdmVfdXBncmFkZShmcm9tLCB0bylgIHdhcyByZWNvcmRlZCwgaWYgaXQgd2FzLgpSZWFkLW9ubHkuIGB1cGdyYWRlX21hbmFnZXJgIGFuZCBgcmVjb3Zlcl9jbGFpbXNgIHdhaXQKYHVwZ3JhZGVfZGVsYXkoKWAgYWZ0ZXIgaXQuAAAAABd1cGdyYWRlX2FwcHJvdmVkX2xlZGdlcgAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAPoAAAABg==", "AAAAAAAAAKRHZXQgbGF0ZXN0IHZlcnNpb24gb2YgYW4gaW1wbGVtZW50YXRpb24gYnkgbmFtZS4KCiMgQXJndW1lbnRzCgoqIGBuYW1lYCAtIEltcGxlbWVudGF0aW9uIG5hbWUKCiMgUmV0dXJucwoKVGhlIGxhdGVzdCBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLCBvciBgTm9uZWAgaWYgbm90IGZvdW5kLgAAABlnZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAEbmFtZQAAABAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAAd9Bbm5vdW5jZSBgd2FzbV9oYXNoYCBhcyB0aGUgbGF0ZXN0IGltcGxlbWVudGF0aW9uIGZvciBgbmFtZWAgKGFkbWluCm9ubHkpLiBUaGlzIGlzIHRoZSBvbmx5IGhhc2ggYHVwZ3JhZGVfbWFuYWdlcmAgYW5kIGByZWNvdmVyX2NsYWltc2AKbWF5IG1vdmUgdG8sIGFuZCB0aGUgYXBwIHNob3dzIGl0IGFzIHRoZSBhdmFpbGFibGUgdXBncmFkZS4KClJlLWFubm91bmNpbmcgdGhlIGN1cnJlbnQgbGF0ZXN0IGtlZXBzIGl0cyBhbm5vdW5jZW1lbnQgbGVkZ2VyLCBzbyB0aGUKbm90aWNlIG1lYXN1cmVkIGZyb20gaXQgY2Fubm90IGJlIHJlc3RhcnRlZCAoRDQyKS4KCiMgRXJyb3JzCgoqIGBJbXBsZW1lbnRhdGlvbk5vdEZvdW5kYCAtIGB3YXNtX2hhc2hgIGlzIG5vdCByZWdpc3RlcmVkIG9yIGlzIHJldm9rZWQKKiBgSW52YWxpZEltcGxlbWVudGF0aW9uTmFtZWAgLSBgd2FzbV9oYXNoYCBpcyByZWdpc3RlcmVkIHVuZGVyIGFub3RoZXIgbmFtZQAAAAAZc2V0X2xhdGVzdF9pbXBsZW1lbnRhdGlvbgAAAAAAAAIAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAARdSZXR1cm5zIHRoZSByZWdpc3RlcmVkIHJlbGVhc2UgdmVyc2lvbiBmb3IgYSBXQVNNIGhhc2gsIGluY2x1ZGluZwpyZXZva2VkIGhhc2hlcyAoYSBtb2R1bGUgc3RpbGwgcnVubmluZyBhIHJldm9rZWQgaGFzaCBrZWVwcyBhbnN3ZXJpbmcKYHZlcnNpb24oKWAsIHdoaWNoIHJlYWRzIHRoaXMpLiBDYWxsZXJzIHRoYXQgbXVzdCByZWplY3QgcmV2b2tlZCB0YXJnZXRzIHJlbHkgb24KYGlzX3VwZ3JhZGVfYXBwcm92ZWRgLCB3aGljaCBjaGVja3MgdGhlIHRhcmdldCBpcyBub3QgcmV2b2tlZC4AAAAAGmdldF9pbXBsZW1lbnRhdGlvbl92ZXJzaW9uAAAAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPoAAAAEA==", "AAAAAAAAAbtTZXQgdGhlIGN1cnJlbnQgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoZXMgdXNlZCBieSB0aGUgZmFjdG9yeSBhbmQgYnkKYGNyZWF0ZV9tb2R1bGVgIChhZG1pbiBvbmx5KS4gRWFjaCBoYXNoIG11c3QgYmUgcmVnaXN0ZXJlZCwgbm90CnJldm9rZWQsIGFuZCByZWdpc3RlcmVkIHVuZGVyIGl0cyBzbG90J3MgbmFtZSAoYFRva2VuYCwgYE1ldGFkYXRhYCwKYEF1Y3Rpb25gLCBgR292ZXJub3JgLCBgVHJlYXN1cnlgLCBgTWFya2V0cGxhY2VgLCBgQ2xhaW1NaW50ZXJgKS4KCiMgRXJyb3JzCgoqIGBJbXBsZW1lbnRhdGlvbk5vdEZvdW5kYCAtIE9uZSBvciBtb3JlIGltcGxlbWVudGF0aW9ucyBkb24ndCBleGlzdCBvciBhcmUgcmV2b2tlZAoqIGBJbnZhbGlkSW1wbGVtZW50YXRpb25OYW1lYCAtIEEgaGFzaCBpcyByZWdpc3RlcmVkIHVuZGVyIHRoZSB3cm9uZyBtb2R1bGUgbmFtZQAAAAAbc2V0X2N1cnJlbnRfaW1wbGVtZW50YXRpb25zAAAAAAEAAAAAAAAAB2N1cnJlbnQAAAAH0AAAABZDdXJyZW50SW1wbGVtZW50YXRpb25zAAAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAAAQAAABNPbmUgcmVnaXN0cnkgZW50cnkuAAAAAAAAAAALTW9kdWxlRW50cnkAAAAAAwAAABRUaGUgbW9kdWxlIGNvbnRyYWN0LgAAAAdhZGRyZXNzAAAAABMAAAA7QSBidWlsdC1pbiBraW5kIG9yIGBjdXN0b21fPG5hbWU+YCAoc2VlIFtgaXNfdmFsaWRfa2luZGBdKS4AAAAABGtpbmQAAAARAAAASFRva2VucyB0aGlzIG1vZHVsZSBob2xkcyBjYXJyeSBubyB2b3RlcyAoY3VzdG9keTogQXVjdGlvbiwgTWFya2V0cGxhY2UpLgAAAApub25fdm90aW5nAAAAAAAB", "AAAAAQAAAN1BIERBTydzIG1lbWJlcnNoaXAgdG9rZW4gc3dpdGNoZXMgKGRvY3MvZGVzaWducy9sb2NrZWQtdG9rZW5zLm1kKSwgY2hvc2VuCmF0IGBjcmVhdGVfZGFvYCBhbmQgY2hhbmdlYWJsZSBieSB0aGUgVG9rZW4ncyBhZG1pbjogdGhlIGxhdW5jaCBhZG1pbiBpbgpTZXR1cCwgdGhlIFRyZWFzdXJ5IGJ5IHByb3Bvc2FsIG9uY2UgTGl2ZS4gQWxsIG9mZiByZXByb2R1Y2VzIGFuIG9wZW4gREFPLgAAAAAAAAAAAAANVG9rZW5TZXR0aW5ncwAAAAAAAAMAAABGVGhlIFRyZWFzdXJ5IG1heSBtb3ZlIGFueSBtZW1iZXIncyB0b2tlbiBieSBwcm9wb3NhbCAoYGRhb190cmFuc2ZlcmApLgAAAAAADGRhb19yZWNvdmVyeQAAAAEAAABASG9sZGVycyBkZWxlZ2F0ZSBvbmx5IHRvIHRoZW1zZWx2ZXMgb3IgdG8gYW5vdGhlciB2b3RpbmcgbWVtYmVyLgAAABdtZW1iZXJzX29ubHlfZGVsZWdhdGlvbgAAAAABAAAAQFRva2VucyBtb3ZlIG9ubHkgYWxvbmcgREFPLWNvbnRyb2xsZWQgcGF0aHMgKGBUcmFuc2ZlcnNMb2NrZWRgKS4AAAAQdHJhbnNmZXJzX2xvY2tlZAAAAAE=", "AAAABQAAAHZFbWl0dGVkIGJ5IFtgbWlncmF0ZWBdIHdoZW4gdGhlIHN0b3JlZCBsYXlvdXQgbW92ZXMgZm9yd2FyZC4gVGhlIGVtaXR0aW5nCmNvbnRyYWN0IGFkZHJlc3MgaXMgdGhlIGV2ZW50J3MgY29udHJhY3QgaWQuAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAoVGhlIGxheW91dCB2ZXJzaW9uIGJlZm9yZSB0aGUgbWlncmF0aW9uLgAAABRmcm9tX3N0b3JhZ2VfdmVyc2lvbgAAAAQAAAAAAAAAO1RoZSBsYXlvdXQgdmVyc2lvbiBhZnRlciBpdCAodGhlIGNvZGUncyBgU1RPUkFHRV9WRVJTSU9OYCkuAAAAABJ0b19zdG9yYWdlX3ZlcnNpb24AAAAAAAQAAAAAAAAAAg==", "AAAAAQAAAX1XaGF0IHRoZSBNYW5hZ2VyJ3MgYExhdGVzdEltcGxlbWVudGF0aW9uKG5hbWUpYCBob2xkczogdGhlIGhhc2ggYW5ub3VuY2VkCmFzIGxhdGVzdCBhbmQgdGhlIGxlZGdlciBpdCB3YXMgYW5ub3VuY2VkIGF0LiBBIHBsYXRmb3JtIGNvbnRyYWN0ICh0aGUKTWFuYWdlciBpdHNlbGYsIHRoZSBzaGFyZWQgTWludGVyKSB1cGdyYWRlcyBvbmx5IHRvIHRoaXMgaGFzaCwgYW5kIGl0cwpub3RpY2UgY291bnRzIGZyb20gdGhlIGxhdGVyIG9mIHRoZSBhcHByb3ZhbCBhbmQgdGhpcyBhbm5vdW5jZW1lbnQsIHNvCmV2ZXJ5IHBvc3NpYmxlIHBsYXRmb3JtIHVwZ3JhZGUgaXMgdmlzaWJsZSBhcyAicnVubmluZyDihpIgbGF0ZXN0IiBmb3IgdGhlCndob2xlIG5vdGljZSAoRDQyKS4AAAAAAAAAAAAADUxhdGVzdFBvaW50ZXIAAAAAAAACAAAARVRoZSBsZWRnZXIgaXQgd2FzIGFubm91bmNlZCBhdDsgdGhlIG5vdGljZSBjb3VudHMgZnJvbSBoZXJlIG9yIGxhdGVyLgAAAAAAAApzZXRfbGVkZ2VyAAAAAAAGAAAAHVRoZSBoYXNoIGFubm91bmNlZCBhcyBsYXRlc3QuAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAg", "AAAABQAAAOlFbWl0dGVkIGJ5IGBzZXRfZGVsYXlgIChNYW5hZ2VyIGFuZCBzaGFyZWQgTWludGVyIG9ubHkpLiBBIHNob3J0ZXIgbm90aWNlCmlzIGluIGZvcmNlIGZyb20gYGVmZmVjdGl2ZV9sZWRnZXJgOyBhIGxvbmdlciBvbmUgYXQgb25jZS4gVGhpcyBpcyB0aGUKY2hhbmdlIGEgbWVtYmVyIHdhbnRzIHRvbGQgYWJvdXQ6IGl0IHNob3J0ZW5zIHRoZSB3aW5kb3cgdG8gcmVhY3QgdG8gYQpwbGF0Zm9ybSB1cGdyYWRlLgAAAAAAAAAAAAATVXBncmFkZURlbGF5Q2hhbmdlZAAAAAABAAAAFXVwZ3JhZGVfZGVsYXlfY2hhbmdlZAAAAAAAAAMAAAAyVGhlIG5vdGljZSBpbiBmb3JjZSBiZWZvcmUgdGhlIGNoYW5nZSwgaW4gbGVkZ2Vycy4AAAAAAAxmcm9tX2xlZGdlcnMAAAAEAAAAAAAAACFUaGUgcmVxdWVzdGVkIG5vdGljZSwgaW4gbGVkZ2Vycy4AAAAAAAAKdG9fbGVkZ2VycwAAAAAABAAAAAAAAAArVGhlIGxlZGdlciBmcm9tIHdoaWNoIGB0b19sZWRnZXJzYCBhcHBsaWVzLgAAAAAQZWZmZWN0aXZlX2xlZGdlcgAAAAQAAAAAAAAAAg=="]),
      options
    );
  }

   static deploy<T = Client>({ admin, current_hash, version, upgrade_delay }: { admin: string | Address; current_hash: Uint8Array; version: string; upgrade_delay: number }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, current_hash, version, upgrade_delay }, options);
  }
  public readonly fromJson = {
    migrate : this.txFromJson<void>,  version : this.txFromJson<string>,  get_slug : this.txFromJson<string | null>,  get_admin : this.txFromJson<string | null>,  wasm_hash : this.txFromJson<Uint8Array>,  create_dao : this.txFromJson<Result<DaoAddresses, ManagerError>>,  launch_dao : this.txFromJson<Result<null, ManagerError>>,  change_slug : this.txFromJson<Result<null, ManagerError>>,  accept_admin : this.txFromJson<Result<null, ManagerError>>,  module_count : this.txFromJson<number>,  release_slug : this.txFromJson<Result<null, ManagerError>>,  create_module : this.txFromJson<Result<string, ManagerError>>,  get_assurance : this.txFromJson<Assurance | null>,  pause_factory : this.txFromJson<Result<null, ManagerError>>,  propose_admin : this.txFromJson<Result<null, ManagerError>>,  upgrade_delay : this.txFromJson<number>,  latest_pointer : this.txFromJson<LatestPointer | null>,  open_assurance : this.txFromJson<Result<number, ManagerError>>,  recover_claims : this.txFromJson<Result<null, ManagerError>>,  approve_upgrade : this.txFromJson<Result<null, ManagerError>>,  get_dao_by_slug : this.txFromJson<Result<string, ManagerError>>,  get_pending_dao : this.txFromJson<PendingDao | null>,  storage_version : this.txFromJson<number>,  unpause_factory : this.txFromJson<Result<null, ManagerError>>,  upgrade_manager : this.txFromJson<Result<null, ManagerError>>,  get_pending_admin : this.txFromJson<string | null>,  launch_when_ready : this.txFromJson<Result<null, ManagerError>>,  predict_addresses : this.txFromJson<Result<DaoAddresses, ManagerError>>,  set_upgrade_delay : this.txFromJson<Result<null, ManagerError>>,  get_implementation : this.txFromJson<ImplementationVersion | null>,  approve_vote_source : this.txFromJson<Result<null, ManagerError>>,  is_upgrade_approved : this.txFromJson<boolean>,  update_pending_slug : this.txFromJson<Result<null, ManagerError>>,  cancel_pending_admin : this.txFromJson<Result<null, ManagerError>>,  revoke_implementation : this.txFromJson<Result<null, ManagerError>>,  predict_module_address : this.txFromJson<string>,  current_implementations : this.txFromJson<CurrentImplementations | null>,  is_vote_source_approved : this.txFromJson<boolean>,  register_implementation : this.txFromJson<Result<null, ManagerError>>,  upgrade_approved_ledger : this.txFromJson<bigint | null>,  get_latest_implementation : this.txFromJson<ImplementationVersion | null>,  set_latest_implementation : this.txFromJson<Result<null, ManagerError>>,  get_implementation_version : this.txFromJson<string | null>,  set_current_implementations : this.txFromJson<Result<null, ManagerError>>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

  /**
   * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
   */
  parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined {
    return this.spec.parseEvent(topics, data) as ContractEvent | undefined;
  }
  /**
   * Build a topics filter row for the "DaoCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  daoCreatedEventFilter(topicValues?: { token_address?: string | Address; deployer?: string | Address; launch_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("DaoCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "DaoLaunched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  daoLaunchedEventFilter(topicValues?: { token_address?: string | Address }): string[] {
    return this.spec.eventTopicFilter("DaoLaunched", topicValues);
  }
  /**
   * Build a topics filter row for the "SlugChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  slugChangedEventFilter(topicValues?: { token_address?: string | Address; new_slug?: string }): string[] {
    return this.spec.eventTopicFilter("SlugChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "SlugClaimed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  slugClaimedEventFilter(topicValues?: { token_address?: string | Address; slug?: string }): string[] {
    return this.spec.eventTopicFilter("SlugClaimed", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminChangedEventFilter(topicValues?: { old_admin?: string | Address; new_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "SlugReleased" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  slugReleasedEventFilter(topicValues?: { token_address?: string | Address; slug?: string }): string[] {
    return this.spec.eventTopicFilter("SlugReleased", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminProposed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminProposedEventFilter(topicValues?: { current_admin?: string | Address; proposed_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminProposed", topicValues);
  }
  /**
   * Build a topics filter row for the "FactoryPaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  factoryPausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("FactoryPaused");
  }
  /**
   * Build a topics filter row for the "ModuleCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  moduleCreatedEventFilter(topicValues?: { token_address?: string | Address; kind?: string }): string[] {
    return this.spec.eventTopicFilter("ModuleCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "AssuranceOpened" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  assuranceOpenedEventFilter(topicValues?: { token_address?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AssuranceOpened", topicValues);
  }
  /**
   * Build a topics filter row for the "FactoryUnpaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  factoryUnpausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("FactoryUnpaused");
  }
  /**
   * Build a topics filter row for the "ManagerUpgraded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  managerUpgradedEventFilter(topicValues?: { from_hash?: Uint8Array; to_hash?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ManagerUpgraded", topicValues);
  }
  /**
   * Build a topics filter row for the "UpgradeApproved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  upgradeApprovedEventFilter(topicValues?: { from_hash?: Uint8Array; to_hash?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("UpgradeApproved", topicValues);
  }
  /**
   * Build a topics filter row for the "ManagerInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  managerInitializedEventFilter(topicValues?: { admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ManagerInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "PendingSlugUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  pendingSlugUpdatedEventFilter(topicValues?: { token_address?: string | Address }): string[] {
    return this.spec.eventTopicFilter("PendingSlugUpdated", topicValues);
  }
  /**
   * Build a topics filter row for the "VoteSourceApproved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  voteSourceApprovedEventFilter(topicValues?: { source?: string | Address }): string[] {
    return this.spec.eventTopicFilter("VoteSourceApproved", topicValues);
  }
  /**
   * Build a topics filter row for the "ImplementationRevoked" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  implementationRevokedEventFilter(topicValues?: { wasm_hash?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ImplementationRevoked", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminProposalCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminProposalCancelledEventFilter(topicValues?: { current_admin?: string | Address; cancelled_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminProposalCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "LatestImplementationSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  latestImplementationSetEventFilter(topicValues?: { name?: string; wasm_hash?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("LatestImplementationSet", topicValues);
  }
  /**
   * Build a topics filter row for the "ImplementationRegistered" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  implementationRegisteredEventFilter(topicValues?: { wasm_hash?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ImplementationRegistered", topicValues);
  }
  /**
   * Build a topics filter row for the "CurrentImplementationsUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  currentImplementationsUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("CurrentImplementationsUpdated");
  }
  /**
   * Build a topics filter row for the "Migrated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  migratedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Migrated");
  }
  /**
   * Build a topics filter row for the "UpgradeDelayChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  upgradeDelayChangedEventFilter(): string[] {
    return this.spec.eventTopicFilter("UpgradeDelayChanged");
  }
}