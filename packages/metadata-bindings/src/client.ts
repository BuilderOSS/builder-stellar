import {ItemParam, IpfsGroup, Property, Settings, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Get token address
   */
  token(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
   * * `OnlyToken` - Only token contract can call this function
   */
  on_minted({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<boolean, Error>>>;
  /**
   * Initialize the metadata contract
   *
   * # Arguments
   *
   * * `token` - The associated ERC-721 token contract
   * * `project_uri` - DAO website/project URL
   * * `description` - Collection description
   * * `contract_image` - Collection image URL
   * * `renderer_base` - Base URL for image rendering service
   * * `owner` - Metadata contract owner
   *
   * # Errors
   *
   * * `AlreadyInitialized` - Contract already initialized
   */
  initialize({ token, project_uri, description, contract_image, renderer_base, manager, current_hash, owner, property_names, items, ipfs_group }: { token: string | Address; project_uri: string; description: string; contract_image: string; renderer_base: string; manager: string | Address; current_hash: Uint8Array; owner: string | Address; property_names: Array<string>; items: Array<ItemParam>; ipfs_group: IpfsGroup }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
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
   * Only the token owner (governance) can add properties.
   *
   * # Errors
   *
   * * `Unauthorized` - Caller is not token owner
   * * `OnePropertyAndItemRequired` - First addition must have at least 1 property and 1 item
   * * `PropertyHasNoItems` - Property created without items
   * * `TooManyProperties` - Exceeds 16 property limit
   * * `InvalidPropertySelected` - Item references non-existent property
   */
  add_properties({ names, items, ipfs_group }: { names: Array<string>; items: Array<ItemParam>; ipfs_group: IpfsGroup }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Get contract image
   */
  contract_image(options?: MethodOptions): Promise<AssembledTransaction<Result<string, Error>>>;
  /**
   * Get all properties
   */
  get_properties(options?: MethodOptions): Promise<AssembledTransaction<Array<Property>>>;
  /**
   * Get IPFS data count
   */
  ipfs_data_count(options?: MethodOptions): Promise<AssembledTransaction<number>>;
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
   * Only the token owner (governance) can reset properties.
   */
  delete_and_recreate_properties({ names, items, ipfs_group }: { names: Array<string>; items: Array<ItemParam>; ipfs_group: IpfsGroup }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAAtPbmx5TWFuYWdlcgAAAAACAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAwAAAAAAAAAaT25lUHJvcGVydHlBbmRJdGVtUmVxdWlyZWQAAAAAAAoAAAAAAAAAElByb3BlcnR5SGFzTm9JdGVtcwAAAAAACwAAAAAAAAARVG9vTWFueVByb3BlcnRpZXMAAAAAAAAMAAAAAAAAABdJbnZhbGlkUHJvcGVydHlTZWxlY3RlZAAAAAANAAAAAAAAAAlPbmx5VG9rZW4AAAAAAAAUAAAAAAAAAA5Ub2tlbk5vdE1pbnRlZAAAAAAAFQAAAAAAAAAMVW5hdXRob3JpemVkAAAAHgAAAAAAAAAOSW52YWxpZFRva2VuSWQAAAAAACg=", "AAAABQAAAAAAAAAAAAAADVByb3BlcnR5QWRkZWQAAAAAAAABAAAADnByb3BlcnR5X2FkZGVkAAAAAAACAAAAAAAAAAtwcm9wZXJ0eV9pZAAAAAAEAAAAAQAAAAAAAAAEbmFtZQAAABAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAADVNlZWRHZW5lcmF0ZWQAAAAAAAABAAAADnNlZWRfZ2VuZXJhdGVkAAAAAAADAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAAA5udW1fcHJvcGVydGllcwAAAAAABAAAAAAAAAAAAAAACnNlbGVjdGlvbnMAAAAAA+oAAAAEAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAD1Byb3BlcnRpZXNSZXNldAAAAAABAAAAEHByb3BlcnRpZXNfcmVzZXQAAAABAAAAAAAAAA5udW1fcHJvcGVydGllcwAAAAAABAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEVByb2plY3RVUklVcGRhdGVkAAAAAAAAAQAAABNwcm9qZWN0X3VyaV91cGRhdGVkAAAAAAIAAAAAAAAAB29sZF91cmkAAAAAEAAAAAAAAAAAAAAAB25ld191cmkAAAAAEAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEkRlc2NyaXB0aW9uVXBkYXRlZAAAAAAAAQAAABNkZXNjcmlwdGlvbl91cGRhdGVkAAAAAAIAAAAAAAAAD29sZF9kZXNjcmlwdGlvbgAAAAAQAAAAAAAAAAAAAAAPbmV3X2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAE01ldGFkYXRhSW5pdGlhbGl6ZWQAAAAAAQAAABRtZXRhZGF0YV9pbml0aWFsaXplZAAAAAIAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAAAAAADXJlbmRlcmVyX2Jhc2UAAAAAAAAQAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAE1JlbmRlcmVyQmFzZVVwZGF0ZWQAAAAAAQAAABVyZW5kZXJlcl9iYXNlX3VwZGF0ZWQAAAAAAAACAAAAAAAAAAhvbGRfYmFzZQAAABAAAAAAAAAAAAAAAAhuZXdfYmFzZQAAABAAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAFENvbnRyYWN0SW1hZ2VVcGRhdGVkAAAAAQAAABZjb250cmFjdF9pbWFnZV91cGRhdGVkAAAAAAACAAAAAAAAAAlvbGRfaW1hZ2UAAAAAAAAQAAAAAAAAAAAAAAAJbmV3X2ltYWdlAAAAAAAAEAAAAAAAAAAC", "AAAAAQAAAAAAAAAAAAAABEl0ZW0AAAACAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAOcmVmZXJlbmNlX3Nsb3QAAAAAAAQ=", "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACAAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAAAAAAAAAAACFNldHRpbmdzAAAAAAAAAAAAAAAKUHJvcGVydGllcwAAAAAAAAAAAAAAAAAISXBmc0RhdGEAAAABAAAAAAAAAApBdHRyaWJ1dGVzAAAAAAABAAAABAAAAAAAAAAAAAAAB01hbmFnZXIAAAAAAAAAAAAAAAAFT3duZXIAAAAAAAAAAAAAAAAAAAtDdXJyZW50SGFzaAA=", "AAAAAQAAAAAAAAAAAAAACFByb3BlcnR5AAAAAgAAAAAAAAAFaXRlbXMAAAAAAAPqAAAH0AAAAARJdGVtAAAAAAAAAARuYW1lAAAAEA==", "AAAAAQAAAAAAAAAAAAAACFNldHRpbmdzAAAABQAAAAAAAAAOY29udHJhY3RfaW1hZ2UAAAAAABAAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAAC3Byb2plY3RfdXJpAAAAABAAAAAAAAAADXJlbmRlcmVyX2Jhc2UAAAAAAAAQAAAAAAAAAAV0b2tlbgAAAAAAABM=", "AAAAAQAAAAAAAAAAAAAACUlwZnNHcm91cAAAAAAAAAIAAAAAAAAACGJhc2VfdXJpAAAAEAAAAAAAAAAJZXh0ZW5zaW9uAAAAAAAAEA==", "AAAAAQAAAAAAAAAAAAAACUl0ZW1QYXJhbQAAAAAAAAMAAAAAAAAAD2lzX25ld19wcm9wZXJ0eQAAAAABAAAAAAAAAARuYW1lAAAAEAAAAAAAAAALcHJvcGVydHlfaWQAAAAABA==", "AAAAAAAAABFHZXQgdG9rZW4gYWRkcmVzcwAAAAAAAAV0b2tlbgAAAAAAAAAAAAABAAAD6QAAABMAAAAD", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAR5HZW5lcmF0ZSBzZWVkIGZvciBhIHRva2VuIHVwb24gbWludCAoaG9vayBjYWxsZWQgYnkgVG9rZW4gY29udHJhY3QpCgojIEFyZ3VtZW50cwoKKiBgdG9rZW5faWRgIC0gVGhlIHRva2VuIElEIGJlaW5nIG1pbnRlZAoKIyBSZXR1cm5zCgpSZXR1cm5zIGB0cnVlYCBpZiBzZWVkIHdhcyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5LCBgZmFsc2VgIGlmIG5vIHByb3BlcnRpZXMgZXhpc3QKCiMgRXJyb3JzCgoqIGBPbmx5VG9rZW5gIC0gT25seSB0b2tlbiBjb250cmFjdCBjYW4gY2FsbCB0aGlzIGZ1bmN0aW9uAAAAAAAJb25fbWludGVkAAAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAA+kAAAABAAAAAw==", "AAAAAAAAAXtJbml0aWFsaXplIHRoZSBtZXRhZGF0YSBjb250cmFjdAoKIyBBcmd1bWVudHMKCiogYHRva2VuYCAtIFRoZSBhc3NvY2lhdGVkIEVSQy03MjEgdG9rZW4gY29udHJhY3QKKiBgcHJvamVjdF91cmlgIC0gREFPIHdlYnNpdGUvcHJvamVjdCBVUkwKKiBgZGVzY3JpcHRpb25gIC0gQ29sbGVjdGlvbiBkZXNjcmlwdGlvbgoqIGBjb250cmFjdF9pbWFnZWAgLSBDb2xsZWN0aW9uIGltYWdlIFVSTAoqIGByZW5kZXJlcl9iYXNlYCAtIEJhc2UgVVJMIGZvciBpbWFnZSByZW5kZXJpbmcgc2VydmljZQoqIGBvd25lcmAgLSBNZXRhZGF0YSBjb250cmFjdCBvd25lcgoKIyBFcnJvcnMKCiogYEFscmVhZHlJbml0aWFsaXplZGAgLSBDb250cmFjdCBhbHJlYWR5IGluaXRpYWxpemVkAAAAAAppbml0aWFsaXplAAAAAAALAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAC3Byb2plY3RfdXJpAAAAABAAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAADmNvbnRyYWN0X2ltYWdlAAAAAAAQAAAAAAAAAA1yZW5kZXJlcl9iYXNlAAAAAAAAEAAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAA5wcm9wZXJ0eV9uYW1lcwAAAAAD6gAAABAAAAAAAAAABWl0ZW1zAAAAAAAD6gAAB9AAAAAJSXRlbVBhcmFtAAAAAAAAAAAAAAppcGZzX2dyb3VwAAAAAAfQAAAACUlwZnNHcm91cAAAAAAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAA9HZXQgZGVzY3JpcHRpb24AAAAAC2Rlc2NyaXB0aW9uAAAAAAAAAAABAAAD6QAAABAAAAAD", "AAAAAAAAAB5HZXQgaXRlbXMgY291bnQgZm9yIGEgcHJvcGVydHkAAAAAAAtpdGVtc19jb3VudAAAAAABAAAAAAAAAAtwcm9wZXJ0eV9pZAAAAAAEAAAAAQAAAAQ=", "AAAAAAAAAA9HZXQgcHJvamVjdCBVUkkAAAAAC3Byb2plY3RfdXJpAAAAAAAAAAABAAAD6QAAABAAAAAD", "AAAAAAAAABJHZXQgcHJvcGVydHkgYnkgSUQAAAAAAAxnZXRfcHJvcGVydHkAAAABAAAAAAAAAAtwcm9wZXJ0eV9pZAAAAAAEAAAAAQAAA+gAAAfQAAAACFByb3BlcnR5", "AAAAAAAAAAxHZXQgc2V0dGluZ3MAAAAMZ2V0X3NldHRpbmdzAAAAAAAAAAEAAAPpAAAH0AAAAAhTZXR0aW5ncwAAAAM=", "AAAAAAAAABVHZXQgcmVuZGVyZXIgYmFzZSBVUkwAAAAAAAANcmVuZGVyZXJfYmFzZQAAAAAAAAAAAAABAAAD6QAAABAAAAAD", "AAAAAAAAAjdBZGQgbmV3IHByb3BlcnRpZXMgYW5kIGl0ZW1zCgojIEFyZ3VtZW50cwoKKiBgbmFtZXNgIC0gUHJvcGVydHkgbmFtZXMgdG8gYWRkCiogYGl0ZW1zYCAtIEl0ZW1zIHRvIGFkZCB0byBwcm9wZXJ0aWVzCiogYGlwZnNfZ3JvdXBgIC0gSVBGUyBiYXNlIFVSSSBhbmQgZXh0ZW5zaW9uIGZvciB0aGVzZSBpdGVtcwoKIyBBdXRob3JpemF0aW9uCgpPbmx5IHRoZSB0b2tlbiBvd25lciAoZ292ZXJuYW5jZSkgY2FuIGFkZCBwcm9wZXJ0aWVzLgoKIyBFcnJvcnMKCiogYFVuYXV0aG9yaXplZGAgLSBDYWxsZXIgaXMgbm90IHRva2VuIG93bmVyCiogYE9uZVByb3BlcnR5QW5kSXRlbVJlcXVpcmVkYCAtIEZpcnN0IGFkZGl0aW9uIG11c3QgaGF2ZSBhdCBsZWFzdCAxIHByb3BlcnR5IGFuZCAxIGl0ZW0KKiBgUHJvcGVydHlIYXNOb0l0ZW1zYCAtIFByb3BlcnR5IGNyZWF0ZWQgd2l0aG91dCBpdGVtcwoqIGBUb29NYW55UHJvcGVydGllc2AgLSBFeGNlZWRzIDE2IHByb3BlcnR5IGxpbWl0CiogYEludmFsaWRQcm9wZXJ0eVNlbGVjdGVkYCAtIEl0ZW0gcmVmZXJlbmNlcyBub24tZXhpc3RlbnQgcHJvcGVydHkAAAAADmFkZF9wcm9wZXJ0aWVzAAAAAAADAAAAAAAAAAVuYW1lcwAAAAAAA+oAAAAQAAAAAAAAAAVpdGVtcwAAAAAAA+oAAAfQAAAACUl0ZW1QYXJhbQAAAAAAAAAAAAAKaXBmc19ncm91cAAAAAAH0AAAAAlJcGZzR3JvdXAAAAAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAABJHZXQgY29udHJhY3QgaW1hZ2UAAAAAAA5jb250cmFjdF9pbWFnZQAAAAAAAAAAAAEAAAPpAAAAEAAAAAM=", "AAAAAAAAABJHZXQgYWxsIHByb3BlcnRpZXMAAAAAAA5nZXRfcHJvcGVydGllcwAAAAAAAAAAAAEAAAPqAAAH0AAAAAhQcm9wZXJ0eQ==", "AAAAAAAAABNHZXQgSVBGUyBkYXRhIGNvdW50AAAAAA9pcGZzX2RhdGFfY291bnQAAAAAAAAAAAEAAAAE", "AAAAAAAAABRHZXQgcHJvcGVydGllcyBjb3VudAAAABBwcm9wZXJ0aWVzX2NvdW50AAAAAAAAAAEAAAAE", "AAAAAAAAABJVcGRhdGUgZGVzY3JpcHRpb24AAAAAABJ1cGRhdGVfZGVzY3JpcHRpb24AAAAAAAEAAAAAAAAAD25ld19kZXNjcmlwdGlvbgAAAAAQAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAABJVcGRhdGUgcHJvamVjdCBVUkkAAAAAABJ1cGRhdGVfcHJvamVjdF91cmkAAAAAAAEAAAAAAAAAD25ld19wcm9qZWN0X3VyaQAAAAAQAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAABhVcGRhdGUgcmVuZGVyZXIgYmFzZSBVUkwAAAAUdXBkYXRlX3JlbmRlcmVyX2Jhc2UAAAABAAAAAAAAABFuZXdfcmVuZGVyZXJfYmFzZQAAAAAAABAAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAABVVcGRhdGUgY29udHJhY3QgaW1hZ2UAAAAAAAAVdXBkYXRlX2NvbnRyYWN0X2ltYWdlAAAAAAAAAQAAAAAAAAASbmV3X2NvbnRyYWN0X2ltYWdlAAAAAAAQAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAMpEZWxldGUgYWxsIHByb3BlcnRpZXMgYW5kIHJlY3JlYXRlIHdpdGggbmV3IG9uZXMKCldBUk5JTkc6IFRoaXMgY2FuIGJyZWFrIGV4aXN0aW5nIHRva2VuIG1ldGFkYXRhIGlmIHByb3BlcnRpZXMgY2hhbmdlIHN0cnVjdHVyZQoKIyBBdXRob3JpemF0aW9uCgpPbmx5IHRoZSB0b2tlbiBvd25lciAoZ292ZXJuYW5jZSkgY2FuIHJlc2V0IHByb3BlcnRpZXMuAAAAAAAeZGVsZXRlX2FuZF9yZWNyZWF0ZV9wcm9wZXJ0aWVzAAAAAAADAAAAAAAAAAVuYW1lcwAAAAAAA+oAAAAQAAAAAAAAAAVpdGVtcwAAAAAAA+oAAAfQAAAACUl0ZW1QYXJhbQAAAAAAAAAAAAAKaXBmc19ncm91cAAAAAAH0AAAAAlJcGZzR3JvdXAAAAAAAAABAAAD6QAAAAIAAAAD", "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==", "AAAAAQAAAEhTdG9yZXMgdGhlIHBlbmRpbmcgcm9sZSBob2xkZXIgYW5kIHRoZSBleHBsaWNpdCBkZWFkbGluZSBmb3IgYWNjZXB0YW5jZS4AAAAAAAAAD1BlbmRpbmdUcmFuc2ZlcgAAAAACAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABA==", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIGdyYW50ZWQuAAAAAAAAAAAAAAtSb2xlR3JhbnRlZAAAAAABAAAADHJvbGVfZ3JhbnRlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIHJldm9rZWQuAAAAAAAAAAAAAAtSb2xlUmV2b2tlZAAAAAABAAAADHJvbGVfcmV2b2tlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=", "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIGFkbWluIHJvbGUgaXMgcmVub3VuY2VkLgAAAAAAAAAADkFkbWluUmVub3VuY2VkAAAAAAABAAAAD2FkbWluX3Jlbm91bmNlZAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAg==", "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGFkbWluIGlzIGNoYW5nZWQuAAAAAAAAAAAQUm9sZUFkbWluQ2hhbmdlZAAAAAEAAAAScm9sZV9hZG1pbl9jaGFuZ2VkAAAAAAADAAAAAAAAAARyb2xlAAAAEQAAAAEAAAAAAAAAE3ByZXZpb3VzX2FkbWluX3JvbGUAAAAAEQAAAAAAAAAAAAAADm5ld19hZG1pbl9yb2xlAAAAAAARAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAAEkFjY2Vzc0NvbnRyb2xFcnJvcgAAAAAACwAAAAAAAAAMVW5hdXRob3JpemVkAAAH0AAAAAAAAAALQWRtaW5Ob3RTZXQAAAAH0QAAAAAAAAAQSW5kZXhPdXRPZkJvdW5kcwAAB9IAAAAAAAAAEUFkbWluUm9sZU5vdEZvdW5kAAAAAAAH0wAAAAAAAAASUm9sZUNvdW50SXNOb3RaZXJvAAAAAAfUAAAAAAAAAAxSb2xlTm90Rm91bmQAAAfVAAAAAAAAAA9BZG1pbkFscmVhZHlTZXQAAAAH1gAAAAAAAAALUm9sZU5vdEhlbGQAAAAH1wAAAAAAAAALUm9sZUlzRW1wdHkAAAAH2AAAAAAAAAASVHJhbnNmZXJJblByb2dyZXNzAAAAAAfZAAAAAAAAABBNYXhSb2xlc0V4Y2VlZGVkAAAH2g==", "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgY29tcGxldGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVyQ29tcGxldGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAIAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAAAAAAAA5wcmV2aW91c19hZG1pbgAAAAAAEwAAAAAAAAAC", "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgaW5pdGlhdGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVySW5pdGlhdGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2luaXRpYXRlZAAAAAMAAAAAAAAADWN1cnJlbnRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC", "AAAAAQAAADFTdG9yYWdlIGtleSBmb3IgZW51bWVyYXRpb24gb2YgYWNjb3VudHMgcGVyIHJvbGUuAAAAAAAAAAAAAA5Sb2xlQWNjb3VudEtleQAAAAAAAgAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAARyb2xlAAAAEQ==", "AAAAAgAAADxTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgYWNjZXNzIGNvbnRyb2wAAAAAAAAAF0FjY2Vzc0NvbnRyb2xTdG9yYWdlS2V5AAAAAAcAAAAAAAAAAAAAAA1FeGlzdGluZ1JvbGVzAAAAAAAAAQAAAAAAAAAMUm9sZUFjY291bnRzAAAAAQAAB9AAAAAOUm9sZUFjY291bnRLZXkAAAAAAAEAAAAAAAAAB0hhc1JvbGUAAAAAAgAAABMAAAARAAAAAQAAAAAAAAARUm9sZUFjY291bnRzQ291bnQAAAAAAAABAAAAEQAAAAEAAAAAAAAACVJvbGVBZG1pbgAAAAAAAAEAAAARAAAAAAAAAAAAAAAFQWRtaW4AAAAAAAAAAAAAAAAAAAxQZW5kaW5nQWRtaW4=", "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==", "AAAAAgAAACNTdG9yYWdlIGtleXMgZm9yIGBPd25hYmxlYCB1dGlsaXR5LgAAAAAAAAAAEU93bmFibGVTdG9yYWdlS2V5AAAAAAAAAgAAAAAAAAAAAAAABU93bmVyAAAAAAAAAAAAAAAAAAAMUGVuZGluZ093bmVy", "AAAAAgAAAONDb250ZXh0IG9mIGEgc2luZ2xlIGF1dGhvcml6ZWQgY2FsbCBwZXJmb3JtZWQgYnkgYW4gYWRkcmVzcy4KCkN1c3RvbSBhY2NvdW50IGNvbnRyYWN0cyB0aGF0IGltcGxlbWVudCBgX19jaGVja19hdXRoYCBzcGVjaWFsIGZ1bmN0aW9uCnJlY2VpdmUgYSBsaXN0IG9mIGBDb250ZXh0YCB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byBhbGwgdGhlIGNhbGxzIHRoYXQKbmVlZCB0byBiZSBhdXRob3JpemVkLgAAAAAAAAAAB0NvbnRleHQAAAAAAwAAAAEAAAAUQ29udHJhY3QgaW52b2NhdGlvbi4AAAAIQ29udHJhY3QAAAABAAAH0AAAAA9Db250cmFjdENvbnRleHQAAAAAAQAAAD1Db250cmFjdCB0aGF0IGhhcyBhIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIGlzIGNyZWF0ZWQuAAAAAAAAFENyZWF0ZUNvbnRyYWN0SG9zdEZuAAAAAQAAB9AAAAAbQ3JlYXRlQ29udHJhY3RIb3N0Rm5Db250ZXh0AAAAAAEAAABEQ29udHJhY3QgdGhhdCBoYXMgYSBjb25zdHJ1Y3RvciB3aXRoIDEgb3IgbW9yZSBhcmd1bWVudHMgaXMgY3JlYXRlZC4AAAAcQ3JlYXRlQ29udHJhY3RXaXRoQ3Rvckhvc3RGbgAAAAEAAAfQAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAA", "AAAAAQAAAL1BdXRob3JpemF0aW9uIGNvbnRleHQgb2YgYSBzaW5nbGUgY29udHJhY3QgY2FsbC4KClRoaXMgc3RydWN0IGNvcnJlc3BvbmRzIHRvIGEgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgY2FsbCBmb3IgYW4gYWRkcmVzcwpmcm9tIGBjb250cmFjdGAgZnVuY3Rpb24gd2l0aCBgZm5fbmFtZWAgbmFtZSBhbmQgYGFyZ3NgIGFyZ3VtZW50cy4AAAAAAAAAAAAAD0NvbnRyYWN0Q29udGV4dAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAHZm5fbmFtZQAAAAAR", "AAAAAgAAAF9Db250cmFjdCBleGVjdXRhYmxlIHVzZWQgZm9yIGNyZWF0aW5nIGEgbmV3IGNvbnRyYWN0IGFuZCB1c2VkIGluCmBDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHRgLgAAAAAAAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAQAAAAEAAAAAAAAABFdhc20AAAABAAAD7gAAACA=", "AAAAAQAAADhWYWx1ZSBvZiBjb250cmFjdCBub2RlIGluIEludm9rZXJDb250cmFjdEF1dGhFbnRyeSB0cmVlLgAAAAAAAAAVU3ViQ29udHJhY3RJbnZvY2F0aW9uAAAAAAAAAgAAAAAAAAAHY29udGV4dAAAAAfQAAAAD0NvbnRyYWN0Q29udGV4dAAAAAAAAAAAD3N1Yl9pbnZvY2F0aW9ucwAAAAPqAAAH0AAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnk=", "AAAAAgAAAS9BIG5vZGUgaW4gdGhlIHRyZWUgb2YgYXV0aG9yaXphdGlvbnMgcGVyZm9ybWVkIG9uIGJlaGFsZiBvZiB0aGUgY3VycmVudApjb250cmFjdCBhcyBpbnZva2VyIG9mIHRoZSBjb250cmFjdHMgZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrLgoKVGhpcyBpcyB1c2VkIGFzIGFuIGFyZ3VtZW50IG9mIGBhdXRob3JpemVfYXNfY3VycmVudF9jb250cmFjdGAgaG9zdCBmdW5jdGlvbi4KClRoaXMgdHJlZSBjb3JyZXNwb25kcyBgcmVxdWlyZV9hdXRoW19mb3JfYXJnc11gIGNhbGxzIG9uIGJlaGFsZiBvZiB0aGUKY3VycmVudCBjb250cmFjdC4AAAAAAAAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnkAAAADAAAAAQAAABJJbnZva2UgYSBjb250cmFjdC4AAAAAAAhDb250cmFjdAAAAAEAAAfQAAAAFVN1YkNvbnRyYWN0SW52b2NhdGlvbgAAAAAAAAEAAAA1Q3JlYXRlIGEgY29udHJhY3QgcGFzc2luZyAwIGFyZ3VtZW50cyB0byBjb25zdHJ1Y3Rvci4AAAAAAAAUQ3JlYXRlQ29udHJhY3RIb3N0Rm4AAAABAAAH0AAAABtDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHQAAAAAAQAAAD1DcmVhdGUgYSBjb250cmFjdCBwYXNzaW5nIDAgb3IgbW9yZSBhcmd1bWVudHMgdG8gY29uc3RydWN0b3IuAAAAAAAAHENyZWF0ZUNvbnRyYWN0V2l0aEN0b3JIb3N0Rm4AAAABAAAH0AAAACpDcmVhdGVDb250cmFjdFdpdGhDb25zdHJ1Y3Rvckhvc3RGbkNvbnRleHQAAA==", "AAAAAQAAAHZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuAAAAAAAAAAAAG0NyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dAAAAAACAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAQAAANZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuClRoaXMgaXMgdGhlIHNhbWUgYXMgYENyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dGAsIGJ1dCBhbHNvIGhhcwpjb250cmFjdCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAAAAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAAAAAAAwAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAgAAAAAAAAAAAAAACkV4ZWN1dGFibGUAAAAAAAMAAAABAAAAAAAAAARXYXNtAAAAAQAAA+4AAAAgAAAAAAAAAAAAAAAMU3RlbGxhckFzc2V0AAAAAAAAAAAAAAAHQWNjb3VudAA="]),
      options
    );
  }

   static deploy<T = Client>(options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  public readonly fromJson = {
    token : this.txFromJson<Result<string, Error>>,  upgrade : this.txFromJson<void>,  on_minted : this.txFromJson<Result<boolean, Error>>,  initialize : this.txFromJson<Result<null, Error>>,  description : this.txFromJson<Result<string, Error>>,  items_count : this.txFromJson<number>,  project_uri : this.txFromJson<Result<string, Error>>,  get_property : this.txFromJson<Property | null>,  get_settings : this.txFromJson<Result<Settings, Error>>,  renderer_base : this.txFromJson<Result<string, Error>>,  add_properties : this.txFromJson<Result<null, Error>>,  contract_image : this.txFromJson<Result<string, Error>>,  get_properties : this.txFromJson<Array<Property>>,  ipfs_data_count : this.txFromJson<number>,  properties_count : this.txFromJson<number>,  update_description : this.txFromJson<Result<null, Error>>,  update_project_uri : this.txFromJson<Result<null, Error>>,  update_renderer_base : this.txFromJson<Result<null, Error>>,  update_contract_image : this.txFromJson<Result<null, Error>>,  delete_and_recreate_properties : this.txFromJson<Result<null, Error>>
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
   * Build a topics filter row for the "PropertiesReset" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  propertiesResetEventFilter(): string[] {
    return this.spec.eventTopicFilter("PropertiesReset");
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
   * Build a topics filter row for the "RoleGranted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  roleGrantedEventFilter(topicValues?: { role?: string; account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("RoleGranted", topicValues);
  }
  /**
   * Build a topics filter row for the "RoleRevoked" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  roleRevokedEventFilter(topicValues?: { role?: string; account?: string | Address }): string[] {
    return this.spec.eventTopicFilter("RoleRevoked", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminRenounced" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminRenouncedEventFilter(topicValues?: { admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminRenounced", topicValues);
  }
  /**
   * Build a topics filter row for the "RoleAdminChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  roleAdminChangedEventFilter(topicValues?: { role?: string }): string[] {
    return this.spec.eventTopicFilter("RoleAdminChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminTransferCompleted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminTransferCompletedEventFilter(topicValues?: { new_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminTransferCompleted", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminTransferInitiated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminTransferInitiatedEventFilter(topicValues?: { current_admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AdminTransferInitiated", topicValues);
  }
  /**
   * Build a topics filter row for the "OwnershipTransfer" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  ownershipTransferEventFilter(): string[] {
    return this.spec.eventTopicFilter("OwnershipTransfer");
  }
  /**
   * Build a topics filter row for the "OwnershipRenounced" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  ownershipRenouncedEventFilter(): string[] {
    return this.spec.eventTopicFilter("OwnershipRenounced");
  }
  /**
   * Build a topics filter row for the "OwnershipTransferCompleted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  ownershipTransferCompletedEventFilter(): string[] {
    return this.spec.eventTopicFilter("OwnershipTransferCompleted");
  }
}