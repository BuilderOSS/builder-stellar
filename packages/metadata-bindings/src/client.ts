import {Item, Property, Settings, ItemParam, IpfsGroup, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Module admin: the launch admin during setup, the Treasury once live.
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Get token address
   */
  token(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * Hands the admin (artwork, settings and upgrades) to `treasury`, marks
   * the module live, and emits `MetadataLaunched`. A second call panics
   * with `AlreadyLive`.
   */
  launch({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Advance the storage layout after an upgrade (admin only).
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Paginated items of a property (`limit` <= `MAX_PAGE`). Returns an empty
   * vec when `property_id` is out of range or `start` is past the end.
   */
  get_items({ property_id, start, limit }: { property_id: number; start: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<Array<Item>, Error>>>;
  /**
   * Generate seed for a token upon mint (hook called by Token contract)
   *
   * # Arguments
   *
   * * `token_id` - The token ID being minted
   *
   * # Returns
   *
   * Returns `true` if seed was generated successfully, `false` if no properties exist
   *
   * # Errors
   *
   * Only the token contract may call this (its auth is required).
   */
  on_minted({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<boolean, Error>>>;
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Re-seed a token that was minted before artwork existed (or whose
   * `on_minted` hook failed). Admin only.
   *
   * # Errors
   *
   * * `TokenNotMinted` - the token does not exist
   * * `AlreadySeeded` - the token already has attributes
   * * `NoProperties` - no properties are configured yet
   */
  regenerate({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Get description
   */
  description(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * Get items count for a property
   */
  items_count({ property_id }: { property_id: number }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Get project URI
   */
  project_uri(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * Get property by ID
   */
  get_property({ property_id }: { property_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Property | null>>;
  /**
   * Get settings
   */
  get_settings(options?: MethodOptions): Promise<AssembledTransaction<Result<Settings, Error>>>;
  sync_version(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Get IPFS groups used by artwork items. O(#groups): prefer `get_ipfs_group`.
   */
  get_ipfs_data(options?: MethodOptions): Promise<AssembledTransaction<Array<IpfsGroup>>>;
  /**
   * Get renderer base URL
   */
  renderer_base(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * Add new properties and items
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
   * * `PropertyHasNoItems` - Property created without items
   * * `TooManyProperties` - Exceeds 16 property limit
   * * `InvalidPropertySelected` - Item references non-existent property
   * * `TooManyItems` - more than `MAX_ITEMS_PER_CALL` (30) items in one call;
   * batch larger uploads across several calls (each adds its own IPFS group)
   */
  add_properties({ names, items, ipfs_group }: { names: Array<string>; items: Array<ItemParam>; ipfs_group: IpfsGroup }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Get contract image
   */
  contract_image(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * Get the generated item selections for a minted token.
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
   * Get IPFS data count
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
   * # Errors
   *
   * Only the token contract may call this (its auth is required).
   */
  on_minted_batch({ first_token_id, count }: { first_token_id: number; count: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<boolean, Error>>>;
  /**
   * Storage-layout version of the data held by this contract.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Permissionless TTL renewal for artwork entries.
   *
   * The flat space is every item `(property, item)` in order, followed by
   * every IPFS group. Extends entries in `[start, start + limit)` (plus the
   * property headers walked and the instance) and returns the next start,
   * or `total` when done. Callers loop until the returned value equals the
   * total. `limit` must be <= `MAX_PAGE` (`LimitTooHigh`).
   *
   * Note: the network clamps `extend_to` to its max entry TTL (~180 days),
   * so the effective lifetime after a write or bump is ~180 days, not the
   * nominal 365; call this periodically to renew.
   */
  bump_artwork_ttl({ start, limit }: { start: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<number, Error>>>;
  /**
   * Get properties count
   */
  properties_count(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Update description
   */
  update_description({ new_description }: { new_description: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Update project URI
   */
  update_project_uri({ new_project_uri }: { new_project_uri: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Update renderer base URL
   */
  update_renderer_base({ new_renderer_base }: { new_renderer_base: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Update contract image
   */
  update_contract_image({ new_contract_image }: { new_contract_image: string }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Delete all properties and recreate with new ones
   *
   * WARNING: This can break existing token metadata if properties change structure
   *
   * # Authorization
   *
   * Admin only.
   */
  delete_and_recreate_properties({ names, items, ipfs_group }: { names: Array<string>; items: Array<ItemParam>; ipfs_group: IpfsGroup }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAADlNZXRhZGF0YSBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6TUVUQURBVEFgKS4AAAAAAAAAAAAABUVycm9yAAAAAAAADAAAACtTZXR0aW5ncyBtaXNzaW5nIChjb250cmFjdCBub3QgaW5pdGlhbGl6ZWQpAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAchQAAAEFgbGF1bmNoYCB0cmVhc3VyeSBkaWZmZXJzIGZyb20gdGhlIHRyZWFzdXJ5IHdpcmVkIGF0IGNvbnN0cnVjdGlvbgAAAAAAABBUcmVhc3VyeU1pc21hdGNoAAAchgAAAEtUaGUgZmlyc3QgYGFkZF9wcm9wZXJ0aWVzYCBjYWxsIG11c3QgYWRkIGF0IGxlYXN0IG9uZSBwcm9wZXJ0eSBhbmQgb25lIGl0ZW0AAAAAGk9uZVByb3BlcnR5QW5kSXRlbVJlcXVpcmVkAAAAAByHAAAANUEgY2FsbCBhZGRlZCBubyBpdGVtcywgb3IgYSBuZXcgcHJvcGVydHkgZ290IG5vIGl0ZW1zAAAAAAAAElByb3BlcnR5SGFzTm9JdGVtcwAAAAAciAAAABdNb3JlIHRoYW4gMTYgcHJvcGVydGllcwAAAAARVG9vTWFueVByb3BlcnRpZXMAAAAAAByJAAAAMUFuIGl0ZW0gcmVmZXJlbmNlcyBhIHByb3BlcnR5IHRoYXQgZG9lcyBub3QgZXhpc3QAAAAAAAAXSW52YWxpZFByb3BlcnR5U2VsZWN0ZWQAAAAcigAAAC1gcmVnZW5lcmF0ZWAgY2FsbGVkIHdoaWxlIG5vIHByb3BlcnRpZXMgZXhpc3QAAAAAAAAMTm9Qcm9wZXJ0aWVzAAAciwAAAEFNb3JlIHRoYW4gYE1BWF9JVEVNU19QRVJfQ0FMTGAgaXRlbXMgaW4gb25lIGBhZGRfcHJvcGVydGllc2AgY2FsbAAAAAAAAAxUb29NYW55SXRlbXMAAByMAAAAKUEgcGFnaW5hdGVkL2J1bXAgYGxpbWl0YCBhYm92ZSBgTUFYX1BBR0VgAAAAAAAADExpbWl0VG9vSGlnaAAAHI0AAAAzVGhlIHRva2VuIGRvZXMgbm90IGV4aXN0IChvciBoYXMgbm8gYXR0cmlidXRlcyB5ZXQpAAAAAA5Ub2tlbk5vdE1pbnRlZAAAAAAcjgAAADtgcmVnZW5lcmF0ZWAgY2FsbGVkIGZvciBhIHRva2VuIHRoYXQgYWxyZWFkeSBoYXMgYXR0cmlidXRlcwAAAAANQWxyZWFkeVNlZWRlZAAAAAAAHI8AAAA8QSBzZXR0aW5ncyBzdHJpbmcgaXMgbG9uZ2VyIHRoYW4gYGNvbW1vbjo6TUFYX1NUUklOR19MRU5HVEhgAAAADVN0cmluZ1Rvb0xvbmcAAAAAAByQ", "AAAABQAAAAAAAAAAAAAADVByb3BlcnR5QWRkZWQAAAAAAAABAAAADnByb3BlcnR5X2FkZGVkAAAAAAACAAAAAAAAAAtwcm9wZXJ0eV9pZAAAAAAEAAAAAQAAAAAAAAAEbmFtZQAAABAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAADVNlZWRHZW5lcmF0ZWQAAAAAAAABAAAADnNlZWRfZ2VuZXJhdGVkAAAAAAADAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAAA5udW1fcHJvcGVydGllcwAAAAAABAAAAAAAAAAAAAAACnNlbGVjdGlvbnMAAAAAA+oAAAAEAAAAAAAAAAI=", "AAAABQAAAT1FbWl0dGVkIG9uY2UgYnkgYG9uX21pbnRlZF9iYXRjaGAgZm9yIHRoZSBjb250aWd1b3VzIHJhbmdlCmBbZmlyc3RfdG9rZW5faWQsIGZpcnN0X3Rva2VuX2lkICsgY291bnQpYCwgaW5zdGVhZCBvZiBvbmUKYFNlZWRHZW5lcmF0ZWRgIHBlciB0b2tlbiAoa2VlcHMgbGFyZ2UgYmF0Y2hlcyB1bmRlciB0aGUgcGVyLXRyYW5zYWN0aW9uCmV2ZW50IHNpemUgbGltaXQpLiBgc2VsZWN0aW9uc1tpXWAgYmVsb25ncyB0byB0b2tlbiBgZmlyc3RfdG9rZW5faWQgKyBpYAphbmQgaGFzIHRoZSBzYW1lIHNoYXBlIGFzIGBTZWVkR2VuZXJhdGVkLnNlbGVjdGlvbnNgLgAAAAAAAAAAAAAOU2VlZHNHZW5lcmF0ZWQAAAAAAAEAAAAPc2VlZHNfZ2VuZXJhdGVkAAAAAAQAAAAAAAAADmZpcnN0X3Rva2VuX2lkAAAAAAAEAAAAAQAAAAAAAAAFY291bnQAAAAAAAAEAAAAAAAAAAAAAAAObnVtX3Byb3BlcnRpZXMAAAAAAAQAAAAAAAAAAAAAAApzZWxlY3Rpb25zAAAAAAPqAAAD6gAAAAQAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD1Byb3BlcnRpZXNSZXNldAAAAAABAAAAEHByb3BlcnRpZXNfcmVzZXQAAAABAAAAM051bWJlciBvZiBwcm9wZXJ0aWVzIHRoYXQgZXhpc3RlZCBiZWZvcmUgdGhlIHJlc2V0LgAAAAASb2xkX251bV9wcm9wZXJ0aWVzAAAAAAAEAAAAAAAAAAI=", "AAAABQAAAEtFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgbWV0YWRhdGEgbW9kdWxlIChTZXR1cCAtPiBMaXZlKS4AAAAAAAAAABBNZXRhZGF0YUxhdW5jaGVkAAAAAQAAABFtZXRhZGF0YV9sYXVuY2hlZAAAAAAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAEVByb2plY3RVUklVcGRhdGVkAAAAAAAAAQAAABNwcm9qZWN0X3VyaV91cGRhdGVkAAAAAAIAAAAAAAAAB29sZF91cmkAAAAAEAAAAAAAAAAAAAAAB25ld191cmkAAAAAEAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEkRlc2NyaXB0aW9uVXBkYXRlZAAAAAAAAQAAABNkZXNjcmlwdGlvbl91cGRhdGVkAAAAAAIAAAAAAAAAD29sZF9kZXNjcmlwdGlvbgAAAAAQAAAAAAAAAAAAAAAPbmV3X2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAE01ldGFkYXRhSW5pdGlhbGl6ZWQAAAAAAQAAABRtZXRhZGF0YV9pbml0aWFsaXplZAAAAAcAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAAAAAADXJlbmRlcmVyX2Jhc2UAAAAAAAAQAAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAAAAAALcHJvamVjdF91cmkAAAAAEAAAAAAAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAAAAAAAA5jb250cmFjdF9pbWFnZQAAAAAAEAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAE1JlbmRlcmVyQmFzZVVwZGF0ZWQAAAAAAQAAABVyZW5kZXJlcl9iYXNlX3VwZGF0ZWQAAAAAAAACAAAAAAAAAAhvbGRfYmFzZQAAABAAAAAAAAAAAAAAAAhuZXdfYmFzZQAAABAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAFENvbnRyYWN0SW1hZ2VVcGRhdGVkAAAAAQAAABZjb250cmFjdF9pbWFnZV91cGRhdGVkAAAAAAACAAAAAAAAAAlvbGRfaW1hZ2UAAAAAAAAQAAAAAAAAAAAAAAAJbmV3X2ltYWdlAAAAAAAAEAAAAAAAAAAC", "AAAAAQAAAAAAAAAAAAAABEl0ZW0AAAACAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAOcmVmZXJlbmNlX3Nsb3QAAAAAAAQ=", "AAAAAQAAAAAAAAAAAAAACFByb3BlcnR5AAAAAgAAAAAAAAAFaXRlbXMAAAAAAAPqAAAH0AAAAARJdGVtAAAAAAAAAARuYW1lAAAAEA==", "AAAAAQAAAAAAAAAAAAAACFNldHRpbmdzAAAABQAAAAAAAAAOY29udHJhY3RfaW1hZ2UAAAAAABAAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAAC3Byb2plY3RfdXJpAAAAABAAAAAAAAAADXJlbmRlcmVyX2Jhc2UAAAAAAAAQAAAAAAAAAAV0b2tlbgAAAAAAABM=", "AAAAAQAAAAAAAAAAAAAACUlwZnNHcm91cAAAAAAAAAIAAAAAAAAACGJhc2VfdXJpAAAAEAAAAAAAAAAJZXh0ZW5zaW9uAAAAAAAAEA==", "AAAAAQAAAAAAAAAAAAAACUl0ZW1QYXJhbQAAAAAAAAMAAAAAAAAAD2lzX25ld19wcm9wZXJ0eQAAAAABAAAAAAAAAARuYW1lAAAAEAAAAAAAAAALcHJvcGVydHlfaWQAAAAABA==", "AAAAAAAAAERNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgb25jZSBsaXZlLgAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAABFHZXQgdG9rZW4gYWRkcmVzcwAAAAAAAAV0b2tlbgAAAAAAAAAAAAABAAAD6QAAABMAAAAD", "AAAAAAAAANVPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KCkhhbmRzIHRoZSBhZG1pbiAoYXJ0d29yaywgc2V0dGluZ3MgYW5kIHVwZ3JhZGVzKSB0byBgdHJlYXN1cnlgLCBtYXJrcwp0aGUgbW9kdWxlIGxpdmUsIGFuZCBlbWl0cyBgTWV0YWRhdGFMYXVuY2hlZGAuIEEgc2Vjb25kIGNhbGwgcGFuaWNzCndpdGggYEFscmVhZHlMaXZlYC4AAAAAAAAGbGF1bmNoAAAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAA", "AAAAAAAAADlBZHZhbmNlIHRoZSBzdG9yYWdlIGxheW91dCBhZnRlciBhbiB1cGdyYWRlIChhZG1pbiBvbmx5KS4AAAAAAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAAIpQYWdpbmF0ZWQgaXRlbXMgb2YgYSBwcm9wZXJ0eSAoYGxpbWl0YCA8PSBgTUFYX1BBR0VgKS4gUmV0dXJucyBhbiBlbXB0eQp2ZWMgd2hlbiBgcHJvcGVydHlfaWRgIGlzIG91dCBvZiByYW5nZSBvciBgc3RhcnRgIGlzIHBhc3QgdGhlIGVuZC4AAAAAAAlnZXRfaXRlbXMAAAAAAAADAAAAAAAAAAtwcm9wZXJ0eV9pZAAAAAAEAAAAAAAAAAVzdGFydAAAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPpAAAD6gAAB9AAAAAESXRlbQAAAAM=", "AAAAAAAAASFHZW5lcmF0ZSBzZWVkIGZvciBhIHRva2VuIHVwb24gbWludCAoaG9vayBjYWxsZWQgYnkgVG9rZW4gY29udHJhY3QpCgojIEFyZ3VtZW50cwoKKiBgdG9rZW5faWRgIC0gVGhlIHRva2VuIElEIGJlaW5nIG1pbnRlZAoKIyBSZXR1cm5zCgpSZXR1cm5zIGB0cnVlYCBpZiBzZWVkIHdhcyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5LCBgZmFsc2VgIGlmIG5vIHByb3BlcnRpZXMgZXhpc3QKCiMgRXJyb3JzCgpPbmx5IHRoZSB0b2tlbiBjb250cmFjdCBtYXkgY2FsbCB0aGlzIChpdHMgYXV0aCBpcyByZXF1aXJlZCkuAAAAAAAACW9uX21pbnRlZAAAAAAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAPpAAAAAQAAAAM=", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAQhSZS1zZWVkIGEgdG9rZW4gdGhhdCB3YXMgbWludGVkIGJlZm9yZSBhcnR3b3JrIGV4aXN0ZWQgKG9yIHdob3NlCmBvbl9taW50ZWRgIGhvb2sgZmFpbGVkKS4gQWRtaW4gb25seS4KCiMgRXJyb3JzCgoqIGBUb2tlbk5vdE1pbnRlZGAgLSB0aGUgdG9rZW4gZG9lcyBub3QgZXhpc3QKKiBgQWxyZWFkeVNlZWRlZGAgLSB0aGUgdG9rZW4gYWxyZWFkeSBoYXMgYXR0cmlidXRlcwoqIGBOb1Byb3BlcnRpZXNgIC0gbm8gcHJvcGVydGllcyBhcmUgY29uZmlndXJlZCB5ZXQAAAAKcmVnZW5lcmF0ZQAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAA9HZXQgZGVzY3JpcHRpb24AAAAAC2Rlc2NyaXB0aW9uAAAAAAAAAAABAAAD6QAAABAAAAAD", "AAAAAAAAAB5HZXQgaXRlbXMgY291bnQgZm9yIGEgcHJvcGVydHkAAAAAAAtpdGVtc19jb3VudAAAAAABAAAAAAAAAAtwcm9wZXJ0eV9pZAAAAAAEAAAAAQAAAAQ=", "AAAAAAAAAA9HZXQgcHJvamVjdCBVUkkAAAAAC3Byb2plY3RfdXJpAAAAAAAAAAABAAAD6QAAABAAAAAD", "AAAAAAAAABJHZXQgcHJvcGVydHkgYnkgSUQAAAAAAAxnZXRfcHJvcGVydHkAAAABAAAAAAAAAAtwcm9wZXJ0eV9pZAAAAAAEAAAAAQAAA+gAAAfQAAAACFByb3BlcnR5", "AAAAAAAAAAxHZXQgc2V0dGluZ3MAAAAMZ2V0X3NldHRpbmdzAAAAAAAAAAEAAAPpAAAH0AAAAAhTZXR0aW5ncwAAAAM=", "AAAAAAAAAAAAAAAMc3luY192ZXJzaW9uAAAAAAAAAAA=", "AAAAAAAAAkZJbml0aWFsaXplIHRoZSBtZXRhZGF0YSBjb250cmFjdAoKIyBBcmd1bWVudHMKCiogYHRva2VuYCAtIFRoZSBhc3NvY2lhdGVkIEVSQy03MjEgdG9rZW4gY29udHJhY3QKKiBgcHJvamVjdF91cmlgIC0gREFPIHdlYnNpdGUvcHJvamVjdCBVUkwKKiBgZGVzY3JpcHRpb25gIC0gQ29sbGVjdGlvbiBkZXNjcmlwdGlvbgoqIGBjb250cmFjdF9pbWFnZWAgLSBDb2xsZWN0aW9uIGltYWdlIFVSTAoqIGByZW5kZXJlcl9iYXNlYCAtIEJhc2UgVVJMIGZvciBpbWFnZSByZW5kZXJpbmcgc2VydmljZQoqIGBhZG1pbmAgLSBzZXR1cC1waGFzZSBhZG1pbiAodGhlIGxhdW5jaCBhZG1pbik7IGJlY29tZXMgdGhlIFRyZWFzdXJ5IGF0IGxhdW5jaAoqIGB0cmVhc3VyeWAgLSBEQU8gdHJlYXN1cnk7IGBsYXVuY2hgIG11c3QgYmUgY2FsbGVkIHdpdGggZXhhY3RseSB0aGlzIGFkZHJlc3MKCiMgUGFuaWNzCgpQYW5pY3Mgd2l0aCB0aGUgdW5kZXJseWluZyBgRXJyb3JgIHdoZW4gdGhlIGluaXRpYWwgcHJvcGVydGllcyBhcmUKaW52YWxpZCBvciBhIHNldHRpbmdzIHN0cmluZyBleGNlZWRzIGBjb21tb246Ok1BWF9TVFJJTkdfTEVOR1RIYC4AAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAADQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAtwcm9qZWN0X3VyaQAAAAAQAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAA5jb250cmFjdF9pbWFnZQAAAAAAEAAAAAAAAAANcmVuZGVyZXJfYmFzZQAAAAAAABAAAAAAAAAAB21hbmFnZXIAAAAAEwAAAAAAAAAMY3VycmVudF9oYXNoAAAD7gAAACAAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAA5wcm9wZXJ0eV9uYW1lcwAAAAAD6gAAABAAAAAAAAAABWl0ZW1zAAAAAAAD6gAAB9AAAAAJSXRlbVBhcmFtAAAAAAAAAAAAAAppcGZzX2dyb3VwAAAAAAfQAAAACUlwZnNHcm91cAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAA==", "AAAAAAAAAEtHZXQgSVBGUyBncm91cHMgdXNlZCBieSBhcnR3b3JrIGl0ZW1zLiBPKCNncm91cHMpOiBwcmVmZXIgYGdldF9pcGZzX2dyb3VwYC4AAAAADWdldF9pcGZzX2RhdGEAAAAAAAAAAAAAAQAAA+oAAAfQAAAACUlwZnNHcm91cAAAAA==", "AAAAAAAAABVHZXQgcmVuZGVyZXIgYmFzZSBVUkwAAAAAAAANcmVuZGVyZXJfYmFzZQAAAAAAAAAAAAABAAAD6QAAABAAAAAD", "AAAAAAAAAqdBZGQgbmV3IHByb3BlcnRpZXMgYW5kIGl0ZW1zCgojIEFyZ3VtZW50cwoKKiBgbmFtZXNgIC0gUHJvcGVydHkgbmFtZXMgdG8gYWRkCiogYGl0ZW1zYCAtIEl0ZW1zIHRvIGFkZCB0byBwcm9wZXJ0aWVzCiogYGlwZnNfZ3JvdXBgIC0gSVBGUyBiYXNlIFVSSSBhbmQgZXh0ZW5zaW9uIGZvciB0aGVzZSBpdGVtcwoKIyBBdXRob3JpemF0aW9uCgpBZG1pbiBvbmx5ICh0aGUgbGF1bmNoIGFkbWluIGluIHNldHVwLCB0aGUgVHJlYXN1cnkgb25jZSBsaXZlKS4KCiMgRXJyb3JzCgoqIGBPbmVQcm9wZXJ0eUFuZEl0ZW1SZXF1aXJlZGAgLSBGaXJzdCBhZGRpdGlvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMSBwcm9wZXJ0eSBhbmQgMSBpdGVtCiogYFByb3BlcnR5SGFzTm9JdGVtc2AgLSBQcm9wZXJ0eSBjcmVhdGVkIHdpdGhvdXQgaXRlbXMKKiBgVG9vTWFueVByb3BlcnRpZXNgIC0gRXhjZWVkcyAxNiBwcm9wZXJ0eSBsaW1pdAoqIGBJbnZhbGlkUHJvcGVydHlTZWxlY3RlZGAgLSBJdGVtIHJlZmVyZW5jZXMgbm9uLWV4aXN0ZW50IHByb3BlcnR5CiogYFRvb01hbnlJdGVtc2AgLSBtb3JlIHRoYW4gYE1BWF9JVEVNU19QRVJfQ0FMTGAgKDMwKSBpdGVtcyBpbiBvbmUgY2FsbDsKYmF0Y2ggbGFyZ2VyIHVwbG9hZHMgYWNyb3NzIHNldmVyYWwgY2FsbHMgKGVhY2ggYWRkcyBpdHMgb3duIElQRlMgZ3JvdXApAAAAAA5hZGRfcHJvcGVydGllcwAAAAAAAwAAAAAAAAAFbmFtZXMAAAAAAAPqAAAAEAAAAAAAAAAFaXRlbXMAAAAAAAPqAAAH0AAAAAlJdGVtUGFyYW0AAAAAAAAAAAAACmlwZnNfZ3JvdXAAAAAAB9AAAAAJSXBmc0dyb3VwAAAAAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAABJHZXQgY29udHJhY3QgaW1hZ2UAAAAAAA5jb250cmFjdF9pbWFnZQAAAAAAAAAAAAEAAAPpAAAAEAAAAAM=", "AAAAAAAAADVHZXQgdGhlIGdlbmVyYXRlZCBpdGVtIHNlbGVjdGlvbnMgZm9yIGEgbWludGVkIHRva2VuLgAAAAAAAA5nZXRfYXR0cmlidXRlcwAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAA+kAAAPqAAAABAAAAAM=", "AAAAAAAAAEZBIHNpbmdsZSBJUEZTIGdyb3VwIGJ5IGFic29sdXRlIGluZGV4ICh0aGUgYHJlZmVyZW5jZV9zbG90YCBvZiBpdGVtcykuAAAAAAAOZ2V0X2lwZnNfZ3JvdXAAAAAAAAEAAAAAAAAABWluZGV4AAAAAAAABAAAAAEAAAPoAAAH0AAAAAlJcGZzR3JvdXAAAAA=", "AAAAAAAAAH5HZXQgYWxsIHByb3BlcnRpZXMuIE8odG90YWwgaXRlbXMpOiBtYXkgZXhjZWVkIHJlYWQgbGltaXRzIG9uIGxhcmdlCmNvbGxlY3Rpb25zOyBwcmVmZXIgYGdldF9wcm9wZXJ0eWAvYGdldF9pdGVtc2AgcGFnaW5hdGlvbi4AAAAAAA5nZXRfcHJvcGVydGllcwAAAAAAAAAAAAEAAAPqAAAH0AAAAAhQcm9wZXJ0eQ==", "AAAAAAAAABNHZXQgSVBGUyBkYXRhIGNvdW50AAAAAA9pcGZzX2RhdGFfY291bnQAAAAAAAAAAAEAAAAE", "AAAAAAAAAXJCYXRjaCB2YXJpYW50IG9mIGBvbl9taW50ZWRgIGZvciB0aGUgY29udGlndW91cyByYW5nZQpgW2ZpcnN0X3Rva2VuX2lkLCBmaXJzdF90b2tlbl9pZCArIGNvdW50KWAuCgpBdXRob3JpemVzIHRoZSB0b2tlbiBhbmQgbG9hZHMgdGhlIHByb3BlcnRpZXMgb25jZSBmb3IgdGhlIHdob2xlIHJhbmdlCmluc3RlYWQgb2Ygb25jZSBwZXIgdG9rZW4uIEVtaXRzIGEgc2luZ2xlIGBTZWVkc0dlbmVyYXRlZGAgZXZlbnQgZm9yCnRoZSB3aG9sZSByYW5nZSByYXRoZXIgdGhhbiBvbmUgYFNlZWRHZW5lcmF0ZWRgIHBlciB0b2tlbi4KCiMgRXJyb3JzCgpPbmx5IHRoZSB0b2tlbiBjb250cmFjdCBtYXkgY2FsbCB0aGlzIChpdHMgYXV0aCBpcyByZXF1aXJlZCkuAAAAAAAPb25fbWludGVkX2JhdGNoAAAAAAIAAAAAAAAADmZpcnN0X3Rva2VuX2lkAAAAAAAEAAAAAAAAAAVjb3VudAAAAAAAAAQAAAABAAAD6QAAAAEAAAAD", "AAAAAAAAADlTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4AAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAj5QZXJtaXNzaW9ubGVzcyBUVEwgcmVuZXdhbCBmb3IgYXJ0d29yayBlbnRyaWVzLgoKVGhlIGZsYXQgc3BhY2UgaXMgZXZlcnkgaXRlbSBgKHByb3BlcnR5LCBpdGVtKWAgaW4gb3JkZXIsIGZvbGxvd2VkIGJ5CmV2ZXJ5IElQRlMgZ3JvdXAuIEV4dGVuZHMgZW50cmllcyBpbiBgW3N0YXJ0LCBzdGFydCArIGxpbWl0KWAgKHBsdXMgdGhlCnByb3BlcnR5IGhlYWRlcnMgd2Fsa2VkIGFuZCB0aGUgaW5zdGFuY2UpIGFuZCByZXR1cm5zIHRoZSBuZXh0IHN0YXJ0LApvciBgdG90YWxgIHdoZW4gZG9uZS4gQ2FsbGVycyBsb29wIHVudGlsIHRoZSByZXR1cm5lZCB2YWx1ZSBlcXVhbHMgdGhlCnRvdGFsLiBgbGltaXRgIG11c3QgYmUgPD0gYE1BWF9QQUdFYCAoYExpbWl0VG9vSGlnaGApLgoKTm90ZTogdGhlIG5ldHdvcmsgY2xhbXBzIGBleHRlbmRfdG9gIHRvIGl0cyBtYXggZW50cnkgVFRMICh+MTgwIGRheXMpLApzbyB0aGUgZWZmZWN0aXZlIGxpZmV0aW1lIGFmdGVyIGEgd3JpdGUgb3IgYnVtcCBpcyB+MTgwIGRheXMsIG5vdCB0aGUKbm9taW5hbCAzNjU7IGNhbGwgdGhpcyBwZXJpb2RpY2FsbHkgdG8gcmVuZXcuAAAAAAAQYnVtcF9hcnR3b3JrX3R0bAAAAAIAAAAAAAAABXN0YXJ0AAAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+kAAAAEAAAAAw==", "AAAAAAAAABRHZXQgcHJvcGVydGllcyBjb3VudAAAABBwcm9wZXJ0aWVzX2NvdW50AAAAAAAAAAEAAAAE", "AAAAAAAAABJVcGRhdGUgZGVzY3JpcHRpb24AAAAAABJ1cGRhdGVfZGVzY3JpcHRpb24AAAAAAAEAAAAAAAAAD25ld19kZXNjcmlwdGlvbgAAAAAQAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAABJVcGRhdGUgcHJvamVjdCBVUkkAAAAAABJ1cGRhdGVfcHJvamVjdF91cmkAAAAAAAEAAAAAAAAAD25ld19wcm9qZWN0X3VyaQAAAAAQAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAABhVcGRhdGUgcmVuZGVyZXIgYmFzZSBVUkwAAAAUdXBkYXRlX3JlbmRlcmVyX2Jhc2UAAAABAAAAAAAAABFuZXdfcmVuZGVyZXJfYmFzZQAAAAAAABAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAABVVcGRhdGUgY29udHJhY3QgaW1hZ2UAAAAAAAAVdXBkYXRlX2NvbnRyYWN0X2ltYWdlAAAAAAAAAQAAAAAAAAASbmV3X2NvbnRyYWN0X2ltYWdlAAAAAAAQAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAJ5EZWxldGUgYWxsIHByb3BlcnRpZXMgYW5kIHJlY3JlYXRlIHdpdGggbmV3IG9uZXMKCldBUk5JTkc6IFRoaXMgY2FuIGJyZWFrIGV4aXN0aW5nIHRva2VuIG1ldGFkYXRhIGlmIHByb3BlcnRpZXMgY2hhbmdlIHN0cnVjdHVyZQoKIyBBdXRob3JpemF0aW9uCgpBZG1pbiBvbmx5LgAAAAAAHmRlbGV0ZV9hbmRfcmVjcmVhdGVfcHJvcGVydGllcwAAAAAAAwAAAAAAAAAFbmFtZXMAAAAAAAPqAAAAEAAAAAAAAAAFaXRlbXMAAAAAAAPqAAAH0AAAAAlJdGVtUGFyYW0AAAAAAAAAAAAACmlwZnNfZ3JvdXAAAAAAB9AAAAAJSXBmc0dyb3VwAAAAAAAAAQAAA+kAAAACAAAAAw==", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAACZgQ3VycmVudFZlcnNpb25gIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAABQAAABVFbWl0dGVkIGJ5IGBtaWdyYXRlYC4AAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAAAAAAFGZyb21fc3RvcmFnZV92ZXJzaW9uAAAABAAAAAAAAAAAAAAAEnRvX3N0b3JhZ2VfdmVyc2lvbgAAAAAABAAAAAAAAAAC", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAABpFbWl0dGVkIGJ5IGBzeW5jX3ZlcnNpb25gLgAAAAAAAAAAAA1WZXJzaW9uU3luY2VkAAAAAAAAAQAAAA52ZXJzaW9uX3N5bmNlZAAAAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ token, project_uri, description, contract_image, renderer_base, manager, current_hash, admin, treasury, property_names, items, ipfs_group, version }: { token: string | Address; project_uri: string; description: string; contract_image: string; renderer_base: string; manager: string | Address; current_hash: Uint8Array; admin: string | Address; treasury: string | Address; property_names: Array<string>; items: Array<ItemParam>; ipfs_group: IpfsGroup; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ token, project_uri, description, contract_image, renderer_base, manager, current_hash, admin, treasury, property_names, items, ipfs_group, version }, options);
  }
  public readonly fromJson = {
    admin : this.txFromJson<string>,  token : this.txFromJson<Result<string, Error>>,  launch : this.txFromJson<void>,  migrate : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  get_items : this.txFromJson<Result<Array<Item>, Error>>,  on_minted : this.txFromJson<Result<boolean, Error>>,  wasm_hash : this.txFromJson<Uint8Array>,  regenerate : this.txFromJson<Result<null, Error>>,  description : this.txFromJson<Result<string, Error>>,  items_count : this.txFromJson<number>,  project_uri : this.txFromJson<Result<string, Error>>,  get_property : this.txFromJson<Property | null>,  get_settings : this.txFromJson<Result<Settings, Error>>,  sync_version : this.txFromJson<void>,  get_ipfs_data : this.txFromJson<Array<IpfsGroup>>,  renderer_base : this.txFromJson<Result<string, Error>>,  add_properties : this.txFromJson<Result<null, Error>>,  contract_image : this.txFromJson<Result<string, Error>>,  get_attributes : this.txFromJson<Result<Array<number>, Error>>,  get_ipfs_group : this.txFromJson<IpfsGroup | null>,  get_properties : this.txFromJson<Array<Property>>,  ipfs_data_count : this.txFromJson<number>,  on_minted_batch : this.txFromJson<Result<boolean, Error>>,  storage_version : this.txFromJson<number>,  bump_artwork_ttl : this.txFromJson<Result<number, Error>>,  properties_count : this.txFromJson<number>,  update_description : this.txFromJson<Result<null, Error>>,  update_project_uri : this.txFromJson<Result<null, Error>>,  update_renderer_base : this.txFromJson<Result<null, Error>>,  update_contract_image : this.txFromJson<Result<null, Error>>,  delete_and_recreate_properties : this.txFromJson<Result<null, Error>>
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
   * Build a topics filter row for the "ProjectURIUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  projectURIUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("ProjectURIUpdated");
  }
  /**
   * Build a topics filter row for the "DescriptionUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  descriptionUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("DescriptionUpdated");
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
   * Build a topics filter row for the "ContractImageUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  contractImageUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("ContractImageUpdated");
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
  /**
   * Build a topics filter row for the "VersionSynced" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  versionSyncedEventFilter(): string[] {
    return this.spec.eventTopicFilter("VersionSynced");
  }
}