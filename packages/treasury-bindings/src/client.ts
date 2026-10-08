import {ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * Sets the owner to `treasury` (which is this contract's own address in the
   * Manager flow), clears any pending two-step ownership transfer, marks the
   * module live, and emits `Launched`. A second call panics with `AlreadyLive`.
   */
  launch({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Executes a queued proposal. The Treasury is the top-level executor.
   *
   * Anyone may call this; authority comes from the Governor's approval.
   *
   * 1. `governor.consume(...)` (a returning call) checks the proposal is
   * Queued, past its ETA and unexpired, marks it Executed, and returns the
   * proposal id. The Governor requires the Treasury's auth, which the
   * Treasury grants for exactly that call. The Governor is no longer on
   * the call stack afterwards, so targets may call the Governor's owner
   * setters (Soroban forbids re-entry).
   * 2. Each call is dispatched in order. Calls whose target is this contract
   * go through the internal allowlist `self_dispatch` (never
   * `invoke_contract`, which would be a forbidden re-entry); any other
   * target is invoked with the Treasury authorizing exactly that call.
   *
   * Any failing call reverts the whole transaction, including the Executed
   * mark, so the proposal stays Queued and can be retried until it expires.
   *
   * Resource impact: one extra cross-contract call (`consume`) and one
   * persistent write in the Governor
   */
  execute({ targets, functions, args, description_hash }: { targets: Array<string | Address>; functions: Array<string>; args: Array<Array<any>>; description_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Setup-phase upgrade by the launch admin. After launch the owner is the
   * Treasury itself, whose auth nobody can produce externally, so this is
   * dead after launch; governance upgrades go through `execute` ->
   * `self_dispatch("upgrade")`.
   */
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Returns the address of the authorized governor contract.
   *
   * # Returns
   *
   * The governor contract address.
   *
   * # Panics
   *
   * Aborts with `CommonError::GovernorNotSet` if the governor is not set (should
   * never happen after construction).
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
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Setup-phase only in practice, see `upgrade`.
   */
  sync_version(options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
      new Spec(["AAAABAAAAAAAAAAAAAAADVRyZWFzdXJ5RXJyb3IAAAAAAAAEAAAAOWBsYXVuY2hgIHRyZWFzdXJ5IGFyZ3VtZW50IGlzIG5vdCB0aGlzIGNvbnRyYWN0J3MgYWRkcmVzcwAAAAAAABBUcmVhc3VyeU1pc21hdGNoAAAFeQAAAEZBIHByb3Bvc2FsIHRhcmdldGVkIHRoZSBUcmVhc3VyeSB3aXRoIGEgZnVuY3Rpb24gb3V0c2lkZSB0aGUgYWxsb3dsaXN0AAAAAAAPVW5rbm93blNlbGZDYWxsAAAABXoAAAAwTWFsZm9ybWVkIGFyZ3VtZW50cyBmb3IgYW4gYWxsb3dsaXN0ZWQgc2VsZiBjYWxsAAAAE0ludmFsaWRTZWxmQ2FsbEFyZ3MAAAAFewAAACV0YXJnZXRzL2Z1bmN0aW9ucy9hcmdzIGxlbmd0aHMgZGlmZmVyAAAAAAAAFUludmFsaWRQcm9wb3NhbExlbmd0aAAAAAAABXw=", "AAAABQAAAAAAAAAAAAAAB0V4ZWN1dGUAAAAAAQAAAAdleGVjdXRlAAAAAAUAAAAAAAAACGdvdmVybm9yAAAAEwAAAAEAAAAAAAAABnRhcmdldAAAAAAAEwAAAAEAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAIZnVuY3Rpb24AAAARAAAAAAAAAClQb3NpdGlvbiBvZiB0aGUgY2FsbCB3aXRoaW4gdGhlIHByb3Bvc2FsLgAAAAAAAAVpbmRleAAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAAERFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgdHJlYXN1cnkgKFNldHVwIC0+IExpdmUpLgAAAAAAAAAITGF1bmNoZWQAAAABAAAACGxhdW5jaGVkAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAAE1RyZWFzdXJ5SW5pdGlhbGl6ZWQAAAAAAQAAABR0cmVhc3VyeV9pbml0aWFsaXplZAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAC", "AAAAAAAAARZPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KClNldHMgdGhlIG93bmVyIHRvIGB0cmVhc3VyeWAgKHdoaWNoIGlzIHRoaXMgY29udHJhY3QncyBvd24gYWRkcmVzcyBpbiB0aGUKTWFuYWdlciBmbG93KSwgY2xlYXJzIGFueSBwZW5kaW5nIHR3by1zdGVwIG93bmVyc2hpcCB0cmFuc2ZlciwgbWFya3MgdGhlCm1vZHVsZSBsaXZlLCBhbmQgZW1pdHMgYExhdW5jaGVkYC4gQSBzZWNvbmQgY2FsbCBwYW5pY3Mgd2l0aCBgQWxyZWFkeUxpdmVgLgAAAAAABmxhdW5jaAAAAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAA==", "AAAAAAAABABFeGVjdXRlcyBhIHF1ZXVlZCBwcm9wb3NhbC4gVGhlIFRyZWFzdXJ5IGlzIHRoZSB0b3AtbGV2ZWwgZXhlY3V0b3IuCgpBbnlvbmUgbWF5IGNhbGwgdGhpczsgYXV0aG9yaXR5IGNvbWVzIGZyb20gdGhlIEdvdmVybm9yJ3MgYXBwcm92YWwuCgoxLiBgZ292ZXJub3IuY29uc3VtZSguLi4pYCAoYSByZXR1cm5pbmcgY2FsbCkgY2hlY2tzIHRoZSBwcm9wb3NhbCBpcwpRdWV1ZWQsIHBhc3QgaXRzIEVUQSBhbmQgdW5leHBpcmVkLCBtYXJrcyBpdCBFeGVjdXRlZCwgYW5kIHJldHVybnMgdGhlCnByb3Bvc2FsIGlkLiBUaGUgR292ZXJub3IgcmVxdWlyZXMgdGhlIFRyZWFzdXJ5J3MgYXV0aCwgd2hpY2ggdGhlClRyZWFzdXJ5IGdyYW50cyBmb3IgZXhhY3RseSB0aGF0IGNhbGwuIFRoZSBHb3Zlcm5vciBpcyBubyBsb25nZXIgb24KdGhlIGNhbGwgc3RhY2sgYWZ0ZXJ3YXJkcywgc28gdGFyZ2V0cyBtYXkgY2FsbCB0aGUgR292ZXJub3IncyBvd25lcgpzZXR0ZXJzIChTb3JvYmFuIGZvcmJpZHMgcmUtZW50cnkpLgoyLiBFYWNoIGNhbGwgaXMgZGlzcGF0Y2hlZCBpbiBvcmRlci4gQ2FsbHMgd2hvc2UgdGFyZ2V0IGlzIHRoaXMgY29udHJhY3QKZ28gdGhyb3VnaCB0aGUgaW50ZXJuYWwgYWxsb3dsaXN0IGBzZWxmX2Rpc3BhdGNoYCAobmV2ZXIKYGludm9rZV9jb250cmFjdGAsIHdoaWNoIHdvdWxkIGJlIGEgZm9yYmlkZGVuIHJlLWVudHJ5KTsgYW55IG90aGVyCnRhcmdldCBpcyBpbnZva2VkIHdpdGggdGhlIFRyZWFzdXJ5IGF1dGhvcml6aW5nIGV4YWN0bHkgdGhhdCBjYWxsLgoKQW55IGZhaWxpbmcgY2FsbCByZXZlcnRzIHRoZSB3aG9sZSB0cmFuc2FjdGlvbiwgaW5jbHVkaW5nIHRoZSBFeGVjdXRlZAptYXJrLCBzbyB0aGUgcHJvcG9zYWwgc3RheXMgUXVldWVkIGFuZCBjYW4gYmUgcmV0cmllZCB1bnRpbCBpdCBleHBpcmVzLgoKUmVzb3VyY2UgaW1wYWN0OiBvbmUgZXh0cmEgY3Jvc3MtY29udHJhY3QgY2FsbCAoYGNvbnN1bWVgKSBhbmQgb25lCnBlcnNpc3RlbnQgd3JpdGUgaW4gdGhlIEdvdmVybm9yAAAAB2V4ZWN1dGUAAAAABAAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAJZnVuY3Rpb25zAAAAAAAD6gAAABEAAAAAAAAABGFyZ3MAAAPqAAAD6gAAAAAAAAAAAAAAEGRlc2NyaXB0aW9uX2hhc2gAAAPuAAAAIAAAAAEAAAPuAAAAIA==", "AAAAAAAAAOdTZXR1cC1waGFzZSB1cGdyYWRlIGJ5IHRoZSBsYXVuY2ggYWRtaW4uIEFmdGVyIGxhdW5jaCB0aGUgb3duZXIgaXMgdGhlClRyZWFzdXJ5IGl0c2VsZiwgd2hvc2UgYXV0aCBub2JvZHkgY2FuIHByb2R1Y2UgZXh0ZXJuYWxseSwgc28gdGhpcyBpcwpkZWFkIGFmdGVyIGxhdW5jaDsgZ292ZXJuYW5jZSB1cGdyYWRlcyBnbyB0aHJvdWdoIGBleGVjdXRlYCAtPgpgc2VsZl9kaXNwYXRjaCgidXBncmFkZSIpYC4AAAAAB3VwZ3JhZGUAAAAAAgAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAAA", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAAN1SZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBhdXRob3JpemVkIGdvdmVybm9yIGNvbnRyYWN0LgoKIyBSZXR1cm5zCgpUaGUgZ292ZXJub3IgY29udHJhY3QgYWRkcmVzcy4KCiMgUGFuaWNzCgpBYm9ydHMgd2l0aCBgQ29tbW9uRXJyb3I6OkdvdmVybm9yTm90U2V0YCBpZiB0aGUgZ292ZXJub3IgaXMgbm90IHNldCAoc2hvdWxkCm5ldmVyIGhhcHBlbiBhZnRlciBjb25zdHJ1Y3Rpb24pLgAAAAAAAAhnb3Zlcm5vcgAAAAAAAAABAAAAEw==", "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAACxTZXR1cC1waGFzZSBvbmx5IGluIHByYWN0aWNlLCBzZWUgYHVwZ3JhZGVgLgAAAAxzeW5jX3ZlcnNpb24AAAAAAAAAAA==", "AAAAAAAAASRJbml0aWFsaXplcyB0aGUgdHJlYXN1cnkgY29udHJhY3Qgd2l0aCBhbiBvd25lciBhbmQgZ292ZXJub3IuCgojIEFyZ3VtZW50cwoKKiBgb3duZXJgIC0gVGhlIGFkZHJlc3MgdGhhdCB3aWxsIG93biBhbmQgY29udHJvbCB0aGUgY29udHJhY3QKKiBgZ292ZXJub3JgIC0gVGhlIGdvdmVybmFuY2UgY29udHJhY3QgYXV0aG9yaXplZCB0byBleGVjdXRlIHByb3Bvc2FscwoKIyBFdmVudHMKCkVtaXRzIGEgYFRyZWFzdXJ5SW5pdGlhbGl6ZWRgIGV2ZW50IHdpdGggdGhlIGluaXRpYWxpemF0aW9uIHBhcmFtZXRlcnMuAAAADV9fY29uc3RydWN0b3IAAAAAAAAFAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAACGdvdmVybm9yAAAAEwAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAA==", "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==", "AAAAAAAAAYVSZW5vdW5jZXMgb3duZXJzaGlwIG9mIHRoZSBjb250cmFjdC4KClBlcm1hbmVudGx5IHJlbW92ZXMgdGhlIG93bmVyLCBkaXNhYmxpbmcgYWxsIGZ1bmN0aW9ucyBnYXRlZCBieQpgI1tvbmx5X293bmVyXWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYE93bmFibGVFcnJvcjo6VHJhbnNmZXJJblByb2dyZXNzYF0gLSBJZiB0aGVyZSBpcyBhIHBlbmRpbmcgb3duZXJzaGlwCnRyYW5zZmVyLgoqIFtgT3duYWJsZUVycm9yOjpPd25lck5vdFNldGBdIC0gSWYgdGhlIG93bmVyIGlzIG5vdCBzZXQuCgojIE5vdGVzCgoqIEF1dGhvcml6YXRpb24gZm9yIHRoZSBjdXJyZW50IG93bmVyIGlzIHJlcXVpcmVkLgAAAAAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA", "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA", "AAAABAAAAJFFcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzLiBDb2RlcyBsaXZlIGluIHRoZSA5MDAwIHJhbmdlIHNvCnRoZXkgbmV2ZXIgY29sbGlkZSB3aXRoIG1vZHVsZSAoMTF4eC0xM3h4LCAzLCAzMCkgb3IgbWFuYWdlciAoMTB4eCkgY29kZXMuAAAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAALAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAACMpAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAIyoAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAjKwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAACMsAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAjLQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAIy4AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAjLwAAABtPd25lciBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAC093bmVyTm90U2V0AAAAIzAAAAAmYEN1cnJlbnRWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA1WZXJzaW9uTm90U2V0AAAAAAAjMQAAACZUcmVhc3VyeSBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADlRyZWFzdXJ5Tm90U2V0AAAAACMyAAAAJkdvdmVybm9yIGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOR292ZXJub3JOb3RTZXQAAAAAIzM=", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAABpFbWl0dGVkIGJ5IGBzeW5jX3ZlcnNpb25gLgAAAAAAAAAAAA1WZXJzaW9uU3luY2VkAAAAAAAAAQAAAA52ZXJzaW9uX3N5bmNlZAAAAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==", "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg=="]),
      options
    );
  }

   static deploy<T = Client>({ owner, governor, manager, current_hash, version }: { owner: string | Address; governor: string | Address; manager: string | Address; current_hash: Uint8Array; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ owner, governor, manager, current_hash, version }, options);
  }
  public readonly fromJson = {
    launch : this.txFromJson<void>,  execute : this.txFromJson<Uint8Array>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  governor : this.txFromJson<string>,  get_owner : this.txFromJson<string | null>,  wasm_hash : this.txFromJson<Uint8Array>,  sync_version : this.txFromJson<void>,  accept_ownership : this.txFromJson<void>,  renounce_ownership : this.txFromJson<void>,  transfer_ownership : this.txFromJson<void>
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
  executeEventFilter(topicValues?: { governor?: string | Address; target?: string | Address; proposal_id?: Uint8Array }): string[] {
    return this.spec.eventTopicFilter("Execute", topicValues);
  }
  /**
   * Build a topics filter row for the "Launched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  launchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Launched", topicValues);
  }
  /**
   * Build a topics filter row for the "TreasuryInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  treasuryInitializedEventFilter(topicValues?: { owner?: string | Address }): string[] {
    return this.spec.eventTopicFilter("TreasuryInitialized", topicValues);
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