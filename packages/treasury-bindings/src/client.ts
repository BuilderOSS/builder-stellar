import {ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Executes an approved proposal action on a target contract.
   *
   * This is the core function of the Treasury - it receives execution instructions
   * from the Governor and invokes the target contract with the Treasury's authority.
   * The Treasury authorizes itself as the caller, allowing the target to authenticate
   * the action as coming from the DAO.
   *
   * # Arguments
   *
   * * `target` - The contract address to invoke
   * * `function` - The function name to call on the target
   * * `args` - The arguments to pass to the function
   *
   * # Returns
   *
   * The return value from the target function invocation.
   *
   * # Authorization
   *
   * Requires authentication from the Governor contract. The Treasury then authorizes
   * itself when invoking the target, establishing a two-layer authorization chain:
   * Governor → Treasury → Target.
   *
   * # Security
   *
   * The authorization structure ensures:
   * - Only the Governor can trigger executions (prevents direct calls)
   * - The Treasury appears as the authenticated caller to targets (DAO authority)
   * - Sub-invocations can also use Treasury authority if
   */
  execute({ target, function_, args }: { target: string | Address; function_: string; args: Array<any> }, options?: MethodOptions): Promise<AssembledTransaction<any>>;
  /**
   * Returns the address of the authorized governor contract.
   *
   * # Returns
   *
   * The governor contract address.
   *
   * # Panics
   *
   * Panics if the governor is not set (should never happen after initialization).
   */
  governor(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Returns `Some(Address)` if ownership is set, or `None` if ownership has
   * been renounced.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   */
  get_owner(options?: MethodOptions): Promise<AssembledTransaction<string | null>>;
  /**
   * Updates the authorized governor contract address.
   *
   * Only the owner can call this function. This allows replacing a compromised
   * or upgraded Governor contract without losing Treasury assets or authority.
   *
   * # Arguments
   *
   * * `governor` - The new governor contract address
   *
   * # Authorization
   *
   * Requires owner authentication (enforced by `#[only_owner]` macro).
   *
   * # Events
   *
   * Emits a `GovernorChanged` event with old and new governor addresses.
   */
  set_governor({ governor }: { governor: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Accepts a pending ownership transfer.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * there is no pending transfer to accept.
   *
   * # Events
   *
   * * topics - `["ownership_transfer_completed"]`
   * * data - `[new_owner: Address]`
   */
  accept_ownership(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Renounces ownership of the contract.
   *
   * Permanently removes the owner, disabling all functions gated by
   * `#[only_owner]`.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   *
   * # Errors
   *
   * * [`OwnableError::TransferInProgress`] - If there is a pending ownership
   * transfer.
   * * [`OwnableError::OwnerNotSet`] - If the owner is not set.
   *
   * # Notes
   *
   * * Authorization for the current owner is required.
   */
  renounce_ownership(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Initiates a 2-step ownership transfer to a new address.
   *
   * Requires authorization from the current owner. The new owner must later
   * call `accept_ownership()` to complete the transfer.
   *
   * # Arguments
   *
   * * `e` - Access to the Soroban environment.
   * * `new_owner` - The proposed new owner.
   * * `live_until_ledger` - Ledger number until which the new owner can
   * accept. A value of `0` cancels any pending transfer.
   *
   * # Errors
   *
   * * [`OwnableError::OwnerNotSet`] - If the owner is not set.
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * trying to cancel a transfer that doesn't exist.
   * * [`crate::role_transfer::RoleTransferError::InvalidLiveUntilLedger`] -
   * If the specified ledger is in the past.
   * * [`crate::role_transfer::RoleTransferError::InvalidPendingAccount`] -
   * If the specified pending account is not the same as the provided `new`
   * address.
   *
   * # Notes
   *
   * * Authorization for the current owner is required.
   */
  transfer_ownership({ new_owner, live_until_ledger }: { new_owner: string | Address; live_until_ledger: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABQAAAAAAAAAAAAAAB0V4ZWN1dGUAAAAAAQAAAAdleGVjdXRlAAAAAAMAAAAAAAAACGdvdmVybm9yAAAAEwAAAAEAAAAAAAAABnRhcmdldAAAAAAAEwAAAAEAAAAAAAAACGZ1bmN0aW9uAAAAEQAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAD0dvdmVybm9yQ2hhbmdlZAAAAAABAAAAEGdvdmVybm9yX2NoYW5nZWQAAAACAAAAAAAAAAxvbGRfZ292ZXJub3IAAAATAAAAAQAAAAAAAAAMbmV3X2dvdmVybm9yAAAAEwAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAE1RyZWFzdXJ5SW5pdGlhbGl6ZWQAAAAAAQAAABR0cmVhc3VyeV9pbml0aWFsaXplZAAAAAIAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAAC", "AAAAAgAAALdTdG9yYWdlIGtleXMgZm9yIHRyZWFzdXJ5LXNwZWNpZmljIGluc3RhbmNlIGRhdGEuCgpUaGUgVHJlYXN1cnkgbWFpbnRhaW5zIG1pbmltYWwgc3RhdGUsIHN0b3Jpbmcgb25seSB0aGUgR292ZXJub3IgYWRkcmVzcy4KQWxsIG90aGVyIGRhdGEgKG93bmVyc2hpcCkgaXMgbWFuYWdlZCBieSB0aGUgT3duYWJsZSB0cmFpdC4AAAAAAAAAAAtUcmVhc3VyeUtleQAAAAABAAAAAAAAAKdBZGRyZXNzIG9mIHRoZSBHb3Zlcm5vciBjb250cmFjdCBhdXRob3JpemVkIHRvIGV4ZWN1dGUgcHJvcG9zYWxzLgoKT25seSB0aGlzIGNvbnRyYWN0IGNhbiBpbnZva2UgdGhlIGBleGVjdXRlKClgIGZ1bmN0aW9uLiBUaGUgb3duZXIKY2FuIHVwZGF0ZSB0aGlzIGFkZHJlc3MgaWYgbmVlZGVkLgAAAAAIR292ZXJub3I=", "AAAAAAAABABFeGVjdXRlcyBhbiBhcHByb3ZlZCBwcm9wb3NhbCBhY3Rpb24gb24gYSB0YXJnZXQgY29udHJhY3QuCgpUaGlzIGlzIHRoZSBjb3JlIGZ1bmN0aW9uIG9mIHRoZSBUcmVhc3VyeSAtIGl0IHJlY2VpdmVzIGV4ZWN1dGlvbiBpbnN0cnVjdGlvbnMKZnJvbSB0aGUgR292ZXJub3IgYW5kIGludm9rZXMgdGhlIHRhcmdldCBjb250cmFjdCB3aXRoIHRoZSBUcmVhc3VyeSdzIGF1dGhvcml0eS4KVGhlIFRyZWFzdXJ5IGF1dGhvcml6ZXMgaXRzZWxmIGFzIHRoZSBjYWxsZXIsIGFsbG93aW5nIHRoZSB0YXJnZXQgdG8gYXV0aGVudGljYXRlCnRoZSBhY3Rpb24gYXMgY29taW5nIGZyb20gdGhlIERBTy4KCiMgQXJndW1lbnRzCgoqIGB0YXJnZXRgIC0gVGhlIGNvbnRyYWN0IGFkZHJlc3MgdG8gaW52b2tlCiogYGZ1bmN0aW9uYCAtIFRoZSBmdW5jdGlvbiBuYW1lIHRvIGNhbGwgb24gdGhlIHRhcmdldAoqIGBhcmdzYCAtIFRoZSBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgZnVuY3Rpb24KCiMgUmV0dXJucwoKVGhlIHJldHVybiB2YWx1ZSBmcm9tIHRoZSB0YXJnZXQgZnVuY3Rpb24gaW52b2NhdGlvbi4KCiMgQXV0aG9yaXphdGlvbgoKUmVxdWlyZXMgYXV0aGVudGljYXRpb24gZnJvbSB0aGUgR292ZXJub3IgY29udHJhY3QuIFRoZSBUcmVhc3VyeSB0aGVuIGF1dGhvcml6ZXMKaXRzZWxmIHdoZW4gaW52b2tpbmcgdGhlIHRhcmdldCwgZXN0YWJsaXNoaW5nIGEgdHdvLWxheWVyIGF1dGhvcml6YXRpb24gY2hhaW46CkdvdmVybm9yIOKGkiBUcmVhc3VyeSDihpIgVGFyZ2V0LgoKIyBTZWN1cml0eQoKVGhlIGF1dGhvcml6YXRpb24gc3RydWN0dXJlIGVuc3VyZXM6Ci0gT25seSB0aGUgR292ZXJub3IgY2FuIHRyaWdnZXIgZXhlY3V0aW9ucyAocHJldmVudHMgZGlyZWN0IGNhbGxzKQotIFRoZSBUcmVhc3VyeSBhcHBlYXJzIGFzIHRoZSBhdXRoZW50aWNhdGVkIGNhbGxlciB0byB0YXJnZXRzIChEQU8gYXV0aG9yaXR5KQotIFN1Yi1pbnZvY2F0aW9ucyBjYW4gYWxzbyB1c2UgVHJlYXN1cnkgYXV0aG9yaXR5IGlmAAAAB2V4ZWN1dGUAAAAAAwAAAAAAAAAGdGFyZ2V0AAAAAAATAAAAAAAAAAhmdW5jdGlvbgAAABEAAAAAAAAABGFyZ3MAAAPqAAAAAAAAAAEAAAAA", "AAAAAAAAALxSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBhdXRob3JpemVkIGdvdmVybm9yIGNvbnRyYWN0LgoKIyBSZXR1cm5zCgpUaGUgZ292ZXJub3IgY29udHJhY3QgYWRkcmVzcy4KCiMgUGFuaWNzCgpQYW5pY3MgaWYgdGhlIGdvdmVybm9yIGlzIG5vdCBzZXQgKHNob3VsZCBuZXZlciBoYXBwZW4gYWZ0ZXIgaW5pdGlhbGl6YXRpb24pLgAAAAhnb3Zlcm5vcgAAAAAAAAABAAAAEw==", "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAAaxVcGRhdGVzIHRoZSBhdXRob3JpemVkIGdvdmVybm9yIGNvbnRyYWN0IGFkZHJlc3MuCgpPbmx5IHRoZSBvd25lciBjYW4gY2FsbCB0aGlzIGZ1bmN0aW9uLiBUaGlzIGFsbG93cyByZXBsYWNpbmcgYSBjb21wcm9taXNlZApvciB1cGdyYWRlZCBHb3Zlcm5vciBjb250cmFjdCB3aXRob3V0IGxvc2luZyBUcmVhc3VyeSBhc3NldHMgb3IgYXV0aG9yaXR5LgoKIyBBcmd1bWVudHMKCiogYGdvdmVybm9yYCAtIFRoZSBuZXcgZ292ZXJub3IgY29udHJhY3QgYWRkcmVzcwoKIyBBdXRob3JpemF0aW9uCgpSZXF1aXJlcyBvd25lciBhdXRoZW50aWNhdGlvbiAoZW5mb3JjZWQgYnkgYCNbb25seV9vd25lcl1gIG1hY3JvKS4KCiMgRXZlbnRzCgpFbWl0cyBhIGBHb3Zlcm5vckNoYW5nZWRgIGV2ZW50IHdpdGggb2xkIGFuZCBuZXcgZ292ZXJub3IgYWRkcmVzc2VzLgAAAAxzZXRfZ292ZXJub3IAAAABAAAAAAAAAAhnb3Zlcm5vcgAAABMAAAAA", "AAAAAAAAASRJbml0aWFsaXplcyB0aGUgdHJlYXN1cnkgY29udHJhY3Qgd2l0aCBhbiBvd25lciBhbmQgZ292ZXJub3IuCgojIEFyZ3VtZW50cwoKKiBgb3duZXJgIC0gVGhlIGFkZHJlc3MgdGhhdCB3aWxsIG93biBhbmQgY29udHJvbCB0aGUgY29udHJhY3QKKiBgZ292ZXJub3JgIC0gVGhlIGdvdmVybmFuY2UgY29udHJhY3QgYXV0aG9yaXplZCB0byBleGVjdXRlIHByb3Bvc2FscwoKIyBFdmVudHMKCkVtaXRzIGEgYFRyZWFzdXJ5SW5pdGlhbGl6ZWRgIGV2ZW50IHdpdGggdGhlIGluaXRpYWxpemF0aW9uIHBhcmFtZXRlcnMuAAAADV9fY29uc3RydWN0b3IAAAAAAAACAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAACGdvdmVybm9yAAAAEwAAAAA=", "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==", "AAAAAAAAAYVSZW5vdW5jZXMgb3duZXJzaGlwIG9mIHRoZSBjb250cmFjdC4KClBlcm1hbmVudGx5IHJlbW92ZXMgdGhlIG93bmVyLCBkaXNhYmxpbmcgYWxsIGZ1bmN0aW9ucyBnYXRlZCBieQpgI1tvbmx5X293bmVyXWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYE93bmFibGVFcnJvcjo6VHJhbnNmZXJJblByb2dyZXNzYF0gLSBJZiB0aGVyZSBpcyBhIHBlbmRpbmcgb3duZXJzaGlwCnRyYW5zZmVyLgoqIFtgT3duYWJsZUVycm9yOjpPd25lck5vdFNldGBdIC0gSWYgdGhlIG93bmVyIGlzIG5vdCBzZXQuCgojIE5vdGVzCgoqIEF1dGhvcml6YXRpb24gZm9yIHRoZSBjdXJyZW50IG93bmVyIGlzIHJlcXVpcmVkLgAAAAAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA", "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA", "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==", "AAAAAQAAAEhTdG9yZXMgdGhlIHBlbmRpbmcgcm9sZSBob2xkZXIgYW5kIHRoZSBleHBsaWNpdCBkZWFkbGluZSBmb3IgYWNjZXB0YW5jZS4AAAAAAAAAD1BlbmRpbmdUcmFuc2ZlcgAAAAACAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABA==", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIGdyYW50ZWQuAAAAAAAAAAAAAAtSb2xlR3JhbnRlZAAAAAABAAAADHJvbGVfZ3JhbnRlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=", "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIHJldm9rZWQuAAAAAAAAAAAAAAtSb2xlUmV2b2tlZAAAAAABAAAADHJvbGVfcmV2b2tlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=", "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIGFkbWluIHJvbGUgaXMgcmVub3VuY2VkLgAAAAAAAAAADkFkbWluUmVub3VuY2VkAAAAAAABAAAAD2FkbWluX3Jlbm91bmNlZAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAg==", "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGFkbWluIGlzIGNoYW5nZWQuAAAAAAAAAAAQUm9sZUFkbWluQ2hhbmdlZAAAAAEAAAAScm9sZV9hZG1pbl9jaGFuZ2VkAAAAAAADAAAAAAAAAARyb2xlAAAAEQAAAAEAAAAAAAAAE3ByZXZpb3VzX2FkbWluX3JvbGUAAAAAEQAAAAAAAAAAAAAADm5ld19hZG1pbl9yb2xlAAAAAAARAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAAEkFjY2Vzc0NvbnRyb2xFcnJvcgAAAAAACwAAAAAAAAAMVW5hdXRob3JpemVkAAAH0AAAAAAAAAALQWRtaW5Ob3RTZXQAAAAH0QAAAAAAAAAQSW5kZXhPdXRPZkJvdW5kcwAAB9IAAAAAAAAAEUFkbWluUm9sZU5vdEZvdW5kAAAAAAAH0wAAAAAAAAASUm9sZUNvdW50SXNOb3RaZXJvAAAAAAfUAAAAAAAAAAxSb2xlTm90Rm91bmQAAAfVAAAAAAAAAA9BZG1pbkFscmVhZHlTZXQAAAAH1gAAAAAAAAALUm9sZU5vdEhlbGQAAAAH1wAAAAAAAAALUm9sZUlzRW1wdHkAAAAH2AAAAAAAAAASVHJhbnNmZXJJblByb2dyZXNzAAAAAAfZAAAAAAAAABBNYXhSb2xlc0V4Y2VlZGVkAAAH2g==", "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgY29tcGxldGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVyQ29tcGxldGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAIAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAAAAAAAA5wcmV2aW91c19hZG1pbgAAAAAAEwAAAAAAAAAC", "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgaW5pdGlhdGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVySW5pdGlhdGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2luaXRpYXRlZAAAAAMAAAAAAAAADWN1cnJlbnRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC", "AAAAAQAAADFTdG9yYWdlIGtleSBmb3IgZW51bWVyYXRpb24gb2YgYWNjb3VudHMgcGVyIHJvbGUuAAAAAAAAAAAAAA5Sb2xlQWNjb3VudEtleQAAAAAAAgAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAARyb2xlAAAAEQ==", "AAAAAgAAADxTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgYWNjZXNzIGNvbnRyb2wAAAAAAAAAF0FjY2Vzc0NvbnRyb2xTdG9yYWdlS2V5AAAAAAcAAAAAAAAAAAAAAA1FeGlzdGluZ1JvbGVzAAAAAAAAAQAAAAAAAAAMUm9sZUFjY291bnRzAAAAAQAAB9AAAAAOUm9sZUFjY291bnRLZXkAAAAAAAEAAAAAAAAAB0hhc1JvbGUAAAAAAgAAABMAAAARAAAAAQAAAAAAAAARUm9sZUFjY291bnRzQ291bnQAAAAAAAABAAAAEQAAAAEAAAAAAAAACVJvbGVBZG1pbgAAAAAAAAEAAAARAAAAAAAAAAAAAAAFQWRtaW4AAAAAAAAAAAAAAAAAAAxQZW5kaW5nQWRtaW4=", "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==", "AAAAAgAAACNTdG9yYWdlIGtleXMgZm9yIGBPd25hYmxlYCB1dGlsaXR5LgAAAAAAAAAAEU93bmFibGVTdG9yYWdlS2V5AAAAAAAAAgAAAAAAAAAAAAAABU93bmVyAAAAAAAAAAAAAAAAAAAMUGVuZGluZ093bmVy", "AAAAAgAAAONDb250ZXh0IG9mIGEgc2luZ2xlIGF1dGhvcml6ZWQgY2FsbCBwZXJmb3JtZWQgYnkgYW4gYWRkcmVzcy4KCkN1c3RvbSBhY2NvdW50IGNvbnRyYWN0cyB0aGF0IGltcGxlbWVudCBgX19jaGVja19hdXRoYCBzcGVjaWFsIGZ1bmN0aW9uCnJlY2VpdmUgYSBsaXN0IG9mIGBDb250ZXh0YCB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byBhbGwgdGhlIGNhbGxzIHRoYXQKbmVlZCB0byBiZSBhdXRob3JpemVkLgAAAAAAAAAAB0NvbnRleHQAAAAAAwAAAAEAAAAUQ29udHJhY3QgaW52b2NhdGlvbi4AAAAIQ29udHJhY3QAAAABAAAH0AAAAA9Db250cmFjdENvbnRleHQAAAAAAQAAAD1Db250cmFjdCB0aGF0IGhhcyBhIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIGlzIGNyZWF0ZWQuAAAAAAAAFENyZWF0ZUNvbnRyYWN0SG9zdEZuAAAAAQAAB9AAAAAbQ3JlYXRlQ29udHJhY3RIb3N0Rm5Db250ZXh0AAAAAAEAAABEQ29udHJhY3QgdGhhdCBoYXMgYSBjb25zdHJ1Y3RvciB3aXRoIDEgb3IgbW9yZSBhcmd1bWVudHMgaXMgY3JlYXRlZC4AAAAcQ3JlYXRlQ29udHJhY3RXaXRoQ3Rvckhvc3RGbgAAAAEAAAfQAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAA", "AAAAAQAAAL1BdXRob3JpemF0aW9uIGNvbnRleHQgb2YgYSBzaW5nbGUgY29udHJhY3QgY2FsbC4KClRoaXMgc3RydWN0IGNvcnJlc3BvbmRzIHRvIGEgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgY2FsbCBmb3IgYW4gYWRkcmVzcwpmcm9tIGBjb250cmFjdGAgZnVuY3Rpb24gd2l0aCBgZm5fbmFtZWAgbmFtZSBhbmQgYGFyZ3NgIGFyZ3VtZW50cy4AAAAAAAAAAAAAD0NvbnRyYWN0Q29udGV4dAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAHZm5fbmFtZQAAAAAR", "AAAAAgAAAF9Db250cmFjdCBleGVjdXRhYmxlIHVzZWQgZm9yIGNyZWF0aW5nIGEgbmV3IGNvbnRyYWN0IGFuZCB1c2VkIGluCmBDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHRgLgAAAAAAAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAQAAAAEAAAAAAAAABFdhc20AAAABAAAD7gAAACA=", "AAAAAQAAADhWYWx1ZSBvZiBjb250cmFjdCBub2RlIGluIEludm9rZXJDb250cmFjdEF1dGhFbnRyeSB0cmVlLgAAAAAAAAAVU3ViQ29udHJhY3RJbnZvY2F0aW9uAAAAAAAAAgAAAAAAAAAHY29udGV4dAAAAAfQAAAAD0NvbnRyYWN0Q29udGV4dAAAAAAAAAAAD3N1Yl9pbnZvY2F0aW9ucwAAAAPqAAAH0AAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnk=", "AAAAAgAAAS9BIG5vZGUgaW4gdGhlIHRyZWUgb2YgYXV0aG9yaXphdGlvbnMgcGVyZm9ybWVkIG9uIGJlaGFsZiBvZiB0aGUgY3VycmVudApjb250cmFjdCBhcyBpbnZva2VyIG9mIHRoZSBjb250cmFjdHMgZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrLgoKVGhpcyBpcyB1c2VkIGFzIGFuIGFyZ3VtZW50IG9mIGBhdXRob3JpemVfYXNfY3VycmVudF9jb250cmFjdGAgaG9zdCBmdW5jdGlvbi4KClRoaXMgdHJlZSBjb3JyZXNwb25kcyBgcmVxdWlyZV9hdXRoW19mb3JfYXJnc11gIGNhbGxzIG9uIGJlaGFsZiBvZiB0aGUKY3VycmVudCBjb250cmFjdC4AAAAAAAAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnkAAAADAAAAAQAAABJJbnZva2UgYSBjb250cmFjdC4AAAAAAAhDb250cmFjdAAAAAEAAAfQAAAAFVN1YkNvbnRyYWN0SW52b2NhdGlvbgAAAAAAAAEAAAA1Q3JlYXRlIGEgY29udHJhY3QgcGFzc2luZyAwIGFyZ3VtZW50cyB0byBjb25zdHJ1Y3Rvci4AAAAAAAAUQ3JlYXRlQ29udHJhY3RIb3N0Rm4AAAABAAAH0AAAABtDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHQAAAAAAQAAAD1DcmVhdGUgYSBjb250cmFjdCBwYXNzaW5nIDAgb3IgbW9yZSBhcmd1bWVudHMgdG8gY29uc3RydWN0b3IuAAAAAAAAHENyZWF0ZUNvbnRyYWN0V2l0aEN0b3JIb3N0Rm4AAAABAAAH0AAAACpDcmVhdGVDb250cmFjdFdpdGhDb25zdHJ1Y3Rvckhvc3RGbkNvbnRleHQAAA==", "AAAAAQAAAHZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuAAAAAAAAAAAAG0NyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dAAAAAACAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAQAAANZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuClRoaXMgaXMgdGhlIHNhbWUgYXMgYENyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dGAsIGJ1dCBhbHNvIGhhcwpjb250cmFjdCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAAAAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAAAAAAAwAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAgAAAAAAAAAAAAAACkV4ZWN1dGFibGUAAAAAAAMAAAABAAAAAAAAAARXYXNtAAAAAQAAA+4AAAAgAAAAAAAAAAAAAAAMU3RlbGxhckFzc2V0AAAAAAAAAAAAAAAHQWNjb3VudAA="]),
      options
    );
  }

   static deploy<T = Client>({ owner, governor }: { owner: string | Address; governor: string | Address }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ owner, governor }, options);
  }
  public readonly fromJson = {
    execute : this.txFromJson<any>,  governor : this.txFromJson<string>,  get_owner : this.txFromJson<string | null>,  set_governor : this.txFromJson<void>,  accept_ownership : this.txFromJson<void>,  renounce_ownership : this.txFromJson<void>,  transfer_ownership : this.txFromJson<void>
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
   * Build a topics filter row for the "Execute" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  executeEventFilter(topicValues?: { governor?: string | Address; target?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Execute", topicValues);
  }
  /**
   * Build a topics filter row for the "GovernorChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  governorChangedEventFilter(topicValues?: { old_governor?: string | Address; new_governor?: string | Address }): string[] {
    return this.spec.eventTopicFilter("GovernorChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "TreasuryInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  treasuryInitializedEventFilter(topicValues?: { owner?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TreasuryInitialized", topicValues);
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