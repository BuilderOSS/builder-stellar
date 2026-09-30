import {DaoCreationParams, DaoAddresses, ManagerError, PendingDao, ImplementationVersion, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Create a new DAO with all 6 modules atomically deployed.
   *
   * This is the main factory function that:
   * 1. Validates all parameters
   * 2. Checks factory not paused and nonce not used
   * 3. Deploys all 6 contracts (Token, Metadata, Auction, Governor, Treasury, Marketplace)
   * 4. Initializes them with proper cross-references
   * 5. Sets up launch configuration and module relationships
   * 6. Registers the DAO in the registry
   *
   * # Arguments
   *
   * * `params` - Complete DAO creation parameters
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
   * * `InvalidParamBounds` - Invalid parameter values
   * * Various validation errors from `validate_dao_params`
   */
  create_dao({ params }: { params: DaoCreationParams }, options?: MethodOptions): Promise<AssembledTransaction<Result<DaoAddresses, ManagerError>>>;
  /**
   * Closes the launch-admin setup window and hands module ownership to the
   * Treasury. All configuration remains editable by launch_admin until this
   * one-way transition is executed. When `launch_auction` is false, the
   * Auction module remains paused and does not receive mint authority.
   */
  finalize_dao({ token_address, launch_auction }: { token_address: string | Address; launch_auction: boolean }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
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
   * * `version` - Version number (must be > 0)
   * * `wasm_hash` - WASM bytecode hash
   *
   * # Errors
   *
   * * `Unauthorized` - Caller is not admin
   * * `InvalidImplementationName` - Name is empty or too long
   * * `InvalidVersion` - Version is 0
   */
  register_implementation({ name, version, wasm_hash }: { name: string; version: number; wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
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
      new Spec(["AAAABAAAAAAAAAAAAAAADE1hbmFnZXJFcnJvcgAAAB4AAAAlTm90IGF1dGhvcml6ZWQgdG8gcGVyZm9ybSB0aGlzIGFjdGlvbgAAAAAAAAxVbmF1dGhvcml6ZWQAAAPoAAAAG0ludmFsaWQgaW1wbGVtZW50YXRpb24gbmFtZQAAAAAZSW52YWxpZEltcGxlbWVudGF0aW9uTmFtZQAAAAAAA+kAAAAWSW52YWxpZCB2ZXJzaW9uIG51bWJlcgAAAAAADkludmFsaWRWZXJzaW9uAAAAAAPqAAAAGEltcGxlbWVudGF0aW9uIG5vdCBmb3VuZAAAABZJbXBsZW1lbnRhdGlvbk5vdEZvdW5kAAAAAAPrAAAAHkltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAAAAAHEltcGxlbWVudGF0aW9uQWxyZWFkeVJldm9rZWQAAAPsAAAAFEludmFsaWQgdXBncmFkZSBwYXRoAAAAEkludmFsaWRVcGdyYWRlUGF0aAAAAAAD7QAAAA1BZG1pbiBub3Qgc2V0AAAAAAAAC0FkbWluTm90U2V0AAAAA+4AAAATREFPIGNyZWF0aW9uIGZhaWxlZAAAAAARRGFvQ3JlYXRpb25GYWlsZWQAAAAAAARMAAAAEUZhY3RvcnkgaXMgcGF1c2VkAAAAAAAADUZhY3RvcnlQYXVzZWQAAAAAAARNAAAAEk5vbmNlIGFscmVhZHkgdXNlZAAAAAAAEE5vbmNlQWxyZWFkeVVzZWQAAAROAAAAGEludmFsaWQgcGFyYW1ldGVyIGJvdW5kcwAAABJJbnZhbGlkUGFyYW1Cb3VuZHMAAAAABE8AAAAxRm91bmRlciBhbGxvY2F0aW9ucyBleGNlZWQgdGhlIGNvbmZpZ3VyZWQgbWF4aW11bQAAAAAAABdGb3VuZGVyc0V4Y2VlZDk5UGVyY2VudAAAAARQAAAAG0ludmFsaWQgcXVvcnVtIGJhc2lzIHBvaW50cwAAAAAQSW52YWxpZFF1b3J1bUJwcwAABFEAAAAnSW52YWxpZCBwcm9wb3NhbCB0aHJlc2hvbGQgYmFzaXMgcG9pbnRzAAAAABtJbnZhbGlkUHJvcG9zYWxUaHJlc2hvbGRCcHMAAAAEUgAAABBJbnZhbGlkIGR1cmF0aW9uAAAAD0ludmFsaWREdXJhdGlvbgAAAARTAAAAE0ludmFsaWQgdGltZSBidWZmZXIAAAAAEUludmFsaWRUaW1lQnVmZmVyAAAAAAAEVAAAABFEZXBsb3ltZW50IGZhaWxlZAAAAAAAABBEZXBsb3ltZW50RmFpbGVkAAAEVQAAABVJbml0aWFsaXphdGlvbiBmYWlsZWQAAAAAAAAUSW5pdGlhbGl6YXRpb25GYWlsZWQAAARWAAAAFUludmFsaWQgcGF5bWVudCBhc3NldAAAAAAAABNJbnZhbGlkUGF5bWVudEFzc2V0AAAABFcAAAAPU3RyaW5nIHRvbyBsb25nAAAAAA1TdHJpbmdUb29Mb25nAAAAAAAEWAAAAAxTdHJpbmcgZW1wdHkAAAALU3RyaW5nRW1wdHkAAAAEWQAAABpJbnZhbGlkIGZvdW5kZXIgYWxsb2NhdGlvbgAAAAAAE05vRm91bmRlcnNTcGVjaWZpZWQAAAAEWgAAABpJbnZhbGlkIGZvdW5kZXIgYWxsb2NhdGlvbgAAAAAAGEludmFsaWRGb3VuZGVyUGVyY2VudGFnZQAABFsAAABBR292ZXJuYW5jZSB0aW1pbmcgZG9lcyBub3QgZml0IHRoZSBHb3Zlcm5vciBjb250cmFjdCdzIHUzMiBmaWVsZHMAAAAAAAAXSW52YWxpZEdvdmVybmFuY2VUaW1pbmcAAAAEXQAAADVGb3VuZGVyIGFsbG9jYXRpb25zIGV4Y2VlZCB0aGUgZmFjdG9yeSByZXNvdXJjZSBsaW1pdAAAAAAAABlGb3VuZGVyQWxsb2NhdGlvblRvb0xhcmdlAAAAAAAEXgAAADZUaGUgYXVjdGlvbiBtdXN0IHJlbWFpbiBwYXVzZWQgd2hlbiBpdCBpcyBub3QgbGF1bmNoZWQAAAAAABNBdWN0aW9uTXVzdEJlUGF1c2VkAAAABF8AAAAfQ3VycmVudCBpbXBsZW1lbnRhdGlvbnMgbm90IHNldAAAAAAcQ3VycmVudEltcGxlbWVudGF0aW9uc05vdFNldAAABFwAAAAWREFPIGFscmVhZHkgcmVnaXN0ZXJlZAAAAAAAFERhb0FscmVhZHlSZWdpc3RlcmVkAAAEsAAAAA1EQU8gbm90IGZvdW5kAAAAAAAAC0Rhb05vdEZvdW5kAAAABLEAAAAdSW52YWxpZCBwYWdp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", "AAAAAQAAAE9UaGUgb25seSBmYWN0b3J5IHN0YXRlIHJldGFpbmVkIHVudGlsIHRoZSBsYXVuY2ggYWRtaW5pc3RyYXRvciBmaW5hbGl6ZXMgYSBEQU8uAAAAAAAAAAAKUGVuZGluZ0RhbwAAAAAABAAAAAAAAAAJYWRkcmVzc2VzAAAAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAOZm91bmRlcl9zdXBwbHkAAAAAAAQAAAAAAAAADGxhdW5jaF9hZG1pbgAAABM=", "AAAAAQAAAAAAAAAAAAAAC0FydHdvcmtJdGVtAAAAAAMAAAAAAAAAD2lzX25ld19wcm9wZXJ0eQAAAAABAAAAAAAAAARuYW1lAAAAEAAAAAAAAAALcHJvcGVydHlfaWQAAAAABA==", "AAAAAQAAAAAAAAAAAAAADERhb0FkZHJlc3NlcwAAAAYAAAAAAAAAB2F1Y3Rpb24AAAAAEwAAAAAAAAAIZ292ZXJub3IAAAATAAAAAAAAAAttYXJrZXRwbGFjZQAAAAATAAAAAAAAAAhtZXRhZGF0YQAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAAT", "AAAAAQAAAAAAAAAAAAAAD1VwZ3JhZGVBcHByb3ZhbAAAAAADAAAAAAAAAAthcHByb3ZlZF9hdAAAAAAGAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIA==", "AAAAAQAAAAAAAAAAAAAAEEFydHdvcmtJcGZzR3JvdXAAAAACAAAAAAAAAAhiYXNlX3VyaQAAABAAAAAAAAAACWV4dGVuc2lvbgAAAAAAABA=", "AAAAAQAAAAAAAAAAAAAAEURhb0NyZWF0aW9uUGFyYW1zAAAAAAAAFgAAAAAAAAAMYXJ0d29ya19pcGZzAAAH0AAAABBBcnR3b3JrSXBmc0dyb3VwAAAAAAAAAA1hcnR3b3JrX2l0ZW1zAAAAAAAD6gAAB9AAAAALQXJ0d29ya0l0ZW0AAAAAAAAAABZhcnR3b3JrX3Byb3BlcnR5X25hbWVzAAAAAAPqAAAAEAAAAAAAAAAQYXVjdGlvbl9kdXJhdGlvbgAAAAYAAAAAAAAADmNvbnRyYWN0X2ltYWdlAAAAAAAQAAAAAAAAAAhkZXBsb3llcgAAABMAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAACGZvdW5kZXJzAAAD6gAAB9AAAAARRm91bmRlckFsbG9jYXRpb24AAAAAAAAAAAAADGxhdW5jaF9hZG1pbgAAABMAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAC3Byb2plY3RfdXJpAAAAABAAAAAAAAAAFnByb3Bvc2FsX3RocmVzaG9sZF9icHMAAAAAAAQAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAAAAAADXJlbmRlcmVyX2Jhc2UAAAAAAAAQAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAALdGltZV9idWZmZXIAAAAABgAAAAAAAAAKdG9rZW5fbmFtZQAAAAAAEAAAAAAAAAAMdG9rZW5fc3ltYm9sAAAAEAAAAAAAAAAJdG9rZW5fdXJpAAAAAAAAEAAAAAAAAAAMdm90aW5nX2RlbGF5AAAABgAAAAAAAAANdm90aW5nX3BlcmlvZAAAAAAAAAY=", "AAAAAQAAAAAAAAAAAAAAEUZvdW5kZXJBbGxvY2F0aW9uAAAAAAAAAgAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAQ=", "AAAAAQAAAAAAAAAAAAAAFUltcGxlbWVudGF0aW9uVmVyc2lvbgAAAAAAAAUAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAxwdWJsaXNoZWRfYXQAAAAGAAAAAAAAAAdyZXZva2VkAAAAAAEAAAAAAAAAB3ZlcnNpb24AAAAABAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACA=", "AAAAAAAAAx5DcmVhdGUgYSBuZXcgREFPIHdpdGggYWxsIDYgbW9kdWxlcyBhdG9taWNhbGx5IGRlcGxveWVkLgoKVGhpcyBpcyB0aGUgbWFpbiBmYWN0b3J5IGZ1bmN0aW9uIHRoYXQ6CjEuIFZhbGlkYXRlcyBhbGwgcGFyYW1ldGVycwoyLiBDaGVja3MgZmFjdG9yeSBub3QgcGF1c2VkIGFuZCBub25jZSBub3QgdXNlZAozLiBEZXBsb3lzIGFsbCA2IGNvbnRyYWN0cyAoVG9rZW4sIE1ldGFkYXRhLCBBdWN0aW9uLCBHb3Zlcm5vciwgVHJlYXN1cnksIE1hcmtldHBsYWNlKQo0LiBJbml0aWFsaXplcyB0aGVtIHdpdGggcHJvcGVyIGNyb3NzLXJlZmVyZW5jZXMKNS4gU2V0cyB1cCBsYXVuY2ggY29uZmlndXJhdGlvbiBhbmQgbW9kdWxlIHJlbGF0aW9uc2hpcHMKNi4gUmVnaXN0ZXJzIHRoZSBEQU8gaW4gdGhlIHJlZ2lzdHJ5CgojIEFyZ3VtZW50cwoKKiBgcGFyYW1zYCAtIENvbXBsZXRlIERBTyBjcmVhdGlvbiBwYXJhbWV0ZXJzCgojIFJldHVybnMKCkFsbCBkZXBsb3llZCBjb250cmFjdCBhZGRyZXNzZXMKCiMgRXJyb3JzCgoqIGBGYWN0b3J5UGF1c2VkYCAtIEZhY3RvcnkgaXMgcGF1c2VkCiogYE5vbmNlQWxyZWFkeVVzZWRgIC0gVGhpcyAoY3JlYXRvciwgbm9uY2UpIHBhaXIgd2FzIGFscmVhZHkgdXNlZAoqIGBDdXJyZW50SW1wbGVtZW50YXRpb25zTm90U2V0YCAtIEN1cnJlbnQgV0FTTSBoYXNoZXMgbm90IGNvbmZpZ3VyZWQKKiBgSW52YWxpZFBhcmFtQm91bmRzYCAtIEludmFsaWQgcGFyYW1ldGVyIHZhbHVlcwoqIFZhcmlvdXMgdmFsaWRhdGlvbiBlcnJvcnMgZnJvbSBgdmFsaWRhdGVfZGFvX3BhcmFtc2AAAAAAAApjcmVhdGVfZGFvAAAAAAABAAAAAAAAAAZwYXJhbXMAAAAAB9AAAAARRGFvQ3JlYXRpb25QYXJhbXMAAAAAAAABAAAD6QAAB9AAAAAMRGFvQWRkcmVzc2VzAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAARVDbG9zZXMgdGhlIGxhdW5jaC1hZG1pbiBzZXR1cCB3aW5kb3cgYW5kIGhhbmRzIG1vZHVsZSBvd25lcnNoaXAgdG8gdGhlClRyZWFzdXJ5LiBBbGwgY29uZmlndXJhdGlvbiByZW1haW5zIGVkaXRhYmxlIGJ5IGxhdW5jaF9hZG1pbiB1bnRpbCB0aGlzCm9uZS13YXkgdHJhbnNpdGlvbiBpcyBleGVjdXRlZC4gV2hlbiBgbGF1bmNoX2F1Y3Rpb25gIGlzIGZhbHNlLCB0aGUKQXVjdGlvbiBtb2R1bGUgcmVtYWlucyBwYXVzZWQgYW5kIGRvZXMgbm90IHJlY2VpdmUgbWludCBhdXRob3JpdHkuAAAAAAAADGZpbmFsaXplX2RhbwAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAA5sYXVuY2hfYXVjdGlvbgAAAAAAAQAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAJVJbml0aWFsaXplIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IHdpdGggYW4gYWRtaW4uCgojIEFyZ3VtZW50cwoKKiBgYWRtaW5gIC0gVGhlIGFkZHJlc3MgdGhhdCB3aWxsIGNvbnRyb2wgaW1wbGVtZW50YXRpb24gbWFuYWdlbWVudCBhbmQgZmFjdG9yeSBzZXR0aW5ncwAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==", "AAAAAAAAAIJQYXVzZSB0aGUgZmFjdG9yeSAoZW1lcmdlbmN5IG1lYXN1cmUpLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluAAAAAAANcGF1c2VfZmFjdG9yeQAAAAAAAAAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAATVBcHByb3ZlIGFuIHVwZ3JhZGUgcGF0aCBmcm9tIG9uZSBpbXBsZW1lbnRhdGlvbiB0byBhbm90aGVyLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEludmFsaWRVcGdyYWRlUGF0aGAgLSBPbmUgb3IgYm90aCBpbXBsZW1lbnRhdGlvbnMgZG9uJ3QgZXhpc3Qgb3IgYXJlIHJldm9rZWQAAAAAAAAPYXBwcm92ZV91cGdyYWRlAAAAAAIAAAAAAAAACWZyb21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAAAAAAAPZ2V0X3BlbmRpbmdfZGFvAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAAClBlbmRpbmdEYW8AAA==", "AAAAAAAAAHBVbnBhdXNlIHRoZSBmYWN0b3J5LgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluAAAAD3VucGF1c2VfZmFjdG9yeQAAAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAAAAAAAQZ2V0X2Rhb19jcmVhdGlvbgAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAAClBlbmRpbmdEYW8AAA==", "AAAAAAAAAOdQcmVkaWN0IERBTyBhZGRyZXNzZXMgd2l0aG91dCBkZXBsb3lpbmcuCgpVc2VmdWwgZm9yIGZyb250ZW5kcyB0byBzaG93IGFkZHJlc3NlcyBiZWZvcmUgdXNlciBjb25maXJtcyBkZXBsb3ltZW50LgoKIyBBcmd1bWVudHMKCiogYGNyZWF0b3JgIC0gQ3JlYXRvciBhZGRyZXNzCiogYG5vbmNlYCAtIE5vbmNlIHZhbHVlCgojIFJldHVybnMKClByZWRpY3RlZCBhZGRyZXNzZXMgZm9yIGFsbCA2IG1vZHVsZXMAAAAAEXByZWRpY3RfYWRkcmVzc2VzAAAAAAAAAgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAVub25jZQAAAAAAAAYAAAABAAAD6QAAB9AAAAAMRGFvQWRkcmVzc2VzAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAJFHZXQgaW1wbGVtZW50YXRpb24gYnkgV0FTTSBoYXNoLgoKIyBBcmd1bWVudHMKCiogYHdhc21faGFzaGAgLSBXQVNNIGhhc2ggdG8gcXVlcnkKCiMgUmV0dXJucwoKVGhlIGltcGxlbWVudGF0aW9uIHZlcnNpb24sIG9yIGBOb25lYCBpZiBub3QgZm91bmQuAAAAAAAAEmdldF9pbXBsZW1lbnRhdGlvbgAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAAL9DaGVjayBpZiBhbiB1cGdyYWRlIGlzIGFwcHJvdmVkLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBSZXR1cm5zCgpgdHJ1ZWAgaWYgdXBncmFkZSBpcyBhcHByb3ZlZCBhbmQgbmVpdGhlciBpbXBsZW1lbnRhdGlvbiBpcyByZXZva2VkLgAAAAATaXNfdXBncmFkZV9hcHByb3ZlZAAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAAB", "AAAAAAAAATdSZXZva2UgYW4gaW1wbGVtZW50YXRpb24gKGVtZXJnZW5jeSBtZWFzdXJlKS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB3YXNtX2hhc2hgIC0gV0FTTSBoYXNoIHRvIHJldm9rZQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gSW1wbGVtZW50YXRpb24gZG9lc24ndCBleGlzdAoqIGBJbXBsZW1lbnRhdGlvbkFscmVhZHlSZXZva2VkYCAtIEltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAAAAVcmV2b2tlX2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAXVSZWdpc3RlciBhIG5ldyBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYG5hbWVgIC0gSW1wbGVtZW50YXRpb24gbmFtZSAoZS5nLiwgIlRva2VuIiwgIkdvdmVybm9yIikKKiBgdmVyc2lvbmAgLSBWZXJzaW9uIG51bWJlciAobXVzdCBiZSA+IDApCiogYHdhc21faGFzaGAgLSBXQVNNIGJ5dGVjb2RlIGhhc2gKCiMgRXJyb3JzCgoqIGBVbmF1dGhvcml6ZWRgIC0gQ2FsbGVyIGlzIG5vdCBhZG1pbgoqIGBJbnZhbGlkSW1wbGVtZW50YXRpb25OYW1lYCAtIE5hbWUgaXMgZW1wdHkgb3IgdG9vIGxvbmcKKiBgSW52YWxpZFZlcnNpb25gIC0gVmVyc2lvbiBpcyAwAAAAAAAAF3JlZ2lzdGVyX2ltcGxlbWVudGF0aW9uAAAAAAMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAd2ZXJzaW9uAAAAAAQAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAKRHZXQgbGF0ZXN0IHZlcnNpb24gb2YgYW4gaW1wbGVtZW50YXRpb24gYnkgbmFtZS4KCiMgQXJndW1lbnRzCgoqIGBuYW1lYCAtIEltcGxlbWVudGF0aW9uIG5hbWUKCiMgUmV0dXJucwoKVGhlIGxhdGVzdCBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLCBvciBgTm9uZWAgaWYgbm90IGZvdW5kLgAAABlnZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAEbmFtZQAAABAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAAjJTZXQgdGhlIGN1cnJlbnQgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoZXMgdXNlZCBieSB0aGUgZmFjdG9yeS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB0b2tlbmAgLSBUb2tlbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2gKKiBgbWV0YWRhdGFgIC0gTWV0YWRhdGEgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoCiogYGF1Y3Rpb25gIC0gQXVjdGlvbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoqIGBnb3Zlcm5vcmAgLSBHb3Zlcm5vciBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoqIGB0cmVhc3VyeWAgLSBUcmVhc3VyeSBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gT25lIG9yIG1vcmUgaW1wbGVtZW50YXRpb25zIGRvbid0IGV4aXN0AAAAAAAbc2V0X2N1cnJlbnRfaW1wbGVtZW50YXRpb25zAAAAAAYAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAACG1ldGFkYXRhAAAD7gAAACAAAAAAAAAAB2F1Y3Rpb24AAAAD7gAAACAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAACHRyZWFzdXJ5AAAD7gAAACAAAAAAAAAAC21hcmtldHBsYWNlAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAgAAAONDb250ZXh0IG9mIGEgc2luZ2xlIGF1dGhvcml6ZWQgY2FsbCBwZXJmb3JtZWQgYnkgYW4gYWRkcmVzcy4KCkN1c3RvbSBhY2NvdW50IGNvbnRyYWN0cyB0aGF0IGltcGxlbWVudCBgX19jaGVja19hdXRoYCBzcGVjaWFsIGZ1bmN0aW9uCnJlY2VpdmUgYSBsaXN0IG9mIGBDb250ZXh0YCB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byBhbGwgdGhlIGNhbGxzIHRoYXQKbmVlZCB0byBiZSBhdXRob3JpemVkLgAAAAAAAAAAB0NvbnRleHQAAAAAAwAAAAEAAAAUQ29udHJhY3QgaW52b2NhdGlvbi4AAAAIQ29udHJhY3QAAAABAAAH0AAAAA9Db250cmFjdENvbnRleHQAAAAAAQAAAD1Db250cmFjdCB0aGF0IGhhcyBhIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIGlzIGNyZWF0ZWQuAAAAAAAAFENyZWF0ZUNvbnRyYWN0SG9zdEZuAAAAAQAAB9AAAAAbQ3JlYXRlQ29udHJhY3RIb3N0Rm5Db250ZXh0AAAAAAEAAABEQ29udHJhY3QgdGhhdCBoYXMgYSBjb25zdHJ1Y3RvciB3aXRoIDEgb3IgbW9yZSBhcmd1bWVudHMgaXMgY3JlYXRlZC4AAAAcQ3JlYXRlQ29udHJhY3RXaXRoQ3Rvckhvc3RGbgAAAAEAAAfQAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAA", "AAAAAQAAAL1BdXRob3JpemF0aW9uIGNvbnRleHQgb2YgYSBzaW5nbGUgY29udHJhY3QgY2FsbC4KClRoaXMgc3RydWN0IGNvcnJlc3BvbmRzIHRvIGEgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgY2FsbCBmb3IgYW4gYWRkcmVzcwpmcm9tIGBjb250cmFjdGAgZnVuY3Rpb24gd2l0aCBgZm5fbmFtZWAgbmFtZSBhbmQgYGFyZ3NgIGFyZ3VtZW50cy4AAAAAAAAAAAAAD0NvbnRyYWN0Q29udGV4dAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAHZm5fbmFtZQAAAAAR", "AAAAAgAAAF9Db250cmFjdCBleGVjdXRhYmxlIHVzZWQgZm9yIGNyZWF0aW5nIGEgbmV3IGNvbnRyYWN0IGFuZCB1c2VkIGluCmBDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHRgLgAAAAAAAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAQAAAAEAAAAAAAAABFdhc20AAAABAAAD7gAAACA=", "AAAAAQAAADhWYWx1ZSBvZiBjb250cmFjdCBub2RlIGluIEludm9rZXJDb250cmFjdEF1dGhFbnRyeSB0cmVlLgAAAAAAAAAVU3ViQ29udHJhY3RJbnZvY2F0aW9uAAAAAAAAAgAAAAAAAAAHY29udGV4dAAAAAfQAAAAD0NvbnRyYWN0Q29udGV4dAAAAAAAAAAAD3N1Yl9pbnZvY2F0aW9ucwAAAAPqAAAH0AAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnk=", "AAAAAgAAAS9BIG5vZGUgaW4gdGhlIHRyZWUgb2YgYXV0aG9yaXphdGlvbnMgcGVyZm9ybWVkIG9uIGJlaGFsZiBvZiB0aGUgY3VycmVudApjb250cmFjdCBhcyBpbnZva2VyIG9mIHRoZSBjb250cmFjdHMgZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrLgoKVGhpcyBpcyB1c2VkIGFzIGFuIGFyZ3VtZW50IG9mIGBhdXRob3JpemVfYXNfY3VycmVudF9jb250cmFjdGAgaG9zdCBmdW5jdGlvbi4KClRoaXMgdHJlZSBjb3JyZXNwb25kcyBgcmVxdWlyZV9hdXRoW19mb3JfYXJnc11gIGNhbGxzIG9uIGJlaGFsZiBvZiB0aGUKY3VycmVudCBjb250cmFjdC4AAAAAAAAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnkAAAADAAAAAQAAABJJbnZva2UgYSBjb250cmFjdC4AAAAAAAhDb250cmFjdAAAAAEAAAfQAAAAFVN1YkNvbnRyYWN0SW52b2NhdGlvbgAAAAAAAAEAAAA1Q3JlYXRlIGEgY29udHJhY3QgcGFzc2luZyAwIGFyZ3VtZW50cyB0byBjb25zdHJ1Y3Rvci4AAAAAAAAUQ3JlYXRlQ29udHJhY3RIb3N0Rm4AAAABAAAH0AAAABtDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHQAAAAAAQAAAD1DcmVhdGUgYSBjb250cmFjdCBwYXNzaW5nIDAgb3IgbW9yZSBhcmd1bWVudHMgdG8gY29uc3RydWN0b3IuAAAAAAAAHENyZWF0ZUNvbnRyYWN0V2l0aEN0b3JIb3N0Rm4AAAABAAAH0AAAACpDcmVhdGVDb250cmFjdFdpdGhDb25zdHJ1Y3Rvckhvc3RGbkNvbnRleHQAAA==", "AAAAAQAAAHZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuAAAAAAAAAAAAG0NyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dAAAAAACAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAQAAANZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuClRoaXMgaXMgdGhlIHNhbWUgYXMgYENyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dGAsIGJ1dCBhbHNvIGhhcwpjb250cmFjdCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAAAAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAAAAAAAwAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAgAAAAAAAAAAAAAACkV4ZWN1dGFibGUAAAAAAAMAAAABAAAAAAAAAARXYXNtAAAAAQAAA+4AAAAgAAAAAAAAAAAAAAAMU3RlbGxhckFzc2V0AAAAAAAAAAAAAAAHQWNjb3VudAA="]),
      options
    );
  }

   static deploy<T = Client>({ admin }: { admin: string | Address }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin }, options);
  }
  public readonly fromJson = {
    create_dao : this.txFromJson<Result<DaoAddresses, ManagerError>>,  finalize_dao : this.txFromJson<Result<null, ManagerError>>,  pause_factory : this.txFromJson<Result<null, ManagerError>>,  approve_upgrade : this.txFromJson<Result<null, ManagerError>>,  get_pending_dao : this.txFromJson<PendingDao | null>,  unpause_factory : this.txFromJson<Result<null, ManagerError>>,  get_dao_creation : this.txFromJson<PendingDao | null>,  predict_addresses : this.txFromJson<Result<DaoAddresses, ManagerError>>,  get_implementation : this.txFromJson<ImplementationVersion | null>,  is_upgrade_approved : this.txFromJson<boolean>,  revoke_implementation : this.txFromJson<Result<null, ManagerError>>,  register_implementation : this.txFromJson<Result<null, ManagerError>>,  get_latest_implementation : this.txFromJson<ImplementationVersion | null>,  set_current_implementations : this.txFromJson<Result<null, ManagerError>>
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
   * Build a topics filter row for the "DaoFinalized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  daoFinalizedEventFilter(topicValues?: { token_address?: string | Address }): string[] {
    return this.spec.eventTopicFilter("DaoFinalized", topicValues);
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