import {AuctionConfig, AuctionState, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  pause({ caller }: { caller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * Marks the module live first, then hands ownership to `treasury` (clearing
   * any pending two-step transfer) and, when `start` is true, unpauses and
   * creates the first auction (the token must already be live so the auction
   * holds mint authority). Panics `PaymentTokenMismatch` if the configured
   * payment token differs from `expected_payment_token`. A second call panics with `AlreadyLive`.
   */
  launch({ treasury, start, expected_payment_token }: { treasury: string | Address; start: boolean; expected_payment_token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns true if the contract is paused, and false otherwise.
   *
   * # Arguments
   *
   * * `e` - Access to Soroban environment.
   */
  paused(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  unpause({ caller }: { caller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
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
  create_bid({ bidder, token_id, amount }: { bidder: string | Address; token_id: bigint; amount: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  get_config(options?: MethodOptions): Promise<AssembledTransaction<AuctionConfig>>;
  get_auction(options?: MethodOptions): Promise<AssembledTransaction<AuctionState>>;
  set_duration({ duration }: { duration: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  sync_version(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Cancel the current auction and refund the highest bidder (owner only, when paused)
   * This allows the owner to cancel an auction in emergency situations
   */
  cancel_auction(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  pending_refund({ bidder }: { bidder: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  settle_auction(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  set_time_buffer({ time_buffer }: { time_buffer: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  withdraw_refund({ bidder }: { bidder: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
  set_payment_token({ payment_token }: { payment_token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  set_reserve_price({ reserve_price }: { reserve_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
  set_min_bid_increment({ min_bid_increment_percent }: { min_bid_increment_percent: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * DESIGN NOTE: settle_and_create_new is intentionally permissionless.
   * Anyone can call this after an auction ends to settle it and create the next one.
   * This is a deliberate design choice to ensure auctions continue automatically.
   * The only griefing vector is settling at exact end time, which is minimal impact.
   */
  settle_and_create_new(options?: MethodOptions): Promise<AssembledTransaction<void>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAAAAAAAAAAAADEF1Y3Rpb25FcnJvcgAAABEAAAAhQmlkIHBsYWNlZCBmb3IgaW5jb3JyZWN0IHRva2VuIElEAAAAAAAADkludmFsaWRUb2tlbklkAAAAAASxAAAAHkJpZCBwbGFjZWQgYWZ0ZXIgYXVjdGlvbiBlbmRlZAAAAAAAC0F1Y3Rpb25PdmVyAAAABLIAAAAaQXVjdGlvbiBoYXNuJ3Qgc3RhcnRlZCB5ZXQAAAAAABFBdWN0aW9uTm90U3RhcnRlZAAAAAAABLMAAAAmQXR0ZW1wdGluZyB0byBzZXR0bGUgYW4gYWN0aXZlIGF1Y3Rpb24AAAAAAA1BdWN0aW9uQWN0aXZlAAAAAAAEtAAAABdBdWN0aW9uIGFscmVhZHkgc2V0dGxlZAAAAAAOQXVjdGlvblNldHRsZWQAAAAABLUAAAAkRmlyc3QgYmlkIGRvZXNuJ3QgbWVldCByZXNlcnZlIHByaWNlAAAAElJlc2VydmVQcmljZU5vdE1ldAAAAAAEtgAAACJCaWQgZG9lc24ndCBtZWV0IG1pbmltdW0gaW5jcmVtZW50AAAAAAAMTWluQmlkTm90TWV0AAAEtwAAAE1JbnZhbGlkIGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVycyAoZS5nLiwgZHVyYXRpb24gPCA1IG1pbnV0ZXMsIHplcm8gaW5jcmVtZW50KQAAAAAAAA1JbnZhbGlkQ29uZmlnAAAAAAAEuAAAABhBdWN0aW9uIG5vdCBsYXVuY2hlZCB5ZXQAAAALTm90TGF1bmNoZWQAAAAEvAAAABNVbmF1dGhvcml6ZWQgYWNjZXNzAAAAAAxVbmF1dGhvcml6ZWQAAAS+AAAAI0FyaXRobWV0aWMgb3ZlcmZsb3cgaW4gY2FsY3VsYXRpb25zAAAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAABL8AAAAsSW52YWxpZCBiaWQgYW1vdW50ICh0b28gbG93IG9yIHVucmVhc29uYWJsZSkAAAAKSW52YWxpZEJpZAAAAAAEwAAAACFDb250cmFjdCBub3QgaW5pdGlhbGl6ZWQgcHJvcGVybHkAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAABMMAAABBYGxhdW5jaGAgdHJlYXN1cnkgZGlmZmVycyBmcm9tIHRoZSB0cmVhc3VyeSB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24AAAAAAAAQVHJlYXN1cnlNaXNtYXRjaAAABMYAAAA/YGxhdW5jaGAgZXhwZWN0ZWQgcGF5bWVudCB0b2tlbiBkaWZmZXJzIGZyb20gdGhlIGNvbmZpZ3VyZWQgb25lAAAAABRQYXltZW50VG9rZW5NaXNtYXRjaAAABMcAAAA3YHdpdGhkcmF3X3JlZnVuZGAgY2FsbGVkIHdpdGggbm8gcGVuZGluZyByZWZ1bmQgYmFsYW5jZQAAAAAPTm9QZW5kaW5nUmVmdW5kAAAABMgAAAAxYHNldF90aW1lX2J1ZmZlcmAgdmFsdWUgb3V0c2lkZSAxLi49ODY0MDAgc2Vjb25kcwAAAAAAABFJbnZhbGlkVGltZUJ1ZmZlcgAAAAAABMk=", "AAAABQAAAENFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgYXVjdGlvbiAoU2V0dXAgLT4gTGl2ZSkuAAAAAAAAAAAITGF1bmNoZWQAAAABAAAACGxhdW5jaGVkAAAAAgAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAQAAAD9XaGV0aGVyIHRoZSBhdWN0aW9uIHdhcyB1bnBhdXNlZCBhbmQgdGhlIGZpcnN0IGF1Y3Rpb24gY3JlYXRlZC4AAAAAB3N0YXJ0ZWQAAAAAAQAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAACUJpZFBsYWNlZAAAAAAAAAEAAAAKYmlkX3BsYWNlZAAAAAAABQAAAAAAAAAIdG9rZW5faWQAAAAKAAAAAQAAAAAAAAAGYmlkZGVyAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAIZXh0ZW5kZWQAAAABAAAAAAAAAAAAAAAMbmV3X2VuZF90aW1lAAAABgAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAC0JpZFJlZnVuZGVkAAAAAAEAAAAMYmlkX3JlZnVuZGVkAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAKAAAAAQAAAAAAAAAGYmlkZGVyAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADkF1Y3Rpb25DcmVhdGVkAAAAAAABAAAAD2F1Y3Rpb25fY3JlYXRlZAAAAAAFAAAAAAAAAAh0b2tlbl9pZAAAAAoAAAABAAAAAAAAAApzdGFydF90aW1lAAAAAAAGAAAAAAAAAAAAAAAIZW5kX3RpbWUAAAAGAAAAAAAAAAAAAAANcmVzZXJ2ZV9wcmljZQAAAAAAAAsAAAAAAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAADkF1Y3Rpb25TZXR0bGVkAAAAAAABAAAAD2F1Y3Rpb25fc2V0dGxlZAAAAAADAAAAAAAAAAh0b2tlbl9pZAAAAAoAAAABAAAAAAAAAAZ3aW5uZXIAAAAAA+gAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAAIlFbWl0dGVkIHdoZW4gYSBwdXNoIHJlZnVuZCBmYWlsZWQgYW5kIHdhcyBjcmVkaXRlZCB0byBgUGVuZGluZ1JlZnVuZGAuCmBhbW91bnRgIGlzIHRoZSBhbW91bnQgYWRkZWQgYnkgdGhpcyBldmVudCwgbm90IHRoZSBydW5uaW5nIHRvdGFsLgAAAAAAAAAAAAAOUmVmdW5kRGVmZXJyZWQAAAAAAAEAAAAPcmVmdW5kX2RlZmVycmVkAAAAAAMAAAAAAAAACHRva2VuX2lkAAAACgAAAAEAAAAAAAAABmJpZGRlcgAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAD0R1cmF0aW9uVXBkYXRlZAAAAAABAAAAEGR1cmF0aW9uX3VwZGF0ZWQAAAACAAAAAAAAAAhkdXJhdGlvbgAAAAYAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAAAAAAI=", "AAAABQAAAEhFbWl0dGVkIHdoZW4gYSBiaWRkZXIgcHVsbHMgdGhlaXIgZGVmZXJyZWQgcmVmdW5kIHZpYSBgd2l0aGRyYXdfcmVmdW5kYC4AAAAAAAAAD1JlZnVuZFdpdGhkcmF3bgAAAAABAAAAEHJlZnVuZF93aXRoZHJhd24AAAACAAAAAAAAAAZiaWRkZXIAAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAEEF1Y3Rpb25DYW5jZWxsZWQAAAABAAAAEWF1Y3Rpb25fY2FuY2VsbGVkAAAAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAKAAAAAQAAAAAAAAAGcmVhc29uAAAAAAAEAAAAAAAAAAAAAAAMY2FuY2VsbGVkX2J5AAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEVRpbWVCdWZmZXJVcGRhdGVkAAAAAAAAAQAAABN0aW1lX2J1ZmZlcl91cGRhdGVkAAAAAAIAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEkF1Y3Rpb25Jbml0aWFsaXplZAAAAAAAAQAAABNhdWN0aW9uX2luaXRpYWxpemVkAAAAAAkAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAADnRva2VuX2NvbnRyYWN0AAAAAAATAAAAAAAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAAAAAAIZHVyYXRpb24AAAAGAAAAAAAAAAAAAAANcmVzZXJ2ZV9wcmljZQAAAAAAAAsAAAAAAAAAAAAAABltaW5fYmlkX2luY3JlbWVudF9wZXJjZW50AAAAAAAABAAAAAAAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAAAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAAAAAAAAAAAAB3ZlcnNpb24AAAAAEAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAE1BheW1lbnRUb2tlblVwZGF0ZWQAAAAAAQAAABVwYXltZW50X3Rva2VuX3VwZGF0ZWQAAAAAAAACAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAE1Jlc2VydmVQcmljZVVwZGF0ZWQAAAAAAQAAABVyZXNlcnZlX3ByaWNlX3VwZGF0ZWQAAAAAAAACAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAFk1pbkJpZEluY3JlbWVudFVwZGF0ZWQAAAAAAAEAAAAZbWluX2JpZF9pbmNyZW1lbnRfdXBkYXRlZAAAAAAAAAIAAAAAAAAAGW1pbl9iaWRfaW5jcmVtZW50X3BlcmNlbnQAAAAAAAAEAAAAAAAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAAAAAAC", "AAAAAQAAAJxDdXJyZW50IHN0YXRlIG9mIGFuIGFjdGl2ZSBhdWN0aW9uLgoKVHJhY2tzIGFsbCBkeW5hbWljIGF1Y3Rpb24gZGF0YSBpbmNsdWRpbmcgYmlkcywgdGltaW5nLCBhbmQgcGF5bWVudCB0eXBlLgpVcGRhdGVkIG9uIGV2ZXJ5IGJpZCBhbmQgcmVzZXQgb24gc2V0dGxlbWVudC4AAAAAAAAADEF1Y3Rpb25TdGF0ZQAAAAcAAABoVW5peCB0aW1lc3RhbXAgd2hlbiBhdWN0aW9uIGVuZHMuCgpDYW4gYmUgZXh0ZW5kZWQgaWYgYmlkcyBhcnJpdmUgd2l0aGluIHRoZSB0aW1lIGJ1ZmZlciAobWF4IDEwIHRpbWVzKS4AAAAIZW5kX3RpbWUAAAAGAAAAmk51bWJlciBvZiB0aW1lIGV4dGVuc2lvbnMgYXBwbGllZCB0byB0aGlzIGF1Y3Rpb24uCgpJbmNyZW1lbnRzIHdoZW4gYmlkcyBleHRlbmQgdGhlIGVuZCB0aW1lLiBDYXBwZWQgYXQgW2BNQVhfQVVDVElPTl9FWFRFTlNJT05TYF0KdG8gcHJldmVudCBEb1MgYXR0YWNrcy4AAAAAAA9leHRlbnNpb25fY291bnQAAAAABAAAAGBDdXJyZW50IGhpZ2hlc3QgYmlkIGFtb3VudC4KCkluaXRpYWxpemVkIHRvIDAgKG5vIGJpZHMpLiBNdXN0IGV4Y2VlZCByZXNlcnZlIHByaWNlIG9uIGZpcnN0IGJpZC4AAAALaGlnaGVzdF9iaWQAAAAACwAAAG1DdXJyZW50IGhpZ2hlc3QgYmlkZGVyIGFkZHJlc3MuCgpgTm9uZWAgaWYgbm8gYmlkcyB5ZXQuIFRoZSB3aW5uZXIgcmVjZWl2ZXMgdGhlIG1pbnRlZCB0b2tlbiB1cG9uIHNldHRsZW1lbnQuAAAAAAAADmhpZ2hlc3RfYmlkZGVyAAAAAAPoAAAAEwAAAIZXaGV0aGVyIGF1Y3Rpb24gaGFzIGJlZW4gc2V0dGxlZC4KCmB0cnVlYCBhZnRlciBgc2V0dGxlX2F1Y3Rpb24oKWAgb3IgYHNldHRsZV9hbmRfY3JlYXRlX25ldygpYCBjb21wbGV0ZXMuClByZXZlbnRzIGRvdWJsZS1zZXR0bGVtZW50LgAAAAAAB3NldHRsZWQAAAAAAQAAAF5Vbml4IHRpbWVzdGFtcCB3aGVuIGF1Y3Rpb24gc3RhcnRlZC4KClNldCB3aGVuIGF1Y3Rpb24gaXMgY3JlYXRlZCAobGF1bmNoIG9yIHBvc3Qtc2V0dGxlbWVudCkuAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAH9UaGUgdG9rZW4gSUQgYmVpbmcgYXVjdGlvbmVkLgoKU3RhcnRzIGF0IDEgYW5kIGluY3JlbWVudHMgd2l0aCBlYWNoIGF1Y3Rpb24uIFRoZSB0b2tlbiBpcyBtaW50ZWQgdG8gdGhlCndpbm5lciB1cG9uIHNldHRsZW1lbnQuAAAAAAh0b2tlbl9pZAAAAAo=", "AAAAAQAAANdBdWN0aW9uIGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVycy4KClRoZXNlIHNldHRpbmdzIGNvbnRyb2wgdGhlIGJlaGF2aW9yIG9mIGFsbCBhdWN0aW9ucy4gVGhlIG93bmVyIGNhbiBtb2RpZnkKdGhlbSB3aGVuIHRoZSBjb250cmFjdCBpcyBwYXVzZWQsIGJ1dCBjaGFuZ2VzIG9ubHkgYXBwbHkgdG8gZnV0dXJlIGF1Y3Rpb25zLApub3QgdGhlIGN1cnJlbnRseSBhY3RpdmUgb25lLgAAAAAAAAAADUF1Y3Rpb25Db25maWcAAAAAAAAHAAAAdER1cmF0aW9uIG9mIGVhY2ggYXVjdGlvbiBpbiBzZWNvbmRzLgoKU3RhbmRhcmQgYXVjdGlvbiB3aW5kb3cgYmVmb3JlIHRpbWUgZXh0ZW5zaW9ucy4gRm9yIGV4YW1wbGUsIDg2NDAwID0gMjQgaG91cnMuAAAACGR1cmF0aW9uAAAABgAAAK9NaW5pbXVtIGJpZCBpbmNyZW1lbnQgYXMgcGVyY2VudGFnZSAoZS5nLiwgMTAgPSAxMCUpLgoKRWFjaCBuZXcgYmlkIG11c3QgYmUgYXQgbGVhc3QgYGN1cnJlbnRfYmlkICsgKGN1cnJlbnRfYmlkICogaW5jcmVtZW50IC8gMTAwKWAuCk11c3QgYmUgPD0gW2BNQVhfQklEX0lOQ1JFTUVOVF9QRVJDRU5UYF0uAAAAABltaW5fYmlkX2luY3JlbWVudF9wZXJjZW50AAAAAAAABAAAAH5TQUMgdG9rZW4gYWRkcmVzcyBmb3IgcGF5bWVudHMuCgpBbGwgYXVjdGlvbnMgdXNlIHRoaXMgU0FDIHRva2VuIGZvciBiaWRzIGFuZCBwYXltZW50cy4KTmF0aXZlIFhMTSBwYXltZW50cyBhcmUgbm90IHN1cHBvcnRlZC4AAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAFxNaW5pbXVtIGZpcnN0IGJpZCBhbW91bnQuCgpNdXN0IGJlID49IFtgTUlOX1JFU0VSVkVfUFJJQ0VgXS4gUHJvdGVjdHMgYWdhaW5zdCBkdXN0IGF1Y3Rpb25zLgAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAKRUaW1lIGJ1ZmZlciBpbiBzZWNvbmRzLgoKSWYgYSBiaWQgYXJyaXZlcyB3aXRoaW4gdGhpcyB3aW5kb3cgb2YgdGhlIGF1Y3Rpb24gZW5kLCB0aGUgZW5kIHRpbWUgZXh0ZW5kcwpieSB0aGUgYnVmZmVyIGFtb3VudCAodXAgdG8gW2BNQVhfQVVDVElPTl9FWFRFTlNJT05TYF0gdGltZXMpLgAAAAt0aW1lX2J1ZmZlcgAAAAAGAAAAbFRoZSBnb3Zlcm5hbmNlIHRva2VuIGNvbnRyYWN0IHRvIG1pbnQgTkZUcyBmcm9tLgoKTXVzdCBoYXZlIGdyYW50ZWQgbWludCBhdXRob3JpdHkgdG8gdGhpcyBhdWN0aW9uIGNvbnRyYWN0LgAAAA50b2tlbl9jb250cmFjdAAAAAAAEwAAAHRUaGUgdHJlYXN1cnkgYWRkcmVzcyB0byByZWNlaXZlIGF1Y3Rpb24gcHJvY2VlZHMuCgpBbGwgd2lubmluZyBiaWRzIGFyZSB0cmFuc2ZlcnJlZCB0byB0aGlzIGFkZHJlc3MgdXBvbiBzZXR0bGVtZW50LgAAAAh0cmVhc3VyeQAAABM=", "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAA", "AAAAAAAAAbZPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KCk1hcmtzIHRoZSBtb2R1bGUgbGl2ZSBmaXJzdCwgdGhlbiBoYW5kcyBvd25lcnNoaXAgdG8gYHRyZWFzdXJ5YCAoY2xlYXJpbmcKYW55IHBlbmRpbmcgdHdvLXN0ZXAgdHJhbnNmZXIpIGFuZCwgd2hlbiBgc3RhcnRgIGlzIHRydWUsIHVucGF1c2VzIGFuZApjcmVhdGVzIHRoZSBmaXJzdCBhdWN0aW9uICh0aGUgdG9rZW4gbXVzdCBhbHJlYWR5IGJlIGxpdmUgc28gdGhlIGF1Y3Rpb24KaG9sZHMgbWludCBhdXRob3JpdHkpLiBQYW5pY3MgYFBheW1lbnRUb2tlbk1pc21hdGNoYCBpZiB0aGUgY29uZmlndXJlZApwYXltZW50IHRva2VuIGRpZmZlcnMgZnJvbSBgZXhwZWN0ZWRfcGF5bWVudF90b2tlbmAuIEEgc2Vjb25kIGNhbGwgcGFuaWNzIHdpdGggYEFscmVhZHlMaXZlYC4AAAAAAAZsYXVuY2gAAAAAAAMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAFc3RhcnQAAAAAAAABAAAAAAAAABZleHBlY3RlZF9wYXltZW50X3Rva2VuAAAAAAATAAAAAA==", "AAAAAAAAAHFSZXR1cm5zIHRydWUgaWYgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZCwgYW5kIGZhbHNlIG90aGVyd2lzZS4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byBTb3JvYmFuIGVudmlyb25tZW50LgAAAAAAAAZwYXVzZWQAAAAAAAAAAAABAAAAAQ==", "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAA", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAAAAAAAKY3JlYXRlX2JpZAAAAAAAAwAAAAAAAAAGYmlkZGVyAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAoAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=", "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAADUF1Y3Rpb25Db25maWcAAAA=", "AAAAAAAAAAAAAAALZ2V0X2F1Y3Rpb24AAAAAAAAAAAEAAAfQAAAADEF1Y3Rpb25TdGF0ZQ==", "AAAAAAAAAAAAAAAMc2V0X2R1cmF0aW9uAAAAAQAAAAAAAAAIZHVyYXRpb24AAAAGAAAAAA==", "AAAAAAAAAAAAAAAMc3luY192ZXJzaW9uAAAAAAAAAAA=", "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAsAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAOdG9rZW5fY29udHJhY3QAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAIZHVyYXRpb24AAAAGAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAAZbWluX2JpZF9pbmNyZW1lbnRfcGVyY2VudAAAAAAAAAQAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAAAAAADXBheW1lbnRfdG9rZW4AAAAAAAATAAAAAAAAAAdtYW5hZ2VyAAAAABMAAAAAAAAADGN1cnJlbnRfaGFzaAAAA+4AAAAgAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAA", "AAAAAAAAAJVDYW5jZWwgdGhlIGN1cnJlbnQgYXVjdGlvbiBhbmQgcmVmdW5kIHRoZSBoaWdoZXN0IGJpZGRlciAob3duZXIgb25seSwgd2hlbiBwYXVzZWQpClRoaXMgYWxsb3dzIHRoZSBvd25lciB0byBjYW5jZWwgYW4gYXVjdGlvbiBpbiBlbWVyZ2VuY3kgc2l0dWF0aW9ucwAAAAAAAA5jYW5jZWxfYXVjdGlvbgAAAAAAAAAAAAA=", "AAAAAAAAAAAAAAAOcGVuZGluZ19yZWZ1bmQAAAAAAAEAAAAAAAAABmJpZGRlcgAAAAAAEwAAAAEAAAAL", "AAAAAAAAAAAAAAAOc2V0dGxlX2F1Y3Rpb24AAAAAAAAAAAAA", "AAAAAAAAAAAAAAAPc2V0X3RpbWVfYnVmZmVyAAAAAAEAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAA", "AAAAAAAAAAAAAAAPd2l0aGRyYXdfcmVmdW5kAAAAAAEAAAAAAAAABmJpZGRlcgAAAAAAEwAAAAA=", "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==", "AAAAAAAAAAAAAAARc2V0X3BheW1lbnRfdG9rZW4AAAAAAAABAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAARc2V0X3Jlc2VydmVfcHJpY2UAAAAAAAABAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAA=", "AAAAAAAAAYVSZW5vdW5jZXMgb3duZXJzaGlwIG9mIHRoZSBjb250cmFjdC4KClBlcm1hbmVudGx5IHJlbW92ZXMgdGhlIG93bmVyLCBkaXNhYmxpbmcgYWxsIGZ1bmN0aW9ucyBnYXRlZCBieQpgI1tvbmx5X293bmVyXWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYE93bmFibGVFcnJvcjo6VHJhbnNmZXJJblByb2dyZXNzYF0gLSBJZiB0aGVyZSBpcyBhIHBlbmRpbmcgb3duZXJzaGlwCnRyYW5zZmVyLgoqIFtgT3duYWJsZUVycm9yOjpPd25lck5vdFNldGBdIC0gSWYgdGhlIG93bmVyIGlzIG5vdCBzZXQuCgojIE5vdGVzCgoqIEF1dGhvcml6YXRpb24gZm9yIHRoZSBjdXJyZW50IG93bmVyIGlzIHJlcXVpcmVkLgAAAAAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA", "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA", "AAAAAAAAAAAAAAAVc2V0X21pbl9iaWRfaW5jcmVtZW50AAAAAAAAAQAAAAAAAAAZbWluX2JpZF9pbmNyZW1lbnRfcGVyY2VudAAAAAAAAAQAAAAA", "AAAAAAAAATNERVNJR04gTk9URTogc2V0dGxlX2FuZF9jcmVhdGVfbmV3IGlzIGludGVudGlvbmFsbHkgcGVybWlzc2lvbmxlc3MuCkFueW9uZSBjYW4gY2FsbCB0aGlzIGFmdGVyIGFuIGF1Y3Rpb24gZW5kcyB0byBzZXR0bGUgaXQgYW5kIGNyZWF0ZSB0aGUgbmV4dCBvbmUuClRoaXMgaXMgYSBkZWxpYmVyYXRlIGRlc2lnbiBjaG9pY2UgdG8gZW5zdXJlIGF1Y3Rpb25zIGNvbnRpbnVlIGF1dG9tYXRpY2FsbHkuClRoZSBvbmx5IGdyaWVmaW5nIHZlY3RvciBpcyBzZXR0bGluZyBhdCBleGFjdCBlbmQgdGltZSwgd2hpY2ggaXMgbWluaW1hbCBpbXBhY3QuAAAAABVzZXR0bGVfYW5kX2NyZWF0ZV9uZXcAAAAAAAAAAAAAAA==", "AAAABAAAAJFFcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzLiBDb2RlcyBsaXZlIGluIHRoZSA5MDAwIHJhbmdlIHNvCnRoZXkgbmV2ZXIgY29sbGlkZSB3aXRoIG1vZHVsZSAoMTF4eC0xM3h4LCAzLCAzMCkgb3IgbWFuYWdlciAoMTB4eCkgY29kZXMuAAAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAALAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAACMpAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAIyoAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAjKwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAACMsAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAjLQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAIy4AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAjLwAAABtPd25lciBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAC093bmVyTm90U2V0AAAAIzAAAAAmYEN1cnJlbnRWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA1WZXJzaW9uTm90U2V0AAAAAAAjMQAAACZUcmVhc3VyeSBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADlRyZWFzdXJ5Tm90U2V0AAAAACMyAAAAJkdvdmVybm9yIGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOR292ZXJub3JOb3RTZXQAAAAAIzM=", "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==", "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC", "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAAAAAAAAAAGUGF1c2VkAAAAAAABAAAABnBhdXNlZAAAAAAAAAAAAAI=", "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHVucGF1c2VkLgAAAAAAAAAIVW5wYXVzZWQAAAABAAAACHVucGF1c2VkAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAADVBhdXNhYmxlRXJyb3IAAAAAAAACAAAANFRoZSBvcGVyYXRpb24gZmFpbGVkIGJlY2F1c2UgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAANRW5mb3JjZWRQYXVzZQAAAAAAA+gAAAA4VGhlIG9wZXJhdGlvbiBmYWlsZWQgYmVjYXVzZSB0aGUgY29udHJhY3QgaXMgbm90IHBhdXNlZC4AAAANRXhwZWN0ZWRQYXVzZQAAAAAAA+k="]),
      options
    );
  }

   static deploy<T = Client>({ owner, token_contract, treasury, duration, reserve_price, min_bid_increment_percent, time_buffer, payment_token, manager, current_hash, version }: { owner: string | Address; token_contract: string | Address; treasury: string | Address; duration: bigint; reserve_price: bigint; min_bid_increment_percent: number; time_buffer: bigint; payment_token: string | Address; manager: string | Address; current_hash: Uint8Array; version: string }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ owner, token_contract, treasury, duration, reserve_price, min_bid_increment_percent, time_buffer, payment_token, manager, current_hash, version }, options);
  }
  public readonly fromJson = {
    pause : this.txFromJson<void>,  launch : this.txFromJson<void>,  paused : this.txFromJson<boolean>,  unpause : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  get_owner : this.txFromJson<string | null>,  wasm_hash : this.txFromJson<Uint8Array>,  create_bid : this.txFromJson<void>,  get_config : this.txFromJson<AuctionConfig>,  get_auction : this.txFromJson<AuctionState>,  set_duration : this.txFromJson<void>,  sync_version : this.txFromJson<void>,  cancel_auction : this.txFromJson<void>,  pending_refund : this.txFromJson<bigint>,  settle_auction : this.txFromJson<void>,  set_time_buffer : this.txFromJson<void>,  withdraw_refund : this.txFromJson<void>,  accept_ownership : this.txFromJson<void>,  set_payment_token : this.txFromJson<void>,  set_reserve_price : this.txFromJson<void>,  renounce_ownership : this.txFromJson<void>,  transfer_ownership : this.txFromJson<void>,  set_min_bid_increment : this.txFromJson<void>,  settle_and_create_new : this.txFromJson<void>
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
   * Build a topics filter row for the "Launched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  launchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("Launched", topicValues);
  }
  /**
   * Build a topics filter row for the "BidPlaced" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  bidPlacedEventFilter(topicValues?: { token_id?: bigint; bidder?: string | Address }): string[] {
    return this.spec.eventTopicFilter("BidPlaced", topicValues);
  }
  /**
   * Build a topics filter row for the "BidRefunded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  bidRefundedEventFilter(topicValues?: { token_id?: bigint; bidder?: string | Address }): string[] {
    return this.spec.eventTopicFilter("BidRefunded", topicValues);
  }
  /**
   * Build a topics filter row for the "AuctionCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  auctionCreatedEventFilter(topicValues?: { token_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("AuctionCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "AuctionSettled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  auctionSettledEventFilter(topicValues?: { token_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("AuctionSettled", topicValues);
  }
  /**
   * Build a topics filter row for the "RefundDeferred" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  refundDeferredEventFilter(topicValues?: { token_id?: bigint; bidder?: string | Address }): string[] {
    return this.spec.eventTopicFilter("RefundDeferred", topicValues);
  }
  /**
   * Build a topics filter row for the "DurationUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  durationUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("DurationUpdated");
  }
  /**
   * Build a topics filter row for the "RefundWithdrawn" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  refundWithdrawnEventFilter(topicValues?: { bidder?: string | Address }): string[] {
    return this.spec.eventTopicFilter("RefundWithdrawn", topicValues);
  }
  /**
   * Build a topics filter row for the "AuctionCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  auctionCancelledEventFilter(topicValues?: { token_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("AuctionCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "TimeBufferUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  timeBufferUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("TimeBufferUpdated");
  }
  /**
   * Build a topics filter row for the "AuctionInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  auctionInitializedEventFilter(topicValues?: { owner?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AuctionInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "PaymentTokenUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  paymentTokenUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("PaymentTokenUpdated");
  }
  /**
   * Build a topics filter row for the "ReservePriceUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  reservePriceUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("ReservePriceUpdated");
  }
  /**
   * Build a topics filter row for the "MinBidIncrementUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  minBidIncrementUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("MinBidIncrementUpdated");
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
  /**
   * Build a topics filter row for the "Paused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  pausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Paused");
  }
  /**
   * Build a topics filter row for the "Unpaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  unpausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("Unpaused");
  }
}