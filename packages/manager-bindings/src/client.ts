import {DaoCreationParams, DaoAddresses, ManagerError, LaunchConfig, PendingDao, ImplementationVersion, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Returns the active Manager release version.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Slug registered for a DAO's token address, if any.
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
   * # Errors
   *
   * * `FactoryPaused` - Factory is paused
   * * `CurrentImplementationsNotSet` - Current WASM hashes not configured
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
   * - Token total supply must be > 0 (at least one token minted)
   * - launch_admin must be the current token owner
   * - Every module's CURRENT `wasm_hash()` must be registered and not revoked
   * (`PendingDaoUsesRevokedImplementation`); checked before any launch call
   *
   * # Effects
   *
   * 1. Validates launch preconditions (`Unauthorized`, `LaunchSupplyZero`)
   * 2. Calls `token.launch` with minters = [Treasury, Marketplace] + [Auction if
   * launch
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
   * * `Unauthorized` - Caller is not admin
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
   * * `Unauthorized` - Caller is not admin
   * * `ImplementationNotFound` - One or both implementations don't exist
   * * `InvalidUpgradePath` - Target is revoked, or the names differ
   *
   * A revoked SOURCE is allowed on purpose: after revoking a vulnerable
   * hash the admin must still be able to approve a migration off it.
   */
  approve_upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
  /**
   * Token address registered under `slug`.
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
   * * `Unauthorized` - Caller is not admin
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
   * * `Unauthorized` - Caller is not admin
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
   * * `Unauthorized` - Caller is not admin
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
   * * `Unauthorized` - Caller is not admin
   * * `InvalidImplementationName` - Name is empty or too long
   * * `InvalidVersion` - Version is empty or too long
   * * `ImplementationAlreadyRegistered` - A record already exists for this hash
   * (records are immutable: no renaming, re-versioning or un-revoking)
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
   * * `auction` - Auction implementation WASM hash (TODO: needs implementation)
   * * `governor` - Governor implementation WASM hash (TODO: needs implementation)
   * * `treasury` - Treasury implementation WASM hash (TODO: needs implementation)
   *
   * # Errors
   *
   * * `Unauthorized` - Caller is not admin
   * * `ImplementationNotFound` - One or more implementations don't exist
   */
  set_current_implementations({ token, metadata, auction, governor, treasury, marketplace }: { token: Uint8Array; metadata: Uint8Array; auction: Uint8Array; governor: Uint8Array; treasury: Uint8Array; marketplace: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAAAAAAAAAAAADE1hbmFnZXJFcnJvcgAAABsAAAAlTm90IGF1dGhvcml6ZWQgdG8gcGVyZm9ybSB0aGlzIGFjdGlvbgAAAAAAAAxVbmF1dGhvcml6ZWQAAAPoAAAAG0ludmFsaWQgaW1wbGVtZW50YXRpb24gbmFtZQAAAAAZSW52YWxpZEltcGxlbWVudGF0aW9uTmFtZQAAAAAAA+kAAAAWSW52YWxpZCB2ZXJzaW9uIG51bWJlcgAAAAAADkludmFsaWRWZXJzaW9uAAAAAAPqAAAAGEltcGxlbWVudGF0aW9uIG5vdCBmb3VuZAAAABZJbXBsZW1lbnRhdGlvbk5vdEZvdW5kAAAAAAPrAAAAHkltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAAAAAHEltcGxlbWVudGF0aW9uQWxyZWFkeVJldm9rZWQAAAPsAAAAFEludmFsaWQgdXBncmFkZSBwYXRoAAAAEkludmFsaWRVcGdyYWRlUGF0aAAAAAAD7QAAAA1BZG1pbiBub3Qgc2V0AAAAAAAAC0FkbWluTm90U2V0AAAAA+4AAAAcTm8gYWRtaW4gaGFuZG92ZXIgaXMgcGVuZGluZwAAAA5Ob1BlbmRpbmdBZG1pbgAAAAAD7wAAAB5QbGF0Zm9ybSBtaW50ZXIgbm90IGNvbmZpZ3VyZWQAAAAAABRQbGF0Zm9ybU1pbnRlck5vdFNldAAAA/AAAAA6QW4gaW1wbGVtZW50YXRpb24gaXMgYWxyZWFkeSByZWdpc3RlcmVkIGZvciB0aGlzIFdBU00gaGFzaAAAAAAAH0ltcGxlbWVudGF0aW9uQWxyZWFkeVJlZ2lzdGVyZWQAAAAD8QAAAFJgZW5hYmxlX21pbnRlcmAgcmVxdWlyZXMgYGV4cGVjdGVkX21pbnRlcmAgdG8gZXF1YWwgdGhlIHJlZ2lzdGVyZWQgcGxhdGZvcm0gbWludGVyAAAAAAAWUGxhdGZvcm1NaW50ZXJNaXNtYXRjaAAAAAAD8gAAABFGYWN0b3J5IGlzIHBhdXNlZAAAAAAAAA1GYWN0b3J5UGF1c2VkAAAAAAAETQAAABhJbnZhbGlkIHBhcmFtZXRlciBib3VuZHMAAAASSW52YWxpZFBhcmFtQm91bmRzAAAAAARPAAAAG0ludmFsaWQgcXVvcnVtIGJhc2lzIHBvaW50cwAAAAAQSW52YWxpZFF1b3J1bUJwcwAABFEAAAAQSW52YWxpZCBkdXJhdGlvbgAAAA9JbnZhbGlkRHVyYXRpb24AAAAEUwAAABNJbnZhbGlkIHRpbWUgYnVmZmVyAAAAABFJbnZhbGlkVGltZUJ1ZmZlcgAAAAAABFQAAAAPU3RyaW5nIHRvbyBsb25nAAAAAA1TdHJpbmdUb29Mb25nAAAAAAAEWAAAAAxTdHJpbmcgZW1wdHkAAAALU3RyaW5nRW1wdHkAAAAEWQAAAI5Hb3Zlcm5hbmNlIHRpbWluZyBvdXQgb2YgcmFuZ2U6IGVhY2ggb2Ygdm90aW5nIGRlbGF5LCB2b3RpbmcgcGVyaW9kIGFuZApxdWV1ZSBkZWxheSBtdXN0IGJlIHdpdGhpbiAzMDAgc2Vjb25kcyAuLj0gMzAgZGF5cyAoMl81OTJfMDAwIHNlY29uZHMpAAAAAAAXSW52YWxpZEdvdmVybmFuY2VUaW1pbmcAAAAEXQAAACVQcm9wb3NhbCB0aHJlc2hvbGQgbXVzdCBiZSBhdCBsZWFzdCAxAAAAAAAAGEludmFsaWRQcm9wb3NhbFRocmVzaG9sZAAABGAAAABBVG9rZW4gdG90YWwgc3VwcGx5IGlzIHplcm87IG1pbnQgYXQgbGVhc3Qgb25lIHRva2VuIGJlZm9yZSBsYXVuY2gAAAAAAAAQTGF1bmNoU3VwcGx5WmVybwAABGEAAACeQSBtb2R1bGUgb2YgdGhlIHBlbmRpbmcgREFPIGN1cnJlbnRseSBydW5zIGEgcmV2b2tlZCBvciB1bnJlZ2lzdGVyZWQKV0FTTSBoYXNoOyB1cGdyYWRlIGl0IChvd25lciBgdXBncmFkZWAgdG8gYW4gYXBwcm92ZWQsIG5vbi1yZXZva2VkIGhhc2gpCmJlZm9yZSBsYXVuY2hpbmcAAAAAACNQZW5kaW5nRGFvVXNlc1Jldm9rZWRJbXBsZW1lbnRhdGlvbgAAAARiAAAAU1NsdWcgaXMgbm90IDQtNjMgY2hhcnMgb2YgYFthLXowLTktXWAgd2l0aG91dCBhIGxlYWRpbmcsIHRyYWlsaW5nIG9yCmRvdWJsZWQgaHlwaGVuAAAAAAtJbnZhbGlkU2x1ZwAAAAReAAAAJlNsdWcgaXMgYWxyZWFkeSBjbGFpbWVkIGJ5IGFub3RoZXIgREFPAAAAAAAJU2x1Z1Rha2VuAAAAAAAEXwAAAB9DdXJyZW50IGltcGxlbWVudGF0aW9ucyBub3Qgc2V0AAAAABxDdXJyZW50SW1wbGVtZW50YXRpb25zTm90U2V0AAAEXAAAAA1EQU8gbm90IGZvdW5kAAAAAAAAC0Rhb05vdEZvdW5kAAAABLEAAAAkTm8gREFPIGlzIHJlZ2lzdGVyZWQgdW5kZXIgdGhpcyBzbHVnAAAADFNsdWdOb3RGb3VuZAAABLI=", "AAAABQAAAAAAAAAAAAAACkRhb0NyZWF0ZWQAAAAAAAEAAAALZGFvX2NyZWF0ZWQAAAAABwAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAAhkZXBsb3llcgAAABMAAAABAAAAAAAAAAxsYXVuY2hfYWRtaW4AAAATAAAAAQAAAAAAAAAOY3JlYXRlZF9sZWRnZXIAAAAAAAYAAAAAAAAAAAAAAAdtb2R1bGVzAAAAB9AAAAAMRGFvQWRkcmVzc2VzAAAAAAAAACtXQVNNIGhhc2hlcyB0aGUgbW9kdWxlcyB3ZXJlIGRlcGxveWVkIGZyb20uAAAAAAt3YXNtX2hhc2hlcwAAAAfQAAAADURhb1dhc21IYXNoZXMAAAAAAAAAAAAAIVVuaXF1ZSBzbHVnIGNsYWltZWQgZm9yIHRoaXMgREFPLgAAAAAAAARzbHVnAAAAEAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAC0Rhb0xhdW5jaGVkAAAAAAEAAAAMZGFvX2xhdW5jaGVkAAAABgAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAA9sYXVuY2hlZF9sZWRnZXIAAAAABgAAAAAAAAAAAAAAB21vZHVsZXMAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAAAAAAAAAAAAA5sYXVuY2hfYXVjdGlvbgAAAAAAAQAAAAAAAAAAAAAAEmxhdW5jaF9tYXJrZXRwbGFjZQAAAAAAAQAAAAAAAAAAAAAADWVuYWJsZV9taW50ZXIAAAAAAAABAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAEAAAANYWRtaW5fY2hhbmdlZAAAAAAAAAIAAAAAAAAACW9sZF9hZG1pbgAAAAAAABMAAAABAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAADUFkbWluUHJvcG9zZWQAAAAAAAABAAAADmFkbWluX3Byb3Bvc2VkAAAAAAACAAAAAAAAAA1jdXJyZW50X2FkbWluAAAAAAAAEwAAAAEAAAAAAAAADnByb3Bvc2VkX2FkbWluAAAAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAADUZhY3RvcnlQYXVzZWQAAAAAAAABAAAADmZhY3RvcnlfcGF1c2VkAAAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD0ZhY3RvcnlVbnBhdXNlZAAAAAABAAAAEGZhY3RvcnlfdW5wYXVzZWQAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD01hbmFnZXJVcGdyYWRlZAAAAAABAAAAEG1hbmFnZXJfdXBncmFkZWQAAAAFAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAAAAAAAAxmcm9tX3ZlcnNpb24AAAAQAAAAAAAAAAAAAAAKdG9fdmVyc2lvbgAAAAAAEAAAAAAAAAAAAAAAC3VwZ3JhZGVkX2F0AAAAAAYAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD1VwZ3JhZGVBcHByb3ZlZAAAAAABAAAAEHVwZ3JhZGVfYXBwcm92ZWQAAAADAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAAAAAAAAthcHByb3ZlZF9hdAAAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEVBsYXRmb3JtTWludGVyU2V0AAAAAAAAAQAAABNwbGF0Zm9ybV9taW50ZXJfc2V0AAAAAAEAAAAAAAAABm1pbnRlcgAAAAAAEwAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAEk1hbmFnZXJJbml0aWFsaXplZAAAAAAAAQAAABNtYW5hZ2VyX2luaXRpYWxpemVkAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAAAAAAC2RlcGxveWVkX2F0AAAAAAYAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAFUltcGxlbWVudGF0aW9uUmV2b2tlZAAAAAAAAAEAAAAWaW1wbGVtZW50YXRpb25fcmV2b2tlZAAAAAAAAgAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAApyZXZva2VkX2F0AAAAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAFkFkbWluUHJvcG9zYWxDYW5jZWxsZWQAAAAAAAEAAAAYYWRtaW5fcHJvcG9zYWxfY2FuY2VsbGVkAAAAAgAAAAAAAAANY3VycmVudF9hZG1pbgAAAAAAABMAAAABAAAAAAAAAA9jYW5jZWxsZWRfYWRtaW4AAAAAEwAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAGEltcGxlbWVudGF0aW9uUmVnaXN0ZXJlZAAAAAEAAAAZaW1wbGVtZW50YXRpb25fcmVnaXN0ZXJlZAAAAAAAAAQAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAxwdWJsaXNoZWRfYXQAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAHUN1cnJlbnRJbXBsZW1lbnRhdGlvbnNVcGRhdGVkAAAAAAAAAQAAAB9jdXJyZW50X2ltcGxlbWVudGF0aW9uc191cGRhdGVkAAAAAAYAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAAAAAAAAhtZXRhZGF0YQAAA+4AAAAgAAAAAAAAAAAAAAAHYXVjdGlvbgAAAAPuAAAAIAAAAAAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAAAAAAAAh0cmVhc3VyeQAAA+4AAAAgAAAAAAAAAAAAAAALbWFya2V0cGxhY2UAAAAD7gAAACAAAAAAAAAAAg==", "AAAAAQAAASZUaGUgb25seSBmYWN0b3J5IHN0YXRlIHJldGFpbmVkIHVudGlsIHRoZSBsYXVuY2ggYWRtaW5pc3RyYXRvciBmaW5hbGl6ZXMgYSBEQU8uCgpNb2R1bGUgV0FTTSBoYXNoZXMgYXJlIGRlbGliZXJhdGVseSBOT1Qgc3RvcmVkOiBgbGF1bmNoX2Rhb2AgcmVhZHMgZWFjaAptb2R1bGUncyBjdXJyZW50IGB3YXNtX2hhc2goKWAgYW5kIGNoZWNrcyBpdCBhZ2FpbnN0IHRoZSByZWdpc3RyeSwgc28gYQpwcmUtbGF1bmNoIG93bmVyIGB1cGdyYWRlYCBpcyBob25vcmVkIGFuZCBhIHJldm9rZWQgaGFzaCBpcyByZWplY3RlZC4AAAAAAAAAAAAKUGVuZGluZ0RhbwAAAAAABAAAAAAAAAAJYWRkcmVzc2VzAAAAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAABJQXVjdGlvbiBwYXltZW50IHRva2VuIGNob3NlbiBhdCBjcmVhdGVfZGFvOyBsYXVuY2ggcmVmdXNlcyBpZiBpdCBjaGFuZ2VkLgAAAAAAABVhdWN0aW9uX3BheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAAxsYXVuY2hfYWRtaW4AAAATAAAATU1hcmtldHBsYWNlIHBheW1lbnQgYXNzZXQgY2hvc2VuIGF0IGNyZWF0ZV9kYW87IGxhdW5jaCByZWZ1c2VzIGlmIGl0IGNoYW5nZWQuAAAAAAAAGW1hcmtldHBsYWNlX3BheW1lbnRfYXNzZXQAAAAAAAAT", "AAAAAQAAAAAAAAAAAAAADERhb0FkZHJlc3NlcwAAAAYAAAAAAAAAB2F1Y3Rpb24AAAAAEwAAAAAAAAAIZ292ZXJub3IAAAATAAAAAAAAAAttYXJrZXRwbGFjZQAAAAATAAAAAAAAAAhtZXRhZGF0YQAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAAT", "AAAAAQAAAAAAAAAAAAAADExhdW5jaENvbmZpZwAAAAQAAAB1R3JhbnQgbWludCBhdXRob3JpdHkgdG8gdGhlIE1hbmFnZXItcmVnaXN0ZXJlZCBQbGF0Zm9ybU1pbnRlci4gVGhlCmNhbGxlciBjYW4gbmV2ZXIgbmFtZSBhbiBhcmJpdHJhcnkgbWludGVyIGFkZHJlc3MuAAAAAAAADWVuYWJsZV9taW50ZXIAAAAAAAABAAAA+FRoZSBwbGF0Zm9ybSBtaW50ZXIgdGhlIGxhdW5jaCBhZG1pbiBzYXcgYW5kIGFwcHJvdmVzLiBSZXF1aXJlZCAoYW5kCm11c3QgZXF1YWwgdGhlIHJlZ2lzdGVyZWQgUGxhdGZvcm1NaW50ZXIpIHdoZW4gYGVuYWJsZV9taW50ZXJgIGlzIHNldCwKc28gYSBNYW5hZ2VyIGFkbWluIGNhbm5vdCBzd2FwIHRoZSBtaW50ZXIgYmV0d2VlbiBzaWduaW5nIGFuZCBsYXVuY2guCklnbm9yZWQgd2hlbiBgZW5hYmxlX21pbnRlcmAgaXMgZmFsc2UuAAAAD2V4cGVjdGVkX21pbnRlcgAAAAPoAAAAEwAAAAAAAAAObGF1bmNoX2F1Y3Rpb24AAAAAAAEAAAAAAAAAEmxhdW5jaF9tYXJrZXRwbGFjZQAAAAAAAQ==", "AAAAAQAAAAAAAAAAAAAADUF1Y3Rpb25Db25maWcAAAAAAAAEAAAAAAAAAAhkdXJhdGlvbgAAAAYAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAALdGltZV9idWZmZXIAAAAABg==", "AAAAAQAAAElXQVNNIGhhc2hlcyB0aGUgc2l4IG1vZHVsZXMgd2VyZSBkZXBsb3llZCBmcm9tIChlbWl0dGVkIGluIGBEYW9DcmVhdGVkYCkuAAAAAAAAAAAAAA1EYW9XYXNtSGFzaGVzAAAAAAAABgAAAAAAAAAHYXVjdGlvbgAAAAPuAAAAIAAAAAAAAAAIZ292ZXJub3IAAAPuAAAAIAAAAAAAAAALbWFya2V0cGxhY2UAAAAD7gAAACAAAAAAAAAACG1ldGFkYXRhAAAD7gAAACAAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAACHRyZWFzdXJ5AAAD7gAAACA=", "AAAAAQAAAAAAAAAAAAAAEEdvdmVybmFuY2VDb25maWcAAAAFAAAAAAAAABJwcm9wb3NhbF90aHJlc2hvbGQAAAAAAAoAAAAAAAAAC3F1ZXVlX2RlbGF5AAAAAAQAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAAAAAADHZvdGluZ19kZWxheQAAAAQAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAE", "AAAAAQAAAAAAAAAAAAAAEURhb0NyZWF0aW9uUGFyYW1zAAAAAAAABAAAAAAAAAAIZGVwbG95ZXIAAAATAAAAAAAAAA5pbml0aWFsX2NvbmZpZwAAAAAH0AAAABZJbml0aWFsRGFvQ29uZmlnVmFsdWVzAAAAAAAAAAAADGxhdW5jaF9hZG1pbgAAABMAAAAAAAAABW5vbmNlAAAAAAAABg==", "AAAAAQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAAAgAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAEXNlY29uZGFyeV9mZWVfYnBzAAAAAAAABA==", "AAAAAQAAAAAAAAAAAAAAFUltcGxlbWVudGF0aW9uVmVyc2lvbgAAAAAAAAUAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAxwdWJsaXNoZWRfYXQAAAAGAAAAAAAAAAdyZXZva2VkAAAAAAEAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACA=", "AAAAAQAAAAAAAAAAAAAAFkluaXRpYWxEYW9Db25maWdWYWx1ZXMAAAAAAAsAAAAAAAAAB2F1Y3Rpb24AAAAH0AAAAA1BdWN0aW9uQ29uZmlnAAAAAAAAAAAAAA5jb250cmFjdF9pbWFnZQAAAAAAEAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAKZ292ZXJuYW5jZQAAAAAH0AAAABBHb3Zlcm5hbmNlQ29uZmlnAAAAAAAAAAttYXJrZXRwbGFjZQAAAAfQAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAAAAAAAAtwcm9qZWN0X3VyaQAAAAAQAAAAAAAAAA1yZW5kZXJlcl9iYXNlAAAAAAAAEAAAAEtVbmlxdWUsIHBlcm1hbmVudCwgaHVtYW4tZnJpZW5kbHkgREFPIGlkZW50aWZpZXIgKGBbYS16MC05LV1gLCA0LTYzIGNoYXJzKS4AAAAABHNsdWcAAAAQAAAAAAAAAAp0b2tlbl9uYW1lAAAAAAAQAAAAAAAAAAx0b2tlbl9zeW1ib2wAAAAQAAAAAAAAAAl0b2tlbl91cmkAAAAAAAAQ", "AAAAAAAAACtSZXR1cm5zIHRoZSBhY3RpdmUgTWFuYWdlciByZWxlYXNlIHZlcnNpb24uAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAAEA==", "AAAAAAAAADJTbHVnIHJlZ2lzdGVyZWQgZm9yIGEgREFPJ3MgdG9rZW4gYWRkcmVzcywgaWYgYW55LgAAAAAACGdldF9zbHVnAAAAAQAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAD6AAAABA=", "AAAAAAAAAA5DdXJyZW50IGFkbWluLgAAAAAACWdldF9hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAACVSZXR1cm5zIHRoZSBhY3RpdmUgTWFuYWdlciBXQVNNIGhhc2guAAAAAAAACXdhc21faGFzaAAAAAAAAAAAAAABAAAD7gAAACA=", "AAAAAAAAAntDcmVhdGUgYSBuZXcgREFPIHdpdGggYWxsIDYgbW9kdWxlcyBhdG9taWNhbGx5IGRlcGxveWVkLgoKVGhpcyBkZXBsb3lzIGFsbCBzaXggbW9kdWxlcyB3aXRoIHNhZmUgZGVmYXVsdHMuIFRoZSBsYXVuY2ggYWRtaW5pc3RyYXRvcgpvd25zIHRoZSBzZXR1cCB3aW5kb3cgYW5kIG1heSBjb25maWd1cmUgdGhlIG1vZHVsZXMgYmVmb3JlIGBsYXVuY2hfZGFvYC4KCiMgQXJndW1lbnRzCgoqIGBwYXJhbXNgIC0gRGVwbG95ZXIsIGRldGVybWluaXN0aWMgbm9uY2UsIGFuZCBsYXVuY2ggYWRtaW5pc3RyYXRvcgoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBCT1RIIGBwYXJhbXMuZGVwbG95ZXJgIGFuZCBgcGFyYW1zLmxhdW5jaF9hZG1pbmAgdG8gYXV0aG9yaXplCnRoZSBjYWxsIChvbmUgc2lnbmF0dXJlIGlmIHRoZXkgYXJlIHRoZSBzYW1lIGFkZHJlc3MpLiBNb2R1bGUKY29uc3RydWN0b3JzIGRvIG5vdCByZXF1aXJlIGF1dGguCgojIFJldHVybnMKCkFsbCBkZXBsb3llZCBjb250cmFjdCBhZGRyZXNzZXMKCiMgRXJyb3JzCgoqIGBGYWN0b3J5UGF1c2VkYCAtIEZhY3RvcnkgaXMgcGF1c2VkCiogYEN1cnJlbnRJbXBsZW1lbnRhdGlvbnNOb3RTZXRgIC0gQ3VycmVudCBXQVNNIGhhc2hlcyBub3QgY29uZmlndXJlZAAAAAAKY3JlYXRlX2RhbwAAAAAAAQAAAAAAAAAGcGFyYW1zAAAAAAfQAAAAEURhb0NyZWF0aW9uUGFyYW1zAAAAAAAAAQAAA+kAAAfQAAAADERhb0FkZHJlc3NlcwAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAABABMYXVuY2ggYSBjb25maWd1cmVkIERBTy4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSB0aGUgbGF1bmNoX2FkbWluIHdobyBjcmVhdGVkIHRoZSBEQU8uCgojIEFyZ3VtZW50cwoKKiBgdG9rZW5fYWRkcmVzc2AgLSBBZGRyZXNzIG9mIHRoZSBEQU8ncyB0b2tlbiBjb250cmFjdAoqIGBsYXVuY2hfY29uZmlnYCAtIENvbmZpZ3VyYXRpb24gZm9yIHdoYXQgdG8gZW5hYmxlIGF0IGxhdW5jaAotIGBsYXVuY2hfYXVjdGlvbmAgLSBXaGV0aGVyIHRvIHVucGF1c2UgdGhlIGF1Y3Rpb24KLSBgbGF1bmNoX21hcmtldHBsYWNlYCAtIFdoZXRoZXIgdG8gdW5wYXVzZSB0aGUgbWFya2V0cGxhY2UKLSBgZW5hYmxlX21pbnRlcmAgLSBXaGV0aGVyIHRvIGdyYW50IG1pbnQgYXV0aG9yaXR5IHRvIHRoZSByZWdpc3RlcmVkIFBsYXRmb3JtTWludGVyCi0gYGV4cGVjdGVkX21pbnRlcmAgLSBSZXF1aXJlZCB3aGVuIGBlbmFibGVfbWludGVyYCBpcyBzZXQ7IG11c3QgZXF1YWwgdGhlIHJlZ2lzdGVyZWQKUGxhdGZvcm1NaW50ZXIgKGBQbGF0Zm9ybU1pbnRlck1pc21hdGNoYCBvdGhlcndpc2UsIGluY2x1ZGluZyB3aGVuIGBOb25lYCkKCiMgVmFsaWRhdGlvbgoKLSBUb2tlbiB0b3RhbCBzdXBwbHkgbXVzdCBiZSA+IDAgKGF0IGxlYXN0IG9uZSB0b2tlbiBtaW50ZWQpCi0gbGF1bmNoX2FkbWluIG11c3QgYmUgdGhlIGN1cnJlbnQgdG9rZW4gb3duZXIKLSBFdmVyeSBtb2R1bGUncyBDVVJSRU5UIGB3YXNtX2hhc2goKWAgbXVzdCBiZSByZWdpc3RlcmVkIGFuZCBub3QgcmV2b2tlZAooYFBlbmRpbmdEYW9Vc2VzUmV2b2tlZEltcGxlbWVudGF0aW9uYCk7IGNoZWNrZWQgYmVmb3JlIGFueSBsYXVuY2ggY2FsbAoKIyBFZmZlY3RzCgoxLiBWYWxpZGF0ZXMgbGF1bmNoIHByZWNvbmRpdGlvbnMgKGBVbmF1dGhvcml6ZWRgLCBgTGF1bmNoU3VwcGx5WmVyb2ApCjIuIENhbGxzIGB0b2tlbi5sYXVuY2hgIHdpdGggbWludGVycyA9IFtUcmVhc3VyeSwgTWFya2V0cGxhY2VdICsgW0F1Y3Rpb24gaWYKbGF1bmNoAAAACmxhdW5jaF9kYW8AAAAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAA1sYXVuY2hfY29uZmlnAAAAAAAH0AAAAAxMYXVuY2hDb25maWcAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAE1BY2NlcHQgYSBwZW5kaW5nIGFkbWluIGhhbmRvdmVyLiBSZXF1aXJlcyB0aGUgcHJvcG9zZWQgYWRtaW4ncyBhdXRob3JpemF0aW9uLgAAAAAAAAxhY2NlcHRfYWRtaW4AAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAQ1Jbml0aWFsaXplIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IHdpdGggYW4gYWRtaW4uCgojIEFyZ3VtZW50cwoKKiBgYWRtaW5gIC0gVGhlIGFkZHJlc3MgdGhhdCB3aWxsIGNvbnRyb2wgaW1wbGVtZW50YXRpb24gbWFuYWdlbWVudCBhbmQgZmFjdG9yeSBzZXR0aW5ncwoqIGBjdXJyZW50X2hhc2hgIC0gQ3VycmVudCBNYW5hZ2VyIFdBU00gaGFzaCBmb3IgdXBncmFkZSB0cmFja2luZwoqIGB2ZXJzaW9uYCAtIEN1cnJlbnQgTWFuYWdlciB2ZXJzaW9uIChlLmcuLCAiMC4xLjAiKQAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAA==", "AAAAAAAAAU5QZXJtaXNzaW9ubGVzcyBUVEwgcmVuZXdhbCBmb3IgYSBEQU8ncyBzbHVnIHJlZ2lzdHJ5IGVudHJpZXMuCgpBbnlvbmUgKERBTyBvcGVyYXRvcnMsIHRoZSBwbGF0Zm9ybSBhZG1pbikgY2FuIHBheSB0byBrZWVwIGEgc2x1ZyBsaXZlLgpUaGUgbmV0d29yayBjbGFtcHMgYGV4dGVuZF90b2AgdG8gaXRzIG1heCBlbnRyeSBUVEwgKH4xODAgZGF5cyksIHNvIGNhbGwKdGhpcyBwZXJpb2RpY2FsbHkuIEFyY2hpdmVkIGVudHJpZXMgbXVzdCBiZSByZXN0b3JlZCBmaXJzdC4KCiMgRXJyb3JzCgoqIGBTbHVnTm90Rm91bmRgIC0gbm8gREFPIGlzIHJlZ2lzdGVyZWQgdW5kZXIgdGhpcyBzbHVnAAAAAAANYnVtcF9zbHVnX3R0bAAAAAAAAAEAAAAAAAAABHNsdWcAAAAQAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAIJQYXVzZSB0aGUgZmFjdG9yeSAoZW1lcmdlbmN5IG1lYXN1cmUpLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluAAAAAAANcGF1c2VfZmFjdG9yeQAAAAAAAAAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAJBQcm9wb3NlIGEgbmV3IGFkbWluLiBUaGUgaGFuZG92ZXIgY29tcGxldGVzIHdoZW4gYGFjY2VwdF9hZG1pbmAgaXMgY2FsbGVkLgoKT25seSBjYWxsYWJsZSBieSB0aGUgY3VycmVudCBhZG1pbi4gT3ZlcndyaXRlcyBhbnkgZWFybGllciBwcm9wb3NhbC4AAAANcHJvcG9zZV9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAfBBcHByb3ZlIGFuIHVwZ3JhZGUgcGF0aCBmcm9tIG9uZSBpbXBsZW1lbnRhdGlvbiB0byBhbm90aGVyLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gT25lIG9yIGJvdGggaW1wbGVtZW50YXRpb25zIGRvbid0IGV4aXN0CiogYEludmFsaWRVcGdyYWRlUGF0aGAgLSBUYXJnZXQgaXMgcmV2b2tlZCwgb3IgdGhlIG5hbWVzIGRpZmZlcgoKQSByZXZva2VkIFNPVVJDRSBpcyBhbGxvd2VkIG9uIHB1cnBvc2U6IGFmdGVyIHJldm9raW5nIGEgdnVsbmVyYWJsZQpoYXNoIHRoZSBhZG1pbiBtdXN0IHN0aWxsIGJlIGFibGUgdG8gYXBwcm92ZSBhIG1pZ3JhdGlvbiBvZmYgaXQuAAAAD2FwcHJvdmVfdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAHJUb2tlbiBhZGRyZXNzIHJlZ2lzdGVyZWQgdW5kZXIgYHNsdWdgLgoKUGxhaW4gcmVhZDogZG9lcyBub3QgZXh0ZW5kIFRUTCAocmVuZXdhbCBpcyBleHBsaWNpdCB2aWEgYGJ1bXBfc2x1Z190dGxgKS4AAAAAAA9nZXRfZGFvX2J5X3NsdWcAAAAAAQAAAAAAAAAEc2x1ZwAAABAAAAABAAAD6QAAABMAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAAAAAAAPZ2V0X3BlbmRpbmdfZGFvAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAAClBlbmRpbmdEYW8AAA==", "AAAAAAAAAHBVbnBhdXNlIHRoZSBmYWN0b3J5LgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluAAAAD3VucGF1c2VfZmFjdG9yeQAAAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAaFVcGdyYWRlIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IGl0c2VsZi4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGBmcm9tX2hhc2hgIC0gQ3VycmVudCBNYW5hZ2VyIFdBU00gaGFzaCAobXVzdCBtYXRjaCBzdG9yZWQgaGFzaCkKKiBgdG9faGFzaGAgLSBUYXJnZXQgTWFuYWdlciBXQVNNIGhhc2ggKG11c3QgYmUgcmVnaXN0ZXJlZCBhbmQgYWN0aXZlKQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gVGFyZ2V0IGltcGxlbWVudGF0aW9uIGRvZXNuJ3QgZXhpc3Qgb3IgaXMgcmV2b2tlZAoqIGBJbnZhbGlkVmVyc2lvbmAgLSBmcm9tX2hhc2ggZG9lc24ndCBtYXRjaCBjdXJyZW50IGhhc2gAAAAAAAAPdXBncmFkZV9tYW5hZ2VyAAAAAAIAAAAAAAAACWZyb21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAACpQZW5kaW5nIGFkbWluIGF3YWl0aW5nIGFjY2VwdGFuY2UsIGlmIGFueS4AAAAAABFnZXRfcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=", "AAAAAAAAAOdQcmVkaWN0IERBTyBhZGRyZXNzZXMgd2l0aG91dCBkZXBsb3lpbmcuCgpVc2VmdWwgZm9yIGZyb250ZW5kcyB0byBzaG93IGFkZHJlc3NlcyBiZWZvcmUgdXNlciBjb25maXJtcyBkZXBsb3ltZW50LgoKIyBBcmd1bWVudHMKCiogYGNyZWF0b3JgIC0gQ3JlYXRvciBhZGRyZXNzCiogYG5vbmNlYCAtIE5vbmNlIHZhbHVlCgojIFJldHVybnMKClByZWRpY3RlZCBhZGRyZXNzZXMgZm9yIGFsbCA2IG1vZHVsZXMAAAAAEXByZWRpY3RfYWRkcmVzc2VzAAAAAAAAAgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAVub25jZQAAAAAAAAYAAAABAAAD6QAAB9AAAAAMRGFvQWRkcmVzc2VzAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAJFHZXQgaW1wbGVtZW50YXRpb24gYnkgV0FTTSBoYXNoLgoKIyBBcmd1bWVudHMKCiogYHdhc21faGFzaGAgLSBXQVNNIGhhc2ggdG8gcXVlcnkKCiMgUmV0dXJucwoKVGhlIGltcGxlbWVudGF0aW9uIHZlcnNpb24sIG9yIGBOb25lYCBpZiBub3QgZm91bmQuAAAAAAAAEmdldF9pbXBsZW1lbnRhdGlvbgAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAACdUaGUgcmVnaXN0ZXJlZCBwbGF0Zm9ybSBtaW50ZXIsIGlmIGFueS4AAAAAE2dldF9wbGF0Zm9ybV9taW50ZXIAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAARFDaGVjayBpZiBhbiB1cGdyYWRlIGlzIGFwcHJvdmVkLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBSZXR1cm5zCgpgdHJ1ZWAgaWYgdGhlIHBhdGggaXMgYXBwcm92ZWQsIGJvdGggaGFzaGVzIGFyZSByZWdpc3RlcmVkIHVuZGVyIHRoZQpzYW1lIG5hbWUgYW5kIHRoZSBUQVJHRVQgaXMgbm90IHJldm9rZWQuIEEgcmV2b2tlZCBzb3VyY2UgbWF5IHN0aWxsCm1pZ3JhdGUgYXdheS4AAAAAAAATaXNfdXBncmFkZV9hcHByb3ZlZAAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAAB", "AAAAAAAAAEtSZWdpc3RlciB0aGUgcGxhdGZvcm0gbWludGVyIGdyYW50ZWQgbWludCBhdXRob3JpdHkgYXQgbGF1bmNoIChhZG1pbiBvbmx5KS4AAAAAE3NldF9wbGF0Zm9ybV9taW50ZXIAAAAAAQAAAAAAAAAGbWludGVyAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAC1DYW5jZWwgYSBwZW5kaW5nIGFkbWluIGhhbmRvdmVyIChhZG1pbiBvbmx5KS4AAAAAAAAUY2FuY2VsX3BlbmRpbmdfYWRtaW4AAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAATdSZXZva2UgYW4gaW1wbGVtZW50YXRpb24gKGVtZXJnZW5jeSBtZWFzdXJlKS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB3YXNtX2hhc2hgIC0gV0FTTSBoYXNoIHRvIHJldm9rZQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gSW1wbGVtZW50YXRpb24gZG9lc24ndCBleGlzdAoqIGBJbXBsZW1lbnRhdGlvbkFscmVhZHlSZXZva2VkYCAtIEltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAAAAVcmV2b2tlX2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAhZSZWdpc3RlciBhIG5ldyBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYG5hbWVgIC0gSW1wbGVtZW50YXRpb24gbmFtZSAoZS5nLiwgIlRva2VuIiwgIkdvdmVybm9yIikKKiBgdmVyc2lvbmAgLSBWZXJzaW9uIHN0cmluZyAoZS5nLiwgIjAuMS4wIikKKiBgd2FzbV9oYXNoYCAtIFdBU00gYnl0ZWNvZGUgaGFzaAoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEludmFsaWRJbXBsZW1lbnRhdGlvbk5hbWVgIC0gTmFtZSBpcyBlbXB0eSBvciB0b28gbG9uZwoqIGBJbnZhbGlkVmVyc2lvbmAgLSBWZXJzaW9uIGlzIGVtcHR5IG9yIHRvbyBsb25nCiogYEltcGxlbWVudGF0aW9uQWxyZWFkeVJlZ2lzdGVyZWRgIC0gQSByZWNvcmQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgaGFzaAoocmVjb3JkcyBhcmUgaW1tdXRhYmxlOiBubyByZW5hbWluZywgcmUtdmVyc2lvbmluZyBvciB1bi1yZXZva2luZykAAAAAABdyZWdpc3Rlcl9pbXBsZW1lbnRhdGlvbgAAAAADAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAKRHZXQgbGF0ZXN0IHZlcnNpb24gb2YgYW4gaW1wbGVtZW50YXRpb24gYnkgbmFtZS4KCiMgQXJndW1lbnRzCgoqIGBuYW1lYCAtIEltcGxlbWVudGF0aW9uIG5hbWUKCiMgUmV0dXJucwoKVGhlIGxhdGVzdCBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLCBvciBgTm9uZWAgaWYgbm90IGZvdW5kLgAAABlnZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAEbmFtZQAAABAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAAQhSZXR1cm5zIHRoZSByZWdpc3RlcmVkIHJlbGVhc2UgdmVyc2lvbiBmb3IgYSBXQVNNIGhhc2gsIGluY2x1ZGluZwpyZXZva2VkIGhhc2hlcyAoYSBtb2R1bGUgc3RpbGwgcnVubmluZyBhIHJldm9rZWQgaGFzaCBtdXN0IGJlIGFibGUgdG8KYHN5bmNfdmVyc2lvbmApLiBDYWxsZXJzIHRoYXQgbXVzdCByZWplY3QgcmV2b2tlZCB0YXJnZXRzIHJlbHkgb24KYGlzX3VwZ3JhZGVfYXBwcm92ZWRgLCB3aGljaCBjaGVja3MgdGhlIHRhcmdldCBpcyBub3QgcmV2b2tlZC4AAAAaZ2V0X2ltcGxlbWVudGF0aW9uX3ZlcnNpb24AAAAAAAEAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAA+gAAAAQ", "AAAAAAAAAjJTZXQgdGhlIGN1cnJlbnQgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoZXMgdXNlZCBieSB0aGUgZmFjdG9yeS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB0b2tlbmAgLSBUb2tlbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2gKKiBgbWV0YWRhdGFgIC0gTWV0YWRhdGEgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoCiogYGF1Y3Rpb25gIC0gQXVjdGlvbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoqIGBnb3Zlcm5vcmAgLSBHb3Zlcm5vciBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoqIGB0cmVhc3VyeWAgLSBUcmVhc3VyeSBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gT25lIG9yIG1vcmUgaW1wbGVtZW50YXRpb25zIGRvbid0IGV4aXN0AAAAAAAbc2V0X2N1cnJlbnRfaW1wbGVtZW50YXRpb25zAAAAAAYAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAACG1ldGFkYXRhAAAD7gAAACAAAAAAAAAAB2F1Y3Rpb24AAAAD7gAAACAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAACHRyZWFzdXJ5AAAD7gAAACAAAAAAAAAAC21hcmtldHBsYWNlAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAABAAAAJFFcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzLiBDb2RlcyBsaXZlIGluIHRoZSA5MDAwIHJhbmdlIHNvCnRoZXkgbmV2ZXIgY29sbGlkZSB3aXRoIG1vZHVsZSAoMTF4eC0xM3h4LCAzLCAzMCkgb3IgbWFuYWdlciAoMTB4eCkgY29kZXMuAAAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAALAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAACMpAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAIyoAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAjKwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAACMsAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAjLQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAIy4AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAjLwAAABtPd25lciBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAC093bmVyTm90U2V0AAAAIzAAAAAmYEN1cnJlbnRWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA1WZXJzaW9uTm90U2V0AAAAAAAjMQAAACZUcmVhc3VyeSBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADlRyZWFzdXJ5Tm90U2V0AAAAACMyAAAAJkdvdmVybm9yIGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOR292ZXJub3JOb3RTZXQAAAAAIzM="]),
      options
    );
  }

   static deploy<T = Client>({ admin, current_hash, version }: { admin: string | Address; current_hash: Uint8Array; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, current_hash, version }, options);
  }
  public readonly fromJson = {
    version : this.txFromJson<string>,  get_slug : this.txFromJson<string | null>,  get_admin : this.txFromJson<string | null>,  wasm_hash : this.txFromJson<Uint8Array>,  create_dao : this.txFromJson<Result<DaoAddresses, ManagerError>>,  launch_dao : this.txFromJson<Result<null, ManagerError>>,  accept_admin : this.txFromJson<Result<null, ManagerError>>,  bump_slug_ttl : this.txFromJson<Result<null, ManagerError>>,  pause_factory : this.txFromJson<Result<null, ManagerError>>,  propose_admin : this.txFromJson<Result<null, ManagerError>>,  approve_upgrade : this.txFromJson<Result<null, ManagerError>>,  get_dao_by_slug : this.txFromJson<Result<string, ManagerError>>,  get_pending_dao : this.txFromJson<PendingDao | null>,  unpause_factory : this.txFromJson<Result<null, ManagerError>>,  upgrade_manager : this.txFromJson<Result<null, ManagerError>>,  get_pending_admin : this.txFromJson<string | null>,  predict_addresses : this.txFromJson<Result<DaoAddresses, ManagerError>>,  get_implementation : this.txFromJson<ImplementationVersion | null>,  get_platform_minter : this.txFromJson<string | null>,  is_upgrade_approved : this.txFromJson<boolean>,  set_platform_minter : this.txFromJson<Result<null, ManagerError>>,  cancel_pending_admin : this.txFromJson<Result<null, ManagerError>>,  revoke_implementation : this.txFromJson<Result<null, ManagerError>>,  register_implementation : this.txFromJson<Result<null, ManagerError>>,  get_latest_implementation : this.txFromJson<ImplementationVersion | null>,  get_implementation_version : this.txFromJson<string | null>,  set_current_implementations : this.txFromJson<Result<null, ManagerError>>
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