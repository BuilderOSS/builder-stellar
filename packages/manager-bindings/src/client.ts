import {DaoCreationParams, DaoAddresses, ManagerError, LaunchConfig, PendingDao, ImplementationVersion, ContractEvent} from './types.js';
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
   * Create a new DAO with all 6 modules atomically deployed.
   *
   * This deploys all six modules with safe defaults. The launch administrator
   * owns the setup window and may configure the modules before `launch_dao`.
   *
   * # Arguments
   *
   * * `params` - Deployer, deterministic nonce, and launch administrator
   *
   * # Authorization
   *
   * Requires BOTH `params.deployer` and `params.launch_admin` to authorize
   * the call (one signature if they are the same address). Module
   * constructors do not require auth.
   *
   * # Returns
   *
   * All deployed contract addresses
   *
   * The requested slug is validated and must not belong to a launched DAO,
   * but it is only claimed at `launch_dao` (pending DAOs hold no slug, so an
   * abandoned creation blocks nothing).
   *
   * # Errors
   *
   * * `FactoryPaused` - Factory is paused
   * * `CurrentImplementationsNotSet` - Current WASM hashes not configured
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
   * # Arguments
   *
   * * `token_address` - Address of the DAO's token contract
   * * `launch_config` - Configuration for what to enable at launch
   * - `launch_auction` - Whether to unpause the auction
   * - `launch_marketplace` - Whether to unpause the marketplace
   * - `enable_minter` - Whether to grant mint authority to the registered PlatformMinter
   * - `expected_minter` - Required when `enable_minter` is set; must equal the registered
   * PlatformMinter (`PlatformMinterMismatch` otherwise, including when `None`)
   *
   * # Validation
   *
   * - The factory must not be paused (`FactoryPaused`)
   * - Token voting supply must be > 0 (at least one token minted to a holder
   * other than the Treasury, Auction or Marketplace)
   * - launch_admin must be the current token admin (`LaunchAdminNotOwner`)
   * - The requested slug must still be unclaimed (`SlugTaken`; change it with
   * `update_pending_slug`)
   * - Every module's CURRENT `wasm_hash()` must be registered and not revoked
   * (`Pen
   */
  launch_dao({ token_address, launch_config }: { token_address: string | Address; launch_config: LaunchConfig }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Accept a pending admin handover. Requires the proposed admin's authorization.
   */
  accept_admin(options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Permissionless TTL renewal for a DAO's slug registry entries.
   *
   * Anyone (DAO operators, the platform admin) can pay to keep a slug live.
   * The network clamps `extend_to` to its max entry TTL (~180 days), so call
   * this periodically. Archived entries must be restored first.
   *
   * # Errors
   *
   * * `SlugNotFound` - no DAO is registered under this slug
   */
  bump_slug_ttl({ slug }: { slug: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
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
   * Plain read: does not extend TTL (renewal is explicit via `bump_slug_ttl`).
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
   * Predict DAO addresses without deploying.
   *
   * Useful for frontends to show addresses before user confirms deployment.
   *
   * # Arguments
   *
   * * `creator` - Creator address
   * * `nonce` - Nonce value
   *
   * # Returns
   *
   * Predicted addresses for all 6 modules
   */
  predict_addresses({ creator, nonce }: { creator: string | Address; nonce: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<DaoAddresses, ManagerError>>>;
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
   * The registered platform minter, if any.
   */
  get_platform_minter(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
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
   * Register the platform minter granted mint authority at launch (admin only).
   */
  set_platform_minter({ minter }: { minter: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
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
   * revoked hashes (a module still running a revoked hash must be able to
   * `sync_version`). Callers that must reject revoked targets rely on
   * `is_upgrade_approved`, which checks the target is not revoked.
   */
  get_implementation_version({ wasm_hash }: { wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Set the current implementation WASM hashes used by the factory.
   *
   * # Authorization
   *
   * Only callable by admin.
   *
   * # Arguments
   *
   * * `token` - Token implementation WASM hash
   * * `metadata` - Metadata implementation WASM hash
   * * `auction` - Auction implementation WASM hash
   * * `governor` - Governor implementation WASM hash
   * * `treasury` - Treasury implementation WASM hash
   * * `marketplace` - Marketplace implementation WASM hash
   *
   * # Errors
   *
   * * `ImplementationNotFound` - One or more implementations don't exist or are revoked
   * * `InvalidImplementationName` - A hash is registered under the wrong module name
   */
  set_current_implementations({ token, metadata, auction, governor, treasury, marketplace }: { token: Uint8Array; metadata: Uint8Array; auction: Uint8Array; governor: Uint8Array; treasury: Uint8Array; marketplace: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAADdNYW5hZ2VyIGVycm9ycyAoYmxvY2sgYGNvbW1vbjo6ZXJyb3I6OmNvZGVzOjpNQU5BR0VSYCkuAAAAAAAAAAAMTWFuYWdlckVycm9yAAAAHAAAADdJbXBsZW1lbnRhdGlvbiBuYW1lIGlzIHdyb25nIGZvciB0aGUgc2xvdCBpdCBpcyB1c2VkIGluAAAAABlJbnZhbGlkSW1wbGVtZW50YXRpb25OYW1lAAAAAAAbvQAAAERNYW5hZ2VyIGhhc2gvdmVyc2lvbiBtaXNzaW5nLCBvciBgZnJvbV9oYXNoYCBpcyBub3QgdGhlIGN1cnJlbnQgaGFzaAAAAA5JbnZhbGlkVmVyc2lvbgAAAAAbvgAAAEpJbXBsZW1lbnRhdGlvbiBub3QgcmVnaXN0ZXJlZCAob3IgcmV2b2tlZCB3aGVyZSBhbiBhY3RpdmUgb25lIGlzIHJlcXVpcmVkKQAAAAAAFkltcGxlbWVudGF0aW9uTm90Rm91bmQAAAAAG78AAAAeSW1wbGVtZW50YXRpb24gYWxyZWFkeSByZXZva2VkAAAAAAAcSW1wbGVtZW50YXRpb25BbHJlYWR5UmV2b2tlZAAAG8AAAABBVXBncmFkZSB0YXJnZXQgcmV2b2tlZCwgbmFtZXMgZGlmZmVyLCBvciB0aGUgcGF0aCBpcyBub3QgYXBwcm92ZWQAAAAAAAASSW52YWxpZFVwZ3JhZGVQYXRoAAAAABvBAAAADUFkbWluIG5vdCBzZXQAAAAAAAALQWRtaW5Ob3RTZXQAAAAbwgAAABxObyBhZG1pbiBoYW5kb3ZlciBpcyBwZW5kaW5nAAAADk5vUGVuZGluZ0FkbWluAAAAABvDAAAAHlBsYXRmb3JtIG1pbnRlciBub3QgY29uZmlndXJlZAAAAAAAFFBsYXRmb3JtTWludGVyTm90U2V0AAAbxAAAADpBbiBpbXBsZW1lbnRhdGlvbiBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQgZm9yIHRoaXMgV0FTTSBoYXNoAAAAAAAfSW1wbGVtZW50YXRpb25BbHJlYWR5UmVnaXN0ZXJlZAAAABvFAAAAUmBlbmFibGVfbWludGVyYCByZXF1aXJlcyBgZXhwZWN0ZWRfbWludGVyYCB0byBlcXVhbCB0aGUgcmVnaXN0ZXJlZCBwbGF0Zm9ybSBtaW50ZXIAAAAAABZQbGF0Zm9ybU1pbnRlck1pc21hdGNoAAAAABvGAAAAM0ZhY3RvcnkgaXMgcGF1c2VkIChubyBgY3JlYXRlX2Rhb2Agb3IgYGxhdW5jaF9kYW9gKQAAAAANRmFjdG9yeVBhdXNlZAAAAAAAG8cAAAA3QXVjdGlvbiByZXNlcnZlIHByaWNlIGJlbG93IGBjb21tb246Ok1JTl9SRVNFUlZFX1BSSUNFYAAAAAASSW52YWxpZFBhcmFtQm91bmRzAAAAABvIAAAAJVF1b3J1bSBiYXNpcyBwb2ludHMgb3V0c2lkZSAxLi49MTAwMDAAAAAAAAAQSW52YWxpZFF1b3J1bUJwcwAAG8kAAAAuQXVjdGlvbiBkdXJhdGlvbiBvdXRzaWRlIDUgbWludXRlcyAuLj0gMzAgZGF5cwAAAAAAD0ludmFsaWREdXJhdGlvbgAAABvKAAAALUF1Y3Rpb24gdGltZSBidWZmZXIgb3V0c2lkZSAxLi49ODY0MDAgc2Vjb25kcwAAAAAAABFJbnZhbGlkVGltZUJ1ZmZlcgAAAAAAG8sAAAAuU3RyaW5nIGxvbmdlciB0aGFuIGBjb21tb246Ok1BWF9TVFJJTkdfTEVOR1RIYAAAAAAADVN0cmluZ1Rvb0xvbmcAAAAAABvMAAAADFN0cmluZyBlbXB0eQAAAAtTdHJpbmdFbXB0eQAAABvNAAAAjkdvdmVybmFuY2UgdGltaW5nIG91dCBvZiByYW5nZTogZWFjaCBvZiB2b3RpbmcgZGVsYXksIHZvdGluZyBwZXJpb2QgYW5kCnF1ZXVlIGRlbGF5IG11c3QgYmUgd2l0aGluIDMwMCBzZWNvbmRzIC4uPSAzMCBkYXlzICgyXzU5Ml8wMDAgc2Vjb25kcykAAAAAABdJbnZhbGlkR292ZXJuYW5jZVRpbWluZwAAABvOAAAAJVByb3Bvc2FsIHRocmVzaG9sZCBtdXN0IGJlIGF0IGxlYXN0IDEAAAAAAAAYSW52YWxpZFByb3Bvc2FsVGhyZXNob2xkAAAbzwAAAIFObyB2b3RpbmctY2FwYWJsZSB0b2tlbiBleGlzdHM7IG1pbnQgYXQgbGVhc3Qgb25lIHRva2VuIHRvIGEgaG9sZGVyCm90aGVyIHRoYW4gdGhlIFRyZWFzdXJ5LCBBdWN0aW9uIG9yIE1hcmtldHBsYWNlIGJlZm9yZSBsYXVuY2gAAAAAAAAQTGF1bmNoU3VwcGx5WmVybwAAG9AAAACeQSBtb2R1bGUgb2YgdGhlIHBlbmRpbmcgREFPIGN1cnJlbnRseSBydW5zIGEgcmV2b2tlZCBvciB1bnJlZ2lzdGVyZWQKV0FTTSBoYXNoOyB1cGdyYWRlIGl0IChhZG1pbiBgdXBncmFkZWAgdG8gYW4gYXBwcm92ZWQsIG5vbi1yZXZva2VkIGhhc2gpCmJlZm9yZSBsYXVuY2hpbmcAAAAAACNQZW5kaW5nRGFvVXNlc1Jldm9rZWRJbXBsZW1lbnRhdGlvbgAAABvRAAAAU1NsdWcgaXMgbm90IDQtNjMgY2hhcnMgb2YgYFthLXowLTktXWAgd2l0aG91dCBhIGxlYWRpbmcsIHRyYWlsaW5nIG9yCmRvdWJsZWQgaHlwaGVuAAAAAAtJbnZhbGlkU2x1ZwAAABvSAAAAKVNsdWcgaXMgYWxyZWFkeSBjbGFpbWVkIGJ5IGEgbGF1bmNoZWQgREFPAAAAAAAACVNsdWdUYWtlbgAAAAAAG9MAAAAfQ3VycmVudCBpbXBsZW1lbnRhdGlvbnMgbm90IHNldAAAAAAcQ3VycmVudEltcGxlbWVudGF0aW9uc05vdFNldAAAG9QAAAAuU2Vjb25kYXJ5LXNhbGUgZmVlIGFib3ZlIGBjb21tb246Ok1BWF9GRUVfQlBTYAAAAAAACkludmFsaWRGZWUAAAAAG9UAAAAtVGhlIGxhdW5jaCBhZG1pbiBpcyBubyBsb25nZXIgdGhlIHRva2VuIGFkbWluAAAAAAAAE0xhdW5jaEFkbWluTm90T3duZXIAAAAb1gAAACVObyBwZW5kaW5nIERBTyBmb3IgdGhpcyB0b2tlbiBhZGRyZXNzAAAAAAAAC0Rhb05vdEZvdW5kAAAAG9cAAAAtTm8gbGF1bmNoZWQgREFPIGlzIHJlZ2lzdGVyZWQgdW5kZXIgdGhpcyBzbHVnAAAAAAAADFNsdWdOb3RGb3VuZAAAG9g=", "AAAABQAAAAAAAAAAAAAACkRhb0NyZWF0ZWQAAAAAAAEAAAALZGFvX2NyZWF0ZWQAAAAABwAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAAhkZXBsb3llcgAAABMAAAABAAAAAAAAAAxsYXVuY2hfYWRtaW4AAAATAAAAAQAAAAAAAAAOY3JlYXRlZF9sZWRnZXIAAAAAAAYAAAAAAAAAAAAAAAdtb2R1bGVzAAAAB9AAAAAMRGFvQWRkcmVzc2VzAAAAAAAAACtXQVNNIGhhc2hlcyB0aGUgbW9kdWxlcyB3ZXJlIGRlcGxveWVkIGZyb20uAAAAAAt3YXNtX2hhc2hlcwAAAAfQAAAADURhb1dhc21IYXNoZXMAAAAAAAAAAAAAQ1JlcXVlc3RlZCBzbHVnLiBOb3QgdW5pcXVlIHVudGlsIGNsYWltZWQgYXQgbGF1bmNoIChgU2x1Z0NsYWltZWRgKS4AAAAABHNsdWcAAAAQAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAC0Rhb0xhdW5jaGVkAAAAAAEAAAAMZGFvX2xhdW5jaGVkAAAABgAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAA9sYXVuY2hlZF9sZWRnZXIAAAAABgAAAAAAAAAAAAAAB21vZHVsZXMAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAAAAAAAAAAAAA5sYXVuY2hfYXVjdGlvbgAAAAAAAQAAAAAAAAAAAAAAEmxhdW5jaF9tYXJrZXRwbGFjZQAAAAAAAQAAAAAAAAAAAAAADWVuYWJsZV9taW50ZXIAAAAAAAABAAAAAAAAAAI=", "AAAABQAAAE1FbWl0dGVkIGJ5IGBsYXVuY2hfZGFvYCB3aGVuIHRoZSBEQU8ncyBzbHVnIGJlY29tZXMgaXRzIHBlcm1hbmVudCwgdW5pcXVlIGlkLgAAAAAAAAAAAAALU2x1Z0NsYWltZWQAAAAAAQAAAAxzbHVnX2NsYWltZWQAAAACAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAAAAAAABHNsdWcAAAAQAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAEAAAANYWRtaW5fY2hhbmdlZAAAAAAAAAIAAAAAAAAACW9sZF9hZG1pbgAAAAAAABMAAAABAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAADUFkbWluUHJvcG9zZWQAAAAAAAABAAAADmFkbWluX3Byb3Bvc2VkAAAAAAACAAAAAAAAAA1jdXJyZW50X2FkbWluAAAAAAAAEwAAAAEAAAAAAAAADnByb3Bvc2VkX2FkbWluAAAAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAADUZhY3RvcnlQYXVzZWQAAAAAAAABAAAADmZhY3RvcnlfcGF1c2VkAAAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD0ZhY3RvcnlVbnBhdXNlZAAAAAABAAAAEGZhY3RvcnlfdW5wYXVzZWQAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD01hbmFnZXJVcGdyYWRlZAAAAAABAAAAEG1hbmFnZXJfdXBncmFkZWQAAAAFAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAAAAAAAAxmcm9tX3ZlcnNpb24AAAAQAAAAAAAAAAAAAAAKdG9fdmVyc2lvbgAAAAAAEAAAAAAAAAAAAAAAD3VwZ3JhZGVkX2xlZGdlcgAAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAD1VwZ3JhZGVBcHByb3ZlZAAAAAABAAAAEHVwZ3JhZGVfYXBwcm92ZWQAAAADAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAAAAAAAA9hcHByb3ZlZF9sZWRnZXIAAAAABgAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEVBsYXRmb3JtTWludGVyU2V0AAAAAAAAAQAAABNwbGF0Zm9ybV9taW50ZXJfc2V0AAAAAAEAAAAAAAAABm1pbnRlcgAAAAAAEwAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAEk1hbmFnZXJJbml0aWFsaXplZAAAAAAAAQAAABNtYW5hZ2VyX2luaXRpYWxpemVkAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAAAAAAD2RlcGxveWVkX2xlZGdlcgAAAAAGAAAAAAAAAAI=", "AAAABQAAACFFbWl0dGVkIGJ5IGB1cGRhdGVfcGVuZGluZ19zbHVnYC4AAAAAAAAAAAAAElBlbmRpbmdTbHVnVXBkYXRlZAAAAAAAAQAAABRwZW5kaW5nX3NsdWdfdXBkYXRlZAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAEc2x1ZwAAABAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAFUltcGxlbWVudGF0aW9uUmV2b2tlZAAAAAAAAAEAAAAWaW1wbGVtZW50YXRpb25fcmV2b2tlZAAAAAAAAgAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAA5yZXZva2VkX2xlZGdlcgAAAAAABgAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAFkFkbWluUHJvcG9zYWxDYW5jZWxsZWQAAAAAAAEAAAAYYWRtaW5fcHJvcG9zYWxfY2FuY2VsbGVkAAAAAgAAAAAAAAANY3VycmVudF9hZG1pbgAAAAAAABMAAAABAAAAAAAAAA9jYW5jZWxsZWRfYWRtaW4AAAAAEwAAAAEAAAAC", "AAAABQAAACdFbWl0dGVkIGJ5IGBzZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uYC4AAAAAAAAAABdMYXRlc3RJbXBsZW1lbnRhdGlvblNldAAAAAABAAAAGWxhdGVzdF9pbXBsZW1lbnRhdGlvbl9zZXQAAAAAAAADAAAAAAAAAARuYW1lAAAAEAAAAAEAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAGEltcGxlbWVudGF0aW9uUmVnaXN0ZXJlZAAAAAEAAAAZaW1wbGVtZW50YXRpb25fcmVnaXN0ZXJlZAAAAAAAAAQAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAABBwdWJsaXNoZWRfbGVkZ2VyAAAABgAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAHUN1cnJlbnRJbXBsZW1lbnRhdGlvbnNVcGRhdGVkAAAAAAAAAQAAAB9jdXJyZW50X2ltcGxlbWVudGF0aW9uc191cGRhdGVkAAAAAAYAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAAAAAAAAhtZXRhZGF0YQAAA+4AAAAgAAAAAAAAAAAAAAAHYXVjdGlvbgAAAAPuAAAAIAAAAAAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAAAAAAAAh0cmVhc3VyeQAAA+4AAAAgAAAAAAAAAAAAAAALbWFya2V0cGxhY2UAAAAD7gAAACAAAAAAAAAAAg==", "AAAAAQAAASZUaGUgb25seSBmYWN0b3J5IHN0YXRlIHJldGFpbmVkIHVudGlsIHRoZSBsYXVuY2ggYWRtaW5pc3RyYXRvciBmaW5hbGl6ZXMgYSBEQU8uCgpNb2R1bGUgV0FTTSBoYXNoZXMgYXJlIGRlbGliZXJhdGVseSBOT1Qgc3RvcmVkOiBgbGF1bmNoX2Rhb2AgcmVhZHMgZWFjaAptb2R1bGUncyBjdXJyZW50IGB3YXNtX2hhc2goKWAgYW5kIGNoZWNrcyBpdCBhZ2FpbnN0IHRoZSByZWdpc3RyeSwgc28gYQpwcmUtbGF1bmNoIGFkbWluIGB1cGdyYWRlYCBpcyBob25vcmVkIGFuZCBhIHJldm9rZWQgaGFzaCBpcyByZWplY3RlZC4AAAAAAAAAAAAKUGVuZGluZ0RhbwAAAAAABQAAAAAAAAAJYWRkcmVzc2VzAAAAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAABJQXVjdGlvbiBwYXltZW50IHRva2VuIGNob3NlbiBhdCBjcmVhdGVfZGFvOyBsYXVuY2ggcmVmdXNlcyBpZiBpdCBjaGFuZ2VkLgAAAAAAABVhdWN0aW9uX3BheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAAxsYXVuY2hfYWRtaW4AAAATAAAATU1hcmtldHBsYWNlIHBheW1lbnQgYXNzZXQgY2hvc2VuIGF0IGNyZWF0ZV9kYW87IGxhdW5jaCByZWZ1c2VzIGlmIGl0IGNoYW5nZWQuAAAAAAAAGW1hcmtldHBsYWNlX3BheW1lbnRfYXNzZXQAAAAAAAATAAAAT1JlcXVlc3RlZCBzbHVnOyBjbGFpbWVkIGF0IGBsYXVuY2hfZGFvYCwgY2hhbmdlYWJsZSB3aXRoIGB1cGRhdGVfcGVuZGluZ19zbHVnYC4AAAAABHNsdWcAAAAQ", "AAAAAQAAAAAAAAAAAAAADERhb0FkZHJlc3NlcwAAAAYAAAAAAAAAB2F1Y3Rpb24AAAAAEwAAAAAAAAAIZ292ZXJub3IAAAATAAAAAAAAAAttYXJrZXRwbGFjZQAAAAATAAAAAAAAAAhtZXRhZGF0YQAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAAT", "AAAAAQAAAAAAAAAAAAAADExhdW5jaENvbmZpZwAAAAQAAAB1R3JhbnQgbWludCBhdXRob3JpdHkgdG8gdGhlIE1hbmFnZXItcmVnaXN0ZXJlZCBQbGF0Zm9ybU1pbnRlci4gVGhlCmNhbGxlciBjYW4gbmV2ZXIgbmFtZSBhbiBhcmJpdHJhcnkgbWludGVyIGFkZHJlc3MuAAAAAAAADWVuYWJsZV9taW50ZXIAAAAAAAABAAAA+FRoZSBwbGF0Zm9ybSBtaW50ZXIgdGhlIGxhdW5jaCBhZG1pbiBzYXcgYW5kIGFwcHJvdmVzLiBSZXF1aXJlZCAoYW5kCm11c3QgZXF1YWwgdGhlIHJlZ2lzdGVyZWQgUGxhdGZvcm1NaW50ZXIpIHdoZW4gYGVuYWJsZV9taW50ZXJgIGlzIHNldCwKc28gYSBNYW5hZ2VyIGFkbWluIGNhbm5vdCBzd2FwIHRoZSBtaW50ZXIgYmV0d2VlbiBzaWduaW5nIGFuZCBsYXVuY2guCklnbm9yZWQgd2hlbiBgZW5hYmxlX21pbnRlcmAgaXMgZmFsc2UuAAAAD2V4cGVjdGVkX21pbnRlcgAAAAPoAAAAEwAAAAAAAAAObGF1bmNoX2F1Y3Rpb24AAAAAAAEAAAAAAAAAEmxhdW5jaF9tYXJrZXRwbGFjZQAAAAAAAQ==", "AAAAAQAAAAAAAAAAAAAADUF1Y3Rpb25Db25maWcAAAAAAAAEAAAAAAAAAAhkdXJhdGlvbgAAAAYAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAALdGltZV9idWZmZXIAAAAABg==", "AAAAAQAAAElXQVNNIGhhc2hlcyB0aGUgc2l4IG1vZHVsZXMgd2VyZSBkZXBsb3llZCBmcm9tIChlbWl0dGVkIGluIGBEYW9DcmVhdGVkYCkuAAAAAAAAAAAAAA1EYW9XYXNtSGFzaGVzAAAAAAAABgAAAAAAAAAHYXVjdGlvbgAAAAPuAAAAIAAAAAAAAAAIZ292ZXJub3IAAAPuAAAAIAAAAAAAAAALbWFya2V0cGxhY2UAAAAD7gAAACAAAAAAAAAACG1ldGFkYXRhAAAD7gAAACAAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAACHRyZWFzdXJ5AAAD7gAAACA=", "AAAAAQAAAAAAAAAAAAAAEEdvdmVybmFuY2VDb25maWcAAAAFAAAAAAAAABJwcm9wb3NhbF90aHJlc2hvbGQAAAAAAAoAAAAAAAAAC3F1ZXVlX2RlbGF5AAAAAAQAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAAAAAADHZvdGluZ19kZWxheQAAAAQAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAE", "AAAAAQAAAAAAAAAAAAAAEURhb0NyZWF0aW9uUGFyYW1zAAAAAAAABAAAAAAAAAAIZGVwbG95ZXIAAAATAAAAAAAAAA5pbml0aWFsX2NvbmZpZwAAAAAH0AAAABZJbml0aWFsRGFvQ29uZmlnVmFsdWVzAAAAAAAAAAAADGxhdW5jaF9hZG1pbgAAABMAAAAAAAAABW5vbmNlAAAAAAAABg==", "AAAAAQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAAAgAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAEXNlY29uZGFyeV9mZWVfYnBzAAAAAAAABA==", "AAAAAQAAAAAAAAAAAAAAFUltcGxlbWVudGF0aW9uVmVyc2lvbgAAAAAAAAUAAAAAAAAABG5hbWUAAAAQAAAAJExlZGdlciBzZXF1ZW5jZSBvZiB0aGUgcmVnaXN0cmF0aW9uLgAAABBwdWJsaXNoZWRfbGVkZ2VyAAAABgAAAAAAAAAHcmV2b2tlZAAAAAABAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAg", "AAAAAQAAAAAAAAAAAAAAFkluaXRpYWxEYW9Db25maWdWYWx1ZXMAAAAAAAsAAAAAAAAAB2F1Y3Rpb24AAAAH0AAAAA1BdWN0aW9uQ29uZmlnAAAAAAAAAAAAAA5jb250cmFjdF9pbWFnZQAAAAAAEAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAKZ292ZXJuYW5jZQAAAAAH0AAAABBHb3Zlcm5hbmNlQ29uZmlnAAAAAAAAAAttYXJrZXRwbGFjZQAAAAfQAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAAAAAAAAtwcm9qZWN0X3VyaQAAAAAQAAAAAAAAAA1yZW5kZXJlcl9iYXNlAAAAAAAAEAAAAHRSZXF1ZXN0ZWQgaHVtYW4tZnJpZW5kbHkgREFPIGlkZW50aWZpZXIgKGBbYS16MC05LV1gLCA0LTYzIGNoYXJzKS4KQ2xhaW1lZCAodW5pcXVlLCBwZXJtYW5lbnQpIG9ubHkgYXQgYGxhdW5jaF9kYW9gLgAAAARzbHVnAAAAEAAAAAAAAAAKdG9rZW5fbmFtZQAAAAAAEAAAAAAAAAAMdG9rZW5fc3ltYm9sAAAAEAAAAAAAAAAJdG9rZW5fdXJpAAAAAAAAEA==", "AAAAAAAAACtSZXR1cm5zIHRoZSBhY3RpdmUgTWFuYWdlciByZWxlYXNlIHZlcnNpb24uAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAAEA==", "AAAAAAAAAGBTbHVnIGNsYWltZWQgYnkgYSBsYXVuY2hlZCBEQU8sIGlmIGFueSAoYSBwZW5kaW5nIERBTydzIHJlcXVlc3RlZCBzbHVnCmlzIGluIGBnZXRfcGVuZGluZ19kYW9gKS4AAAAIZ2V0X3NsdWcAAAABAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAPoAAAAEA==", "AAAAAAAAAA5DdXJyZW50IGFkbWluLgAAAAAACWdldF9hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAACVSZXR1cm5zIHRoZSBhY3RpdmUgTWFuYWdlciBXQVNNIGhhc2guAAAAAAAACXdhc21faGFzaAAAAAAAAAAAAAABAAAD7gAAACA=", "AAAAAAAAA31DcmVhdGUgYSBuZXcgREFPIHdpdGggYWxsIDYgbW9kdWxlcyBhdG9taWNhbGx5IGRlcGxveWVkLgoKVGhpcyBkZXBsb3lzIGFsbCBzaXggbW9kdWxlcyB3aXRoIHNhZmUgZGVmYXVsdHMuIFRoZSBsYXVuY2ggYWRtaW5pc3RyYXRvcgpvd25zIHRoZSBzZXR1cCB3aW5kb3cgYW5kIG1heSBjb25maWd1cmUgdGhlIG1vZHVsZXMgYmVmb3JlIGBsYXVuY2hfZGFvYC4KCiMgQXJndW1lbnRzCgoqIGBwYXJhbXNgIC0gRGVwbG95ZXIsIGRldGVybWluaXN0aWMgbm9uY2UsIGFuZCBsYXVuY2ggYWRtaW5pc3RyYXRvcgoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBCT1RIIGBwYXJhbXMuZGVwbG95ZXJgIGFuZCBgcGFyYW1zLmxhdW5jaF9hZG1pbmAgdG8gYXV0aG9yaXplCnRoZSBjYWxsIChvbmUgc2lnbmF0dXJlIGlmIHRoZXkgYXJlIHRoZSBzYW1lIGFkZHJlc3MpLiBNb2R1bGUKY29uc3RydWN0b3JzIGRvIG5vdCByZXF1aXJlIGF1dGguCgojIFJldHVybnMKCkFsbCBkZXBsb3llZCBjb250cmFjdCBhZGRyZXNzZXMKClRoZSByZXF1ZXN0ZWQgc2x1ZyBpcyB2YWxpZGF0ZWQgYW5kIG11c3Qgbm90IGJlbG9uZyB0byBhIGxhdW5jaGVkIERBTywKYnV0IGl0IGlzIG9ubHkgY2xhaW1lZCBhdCBgbGF1bmNoX2Rhb2AgKHBlbmRpbmcgREFPcyBob2xkIG5vIHNsdWcsIHNvIGFuCmFiYW5kb25lZCBjcmVhdGlvbiBibG9ja3Mgbm90aGluZykuCgojIEVycm9ycwoKKiBgRmFjdG9yeVBhdXNlZGAgLSBGYWN0b3J5IGlzIHBhdXNlZAoqIGBDdXJyZW50SW1wbGVtZW50YXRpb25zTm90U2V0YCAtIEN1cnJlbnQgV0FTTSBoYXNoZXMgbm90IGNvbmZpZ3VyZWQKKiBgSW52YWxpZFNsdWdgIC8gYFNsdWdUYWtlbmAgLSBNYWxmb3JtZWQgc2x1Zywgb3IgY2xhaW1lZCBieSBhIGxhdW5jaGVkIERBTwAAAAAAAApjcmVhdGVfZGFvAAAAAAABAAAAAAAAAAZwYXJhbXMAAAAAB9AAAAARRGFvQ3JlYXRpb25QYXJhbXMAAAAAAAABAAAD6QAAB9AAAAAMRGFvQWRkcmVzc2VzAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAABABMYXVuY2ggYSBjb25maWd1cmVkIERBTy4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSB0aGUgbGF1bmNoX2FkbWluIHdobyBjcmVhdGVkIHRoZSBEQU8uCgojIEFyZ3VtZW50cwoKKiBgdG9rZW5fYWRkcmVzc2AgLSBBZGRyZXNzIG9mIHRoZSBEQU8ncyB0b2tlbiBjb250cmFjdAoqIGBsYXVuY2hfY29uZmlnYCAtIENvbmZpZ3VyYXRpb24gZm9yIHdoYXQgdG8gZW5hYmxlIGF0IGxhdW5jaAotIGBsYXVuY2hfYXVjdGlvbmAgLSBXaGV0aGVyIHRvIHVucGF1c2UgdGhlIGF1Y3Rpb24KLSBgbGF1bmNoX21hcmtldHBsYWNlYCAtIFdoZXRoZXIgdG8gdW5wYXVzZSB0aGUgbWFya2V0cGxhY2UKLSBgZW5hYmxlX21pbnRlcmAgLSBXaGV0aGVyIHRvIGdyYW50IG1pbnQgYXV0aG9yaXR5IHRvIHRoZSByZWdpc3RlcmVkIFBsYXRmb3JtTWludGVyCi0gYGV4cGVjdGVkX21pbnRlcmAgLSBSZXF1aXJlZCB3aGVuIGBlbmFibGVfbWludGVyYCBpcyBzZXQ7IG11c3QgZXF1YWwgdGhlIHJlZ2lzdGVyZWQKUGxhdGZvcm1NaW50ZXIgKGBQbGF0Zm9ybU1pbnRlck1pc21hdGNoYCBvdGhlcndpc2UsIGluY2x1ZGluZyB3aGVuIGBOb25lYCkKCiMgVmFsaWRhdGlvbgoKLSBUaGUgZmFjdG9yeSBtdXN0IG5vdCBiZSBwYXVzZWQgKGBGYWN0b3J5UGF1c2VkYCkKLSBUb2tlbiB2b3Rpbmcgc3VwcGx5IG11c3QgYmUgPiAwIChhdCBsZWFzdCBvbmUgdG9rZW4gbWludGVkIHRvIGEgaG9sZGVyCm90aGVyIHRoYW4gdGhlIFRyZWFzdXJ5LCBBdWN0aW9uIG9yIE1hcmtldHBsYWNlKQotIGxhdW5jaF9hZG1pbiBtdXN0IGJlIHRoZSBjdXJyZW50IHRva2VuIGFkbWluIChgTGF1bmNoQWRtaW5Ob3RPd25lcmApCi0gVGhlIHJlcXVlc3RlZCBzbHVnIG11c3Qgc3RpbGwgYmUgdW5jbGFpbWVkIChgU2x1Z1Rha2VuYDsgY2hhbmdlIGl0IHdpdGgKYHVwZGF0ZV9wZW5kaW5nX3NsdWdgKQotIEV2ZXJ5IG1vZHVsZSdzIENVUlJFTlQgYHdhc21faGFzaCgpYCBtdXN0IGJlIHJlZ2lzdGVyZWQgYW5kIG5vdCByZXZva2VkCihgUGVuAAAACmxhdW5jaF9kYW8AAAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAA1sYXVuY2hfY29uZmlnAAAAAAAH0AAAAAxMYXVuY2hDb25maWcAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAE1BY2NlcHQgYSBwZW5kaW5nIGFkbWluIGhhbmRvdmVyLiBSZXF1aXJlcyB0aGUgcHJvcG9zZWQgYWRtaW4ncyBhdXRob3JpemF0aW9uLgAAAAAAAAxhY2NlcHRfYWRtaW4AAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAQ1Jbml0aWFsaXplIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IHdpdGggYW4gYWRtaW4uCgojIEFyZ3VtZW50cwoKKiBgYWRtaW5gIC0gVGhlIGFkZHJlc3MgdGhhdCB3aWxsIGNvbnRyb2wgaW1wbGVtZW50YXRpb24gbWFuYWdlbWVudCBhbmQgZmFjdG9yeSBzZXR0aW5ncwoqIGBjdXJyZW50X2hhc2hgIC0gQ3VycmVudCBNYW5hZ2VyIFdBU00gaGFzaCBmb3IgdXBncmFkZSB0cmFja2luZwoqIGB2ZXJzaW9uYCAtIEN1cnJlbnQgTWFuYWdlciB2ZXJzaW9uIChlLmcuLCAiMC4xLjAiKQAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAA==", "AAAAAAAAAU5QZXJtaXNzaW9ubGVzcyBUVEwgcmVuZXdhbCBmb3IgYSBEQU8ncyBzbHVnIHJlZ2lzdHJ5IGVudHJpZXMuCgpBbnlvbmUgKERBTyBvcGVyYXRvcnMsIHRoZSBwbGF0Zm9ybSBhZG1pbikgY2FuIHBheSB0byBrZWVwIGEgc2x1ZyBsaXZlLgpUaGUgbmV0d29yayBjbGFtcHMgYGV4dGVuZF90b2AgdG8gaXRzIG1heCBlbnRyeSBUVEwgKH4xODAgZGF5cyksIHNvIGNhbGwKdGhpcyBwZXJpb2RpY2FsbHkuIEFyY2hpdmVkIGVudHJpZXMgbXVzdCBiZSByZXN0b3JlZCBmaXJzdC4KCiMgRXJyb3JzCgoqIGBTbHVnTm90Rm91bmRgIC0gbm8gREFPIGlzIHJlZ2lzdGVyZWQgdW5kZXIgdGhpcyBzbHVnAAAAAAANYnVtcF9zbHVnX3R0bAAAAAAAAAEAAAAAAAAABHNsdWcAAAAQAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAFtQYXVzZSB0aGUgZmFjdG9yeSAoZW1lcmdlbmN5IG1lYXN1cmUpLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKAAAAAA1wYXVzZV9mYWN0b3J5AAAAAAAAAAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAJBQcm9wb3NlIGEgbmV3IGFkbWluLiBUaGUgaGFuZG92ZXIgY29tcGxldGVzIHdoZW4gYGFjY2VwdF9hZG1pbmAgaXMgY2FsbGVkLgoKT25seSBjYWxsYWJsZSBieSB0aGUgY3VycmVudCBhZG1pbi4gT3ZlcndyaXRlcyBhbnkgZWFybGllciBwcm9wb3NhbC4AAAANcHJvcG9zZV9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAclBcHByb3ZlIGFuIHVwZ3JhZGUgcGF0aCBmcm9tIG9uZSBpbXBsZW1lbnRhdGlvbiB0byBhbm90aGVyLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBFcnJvcnMKCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gT25lIG9yIGJvdGggaW1wbGVtZW50YXRpb25zIGRvbid0IGV4aXN0CiogYEludmFsaWRVcGdyYWRlUGF0aGAgLSBUYXJnZXQgaXMgcmV2b2tlZCwgb3IgdGhlIG5hbWVzIGRpZmZlcgoKQSByZXZva2VkIFNPVVJDRSBpcyBhbGxvd2VkIG9uIHB1cnBvc2U6IGFmdGVyIHJldm9raW5nIGEgdnVsbmVyYWJsZQpoYXNoIHRoZSBhZG1pbiBtdXN0IHN0aWxsIGJlIGFibGUgdG8gYXBwcm92ZSBhIG1pZ3JhdGlvbiBvZmYgaXQuAAAAAAAAD2FwcHJvdmVfdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAIJUb2tlbiBhZGRyZXNzIG9mIHRoZSBsYXVuY2hlZCBEQU8gdGhhdCBjbGFpbWVkIGBzbHVnYC4KClBsYWluIHJlYWQ6IGRvZXMgbm90IGV4dGVuZCBUVEwgKHJlbmV3YWwgaXMgZXhwbGljaXQgdmlhIGBidW1wX3NsdWdfdHRsYCkuAAAAAAAPZ2V0X2Rhb19ieV9zbHVnAAAAAAEAAAAAAAAABHNsdWcAAAAQAAAAAQAAA+kAAAATAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAAAAAAAPZ2V0X3BlbmRpbmdfZGFvAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAAClBlbmRpbmdEYW8AAA==", "AAAAAAAAAElVbnBhdXNlIHRoZSBmYWN0b3J5LgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKAAAAAAAAD3VucGF1c2VfZmFjdG9yeQAAAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAXpVcGdyYWRlIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IGl0c2VsZi4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGBmcm9tX2hhc2hgIC0gQ3VycmVudCBNYW5hZ2VyIFdBU00gaGFzaCAobXVzdCBtYXRjaCBzdG9yZWQgaGFzaCkKKiBgdG9faGFzaGAgLSBUYXJnZXQgTWFuYWdlciBXQVNNIGhhc2ggKG11c3QgYmUgcmVnaXN0ZXJlZCBhbmQgYWN0aXZlKQoKIyBFcnJvcnMKCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gVGFyZ2V0IGltcGxlbWVudGF0aW9uIGRvZXNuJ3QgZXhpc3Qgb3IgaXMgcmV2b2tlZAoqIGBJbnZhbGlkVmVyc2lvbmAgLSBmcm9tX2hhc2ggZG9lc24ndCBtYXRjaCBjdXJyZW50IGhhc2gAAAAAAA91cGdyYWRlX21hbmFnZXIAAAAAAgAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAACpQZW5kaW5nIGFkbWluIGF3YWl0aW5nIGFjY2VwdGFuY2UsIGlmIGFueS4AAAAAABFnZXRfcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAAOdQcmVkaWN0IERBTyBhZGRyZXNzZXMgd2l0aG91dCBkZXBsb3lpbmcuCgpVc2VmdWwgZm9yIGZyb250ZW5kcyB0byBzaG93IGFkZHJlc3NlcyBiZWZvcmUgdXNlciBjb25maXJtcyBkZXBsb3ltZW50LgoKIyBBcmd1bWVudHMKCiogYGNyZWF0b3JgIC0gQ3JlYXRvciBhZGRyZXNzCiogYG5vbmNlYCAtIE5vbmNlIHZhbHVlCgojIFJldHVybnMKClByZWRpY3RlZCBhZGRyZXNzZXMgZm9yIGFsbCA2IG1vZHVsZXMAAAAAEXByZWRpY3RfYWRkcmVzc2VzAAAAAAAAAgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAVub25jZQAAAAAAAAYAAAABAAAD6QAAB9AAAAAMRGFvQWRkcmVzc2VzAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAJFHZXQgaW1wbGVtZW50YXRpb24gYnkgV0FTTSBoYXNoLgoKIyBBcmd1bWVudHMKCiogYHdhc21faGFzaGAgLSBXQVNNIGhhc2ggdG8gcXVlcnkKCiMgUmV0dXJucwoKVGhlIGltcGxlbWVudGF0aW9uIHZlcnNpb24sIG9yIGBOb25lYCBpZiBub3QgZm91bmQuAAAAAAAAEmdldF9pbXBsZW1lbnRhdGlvbgAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAACdUaGUgcmVnaXN0ZXJlZCBwbGF0Zm9ybSBtaW50ZXIsIGlmIGFueS4AAAAAE2dldF9wbGF0Zm9ybV9taW50ZXIAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAARFDaGVjayBpZiBhbiB1cGdyYWRlIGlzIGFwcHJvdmVkLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBSZXR1cm5zCgpgdHJ1ZWAgaWYgdGhlIHBhdGggaXMgYXBwcm92ZWQsIGJvdGggaGFzaGVzIGFyZSByZWdpc3RlcmVkIHVuZGVyIHRoZQpzYW1lIG5hbWUgYW5kIHRoZSBUQVJHRVQgaXMgbm90IHJldm9rZWQuIEEgcmV2b2tlZCBzb3VyY2UgbWF5IHN0aWxsCm1pZ3JhdGUgYXdheS4AAAAAAAATaXNfdXBncmFkZV9hcHByb3ZlZAAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAAB", "AAAAAAAAAEtSZWdpc3RlciB0aGUgcGxhdGZvcm0gbWludGVyIGdyYW50ZWQgbWludCBhdXRob3JpdHkgYXQgbGF1bmNoIChhZG1pbiBvbmx5KS4AAAAAE3NldF9wbGF0Zm9ybV9taW50ZXIAAAAAAQAAAAAAAAAGbWludGVyAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAQRDaGFuZ2UgdGhlIHJlcXVlc3RlZCBzbHVnIG9mIGEgcGVuZGluZyBEQU8gKGxhdW5jaCBhZG1pbiBvbmx5KSwgZm9yCmV4YW1wbGUgYWZ0ZXIgYGxhdW5jaF9kYW9gIGZhaWxlZCB3aXRoIGBTbHVnVGFrZW5gLgoKIyBFcnJvcnMKCiogYERhb05vdEZvdW5kYCAtIE5vIHBlbmRpbmcgREFPIGZvciBgdG9rZW5fYWRkcmVzc2AKKiBgSW52YWxpZFNsdWdgIC8gYFNsdWdUYWtlbmAgLSBNYWxmb3JtZWQgc2x1Zywgb3IgY2xhaW1lZCBieSBhIGxhdW5jaGVkIERBTwAAABN1cGRhdGVfcGVuZGluZ19zbHVnAAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAARzbHVnAAAAEAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAC1DYW5jZWwgYSBwZW5kaW5nIGFkbWluIGhhbmRvdmVyIChhZG1pbiBvbmx5KS4AAAAAAAAUY2FuY2VsX3BlbmRpbmdfYWRtaW4AAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAARBSZXZva2UgYW4gaW1wbGVtZW50YXRpb24gKGVtZXJnZW5jeSBtZWFzdXJlKS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB3YXNtX2hhc2hgIC0gV0FTTSBoYXNoIHRvIHJldm9rZQoKIyBFcnJvcnMKCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gSW1wbGVtZW50YXRpb24gZG9lc24ndCBleGlzdAoqIGBJbXBsZW1lbnRhdGlvbkFscmVhZHlSZXZva2VkYCAtIEltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAABVyZXZva2VfaW1wbGVtZW50YXRpb24AAAAAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAArNSZWdpc3RlciBhIG5ldyBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYG5hbWVgIC0gSW1wbGVtZW50YXRpb24gbmFtZSAoZS5nLiwgIlRva2VuIiwgIkdvdmVybm9yIikKKiBgdmVyc2lvbmAgLSBWZXJzaW9uIHN0cmluZyAoZS5nLiwgIjAuMS4wIikKKiBgd2FzbV9oYXNoYCAtIFdBU00gYnl0ZWNvZGUgaGFzaAoKIyBFcnJvcnMKCiogYEludmFsaWRJbXBsZW1lbnRhdGlvbk5hbWVgIC0gTmFtZSBpcyBlbXB0eSBvciB0b28gbG9uZwoqIGBJbnZhbGlkVmVyc2lvbmAgLSBWZXJzaW9uIGlzIGVtcHR5IG9yIHRvbyBsb25nCiogYEltcGxlbWVudGF0aW9uQWxyZWFkeVJlZ2lzdGVyZWRgIC0gQSByZWNvcmQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgaGFzaAoocmVjb3JkcyBhcmUgaW1tdXRhYmxlOiBubyByZW5hbWluZywgcmUtdmVyc2lvbmluZyBvciB1bi1yZXZva2luZykKClJlZ2lzdHJhdGlvbiBkb2VzIG5vdCBjaGFuZ2UgdGhlICJsYXRlc3QiIGltcGxlbWVudGF0aW9uIGZvciBgbmFtZWA7CnRoZSBhZG1pbiBzZWxlY3RzIGl0IGV4cGxpY2l0bHkgd2l0aCBgc2V0X2xhdGVzdF9pbXBsZW1lbnRhdGlvbmAsIHNvCnJlZ2lzdGVyaW5nIGFuIG9sZGVyIChwYXRjaCkgcmVsZWFzZSBuZXZlciByZWdyZXNzZXMgaXQuAAAAABdyZWdpc3Rlcl9pbXBsZW1lbnRhdGlvbgAAAAADAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAKRHZXQgbGF0ZXN0IHZlcnNpb24gb2YgYW4gaW1wbGVtZW50YXRpb24gYnkgbmFtZS4KCiMgQXJndW1lbnRzCgoqIGBuYW1lYCAtIEltcGxlbWVudGF0aW9uIG5hbWUKCiMgUmV0dXJucwoKVGhlIGxhdGVzdCBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLCBvciBgTm9uZWAgaWYgbm90IGZvdW5kLgAAABlnZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAEbmFtZQAAABAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAANpTZWxlY3QgdGhlIGxhdGVzdCBpbXBsZW1lbnRhdGlvbiBmb3IgYG5hbWVgIChhZG1pbiBvbmx5KS4KCiMgRXJyb3JzCgoqIGBJbXBsZW1lbnRhdGlvbk5vdEZvdW5kYCAtIGB3YXNtX2hhc2hgIGlzIG5vdCByZWdpc3RlcmVkIG9yIGlzIHJldm9rZWQKKiBgSW52YWxpZEltcGxlbWVudGF0aW9uTmFtZWAgLSBgd2FzbV9oYXNoYCBpcyByZWdpc3RlcmVkIHVuZGVyIGFub3RoZXIgbmFtZQAAAAAAGXNldF9sYXRlc3RfaW1wbGVtZW50YXRpb24AAAAAAAACAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAQhSZXR1cm5zIHRoZSByZWdpc3RlcmVkIHJlbGVhc2UgdmVyc2lvbiBmb3IgYSBXQVNNIGhhc2gsIGluY2x1ZGluZwpyZXZva2VkIGhhc2hlcyAoYSBtb2R1bGUgc3RpbGwgcnVubmluZyBhIHJldm9rZWQgaGFzaCBtdXN0IGJlIGFibGUgdG8KYHN5bmNfdmVyc2lvbmApLiBDYWxsZXJzIHRoYXQgbXVzdCByZWplY3QgcmV2b2tlZCB0YXJnZXRzIHJlbHkgb24KYGlzX3VwZ3JhZGVfYXBwcm92ZWRgLCB3aGljaCBjaGVja3MgdGhlIHRhcmdldCBpcyBub3QgcmV2b2tlZC4AAAAaZ2V0X2ltcGxlbWVudGF0aW9uX3ZlcnNpb24AAAAAAAEAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAA+gAAAAQ", "AAAAAAAAAktTZXQgdGhlIGN1cnJlbnQgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoZXMgdXNlZCBieSB0aGUgZmFjdG9yeS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB0b2tlbmAgLSBUb2tlbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2gKKiBgbWV0YWRhdGFgIC0gTWV0YWRhdGEgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoCiogYGF1Y3Rpb25gIC0gQXVjdGlvbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2gKKiBgZ292ZXJub3JgIC0gR292ZXJub3IgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoCiogYHRyZWFzdXJ5YCAtIFRyZWFzdXJ5IGltcGxlbWVudGF0aW9uIFdBU00gaGFzaAoqIGBtYXJrZXRwbGFjZWAgLSBNYXJrZXRwbGFjZSBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2gKCiMgRXJyb3JzCgoqIGBJbXBsZW1lbnRhdGlvbk5vdEZvdW5kYCAtIE9uZSBvciBtb3JlIGltcGxlbWVudGF0aW9ucyBkb24ndCBleGlzdCBvciBhcmUgcmV2b2tlZAoqIGBJbnZhbGlkSW1wbGVtZW50YXRpb25OYW1lYCAtIEEgaGFzaCBpcyByZWdpc3RlcmVkIHVuZGVyIHRoZSB3cm9uZyBtb2R1bGUgbmFtZQAAAAAbc2V0X2N1cnJlbnRfaW1wbGVtZW50YXRpb25zAAAAAAYAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAACG1ldGFkYXRhAAAD7gAAACAAAAAAAAAAB2F1Y3Rpb24AAAAD7gAAACAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAACHRyZWFzdXJ5AAAD7gAAACAAAAAAAAAAC21hcmtldHBsYWNlAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAACZgQ3VycmVudFZlcnNpb25gIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U="]),
      options
    );
  }

   static deploy<T = Client>({ admin, current_hash, version }: { admin: string | Address; current_hash: Uint8Array; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, current_hash, version }, options);
  }
  public readonly fromJson = {
    version : this.txFromJson<string>,  get_slug : this.txFromJson<string | null>,  get_admin : this.txFromJson<string | null>,  wasm_hash : this.txFromJson<Uint8Array>,  create_dao : this.txFromJson<Result<DaoAddresses, ManagerError>>,  launch_dao : this.txFromJson<Result<null, ManagerError>>,  accept_admin : this.txFromJson<Result<null, ManagerError>>,  bump_slug_ttl : this.txFromJson<Result<null, ManagerError>>,  pause_factory : this.txFromJson<Result<null, ManagerError>>,  propose_admin : this.txFromJson<Result<null, ManagerError>>,  approve_upgrade : this.txFromJson<Result<null, ManagerError>>,  get_dao_by_slug : this.txFromJson<Result<string, ManagerError>>,  get_pending_dao : this.txFromJson<PendingDao | null>,  unpause_factory : this.txFromJson<Result<null, ManagerError>>,  upgrade_manager : this.txFromJson<Result<null, ManagerError>>,  get_pending_admin : this.txFromJson<string | null>,  predict_addresses : this.txFromJson<Result<DaoAddresses, ManagerError>>,  get_implementation : this.txFromJson<ImplementationVersion | null>,  get_platform_minter : this.txFromJson<string | null>,  is_upgrade_approved : this.txFromJson<boolean>,  set_platform_minter : this.txFromJson<Result<null, ManagerError>>,  update_pending_slug : this.txFromJson<Result<null, ManagerError>>,  cancel_pending_admin : this.txFromJson<Result<null, ManagerError>>,  revoke_implementation : this.txFromJson<Result<null, ManagerError>>,  register_implementation : this.txFromJson<Result<null, ManagerError>>,  get_latest_implementation : this.txFromJson<ImplementationVersion | null>,  set_latest_implementation : this.txFromJson<Result<null, ManagerError>>,  get_implementation_version : this.txFromJson<string | null>,  set_current_implementations : this.txFromJson<Result<null, ManagerError>>
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
   * Build a topics filter row for the "PlatformMinterSet" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  platformMinterSetEventFilter(topicValues?: { minter?: string | Address }): string[] {
    return this.spec.eventTopicFilter("PlatformMinterSet", topicValues);
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
}