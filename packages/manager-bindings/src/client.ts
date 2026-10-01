import {DaoCreationParams, DaoAddresses, ManagerError, LaunchConfig, PendingDao, ImplementationVersion, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
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
   * # Returns
   *
   * All deployed contract addresses
   *
   * # Errors
   *
   * * `FactoryPaused` - Factory is paused
   * * `NonceAlreadyUsed` - This (creator, nonce) pair was already used
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
   *
   * # Validation
   *
   * - Token total supply must be > 0 (at least one token minted)
   * - launch_admin must be the current token owner
   *
   * # Effects
   *
   * 1. Validates launch preconditions
   * 2. Grants Treasury and Marketplace mint authority over tokens
   * 3. Optionally grants Auction mint authority if launch_auction is true
   * 4. Transfers Token, Governor, Treasury, Marketplace, and Auction ownership to Treasury
   * 5. Transfers Metadata upgrade authority to Treasury
   * 6. Conditionally unpauses Auction and Marketplace based on launch_config
   * 7. Deletes the temporary PendingDao state
   */
  launch_dao({ token_address, launch_config }: { token_address: string | Address; launch_config: LaunchConfig }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
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
   * * `InvalidUpgradePath` - One or both implementations don't exist or are revoked
   */
  approve_upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
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
  get_dao_creation({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<PendingDao | null>>;
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
   * Check if an upgrade is approved.
   *
   * # Arguments
   *
   * * `from_hash` - Source WASM hash
   * * `to_hash` - Target WASM hash
   *
   * # Returns
   *
   * `true` if upgrade is approved and neither implementation is revoked.
   */
  is_upgrade_approved({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
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
      new Spec(["AAAABAAAAAAAAAAAAAAADE1hbmFnZXJFcnJvcgAAAB4AAAAlTm90IGF1dGhvcml6ZWQgdG8gcGVyZm9ybSB0aGlzIGFjdGlvbgAAAAAAAAxVbmF1dGhvcml6ZWQAAAPoAAAAG0ludmFsaWQgaW1wbGVtZW50YXRpb24gbmFtZQAAAAAZSW52YWxpZEltcGxlbWVudGF0aW9uTmFtZQAAAAAAA+kAAAAWSW52YWxpZCB2ZXJzaW9uIG51bWJlcgAAAAAADkludmFsaWRWZXJzaW9uAAAAAAPqAAAAGEltcGxlbWVudGF0aW9uIG5vdCBmb3VuZAAAABZJbXBsZW1lbnRhdGlvbk5vdEZvdW5kAAAAAAPrAAAAHkltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAAAAAHEltcGxlbWVudGF0aW9uQWxyZWFkeVJldm9rZWQAAAPsAAAAFEludmFsaWQgdXBncmFkZSBwYXRoAAAAEkludmFsaWRVcGdyYWRlUGF0aAAAAAAD7QAAAA1BZG1pbiBub3Qgc2V0AAAAAAAAC0FkbWluTm90U2V0AAAAA+4AAAATREFPIGNyZWF0aW9uIGZhaWxlZAAAAAARRGFvQ3JlYXRpb25GYWlsZWQAAAAAAARMAAAAEUZhY3RvcnkgaXMgcGF1c2VkAAAAAAAADUZhY3RvcnlQYXVzZWQAAAAAAARNAAAAEk5vbmNlIGFscmVhZHkgdXNlZAAAAAAAEE5vbmNlQWxyZWFkeVVzZWQAAAROAAAAGEludmFsaWQgcGFyYW1ldGVyIGJvdW5kcwAAABJJbnZhbGlkUGFyYW1Cb3VuZHMAAAAABE8AAAAxRm91bmRlciBhbGxvY2F0aW9ucyBleGNlZWQgdGhlIGNvbmZpZ3VyZWQgbWF4aW11bQAAAAAAABdGb3VuZGVyc0V4Y2VlZDk5UGVyY2VudAAAAARQAAAAG0ludmFsaWQgcXVvcnVtIGJhc2lzIHBvaW50cwAAAAAQSW52YWxpZFF1b3J1bUJwcwAABFEAAAAnSW52YWxpZCBwcm9wb3NhbCB0aHJlc2hvbGQgYmFzaXMgcG9pbnRzAAAAABtJbnZhbGlkUHJvcG9zYWxUaHJlc2hvbGRCcHMAAAAEUgAAABBJbnZhbGlkIGR1cmF0aW9uAAAAD0ludmFsaWREdXJhdGlvbgAAAARTAAAAE0ludmFsaWQgdGltZSBidWZmZXIAAAAAEUludmFsaWRUaW1lQnVmZmVyAAAAAAAEVAAAABFEZXBsb3ltZW50IGZhaWxlZAAAAAAAABBEZXBsb3ltZW50RmFpbGVkAAAEVQAAABVJbml0aWFsaXphdGlvbiBmYWlsZWQAAAAAAAAUSW5pdGlhbGl6YXRpb25GYWlsZWQAAARWAAAAFUludmFsaWQgcGF5bWVudCBhc3NldAAAAAAAABNJbnZhbGlkUGF5bWVudEFzc2V0AAAABFcAAAAPU3RyaW5nIHRvbyBsb25nAAAAAA1TdHJpbmdUb29Mb25nAAAAAAAEWAAAAAxTdHJpbmcgZW1wdHkAAAALU3RyaW5nRW1wdHkAAAAEWQAAABpJbnZhbGlkIGZvdW5kZXIgYWxsb2NhdGlvbgAAAAAAE05vRm91bmRlcnNTcGVjaWZpZWQAAAAEWgAAABpJbnZhbGlkIGZvdW5kZXIgYWxsb2NhdGlvbgAAAAAAGEludmFsaWRGb3VuZGVyUGVyY2VudGFnZQAABFsAAABBR292ZXJuYW5jZSB0aW1pbmcgZG9lcyBub3QgZml0IHRoZSBHb3Zlcm5vciBjb250cmFjdCdzIHUzMiBmaWVsZHMAAAAAAAAXSW52YWxpZEdvdmVybmFuY2VUaW1pbmcAAAAEXQAAADVGb3VuZGVyIGFsbG9jYXRpb25zIGV4Y2VlZCB0aGUgZmFjdG9yeSByZXNvdXJjZSBsaW1pdAAAAAAAABlGb3VuZGVyQWxsb2NhdGlvblRvb0xhcmdlAAAAAAAEXgAAADZUaGUgYXVjdGlvbiBtdXN0IHJlbWFpbiBwYXVzZWQgd2hlbiBpdCBpcyBub3QgbGF1bmNoZWQAAAAAABNBdWN0aW9uTXVzdEJlUGF1c2VkAAAABF8AAAAfQ3VycmVudCBpbXBsZW1lbnRhdGlvbnMgbm90IHNldAAAAAAcQ3VycmVudEltcGxlbWVudGF0aW9uc05vdFNldAAABFwAAAAWREFPIGFscmVhZHkgcmVnaXN0ZXJlZAAAAAAAFERhb0FscmVhZHlSZWdpc3RlcmVkAAAEsAAAAA1EQU8gbm90IGZvdW5kAAAAAAAAC0Rhb05vdEZvdW5kAAAABLEAAAAdSW52YWxpZCBwYWdp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", "AAAAAQAAAE9UaGUgb25seSBmYWN0b3J5IHN0YXRlIHJldGFpbmVkIHVudGlsIHRoZSBsYXVuY2ggYWRtaW5pc3RyYXRvciBmaW5hbGl6ZXMgYSBEQU8uAAAAAAAAAAAKUGVuZGluZ0RhbwAAAAAAAgAAAAAAAAAJYWRkcmVzc2VzAAAAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAAAAAAADGxhdW5jaF9hZG1pbgAAABM=", "AAAAAQAAAAAAAAAAAAAADERhb0FkZHJlc3NlcwAAAAYAAAAAAAAAB2F1Y3Rpb24AAAAAEwAAAAAAAAAIZ292ZXJub3IAAAATAAAAAAAAAAttYXJrZXRwbGFjZQAAAAATAAAAAAAAAAhtZXRhZGF0YQAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAAT", "AAAAAQAAAAAAAAAAAAAADExhdW5jaENvbmZpZwAAAAIAAAAAAAAADmxhdW5jaF9hdWN0aW9uAAAAAAABAAAAAAAAABJsYXVuY2hfbWFya2V0cGxhY2UAAAAAAAE=", "AAAAAQAAAAAAAAAAAAAADUF1Y3Rpb25Db25maWcAAAAAAAAEAAAAAAAAAAhkdXJhdGlvbgAAAAYAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAALdGltZV9idWZmZXIAAAAABg==", "AAAAAQAAAAAAAAAAAAAAD1VwZ3JhZGVBcHByb3ZhbAAAAAADAAAAAAAAAAthcHByb3ZlZF9hdAAAAAAGAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIA==", "AAAAAQAAAAAAAAAAAAAAEEFydHdvcmtJcGZzR3JvdXAAAAACAAAAAAAAAAhiYXNlX3VyaQAAABAAAAAAAAAACWV4dGVuc2lvbgAAAAAAABA=", "AAAAAQAAAAAAAAAAAAAAEEdvdmVybmFuY2VDb25maWcAAAAFAAAAAAAAABJwcm9wb3NhbF90aHJlc2hvbGQAAAAAAAoAAAAAAAAAC3F1ZXVlX2RlbGF5AAAAAAQAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAAAAAADHZvdGluZ19kZWxheQAAAAQAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAE", "AAAAAQAAAAAAAAAAAAAAEURhb0NyZWF0aW9uUGFyYW1zAAAAAAAABAAAAAAAAAAIZGVwbG95ZXIAAAATAAAAAAAAAA5pbml0aWFsX2NvbmZpZwAAAAAH0AAAABZJbml0aWFsRGFvQ29uZmlnVmFsdWVzAAAAAAAAAAAADGxhdW5jaF9hZG1pbgAAABMAAAAAAAAABW5vbmNlAAAAAAAABg==", "AAAAAQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAAAgAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAEXNlY29uZGFyeV9mZWVfYnBzAAAAAAAABA==", "AAAAAQAAAAAAAAAAAAAAFUltcGxlbWVudGF0aW9uVmVyc2lvbgAAAAAAAAUAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAxwdWJsaXNoZWRfYXQAAAAGAAAAAAAAAAdyZXZva2VkAAAAAAEAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACA=", "AAAAAQAAAAAAAAAAAAAAFkluaXRpYWxEYW9Db25maWdWYWx1ZXMAAAAAAAoAAAAAAAAAB2F1Y3Rpb24AAAAH0AAAAA1BdWN0aW9uQ29uZmlnAAAAAAAAAAAAAA5jb250cmFjdF9pbWFnZQAAAAAAEAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAKZ292ZXJuYW5jZQAAAAAH0AAAABBHb3Zlcm5hbmNlQ29uZmlnAAAAAAAAAAttYXJrZXRwbGFjZQAAAAfQAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAAAAAAAAtwcm9qZWN0X3VyaQAAAAAQAAAAAAAAAA1yZW5kZXJlcl9iYXNlAAAAAAAAEAAAAAAAAAAKdG9rZW5fbmFtZQAAAAAAEAAAAAAAAAAMdG9rZW5fc3ltYm9sAAAAEAAAAAAAAAAJdG9rZW5fdXJpAAAAAAAAEA==", "AAAAAAAAAgVDcmVhdGUgYSBuZXcgREFPIHdpdGggYWxsIDYgbW9kdWxlcyBhdG9taWNhbGx5IGRlcGxveWVkLgoKVGhpcyBkZXBsb3lzIGFsbCBzaXggbW9kdWxlcyB3aXRoIHNhZmUgZGVmYXVsdHMuIFRoZSBsYXVuY2ggYWRtaW5pc3RyYXRvcgpvd25zIHRoZSBzZXR1cCB3aW5kb3cgYW5kIG1heSBjb25maWd1cmUgdGhlIG1vZHVsZXMgYmVmb3JlIGBsYXVuY2hfZGFvYC4KCiMgQXJndW1lbnRzCgoqIGBwYXJhbXNgIC0gRGVwbG95ZXIsIGRldGVybWluaXN0aWMgbm9uY2UsIGFuZCBsYXVuY2ggYWRtaW5pc3RyYXRvcgoKIyBSZXR1cm5zCgpBbGwgZGVwbG95ZWQgY29udHJhY3QgYWRkcmVzc2VzCgojIEVycm9ycwoKKiBgRmFjdG9yeVBhdXNlZGAgLSBGYWN0b3J5IGlzIHBhdXNlZAoqIGBOb25jZUFscmVhZHlVc2VkYCAtIFRoaXMgKGNyZWF0b3IsIG5vbmNlKSBwYWlyIHdhcyBhbHJlYWR5IHVzZWQKKiBgQ3VycmVudEltcGxlbWVudGF0aW9uc05vdFNldGAgLSBDdXJyZW50IFdBU00gaGFzaGVzIG5vdCBjb25maWd1cmVkAAAAAAAACmNyZWF0ZV9kYW8AAAAAAAEAAAAAAAAABnBhcmFtcwAAAAAH0AAAABFEYW9DcmVhdGlvblBhcmFtcwAAAAAAAAEAAAPpAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAA4FMYXVuY2ggYSBjb25maWd1cmVkIERBTy4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSB0aGUgbGF1bmNoX2FkbWluIHdobyBjcmVhdGVkIHRoZSBEQU8uCgojIEFyZ3VtZW50cwoKKiBgdG9rZW5fYWRkcmVzc2AgLSBBZGRyZXNzIG9mIHRoZSBEQU8ncyB0b2tlbiBjb250cmFjdAoqIGBsYXVuY2hfY29uZmlnYCAtIENvbmZpZ3VyYXRpb24gZm9yIHdoYXQgdG8gZW5hYmxlIGF0IGxhdW5jaAotIGBsYXVuY2hfYXVjdGlvbmAgLSBXaGV0aGVyIHRvIHVucGF1c2UgdGhlIGF1Y3Rpb24KLSBgbGF1bmNoX21hcmtldHBsYWNlYCAtIFdoZXRoZXIgdG8gdW5wYXVzZSB0aGUgbWFya2V0cGxhY2UKCiMgVmFsaWRhdGlvbgoKLSBUb2tlbiB0b3RhbCBzdXBwbHkgbXVzdCBiZSA+IDAgKGF0IGxlYXN0IG9uZSB0b2tlbiBtaW50ZWQpCi0gbGF1bmNoX2FkbWluIG11c3QgYmUgdGhlIGN1cnJlbnQgdG9rZW4gb3duZXIKCiMgRWZmZWN0cwoKMS4gVmFsaWRhdGVzIGxhdW5jaCBwcmVjb25kaXRpb25zCjIuIEdyYW50cyBUcmVhc3VyeSBhbmQgTWFya2V0cGxhY2UgbWludCBhdXRob3JpdHkgb3ZlciB0b2tlbnMKMy4gT3B0aW9uYWxseSBncmFudHMgQXVjdGlvbiBtaW50IGF1dGhvcml0eSBpZiBsYXVuY2hfYXVjdGlvbiBpcyB0cnVlCjQuIFRyYW5zZmVycyBUb2tlbiwgR292ZXJub3IsIFRyZWFzdXJ5LCBNYXJrZXRwbGFjZSwgYW5kIEF1Y3Rpb24gb3duZXJzaGlwIHRvIFRyZWFzdXJ5CjUuIFRyYW5zZmVycyBNZXRhZGF0YSB1cGdyYWRlIGF1dGhvcml0eSB0byBUcmVhc3VyeQo2LiBDb25kaXRpb25hbGx5IHVucGF1c2VzIEF1Y3Rpb24gYW5kIE1hcmtldHBsYWNlIGJhc2VkIG9uIGxhdW5jaF9jb25maWcKNy4gRGVsZXRlcyB0aGUgdGVtcG9yYXJ5IFBlbmRpbmdEYW8gc3RhdGUAAAAAAAAKbGF1bmNoX2RhbwAAAAAAAgAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAAAAAAADWxhdW5jaF9jb25maWcAAAAAAAfQAAAADExhdW5jaENvbmZpZwAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAQ1Jbml0aWFsaXplIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IHdpdGggYW4gYWRtaW4uCgojIEFyZ3VtZW50cwoKKiBgYWRtaW5gIC0gVGhlIGFkZHJlc3MgdGhhdCB3aWxsIGNvbnRyb2wgaW1wbGVtZW50YXRpb24gbWFuYWdlbWVudCBhbmQgZmFjdG9yeSBzZXR0aW5ncwoqIGBjdXJyZW50X2hhc2hgIC0gQ3VycmVudCBNYW5hZ2VyIFdBU00gaGFzaCBmb3IgdXBncmFkZSB0cmFja2luZwoqIGB2ZXJzaW9uYCAtIEN1cnJlbnQgTWFuYWdlciB2ZXJzaW9uIChlLmcuLCAiMC4xLjAiKQAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAA==", "AAAAAAAAAIJQYXVzZSB0aGUgZmFjdG9yeSAoZW1lcmdlbmN5IG1lYXN1cmUpLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluAAAAAAANcGF1c2VfZmFjdG9yeQAAAAAAAAAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAATVBcHByb3ZlIGFuIHVwZ3JhZGUgcGF0aCBmcm9tIG9uZSBpbXBsZW1lbnRhdGlvbiB0byBhbm90aGVyLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEludmFsaWRVcGdyYWRlUGF0aGAgLSBPbmUgb3IgYm90aCBpbXBsZW1lbnRhdGlvbnMgZG9uJ3QgZXhpc3Qgb3IgYXJlIHJldm9rZWQAAAAAAAAPYXBwcm92ZV91cGdyYWRlAAAAAAIAAAAAAAAACWZyb21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAAAAAAAPZ2V0X3BlbmRpbmdfZGFvAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAAClBlbmRpbmdEYW8AAA==", "AAAAAAAAAHBVbnBhdXNlIHRoZSBmYWN0b3J5LgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluAAAAD3VucGF1c2VfZmFjdG9yeQAAAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAaFVcGdyYWRlIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IGl0c2VsZi4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGBmcm9tX2hhc2hgIC0gQ3VycmVudCBNYW5hZ2VyIFdBU00gaGFzaCAobXVzdCBtYXRjaCBzdG9yZWQgaGFzaCkKKiBgdG9faGFzaGAgLSBUYXJnZXQgTWFuYWdlciBXQVNNIGhhc2ggKG11c3QgYmUgcmVnaXN0ZXJlZCBhbmQgYWN0aXZlKQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gVGFyZ2V0IGltcGxlbWVudGF0aW9uIGRvZXNuJ3QgZXhpc3Qgb3IgaXMgcmV2b2tlZAoqIGBJbnZhbGlkVmVyc2lvbmAgLSBmcm9tX2hhc2ggZG9lc24ndCBtYXRjaCBjdXJyZW50IGhhc2gAAAAAAAAPdXBncmFkZV9tYW5hZ2VyAAAAAAIAAAAAAAAACWZyb21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAAAAAAAQZ2V0X2Rhb19jcmVhdGlvbgAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAAClBlbmRpbmdEYW8AAA==", "AAAAAAAAAOdQcmVkaWN0IERBTyBhZGRyZXNzZXMgd2l0aG91dCBkZXBsb3lpbmcuCgpVc2VmdWwgZm9yIGZyb250ZW5kcyB0byBzaG93IGFkZHJlc3NlcyBiZWZvcmUgdXNlciBjb25maXJtcyBkZXBsb3ltZW50LgoKIyBBcmd1bWVudHMKCiogYGNyZWF0b3JgIC0gQ3JlYXRvciBhZGRyZXNzCiogYG5vbmNlYCAtIE5vbmNlIHZhbHVlCgojIFJldHVybnMKClByZWRpY3RlZCBhZGRyZXNzZXMgZm9yIGFsbCA2IG1vZHVsZXMAAAAAEXByZWRpY3RfYWRkcmVzc2VzAAAAAAAAAgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAVub25jZQAAAAAAAAYAAAABAAAD6QAAB9AAAAAMRGFvQWRkcmVzc2VzAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAJFHZXQgaW1wbGVtZW50YXRpb24gYnkgV0FTTSBoYXNoLgoKIyBBcmd1bWVudHMKCiogYHdhc21faGFzaGAgLSBXQVNNIGhhc2ggdG8gcXVlcnkKCiMgUmV0dXJucwoKVGhlIGltcGxlbWVudGF0aW9uIHZlcnNpb24sIG9yIGBOb25lYCBpZiBub3QgZm91bmQuAAAAAAAAEmdldF9pbXBsZW1lbnRhdGlvbgAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAAL9DaGVjayBpZiBhbiB1cGdyYWRlIGlzIGFwcHJvdmVkLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBSZXR1cm5zCgpgdHJ1ZWAgaWYgdXBncmFkZSBpcyBhcHByb3ZlZCBhbmQgbmVpdGhlciBpbXBsZW1lbnRhdGlvbiBpcyByZXZva2VkLgAAAAATaXNfdXBncmFkZV9hcHByb3ZlZAAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAAB", "AAAAAAAAATdSZXZva2UgYW4gaW1wbGVtZW50YXRpb24gKGVtZXJnZW5jeSBtZWFzdXJlKS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB3YXNtX2hhc2hgIC0gV0FTTSBoYXNoIHRvIHJldm9rZQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gSW1wbGVtZW50YXRpb24gZG9lc24ndCBleGlzdAoqIGBJbXBsZW1lbnRhdGlvbkFscmVhZHlSZXZva2VkYCAtIEltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAAAAVcmV2b2tlX2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAYdSZWdpc3RlciBhIG5ldyBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYG5hbWVgIC0gSW1wbGVtZW50YXRpb24gbmFtZSAoZS5nLiwgIlRva2VuIiwgIkdvdmVybm9yIikKKiBgdmVyc2lvbmAgLSBWZXJzaW9uIHN0cmluZyAoZS5nLiwgIjAuMS4wIikKKiBgd2FzbV9oYXNoYCAtIFdBU00gYnl0ZWNvZGUgaGFzaAoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEludmFsaWRJbXBsZW1lbnRhdGlvbk5hbWVgIC0gTmFtZSBpcyBlbXB0eSBvciB0b28gbG9uZwoqIGBJbnZhbGlkVmVyc2lvbmAgLSBWZXJzaW9uIGlzIGVtcHR5IG9yIHRvbyBsb25nAAAAABdyZWdpc3Rlcl9pbXBsZW1lbnRhdGlvbgAAAAADAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAKRHZXQgbGF0ZXN0IHZlcnNpb24gb2YgYW4gaW1wbGVtZW50YXRpb24gYnkgbmFtZS4KCiMgQXJndW1lbnRzCgoqIGBuYW1lYCAtIEltcGxlbWVudGF0aW9uIG5hbWUKCiMgUmV0dXJucwoKVGhlIGxhdGVzdCBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLCBvciBgTm9uZWAgaWYgbm90IGZvdW5kLgAAABlnZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAEbmFtZQAAABAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAAjJTZXQgdGhlIGN1cnJlbnQgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoZXMgdXNlZCBieSB0aGUgZmFjdG9yeS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB0b2tlbmAgLSBUb2tlbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2gKKiBgbWV0YWRhdGFgIC0gTWV0YWRhdGEgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoCiogYGF1Y3Rpb25gIC0gQXVjdGlvbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoqIGBnb3Zlcm5vcmAgLSBHb3Zlcm5vciBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoqIGB0cmVhc3VyeWAgLSBUcmVhc3VyeSBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gT25lIG9yIG1vcmUgaW1wbGVtZW50YXRpb25zIGRvbid0IGV4aXN0AAAAAAAbc2V0X2N1cnJlbnRfaW1wbGVtZW50YXRpb25zAAAAAAYAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAACG1ldGFkYXRhAAAD7gAAACAAAAAAAAAAB2F1Y3Rpb24AAAAD7gAAACAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAACHRyZWFzdXJ5AAAD7gAAACAAAAAAAAAAC21hcmtldHBsYWNlAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAgAAAONDb250ZXh0IG9mIGEgc2luZ2xlIGF1dGhvcml6ZWQgY2FsbCBwZXJmb3JtZWQgYnkgYW4gYWRkcmVzcy4KCkN1c3RvbSBhY2NvdW50IGNvbnRyYWN0cyB0aGF0IGltcGxlbWVudCBgX19jaGVja19hdXRoYCBzcGVjaWFsIGZ1bmN0aW9uCnJlY2VpdmUgYSBsaXN0IG9mIGBDb250ZXh0YCB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byBhbGwgdGhlIGNhbGxzIHRoYXQKbmVlZCB0byBiZSBhdXRob3JpemVkLgAAAAAAAAAAB0NvbnRleHQAAAAAAwAAAAEAAAAUQ29udHJhY3QgaW52b2NhdGlvbi4AAAAIQ29udHJhY3QAAAABAAAH0AAAAA9Db250cmFjdENvbnRleHQAAAAAAQAAAD1Db250cmFjdCB0aGF0IGhhcyBhIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIGlzIGNyZWF0ZWQuAAAAAAAAFENyZWF0ZUNvbnRyYWN0SG9zdEZuAAAAAQAAB9AAAAAbQ3JlYXRlQ29udHJhY3RIb3N0Rm5Db250ZXh0AAAAAAEAAABEQ29udHJhY3QgdGhhdCBoYXMgYSBjb25zdHJ1Y3RvciB3aXRoIDEgb3IgbW9yZSBhcmd1bWVudHMgaXMgY3JlYXRlZC4AAAAcQ3JlYXRlQ29udHJhY3RXaXRoQ3Rvckhvc3RGbgAAAAEAAAfQAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAA", "AAAAAQAAAL1BdXRob3JpemF0aW9uIGNvbnRleHQgb2YgYSBzaW5nbGUgY29udHJhY3QgY2FsbC4KClRoaXMgc3RydWN0IGNvcnJlc3BvbmRzIHRvIGEgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgY2FsbCBmb3IgYW4gYWRkcmVzcwpmcm9tIGBjb250cmFjdGAgZnVuY3Rpb24gd2l0aCBgZm5fbmFtZWAgbmFtZSBhbmQgYGFyZ3NgIGFyZ3VtZW50cy4AAAAAAAAAAAAAD0NvbnRyYWN0Q29udGV4dAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAHZm5fbmFtZQAAAAAR", "AAAAAgAAAF9Db250cmFjdCBleGVjdXRhYmxlIHVzZWQgZm9yIGNyZWF0aW5nIGEgbmV3IGNvbnRyYWN0IGFuZCB1c2VkIGluCmBDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHRgLgAAAAAAAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAQAAAAEAAAAAAAAABFdhc20AAAABAAAD7gAAACA=", "AAAAAQAAADhWYWx1ZSBvZiBjb250cmFjdCBub2RlIGluIEludm9rZXJDb250cmFjdEF1dGhFbnRyeSB0cmVlLgAAAAAAAAAVU3ViQ29udHJhY3RJbnZvY2F0aW9uAAAAAAAAAgAAAAAAAAAHY29udGV4dAAAAAfQAAAAD0NvbnRyYWN0Q29udGV4dAAAAAAAAAAAD3N1Yl9pbnZvY2F0aW9ucwAAAAPqAAAH0AAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnk=", "AAAAAgAAAS9BIG5vZGUgaW4gdGhlIHRyZWUgb2YgYXV0aG9yaXphdGlvbnMgcGVyZm9ybWVkIG9uIGJlaGFsZiBvZiB0aGUgY3VycmVudApjb250cmFjdCBhcyBpbnZva2VyIG9mIHRoZSBjb250cmFjdHMgZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrLgoKVGhpcyBpcyB1c2VkIGFzIGFuIGFyZ3VtZW50IG9mIGBhdXRob3JpemVfYXNfY3VycmVudF9jb250cmFjdGAgaG9zdCBmdW5jdGlvbi4KClRoaXMgdHJlZSBjb3JyZXNwb25kcyBgcmVxdWlyZV9hdXRoW19mb3JfYXJnc11gIGNhbGxzIG9uIGJlaGFsZiBvZiB0aGUKY3VycmVudCBjb250cmFjdC4AAAAAAAAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnkAAAADAAAAAQAAABJJbnZva2UgYSBjb250cmFjdC4AAAAAAAhDb250cmFjdAAAAAEAAAfQAAAAFVN1YkNvbnRyYWN0SW52b2NhdGlvbgAAAAAAAAEAAAA1Q3JlYXRlIGEgY29udHJhY3QgcGFzc2luZyAwIGFyZ3VtZW50cyB0byBjb25zdHJ1Y3Rvci4AAAAAAAAUQ3JlYXRlQ29udHJhY3RIb3N0Rm4AAAABAAAH0AAAABtDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHQAAAAAAQAAAD1DcmVhdGUgYSBjb250cmFjdCBwYXNzaW5nIDAgb3IgbW9yZSBhcmd1bWVudHMgdG8gY29uc3RydWN0b3IuAAAAAAAAHENyZWF0ZUNvbnRyYWN0V2l0aEN0b3JIb3N0Rm4AAAABAAAH0AAAACpDcmVhdGVDb250cmFjdFdpdGhDb25zdHJ1Y3Rvckhvc3RGbkNvbnRleHQAAA==", "AAAAAQAAAHZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuAAAAAAAAAAAAG0NyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dAAAAAACAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAQAAANZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuClRoaXMgaXMgdGhlIHNhbWUgYXMgYENyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dGAsIGJ1dCBhbHNvIGhhcwpjb250cmFjdCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAAAAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAAAAAAAwAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAgAAAAAAAAAAAAAACkV4ZWN1dGFibGUAAAAAAAMAAAABAAAAAAAAAARXYXNtAAAAAQAAA+4AAAAgAAAAAAAAAAAAAAAMU3RlbGxhckFzc2V0AAAAAAAAAAAAAAAHQWNjb3VudAA="]),
      options
    );
  }

   static deploy<T = Client>({ admin, current_hash, version }: { admin: string | Address; current_hash: Uint8Array; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, current_hash, version }, options);
  }
  public readonly fromJson = {
    create_dao : this.txFromJson<Result<DaoAddresses, ManagerError>>,  launch_dao : this.txFromJson<Result<null, ManagerError>>,  pause_factory : this.txFromJson<Result<null, ManagerError>>,  approve_upgrade : this.txFromJson<Result<null, ManagerError>>,  get_pending_dao : this.txFromJson<PendingDao | null>,  unpause_factory : this.txFromJson<Result<null, ManagerError>>,  upgrade_manager : this.txFromJson<Result<null, ManagerError>>,  get_dao_creation : this.txFromJson<PendingDao | null>,  predict_addresses : this.txFromJson<Result<DaoAddresses, ManagerError>>,  get_implementation : this.txFromJson<ImplementationVersion | null>,  is_upgrade_approved : this.txFromJson<boolean>,  revoke_implementation : this.txFromJson<Result<null, ManagerError>>,  register_implementation : this.txFromJson<Result<null, ManagerError>>,  get_latest_implementation : this.txFromJson<ImplementationVersion | null>,  set_current_implementations : this.txFromJson<Result<null, ManagerError>>
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
  daoCreatedEventFilter(topicValues?: { token_address?: string | Address; creator?: string | Address }): string[] {
    return this.spec.eventTopicFilter("DaoCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "DaoLaunched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  daoLaunchedEventFilter(topicValues?: { token_address?: string | Address }): string[] {
    return this.spec.eventTopicFilter("DaoLaunched", topicValues);
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
   * Build a topics filter row for the "ImplementationRevoked" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  implementationRevokedEventFilter(topicValues?: { wasm_hash?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("ImplementationRevoked", topicValues);
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