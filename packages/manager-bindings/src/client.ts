import {DaoCreationParams, DaoAddresses, ManagerError, LaunchConfig, ModuleSpec, Assurance, LatestPointer, AssuranceListParams, PendingDao, ImplementationVersion, CurrentImplementations, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Returns the active Manager release version.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Slug claimed by a launched DAO, if any (a pending DAO's requested slug
   * is in `get_pending_dao`).
   */
  get_slug({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Current admin.
   */
  get_admin(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Returns the active Manager WASM hash.
   */
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Create a new DAO: the four core contracts (Token, Metadata, Governor,
   * Treasury) and the modules listed in `initial_config.modules`, deployed
   * atomically, with each module registered on the Token.
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
   * The requested slug is validated and must not belong to a launched DAO,
   * but it is only claimed at `launch_dao` (pending DAOs hold no slug, so an
   * abandoned creation blocks nothing).
   *
   * # Errors
   *
   * * `FactoryPaused` - Factory is paused
   * * `CurrentImplementationsNotSet` - Current WASM hashes not configured
   * * `InvalidModules` - A kind listed twice
   * * `InvalidSlug` / `SlugTaken` - Malformed slug, or claimed by a launched DAO
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
   * registered, non-revoked hash (`PendingDaoUsesRevokedImplementation`)
   * - Every module's `payment_asset()` must equal the asset recorded at its
   * creation (`PaymentAssetMismatch`)
   *
   * All checks run before any launch call, so a refusal launches nothing.
   *
   * # Effects
   *
   * 1. `token.launch` with an unlimited allowance for the Auction if
   * `launch_auction`; the Marketplace is funded per pool by proposal and
   * the ClaimMinter keeps what the launch admin granted
   * 2. `launch` on the Governor and Treasury, then `DaoModule
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
   * * `SlugNotFound` - `token_address` is not a launched DAO (pending DAOs
   * use `update_pending_slug`)
   * * `SlugUnchanged` - `new_slug` is the DAO's current slug
   * * `InvalidSlug` / `SlugTaken` - Malformed slug, or claimed by a launched DAO
   */
  change_slug({ token_address, new_slug }: { token_address: string | Address; new_slug: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Accept a pending admin handover. Requires the proposed admin's authorization.
   */
  accept_admin(options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Modules of `kind` `create_module` deployed for `token` so far: the `n`
   * the next one is deployed with.
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
   * Treasury (by proposal) once Live.
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
   * * `FactoryPaused` - Factory is paused
   * * `DaoNotFound` - `t
   */
  create_module({ token, spec, expected_n }: { token: string | Address; spec: ModuleSpec; expected_n: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<string, ManagerError>>>;
  /**
   * The pending DAO's assurance drive, if one is recorded.
   */
  get_assurance({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Assurance | null>>;
  /**
   * Pause the factory (emergency measure).
   *
   * # Authorization
   *
   * Only callable by admin.
   *
   * # Errors
   *
   */
  pause_factory(options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Propose a new admin. The handover completes when `accept_admin` is called.
   *
   * Only callable by the current admin. Overwrites any earlier proposal.
   */
  propose_admin({ new_admin }: { new_admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * The upgrade notice in force for `upgrade_manager`.
   */
  upgrade_delay(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * The hash announced as latest for `name` and the ledger it was announced
   * at (D42). Unlike `get_latest_implementation`, a revoked hash is still
   * returned: the pointer is what the platform's upgrade rule and the app's
   * pending-upgrade display read.
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
   * Returns the list id.
   *
   * # Errors
   *
   * * `DaoNotFound` / `FactoryPaused` / `LaunchAdminNotOwner`
   * * `AssuranceExists` - one drive per DAO
   * * `NoClaimMinter` - the DAO has no registered ClaimMinter
   * * `D
   */
  open_assurance({ token_address, list, launch_config }: { token_address: string | Address; list: AssuranceListParams; launch_config: LaunchConfig }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, ManagerError>>>;
  /**
   * Upgrade a failed drive's ClaimMinter, for refunds its code cannot pay
   * (review B2). Only the launch admin recorded in PendingDao, only once
   * the drive has failed (the Manager's own rule: the deadline passed and
   * the Token is not Live; ClaimMinter's state machine is never asked), and
   * only to a hash the registry approves for the running ClaimMinter.
   *
   * # Errors
   *
   * * `DaoNotFound` / `NoAssurance`
   * * `AssuranceNotFailed` - the drive may still launch
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
   * Token address of the launched DAO that claimed `slug`.
   *
   * Plain read: does not extend TTL (the DAO's storage sweep renews the slug entries).
   */
  get_dao_by_slug({ slug }: { slug: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<string, ManagerError>>>;
  get_pending_dao({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<PendingDao | null>>;
  /**
   * Unpause the factory.
   *
   * # Authorization
   *
   * Only callable by admin.
   *
   * # Errors
   *
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
   */
  upgrade_manager({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Pending admin awaiting acceptance, if any.
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
   * Predict DAO addresses without deploying.
   *
   * Useful for frontends to show addresses before user confirms deployment.
   * Every module kind `create_dao` can deploy is predicted; a DAO created
   * without one simply never uses its address.
   */
  predict_addresses({ creator, nonce }: { creator: string | Address; nonce: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<DaoAddresses, ManagerError>>>;
  /**
   * Change the Manager's upgrade notice (admin). A longer notice applies
   * at once; a shorter one only after the notice in force has passed.
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
   * * `InvalidSlug` / `SlugTaken` - Malformed slug, or claimed by a launched DAO
   */
  update_pending_slug({ token_address, slug }: { token_address: string | Address; slug: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Cancel a pending admin handover (admin only).
   */
  cancel_pending_admin(options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Revoke an implementation (emergency measure).
   *
   * # Authorization
   *
   * Only callable by admin.
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
   * its inputs and this Manager's address.
   */
  predict_module_address({ token, kind, n }: { token: string | Address; kind: string; n: number }, options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * The hashes `create_dao` and `create_module` deploy from, or `None`
   * before `set_current_implementations`. Raw values: a hash revoked since
   * it was set is still returned (DAOs created from it still run it), which
   * is what platform code renewal needs. `create_dao` itself rechecks each.
   */
  current_implementations(options?: MethodOptions): Promise<AssembledTransaction<CurrentImplementations | null>>;
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
   * `upgrade_manager` waits `upgrade_delay()` after it.
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
   * Select the latest implementation for `name` (admin only).
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
      new Spec(["AAAABAAAADdNYW5hZ2VyIGVycm9ycyAoYmxvY2sgYGNvbW1vbjo6ZXJyb3I6OmNvZGVzOjpNQU5BR0VSYCkuAAAAAAAAAAAMTWFuYWdlckVycm9yAAAAKQAAADdJbXBsZW1lbnRhdGlvbiBuYW1lIGlzIHdyb25nIGZvciB0aGUgc2xvdCBpdCBpcyB1c2VkIGluAAAAABlJbnZhbGlkSW1wbGVtZW50YXRpb25OYW1lAAAAAAAbvQAAAERNYW5hZ2VyIGhhc2gvdmVyc2lvbiBtaXNzaW5nLCBvciBgZnJvbV9oYXNoYCBpcyBub3QgdGhlIGN1cnJlbnQgaGFzaAAAAA5JbnZhbGlkVmVyc2lvbgAAAAAbvgAAAEpJbXBsZW1lbnRhdGlvbiBub3QgcmVnaXN0ZXJlZCAob3IgcmV2b2tlZCB3aGVyZSBhbiBhY3RpdmUgb25lIGlzIHJlcXVpcmVkKQAAAAAAFkltcGxlbWVudGF0aW9uTm90Rm91bmQAAAAAG78AAAAeSW1wbGVtZW50YXRpb24gYWxyZWFkeSByZXZva2VkAAAAAAAcSW1wbGVtZW50YXRpb25BbHJlYWR5UmV2b2tlZAAAG8AAAABBVXBncmFkZSB0YXJnZXQgcmV2b2tlZCwgbmFtZXMgZGlmZmVyLCBvciB0aGUgcGF0aCBpcyBub3QgYXBwcm92ZWQAAAAAAAASSW52YWxpZFVwZ3JhZGVQYXRoAAAAABvBAAAADUFkbWluIG5vdCBzZXQAAAAAAAALQWRtaW5Ob3RTZXQAAAAbwgAAABxObyBhZG1pbiBoYW5kb3ZlciBpcyBwZW5kaW5nAAAADk5vUGVuZGluZ0FkbWluAAAAABvDAAAAOkFuIGltcGxlbWVudGF0aW9uIGlzIGFscmVhZHkgcmVnaXN0ZXJlZCBmb3IgdGhpcyBXQVNNIGhhc2gAAAAAAB9JbXBsZW1lbnRhdGlvbkFscmVhZHlSZWdpc3RlcmVkAAAAG8UAAAAzRmFjdG9yeSBpcyBwYXVzZWQgKG5vIGBjcmVhdGVfZGFvYCBvciBgbGF1bmNoX2Rhb2ApAAAAAA1GYWN0b3J5UGF1c2VkAAAAAAAbxwAAADdBdWN0aW9uIHJlc2VydmUgcHJpY2UgYmVsb3cgYGNvbW1vbjo6TUlOX1JFU0VSVkVfUFJJQ0VgAAAAABJJbnZhbGlkUGFyYW1Cb3VuZHMAAAAAG8gAAAAlUXVvcnVtIGJhc2lzIHBvaW50cyBvdXRzaWRlIDEuLj0xMDAwMAAAAAAAABBJbnZhbGlkUXVvcnVtQnBzAAAbyQAAAC5BdWN0aW9uIGR1cmF0aW9uIG91dHNpZGUgNSBtaW51dGVzIC4uPSAzMCBkYXlzAAAAAAAPSW52YWxpZER1cmF0aW9uAAAAG8oAAAAtQXVjdGlvbiB0aW1lIGJ1ZmZlciBvdXRzaWRlIDEuLj04NjQwMCBzZWNvbmRzAAAAAAAAEUludmFsaWRUaW1lQnVmZmVyAAAAAAAbywAAAC5TdHJpbmcgbG9uZ2VyIHRoYW4gYGNvbW1vbjo6TUFYX1NUUklOR19MRU5HVEhgAAAAAAANU3RyaW5nVG9vTG9uZwAAAAAAG8wAAAAMU3RyaW5nIGVtcHR5AAAAC1N0cmluZ0VtcHR5AAAAG80AAACOR292ZXJuYW5jZSB0aW1pbmcgb3V0IG9mIHJhbmdlOiBlYWNoIG9mIHZvdGluZyBkZWxheSwgdm90aW5nIHBlcmlvZCBhbmQKcXVldWUgZGVsYXkgbXVzdCBiZSB3aXRoaW4gMzAwIHNlY29uZHMgLi49IDMwIGRheXMgKDJfNTkyXzAwMCBzZWNvbmRzKQAAAAAAF0ludmFsaWRHb3Zlcm5hbmNlVGltaW5nAAAAG84AAAAlUHJvcG9zYWwgdGhyZXNob2xkIG11c3QgYmUgYXQgbGVhc3QgMQAAAAAAABhJbnZhbGlkUHJvcG9zYWxUaHJlc2hvbGQAABvPAAAAgU5vIHZvdGluZy1jYXBhYmxlIHRva2VuIGV4aXN0czsgbWludCBhdCBsZWFzdCBvbmUgdG9rZW4gdG8gYSBob2xkZXIKb3RoZXIgdGhhbiB0aGUgVHJlYXN1cnksIEF1Y3Rpb24gb3IgTWFya2V0cGxhY2UgYmVmb3JlIGxhdW5jaAAAAAAAABBMYXVuY2hTdXBwbHlaZXJvAAAb0AAAAJ5BIG1vZHVsZSBvZiB0aGUgcGVuZGluZyBEQU8gY3VycmVudGx5IHJ1bnMgYSByZXZva2VkIG9yIHVucmVnaXN0ZXJlZApXQVNNIGhhc2g7IHVwZ3JhZGUgaXQgKGFkbWluIGB1cGdyYWRlYCB0byBhbiBhcHByb3ZlZCwgbm9uLXJldm9rZWQgaGFzaCkKYmVmb3JlIGxhdW5jaGluZwAAAAAAI1BlbmRpbmdEYW9Vc2VzUmV2b2tlZEltcGxlbWVudGF0aW9uAAAAG9EAAABTU2x1ZyBpcyBub3QgNC02MyBjaGFycyBvZiBgW2EtejAtOS1dYCB3aXRob3V0IGEgbGVhZGluZywgdHJhaWxpbmcgb3IKZG91YmxlZCBoeXBoZW4AAAAAC0ludmFsaWRTbHVnAAAAG9IAAAApU2x1ZyBpcyBhbHJlYWR5IGNsYWltZWQgYnkgYSBsYXVuY2hlZCBEQU8AAAAAAAAJU2x1Z1Rha2VuAAAAAAAb0wAAAB9DdXJyZW50IGltcGxlbWVudGF0aW9ucyBub3Qgc2V0AAAAABxDdXJyZW50SW1wbGVtZW50YXRpb25zTm90U2V0AAAb1AAAAC5TZWNvbmRhcnktc2FsZSBmZWUgYWJvdmUgYGNvbW1vbjo6TUFYX0ZFRV9CUFNgAAAAAAAKSW52YWxpZEZlZQAAAAAb1QAAAC1UaGUgbGF1bmNoIGFkbWluIGlzIG5vIGxvbmdlciB0aGUgdG9rZW4gYWRtaW4AAAAAAAATTGF1bmNoQWRtaW5Ob3RPd25lcgAAABvWAAAAJU5vIHBlbmRpbmcgREFPIGZvciB0aGlzIHRva2VuIGFkZHJlc3MAAAAAAAALRGFvTm90Rm91bmQAAAAb1wAAAC1ObyBsYXVuY2hlZCBEQU8gaXMgcmVnaXN0ZXJlZCB1bmRlciB0aGlzIHNsdWcAAAAAAAAMU2x1Z05vdEZvdW5kAAAb2AAAAC1gY2hhbmdlX3NsdWdgIHRvIHRoZSBzbHVnIHRoZSBEQU8gYWxyZWFkeSBoYXMAAAAAAAANU2x1Z1VuY2hhbmdlZAAAAAAAG9kAAABPVGhlIE1hbmFnZXIncyBvd24gdXBncmFkZSB3YXMgYXBwcm92ZWQgbGVzcyB0aGFuIGB1cGdyYWRlX2RlbGF5KClgIGxlZGdlcnMgYWdvLgAAAAAWVXBncmFkZURlbGF5Tm90RWxhcHNlZAAAAAAb2gAAAEpgdXBncmFkZV9tYW5hZ2VyYCB0byBhIGhhc2ggdGhhdCBpcyBub3QgdGhlIGxhdGVzdCBNYW5hZ2VyIGltcGxlbWVudGF0aW9uLgAAAAAAEFVwZ3JhZGVOb3RMYXRlc3QAABvbAAAAh0EgbW9kdWxlJ3MgcGF5bWVudCBhc3NldCBkaWZmZXJzIGZyb20gdGhlIG9uZSByZWNvcmRlZCB3aGVuIGl0IHdhcwpjcmVhdGVkICh0aGUgbGF1bmNoIGFkbWluIGNoYW5nZWQgaXQgaW4gU2V0dXApOyBjaGFuZ2UgaXQgYmFjayBmaXJzdAAAAAAUUGF5bWVudEFzc2V0TWlzbWF0Y2gAABvcAAAAHGBtb2R1bGVzYCBsaXN0cyBhIGtpbmQgdHdpY2UAAAAOSW52YWxpZE1vZHVsZXMAAAAAG90AAACDYGNyZWF0ZV9tb2R1bGVgJ3MgYGV4cGVjdGVkX25gIGlzIG5vdCBgbW9kdWxlX2NvdW50KHRva2VuLCBraW5kKWA6IGEKbW9kdWxlIG9mIHRoaXMga2luZCB3YXMgY3JlYXRlZCBzaW5jZSB0aGUgcHJvcG9zYWwgd2FzIGRyYWZ0ZWQAAAAAEFN0YWxlTW9kdWxlSW5kZXgAABveAAAAQlRoZSBEQU8gaGFzIG5vIENsYWltTWludGVyIHJlZ2lzdGVyZWQgKG9yIG5vIGNsYWltcyBwYXltZW50IGFzc2V0KQAAAAAADU5vQ2xhaW1NaW50ZXIAAAAAABvfAAAAM0FuIGFzc3VyYW5jZSBkcml2ZSBpcyBhbHJlYWR5IHJlY29yZGVkIGZvciB0aGlzIERBTwAAAAAPQXNzdXJhbmNlRXhpc3RzAAAAG+AAAABIVGhlIGFzc3VyYW5jZSBkZWFkbGluZSBpcyBtb3JlIHRoYW4gYE1BWF9BU1NVUkFOQ0VfV0lORE9XYCAoOTAgZGF5cykgb3V0AAAADkRlYWRsaW5lVG9vRmFyAAAAABvhAAAASFRoZSBwZW5kaW5nIERBTyBpcyBpbiBhbiBhc3N1cmFuY2UgZHJpdmU6IGl0cyBzbHVnIGlzIHJlc2VydmVkIGFuZApmaXhlZAAAAA1Bc3N1cmFuY2VPcGVuAAAAAAAb4gAAACtObyBhc3N1cmFuY2UgZHJpdmUgaXMgcmVjb3JkZWQgZm9yIHRoaXMgREFPAAAAAAtOb0Fzc3VyYW5jZQAAABvjAAAAPFRoZSBhc3N1cmFuY2UgbGlzdCBoYXMgbm90IHJlYWNoZWQgaXRzIHRocmVzaG9sZCBvZiBjbGFpbWVycwAAAA9Bc3N1cmFuY2VOb3RNZXQAAAAb5AAAAD9UaGUgZGVhZGxpbmUgcGFzc2VkIHdpdGhvdXQgYSBsYXVuY2g6IHRoZSBkcml2ZSBlbmRzIGluIHJlZnVuZHMAAAAAD0Fzc3VyYW5jZUZhaWxlZAAAABvlAAAAPWByZWxlYXNlX3NsdWdgIC8gYHJlY292ZXJfY2xhaW1zYCBiZWZvcmUgdGhlIGRyaXZlIGhhcyBmYWlsZWQAAAAAAAASQXNzdXJhbmNlTm90RmFpbGVkAAAAABvmAAAAXmB0cmFuc2Zlcl9hZ2VudHNgIG5hbWVzIGEga2luZCAob3IgbmFtZXMgaXQgdHdpY2UpIHRoYXQgYG1vZHVsZXNgCmRvZXMgbm90IGNyZWF0ZSBleGFjdGx5IG9uY2UAAAAAABBVbmtub3duQWdlbnRLaW5kAAAb5w==", "AAAABQAAAAAAAAAAAAAACkRhb0NyZWF0ZWQAAAAAAAEAAAALZGFvX2NyZWF0ZWQAAAAABwAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAAhkZXBsb3llcgAAABMAAAABAAAAAAAAAAxsYXVuY2hfYWRtaW4AAAATAAAAAQAAAAAAAAAOY3JlYXRlZF9sZWRnZXIAAAAAAAYAAAAAAAAAAAAAAAdtb2R1bGVzAAAAB9AAAAAMRGFvQWRkcmVzc2VzAAAAAAAAACtXQVNNIGhhc2hlcyB0aGUgbW9kdWxlcyB3ZXJlIGRlcGxveWVkIGZyb20uAAAAAAt3YXNtX2hhc2hlcwAAAAfQAAAADURhb1dhc21IYXNoZXMAAAAAAAAAAAAAQ1JlcXVlc3RlZCBzbHVnLiBOb3QgdW5pcXVlIHVudGlsIGNsYWltZWQgYXQgbGF1bmNoIChgU2x1Z0NsYWltZWRgKS4AAAAABHNsdWcAAAAQAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAC0Rhb0xhdW5jaGVkAAAAAAEAAAAMZGFvX2xhdW5jaGVkAAAABgAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAA9sYXVuY2hlZF9sZWRnZXIAAAAABgAAAAAAAAAAAAAAB21vZHVsZXMAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAAAAAAAAAAAAA5sYXVuY2hfYXVjdGlvbgAAAAAAAQAAAAAAAAAAAAAAEmxhdW5jaF9tYXJrZXRwbGFjZQAAAAAAAQAAAAAAAACBVGhlIHJlZ2lzdGVyZWQgbW9kdWxlcyBhdCBsYXVuY2ggKHRoZSBUb2tlbidzIHJlZ2lzdHJ5KTogdGhlCmluZGV4ZXIga25vd3MgdGhlIGxhdW5jaCBzZXQgd2l0aG91dCB0aGUgVG9rZW4ncyBgTW9kdWxlUmVnaXN0ZXJlZGAuAAAAAAAACHJlZ2lzdHJ5AAAD6gAAB9AAAAALTW9kdWxlRW50cnkAAAAAAAAAAAI=", "AAAABQAAAIZFbWl0dGVkIGJ5IGBjaGFuZ2Vfc2x1Z2A6IGEgbGF1bmNoZWQgREFPIG1vdmVkIHRvIGBuZXdfc2x1Z2AgYW5kIHJlbGVhc2VkCmBvbGRfc2x1Z2AsIHdoaWNoIGFueSBEQU8gbWF5IGNsYWltIGZyb20gdGhlIHNhbWUgbGVkZ2VyIG9uLgAAAAAAAAAAAAtTbHVnQ2hhbmdlZAAAAAABAAAADHNsdWdfY2hhbmdlZAAAAAMAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAIbmV3X3NsdWcAAAAQAAAAAQAAAAAAAAAIb2xkX3NsdWcAAAAQAAAAAAAAAAI=", "AAAABQAAAHNFbWl0dGVkIGJ5IGBsYXVuY2hfZGFvYCB3aGVuIHRoZSBEQU8ncyBzbHVnIGJlY29tZXMgaXRzIHVuaXF1ZSBpZCAoaXQgY2FuCmxhdGVyIGNoYW5nZSBieSB2b3RlLCBzZWUgYFNsdWdDaGFuZ2VkYCkuAAAAAAAAAAALU2x1Z0NsYWltZWQAAAAAAQAAAAxzbHVnX2NsYWltZWQAAAACAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAAAAAAABHNsdWcAAAAQAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAEAAAANYWRtaW5fY2hhbmdlZAAAAAAAAAIAAAAAAAAACW9sZF9hZG1pbgAAAAAAABMAAAABAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAQAAAAI=", "AAAABQAAAEhFbWl0dGVkIGJ5IGByZWxlYXNlX3NsdWdgOiBhIGZhaWxlZCBkcml2ZSdzIHJlc2VydmVkIHNsdWcgaXMgZnJlZSBhZ2Fpbi4AAAAAAAAADFNsdWdSZWxlYXNlZAAAAAEAAAANc2x1Z19yZWxlYXNlZAAAAAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAEc2x1ZwAAABAAAAABAAAAAg==", "AAAABQAAAAAAAAAAAAAADUFkbWluUHJvcG9zZWQAAAAAAAABAAAADmFkbWluX3Byb3Bvc2VkAAAAAAACAAAAAAAAAA1jdXJyZW50X2FkbWluAAAAAAAAEwAAAAEAAAAAAAAADnByb3Bvc2VkX2FkbWluAAAAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAADUZhY3RvcnlQYXVzZWQAAAAAAAABAAAADmZhY3RvcnlfcGF1c2VkAAAAAAAAAAAAAg==", "AAAABQAAAHBFbWl0dGVkIGJ5IGBjcmVhdGVfbW9kdWxlYDogdGhlIGBuYHRoIG1vZHVsZSBvZiBga2luZGAgZm9yIHRoZSBEQU8sCmF0IGBwcmVkaWN0X21vZHVsZV9hZGRyZXNzKHRva2VuLCBraW5kLCBuKWAuAAAAAAAAAA1Nb2R1bGVDcmVhdGVkAAAAAAAAAQAAAA5tb2R1bGVfY3JlYXRlZAAAAAAABAAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAARraW5kAAAAEQAAAAEAAAAAAAAAAW4AAAAAAAAEAAAAAAAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAI=", "AAAABQAAAKRFbWl0dGVkIGJ5IGBvcGVuX2Fzc3VyYW5jZWA6IHRoZSBkcml2ZSdzIGxpc3QsIGl0cyBkZWFkbGluZSBhbmQgdGhlCmxhdW5jaCBjb25maWcgZXZlcnkgbGF1bmNoIHBhdGggd2lsbCB1c2UuIFRoZSBzbHVnIGlzIHJlc2VydmVkCihgU2x1Z0NsYWltZWRgKSBpbiB0aGUgc2FtZSBjYWxsLgAAAAAAAAAPQXNzdXJhbmNlT3BlbmVkAAAAAAEAAAAQYXNzdXJhbmNlX29wZW5lZAAAAAYAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAMY2xhaW1fbWludGVyAAAAEwAAAAAAAAAAAAAAB2xpc3RfaWQAAAAABAAAAAAAAAAAAAAACGRlYWRsaW5lAAAABgAAAAAAAAAAAAAADmxhdW5jaF9hdWN0aW9uAAAAAAABAAAAAAAAAAAAAAASbGF1bmNoX21hcmtldHBsYWNlAAAAAAABAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAD0ZhY3RvcnlVbnBhdXNlZAAAAAABAAAAEGZhY3RvcnlfdW5wYXVzZWQAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD01hbmFnZXJVcGdyYWRlZAAAAAABAAAAEG1hbmFnZXJfdXBncmFkZWQAAAAFAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAAAAAAAAxmcm9tX3ZlcnNpb24AAAAQAAAAAAAAAAAAAAAKdG9fdmVyc2lvbgAAAAAAEAAAAAAAAAAAAAAAD3VwZ3JhZGVkX2xlZGdlcgAAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAD1VwZ3JhZGVBcHByb3ZlZAAAAAABAAAAEHVwZ3JhZGVfYXBwcm92ZWQAAAADAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAAAAAAAA9hcHByb3ZlZF9sZWRnZXIAAAAABgAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEk1hbmFnZXJJbml0aWFsaXplZAAAAAAAAQAAABNtYW5hZ2VyX2luaXRpYWxpemVkAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAAAAAAD2RlcGxveWVkX2xlZGdlcgAAAAAGAAAAAAAAAAI=", "AAAABQAAACFFbWl0dGVkIGJ5IGB1cGRhdGVfcGVuZGluZ19zbHVnYC4AAAAAAAAAAAAAElBlbmRpbmdTbHVnVXBkYXRlZAAAAAAAAQAAABRwZW5kaW5nX3NsdWdfdXBkYXRlZAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAEc2x1ZwAAABAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAFUltcGxlbWVudGF0aW9uUmV2b2tlZAAAAAAAAAEAAAAWaW1wbGVtZW50YXRpb25fcmV2b2tlZAAAAAAAAgAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAA5yZXZva2VkX2xlZGdlcgAAAAAABgAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAFkFkbWluUHJvcG9zYWxDYW5jZWxsZWQAAAAAAAEAAAAYYWRtaW5fcHJvcG9zYWxfY2FuY2VsbGVkAAAAAgAAAAAAAAANY3VycmVudF9hZG1pbgAAAAAAABMAAAABAAAAAAAAAA9jYW5jZWxsZWRfYWRtaW4AAAAAEwAAAAEAAAAC", "AAAABQAAACdFbWl0dGVkIGJ5IGBzZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uYC4AAAAAAAAAABdMYXRlc3RJbXBsZW1lbnRhdGlvblNldAAAAAABAAAAGWxhdGVzdF9pbXBsZW1lbnRhdGlvbl9zZXQAAAAAAAADAAAAAAAAAARuYW1lAAAAEAAAAAEAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAGEltcGxlbWVudGF0aW9uUmVnaXN0ZXJlZAAAAAEAAAAZaW1wbGVtZW50YXRpb25fcmVnaXN0ZXJlZAAAAAAAAAQAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAABBwdWJsaXNoZWRfbGVkZ2VyAAAABgAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAHUN1cnJlbnRJbXBsZW1lbnRhdGlvbnNVcGRhdGVkAAAAAAAAAQAAAB9jdXJyZW50X2ltcGxlbWVudGF0aW9uc191cGRhdGVkAAAAAAcAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAAAAAAAAhtZXRhZGF0YQAAA+4AAAAgAAAAAAAAAAAAAAAHYXVjdGlvbgAAAAPuAAAAIAAAAAAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAAAAAAAAh0cmVhc3VyeQAAA+4AAAAgAAAAAAAAAAAAAAALbWFya2V0cGxhY2UAAAAD7gAAACAAAAAAAAAAAAAAAAZjbGFpbXMAAAAAA+4AAAAgAAAAAAAAAAI=", "AAAAAQAAAGxBIHJlY29yZGVkIGFzc3VyYW5jZSBkcml2ZTogdGhlIENsYWltTWludGVyIGxpc3QsIGl0cyBkZWFkbGluZSBhbmQgdGhlCmxhdW5jaCBjb25maWcgZXZlcnkgbGF1bmNoIHBhdGggdXNlcy4AAAAAAAAACUFzc3VyYW5jZQAAAAAAAAQAAAAAAAAADGNsYWltX21pbnRlcgAAABMAAAAAAAAACGRlYWRsaW5lAAAABgAAAAAAAAANbGF1bmNoX2NvbmZpZwAAAAAAB9AAAAAMTGF1bmNoQ29uZmlnAAAAAAAAAAdsaXN0X2lkAAAAAAQ=", "AAAAAgAAAIVBIG1vZHVsZSB0aGUgTWFuYWdlciBkZXBsb3lzIGZvciBhIERBTyAoYGNyZWF0ZV9kYW9gIC8gYGNyZWF0ZV9tb2R1bGVgKSwKd2l0aCBpdHMgY3JlYXRpb24gY29uZmlnLiBFYWNoIHZhcmlhbnQgaXMgb25lIHJlZ2lzdHJ5IGtpbmQuAAAAAAAAAAAAAApNb2R1bGVTcGVjAAAAAAADAAAAAQAAAAAAAAAHQXVjdGlvbgAAAAABAAAH0AAAAA1BdWN0aW9uQ29uZmlnAAAAAAAAAQAAAAAAAAALTWFya2V0cGxhY2UAAAAAAQAAB9AAAAARTWFya2V0cGxhY2VDb25maWcAAAAAAAABAAAAAAAAAAZDbGFpbXMAAAAAAAEAAAfQAAAADENsYWltc0NvbmZpZw==", "AAAAAQAAASZUaGUgb25seSBmYWN0b3J5IHN0YXRlIHJldGFpbmVkIHVudGlsIHRoZSBsYXVuY2ggYWRtaW5pc3RyYXRvciBmaW5hbGl6ZXMgYSBEQU8uCgpNb2R1bGUgV0FTTSBoYXNoZXMgYXJlIGRlbGliZXJhdGVseSBOT1Qgc3RvcmVkOiBgbGF1bmNoX2Rhb2AgcmVhZHMgZWFjaAptb2R1bGUncyBjdXJyZW50IGB3YXNtX2hhc2goKWAgYW5kIGNoZWNrcyBpdCBhZ2FpbnN0IHRoZSByZWdpc3RyeSwgc28gYQpwcmUtbGF1bmNoIGFkbWluIGB1cGdyYWRlYCBpcyBob25vcmVkIGFuZCBhIHJldm9rZWQgaGFzaCBpcyByZWplY3RlZC4AAAAAAAAAAAAKUGVuZGluZ0RhbwAAAAAABgAAAAAAAAAJYWRkcmVzc2VzAAAAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAACxUGF5bWVudCBhc3NldHMgZml4ZWQgaW4gZWFjaCBtb2R1bGUncyBjcmVhdGlvbiBjb25maWc7IGxhdW5jaCByZWZ1c2VzCmEgbW9kdWxlIHdob3NlIGBwYXltZW50X2Fzc2V0KClgIGNoYW5nZWQgKGBQYXltZW50QXNzZXRNaXNtYXRjaGApLgpgTm9uZWAgZm9yIGEga2luZCB0aGUgREFPIGRvZXMgbm90IGhhdmUuAAAAAAAAFWF1Y3Rpb25fcGF5bWVudF9hc3NldAAAAAAAA+gAAAATAAAAAAAAABRjbGFpbXNfcGF5bWVudF9hc3NldAAAA+gAAAATAAAAAAAAAAxsYXVuY2hfYWRtaW4AAAATAAAAAAAAABltYXJrZXRwbGFjZV9wYXltZW50X2Fzc2V0AAAAAAAD6AAAABMAAABPUmVxdWVzdGVkIHNsdWc7IGNsYWltZWQgYXQgYGxhdW5jaF9kYW9gLCBjaGFuZ2VhYmxlIHdpdGggYHVwZGF0ZV9wZW5kaW5nX3NsdWdgLgAAAAAEc2x1ZwAAABA=", "AAAAAQAAAEFDbGFpbU1pbnRlciBjcmVhdGlvbiBjb25maWc6IHRoZSBhc3NldCBTZXR1cCBsaXN0cyBhcmUgcHJpY2VkIGluLgAAAAAAAAAAAAAMQ2xhaW1zQ29uZmlnAAAAAQAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABM=", "AAAAAQAAAAAAAAAAAAAADERhb0FkZHJlc3NlcwAAAAcAAACuTW9kdWxlcyBkZXBsb3llZCB3aXRoIHRoZSBEQU8gKG9yIGFkZGVkIGluIFNldHVwIGJ5IGBjcmVhdGVfbW9kdWxlYCk7CmBOb25lYCBmb3IgYSBraW5kIGl0IGRvZXMgbm90IGhhdmUuIFRoZSBUb2tlbidzIHJlZ2lzdHJ5IGlzIHRoZQpzb3VyY2Ugb2YgdHJ1dGggZm9yIG1vZHVsZXMgYWRkZWQgbGF0ZXIuAAAAAAAHYXVjdGlvbgAAAAPoAAAAEwAAAAAAAAAGY2xhaW1zAAAAAAPoAAAAEwAAAAAAAAAIZ292ZXJub3IAAAATAAAAAAAAAAttYXJrZXRwbGFjZQAAAAPoAAAAEwAAAAAAAAAIbWV0YWRhdGEAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEw==", "AAAAAQAAAAAAAAAAAAAADExhdW5jaENvbmZpZwAAAAIAAABBU3RhcnQgdGhlIEF1Y3Rpb24gKGlmIHRoZSBEQU8gaGFzIG9uZSkgYW5kIGdyYW50IGl0IGFuIGFsbG93YW5jZS4AAAAAAAAObGF1bmNoX2F1Y3Rpb24AAAAAAAEAAAAqT3BlbiB0aGUgTWFya2V0cGxhY2UgKGlmIHRoZSBEQU8gaGFzIG9uZSkuAAAAAAASbGF1bmNoX21hcmtldHBsYWNlAAAAAAAB", "AAAAAQAAAAAAAAAAAAAADUF1Y3Rpb25Db25maWcAAAAAAAAEAAAAAAAAAAhkdXJhdGlvbgAAAAYAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAALdGltZV9idWZmZXIAAAAABg==", "AAAAAQAAAHtXQVNNIGhhc2hlcyBhIERBTydzIGNvbnRyYWN0cyB3ZXJlIGRlcGxveWVkIGZyb20gKGVtaXR0ZWQgaW4KYERhb0NyZWF0ZWRgKTsgYSBtb2R1bGUgdGhlIERBTyB3YXMgY3JlYXRlZCB3aXRob3V0IGlzIGBOb25lYC4AAAAAAAAAAA1EYW9XYXNtSGFzaGVzAAAAAAAABwAAAAAAAAAHYXVjdGlvbgAAAAPoAAAD7gAAACAAAAAAAAAABmNsYWltcwAAAAAD6AAAA+4AAAAgAAAAAAAAAAhnb3Zlcm5vcgAAA+4AAAAgAAAAAAAAAAttYXJrZXRwbGFjZQAAAAPoAAAD7gAAACAAAAAAAAAACG1ldGFkYXRhAAAD7gAAACAAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAACHRyZWFzdXJ5AAAD7gAAACA=", "AAAAAQAAAAAAAAAAAAAAEEdvdmVybmFuY2VDb25maWcAAAAFAAAAAAAAABJwcm9wb3NhbF90aHJlc2hvbGQAAAAAAAoAAAAAAAAAC3F1ZXVlX2RlbGF5AAAAAAQAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAAAAAADHZvdGluZ19kZWxheQAAAAQAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAE", "AAAAAQAAAAAAAAAAAAAAEURhb0NyZWF0aW9uUGFyYW1zAAAAAAAABAAAAAAAAAAIZGVwbG95ZXIAAAATAAAAAAAAAA5pbml0aWFsX2NvbmZpZwAAAAAH0AAAABZJbml0aWFsRGFvQ29uZmlnVmFsdWVzAAAAAAAAAAAADGxhdW5jaF9hZG1pbgAAABMAAAAAAAAABW5vbmNlAAAAAAAABg==", "AAAAAQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAAAgAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAEXNlY29uZGFyeV9mZWVfYnBzAAAAAAAABA==", "AAAAAQAAAIJUaGUgcGFpZCBjbGFpbSBsaXN0IGEgcGVuZGluZyBEQU8ncyBhc3N1cmFuY2UgZHJpdmUgb3BlbnMgKGBvcGVuX2Fzc3VyYW5jZWApLApwcmljZWQgaW4gdGhlIERBTydzIHJlY29yZGVkIGBjbGFpbXNfcGF5bWVudF9hc3NldGAuAAAAAAAAAAAAE0Fzc3VyYW5jZUxpc3RQYXJhbXMAAAAABwAAADxMZWRnZXIgdGltZXN0YW1wIGFmdGVyIHdoaWNoIGFuIHVubGF1bmNoZWQgZHJpdmUgaGFzIGZhaWxlZC4AAAAIZGVhZGxpbmUAAAAGAAAAOUNsYWltcyBzdG9wIGF0IHRoaXMgbGVkZ2VyIHRpbWVzdGFtcCAoYWZ0ZXIgbGF1bmNoLCB0b28pLgAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAARFByaWNlIHBlciB0b2tlbiAoMCBmb3IgYSBmcmVlIGRyaXZlIHRoYXQgc3RpbGwgbmVlZHMgaXRzIHRocmVzaG9sZCkuAAAABXByaWNlAAAAAAAACwAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAM0Rpc3RpbmN0IGNsYWltZXJzIG5lZWRlZCBiZWZvcmUgdGhlIERBTyBtYXkgbGF1bmNoLgAAAAASdGhyZXNob2xkX2NsYWltZXJzAAAAAAAEAAAAAAAAAAV0b3RhbAAAAAAAAAQAAAAAAAAACHRyZWVfdXJpAAAAEA==", "AAAAAQAAAAAAAAAAAAAAFUltcGxlbWVudGF0aW9uVmVyc2lvbgAAAAAAAAUAAAAAAAAABG5hbWUAAAAQAAAAJExlZGdlciBzZXF1ZW5jZSBvZiB0aGUgcmVnaXN0cmF0aW9uLgAAABBwdWJsaXNoZWRfbGVkZ2VyAAAABgAAAAAAAAAHcmV2b2tlZAAAAAABAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAg", "AAAAAQAAAEdUaGUgaW1wbGVtZW50YXRpb24gaGFzaGVzIGBjcmVhdGVfZGFvYCBhbmQgYGNyZWF0ZV9tb2R1bGVgIGRlcGxveSBmcm9tLgAAAAAAAAAAFkN1cnJlbnRJbXBsZW1lbnRhdGlvbnMAAAAAAAcAAAAAAAAAB2F1Y3Rpb24AAAAD7gAAACAAAAAAAAAABmNsYWltcwAAAAAD7gAAACAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAAC21hcmtldHBsYWNlAAAAA+4AAAAgAAAAAAAAAAhtZXRhZGF0YQAAA+4AAAAgAAAAAAAAAAV0b2tlbgAAAAAAA+4AAAAgAAAAAAAAAAh0cmVhc3VyeQAAA+4AAAAg", "AAAAAQAAAAAAAAAAAAAAFkluaXRpYWxEYW9Db25maWdWYWx1ZXMAAAAAAAkAAAAAAAAACmdvdmVybmFuY2UAAAAAB9AAAAAQR292ZXJuYW5jZUNvbmZpZwAAAKNUaGUgbW9kdWxlcyB0byBkZXBsb3kgd2l0aCB0aGUgREFPLCBlYWNoIGtpbmQgYXQgbW9zdCBvbmNlOyBhbGwgYXJlCm9wdGlvbmFsIChkb2NzL2Rlc2lnbnMvbWVtYmVyc2hpcC1tb2RlbHMubWQgwqcyKS4gTW9yZSBjYW4gYmUgYWRkZWQKbGF0ZXIgd2l0aCBgY3JlYXRlX21vZHVsZWAuAAAAAAdtb2R1bGVzAAAAA+oAAAfQAAAACk1vZHVsZVNwZWMAAAAAAJZEQU8gcHJvZmlsZSBKU09OIChkZXNjcmlwdGlvbiwgbGlua3MsIGltYWdlKSwgMSB0bwpgY29tbW9uOjpNQVhfUFJPRklMRV9MRU5HVEhgIGJ5dGVzLiBFdmVudC1vbmx5OiB0aGUgTWV0YWRhdGEgY29udHJhY3QKZW1pdHMgaXQgYW5kIHN0b3JlcyBpdHMgaGFzaC4AAAAAAAdwcm9maWxlAAAAABAAAABCQmFzZSBVUkwgb2YgdGhlIGltYWdlIGNvbXBvc2l0b3IgdXNlZCBieSB0aGUgb24tY2hhaW4gYHRva2VuX3VyaWAuAAAAAAANcmVuZGVyZXJfYmFzZQAAAAAAABAAAACoUmVxdWVzdGVkIGh1bWFuLWZyaWVuZGx5IERBTyBpZGVudGlmaWVyIChgW2EtejAtOS1dYCwgNC02MyBjaGFycykuCkNsYWltZWQgKHVuaXF1ZSkgb25seSBhdCBgbGF1bmNoX2Rhb2A7IGEgbGF1bmNoZWQgREFPIGNhbiBtb3ZlIHRvIGEgbmV3CnNsdWcgYnkgdm90ZSAoYGNoYW5nZV9zbHVnYCkuAAAABHNsdWcAAAAQAAAAAAAAAAp0b2tlbl9uYW1lAAAAAAAQAAAAZlRoZSBtZW1iZXJzaGlwIHN3aXRjaGVzIHRoZSBUb2tlbiBzdGFydHMgd2l0aAooZG9jcy9kZXNpZ25zL2xvY2tlZC10b2tlbnMubWQpOyBhbGwgb2ZmIGlzIGFuIG9wZW4gREFPLgAAAAAADnRva2VuX3NldHRpbmdzAAAAAAfQAAAADVRva2VuU2V0dGluZ3MAAAAAAAAAAAAADHRva2VuX3N5bWJvbAAAABAAAACYS2luZHMgaW4gYG1vZHVsZXNgIHdob3NlIG1vZHVsZSBiZWNvbWVzIGEgdHJhbnNmZXIgYWdlbnQgYXQgY3JlYXRpb24KKHZpc2libGUgdG8gZXZlcnkgbWVtYmVyIGJlZm9yZSB0aGV5IGpvaW4pOyBsYXRlciBhZ2VudHMgbmVlZCBhCnByb3Bvc2FsIG9uY2UgTGl2ZS4AAAAPdHJhbnNmZXJfYWdlbnRzAAAAA+oAAAAR", "AAAAAAAAACtSZXR1cm5zIHRoZSBhY3RpdmUgTWFuYWdlciByZWxlYXNlIHZlcnNpb24uAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAAEA==", "AAAAAAAAAGBTbHVnIGNsYWltZWQgYnkgYSBsYXVuY2hlZCBEQU8sIGlmIGFueSAoYSBwZW5kaW5nIERBTydzIHJlcXVlc3RlZCBzbHVnCmlzIGluIGBnZXRfcGVuZGluZ19kYW9gKS4AAAAIZ2V0X3NsdWcAAAABAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAPoAAAAEA==", "AAAAAAAAAA5DdXJyZW50IGFkbWluLgAAAAAACWdldF9hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAACVSZXR1cm5zIHRoZSBhY3RpdmUgTWFuYWdlciBXQVNNIGhhc2guAAAAAAAACXdhc21faGFzaAAAAAAAAAAAAAABAAAD7gAAACA=", "AAAAAAAAA4JDcmVhdGUgYSBuZXcgREFPOiB0aGUgZm91ciBjb3JlIGNvbnRyYWN0cyAoVG9rZW4sIE1ldGFkYXRhLCBHb3Zlcm5vciwKVHJlYXN1cnkpIGFuZCB0aGUgbW9kdWxlcyBsaXN0ZWQgaW4gYGluaXRpYWxfY29uZmlnLm1vZHVsZXNgLCBkZXBsb3llZAphdG9taWNhbGx5LCB3aXRoIGVhY2ggbW9kdWxlIHJlZ2lzdGVyZWQgb24gdGhlIFRva2VuLgoKVGhlIGxhdW5jaCBhZG1pbmlzdHJhdG9yIG93bnMgdGhlIHNldHVwIHdpbmRvdyBhbmQgbWF5IGNvbmZpZ3VyZSB0aGUKY29udHJhY3RzIGJlZm9yZSBgbGF1bmNoX2Rhb2AuCgojIEF1dGhvcml6YXRpb24KClJlcXVpcmVzIEJPVEggYHBhcmFtcy5kZXBsb3llcmAgYW5kIGBwYXJhbXMubGF1bmNoX2FkbWluYCB0byBhdXRob3JpemUKdGhlIGNhbGwgKG9uZSBzaWduYXR1cmUgaWYgdGhleSBhcmUgdGhlIHNhbWUgYWRkcmVzcykuIE1vZHVsZQpjb25zdHJ1Y3RvcnMgZG8gbm90IHJlcXVpcmUgYXV0aC4KClRoZSByZXF1ZXN0ZWQgc2x1ZyBpcyB2YWxpZGF0ZWQgYW5kIG11c3Qgbm90IGJlbG9uZyB0byBhIGxhdW5jaGVkIERBTywKYnV0IGl0IGlzIG9ubHkgY2xhaW1lZCBhdCBgbGF1bmNoX2Rhb2AgKHBlbmRpbmcgREFPcyBob2xkIG5vIHNsdWcsIHNvIGFuCmFiYW5kb25lZCBjcmVhdGlvbiBibG9ja3Mgbm90aGluZykuCgojIEVycm9ycwoKKiBgRmFjdG9yeVBhdXNlZGAgLSBGYWN0b3J5IGlzIHBhdXNlZAoqIGBDdXJyZW50SW1wbGVtZW50YXRpb25zTm90U2V0YCAtIEN1cnJlbnQgV0FTTSBoYXNoZXMgbm90IGNvbmZpZ3VyZWQKKiBgSW52YWxpZE1vZHVsZXNgIC0gQSBraW5kIGxpc3RlZCB0d2ljZQoqIGBJbnZhbGlkU2x1Z2AgLyBgU2x1Z1Rha2VuYCAtIE1hbGZvcm1lZCBzbHVnLCBvciBjbGFpbWVkIGJ5IGEgbGF1bmNoZWQgREFPAAAAAAAKY3JlYXRlX2RhbwAAAAAAAQAAAAAAAAAGcGFyYW1zAAAAAAfQAAAAEURhb0NyZWF0aW9uUGFyYW1zAAAAAAAAAQAAA+kAAAfQAAAADERhb0FkZHJlc3NlcwAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAABABMYXVuY2ggYSBjb25maWd1cmVkIERBTy4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSB0aGUgbGF1bmNoX2FkbWluIHdobyBjcmVhdGVkIHRoZSBEQU8uCgojIFZhbGlkYXRpb24KCi0gVGhlIGZhY3RvcnkgbXVzdCBub3QgYmUgcGF1c2VkIChgRmFjdG9yeVBhdXNlZGApCi0gVG9rZW4gdm90aW5nIHN1cHBseSBtdXN0IGJlID4gMCAoYXQgbGVhc3Qgb25lIHRva2VuIG1pbnRlZCB0byBhIGhvbGRlcgpvdGhlciB0aGFuIHRoZSBUcmVhc3VyeSBvciBhIG5vbi12b3RpbmcgbW9kdWxlKQotIGxhdW5jaF9hZG1pbiBtdXN0IGJlIHRoZSBjdXJyZW50IHRva2VuIGFkbWluIChgTGF1bmNoQWRtaW5Ob3RPd25lcmApCi0gVGhlIHJlcXVlc3RlZCBzbHVnIG11c3Qgc3RpbGwgYmUgdW5jbGFpbWVkIChgU2x1Z1Rha2VuYDsgY2hhbmdlIGl0IHdpdGgKYHVwZGF0ZV9wZW5kaW5nX3NsdWdgKQotIFRoZSBjb3JlIGNvbnRyYWN0cyBhbmQgZXZlcnkgcmVnaXN0ZXJlZCBtb2R1bGUgbXVzdCBDVVJSRU5UTFkgcnVuIGEKcmVnaXN0ZXJlZCwgbm9uLXJldm9rZWQgaGFzaCAoYFBlbmRpbmdEYW9Vc2VzUmV2b2tlZEltcGxlbWVudGF0aW9uYCkKLSBFdmVyeSBtb2R1bGUncyBgcGF5bWVudF9hc3NldCgpYCBtdXN0IGVxdWFsIHRoZSBhc3NldCByZWNvcmRlZCBhdCBpdHMKY3JlYXRpb24gKGBQYXltZW50QXNzZXRNaXNtYXRjaGApCgpBbGwgY2hlY2tzIHJ1biBiZWZvcmUgYW55IGxhdW5jaCBjYWxsLCBzbyBhIHJlZnVzYWwgbGF1bmNoZXMgbm90aGluZy4KCiMgRWZmZWN0cwoKMS4gYHRva2VuLmxhdW5jaGAgd2l0aCBhbiB1bmxpbWl0ZWQgYWxsb3dhbmNlIGZvciB0aGUgQXVjdGlvbiBpZgpgbGF1bmNoX2F1Y3Rpb25gOyB0aGUgTWFya2V0cGxhY2UgaXMgZnVuZGVkIHBlciBwb29sIGJ5IHByb3Bvc2FsIGFuZAp0aGUgQ2xhaW1NaW50ZXIga2VlcHMgd2hhdCB0aGUgbGF1bmNoIGFkbWluIGdyYW50ZWQKMi4gYGxhdW5jaGAgb24gdGhlIEdvdmVybm9yIGFuZCBUcmVhc3VyeSwgdGhlbiBgRGFvTW9kdWxlAAAACmxhdW5jaF9kYW8AAAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAA1sYXVuY2hfY29uZmlnAAAAAAAH0AAAAAxMYXVuY2hDb25maWcAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAuZNb3ZlIGEgbGF1bmNoZWQgREFPIHRvIGEgbmV3IHNsdWcuIFRoZSBvbGQgc2x1ZyBpcyByZWxlYXNlZCBhdCBvbmNlIGFuZAphbnkgREFPIG1heSBjbGFpbSBpdCwgZnJvbSB0aGlzIHNhbWUgdHJhbnNhY3Rpb24gb24uCgojIEF1dGhvcml6YXRpb24KClRoZSB0b2tlbidzIGFkbWluLCB3aGljaCBhZnRlciBsYXVuY2ggaXMgdGhlIERBTydzIFRyZWFzdXJ5LCBzbyB0aGlzCm9ubHkgcnVucyB0aHJvdWdoIGEgcGFzc2VkIHByb3Bvc2FsIChgdHJlYXN1cnkuZXhlY3V0ZWApLiBUaGlzIHJlbGllcyBvbgp0aGUgdG9rZW4gaGF2aW5nIG5vIGFkbWluIHRyYW5zZmVyIGFmdGVyIGxhdW5jaCAoYGNvbW1vbjo6YWRtaW46OmhhbmRvZmZgCmlzIG9uZS1zaG90KTsgYSB0b2tlbiByZWxlYXNlIHRoYXQgYWRkcyBvbmUgbXVzdCByZXZpc2l0IHRoaXMgY2hlY2suCgojIEVycm9ycwoKKiBgRmFjdG9yeVBhdXNlZGAgLSBTbHVnIGNsYWltcyBhcmUgc3RvcHBlZCB3aGlsZSB0aGUgZmFjdG9yeSBpcyBwYXVzZWQKKiBgU2x1Z05vdEZvdW5kYCAtIGB0b2tlbl9hZGRyZXNzYCBpcyBub3QgYSBsYXVuY2hlZCBEQU8gKHBlbmRpbmcgREFPcwp1c2UgYHVwZGF0ZV9wZW5kaW5nX3NsdWdgKQoqIGBTbHVnVW5jaGFuZ2VkYCAtIGBuZXdfc2x1Z2AgaXMgdGhlIERBTydzIGN1cnJlbnQgc2x1ZwoqIGBJbnZhbGlkU2x1Z2AgLyBgU2x1Z1Rha2VuYCAtIE1hbGZvcm1lZCBzbHVnLCBvciBjbGFpbWVkIGJ5IGEgbGF1bmNoZWQgREFPAAAAAAALY2hhbmdlX3NsdWcAAAAAAgAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAAAAAAACG5ld19zbHVnAAAAEAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAE1BY2NlcHQgYSBwZW5kaW5nIGFkbWluIGhhbmRvdmVyLiBSZXF1aXJlcyB0aGUgcHJvcG9zZWQgYWRtaW4ncyBhdXRob3JpemF0aW9uLgAAAAAAAAxhY2NlcHRfYWRtaW4AAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAGVNb2R1bGVzIG9mIGBraW5kYCBgY3JlYXRlX21vZHVsZWAgZGVwbG95ZWQgZm9yIGB0b2tlbmAgc28gZmFyOiB0aGUgYG5gCnRoZSBuZXh0IG9uZSBpcyBkZXBsb3llZCB3aXRoLgAAAAAAAAxtb2R1bGVfY291bnQAAAACAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABGtpbmQAAAARAAAAAQAAAAQ=", "AAAAAAAAAL1GcmVlIHRoZSBzbHVnIGEgZmFpbGVkIGRyaXZlIHJlc2VydmVkLiBBbnlvbmUgbWF5IGNhbGwgaXQuCgojIEVycm9ycwoKKiBgRGFvTm90Rm91bmRgIC8gYE5vQXNzdXJhbmNlYAoqIGBBc3N1cmFuY2VOb3RGYWlsZWRgIC0gdGhlIGRyaXZlIG1heSBzdGlsbCBsYXVuY2gKKiBgU2x1Z05vdEZvdW5kYCAtIGFscmVhZHkgcmVsZWFzZWQAAAAAAAAMcmVsZWFzZV9zbHVnAAAAAQAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAdhJbml0aWFsaXplIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IHdpdGggYW4gYWRtaW4uCgojIEFyZ3VtZW50cwoKKiBgYWRtaW5gIC0gVGhlIGFkZHJlc3MgdGhhdCB3aWxsIGNvbnRyb2wgaW1wbGVtZW50YXRpb24gbWFuYWdlbWVudCBhbmQgZmFjdG9yeSBzZXR0aW5ncwoqIGBjdXJyZW50X2hhc2hgIC0gQ3VycmVudCBNYW5hZ2VyIFdBU00gaGFzaCBmb3IgdXBncmFkZSB0cmFja2luZwoqIGB2ZXJzaW9uYCAtIEN1cnJlbnQgTWFuYWdlciB2ZXJzaW9uIChlLmcuLCAiMC4xLjAiKQpgdXBncmFkZV9kZWxheWA6IGxlZGdlcnMgYmV0d2VlbiBhbiBhcHByb3ZhbCBhbmQgdGhlIGVhcmxpZXN0CmB1cGdyYWRlX21hbmFnZXJgIChgY29tbW9uOjp1cGdyYWRlOjpSRUNPTU1FTkRFRF9VUEdSQURFX0RFTEFZYCBvbiBhCnB1YmxpYyBuZXR3b3JrOyBzaG9ydCBvbiB0ZXN0bmV0KS4gQ2hhbmdlYWJsZSB3aXRoIGBzZXRfdXBncmFkZV9kZWxheWAuAAAADV9fY29uc3RydWN0b3IAAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAADGN1cnJlbnRfaGFzaAAAA+4AAAAgAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAAAAAADXVwZ3JhZGVfZGVsYXkAAAAAAAAEAAAAAA==", "AAAAAAAABABEZXBsb3kgYSBtb2R1bGUgZm9yIGFuIGV4aXN0aW5nIERBTyBmcm9tIHRoZSBjdXJyZW50IGltcGxlbWVudGF0aW9uCm9mIGBzcGVjYCdzIGtpbmQgKGRvY3MvZGVzaWducy9tZW1iZXJzaGlwLW1vZGVscy5tZCDCpzIpLiBOZWVkcyB0aGUKYXV0aG9yaXphdGlvbiBvZiB0aGUgVG9rZW4ncyBhZG1pbjogdGhlIGxhdW5jaCBhZG1pbiBpbiBTZXR1cCwgdGhlClRyZWFzdXJ5IChieSBwcm9wb3NhbCkgb25jZSBMaXZlLgoKVGhlIG1vZHVsZSBsYW5kcyBhdCBgcHJlZGljdF9tb2R1bGVfYWRkcmVzcyh0b2tlbiwga2luZCwgbilgIHdpdGgKYG4gPSBtb2R1bGVfY291bnQodG9rZW4sIGtpbmQpYCwgYW5kIGBleHBlY3RlZF9uYCBtdXN0IGVxdWFsIHRoYXQgYG5gCihgU3RhbGVNb2R1bGVJbmRleGApLiBBIHByb3Bvc2FsIHJlYWRzIGBtb2R1bGVfY291bnRgIHdoaWxlIGRyYWZ0aW5nCmFuZCBiYWtlcyB0aGUgc2FtZSBgbmAgaW50byB0aGlzIGFjdGlvbiwgc28gaXQgZWl0aGVyIGRlcGxveXMgZXhhY3RseQp0aGUgbW9kdWxlIGl0cyBsYXRlciBhY3Rpb25zIHRhcmdldCBvciB0aGUgd2hvbGUgZXhlY3V0aW9uIHJldmVydHMuCgotICoqU2V0dXA6KiogdGhlIG1vZHVsZSBpcyByZWdpc3RlcmVkIG9uIHRoZSBUb2tlbiwgYW5kIGl0cyBwYXltZW50CmFzc2V0IHJlY29yZGVkIGZvciB0aGUgbGF1bmNoIGNoZWNrOyBgbGF1bmNoX2Rhb2AgbGF1bmNoZXMgaXQuCi0gKipMaXZlOioqIHRoZSBtb2R1bGUgaXMgbGF1bmNoZWQgYXQgb25jZSAoaXRzIGFkbWluIGlzIHRoZQpUcmVhc3VyeSk7IHRoZSBzYW1lIHByb3Bvc2FsIHRoZW4gcmVnaXN0ZXJzIGl0IG9uIHRoZSBUb2tlbiBhbmQKZ3JhbnRzIGl0cyBhbGxvd2FuY2UuIEEgbW9kdWxlIGNyZWF0ZWQgYWZ0ZXIgbGF1bmNoIGlzIG5vdCBvcGVuZWQ6CnRoZSBwcm9wb3NhbCBvcGVucyBpdCBvbmNlIGl0IGhvbGRzIGFuIGFsbG93YW5jZS4KCiMgRXJyb3JzCgoqIGBGYWN0b3J5UGF1c2VkYCAtIEZhY3RvcnkgaXMgcGF1c2VkCiogYERhb05vdEZvdW5kYCAtIGB0AAAADWNyZWF0ZV9tb2R1bGUAAAAAAAADAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABHNwZWMAAAfQAAAACk1vZHVsZVNwZWMAAAAAAAAAAAAKZXhwZWN0ZWRfbgAAAAAABAAAAAEAAAPpAAAAEwAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAADZUaGUgcGVuZGluZyBEQU8ncyBhc3N1cmFuY2UgZHJpdmUsIGlmIG9uZSBpcyByZWNvcmRlZC4AAAAAAA1nZXRfYXNzdXJhbmNlAAAAAAAAAQAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAD6AAAB9AAAAAJQXNzdXJhbmNlAAAA", "AAAAAAAAAFtQYXVzZSB0aGUgZmFjdG9yeSAoZW1lcmdlbmN5IG1lYXN1cmUpLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKAAAAAA1wYXVzZV9mYWN0b3J5AAAAAAAAAAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAJBQcm9wb3NlIGEgbmV3IGFkbWluLiBUaGUgaGFuZG92ZXIgY29tcGxldGVzIHdoZW4gYGFjY2VwdF9hZG1pbmAgaXMgY2FsbGVkLgoKT25seSBjYWxsYWJsZSBieSB0aGUgY3VycmVudCBhZG1pbi4gT3ZlcndyaXRlcyBhbnkgZWFybGllciBwcm9wb3NhbC4AAAANcHJvcG9zZV9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAADJUaGUgdXBncmFkZSBub3RpY2UgaW4gZm9yY2UgZm9yIGB1cGdyYWRlX21hbmFnZXJgLgAAAAAADXVwZ3JhZGVfZGVsYXkAAAAAAAAAAAAAAQAAAAQ=", "AAAAAAAAAPNUaGUgaGFzaCBhbm5vdW5jZWQgYXMgbGF0ZXN0IGZvciBgbmFtZWAgYW5kIHRoZSBsZWRnZXIgaXQgd2FzIGFubm91bmNlZAphdCAoRDQyKS4gVW5saWtlIGBnZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uYCwgYSByZXZva2VkIGhhc2ggaXMgc3RpbGwKcmV0dXJuZWQ6IHRoZSBwb2ludGVyIGlzIHdoYXQgdGhlIHBsYXRmb3JtJ3MgdXBncmFkZSBydWxlIGFuZCB0aGUgYXBwJ3MKcGVuZGluZy11cGdyYWRlIGRpc3BsYXkgcmVhZC4AAAAADmxhdGVzdF9wb2ludGVyAAAAAAABAAAAAAAAAARuYW1lAAAAEAAAAAEAAAPoAAAH0AAAAA1MYXRlc3RQb2ludGVyAAAA", "AAAAAAAABABPcGVuIGEgcGFpZCBjbGFpbSBkcml2ZSBiZWZvcmUgbGF1bmNoOiBtZW1iZXJzIGNsYWltIChhbmQgcGF5IGludG8gdGhlCkNsYWltTWludGVyJ3MgZXNjcm93KSB1bnRpbCBgdGhyZXNob2xkX2NsYWltZXJzYCBkaXN0aW5jdCBhZGRyZXNzZXMKaGF2ZSwgdGhlbiBhbnlvbmUgbWF5IGxhdW5jaCB0aGUgREFPIHdpdGggYGxhdW5jaF9jb25maWdgCihgbGF1bmNoX3doZW5fcmVhZHlgKS4gSWYgdGhlIGRlYWRsaW5lIHBhc3NlcyBmaXJzdCwgdGhlIGRyaXZlIGZhaWxzCmFuZCBtZW1iZXJzIGFyZSByZWZ1bmRlZC4gTmVlZHMgdGhlIGxhdW5jaCBhZG1pbidzIGF1dGhvcml6YXRpb24uCgpJbiBvbmUgY2FsbCBpdDoKMS4gb3BlbnMgdGhlIGxpc3Qgb24gdGhlIERBTydzIENsYWltTWludGVyLCBwcmljZWQgaW4gdGhlIGFzc2V0CnJlY29yZGVkIGF0IGl0cyBjcmVhdGlvbiwgYW5kIGdyYW50cyB0aGUgQ2xhaW1NaW50ZXIgYHRvdGFsYCBtaW50CmFsbG93YW5jZTsKMi4gcmVjb3JkcyB0aGUgZHJpdmUgKGxpc3QsIGRlYWRsaW5lLCBsYXVuY2ggY29uZmlnKSBhbmQgcmVzZXJ2ZXMgdGhlCkRBTydzIHNsdWcgKGBTbHVnQ2xhaW1lZGApLCBzbyBubyBvdGhlciBEQU8gY2FuIGxhdW5jaCB3aXRoIGl0OwozLiBoYW5kcyBldmVyeSBjb250cmFjdCdzIGFkbWluIHRvIHRoZSBUcmVhc3VyeSB3aXRob3V0IGdvaW5nIExpdmUsCndoaWNoIGZyZWV6ZXMgc2V0dGluZ3MsIGFydHdvcmssIG1pbnRzLCBhbGxvd2FuY2VzLCByZWdpc3RyYXRpb25zCmFuZCB1cGdyYWRlcyB1bnRpbCBsYXVuY2guIEZvdW5kZXJzIGFuZCBhcnR3b3JrIG11c3QgYmUgaW4gcGxhY2UKYmVmb3JlLgoKUmV0dXJucyB0aGUgbGlzdCBpZC4KCiMgRXJyb3JzCgoqIGBEYW9Ob3RGb3VuZGAgLyBgRmFjdG9yeVBhdXNlZGAgLyBgTGF1bmNoQWRtaW5Ob3RPd25lcmAKKiBgQXNzdXJhbmNlRXhpc3RzYCAtIG9uZSBkcml2ZSBwZXIgREFPCiogYE5vQ2xhaW1NaW50ZXJgIC0gdGhlIERBTyBoYXMgbm8gcmVnaXN0ZXJlZCBDbGFpbU1pbnRlcgoqIGBEAAAADm9wZW5fYXNzdXJhbmNlAAAAAAADAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAAAAAAEbGlzdAAAB9AAAAATQXNzdXJhbmNlTGlzdFBhcmFtcwAAAAAAAAAADWxhdW5jaF9jb25maWcAAAAAAAfQAAAADExhdW5jaENvbmZpZwAAAAEAAAPpAAAABAAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAblVcGdyYWRlIGEgZmFpbGVkIGRyaXZlJ3MgQ2xhaW1NaW50ZXIsIGZvciByZWZ1bmRzIGl0cyBjb2RlIGNhbm5vdCBwYXkKKHJldmlldyBCMikuIE9ubHkgdGhlIGxhdW5jaCBhZG1pbiByZWNvcmRlZCBpbiBQZW5kaW5nRGFvLCBvbmx5IG9uY2UKdGhlIGRyaXZlIGhhcyBmYWlsZWQgKHRoZSBNYW5hZ2VyJ3Mgb3duIHJ1bGU6IHRoZSBkZWFkbGluZSBwYXNzZWQgYW5kCnRoZSBUb2tlbiBpcyBub3QgTGl2ZTsgQ2xhaW1NaW50ZXIncyBzdGF0ZSBtYWNoaW5lIGlzIG5ldmVyIGFza2VkKSwgYW5kCm9ubHkgdG8gYSBoYXNoIHRoZSByZWdpc3RyeSBhcHByb3ZlcyBmb3IgdGhlIHJ1bm5pbmcgQ2xhaW1NaW50ZXIuCgojIEVycm9ycwoKKiBgRGFvTm90Rm91bmRgIC8gYE5vQXNzdXJhbmNlYAoqIGBBc3N1cmFuY2VOb3RGYWlsZWRgIC0gdGhlIGRyaXZlIG1heSBzdGlsbCBsYXVuY2gAAAAAAAAOcmVjb3Zlcl9jbGFpbXMAAAAAAAMAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAclBcHByb3ZlIGFuIHVwZ3JhZGUgcGF0aCBmcm9tIG9uZSBpbXBsZW1lbnRhdGlvbiB0byBhbm90aGVyLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBFcnJvcnMKCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gT25lIG9yIGJvdGggaW1wbGVtZW50YXRpb25zIGRvbid0IGV4aXN0CiogYEludmFsaWRVcGdyYWRlUGF0aGAgLSBUYXJnZXQgaXMgcmV2b2tlZCwgb3IgdGhlIG5hbWVzIGRpZmZlcgoKQSByZXZva2VkIFNPVVJDRSBpcyBhbGxvd2VkIG9uIHB1cnBvc2U6IGFmdGVyIHJldm9raW5nIGEgdnVsbmVyYWJsZQpoYXNoIHRoZSBhZG1pbiBtdXN0IHN0aWxsIGJlIGFibGUgdG8gYXBwcm92ZSBhIG1pZ3JhdGlvbiBvZmYgaXQuAAAAAAAAD2FwcHJvdmVfdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAIpUb2tlbiBhZGRyZXNzIG9mIHRoZSBsYXVuY2hlZCBEQU8gdGhhdCBjbGFpbWVkIGBzbHVnYC4KClBsYWluIHJlYWQ6IGRvZXMgbm90IGV4dGVuZCBUVEwgKHRoZSBEQU8ncyBzdG9yYWdlIHN3ZWVwIHJlbmV3cyB0aGUgc2x1ZyBlbnRyaWVzKS4AAAAAAA9nZXRfZGFvX2J5X3NsdWcAAAAAAQAAAAAAAAAEc2x1ZwAAABAAAAABAAAD6QAAABMAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAAAAAAAPZ2V0X3BlbmRpbmdfZGFvAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAAClBlbmRpbmdEYW8AAA==", "AAAAAAAAAElVbnBhdXNlIHRoZSBmYWN0b3J5LgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKAAAAAAAAD3VucGF1c2VfZmFjdG9yeQAAAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAXpVcGdyYWRlIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IGl0c2VsZi4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGBmcm9tX2hhc2hgIC0gQ3VycmVudCBNYW5hZ2VyIFdBU00gaGFzaCAobXVzdCBtYXRjaCBzdG9yZWQgaGFzaCkKKiBgdG9faGFzaGAgLSBUYXJnZXQgTWFuYWdlciBXQVNNIGhhc2ggKG11c3QgYmUgcmVnaXN0ZXJlZCBhbmQgYWN0aXZlKQoKIyBFcnJvcnMKCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gVGFyZ2V0IGltcGxlbWVudGF0aW9uIGRvZXNuJ3QgZXhpc3Qgb3IgaXMgcmV2b2tlZAoqIGBJbnZhbGlkVmVyc2lvbmAgLSBmcm9tX2hhc2ggZG9lc24ndCBtYXRjaCBjdXJyZW50IGhhc2gAAAAAAA91cGdyYWRlX21hbmFnZXIAAAAAAgAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAACpQZW5kaW5nIGFkbWluIGF3YWl0aW5nIGFjY2VwdGFuY2UsIGlmIGFueS4AAAAAABFnZXRfcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAATRMYXVuY2ggYSBEQU8gd2hvc2UgYXNzdXJhbmNlIGxpc3QgaGFzIG1ldCBpdHMgdGhyZXNob2xkLCB3aXRoIHRoZQpzdG9yZWQgbGF1bmNoIGNvbmZpZy4gQW55b25lIG1heSBjYWxsIGl0OyBubyBhdXRob3JpemF0aW9uLgoKIyBFcnJvcnMKCiogYERhb05vdEZvdW5kYCAvIGBOb0Fzc3VyYW5jZWAKKiBgQXNzdXJhbmNlRmFpbGVkYCAtIHRoZSBkZWFkbGluZSBwYXNzZWQgZmlyc3QKKiBgQXNzdXJhbmNlTm90TWV0YCAtIGZld2VyIGRpc3RpbmN0IGNsYWltZXJzIHRoYW4gdGhlIHRocmVzaG9sZAoqIGV2ZXJ5IGBsYXVuY2hfZGFvYCBjaGVjawAAABFsYXVuY2hfd2hlbl9yZWFkeQAAAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAOJQcmVkaWN0IERBTyBhZGRyZXNzZXMgd2l0aG91dCBkZXBsb3lpbmcuCgpVc2VmdWwgZm9yIGZyb250ZW5kcyB0byBzaG93IGFkZHJlc3NlcyBiZWZvcmUgdXNlciBjb25maXJtcyBkZXBsb3ltZW50LgpFdmVyeSBtb2R1bGUga2luZCBgY3JlYXRlX2Rhb2AgY2FuIGRlcGxveSBpcyBwcmVkaWN0ZWQ7IGEgREFPIGNyZWF0ZWQKd2l0aG91dCBvbmUgc2ltcGx5IG5ldmVyIHVzZXMgaXRzIGFkZHJlc3MuAAAAAAARcHJlZGljdF9hZGRyZXNzZXMAAAAAAAACAAAAAAAAAAdjcmVhdG9yAAAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAEAAAPpAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAIZDaGFuZ2UgdGhlIE1hbmFnZXIncyB1cGdyYWRlIG5vdGljZSAoYWRtaW4pLiBBIGxvbmdlciBub3RpY2UgYXBwbGllcwphdCBvbmNlOyBhIHNob3J0ZXIgb25lIG9ubHkgYWZ0ZXIgdGhlIG5vdGljZSBpbiBmb3JjZSBoYXMgcGFzc2VkLgAAAAAAEXNldF91cGdyYWRlX2RlbGF5AAAAAAAAAQAAAAAAAAAHbGVkZ2VycwAAAAAEAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAJFHZXQgaW1wbGVtZW50YXRpb24gYnkgV0FTTSBoYXNoLgoKIyBBcmd1bWVudHMKCiogYHdhc21faGFzaGAgLSBXQVNNIGhhc2ggdG8gcXVlcnkKCiMgUmV0dXJucwoKVGhlIGltcGxlbWVudGF0aW9uIHZlcnNpb24sIG9yIGBOb25lYCBpZiBub3QgZm91bmQuAAAAAAAAEmdldF9pbXBsZW1lbnRhdGlvbgAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAARFDaGVjayBpZiBhbiB1cGdyYWRlIGlzIGFwcHJvdmVkLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBSZXR1cm5zCgpgdHJ1ZWAgaWYgdGhlIHBhdGggaXMgYXBwcm92ZWQsIGJvdGggaGFzaGVzIGFyZSByZWdpc3RlcmVkIHVuZGVyIHRoZQpzYW1lIG5hbWUgYW5kIHRoZSBUQVJHRVQgaXMgbm90IHJldm9rZWQuIEEgcmV2b2tlZCBzb3VyY2UgbWF5IHN0aWxsCm1pZ3JhdGUgYXdheS4AAAAAAAATaXNfdXBncmFkZV9hcHByb3ZlZAAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAAB", "AAAAAAAAAQRDaGFuZ2UgdGhlIHJlcXVlc3RlZCBzbHVnIG9mIGEgcGVuZGluZyBEQU8gKGxhdW5jaCBhZG1pbiBvbmx5KSwgZm9yCmV4YW1wbGUgYWZ0ZXIgYGxhdW5jaF9kYW9gIGZhaWxlZCB3aXRoIGBTbHVnVGFrZW5gLgoKIyBFcnJvcnMKCiogYERhb05vdEZvdW5kYCAtIE5vIHBlbmRpbmcgREFPIGZvciBgdG9rZW5fYWRkcmVzc2AKKiBgSW52YWxpZFNsdWdgIC8gYFNsdWdUYWtlbmAgLSBNYWxmb3JtZWQgc2x1Zywgb3IgY2xhaW1lZCBieSBhIGxhdW5jaGVkIERBTwAAABN1cGRhdGVfcGVuZGluZ19zbHVnAAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAARzbHVnAAAAEAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAC1DYW5jZWwgYSBwZW5kaW5nIGFkbWluIGhhbmRvdmVyIChhZG1pbiBvbmx5KS4AAAAAAAAUY2FuY2VsX3BlbmRpbmdfYWRtaW4AAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAARBSZXZva2UgYW4gaW1wbGVtZW50YXRpb24gKGVtZXJnZW5jeSBtZWFzdXJlKS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB3YXNtX2hhc2hgIC0gV0FTTSBoYXNoIHRvIHJldm9rZQoKIyBFcnJvcnMKCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gSW1wbGVtZW50YXRpb24gZG9lc24ndCBleGlzdAoqIGBJbXBsZW1lbnRhdGlvbkFscmVhZHlSZXZva2VkYCAtIEltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAABVyZXZva2VfaW1wbGVtZW50YXRpb24AAAAAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAGpXaGVyZSBgY3JlYXRlX21vZHVsZSh0b2tlbiwgPGtpbmQ+LCBuKWAgZGVwbG95cy4gQSBwdXJlIGZ1bmN0aW9uIG9mCml0cyBpbnB1dHMgYW5kIHRoaXMgTWFuYWdlcidzIGFkZHJlc3MuAAAAAAAWcHJlZGljdF9tb2R1bGVfYWRkcmVzcwAAAAAAAwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAARraW5kAAAAEQAAAAAAAAABbgAAAAAAAAQAAAABAAAAEw==", "AAAAAAAAARlUaGUgaGFzaGVzIGBjcmVhdGVfZGFvYCBhbmQgYGNyZWF0ZV9tb2R1bGVgIGRlcGxveSBmcm9tLCBvciBgTm9uZWAKYmVmb3JlIGBzZXRfY3VycmVudF9pbXBsZW1lbnRhdGlvbnNgLiBSYXcgdmFsdWVzOiBhIGhhc2ggcmV2b2tlZCBzaW5jZQppdCB3YXMgc2V0IGlzIHN0aWxsIHJldHVybmVkIChEQU9zIGNyZWF0ZWQgZnJvbSBpdCBzdGlsbCBydW4gaXQpLCB3aGljaAppcyB3aGF0IHBsYXRmb3JtIGNvZGUgcmVuZXdhbCBuZWVkcy4gYGNyZWF0ZV9kYW9gIGl0c2VsZiByZWNoZWNrcyBlYWNoLgAAAAAAABdjdXJyZW50X2ltcGxlbWVudGF0aW9ucwAAAAAAAAAAAQAAA+gAAAfQAAAAFkN1cnJlbnRJbXBsZW1lbnRhdGlvbnMAAA==", "AAAAAAAAArNSZWdpc3RlciBhIG5ldyBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYG5hbWVgIC0gSW1wbGVtZW50YXRpb24gbmFtZSAoZS5nLiwgIlRva2VuIiwgIkdvdmVybm9yIikKKiBgdmVyc2lvbmAgLSBWZXJzaW9uIHN0cmluZyAoZS5nLiwgIjAuMS4wIikKKiBgd2FzbV9oYXNoYCAtIFdBU00gYnl0ZWNvZGUgaGFzaAoKIyBFcnJvcnMKCiogYEludmFsaWRJbXBsZW1lbnRhdGlvbk5hbWVgIC0gTmFtZSBpcyBlbXB0eSBvciB0b28gbG9uZwoqIGBJbnZhbGlkVmVyc2lvbmAgLSBWZXJzaW9uIGlzIGVtcHR5IG9yIHRvbyBsb25nCiogYEltcGxlbWVudGF0aW9uQWxyZWFkeVJlZ2lzdGVyZWRgIC0gQSByZWNvcmQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgaGFzaAoocmVjb3JkcyBhcmUgaW1tdXRhYmxlOiBubyByZW5hbWluZywgcmUtdmVyc2lvbmluZyBvciB1bi1yZXZva2luZykKClJlZ2lzdHJhdGlvbiBkb2VzIG5vdCBjaGFuZ2UgdGhlICJsYXRlc3QiIGltcGxlbWVudGF0aW9uIGZvciBgbmFtZWA7CnRoZSBhZG1pbiBzZWxlY3RzIGl0IGV4cGxpY2l0bHkgd2l0aCBgc2V0X2xhdGVzdF9pbXBsZW1lbnRhdGlvbmAsIHNvCnJlZ2lzdGVyaW5nIGFuIG9sZGVyIChwYXRjaCkgcmVsZWFzZSBuZXZlciByZWdyZXNzZXMgaXQuAAAAABdyZWdpc3Rlcl9pbXBsZW1lbnRhdGlvbgAAAAADAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAHhMZWRnZXIgYXQgd2hpY2ggYGFwcHJvdmVfdXBncmFkZShmcm9tLCB0bylgIHdhcyByZWNvcmRlZCwgaWYgaXQgd2FzLgpgdXBncmFkZV9tYW5hZ2VyYCB3YWl0cyBgdXBncmFkZV9kZWxheSgpYCBhZnRlciBpdC4AAAAXdXBncmFkZV9hcHByb3ZlZF9sZWRnZXIAAAAAAgAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAD6AAAAAY=", "AAAAAAAAAKRHZXQgbGF0ZXN0IHZlcnNpb24gb2YgYW4gaW1wbGVtZW50YXRpb24gYnkgbmFtZS4KCiMgQXJndW1lbnRzCgoqIGBuYW1lYCAtIEltcGxlbWVudGF0aW9uIG5hbWUKCiMgUmV0dXJucwoKVGhlIGxhdGVzdCBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLCBvciBgTm9uZWAgaWYgbm90IGZvdW5kLgAAABlnZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAEbmFtZQAAABAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAANpTZWxlY3QgdGhlIGxhdGVzdCBpbXBsZW1lbnRhdGlvbiBmb3IgYG5hbWVgIChhZG1pbiBvbmx5KS4KCiMgRXJyb3JzCgoqIGBJbXBsZW1lbnRhdGlvbk5vdEZvdW5kYCAtIGB3YXNtX2hhc2hgIGlzIG5vdCByZWdpc3RlcmVkIG9yIGlzIHJldm9rZWQKKiBgSW52YWxpZEltcGxlbWVudGF0aW9uTmFtZWAgLSBgd2FzbV9oYXNoYCBpcyByZWdpc3RlcmVkIHVuZGVyIGFub3RoZXIgbmFtZQAAAAAAGXNldF9sYXRlc3RfaW1wbGVtZW50YXRpb24AAAAAAAACAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAARdSZXR1cm5zIHRoZSByZWdpc3RlcmVkIHJlbGVhc2UgdmVyc2lvbiBmb3IgYSBXQVNNIGhhc2gsIGluY2x1ZGluZwpyZXZva2VkIGhhc2hlcyAoYSBtb2R1bGUgc3RpbGwgcnVubmluZyBhIHJldm9rZWQgaGFzaCBrZWVwcyBhbnN3ZXJpbmcKYHZlcnNpb24oKWAsIHdoaWNoIHJlYWRzIHRoaXMpLiBDYWxsZXJzIHRoYXQgbXVzdCByZWplY3QgcmV2b2tlZCB0YXJnZXRzIHJlbHkgb24KYGlzX3VwZ3JhZGVfYXBwcm92ZWRgLCB3aGljaCBjaGVja3MgdGhlIHRhcmdldCBpcyBub3QgcmV2b2tlZC4AAAAAGmdldF9pbXBsZW1lbnRhdGlvbl92ZXJzaW9uAAAAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPoAAAAEA==", "AAAAAAAAAbtTZXQgdGhlIGN1cnJlbnQgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoZXMgdXNlZCBieSB0aGUgZmFjdG9yeSBhbmQgYnkKYGNyZWF0ZV9tb2R1bGVgIChhZG1pbiBvbmx5KS4gRWFjaCBoYXNoIG11c3QgYmUgcmVnaXN0ZXJlZCwgbm90CnJldm9rZWQsIGFuZCByZWdpc3RlcmVkIHVuZGVyIGl0cyBzbG90J3MgbmFtZSAoYFRva2VuYCwgYE1ldGFkYXRhYCwKYEF1Y3Rpb25gLCBgR292ZXJub3JgLCBgVHJlYXN1cnlgLCBgTWFya2V0cGxhY2VgLCBgQ2xhaW1NaW50ZXJgKS4KCiMgRXJyb3JzCgoqIGBJbXBsZW1lbnRhdGlvbk5vdEZvdW5kYCAtIE9uZSBvciBtb3JlIGltcGxlbWVudGF0aW9ucyBkb24ndCBleGlzdCBvciBhcmUgcmV2b2tlZAoqIGBJbnZhbGlkSW1wbGVtZW50YXRpb25OYW1lYCAtIEEgaGFzaCBpcyByZWdpc3RlcmVkIHVuZGVyIHRoZSB3cm9uZyBtb2R1bGUgbmFtZQAAAAAbc2V0X2N1cnJlbnRfaW1wbGVtZW50YXRpb25zAAAAAAEAAAAAAAAAB2N1cnJlbnQAAAAH0AAAABZDdXJyZW50SW1wbGVtZW50YXRpb25zAAAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAAAQAAABNPbmUgcmVnaXN0cnkgZW50cnkuAAAAAAAAAAALTW9kdWxlRW50cnkAAAAAAwAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAARraW5kAAAAEQAAAEhUb2tlbnMgdGhpcyBtb2R1bGUgaG9sZHMgY2Fycnkgbm8gdm90ZXMgKGN1c3RvZHk6IEF1Y3Rpb24sIE1hcmtldHBsYWNlKS4AAAAKbm9uX3ZvdGluZwAAAAAAAQ==", "AAAAAQAAAN1BIERBTydzIG1lbWJlcnNoaXAgdG9rZW4gc3dpdGNoZXMgKGRvY3MvZGVzaWducy9sb2NrZWQtdG9rZW5zLm1kKSwgY2hvc2VuCmF0IGBjcmVhdGVfZGFvYCBhbmQgY2hhbmdlYWJsZSBieSB0aGUgVG9rZW4ncyBhZG1pbjogdGhlIGxhdW5jaCBhZG1pbiBpbgpTZXR1cCwgdGhlIFRyZWFzdXJ5IGJ5IHByb3Bvc2FsIG9uY2UgTGl2ZS4gQWxsIG9mZiByZXByb2R1Y2VzIGFuIG9wZW4gREFPLgAAAAAAAAAAAAANVG9rZW5TZXR0aW5ncwAAAAAAAAMAAABGVGhlIFRyZWFzdXJ5IG1heSBtb3ZlIGFueSBtZW1iZXIncyB0b2tlbiBieSBwcm9wb3NhbCAoYGRhb190cmFuc2ZlcmApLgAAAAAADGRhb19yZWNvdmVyeQAAAAEAAABASG9sZGVycyBkZWxlZ2F0ZSBvbmx5IHRvIHRoZW1zZWx2ZXMgb3IgdG8gYW5vdGhlciB2b3RpbmcgbWVtYmVyLgAAABdtZW1iZXJzX29ubHlfZGVsZWdhdGlvbgAAAAABAAAAQFRva2VucyBtb3ZlIG9ubHkgYWxvbmcgREFPLWNvbnRyb2xsZWQgcGF0aHMgKGBUcmFuc2ZlcnNMb2NrZWRgKS4AAAAQdHJhbnNmZXJzX2xvY2tlZAAAAAE=", "AAAAAQAAAX1XaGF0IHRoZSBNYW5hZ2VyJ3MgYExhdGVzdEltcGxlbWVudGF0aW9uKG5hbWUpYCBob2xkczogdGhlIGhhc2ggYW5ub3VuY2VkCmFzIGxhdGVzdCBhbmQgdGhlIGxlZGdlciBpdCB3YXMgYW5ub3VuY2VkIGF0LiBBIHBsYXRmb3JtIGNvbnRyYWN0ICh0aGUKTWFuYWdlciBpdHNlbGYsIHRoZSBzaGFyZWQgTWludGVyKSB1cGdyYWRlcyBvbmx5IHRvIHRoaXMgaGFzaCwgYW5kIGl0cwpub3RpY2UgY291bnRzIGZyb20gdGhlIGxhdGVyIG9mIHRoZSBhcHByb3ZhbCBhbmQgdGhpcyBhbm5vdW5jZW1lbnQsIHNvCmV2ZXJ5IHBvc3NpYmxlIHBsYXRmb3JtIHVwZ3JhZGUgaXMgdmlzaWJsZSBhcyAicnVubmluZyDihpIgbGF0ZXN0IiBmb3IgdGhlCndob2xlIG5vdGljZSAoRDQyKS4AAAAAAAAAAAAADUxhdGVzdFBvaW50ZXIAAAAAAAACAAAAAAAAAApzZXRfbGVkZ2VyAAAAAAAGAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIA==", "AAAABQAAAOlFbWl0dGVkIGJ5IGBzZXRfZGVsYXlgIChNYW5hZ2VyIGFuZCBzaGFyZWQgTWludGVyIG9ubHkpLiBBIHNob3J0ZXIgbm90aWNlCmlzIGluIGZvcmNlIGZyb20gYGVmZmVjdGl2ZV9sZWRnZXJgOyBhIGxvbmdlciBvbmUgYXQgb25jZS4gVGhpcyBpcyB0aGUKY2hhbmdlIGEgbWVtYmVyIHdhbnRzIHRvbGQgYWJvdXQ6IGl0IHNob3J0ZW5zIHRoZSB3aW5kb3cgdG8gcmVhY3QgdG8gYQpwbGF0Zm9ybSB1cGdyYWRlLgAAAAAAAAAAAAATVXBncmFkZURlbGF5Q2hhbmdlZAAAAAABAAAAFXVwZ3JhZGVfZGVsYXlfY2hhbmdlZAAAAAAAAAMAAAAAAAAADGZyb21fbGVkZ2VycwAAAAQAAAAAAAAAAAAAAAp0b19sZWRnZXJzAAAAAAAEAAAAAAAAAAAAAAAQZWZmZWN0aXZlX2xlZGdlcgAAAAQAAAAAAAAAAg=="]),
      options
    );
  }

   static deploy<T = Client>({ admin, current_hash, version, upgrade_delay }: { admin: string | Address; current_hash: Uint8Array; version: string; upgrade_delay: number }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, current_hash, version, upgrade_delay }, options);
  }
  public readonly fromJson = {
    version : this.txFromJson<string>,  get_slug : this.txFromJson<string | null>,  get_admin : this.txFromJson<string | null>,  wasm_hash : this.txFromJson<Uint8Array>,  create_dao : this.txFromJson<Result<DaoAddresses, ManagerError>>,  launch_dao : this.txFromJson<Result<null, ManagerError>>,  change_slug : this.txFromJson<Result<null, ManagerError>>,  accept_admin : this.txFromJson<Result<null, ManagerError>>,  module_count : this.txFromJson<number>,  release_slug : this.txFromJson<Result<null, ManagerError>>,  create_module : this.txFromJson<Result<string, ManagerError>>,  get_assurance : this.txFromJson<Assurance | null>,  pause_factory : this.txFromJson<Result<null, ManagerError>>,  propose_admin : this.txFromJson<Result<null, ManagerError>>,  upgrade_delay : this.txFromJson<number>,  latest_pointer : this.txFromJson<LatestPointer | null>,  open_assurance : this.txFromJson<Result<number, ManagerError>>,  recover_claims : this.txFromJson<Result<null, ManagerError>>,  approve_upgrade : this.txFromJson<Result<null, ManagerError>>,  get_dao_by_slug : this.txFromJson<Result<string, ManagerError>>,  get_pending_dao : this.txFromJson<PendingDao | null>,  unpause_factory : this.txFromJson<Result<null, ManagerError>>,  upgrade_manager : this.txFromJson<Result<null, ManagerError>>,  get_pending_admin : this.txFromJson<string | null>,  launch_when_ready : this.txFromJson<Result<null, ManagerError>>,  predict_addresses : this.txFromJson<Result<DaoAddresses, ManagerError>>,  set_upgrade_delay : this.txFromJson<Result<null, ManagerError>>,  get_implementation : this.txFromJson<ImplementationVersion | null>,  is_upgrade_approved : this.txFromJson<boolean>,  update_pending_slug : this.txFromJson<Result<null, ManagerError>>,  cancel_pending_admin : this.txFromJson<Result<null, ManagerError>>,  revoke_implementation : this.txFromJson<Result<null, ManagerError>>,  predict_module_address : this.txFromJson<string>,  current_implementations : this.txFromJson<CurrentImplementations | null>,  register_implementation : this.txFromJson<Result<null, ManagerError>>,  upgrade_approved_ledger : this.txFromJson<bigint | null>,  get_latest_implementation : this.txFromJson<ImplementationVersion | null>,  set_latest_implementation : this.txFromJson<Result<null, ManagerError>>,  get_implementation_version : this.txFromJson<string | null>,  set_current_implementations : this.txFromJson<Result<null, ManagerError>>
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
   * Build a topics filter row for the "UpgradeDelayChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  upgradeDelayChangedEventFilter(): string[] {
    return this.spec.eventTopicFilter("UpgradeDelayChanged");
  }
}