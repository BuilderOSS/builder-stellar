import {Item, Property, Settings, ItemParam, IpfsGroup, PropertyHeader, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Module admin: the launch admin during setup, the Treasury once live
   * (or from an assurance drive's early `handoff`).
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * The Token this contract serves (the only caller of the mint hooks).
   */
  token(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * One-shot launch handoff (Setup -> Live).
   *
   * Hands the admin (artwork, settings and upgrades) to `treasury`, marks
   * the module Live, and emits `MetadataLaunched`. After an early
   * `handoff` the admin is already the Treasury and does not move again.
   *
   * # Authorization
   *
   * The Manager wired at construction (`launch_dao` / `launch_when_ready`).
   *
   * # Panics
   *
   * * `AlreadyLive` - a second call
   * * `TreasuryMismatch` - `treasury` is not the Treasury wired at construction
   */
  launch({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Early handoff for an assurance drive (`manager.open_assurance`): the
   * admin moves to the Treasury and the contract stays in Setup. The
   * Treasury cannot act before launch, so artwork and settings are frozen
   * until then.
   *
   * # Authorization
   *
   * The Manager wired at construction.
   *
   * # Panics
   *
   * * `AlreadyLive` - the contract is already Live
   * * `TreasuryMismatch` - `treasury` is not the Treasury wired at construction
   */
  handoff({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Advance the storage layout after an upgrade (admin only). Panics
   * `NothingToMigrate` unless the stored layout is older than this code's
   * `STORAGE_VERSION`. Until it runs, every entry point that changes state
   * fails `StorageVersionMismatch`. A governance upgrade runs `upgrade`
   * and `migrate` in one proposal; the Treasury does not depend on this
   * contract, so a skipped migration can always be completed by proposal.
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Replace this contract's code with `to_hash`.
   *
   * # Authorization
   *
   * The admin: the launch admin in Setup, the Treasury (by proposal) once
   * Live. During an assurance drive the admin is the Treasury, which
   * cannot act before launch, so upgrades are frozen.
   *
   * # Guarantees
   *
   * `from_hash` must be the running hash (`HashMismatch`) and the Manager
   * registry must approve `from_hash -> to_hash` with a non-revoked target
   * (`UpgradeNotApproved`); see `common::upgrade::apply`.
   */
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Release version of the running code, looked up in the Manager
   * registry by `wasm_hash()`. Panics `ImplementationNotFound` if the
   * registry has no record of it.
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Paginated items of a property (`limit` <= `MAX_PAGE`). Returns an empty
   * vec when `property_id` is out of range or `start` is past the end.
   *
   * # Errors
   *
   * * `LimitTooHigh` - `limit` above `MAX_PAGE`
   */
  get_items({ property_id, start, limit }: { property_id: number; start: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<Item>, Error>>>;
  /**
   * Generate seed for a token upon mint (hook called by Token contract)
   *
   * Writes the token's selections (an empty record when no properties
   * exist yet) and emits `SeedGenerated` when it seeds.
   *
   * # Arguments
   *
   * * `token_id` - The token ID being minted
   *
   * # Returns
   *
   * Returns `true` if seed was generated successfully, `false` if no properties exist
   *
   * # Authorization
   *
   * Only the Token wired at construction (its auth is required).
   *
   * # Errors
   *
   * * `NotInitialized` - settings missing
   * * `StorageVersionMismatch` - a migration is due; the Token ignores the
   * failure, so the token stays unseeded until `regenerate`
   */
  on_minted({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<boolean, Error>>>;
  /**
   * SEP-50 token metadata, built on-chain: a `data:application/json;base64`
   * URI of `{"name", "image", "attributes"}`, where `name` is
   * `<token_name> #<id>`. The token's own `token_uri` calls this with its
   * collection name (Soroban forbids calling back into the token). `image` is
   * `<renderer_base>?contract=<token>&token=<id>`; a compositor derives the
   * layers from `get_attributes`, `property_headers`, `get_items` and
   * `get_ipfs_group`. Traits whose property or item no longer exists (after
   * a reset) are left out.
   *
   * Anyone may call it; it only reads.
   *
   * # Errors
   *
   * * `NotSeeded` - the token has no attributes yet (minted before
   * artwork, or not minted: existence is not checked here)
   * * `StringTooLong` / `InvalidName` - `token_name` is longer than
   * `common::MAX_STRING_LENGTH` or contains `"`, `\` or a control character
   * * `TokenUriTooLong` - the document would not fit its buffer
   */
  token_uri({ token_id, token_name }: { token_id: number; token_name: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * The WASM hash this contract recorded at construction or its last
   * `upgrade`. It is the contract's own record; the host's view of the
   * running code is `Address::executable()`.
   */
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Seed a token that was minted before artwork existed (or whose
   * `on_minted` hook failed). Admin only. A token that already has
   * selections is never re-seeded, so the admin cannot re-roll traits.
   *
   * # Errors
   *
   * * `TokenNotMinted` - the token does not exist
   * * `AlreadySeeded` - the token already has attributes
   * * `NoProperties` - no properties are configured yet
   */
  regenerate({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Item count of a property, 0 when it does not exist.
   */
  items_count({ property_id }: { property_id: number }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Number of profile updates since creation (0 = the initial profile).
   */
  profile_seq(options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  /**
   * A property with all of its items, or `None` when it does not exist.
   * Reads every item page of the property (at most `MAX_ITEM_PAGES`).
   */
  get_property({ property_id }: { property_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Property | null>>;
  /**
   * The token and renderer base. `NotInitialized` if never set.
   */
  get_settings(options?: MethodOptions): Promise<AssembledTransaction<Result<Settings, Error>>>;
  /**
   * SHA-256 of the latest profile bytes, to verify an indexed copy.
   */
  profile_hash(options?: MethodOptions): Promise<AssembledTransaction<Result<Uint8Array, Error>>>;
  /**
   * Get IPFS groups used by artwork items. O(#groups): prefer `get_ipfs_group`.
   */
  get_ipfs_data(options?: MethodOptions): Promise<AssembledTransaction<Array<IpfsGroup>>>;
  /**
   * Base URL of the image compositor `token_uri` points `image` at.
   */
  renderer_base(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * Add new properties and items. Items are appended to existing
   * properties or to the new ones in `names`; all of them share
   * `ipfs_group`, which is reused if it equals the last group stored.
   *
   * # Arguments
   *
   * * `names` - Property names to add
   * * `items` - Items to add to properties
   * * `ipfs_group` - IPFS base URI and extension for these items
   *
   * # Authorization
   *
   * Admin only (the launch admin in setup, the Treasury once live).
   *
   * # Errors
   *
   * * `OnePropertyAndItemRequired` - First addition must have at least 1 property and 1 item
   * * `PropertyHasNoItems` - The call adds no items, or a new property gets none
   * * `TooManyProperties` - Exceeds the `MAX_PROPERTIES` (16) limit
   * * `InvalidPropertySelected` - Item references non-existent property
   * * `TooManyItems` - more than `MAX_ITEMS_PER_CALL` (30) items in one call;
   * batch larger uploads across several calls (calls with the same
   * `ipfs_group` share one group)
   * * `PropertyFull` - a property would exceed `MAX_ITEMS_PER_PROPERTY`
   * * `TooManyIpfsGroups` - a new group beyond `MAX_IPFS_GROUPS`
   * *
   */
  add_properties({ names, items, ipfs_group }: { names: Array<string>; items: Array<ItemParam>; ipfs_group: IpfsGroup }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * The generated item selections for a token, as
   * `[num_properties, item_index..]`.
   *
   * # Errors
   *
   * * `TokenNotMinted` - the token has no selections: it does not exist,
   * or it was minted before any artwork
   */
  get_attributes({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<number>, Error>>>;
  /**
   * A single IPFS group by absolute index (the `reference_slot` of items).
   */
  get_ipfs_group({ index }: { index: number }, options?: MethodOptions): Promise<AssembledTransaction<IpfsGroup | null>>;
  /**
   * Get all properties. O(total items): may exceed read limits on large
   * collections; prefer `get_property`/`get_items` pagination.
   */
  get_properties(options?: MethodOptions): Promise<AssembledTransaction<Array<Property>>>;
  /**
   * Replace the DAO profile (admin only). `expected_seq` must equal the
   * current `profile_seq()`, so an update written against a stale copy of
   * the profile (for example one proposed before another edit executed)
   * fails with `ProfileSeqMismatch` instead of overwriting newer fields.
   * Emits `ProfileUpdated` with the next seq; only the hash is stored.
   *
   * # Errors
   *
   * * `ProfileSeqMismatch` - `expected_seq` is not the current seq
   * * `InvalidProfile` - empty or longer than `common::MAX_PROFILE_LENGTH`
   */
  update_profile({ expected_seq, profile }: { expected_seq: number; profile: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Number of IPFS groups in use (at most `MAX_IPFS_GROUPS`).
   */
  ipfs_data_count(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Batch variant of `on_minted` for the contiguous range
   * `[first_token_id, first_token_id + count)`.
   *
   * Authorizes the token and loads the properties once for the whole range
   * instead of once per token. Emits a single `SeedsGenerated` event for
   * the whole range rather than one `SeedGenerated` per token.
   *
   * # Authorization
   *
   * Only the Token wired at construction (its auth is required).
   *
   * # Errors
   *
   * * `NotInitialized` - settings missing
   */
  on_minted_batch({ first_token_id, count }: { first_token_id: number; count: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<boolean, Error>>>;
  /**
   * Storage-layout version of the data held by this contract. While it
   * differs from the code's `STORAGE_VERSION`, every entry point that
   * changes state fails `StorageVersionMismatch`.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Number of properties (at most `MAX_PROPERTIES`). Anyone may read it.
   */
  properties_count(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Every property's name and item count (at most 16), without items:
   * enough for a client to resume artwork setup from chain state alone.
   */
  property_headers(options?: MethodOptions): Promise<AssembledTransaction<Array<PropertyHeader>>>;
  /**
   * Update renderer base URL (admin only). Emits `RendererBaseUpdated`.
   *
   * # Errors
   *
   * * `StringTooLong` / `InvalidName` - longer than
   * `common::MAX_STRING_LENGTH`, or contains `"`, `\` or a control character
   */
  update_renderer_base({ new_renderer_base }: { new_renderer_base: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Delete all properties and recreate with new ones. Tokens keep their
   * stored selections; `token_uri` leaves out any trait whose property
   * or item no longer exists, and an index that still exists now names
   * the new item at that position.
   *
   * WARNING: This can break existing token metadata if properties change structure
   *
   * # Authorization
   *
   * Admin only.
   *
   * # Errors
   *
   * As `add_properties`, for the new artwork.
   */
  delete_and_recreate_properties({ names, items, ipfs_group }: { names: Array<string>; items: Array<ItemParam>; ipfs_group: IpfsGroup }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAL5NZXRhZGF0YSBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6TUVUQURBVEFgKS4gRW50cnkgcG9pbnRzCnJldHVybiB0aGVtIGFzIGBSZXN1bHRgIGVycm9ycywgb3IgcGFuaWMgd2l0aCB0aGVtIHdoZXJlIHRoZXkgY2Fubm90CnJldHVybiBvbmUgKHRoZSBjb25zdHJ1Y3RvciwgYGxhdW5jaGAsIGBoYW5kb2ZmYCkuAAAAAAAAAAAABUVycm9yAAAAAAAAFAAAADxTZXR0aW5ncyBvciBwcm9maWxlIHN0YXRlIG1pc3NpbmcgKGNvbnRyYWN0IG5vdCBpbml0aWFsaXNlZCkAAAAOTm90SW5pdGlhbGl6ZWQAAAAAHIUAAABTYGxhdW5jaGAgb3IgYGhhbmRvZmZgIHdhcyBnaXZlbiBhIFRyZWFzdXJ5IG90aGVyIHRoYW4gdGhlIG9uZSB3aXJlZCBhdApjb25zdHJ1Y3Rpb24AAAAAEFRyZWFzdXJ5TWlzbWF0Y2gAAByGAAAAS1RoZSBmaXJzdCBgYWRkX3Byb3BlcnRpZXNgIGNhbGwgbXVzdCBhZGQgYXQgbGVhc3Qgb25lIHByb3BlcnR5IGFuZCBvbmUgaXRlbQAAAAAaT25lUHJvcGVydHlBbmRJdGVtUmVxdWlyZWQAAAAAHIcAAAA1QSBjYWxsIGFkZGVkIG5vIGl0ZW1zLCBvciBhIG5ldyBwcm9wZXJ0eSBnb3Qgbm8gaXRlbXMAAAAAAAASUHJvcGVydHlIYXNOb0l0ZW1zAAAAAByIAAAAKk1vcmUgdGhhbiBgTUFYX1BST1BFUlRJRVNgICgxNikgcHJvcGVydGllcwAAAAAAEVRvb01hbnlQcm9wZXJ0aWVzAAAAAAAciQAAADFBbiBpdGVtIHJlZmVyZW5jZXMgYSBwcm9wZXJ0eSB0aGF0IGRvZXMgbm90IGV4aXN0AAAAAAAAF0ludmFsaWRQcm9wZXJ0eVNlbGVjdGVkAAAAHIoAAAAtYHJlZ2VuZXJhdGVgIGNhbGxlZCB3aGlsZSBubyBwcm9wZXJ0aWVzIGV4aXN0AAAAAAAADE5vUHJvcGVydGllcwAAHIsAAABBTW9yZSB0aGFuIGBNQVhfSVRFTVNfUEVSX0NBTExgIGl0ZW1zIGluIG9uZSBgYWRkX3Byb3BlcnRpZXNgIGNhbGwAAAAAAAAMVG9vTWFueUl0ZW1zAAAcjAAAADBgZ2V0X2l0ZW1zYCB3YXMgZ2l2ZW4gYSBgbGltaXRgIGFib3ZlIGBNQVhfUEFHRWAAAAAMTGltaXRUb29IaWdoAAAcjQAAAIdgcmVnZW5lcmF0ZWA6IHRoZSB0b2tlbiBkb2VzIG5vdCBleGlzdC4gYGdldF9hdHRyaWJ1dGVzYDogdGhlIHRva2VuCmhhcyBubyBzZWxlY3Rpb25zIChpdCBkb2VzIG5vdCBleGlzdCwgb3Igd2FzIG1pbnRlZCBiZWZvcmUgYXJ0d29yaykAAAAADlRva2VuTm90TWludGVkAAAAAByOAAAAO2ByZWdlbmVyYXRlYCBjYWxsZWQgZm9yIGEgdG9rZW4gdGhhdCBhbHJlYWR5IGhhcyBhdHRyaWJ1dGVzAAAAAA1BbHJlYWR5U2VlZGVkAAAAAAAcjwAAAE1BIHNldHRpbmdzIG9yIGFydHdvcmsgc3RyaW5nLCBvciB0aGUgYHRva2VuX3VyaWAgbmFtZSwgaXMgbG9uZ2VyIHRoYW4KaXRzIGNhcAAAAAAAAA1TdHJpbmdUb29Mb25nAAAAAAAckAAAAIlBIHN0cmluZyBjb3BpZWQgaW50byB0aGUgdG9rZW4gSlNPTiAoYW4gYXJ0d29yayBuYW1lLCB0aGUgcmVuZGVyZXIKYmFzZSBvciB0aGUgYHRva2VuX3VyaWAgbmFtZSkgY29udGFpbnMgYCJgLCBgXGAgb3IgYSBjb250cm9sIGNoYXJhY3RlcgAAAAAAAAtJbnZhbGlkTmFtZQAAAByRAAAAME1vcmUgdGhhbiBgTUFYX0lQRlNfR1JPVVBTYCBkaXN0aW5jdCBJUEZTIGdyb3VwcwAAABFUb29NYW55SXBmc0dyb3VwcwAAAAAAHJIAAAA2QSBwcm9wZXJ0eSB3b3VsZCBleGNlZWQgYE1BWF9JVEVNU19QRVJfUFJPUEVSVFlgIGl0ZW1zAAAAAAAMUHJvcGVydHlGdWxsAAAckwAAAD5BIHByb2ZpbGUgaXMgZW1wdHkgb3IgbG9uZ2VyIHRoYW4gYGNvbW1vbjo6TUFYX1BST0ZJTEVfTEVOR1RIYAAAAAAADkludmFsaWRQcm9maWxlAAAAAByUAAAAMWB1cGRhdGVfcHJvZmlsZWAgd2FzIGdpdmVuIGEgc3RhbGUgYGV4cGVjdGVkX3NlcWAAAAAAAAASUHJvZmlsZVNlcU1pc21hdGNoAAAAAByVAAAAPlRoZSB0b2tlbiBKU09OIHdvdWxkIGV4Y2VlZCBpdHMgYnVmZmVyIChhIHN0cmluZyBvdmVyIGl0cyBjYXApAAAAAAAPVG9rZW5VcmlUb29Mb25nAAAAHJYAAAClYHRva2VuX3VyaWA6IHRoZSB0b2tlbiBoYXMgbm8gc2VsZWN0aW9ucywgYmVjYXVzZSBpdCB3YXMgbWludGVkIGJlZm9yZQphbnkgYXJ0d29yayAoYHJlZ2VuZXJhdGVgIHNlZWRzIGl0KSBvciB3YXMgbmV2ZXIgbWludGVkIChgdG9rZW5fdXJpYApkb2VzIG5vdCBjaGVjayBleGlzdGVuY2UpAAAAAAAACU5vdFNlZWRlZAAAAAAAHJcAAAEWVGhlIHN0b3JlZCBkYXRhIGxheW91dCBpcyBub3QgdGhlIG9uZSB0aGlzIGNvZGUgZXhwZWN0czogYW4gdXBncmFkZQp3aG9zZSBgbWlncmF0ZWAgaGFzIG5vdCBydW4geWV0LCBvciBhbiB1cGdyYWRlIHRvIGNvZGUgd2l0aCBhbiBvbGRlcgpsYXlvdXQuIEV2ZXJ5IGVudHJ5IHBvaW50IHRoYXQgY2hhbmdlcyBzdGF0ZSByZWZ1c2VzIHVudGlsIGBtaWdyYXRlYAoob3IsIGZvciBhbiBvbGRlciBsYXlvdXQsIGFub3RoZXIgYHVwZ3JhZGVgKSBicmluZ3MgdGhlIHR3byBiYWNrIGluCnN0ZXAAAAAAABZTdG9yYWdlVmVyc2lvbk1pc21hdGNoAAAAAByY", "AAAABQAAAMtBIG5ldyBwcm9wZXJ0eSwgZnJvbSBgYWRkX3Byb3BlcnRpZXNgLCBgZGVsZXRlX2FuZF9yZWNyZWF0ZV9wcm9wZXJ0aWVzYApvciB0aGUgY29uc3RydWN0b3IuIGBwcm9wZXJ0eV9pZGAgaXMgaXRzIGluZGV4IChpZHMgcmVzdGFydCBhdCAwIGFmdGVyIGEKcmVzZXQpLiBJdGVtcyBhcmUgbm90IGVtaXR0ZWQ7IHJlYWQgdGhlbSB3aXRoIGBnZXRfaXRlbXNgLgAAAAAAAAAADVByb3BlcnR5QWRkZWQAAAAAAAABAAAADnByb3BlcnR5X2FkZGVkAAAAAAACAAAAAAAAAAtwcm9wZXJ0eV9pZAAAAAAEAAAAAQAAAAAAAAAEbmFtZQAAABAAAAAAAAAAAg==", "AAAABQAAAMJBIHRva2VuJ3MgdHJhaXQgc2VsZWN0aW9ucywgZnJvbSBgb25fbWludGVkYCBvciBgcmVnZW5lcmF0ZWAuCmBzZWxlY3Rpb25zYCBpcyBgW251bV9wcm9wZXJ0aWVzLCBpdGVtX2luZGV4Li5dYCwgYXMgYGdldF9hdHRyaWJ1dGVzYApyZXR1cm5zIGl0LiBOb3QgZW1pdHRlZCBmb3IgYSB0b2tlbiBtaW50ZWQgYmVmb3JlIGFueSBhcnR3b3JrLgAAAAAAAAAAAA1TZWVkR2VuZXJhdGVkAAAAAAAAAQAAAA5zZWVkX2dlbmVyYXRlZAAAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAObnVtX3Byb3BlcnRpZXMAAAAAAAQAAAAAAAAAAAAAAApzZWxlY3Rpb25zAAAAAAPqAAAABAAAAAAAAAAC", "AAAABQAAAMBUaGUgREFPIHByb2ZpbGUgKHNlcmlhbGl6ZWQgSlNPTjogZGVzY3JpcHRpb24sIGxpbmtzLCBpbWFnZSkuIFRoaXMgZXZlbnQKaXMgdGhlIG9ubHkgY29weSBvZiB0aGUgdGV4dDsgdGhlIGNoYWluIGtlZXBzIGBoYXNoYCBhbmQgYHNlcWAuIGBzZXFgIGlzIDAKYXQgY3JlYXRpb24gYW5kIGluY3JlYXNlcyBieSBvbmUgcGVyIHVwZGF0ZS4AAAAAAAAADlByb2ZpbGVVcGRhdGVkAAAAAAABAAAAD3Byb2ZpbGVfdXBkYXRlZAAAAAADAAAAAAAAAANzZXEAAAAABAAAAAEAAAAAAAAABGhhc2gAAAPuAAAAIAAAAAAAAAAAAAAAB3Byb2ZpbGUAAAAAEAAAAAAAAAAC", "AAAABQAAAT1FbWl0dGVkIG9uY2UgYnkgYG9uX21pbnRlZF9iYXRjaGAgZm9yIHRoZSBjb250aWd1b3VzIHJhbmdlCmBbZmlyc3RfdG9rZW5faWQsIGZpcnN0X3Rva2VuX2lkICsgY291bnQpYCwgaW5zdGVhZCBvZiBvbmUKYFNlZWRHZW5lcmF0ZWRgIHBlciB0b2tlbiAoa2VlcHMgbGFyZ2UgYmF0Y2hlcyB1bmRlciB0aGUgcGVyLXRyYW5zYWN0aW9uCmV2ZW50IHNpemUgbGltaXQpLiBgc2VsZWN0aW9uc1tpXWAgYmVsb25ncyB0byB0b2tlbiBgZmlyc3RfdG9rZW5faWQgKyBpYAphbmQgaGFzIHRoZSBzYW1lIHNoYXBlIGFzIGBTZWVkR2VuZXJhdGVkLnNlbGVjdGlvbnNgLgAAAAAAAAAAAAAOU2VlZHNHZW5lcmF0ZWQAAAAAAAEAAAAPc2VlZHNfZ2VuZXJhdGVkAAAAAAQAAAAAAAAADmZpcnN0X3Rva2VuX2lkAAAAAAAEAAAAAQAAAAAAAAAFY291bnQAAAAAAAAEAAAAAAAAAAAAAAAObnVtX3Byb3BlcnRpZXMAAAAAAAQAAAAAAAAAAAAAAApzZWxlY3Rpb25zAAAAAAPqAAAD6gAAAAQAAAAAAAAAAg==", "AAAABQAAAKFUaGUgYWRtaW4gY2xlYXJlZCBldmVyeSBwcm9wZXJ0eSAoYGRlbGV0ZV9hbmRfcmVjcmVhdGVfcHJvcGVydGllc2ApOyB0aGUKbmV3IHByb3BlcnRpZXMgZm9sbG93IGFzIGBQcm9wZXJ0eUFkZGVkYCBmcm9tIGlkIDAuIFRva2VucyBrZWVwIHRoZWlyCnN0b3JlZCBzZWxlY3Rpb25zLgAAAAAAAAAAAAAPUHJvcGVydGllc1Jlc2V0AAAAAAEAAAAQcHJvcGVydGllc19yZXNldAAAAAEAAAAzTnVtYmVyIG9mIHByb3BlcnRpZXMgdGhhdCBleGlzdGVkIGJlZm9yZSB0aGUgcmVzZXQuAAAAABJvbGRfbnVtX3Byb3BlcnRpZXMAAAAAAAQAAAAAAAAAAg==", "AAAABQAAAHFFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgbWV0YWRhdGEgbW9kdWxlIChTZXR1cCAtPiBMaXZlKS4KYHRyZWFzdXJ5YCBpcyB0aGUgYWRtaW4gZnJvbSB0aGVuIG9uLgAAAAAAAAAAAAAQTWV0YWRhdGFMYXVuY2hlZAAAAAEAAAARbWV0YWRhdGFfbGF1bmNoZWQAAAAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAABAAAAAg==", "AAAABQAAAHRFbWl0dGVkIG9uY2UgYnkgdGhlIGNvbnN0cnVjdG9yLCB3aGVuIHRoZSBNYW5hZ2VyIGRlcGxveXMgdGhlIGNvbnRyYWN0CmluIGBjcmVhdGVfZGFvYC4gYGFkbWluYCBpcyB0aGUgbGF1bmNoIGFkbWluLgAAAAAAAAATTWV0YWRhdGFJbml0aWFsaXplZAAAAAABAAAAFG1ldGFkYXRhX2luaXRpYWxpemVkAAAAAwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAANcmVuZGVyZXJfYmFzZQAAAAAAABAAAAAAAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAAg==", "AAAABQAAAERUaGUgYWRtaW4gY2hhbmdlZCB0aGUgaW1hZ2UgY29tcG9zaXRvciBVUkwgKGB1cGRhdGVfcmVuZGVyZXJfYmFzZWApLgAAAAAAAAATUmVuZGVyZXJCYXNlVXBkYXRlZAAAAAABAAAAFXJlbmRlcmVyX2Jhc2VfdXBkYXRlZAAAAAAAAAIAAAAAAAAACG9sZF9iYXNlAAAAEAAAAAAAAAAAAAAACG5ld19iYXNlAAAAEAAAAAAAAAAC", "AAAAAQAAAD1PbmUgdmFsdWUgb2YgYSBwcm9wZXJ0eSAoYSB0cmFpdCksIGFzIGBnZXRfaXRlbXNgIHJldHVybnMgaXQuAAAAAAAAAAAAAARJdGVtAAAAAgAAAHtBdCBtb3N0IGBjb21tb246Ok1BWF9BUlRXT1JLX05BTUVfTEVOR1RIYCBieXRlcywgd2l0aG91dCBgImAsIGBcYCBvcgpjb250cm9sIGNoYXJhY3RlcnMgKGl0IGlzIGNvcGllZCBpbnRvIHRoZSB0b2tlbiBKU09OKS4AAAAABG5hbWUAAAAQAAAATkluZGV4IG9mIHRoZSBpdGVtJ3MgW2BJcGZzR3JvdXBgXSAoYGdldF9pcGZzX2dyb3VwYCksIGJlbG93CmBNQVhfSVBGU19HUk9VUFNgLgAAAAAADnJlZmVyZW5jZV9zbG90AAAAAAAE", "AAAAAQAAAD1BIHByb3BlcnR5ICh0cmFpdCB0eXBlKSB3aXRoIGFsbCBvZiBpdHMgaXRlbXMsIGluIGl0ZW0gb3JkZXIuAAAAAAAAAAAAAAhQcm9wZXJ0eQAAAAIAAAAAAAAABWl0ZW1zAAAAAAAD6gAAB9AAAAAESXRlbQAAAAAAAAAEbmFtZQAAABA=", "AAAAAQAAAENUaGUgVG9rZW4gdGhpcyBjb250cmFjdCBzZXJ2ZXMgYW5kIHdoZXJlIHRva2VuIGltYWdlcyBhcmUgcmVuZGVyZWQuAAAAAAAAAAAIU2V0dGluZ3MAAAACAAAAQkJhc2UgVVJMIG9mIHRoZSBpbWFnZSBjb21wb3NpdG9yOyBgdG9rZW5fdXJpYCBwb2ludHMgYGltYWdlYCBoZXJlLgAAAAAADXJlbmRlcmVyX2Jhc2UAAAAAAAAQAAAALVRoZSBUb2tlbjogdGhlIG9ubHkgY2FsbGVyIG9mIHRoZSBtaW50IGhvb2tzLgAAAAAAAAV0b2tlbgAAAAAAABM=", "AAAAAQAAAMFUaGUgSVBGUyBmb2xkZXIgKGBiYXNlX3VyaWApIGFuZCBmaWxlIGV4dGVuc2lvbiBhIGJhdGNoIG9mIGl0ZW0gaW1hZ2VzCndhcyB1cGxvYWRlZCB3aXRoLiBJdGVtcyBwb2ludCBhdCB0aGVpciBncm91cCBieSBgcmVmZXJlbmNlX3Nsb3RgOyB0aGUKb2ZmLWNoYWluIGNvbXBvc2l0b3IgYnVpbGRzIGVhY2ggaW1hZ2UgVVJMIGZyb20gaXQuAAAAAAAAAAAAAAlJcGZzR3JvdXAAAAAAAAACAAAAKkF0IG1vc3QgYGNvbW1vbjo6TUFYX1NUUklOR19MRU5HVEhgIGJ5dGVzLgAAAAAACGJhc2VfdXJpAAAAEAAAAC1BdCBtb3N0IGBjb21tb246Ok1BWF9FWFRFTlNJT05fTEVOR1RIYCBieXRlcy4AAAAAAAAJZXh0ZW5zaW9uAAAAAAAAEA==", "AAAAAQAAACVBbiBpdGVtIHRvIGFkZCB3aXRoIGBhZGRfcHJvcGVydGllc2AuAAAAAAAAAAAAAAlJdGVtUGFyYW0AAAAAAAADAAAARFdoZXRoZXIgYHByb3BlcnR5X2lkYCBjb3VudHMgZnJvbSB0aGUgZmlyc3QgcHJvcGVydHkgdGhpcyBjYWxsIGFkZHMuAAAAD2lzX25ld19wcm9wZXJ0eQAAAAABAAAAAAAAAARuYW1lAAAAEAAAAHRUaGUgcHJvcGVydHkncyBpbmRleDogYW1vbmcgdGhlIGV4aXN0aW5nIHByb3BlcnRpZXMsIG9yLCB3aXRoCmBpc19uZXdfcHJvcGVydHlgLCBhbW9uZyB0aGUgYG5hbWVzYCBvZiB0aGUgc2FtZSBjYWxsLgAAAAtwcm9wZXJ0eV9pZAAAAAAE", "AAAAAQAAADRBIHByb3BlcnR5J3MgbmFtZSBhbmQgaXRlbSBjb3VudCwgd2l0aG91dCBpdHMgaXRlbXMuAAAAAAAAAA5Qcm9wZXJ0eUhlYWRlcgAAAAAAAgAAAAAAAAAKaXRlbV9jb3VudAAAAAAABAAAAAAAAAAEbmFtZQAAABA=", "AAAAAAAAAHNNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgb25jZSBsaXZlCihvciBmcm9tIGFuIGFzc3VyYW5jZSBkcml2ZSdzIGVhcmx5IGBoYW5kb2ZmYCkuAAAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAAENUaGUgVG9rZW4gdGhpcyBjb250cmFjdCBzZXJ2ZXMgKHRoZSBvbmx5IGNhbGxlciBvZiB0aGUgbWludCBob29rcykuAAAAAAV0b2tlbgAAAAAAAAAAAAABAAAD6QAAABMAAAAD", "AAAAAAAAAcNPbmUtc2hvdCBsYXVuY2ggaGFuZG9mZiAoU2V0dXAgLT4gTGl2ZSkuCgpIYW5kcyB0aGUgYWRtaW4gKGFydHdvcmssIHNldHRpbmdzIGFuZCB1cGdyYWRlcykgdG8gYHRyZWFzdXJ5YCwgbWFya3MKdGhlIG1vZHVsZSBMaXZlLCBhbmQgZW1pdHMgYE1ldGFkYXRhTGF1bmNoZWRgLiBBZnRlciBhbiBlYXJseQpgaGFuZG9mZmAgdGhlIGFkbWluIGlzIGFscmVhZHkgdGhlIFRyZWFzdXJ5IGFuZCBkb2VzIG5vdCBtb3ZlIGFnYWluLgoKIyBBdXRob3JpemF0aW9uCgpUaGUgTWFuYWdlciB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24gKGBsYXVuY2hfZGFvYCAvIGBsYXVuY2hfd2hlbl9yZWFkeWApLgoKIyBQYW5pY3MKCiogYEFscmVhZHlMaXZlYCAtIGEgc2Vjb25kIGNhbGwKKiBgVHJlYXN1cnlNaXNtYXRjaGAgLSBgdHJlYXN1cnlgIGlzIG5vdCB0aGUgVHJlYXN1cnkgd2lyZWQgYXQgY29uc3RydWN0aW9uAAAAAAZsYXVuY2gAAAAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAA=", "AAAAAAAAAZJFYXJseSBoYW5kb2ZmIGZvciBhbiBhc3N1cmFuY2UgZHJpdmUgKGBtYW5hZ2VyLm9wZW5fYXNzdXJhbmNlYCk6IHRoZQphZG1pbiBtb3ZlcyB0byB0aGUgVHJlYXN1cnkgYW5kIHRoZSBjb250cmFjdCBzdGF5cyBpbiBTZXR1cC4gVGhlClRyZWFzdXJ5IGNhbm5vdCBhY3QgYmVmb3JlIGxhdW5jaCwgc28gYXJ0d29yayBhbmQgc2V0dGluZ3MgYXJlIGZyb3plbgp1bnRpbCB0aGVuLgoKIyBBdXRob3JpemF0aW9uCgpUaGUgTWFuYWdlciB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24uCgojIFBhbmljcwoKKiBgQWxyZWFkeUxpdmVgIC0gdGhlIGNvbnRyYWN0IGlzIGFscmVhZHkgTGl2ZQoqIGBUcmVhc3VyeU1pc21hdGNoYCAtIGB0cmVhc3VyeWAgaXMgbm90IHRoZSBUcmVhc3VyeSB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24AAAAAAAdoYW5kb2ZmAAAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAA=", "AAAAAAAAAZtBZHZhbmNlIHRoZSBzdG9yYWdlIGxheW91dCBhZnRlciBhbiB1cGdyYWRlIChhZG1pbiBvbmx5KS4gUGFuaWNzCmBOb3RoaW5nVG9NaWdyYXRlYCB1bmxlc3MgdGhlIHN0b3JlZCBsYXlvdXQgaXMgb2xkZXIgdGhhbiB0aGlzIGNvZGUncwpgU1RPUkFHRV9WRVJTSU9OYC4gVW50aWwgaXQgcnVucywgZXZlcnkgZW50cnkgcG9pbnQgdGhhdCBjaGFuZ2VzIHN0YXRlCmZhaWxzIGBTdG9yYWdlVmVyc2lvbk1pc21hdGNoYC4gQSBnb3Zlcm5hbmNlIHVwZ3JhZGUgcnVucyBgdXBncmFkZWAKYW5kIGBtaWdyYXRlYCBpbiBvbmUgcHJvcG9zYWw7IHRoZSBUcmVhc3VyeSBkb2VzIG5vdCBkZXBlbmQgb24gdGhpcwpjb250cmFjdCwgc28gYSBza2lwcGVkIG1pZ3JhdGlvbiBjYW4gYWx3YXlzIGJlIGNvbXBsZXRlZCBieSBwcm9wb3NhbC4AAAAAB21pZ3JhdGUAAAAAAAAAAAA=", "AAAAAAAAAclSZXBsYWNlIHRoaXMgY29udHJhY3QncyBjb2RlIHdpdGggYHRvX2hhc2hgLgoKIyBBdXRob3JpemF0aW9uCgpUaGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gaW4gU2V0dXAsIHRoZSBUcmVhc3VyeSAoYnkgcHJvcG9zYWwpIG9uY2UKTGl2ZS4gRHVyaW5nIGFuIGFzc3VyYW5jZSBkcml2ZSB0aGUgYWRtaW4gaXMgdGhlIFRyZWFzdXJ5LCB3aGljaApjYW5ub3QgYWN0IGJlZm9yZSBsYXVuY2gsIHNvIHVwZ3JhZGVzIGFyZSBmcm96ZW4uCgojIEd1YXJhbnRlZXMKCmBmcm9tX2hhc2hgIG11c3QgYmUgdGhlIHJ1bm5pbmcgaGFzaCAoYEhhc2hNaXNtYXRjaGApIGFuZCB0aGUgTWFuYWdlcgpyZWdpc3RyeSBtdXN0IGFwcHJvdmUgYGZyb21faGFzaCAtPiB0b19oYXNoYCB3aXRoIGEgbm9uLXJldm9rZWQgdGFyZ2V0CihgVXBncmFkZU5vdEFwcHJvdmVkYCk7IHNlZSBgY29tbW9uOjp1cGdyYWRlOjphcHBseWAuAAAAAAAAB3VwZ3JhZGUAAAAAAgAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAAA", "AAAAAAAAAJ1SZWxlYXNlIHZlcnNpb24gb2YgdGhlIHJ1bm5pbmcgY29kZSwgbG9va2VkIHVwIGluIHRoZSBNYW5hZ2VyCnJlZ2lzdHJ5IGJ5IGB3YXNtX2hhc2goKWAuIFBhbmljcyBgSW1wbGVtZW50YXRpb25Ob3RGb3VuZGAgaWYgdGhlCnJlZ2lzdHJ5IGhhcyBubyByZWNvcmQgb2YgaXQuAAAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAQ", "AAAAAAAAAMFQYWdpbmF0ZWQgaXRlbXMgb2YgYSBwcm9wZXJ0eSAoYGxpbWl0YCA8PSBgTUFYX1BBR0VgKS4gUmV0dXJucyBhbiBlbXB0eQp2ZWMgd2hlbiBgcHJvcGVydHlfaWRgIGlzIG91dCBvZiByYW5nZSBvciBgc3RhcnRgIGlzIHBhc3QgdGhlIGVuZC4KCiMgRXJyb3JzCgoqIGBMaW1pdFRvb0hpZ2hgIC0gYGxpbWl0YCBhYm92ZSBgTUFYX1BBR0VgAAAAAAAACWdldF9pdGVtcwAAAAAAAAMAAAAAAAAAC3Byb3BlcnR5X2lkAAAAAAQAAAAAAAAABXN0YXJ0AAAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+kAAAPqAAAH0AAAAARJdGVtAAAAAw==", "AAAAAAAAAk5HZW5lcmF0ZSBzZWVkIGZvciBhIHRva2VuIHVwb24gbWludCAoaG9vayBjYWxsZWQgYnkgVG9rZW4gY29udHJhY3QpCgpXcml0ZXMgdGhlIHRva2VuJ3Mgc2VsZWN0aW9ucyAoYW4gZW1wdHkgcmVjb3JkIHdoZW4gbm8gcHJvcGVydGllcwpleGlzdCB5ZXQpIGFuZCBlbWl0cyBgU2VlZEdlbmVyYXRlZGAgd2hlbiBpdCBzZWVkcy4KCiMgQXJndW1lbnRzCgoqIGB0b2tlbl9pZGAgLSBUaGUgdG9rZW4gSUQgYmVpbmcgbWludGVkCgojIFJldHVybnMKClJldHVybnMgYHRydWVgIGlmIHNlZWQgd2FzIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHksIGBmYWxzZWAgaWYgbm8gcHJvcGVydGllcyBleGlzdAoKIyBBdXRob3JpemF0aW9uCgpPbmx5IHRoZSBUb2tlbiB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24gKGl0cyBhdXRoIGlzIHJlcXVpcmVkKS4KCiMgRXJyb3JzCgoqIGBOb3RJbml0aWFsaXplZGAgLSBzZXR0aW5ncyBtaXNzaW5nCiogYFN0b3JhZ2VWZXJzaW9uTWlzbWF0Y2hgIC0gYSBtaWdyYXRpb24gaXMgZHVlOyB0aGUgVG9rZW4gaWdub3JlcyB0aGUKZmFpbHVyZSwgc28gdGhlIHRva2VuIHN0YXlzIHVuc2VlZGVkIHVudGlsIGByZWdlbmVyYXRlYAAAAAAACW9uX21pbnRlZAAAAAAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAPpAAAAAQAAAAM=", "AAAAAAAAA2NTRVAtNTAgdG9rZW4gbWV0YWRhdGEsIGJ1aWx0IG9uLWNoYWluOiBhIGBkYXRhOmFwcGxpY2F0aW9uL2pzb247YmFzZTY0YApVUkkgb2YgYHsibmFtZSIsICJpbWFnZSIsICJhdHRyaWJ1dGVzIn1gLCB3aGVyZSBgbmFtZWAgaXMKYDx0b2tlbl9uYW1lPiAjPGlkPmAuIFRoZSB0b2tlbidzIG93biBgdG9rZW5fdXJpYCBjYWxscyB0aGlzIHdpdGggaXRzCmNvbGxlY3Rpb24gbmFtZSAoU29yb2JhbiBmb3JiaWRzIGNhbGxpbmcgYmFjayBpbnRvIHRoZSB0b2tlbikuIGBpbWFnZWAgaXMKYDxyZW5kZXJlcl9iYXNlPj9jb250cmFjdD08dG9rZW4+JnRva2VuPTxpZD5gOyBhIGNvbXBvc2l0b3IgZGVyaXZlcyB0aGUKbGF5ZXJzIGZyb20gYGdldF9hdHRyaWJ1dGVzYCwgYHByb3BlcnR5X2hlYWRlcnNgLCBgZ2V0X2l0ZW1zYCBhbmQKYGdldF9pcGZzX2dyb3VwYC4gVHJhaXRzIHdob3NlIHByb3BlcnR5IG9yIGl0ZW0gbm8gbG9uZ2VyIGV4aXN0cyAoYWZ0ZXIKYSByZXNldCkgYXJlIGxlZnQgb3V0LgoKQW55b25lIG1heSBjYWxsIGl0OyBpdCBvbmx5IHJlYWRzLgoKIyBFcnJvcnMKCiogYE5vdFNlZWRlZGAgLSB0aGUgdG9rZW4gaGFzIG5vIGF0dHJpYnV0ZXMgeWV0IChtaW50ZWQgYmVmb3JlCmFydHdvcmssIG9yIG5vdCBtaW50ZWQ6IGV4aXN0ZW5jZSBpcyBub3QgY2hlY2tlZCBoZXJlKQoqIGBTdHJpbmdUb29Mb25nYCAvIGBJbnZhbGlkTmFtZWAgLSBgdG9rZW5fbmFtZWAgaXMgbG9uZ2VyIHRoYW4KYGNvbW1vbjo6TUFYX1NUUklOR19MRU5HVEhgIG9yIGNvbnRhaW5zIGAiYCwgYFxgIG9yIGEgY29udHJvbCBjaGFyYWN0ZXIKKiBgVG9rZW5VcmlUb29Mb25nYCAtIHRoZSBkb2N1bWVudCB3b3VsZCBub3QgZml0IGl0cyBidWZmZXIAAAAACXRva2VuX3VyaQAAAAAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAKdG9rZW5fbmFtZQAAAAAAEAAAAAEAAAPpAAAAEAAAAAM=", "AAAAAAAAAKxUaGUgV0FTTSBoYXNoIHRoaXMgY29udHJhY3QgcmVjb3JkZWQgYXQgY29uc3RydWN0aW9uIG9yIGl0cyBsYXN0CmB1cGdyYWRlYC4gSXQgaXMgdGhlIGNvbnRyYWN0J3Mgb3duIHJlY29yZDsgdGhlIGhvc3QncyB2aWV3IG9mIHRoZQpydW5uaW5nIGNvZGUgaXMgYEFkZHJlc3M6OmV4ZWN1dGFibGUoKWAuAAAACXdhc21faGFzaAAAAAAAAAAAAAABAAAD7gAAACA=", "AAAAAAAAAWFTZWVkIGEgdG9rZW4gdGhhdCB3YXMgbWludGVkIGJlZm9yZSBhcnR3b3JrIGV4aXN0ZWQgKG9yIHdob3NlCmBvbl9taW50ZWRgIGhvb2sgZmFpbGVkKS4gQWRtaW4gb25seS4gQSB0b2tlbiB0aGF0IGFscmVhZHkgaGFzCnNlbGVjdGlvbnMgaXMgbmV2ZXIgcmUtc2VlZGVkLCBzbyB0aGUgYWRtaW4gY2Fubm90IHJlLXJvbGwgdHJhaXRzLgoKIyBFcnJvcnMKCiogYFRva2VuTm90TWludGVkYCAtIHRoZSB0b2tlbiBkb2VzIG5vdCBleGlzdAoqIGBBbHJlYWR5U2VlZGVkYCAtIHRoZSB0b2tlbiBhbHJlYWR5IGhhcyBhdHRyaWJ1dGVzCiogYE5vUHJvcGVydGllc2AgLSBubyBwcm9wZXJ0aWVzIGFyZSBjb25maWd1cmVkIHlldAAAAAAAAApyZWdlbmVyYXRlAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAADNJdGVtIGNvdW50IG9mIGEgcHJvcGVydHksIDAgd2hlbiBpdCBkb2VzIG5vdCBleGlzdC4AAAAAC2l0ZW1zX2NvdW50AAAAAAEAAAAAAAAAC3Byb3BlcnR5X2lkAAAAAAQAAAABAAAABA==", "AAAAAAAAAENOdW1iZXIgb2YgcHJvZmlsZSB1cGRhdGVzIHNpbmNlIGNyZWF0aW9uICgwID0gdGhlIGluaXRpYWwgcHJvZmlsZSkuAAAAAAtwcm9maWxlX3NlcQAAAAAAAAAAAQAAA+kAAAAEAAAAAw==", "AAAAAAAAAIVBIHByb3BlcnR5IHdpdGggYWxsIG9mIGl0cyBpdGVtcywgb3IgYE5vbmVgIHdoZW4gaXQgZG9lcyBub3QgZXhpc3QuClJlYWRzIGV2ZXJ5IGl0ZW0gcGFnZSBvZiB0aGUgcHJvcGVydHkgKGF0IG1vc3QgYE1BWF9JVEVNX1BBR0VTYCkuAAAAAAAADGdldF9wcm9wZXJ0eQAAAAEAAAAAAAAAC3Byb3BlcnR5X2lkAAAAAAQAAAABAAAD6AAAB9AAAAAIUHJvcGVydHk=", "AAAAAAAAADtUaGUgdG9rZW4gYW5kIHJlbmRlcmVyIGJhc2UuIGBOb3RJbml0aWFsaXplZGAgaWYgbmV2ZXIgc2V0LgAAAAAMZ2V0X3NldHRpbmdzAAAAAAAAAAEAAAPpAAAH0AAAAAhTZXR0aW5ncwAAAAM=", "AAAAAAAAAD9TSEEtMjU2IG9mIHRoZSBsYXRlc3QgcHJvZmlsZSBieXRlcywgdG8gdmVyaWZ5IGFuIGluZGV4ZWQgY29weS4AAAAADHByb2ZpbGVfaGFzaAAAAAAAAAABAAAD6QAAA+4AAAAgAAAAAw==", "AAAAAAAABABJbml0aWFsaXNlIHRoZSBtZXRhZGF0YSBjb250cmFjdC4gUnVucyBvbmNlLCB3aGVuIHRoZSBNYW5hZ2VyIGRlcGxveXMKaXQgaW4gYGNyZWF0ZV9kYW9gOyBpdCBuZWVkcyBubyBhdXRob3JpemF0aW9uLgoKIyBBcmd1bWVudHMKCiogYHRva2VuYCAtIFRoZSBhc3NvY2lhdGVkIE5GVCB0b2tlbiBjb250cmFjdDsgdGhlIG9ubHkgY2FsbGVyIG9mIHRoZQptaW50IGhvb2tzCiogYHByb2ZpbGVgIC0gREFPIHByb2ZpbGUgSlNPTiAoZGVzY3JpcHRpb24sIGxpbmtzLCBpbWFnZTsgMSB0bwpgY29tbW9uOjpNQVhfUFJPRklMRV9MRU5HVEhgIGJ5dGVzKS4gRW1pdHRlZCBpbiBgUHJvZmlsZVVwZGF0ZWRgCihzZXEgMCk7IG9ubHkgaXRzIGhhc2ggaXMgc3RvcmVkLgoqIGByZW5kZXJlcl9iYXNlYCAtIEJhc2UgVVJMIG9mIHRoZSBpbWFnZSBjb21wb3NpdG9yIHVzZWQgYnkgYHRva2VuX3VyaWAKKiBgbWFuYWdlcmAgLSBUaGUgTWFuYWdlcjogdGhlIG9ubHkgY2FsbGVyIG9mIGBsYXVuY2hgIGFuZCBgaGFuZG9mZmAsCmFuZCB0aGUgcmVnaXN0cnkgYHVwZ3JhZGVgIGFuZCBgdmVyc2lvbmAgcmVhZAoqIGBjdXJyZW50X2hhc2hgIC0gVGhlIFdBU00gaGFzaCB0aGlzIGNvbnRyYWN0IHdhcyBkZXBsb3llZCBmcm9tCiogYGFkbWluYCAtIHNldHVwLXBoYXNlIGFkbWluICh0aGUgbGF1bmNoIGFkbWluKTsgYmVjb21lcyB0aGUgVHJlYXN1cnkgYXQgbGF1bmNoCiogYHRyZWFzdXJ5YCAtIERBTyB0cmVhc3VyeTsgYGxhdW5jaGAgbXVzdCBiZSBjYWxsZWQgd2l0aCBleGFjdGx5IHRoaXMgYWRkcmVzcwoqIGBwcm9wZXJ0eV9uYW1lc2AsIGBpdGVtc2AsIGBpcGZzX2dyb3VwYCAtIEluaXRpYWwgYXJ0d29yaywgYWRkZWQgYXMgYnkKYGFkZF9wcm9wZXJ0aWVzYDsgYm90aCBsaXN0cyBlbXB0eSBtZWFucyBubyBhcnR3b3JrIHlldAoKIyBQYW5pY3MKClBhbmljcyB3aXRoIHRoZSB1bmRlcmx5aW5nIGBFcnJvcmAgd2hlbiB0aGUgcHJvZmlsZSwgdGhlIHJlbmRlcmVyIGJhc2UKb3IgdGhlIGluaXRpYWwgcHJvcGVydGllAAAADV9fY29uc3RydWN0b3IAAAAAAAAKAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAB3Byb2ZpbGUAAAAAEAAAAAAAAAANcmVuZGVyZXJfYmFzZQAAAAAAABAAAAAAAAAAB21hbmFnZXIAAAAAEwAAAAAAAAAMY3VycmVudF9oYXNoAAAD7gAAACAAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAA5wcm9wZXJ0eV9uYW1lcwAAAAAD6gAAABAAAAAAAAAABWl0ZW1zAAAAAAAD6gAAB9AAAAAJSXRlbVBhcmFtAAAAAAAAAAAAAAppcGZzX2dyb3VwAAAAAAfQAAAACUlwZnNHcm91cAAAAAAAAAA=", "AAAAAAAAAEtHZXQgSVBGUyBncm91cHMgdXNlZCBieSBhcnR3b3JrIGl0ZW1zLiBPKCNncm91cHMpOiBwcmVmZXIgYGdldF9pcGZzX2dyb3VwYC4AAAAADWdldF9pcGZzX2RhdGEAAAAAAAAAAAAAAQAAA+oAAAfQAAAACUlwZnNHcm91cAAAAA==", "AAAAAAAAAD9CYXNlIFVSTCBvZiB0aGUgaW1hZ2UgY29tcG9zaXRvciBgdG9rZW5fdXJpYCBwb2ludHMgYGltYWdlYCBhdC4AAAAADXJlbmRlcmVyX2Jhc2UAAAAAAAAAAAAAAQAAA+kAAAAQAAAAAw==", "AAAAAAAABABBZGQgbmV3IHByb3BlcnRpZXMgYW5kIGl0ZW1zLiBJdGVtcyBhcmUgYXBwZW5kZWQgdG8gZXhpc3RpbmcKcHJvcGVydGllcyBvciB0byB0aGUgbmV3IG9uZXMgaW4gYG5hbWVzYDsgYWxsIG9mIHRoZW0gc2hhcmUKYGlwZnNfZ3JvdXBgLCB3aGljaCBpcyByZXVzZWQgaWYgaXQgZXF1YWxzIHRoZSBsYXN0IGdyb3VwIHN0b3JlZC4KCiMgQXJndW1lbnRzCgoqIGBuYW1lc2AgLSBQcm9wZXJ0eSBuYW1lcyB0byBhZGQKKiBgaXRlbXNgIC0gSXRlbXMgdG8gYWRkIHRvIHByb3BlcnRpZXMKKiBgaXBmc19ncm91cGAgLSBJUEZTIGJhc2UgVVJJIGFuZCBleHRlbnNpb24gZm9yIHRoZXNlIGl0ZW1zCgojIEF1dGhvcml6YXRpb24KCkFkbWluIG9ubHkgKHRoZSBsYXVuY2ggYWRtaW4gaW4gc2V0dXAsIHRoZSBUcmVhc3VyeSBvbmNlIGxpdmUpLgoKIyBFcnJvcnMKCiogYE9uZVByb3BlcnR5QW5kSXRlbVJlcXVpcmVkYCAtIEZpcnN0IGFkZGl0aW9uIG11c3QgaGF2ZSBhdCBsZWFzdCAxIHByb3BlcnR5IGFuZCAxIGl0ZW0KKiBgUHJvcGVydHlIYXNOb0l0ZW1zYCAtIFRoZSBjYWxsIGFkZHMgbm8gaXRlbXMsIG9yIGEgbmV3IHByb3BlcnR5IGdldHMgbm9uZQoqIGBUb29NYW55UHJvcGVydGllc2AgLSBFeGNlZWRzIHRoZSBgTUFYX1BST1BFUlRJRVNgICgxNikgbGltaXQKKiBgSW52YWxpZFByb3BlcnR5U2VsZWN0ZWRgIC0gSXRlbSByZWZlcmVuY2VzIG5vbi1leGlzdGVudCBwcm9wZXJ0eQoqIGBUb29NYW55SXRlbXNgIC0gbW9yZSB0aGFuIGBNQVhfSVRFTVNfUEVSX0NBTExgICgzMCkgaXRlbXMgaW4gb25lIGNhbGw7CmJhdGNoIGxhcmdlciB1cGxvYWRzIGFjcm9zcyBzZXZlcmFsIGNhbGxzIChjYWxscyB3aXRoIHRoZSBzYW1lCmBpcGZzX2dyb3VwYCBzaGFyZSBvbmUgZ3JvdXApCiogYFByb3BlcnR5RnVsbGAgLSBhIHByb3BlcnR5IHdvdWxkIGV4Y2VlZCBgTUFYX0lURU1TX1BFUl9QUk9QRVJUWWAKKiBgVG9vTWFueUlwZnNHcm91cHNgIC0gYSBuZXcgZ3JvdXAgYmV5b25kIGBNQVhfSVBGU19HUk9VUFNgCiogAAAADmFkZF9wcm9wZXJ0aWVzAAAAAAADAAAAAAAAAAVuYW1lcwAAAAAAA+oAAAAQAAAAAAAAAAVpdGVtcwAAAAAAA+oAAAfQAAAACUl0ZW1QYXJhbQAAAAAAAAAAAAAKaXBmc19ncm91cAAAAAAH0AAAAAlJcGZzR3JvdXAAAAAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAMNUaGUgZ2VuZXJhdGVkIGl0ZW0gc2VsZWN0aW9ucyBmb3IgYSB0b2tlbiwgYXMKYFtudW1fcHJvcGVydGllcywgaXRlbV9pbmRleC4uXWAuCgojIEVycm9ycwoKKiBgVG9rZW5Ob3RNaW50ZWRgIC0gdGhlIHRva2VuIGhhcyBubyBzZWxlY3Rpb25zOiBpdCBkb2VzIG5vdCBleGlzdCwKb3IgaXQgd2FzIG1pbnRlZCBiZWZvcmUgYW55IGFydHdvcmsAAAAADmdldF9hdHRyaWJ1dGVzAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAD6QAAA+oAAAAEAAAAAw==", "AAAAAAAAAEZBIHNpbmdsZSBJUEZTIGdyb3VwIGJ5IGFic29sdXRlIGluZGV4ICh0aGUgYHJlZmVyZW5jZV9zbG90YCBvZiBpdGVtcykuAAAAAAAOZ2V0X2lwZnNfZ3JvdXAAAAAAAAEAAAAAAAAABWluZGV4AAAAAAAABAAAAAEAAAPoAAAH0AAAAAlJcGZzR3JvdXAAAAA=", "AAAAAAAAAH5HZXQgYWxsIHByb3BlcnRpZXMuIE8odG90YWwgaXRlbXMpOiBtYXkgZXhjZWVkIHJlYWQgbGltaXRzIG9uIGxhcmdlCmNvbGxlY3Rpb25zOyBwcmVmZXIgYGdldF9wcm9wZXJ0eWAvYGdldF9pdGVtc2AgcGFnaW5hdGlvbi4AAAAAAA5nZXRfcHJvcGVydGllcwAAAAAAAAAAAAEAAAPqAAAH0AAAAAhQcm9wZXJ0eQ==", "AAAAAAAAAeZSZXBsYWNlIHRoZSBEQU8gcHJvZmlsZSAoYWRtaW4gb25seSkuIGBleHBlY3RlZF9zZXFgIG11c3QgZXF1YWwgdGhlCmN1cnJlbnQgYHByb2ZpbGVfc2VxKClgLCBzbyBhbiB1cGRhdGUgd3JpdHRlbiBhZ2FpbnN0IGEgc3RhbGUgY29weSBvZgp0aGUgcHJvZmlsZSAoZm9yIGV4YW1wbGUgb25lIHByb3Bvc2VkIGJlZm9yZSBhbm90aGVyIGVkaXQgZXhlY3V0ZWQpCmZhaWxzIHdpdGggYFByb2ZpbGVTZXFNaXNtYXRjaGAgaW5zdGVhZCBvZiBvdmVyd3JpdGluZyBuZXdlciBmaWVsZHMuCkVtaXRzIGBQcm9maWxlVXBkYXRlZGAgd2l0aCB0aGUgbmV4dCBzZXE7IG9ubHkgdGhlIGhhc2ggaXMgc3RvcmVkLgoKIyBFcnJvcnMKCiogYFByb2ZpbGVTZXFNaXNtYXRjaGAgLSBgZXhwZWN0ZWRfc2VxYCBpcyBub3QgdGhlIGN1cnJlbnQgc2VxCiogYEludmFsaWRQcm9maWxlYCAtIGVtcHR5IG9yIGxvbmdlciB0aGFuIGBjb21tb246Ok1BWF9QUk9GSUxFX0xFTkdUSGAAAAAAAA51cGRhdGVfcHJvZmlsZQAAAAAAAgAAAAAAAAAMZXhwZWN0ZWRfc2VxAAAABAAAAAAAAAAHcHJvZmlsZQAAAAAQAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAADlOdW1iZXIgb2YgSVBGUyBncm91cHMgaW4gdXNlIChhdCBtb3N0IGBNQVhfSVBGU19HUk9VUFNgKS4AAAAAAAAPaXBmc19kYXRhX2NvdW50AAAAAAAAAAABAAAABA==", "AAAAAAAAAalCYXRjaCB2YXJpYW50IG9mIGBvbl9taW50ZWRgIGZvciB0aGUgY29udGlndW91cyByYW5nZQpgW2ZpcnN0X3Rva2VuX2lkLCBmaXJzdF90b2tlbl9pZCArIGNvdW50KWAuCgpBdXRob3JpemVzIHRoZSB0b2tlbiBhbmQgbG9hZHMgdGhlIHByb3BlcnRpZXMgb25jZSBmb3IgdGhlIHdob2xlIHJhbmdlCmluc3RlYWQgb2Ygb25jZSBwZXIgdG9rZW4uIEVtaXRzIGEgc2luZ2xlIGBTZWVkc0dlbmVyYXRlZGAgZXZlbnQgZm9yCnRoZSB3aG9sZSByYW5nZSByYXRoZXIgdGhhbiBvbmUgYFNlZWRHZW5lcmF0ZWRgIHBlciB0b2tlbi4KCiMgQXV0aG9yaXphdGlvbgoKT25seSB0aGUgVG9rZW4gd2lyZWQgYXQgY29uc3RydWN0aW9uIChpdHMgYXV0aCBpcyByZXF1aXJlZCkuCgojIEVycm9ycwoKKiBgTm90SW5pdGlhbGl6ZWRgIC0gc2V0dGluZ3MgbWlzc2luZwAAAAAAAA9vbl9taW50ZWRfYmF0Y2gAAAAAAgAAAAAAAAAOZmlyc3RfdG9rZW5faWQAAAAAAAQAAAAAAAAABWNvdW50AAAAAAAABAAAAAEAAAPpAAAAAQAAAAM=", "AAAAAAAAALJTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4gV2hpbGUgaXQKZGlmZmVycyBmcm9tIHRoZSBjb2RlJ3MgYFNUT1JBR0VfVkVSU0lPTmAsIGV2ZXJ5IGVudHJ5IHBvaW50IHRoYXQKY2hhbmdlcyBzdGF0ZSBmYWlscyBgU3RvcmFnZVZlcnNpb25NaXNtYXRjaGAuAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAEROdW1iZXIgb2YgcHJvcGVydGllcyAoYXQgbW9zdCBgTUFYX1BST1BFUlRJRVNgKS4gQW55b25lIG1heSByZWFkIGl0LgAAABBwcm9wZXJ0aWVzX2NvdW50AAAAAAAAAAEAAAAE", "AAAAAAAAAIVFdmVyeSBwcm9wZXJ0eSdzIG5hbWUgYW5kIGl0ZW0gY291bnQgKGF0IG1vc3QgMTYpLCB3aXRob3V0IGl0ZW1zOgplbm91Z2ggZm9yIGEgY2xpZW50IHRvIHJlc3VtZSBhcnR3b3JrIHNldHVwIGZyb20gY2hhaW4gc3RhdGUgYWxvbmUuAAAAAAAAEHByb3BlcnR5X2hlYWRlcnMAAAAAAAAAAQAAA+oAAAfQAAAADlByb3BlcnR5SGVhZGVyAAA=", "AAAAAAAAAMdVcGRhdGUgcmVuZGVyZXIgYmFzZSBVUkwgKGFkbWluIG9ubHkpLiBFbWl0cyBgUmVuZGVyZXJCYXNlVXBkYXRlZGAuCgojIEVycm9ycwoKKiBgU3RyaW5nVG9vTG9uZ2AgLyBgSW52YWxpZE5hbWVgIC0gbG9uZ2VyIHRoYW4KYGNvbW1vbjo6TUFYX1NUUklOR19MRU5HVEhgLCBvciBjb250YWlucyBgImAsIGBcYCBvciBhIGNvbnRyb2wgY2hhcmFjdGVyAAAAABR1cGRhdGVfcmVuZGVyZXJfYmFzZQAAAAEAAAAAAAAAEW5ld19yZW5kZXJlcl9iYXNlAAAAAAAAEAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAYtEZWxldGUgYWxsIHByb3BlcnRpZXMgYW5kIHJlY3JlYXRlIHdpdGggbmV3IG9uZXMuIFRva2VucyBrZWVwIHRoZWlyCnN0b3JlZCBzZWxlY3Rpb25zOyBgdG9rZW5fdXJpYCBsZWF2ZXMgb3V0IGFueSB0cmFpdCB3aG9zZSBwcm9wZXJ0eQpvciBpdGVtIG5vIGxvbmdlciBleGlzdHMsIGFuZCBhbiBpbmRleCB0aGF0IHN0aWxsIGV4aXN0cyBub3cgbmFtZXMKdGhlIG5ldyBpdGVtIGF0IHRoYXQgcG9zaXRpb24uCgpXQVJOSU5HOiBUaGlzIGNhbiBicmVhayBleGlzdGluZyB0b2tlbiBtZXRhZGF0YSBpZiBwcm9wZXJ0aWVzIGNoYW5nZSBzdHJ1Y3R1cmUKCiMgQXV0aG9yaXphdGlvbgoKQWRtaW4gb25seS4KCiMgRXJyb3JzCgpBcyBgYWRkX3Byb3BlcnRpZXNgLCBmb3IgdGhlIG5ldyBhcnR3b3JrLgAAAAAeZGVsZXRlX2FuZF9yZWNyZWF0ZV9wcm9wZXJ0aWVzAAAAAAADAAAAAAAAAAVuYW1lcwAAAAAAA+oAAAAQAAAAAAAAAAVpdGVtcwAAAAAAA+oAAAfQAAAACUl0ZW1QYXJhbQAAAAAAAAAAAAAKaXBmc19ncm91cAAAAAAH0AAAAAlJcGZzR3JvdXAAAAAAAAABAAAD6QAAAAIAAAAD", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAMFRoZSBhZG1pbiBiZWZvcmUgdGhlIGhhbmRvZmYgKHRoZSBsYXVuY2ggYWRtaW4pLgAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAACJUaGUgYWRtaW4gYWZ0ZXIgaXQgKHRoZSBUcmVhc3VyeSkuAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAABQAAAHZFbWl0dGVkIGJ5IFtgbWlncmF0ZWBdIHdoZW4gdGhlIHN0b3JlZCBsYXlvdXQgbW92ZXMgZm9yd2FyZC4gVGhlIGVtaXR0aW5nCmNvbnRyYWN0IGFkZHJlc3MgaXMgdGhlIGV2ZW50J3MgY29udHJhY3QgaWQuAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAoVGhlIGxheW91dCB2ZXJzaW9uIGJlZm9yZSB0aGUgbWlncmF0aW9uLgAAABRmcm9tX3N0b3JhZ2VfdmVyc2lvbgAAAAQAAAAAAAAAO1RoZSBsYXlvdXQgdmVyc2lvbiBhZnRlciBpdCAodGhlIGNvZGUncyBgU1RPUkFHRV9WRVJTSU9OYCkuAAAAABJ0b19zdG9yYWdlX3ZlcnNpb24AAAAAAAQAAAAAAAAAAg==", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAACFUaGUgY29kZSBoYXNoIGJlZm9yZSB0aGUgdXBncmFkZS4AAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAF1RoZSBjb2RlIGhhc2ggYWZ0ZXIgaXQuAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAC1UaGUgcmVnaXN0cnkncyByZWxlYXNlIHZlcnNpb24gZm9yIGB0b19oYXNoYC4AAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ token, profile, renderer_base, manager, current_hash, admin, treasury, property_names, items, ipfs_group }: { token: string | Address; profile: string; renderer_base: string; manager: string | Address; current_hash: Uint8Array; admin: string | Address; treasury: string | Address; property_names: Array<string>; items: Array<ItemParam>; ipfs_group: IpfsGroup }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ token, profile, renderer_base, manager, current_hash, admin, treasury, property_names, items, ipfs_group }, options);
  }
  public readonly fromJson = {
    admin : this.txFromJson<string>,  token : this.txFromJson<Result<string, Error>>,  launch : this.txFromJson<void>,  handoff : this.txFromJson<void>,  migrate : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  get_items : this.txFromJson<Result<Array<Item>, Error>>,  on_minted : this.txFromJson<Result<boolean, Error>>,  token_uri : this.txFromJson<Result<string, Error>>,  wasm_hash : this.txFromJson<Uint8Array>,  regenerate : this.txFromJson<Result<null, Error>>,  items_count : this.txFromJson<number>,  profile_seq : this.txFromJson<Result<number, Error>>,  get_property : this.txFromJson<Property | null>,  get_settings : this.txFromJson<Result<Settings, Error>>,  profile_hash : this.txFromJson<Result<Uint8Array, Error>>,  get_ipfs_data : this.txFromJson<Array<IpfsGroup>>,  renderer_base : this.txFromJson<Result<string, Error>>,  add_properties : this.txFromJson<Result<null, Error>>,  get_attributes : this.txFromJson<Result<Array<number>, Error>>,  get_ipfs_group : this.txFromJson<IpfsGroup | null>,  get_properties : this.txFromJson<Array<Property>>,  update_profile : this.txFromJson<Result<null, Error>>,  ipfs_data_count : this.txFromJson<number>,  on_minted_batch : this.txFromJson<Result<boolean, Error>>,  storage_version : this.txFromJson<number>,  properties_count : this.txFromJson<number>,  property_headers : this.txFromJson<Array<PropertyHeader>>,  update_renderer_base : this.txFromJson<Result<null, Error>>,  delete_and_recreate_properties : this.txFromJson<Result<null, Error>>
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
   * Build a topics filter row for the "PropertyAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  propertyAddedEventFilter(topicValues?: { property_id?: number }): string[] {
    return this.spec.eventTopicFilter("PropertyAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "SeedGenerated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  seedGeneratedEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("SeedGenerated", topicValues);
  }
  /**
   * Build a topics filter row for the "ProfileUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  profileUpdatedEventFilter(topicValues?: { seq?: number }): string[] {
    return this.spec.eventTopicFilter("ProfileUpdated", topicValues);
  }
  /**
   * Build a topics filter row for the "SeedsGenerated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  seedsGeneratedEventFilter(topicValues?: { first_token_id?: number }): string[] {
    return this.spec.eventTopicFilter("SeedsGenerated", topicValues);
  }
  /**
   * Build a topics filter row for the "PropertiesReset" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  propertiesResetEventFilter(): string[] {
    return this.spec.eventTopicFilter("PropertiesReset");
  }
  /**
   * Build a topics filter row for the "MetadataLaunched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  metadataLaunchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MetadataLaunched", topicValues);
  }
  /**
   * Build a topics filter row for the "MetadataInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  metadataInitializedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MetadataInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "RendererBaseUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  rendererBaseUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("RendererBaseUpdated");
  }
  /**
   * Build a topics filter row for the "AdminChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminChangedEventFilter(topicValues?: { old_admin?: string | Address; new_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "Migrated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  migratedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Migrated");
  }
  /**
   * Build a topics filter row for the "Upgraded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  upgradedEventFilter(topicValues?: { from_hash?: Uint8Array; to_hash?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("Upgraded", topicValues);
  }
}