import {DaoRegistration, DaoCreationParams, DaoAddresses, ManagerError, DaoCreation, ImplementationVersion, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Check if a token address is a registered DAO.
   *
   * # Arguments
   *
   * * `token_address` - Token address to check
   *
   * # Returns
   *
   * `true` if the address is a registered DAO.
   */
  is_dao({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Get DAO by token address.
   *
   * # Arguments
   *
   * * `token_address` - Token address (canonical DAO ID)
   *
   * # Returns
   *
   * The DAO registration, or `None` if not found.
   */
  get_dao({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<DaoRegistration | null>>;
  /**
   * Create a new DAO with all 5 modules atomically deployed.
   *
   * This is the main factory function that:
   * 1. Validates all parameters
   * 2. Checks factory not paused and nonce not used
   * 3. Deploys all 5 contracts (Token, Metadata, Auction, Governor, Treasury)
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
   * Get total DAO count.
   *
   * # Returns
   *
   * Total number of DAOs created.
   */
  get_dao_count(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Check if a (creator, nonce) pair has been used.
   *
   * # Arguments
   *
   * * `creator` - Creator address
   * * `nonce` - Nonce value
   *
   * # Returns
   *
   * `true` if the nonce has been used by this creator
   */
  is_nonce_used({ creator, nonce }: { creator: string | Address; nonce: bigint }, options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
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
   * Enumerate DAOs with pagination.
   *
   * # Arguments
   *
   * * `start` - Starting index
   * * `limit` - Maximum number of DAOs to return
   *
   * # Returns
   *
   * Vector of token addresses in creation order.
   *
   * # Errors
   *
   * * `InvalidPaginationParams` - Invalid start/limit
   */
  enumerate_daos({ start, limit }: { start: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<string>, ManagerError>>>;
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
  get_dao_creation({ token_address }: { token_address: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<DaoCreation | null>>;
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
   * Predicted addresses for all 5 modules
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
  set_current_implementations({ token, metadata, auction, governor, treasury }: { token: Uint8Array; metadata: Uint8Array; auction: Uint8Array; governor: Uint8Array; treasury: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, ManagerError>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAAAAAAAAAAAADE1hbmFnZXJFcnJvcgAAAB0AAAAlTm90IGF1dGhvcml6ZWQgdG8gcGVyZm9ybSB0aGlzIGFjdGlvbgAAAAAAAAxVbmF1dGhvcml6ZWQAAAPoAAAAG0ludmFsaWQgaW1wbGVtZW50YXRpb24gbmFtZQAAAAAZSW52YWxpZEltcGxlbWVudGF0aW9uTmFtZQAAAAAAA+kAAAAWSW52YWxpZCB2ZXJzaW9uIG51bWJlcgAAAAAADkludmFsaWRWZXJzaW9uAAAAAAPqAAAAGEltcGxlbWVudGF0aW9uIG5vdCBmb3VuZAAAABZJbXBsZW1lbnRhdGlvbk5vdEZvdW5kAAAAAAPrAAAAHkltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAAAAAHEltcGxlbWVudGF0aW9uQWxyZWFkeVJldm9rZWQAAAPsAAAAFEludmFsaWQgdXBncmFkZSBwYXRoAAAAEkludmFsaWRVcGdyYWRlUGF0aAAAAAAD7QAAAA1BZG1pbiBub3Qgc2V0AAAAAAAAC0FkbWluTm90U2V0AAAAA+4AAAATREFPIGNyZWF0aW9uIGZhaWxlZAAAAAARRGFvQ3JlYXRpb25GYWlsZWQAAAAAAARMAAAAEUZhY3RvcnkgaXMgcGF1c2VkAAAAAAAADUZhY3RvcnlQYXVzZWQAAAAAAARNAAAAEk5vbmNlIGFscmVhZHkgdXNlZAAAAAAAEE5vbmNlQWxyZWFkeVVzZWQAAAROAAAAGEludmFsaWQgcGFyYW1ldGVyIGJvdW5kcwAAABJJbnZhbGlkUGFyYW1Cb3VuZHMAAAAABE8AAAAaRm91bmRlcnMgZXhjZWVkIDk5IHBlcmNlbnQAAAAAABdGb3VuZGVyc0V4Y2VlZDk5UGVyY2VudAAAAARQAAAAG0ludmFsaWQgcXVvcnVtIGJhc2lzIHBvaW50cwAAAAAQSW52YWxpZFF1b3J1bUJwcwAABFEAAAAnSW52YWxpZCBwcm9wb3NhbCB0aHJlc2hvbGQgYmFzaXMgcG9pbnRzAAAAABtJbnZhbGlkUHJvcG9zYWxUaHJlc2hvbGRCcHMAAAAEUgAAABBJbnZhbGlkIGR1cmF0aW9uAAAAD0ludmFsaWREdXJhdGlvbgAAAARTAAAAE0ludmFsaWQgdGltZSBidWZmZXIAAAAAEUludmFsaWRUaW1lQnVmZmVyAAAAAAAEVAAAABFEZXBsb3ltZW50IGZhaWxlZAAAAAAAABBEZXBsb3ltZW50RmFpbGVkAAAEVQAAABVJbml0aWFsaXphdGlvbiBmYWlsZWQAAAAAAAAUSW5pdGlhbGl6YXRpb25GYWlsZWQAAARWAAAAFUludmFsaWQgcGF5bWVudCBhc3NldAAAAAAAABNJbnZhbGlkUGF5bWVudEFzc2V0AAAABFcAAAAPU3RyaW5nIHRvbyBsb25nAAAAAA1TdHJpbmdUb29Mb25nAAAAAAAEWAAAAAxTdHJpbmcgZW1wdHkAAAALU3RyaW5nRW1wdHkAAAAEWQAAABpJbnZhbGlkIGZvdW5kZXIgYWxsb2NhdGlvbgAAAAAAE05vRm91bmRlcnNTcGVjaWZpZWQAAAAEWgAAABpJbnZhbGlkIGZvdW5kZXIgcGVyY2VudGFnZQAAAAAAGEludmFsaWRGb3VuZGVyUGVyY2VudGFnZQAABFsAAABBR292ZXJuYW5jZSB0aW1pbmcgZG9lcyBub3QgZml0IHRoZSBHb3Zlcm5vciBjb250cmFjdCdzIHUzMiBmaWVsZHMAAAAAAAAXSW52YWxpZEdvdmVybmFuY2VUaW1pbmcAAAAEXQAAADVGb3VuZGVyIGFsbG9jYXRpb25zIGV4Y2VlZCB0aGUgZmFjdG9yeSByZXNvdXJjZSBsaW1pdAAAAAAAABlGb3VuZGVyQWxsb2NhdGlvblRvb0xhcmdlAAAAAAAEXgAAAB9DdXJyZW50IGltcGxlbWVudGF0aW9ucyBub3Qgc2V0AAAAABxDdXJyZW50SW1wbGVtZW50YXRpb25zTm90U2V0AAAEXAAAABZEQU8gYWxyZWFkeSByZWdpc3RlcmVkAAAAAAAURGFvQWxyZWFkeVJlZ2lzdGVyZWQAAASwAAAADURBTyBub3QgZm91bmQAAAAAAAALRGFvTm90Rm91bmQAAAAEsQAAAB1JbnZhbGlkIHBhZ2luYXRpb24gcGFyYW1ldGVycwAAAAAAABdJbnZhbGlkUGFnaW5hdGlvblBhcmFtcwAAAASy", "AAAABQAAAAAAAAAAAAAACkRhb0NyZWF0ZWQAAAAAAAEAAAALZGFvX2NyZWF0ZWQAAAAABQAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAAAAAAdjcmVhdG9yAAAAABMAAAABAAAAAAAAAA5jcmVhdGVkX2xlZGdlcgAAAAAABAAAAAAAAAAAAAAAB21vZHVsZXMAAAAH0AAAAApEYW9Nb2R1bGVzAAAAAAAAAAAAAAAAAAhmb3VuZGVycwAAA+oAAAfQAAAAEUZvdW5kZXJBbGxvY2F0aW9uAAAAAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADERhb0ZpbmFsaXplZAAAAAEAAAANZGFvX2ZpbmFsaXplZAAAAAAAAAQAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAQZmluYWxpemVkX2xlZGdlcgAAAAQAAAAAAAAAAAAAAAdtb2R1bGVzAAAAB9AAAAAKRGFvTW9kdWxlcwAAAAAAAAAAAAAAAAAObGF1bmNoX2F1Y3Rpb24AAAAAAAEAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAADURhb1JlZ2lzdGVyZWQAAAAAAAABAAAADmRhb19yZWdpc3RlcmVkAAAAAAADAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAEAAAAAAAAAB21vZHVsZXMAAAAH0AAAAApEYW9Nb2R1bGVzAAAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAADUZhY3RvcnlQYXVzZWQAAAAAAAABAAAADmZhY3RvcnlfcGF1c2VkAAAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD0ZhY3RvcnlVbnBhdXNlZAAAAAABAAAAEGZhY3RvcnlfdW5wYXVzZWQAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD1VwZ3JhZGVBcHByb3ZlZAAAAAABAAAAEHVwZ3JhZGVfYXBwcm92ZWQAAAADAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAABAAAAAAAAAAthcHByb3ZlZF9hdAAAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAFUltcGxlbWVudGF0aW9uUmV2b2tlZAAAAAAAAAEAAAAWaW1wbGVtZW50YXRpb25fcmV2b2tlZAAAAAAAAgAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAApyZXZva2VkX2F0AAAAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAGEltcGxlbWVudGF0aW9uUmVnaXN0ZXJlZAAAAAEAAAAZaW1wbGVtZW50YXRpb25fcmVnaXN0ZXJlZAAAAAAAAAQAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAEAAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAxwdWJsaXNoZWRfYXQAAAAGAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAHUN1cnJlbnRJbXBsZW1lbnRhdGlvbnNVcGRhdGVkAAAAAAAAAQAAAB9jdXJyZW50X2ltcGxlbWVudGF0aW9uc191cGRhdGVkAAAAAAUAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAAAAAAAAhtZXRhZGF0YQAAA+4AAAAgAAAAAAAAAAAAAAAHYXVjdGlvbgAAAAPuAAAAIAAAAAAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAAAAAAAAh0cmVhc3VyeQAAA+4AAAAgAAAAAAAAAAI=", "AAAAAgAAAAAAAAAAAAAACURhb1N0YXR1cwAAAAAAAAIAAAAAAAAAAAAAAAdQZW5kaW5nAAAAAAAAAAAAAAAAC09wZXJhdGlvbmFsAA==", "AAAAAQAAAEtNb2R1bGUgYWRkcmVzc2VzIGZvciBhIERBTyAoc2FtZSBhcyBEYW9BZGRyZXNzZXMgYnV0IGZvciByZWdpc3RyeSBjb250ZXh0KS4AAAAAAAAAAApEYW9Nb2R1bGVzAAAAAAAFAAAAAAAAAAdhdWN0aW9uAAAAABMAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAAIbWV0YWRhdGEAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEw==", "AAAAAgAAACZTdG9yYWdlIGtleXMgZm9yIHRoZSBNYW5hZ2VyIGNvbnRyYWN0LgAAAAAAAAAAAApNYW5hZ2VyS2V5AAAAAAAQAAAAAAAAAAAAAAAFQWRtaW4AAAAAAAAAAAAAAAAAAA1GYWN0b3J5UGF1c2VkAAAAAAAAAAAAAAAAAAAORmFjdG9yeVZlcnNpb24AAAAAAAEAAAAAAAAADkltcGxlbWVudGF0aW9uAAAAAAABAAAD7gAAACAAAAABAAAAAAAAABRMYXRlc3RJbXBsZW1lbnRhdGlvbgAAAAEAAAAQAAAAAQAAAAAAAAAPVXBncmFkZUFwcHJvdmFsAAAAAAIAAAPuAAAAIAAAA+4AAAAgAAAAAAAAAAAAAAAQQ3VycmVudFRva2VuV2FzbQAAAAAAAAAAAAAAE0N1cnJlbnRNZXRhZGF0YVdhc20AAAAAAAAAAAAAAAASQ3VycmVudEF1Y3Rpb25XYXNtAAAAAAAAAAAAAAAAABNDdXJyZW50R292ZXJub3JXYXNtAAAAAAAAAAAAAAAAE0N1cnJlbnRUcmVhc3VyeVdhc20AAAAAAQAAAAAAAAALRGFvQ3JlYXRpb24AAAAAAQAAABMAAAABAAAAAAAAAAlOb25jZVVzZWQAAAAAAAACAAAAEwAAAAYAAAABAAAAAAAAAA9EYW9SZWdpc3RyYXRpb24AAAAAAQAAABMAAAAAAAAAAAAAAAdEYW9MaXN0AAAAAAAAAAAAAAAACERhb0NvdW50", "AAAAAQAAAAAAAAAAAAAAC0FydHdvcmtJdGVtAAAAAAMAAAAAAAAAD2lzX25ld19wcm9wZXJ0eQAAAAABAAAAAAAAAARuYW1lAAAAEAAAAAAAAAALcHJvcGVydHlfaWQAAAAABA==", "AAAAAQAAACJDb21wbGV0ZSByZWNvcmQgb2YgYSBEQU8gY3JlYXRpb24uAAAAAAAAAAAAC0Rhb0NyZWF0aW9uAAAAAAYAAAAUQWxsIG1vZHVsZSBhZGRyZXNzZXMAAAAJYWRkcmVzc2VzAAAAAAAH0AAAAAxEYW9BZGRyZXNzZXMAAAAWVGltZXN0YW1wIHdoZW4gY3JlYXRlZAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAcTGVkZ2VyIHNlcXVlbmNlIHdoZW4gY3JlYXRlZAAAAA5jcmVhdGVkX2xlZGdlcgAAAAAABAAAAA9DcmVhdG9yIGFkZHJlc3MAAAAAB2NyZWF0b3IAAAAAEwAAABNDcmVhdGlvbiBwYXJhbWV0ZXJzAAAAAAZwYXJhbXMAAAAAB9AAAAARRGFvQ3JlYXRpb25QYXJhbXMAAAAAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAlEYW9TdGF0dXMAAAA=", "AAAAAQAAABVNZXRhZGF0YSBhYm91dCBhIERBTy4AAAAAAAAAAAAAC0Rhb01ldGFkYXRhAAAAAAIAAAAzT3B0aW9uYWwgZGVzY3JpcHRpb24gKGNhbiBiZSB1cGRhdGVkIGJ5IGdvdmVybmFuY2UpAAAAAAtkZXNjcmlwdGlvbgAAAAPoAAAAEAAAAAhEQU8gbmFtZQAAAARuYW1lAAAAEA==", "AAAAAQAAACZBZGRyZXNzZXMgb2YgYWxsIGRlcGxveWVkIERBTyBtb2R1bGVzLgAAAAAAAAAAAAxEYW9BZGRyZXNzZXMAAAAFAAAAAAAAAAdhdWN0aW9uAAAAABMAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAAIbWV0YWRhdGEAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEw==", "AAAAAQAAACdDb21wbGV0ZSByZWdpc3RyYXRpb24gcmVjb3JkIGZvciBhIERBTy4AAAAAAAAAAA9EYW9SZWdpc3RyYXRpb24AAAAABwAAABZUaW1lc3RhbXAgd2hlbiBjcmVhdGVkAAAAAAAKY3JlYXRlZF9hdAAAAAAABgAAABNMZWRnZXIgd2hlbiBjcmVhdGVkAAAAAA5jcmVhdGVkX2xlZGdlcgAAAAAABAAAAA9DcmVhdG9yIGFkZHJlc3MAAAAAB2NyZWF0b3IAAAAAEwAAACVNYW5hZ2VyIHZlcnNpb24gdGhhdCBjcmVhdGVkIHRoaXMgREFPAAAAAAAAD2ZhY3RvcnlfdmVyc2lvbgAAAAAEAAAADERBTyBtZXRhZGF0YQAAAAhtZXRhZGF0YQAAB9AAAAALRGFvTWV0YWRhdGEAAAAAFEFsbCBtb2R1bGUgYWRkcmVzc2VzAAAAB21vZHVsZXMAAAAH0AAAAApEYW9Nb2R1bGVzAAAAAAAgVG9rZW4gYWRkcmVzcyAoY2Fub25pY2FsIERBTyBJRCkAAAANdG9rZW5fYWRkcmVzcwAAAAAAABM=", "AAAAAQAAAEBSZXByZXNlbnRzIGFuIGFwcHJvdmVkIHVwZ3JhZGUgcGF0aCBiZXR3ZWVuIHR3byBpbXBsZW1lbnRhdGlvbnMuAAAAAAAAAA9VcGdyYWRlQXBwcm92YWwAAAAAAwAAAB1MZWRnZXIgc2VxdWVuY2Ugd2hlbiBhcHByb3ZlZAAAAAAAAAthcHByb3ZlZF9hdAAAAAAGAAAAEFNvdXJjZSBXQVNNIGhhc2gAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAQVGFyZ2V0IFdBU00gaGFzaAAAAAd0b19oYXNoAAAAA+4AAAAg", "AAAAAQAAAAAAAAAAAAAAEEFydHdvcmtJcGZzR3JvdXAAAAACAAAAAAAAAAhiYXNlX3VyaQAAABAAAAAAAAAACWV4dGVuc2lvbgAAAAAAABA=", "AAAAAQAAACtDb21wbGV0ZSBwYXJhbWV0ZXJzIGZvciBjcmVhdGluZyBhIG5ldyBEQU8uAAAAAAAAAAARRGFvQ3JlYXRpb25QYXJhbXMAAAAAAAAWAAAAAAAAAAxhcnR3b3JrX2lwZnMAAAfQAAAAEEFydHdvcmtJcGZzR3JvdXAAAAAAAAAADWFydHdvcmtfaXRlbXMAAAAAAAPqAAAH0AAAAAtBcnR3b3JrSXRlbQAAAAAAAAAAFmFydHdvcmtfcHJvcGVydHlfbmFtZXMAAAAAA+oAAAAQAAAAAAAAABBhdWN0aW9uX2R1cmF0aW9uAAAABgAAAAAAAAAOY29udHJhY3RfaW1hZ2UAAAAAABAAAAAXV2hvJ3MgY3JlYXRpbmcgdGhpcyBEQU8AAAAACGRlcGxveWVyAAAAEwAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAIZm91bmRlcnMAAAPqAAAH0AAAABFGb3VuZGVyQWxsb2NhdGlvbgAAAAAAAAAAAAAMbGF1bmNoX2FkbWluAAAAEwAAADRVbmlxdWVuZXNzIGtleSAodXNlciBpbmNyZW1lbnRzIHRvIGF2b2lkIGNvbGxpc2lvbnMpAAAABW5vbmNlAAAAAAAABgAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAC3Byb2plY3RfdXJpAAAAABAAAAAAAAAAFnByb3Bvc2FsX3RocmVzaG9sZF9icHMAAAAAAAQAAAAAAAAACnF1b3J1bV9icHMAAAAAAAQAAAAAAAAADXJlbmRlcmVyX2Jhc2UAAAAAAAAQAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAALdGltZV9idWZmZXIAAAAABgAAAAAAAAAKdG9rZW5fbmFtZQAAAAAAEAAAAAAAAAAMdG9rZW5fc3ltYm9sAAAAEAAAAAAAAAAJdG9rZW5fdXJpAAAAAAAAEAAAAAAAAAAMdm90aW5nX2RlbGF5AAAABgAAAAAAAAANdm90aW5nX3BlcmlvZAAAAAAAAAY=", "AAAAAQAAADtGaXhlZCBmb3VuZGVyIGFsbG9jYXRpb24gbWludGVkIGJlZm9yZSB0aGUgREFPIGlzIGxhdW5jaGVkLgAAAAAAAAAAEUZvdW5kZXJBbGxvY2F0aW9uAAAAAAAAAgAAACBGb3VuZGVyIGFkZHJlc3MgcmVjZWl2aW5nIHRva2VucwAAAAdhZGRyZXNzAAAAABMAAAAWTnVtYmVyIG9mIE5GVHMgdG8gbWludAAAAAAABmFtb3VudAAAAAAABA==", "AAAAAQAAADhSZXByZXNlbnRzIGEgcmVnaXN0ZXJlZCBjb250cmFjdCBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLgAAAAAAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAAAAAABQAAADtJbXBsZW1lbnRhdGlvbiBuYW1lIChlLmcuLCAiVG9rZW4iLCAiR292ZXJub3IiLCAiTWV0YWRhdGEiKQAAAAAEbmFtZQAAABAAAAAeTGVkZ2VyIHNlcXVlbmNlIHdoZW4gcHVibGlzaGVkAAAAAAAMcHVibGlzaGVkX2F0AAAABgAAAEBXaGV0aGVyIHRoaXMgaW1wbGVtZW50YXRpb24gaGFzIGJlZW4gcmV2b2tlZCAoZW1lcmdlbmN5IG1lYXN1cmUpAAAAB3Jldm9rZWQAAAAAAQAAAClWZXJzaW9uIG51bWJlciAobW9ub3RvbmljYWxseSBpbmNyZWFzaW5nKQAAAAAAAAd2ZXJzaW9uAAAAAAQAAAASV0FTTSBieXRlY29kZSBoYXNoAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACA=", "AAAAAAAAAJ1DaGVjayBpZiBhIHRva2VuIGFkZHJlc3MgaXMgYSByZWdpc3RlcmVkIERBTy4KCiMgQXJndW1lbnRzCgoqIGB0b2tlbl9hZGRyZXNzYCAtIFRva2VuIGFkZHJlc3MgdG8gY2hlY2sKCiMgUmV0dXJucwoKYHRydWVgIGlmIHRoZSBhZGRyZXNzIGlzIGEgcmVnaXN0ZXJlZCBEQU8uAAAAAAAABmlzX2RhbwAAAAAAAQAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAAAQ==", "AAAAAAAAAJZHZXQgREFPIGJ5IHRva2VuIGFkZHJlc3MuCgojIEFyZ3VtZW50cwoKKiBgdG9rZW5fYWRkcmVzc2AgLSBUb2tlbiBhZGRyZXNzIChjYW5vbmljYWwgREFPIElEKQoKIyBSZXR1cm5zCgpUaGUgREFPIHJlZ2lzdHJhdGlvbiwgb3IgYE5vbmVgIGlmIG5vdCBmb3VuZC4AAAAAAAdnZXRfZGFvAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAAD0Rhb1JlZ2lzdHJhdGlvbgA=", "AAAAAAAAAxFDcmVhdGUgYSBuZXcgREFPIHdpdGggYWxsIDUgbW9kdWxlcyBhdG9taWNhbGx5IGRlcGxveWVkLgoKVGhpcyBpcyB0aGUgbWFpbiBmYWN0b3J5IGZ1bmN0aW9uIHRoYXQ6CjEuIFZhbGlkYXRlcyBhbGwgcGFyYW1ldGVycwoyLiBDaGVja3MgZmFjdG9yeSBub3QgcGF1c2VkIGFuZCBub25jZSBub3QgdXNlZAozLiBEZXBsb3lzIGFsbCA1IGNvbnRyYWN0cyAoVG9rZW4sIE1ldGFkYXRhLCBBdWN0aW9uLCBHb3Zlcm5vciwgVHJlYXN1cnkpCjQuIEluaXRpYWxpemVzIHRoZW0gd2l0aCBwcm9wZXIgY3Jvc3MtcmVmZXJlbmNlcwo1LiBTZXRzIHVwIGxhdW5jaCBjb25maWd1cmF0aW9uIGFuZCBtb2R1bGUgcmVsYXRpb25zaGlwcwo2LiBSZWdpc3RlcnMgdGhlIERBTyBpbiB0aGUgcmVnaXN0cnkKCiMgQXJndW1lbnRzCgoqIGBwYXJhbXNgIC0gQ29tcGxldGUgREFPIGNyZWF0aW9uIHBhcmFtZXRlcnMKCiMgUmV0dXJucwoKQWxsIGRlcGxveWVkIGNvbnRyYWN0IGFkZHJlc3NlcwoKIyBFcnJvcnMKCiogYEZhY3RvcnlQYXVzZWRgIC0gRmFjdG9yeSBpcyBwYXVzZWQKKiBgTm9uY2VBbHJlYWR5VXNlZGAgLSBUaGlzIChjcmVhdG9yLCBub25jZSkgcGFpciB3YXMgYWxyZWFkeSB1c2VkCiogYEN1cnJlbnRJbXBsZW1lbnRhdGlvbnNOb3RTZXRgIC0gQ3VycmVudCBXQVNNIGhhc2hlcyBub3QgY29uZmlndXJlZAoqIGBJbnZhbGlkUGFyYW1Cb3VuZHNgIC0gSW52YWxpZCBwYXJhbWV0ZXIgdmFsdWVzCiogVmFyaW91cyB2YWxpZGF0aW9uIGVycm9ycyBmcm9tIGB2YWxpZGF0ZV9kYW9fcGFyYW1zYAAAAAAAAApjcmVhdGVfZGFvAAAAAAABAAAAAAAAAAZwYXJhbXMAAAAAB9AAAAARRGFvQ3JlYXRpb25QYXJhbXMAAAAAAAABAAAD6QAAB9AAAAAMRGFvQWRkcmVzc2VzAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAARVDbG9zZXMgdGhlIGxhdW5jaC1hZG1pbiBzZXR1cCB3aW5kb3cgYW5kIGhhbmRzIG1vZHVsZSBvd25lcnNoaXAgdG8gdGhlClRyZWFzdXJ5LiBBbGwgY29uZmlndXJhdGlvbiByZW1haW5zIGVkaXRhYmxlIGJ5IGxhdW5jaF9hZG1pbiB1bnRpbCB0aGlzCm9uZS13YXkgdHJhbnNpdGlvbiBpcyBleGVjdXRlZC4gV2hlbiBgbGF1bmNoX2F1Y3Rpb25gIGlzIGZhbHNlLCB0aGUKQXVjdGlvbiBtb2R1bGUgcmVtYWlucyBwYXVzZWQgYW5kIGRvZXMgbm90IHJlY2VpdmUgbWludCBhdXRob3JpdHkuAAAAAAAADGZpbmFsaXplX2RhbwAAAAIAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAAAAAA5sYXVuY2hfYXVjdGlvbgAAAAAAAQAAAAEAAAPpAAAAAgAAB9AAAAAMTWFuYWdlckVycm9y", "AAAAAAAAAJVJbml0aWFsaXplIHRoZSBNYW5hZ2VyIGNvbnRyYWN0IHdpdGggYW4gYWRtaW4uCgojIEFyZ3VtZW50cwoKKiBgYWRtaW5gIC0gVGhlIGFkZHJlc3MgdGhhdCB3aWxsIGNvbnRyb2wgaW1wbGVtZW50YXRpb24gbWFuYWdlbWVudCBhbmQgZmFjdG9yeSBzZXR0aW5ncwAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==", "AAAAAAAAAD5HZXQgdG90YWwgREFPIGNvdW50LgoKIyBSZXR1cm5zCgpUb3RhbCBudW1iZXIgb2YgREFPcyBjcmVhdGVkLgAAAAAADWdldF9kYW9fY291bnQAAAAAAAAAAAAAAQAAAAQ=", "AAAAAAAAALFDaGVjayBpZiBhIChjcmVhdG9yLCBub25jZSkgcGFpciBoYXMgYmVlbiB1c2VkLgoKIyBBcmd1bWVudHMKCiogYGNyZWF0b3JgIC0gQ3JlYXRvciBhZGRyZXNzCiogYG5vbmNlYCAtIE5vbmNlIHZhbHVlCgojIFJldHVybnMKCmB0cnVlYCBpZiB0aGUgbm9uY2UgaGFzIGJlZW4gdXNlZCBieSB0aGlzIGNyZWF0b3IAAAAAAAANaXNfbm9uY2VfdXNlZAAAAAAAAAIAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAQAAAAE=", "AAAAAAAAAIJQYXVzZSB0aGUgZmFjdG9yeSAoZW1lcmdlbmN5IG1lYXN1cmUpLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluAAAAAAANcGF1c2VfZmFjdG9yeQAAAAAAAAAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAOtFbnVtZXJhdGUgREFPcyB3aXRoIHBhZ2luYXRpb24uCgojIEFyZ3VtZW50cwoKKiBgc3RhcnRgIC0gU3RhcnRpbmcgaW5kZXgKKiBgbGltaXRgIC0gTWF4aW11bSBudW1iZXIgb2YgREFPcyB0byByZXR1cm4KCiMgUmV0dXJucwoKVmVjdG9yIG9mIHRva2VuIGFkZHJlc3NlcyBpbiBjcmVhdGlvbiBvcmRlci4KCiMgRXJyb3JzCgoqIGBJbnZhbGlkUGFnaW5hdGlvblBhcmFtc2AgLSBJbnZhbGlkIHN0YXJ0L2xpbWl0AAAAAA5lbnVtZXJhdGVfZGFvcwAAAAAAAgAAAAAAAAAFc3RhcnQAAAAAAAAEAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAD6QAAA+oAAAATAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAATVBcHByb3ZlIGFuIHVwZ3JhZGUgcGF0aCBmcm9tIG9uZSBpbXBsZW1lbnRhdGlvbiB0byBhbm90aGVyLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEludmFsaWRVcGdyYWRlUGF0aGAgLSBPbmUgb3IgYm90aCBpbXBsZW1lbnRhdGlvbnMgZG9uJ3QgZXhpc3Qgb3IgYXJlIHJldm9rZWQAAAAAAAAPYXBwcm92ZV91cGdyYWRlAAAAAAIAAAAAAAAACWZyb21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAHBVbnBhdXNlIHRoZSBmYWN0b3J5LgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluAAAAD3VucGF1c2VfZmFjdG9yeQAAAAAAAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAAAAAAAQZ2V0X2Rhb19jcmVhdGlvbgAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+gAAAfQAAAAC0Rhb0NyZWF0aW9uAA==", "AAAAAAAAAOdQcmVkaWN0IERBTyBhZGRyZXNzZXMgd2l0aG91dCBkZXBsb3lpbmcuCgpVc2VmdWwgZm9yIGZyb250ZW5kcyB0byBzaG93IGFkZHJlc3NlcyBiZWZvcmUgdXNlciBjb25maXJtcyBkZXBsb3ltZW50LgoKIyBBcmd1bWVudHMKCiogYGNyZWF0b3JgIC0gQ3JlYXRvciBhZGRyZXNzCiogYG5vbmNlYCAtIE5vbmNlIHZhbHVlCgojIFJldHVybnMKClByZWRpY3RlZCBhZGRyZXNzZXMgZm9yIGFsbCA1IG1vZHVsZXMAAAAAEXByZWRpY3RfYWRkcmVzc2VzAAAAAAAAAgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAVub25jZQAAAAAAAAYAAAABAAAD6QAAB9AAAAAMRGFvQWRkcmVzc2VzAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAJFHZXQgaW1wbGVtZW50YXRpb24gYnkgV0FTTSBoYXNoLgoKIyBBcmd1bWVudHMKCiogYHdhc21faGFzaGAgLSBXQVNNIGhhc2ggdG8gcXVlcnkKCiMgUmV0dXJucwoKVGhlIGltcGxlbWVudGF0aW9uIHZlcnNpb24sIG9yIGBOb25lYCBpZiBub3QgZm91bmQuAAAAAAAAEmdldF9pbXBsZW1lbnRhdGlvbgAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAAL9DaGVjayBpZiBhbiB1cGdyYWRlIGlzIGFwcHJvdmVkLgoKIyBBcmd1bWVudHMKCiogYGZyb21faGFzaGAgLSBTb3VyY2UgV0FTTSBoYXNoCiogYHRvX2hhc2hgIC0gVGFyZ2V0IFdBU00gaGFzaAoKIyBSZXR1cm5zCgpgdHJ1ZWAgaWYgdXBncmFkZSBpcyBhcHByb3ZlZCBhbmQgbmVpdGhlciBpbXBsZW1lbnRhdGlvbiBpcyByZXZva2VkLgAAAAATaXNfdXBncmFkZV9hcHByb3ZlZAAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAEAAAAB", "AAAAAAAAATdSZXZva2UgYW4gaW1wbGVtZW50YXRpb24gKGVtZXJnZW5jeSBtZWFzdXJlKS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB3YXNtX2hhc2hgIC0gV0FTTSBoYXNoIHRvIHJldm9rZQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gSW1wbGVtZW50YXRpb24gZG9lc24ndCBleGlzdAoqIGBJbXBsZW1lbnRhdGlvbkFscmVhZHlSZXZva2VkYCAtIEltcGxlbWVudGF0aW9uIGFscmVhZHkgcmV2b2tlZAAAAAAVcmV2b2tlX2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAAAAAXVSZWdpc3RlciBhIG5ldyBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLgoKIyBBdXRob3JpemF0aW9uCgpPbmx5IGNhbGxhYmxlIGJ5IGFkbWluLgoKIyBBcmd1bWVudHMKCiogYG5hbWVgIC0gSW1wbGVtZW50YXRpb24gbmFtZSAoZS5nLiwgIlRva2VuIiwgIkdvdmVybm9yIikKKiBgdmVyc2lvbmAgLSBWZXJzaW9uIG51bWJlciAobXVzdCBiZSA+IDApCiogYHdhc21faGFzaGAgLSBXQVNNIGJ5dGVjb2RlIGhhc2gKCiMgRXJyb3JzCgoqIGBVbmF1dGhvcml6ZWRgIC0gQ2FsbGVyIGlzIG5vdCBhZG1pbgoqIGBJbnZhbGlkSW1wbGVtZW50YXRpb25OYW1lYCAtIE5hbWUgaXMgZW1wdHkgb3IgdG9vIGxvbmcKKiBgSW52YWxpZFZlcnNpb25gIC0gVmVyc2lvbiBpcyAwAAAAAAAAF3JlZ2lzdGVyX2ltcGxlbWVudGF0aW9uAAAAAAMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAd2ZXJzaW9uAAAAAAQAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAAxNYW5hZ2VyRXJyb3I=", "AAAAAAAAAKRHZXQgbGF0ZXN0IHZlcnNpb24gb2YgYW4gaW1wbGVtZW50YXRpb24gYnkgbmFtZS4KCiMgQXJndW1lbnRzCgoqIGBuYW1lYCAtIEltcGxlbWVudGF0aW9uIG5hbWUKCiMgUmV0dXJucwoKVGhlIGxhdGVzdCBpbXBsZW1lbnRhdGlvbiB2ZXJzaW9uLCBvciBgTm9uZWAgaWYgbm90IGZvdW5kLgAAABlnZXRfbGF0ZXN0X2ltcGxlbWVudGF0aW9uAAAAAAAAAQAAAAAAAAAEbmFtZQAAABAAAAABAAAD6AAAB9AAAAAVSW1wbGVtZW50YXRpb25WZXJzaW9uAAAA", "AAAAAAAAAjJTZXQgdGhlIGN1cnJlbnQgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoZXMgdXNlZCBieSB0aGUgZmFjdG9yeS4KCiMgQXV0aG9yaXphdGlvbgoKT25seSBjYWxsYWJsZSBieSBhZG1pbi4KCiMgQXJndW1lbnRzCgoqIGB0b2tlbmAgLSBUb2tlbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2gKKiBgbWV0YWRhdGFgIC0gTWV0YWRhdGEgaW1wbGVtZW50YXRpb24gV0FTTSBoYXNoCiogYGF1Y3Rpb25gIC0gQXVjdGlvbiBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoqIGBnb3Zlcm5vcmAgLSBHb3Zlcm5vciBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoqIGB0cmVhc3VyeWAgLSBUcmVhc3VyeSBpbXBsZW1lbnRhdGlvbiBXQVNNIGhhc2ggKFRPRE86IG5lZWRzIGltcGxlbWVudGF0aW9uKQoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IGFkbWluCiogYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIC0gT25lIG9yIG1vcmUgaW1wbGVtZW50YXRpb25zIGRvbid0IGV4aXN0AAAAAAAbc2V0X2N1cnJlbnRfaW1wbGVtZW50YXRpb25zAAAAAAUAAAAAAAAABXRva2VuAAAAAAAD7gAAACAAAAAAAAAACG1ldGFkYXRhAAAD7gAAACAAAAAAAAAAB2F1Y3Rpb24AAAAD7gAAACAAAAAAAAAACGdvdmVybm9yAAAD7gAAACAAAAAAAAAACHRyZWFzdXJ5AAAD7gAAACAAAAABAAAD6QAAAAIAAAfQAAAADE1hbmFnZXJFcnJvcg==", "AAAAAgAAAONDb250ZXh0IG9mIGEgc2luZ2xlIGF1dGhvcml6ZWQgY2FsbCBwZXJmb3JtZWQgYnkgYW4gYWRkcmVzcy4KCkN1c3RvbSBhY2NvdW50IGNvbnRyYWN0cyB0aGF0IGltcGxlbWVudCBgX19jaGVja19hdXRoYCBzcGVjaWFsIGZ1bmN0aW9uCnJlY2VpdmUgYSBsaXN0IG9mIGBDb250ZXh0YCB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byBhbGwgdGhlIGNhbGxzIHRoYXQKbmVlZCB0byBiZSBhdXRob3JpemVkLgAAAAAAAAAAB0NvbnRleHQAAAAAAwAAAAEAAAAUQ29udHJhY3QgaW52b2NhdGlvbi4AAAAIQ29udHJhY3QAAAABAAAH0AAAAA9Db250cmFjdENvbnRleHQAAAAAAQAAAD1Db250cmFjdCB0aGF0IGhhcyBhIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIGlzIGNyZWF0ZWQuAAAAAAAAFENyZWF0ZUNvbnRyYWN0SG9zdEZuAAAAAQAAB9AAAAAbQ3JlYXRlQ29udHJhY3RIb3N0Rm5Db250ZXh0AAAAAAEAAABEQ29udHJhY3QgdGhhdCBoYXMgYSBjb25zdHJ1Y3RvciB3aXRoIDEgb3IgbW9yZSBhcmd1bWVudHMgaXMgY3JlYXRlZC4AAAAcQ3JlYXRlQ29udHJhY3RXaXRoQ3Rvckhvc3RGbgAAAAEAAAfQAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAA", "AAAAAQAAAL1BdXRob3JpemF0aW9uIGNvbnRleHQgb2YgYSBzaW5nbGUgY29udHJhY3QgY2FsbC4KClRoaXMgc3RydWN0IGNvcnJlc3BvbmRzIHRvIGEgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgY2FsbCBmb3IgYW4gYWRkcmVzcwpmcm9tIGBjb250cmFjdGAgZnVuY3Rpb24gd2l0aCBgZm5fbmFtZWAgbmFtZSBhbmQgYGFyZ3NgIGFyZ3VtZW50cy4AAAAAAAAAAAAAD0NvbnRyYWN0Q29udGV4dAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAHZm5fbmFtZQAAAAAR", "AAAAAgAAAF9Db250cmFjdCBleGVjdXRhYmxlIHVzZWQgZm9yIGNyZWF0aW5nIGEgbmV3IGNvbnRyYWN0IGFuZCB1c2VkIGluCmBDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHRgLgAAAAAAAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAQAAAAEAAAAAAAAABFdhc20AAAABAAAD7gAAACA=", "AAAAAQAAADhWYWx1ZSBvZiBjb250cmFjdCBub2RlIGluIEludm9rZXJDb250cmFjdEF1dGhFbnRyeSB0cmVlLgAAAAAAAAAVU3ViQ29udHJhY3RJbnZvY2F0aW9uAAAAAAAAAgAAAAAAAAAHY29udGV4dAAAAAfQAAAAD0NvbnRyYWN0Q29udGV4dAAAAAAAAAAAD3N1Yl9pbnZvY2F0aW9ucwAAAAPqAAAH0AAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnk=", "AAAAAgAAAS9BIG5vZGUgaW4gdGhlIHRyZWUgb2YgYXV0aG9yaXphdGlvbnMgcGVyZm9ybWVkIG9uIGJlaGFsZiBvZiB0aGUgY3VycmVudApjb250cmFjdCBhcyBpbnZva2VyIG9mIHRoZSBjb250cmFjdHMgZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrLgoKVGhpcyBpcyB1c2VkIGFzIGFuIGFyZ3VtZW50IG9mIGBhdXRob3JpemVfYXNfY3VycmVudF9jb250cmFjdGAgaG9zdCBmdW5jdGlvbi4KClRoaXMgdHJlZSBjb3JyZXNwb25kcyBgcmVxdWlyZV9hdXRoW19mb3JfYXJnc11gIGNhbGxzIG9uIGJlaGFsZiBvZiB0aGUKY3VycmVudCBjb250cmFjdC4AAAAAAAAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnkAAAADAAAAAQAAABJJbnZva2UgYSBjb250cmFjdC4AAAAAAAhDb250cmFjdAAAAAEAAAfQAAAAFVN1YkNvbnRyYWN0SW52b2NhdGlvbgAAAAAAAAEAAAA1Q3JlYXRlIGEgY29udHJhY3QgcGFzc2luZyAwIGFyZ3VtZW50cyB0byBjb25zdHJ1Y3Rvci4AAAAAAAAUQ3JlYXRlQ29udHJhY3RIb3N0Rm4AAAABAAAH0AAAABtDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHQAAAAAAQAAAD1DcmVhdGUgYSBjb250cmFjdCBwYXNzaW5nIDAgb3IgbW9yZSBhcmd1bWVudHMgdG8gY29uc3RydWN0b3IuAAAAAAAAHENyZWF0ZUNvbnRyYWN0V2l0aEN0b3JIb3N0Rm4AAAABAAAH0AAAACpDcmVhdGVDb250cmFjdFdpdGhDb25zdHJ1Y3Rvckhvc3RGbkNvbnRleHQAAA==", "AAAAAQAAAHZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuAAAAAAAAAAAAG0NyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dAAAAAACAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAQAAANZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuClRoaXMgaXMgdGhlIHNhbWUgYXMgYENyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dGAsIGJ1dCBhbHNvIGhhcwpjb250cmFjdCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAAAAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAAAAAAAwAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAgAAAAAAAAAAAAAACkV4ZWN1dGFibGUAAAAAAAMAAAABAAAAAAAAAARXYXNtAAAAAQAAA+4AAAAgAAAAAAAAAAAAAAAMU3RlbGxhckFzc2V0AAAAAAAAAAAAAAAHQWNjb3VudAA="]),
      options
    );
  }

   static deploy<T = Client>({ admin }: { admin: string | Address }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin }, options);
  }
  public readonly fromJson = {
    is_dao : this.txFromJson<boolean>,  get_dao : this.txFromJson<DaoRegistration | null>,  create_dao : this.txFromJson<Result<DaoAddresses, ManagerError>>,  finalize_dao : this.txFromJson<Result<null, ManagerError>>,  get_dao_count : this.txFromJson<number>,  is_nonce_used : this.txFromJson<boolean>,  pause_factory : this.txFromJson<Result<null, ManagerError>>,  enumerate_daos : this.txFromJson<Result<Array<string>, ManagerError>>,  approve_upgrade : this.txFromJson<Result<null, ManagerError>>,  unpause_factory : this.txFromJson<Result<null, ManagerError>>,  get_dao_creation : this.txFromJson<DaoCreation | null>,  predict_addresses : this.txFromJson<Result<DaoAddresses, ManagerError>>,  get_implementation : this.txFromJson<ImplementationVersion | null>,  is_upgrade_approved : this.txFromJson<boolean>,  revoke_implementation : this.txFromJson<Result<null, ManagerError>>,  register_implementation : this.txFromJson<Result<null, ManagerError>>,  get_latest_implementation : this.txFromJson<ImplementationVersion | null>,  set_current_implementations : this.txFromJson<Result<null, ManagerError>>
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
   * Build a topics filter row for the "DaoRegistered" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  daoRegisteredEventFilter(topicValues?: { token_address?: string | Address; creator?: string | Address }): string[] {
    return this.spec.eventTopicFilter("DaoRegistered", topicValues);
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