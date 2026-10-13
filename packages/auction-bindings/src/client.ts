import {AuctionConfig, AuctionState, RenewalPage, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  pause({ caller }: { caller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * One-shot, Manager-only launch (Setup -> Live), `DaoModule::launch`.
   *
   * Marks the module live first, then hands the admin to `treasury`
   * (unless `handoff` already did) and, when `start` is true, unpauses and
   * creates the first auction (the token must already be live so the
   * auction holds an allowance). The Manager checks the payment token
   * against the one recorded at `create_dao` before calling. A second call
   * panics with `AlreadyLive`.
   */
  launch({ treasury, start }: { treasury: string | Address; start: boolean }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Returns true if the contract is paused, and false otherwise.
   *
   * # Arguments
   *
   * * `e` - Access to Soroban environment.
   */
  paused(options?: MethodOptions): Promise<AssembledTransaction<boolean>>;
  /**
   * Manager-only early handoff: the admin moves to `treasury` and the
   * module stays in Setup, so its setters and upgrades are frozen until
   * launch. Panics `AlreadyLive` once launched.
   */
  handoff({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  unpause({ caller }: { caller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  create_bid({ bidder, token_id, amount, comment }: { bidder: string | Address; token_id: bigint; amount: bigint; comment: string }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  get_config(options?: MethodOptions): Promise<AssembledTransaction<AuctionConfig>>;
  get_auction(options?: MethodOptions): Promise<AssembledTransaction<AuctionState>>;
  /**
   * Every auction entry is instance storage; `PendingRefund(bidder)` is
   * the bidder's own (holder class). So there are no keys, only the
   * balances the Auction holds: the token it auctions and the bids.
   */
  renewal_keys({ cursor, limit }: { cursor: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<RenewalPage>>;
  set_duration({ duration }: { duration: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  payment_asset(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Cancel the current auction and refund the highest bidder (admin only,
   * when paused). The emergency exit for a running auction.
   */
  cancel_auction(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  pending_refund({ bidder }: { bidder: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Permissionless like `settle_and_create_new`, and likewise only after
   * the auction has ended (`AuctionActive` otherwise).
   */
  settle_auction(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  set_time_buffer({ time_buffer }: { time_buffer: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  withdraw_refund({ bidder }: { bidder: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  set_payment_token({ payment_token }: { payment_token: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  set_reserve_price({ reserve_price }: { reserve_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
      new Spec(["AAAABAAAADdBdWN0aW9uIGVycm9ycyAoYmxvY2sgYGNvbW1vbjo6ZXJyb3I6OmNvZGVzOjpBVUNUSU9OYCkuAAAAAAAAAAAMQXVjdGlvbkVycm9yAAAAEQAAADxCaWQgcGxhY2VkIGZvciBhIHRva2VuIGlkIG90aGVyIHRoYW4gdGhlIG9uZSBiZWluZyBhdWN0aW9uZWQAAAAOSW52YWxpZFRva2VuSWQAAAAAHOkAAAArQmlkIHBsYWNlZCBhdCBvciBhZnRlciB0aGUgYXVjdGlvbiBlbmQgdGltZQAAAAALQXVjdGlvbk92ZXIAAAAc6gAAAB1UaGUgYXVjdGlvbiBoYXMgbm8gc3RhcnQgdGltZQAAAAAAABFBdWN0aW9uTm90U3RhcnRlZAAAAAAAHOsAAAAwU2V0dGxlbWVudCBhdHRlbXB0ZWQgYmVmb3JlIHRoZSBhdWN0aW9uIGVuZCB0aW1lAAAADUF1Y3Rpb25BY3RpdmUAAAAAABzsAAAALVRoZSBhdWN0aW9uIGlzIGFscmVhZHkgc2V0dGxlZCAob3IgY2FuY2VsbGVkKQAAAAAAAA5BdWN0aW9uU2V0dGxlZAAAAAAc7QAAACFGaXJzdCBiaWQgYmVsb3cgdGhlIHJlc2VydmUgcHJpY2UAAAAAAAASUmVzZXJ2ZVByaWNlTm90TWV0AAAAABzuAAAANUJpZCBiZWxvdyB0aGUgcHJldmlvdXMgYmlkIHBsdXMgdGhlIG1pbmltdW0gaW5jcmVtZW50AAAAAAAADE1pbkJpZE5vdE1ldAAAHO8AAAB5Q29uZmlndXJhdGlvbiBvdXQgb2YgYm91bmRzIChkdXJhdGlvbiBvdXRzaWRlIDUgbWludXRlcyAuLj0gMzAgZGF5cywKaW5jcmVtZW50IG91dHNpZGUgMS4uPTEwMCUsIG9yIHBheW1lbnQgdG9rZW4gbG9ja2VkKQAAAAAAAA1JbnZhbGlkQ29uZmlnAAAAAAAc8AAAAB9ObyBhdWN0aW9uIGhhcyBiZWVuIGNyZWF0ZWQgeWV0AAAAAAtOb3RMYXVuY2hlZAAAABzxAAAAF0NhbGxlciBpcyBub3QgdGhlIGFkbWluAAAAAAxVbmF1dGhvcml6ZWQAABzyAAAAL0FyaXRobWV0aWMgb3ZlcmZsb3cgaW4gYmlkIG9yIHRpbWUgY2FsY3VsYXRpb25zAAAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAAHPMAAABLQmlkIGFtb3VudCBub3QgcG9zaXRpdmUsIG9yIHJlc2VydmUgcHJpY2UgYmVsb3cgYGNvbW1vbjo6TUlOX1JFU0VSVkVfUFJJQ0VgAAAAAApJbnZhbGlkQmlkAAAAABz0AAAAHkNvbnRyYWN0IGNvbmZpZ3VyYXRpb24gbWlzc2luZwAAAAAADk5vdEluaXRpYWxpemVkAAAAABz1AAAAQWBsYXVuY2hgIHRyZWFzdXJ5IGRpZmZlcnMgZnJvbSB0aGUgdHJlYXN1cnkgd2lyZWQgYXQgY29uc3RydWN0aW9uAAAAAAAAEFRyZWFzdXJ5TWlzbWF0Y2gAABz2AAAAN2B3aXRoZHJhd19yZWZ1bmRgIGNhbGxlZCB3aXRoIG5vIHBlbmRpbmcgcmVmdW5kIGJhbGFuY2UAAAAAD05vUGVuZGluZ1JlZnVuZAAAABz4AAAAJ2B0aW1lX2J1ZmZlcmAgb3V0c2lkZSAxLi49ODY0MDAgc2Vjb25kcwAAAAARSW52YWxpZFRpbWVCdWZmZXIAAAAAABz5AAAAKEJpZCBjb21tZW50IGV4Y2VlZHMgYE1BWF9DT01NRU5UX0xFTkdUSGAAAAAOQ29tbWVudFRvb0xvbmcAAAAAHPo=", "AAAABQAAAAAAAAAAAAAACUJpZFBsYWNlZAAAAAAAAAEAAAAKYmlkX3BsYWNlZAAAAAAABgAAAAAAAAAIdG9rZW5faWQAAAAKAAAAAQAAAAAAAAAGYmlkZGVyAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAIZXh0ZW5kZWQAAAABAAAAAAAAAAAAAAAMbmV3X2VuZF90aW1lAAAABgAAAAAAAABCT3B0aW9uYWwgYmlkZGVyIGNvbW1lbnQgKGVtcHR5IGlmIG5vbmUpLiBFdmVudC1vbmx5LCBuZXZlciBzdG9yZWQuAAAAAAAHY29tbWVudAAAAAAQAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAC0JpZFJlZnVuZGVkAAAAAAEAAAAMYmlkX3JlZnVuZGVkAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAKAAAAAQAAAAAAAAAGYmlkZGVyAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADkF1Y3Rpb25DcmVhdGVkAAAAAAABAAAAD2F1Y3Rpb25fY3JlYXRlZAAAAAAFAAAAAAAAAAh0b2tlbl9pZAAAAAoAAAABAAAAAAAAAApzdGFydF90aW1lAAAAAAAGAAAAAAAAAAAAAAAIZW5kX3RpbWUAAAAGAAAAAAAAAAAAAAANcmVzZXJ2ZV9wcmljZQAAAAAAAAsAAAAAAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAADkF1Y3Rpb25TZXR0bGVkAAAAAAABAAAAD2F1Y3Rpb25fc2V0dGxlZAAAAAADAAAAAAAAAAh0b2tlbl9pZAAAAAoAAAABAAAAAAAAAAZ3aW5uZXIAAAAAA+gAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=", "AAAABQAAAIlFbWl0dGVkIHdoZW4gYSBwdXNoIHJlZnVuZCBmYWlsZWQgYW5kIHdhcyBjcmVkaXRlZCB0byBgUGVuZGluZ1JlZnVuZGAuCmBhbW91bnRgIGlzIHRoZSBhbW91bnQgYWRkZWQgYnkgdGhpcyBldmVudCwgbm90IHRoZSBydW5uaW5nIHRvdGFsLgAAAAAAAAAAAAAOUmVmdW5kRGVmZXJyZWQAAAAAAAEAAAAPcmVmdW5kX2RlZmVycmVkAAAAAAMAAAAAAAAACHRva2VuX2lkAAAACgAAAAEAAAAAAAAABmJpZGRlcgAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC", "AAAABQAAAENFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgYXVjdGlvbiAoU2V0dXAgLT4gTGl2ZSkuAAAAAAAAAAAPQXVjdGlvbkxhdW5jaGVkAAAAAAEAAAAQYXVjdGlvbl9sYXVuY2hlZAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAEAAAA/V2hldGhlciB0aGUgYXVjdGlvbiB3YXMgdW5wYXVzZWQgYW5kIHRoZSBmaXJzdCBhdWN0aW9uIGNyZWF0ZWQuAAAAAAdzdGFydGVkAAAAAAEAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAD0R1cmF0aW9uVXBkYXRlZAAAAAABAAAAEGR1cmF0aW9uX3VwZGF0ZWQAAAACAAAAAAAAAAhkdXJhdGlvbgAAAAYAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAAAAAAI=", "AAAABQAAAEhFbWl0dGVkIHdoZW4gYSBiaWRkZXIgcHVsbHMgdGhlaXIgZGVmZXJyZWQgcmVmdW5kIHZpYSBgd2l0aGRyYXdfcmVmdW5kYC4AAAAAAAAAD1JlZnVuZFdpdGhkcmF3bgAAAAABAAAAEHJlZnVuZF93aXRoZHJhd24AAAACAAAAAAAAAAZiaWRkZXIAAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAEEF1Y3Rpb25DYW5jZWxsZWQAAAABAAAAEWF1Y3Rpb25fY2FuY2VsbGVkAAAAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAKAAAAAQAAAAAAAAAGcmVhc29uAAAAAAAEAAAAAAAAAAAAAAAMY2FuY2VsbGVkX2J5AAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEVRpbWVCdWZmZXJVcGRhdGVkAAAAAAAAAQAAABN0aW1lX2J1ZmZlcl91cGRhdGVkAAAAAAIAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEkF1Y3Rpb25Jbml0aWFsaXplZAAAAAAAAQAAABNhdWN0aW9uX2luaXRpYWxpemVkAAAAAAgAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAADnRva2VuX2NvbnRyYWN0AAAAAAATAAAAAAAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAAAAAAIZHVyYXRpb24AAAAGAAAAAAAAAAAAAAANcmVzZXJ2ZV9wcmljZQAAAAAAAAsAAAAAAAAAAAAAABltaW5fYmlkX2luY3JlbWVudF9wZXJjZW50AAAAAAAABAAAAAAAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAAAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAE1BheW1lbnRUb2tlblVwZGF0ZWQAAAAAAQAAABVwYXltZW50X3Rva2VuX3VwZGF0ZWQAAAAAAAACAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAE1Jlc2VydmVQcmljZVVwZGF0ZWQAAAAAAQAAABVyZXNlcnZlX3ByaWNlX3VwZGF0ZWQAAAAAAAACAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAFk1pbkJpZEluY3JlbWVudFVwZGF0ZWQAAAAAAAEAAAAZbWluX2JpZF9pbmNyZW1lbnRfdXBkYXRlZAAAAAAAAAIAAAAAAAAAGW1pbl9iaWRfaW5jcmVtZW50X3BlcmNlbnQAAAAAAAAEAAAAAAAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAAAAAAC", "AAAAAQAAAJxDdXJyZW50IHN0YXRlIG9mIGFuIGFjdGl2ZSBhdWN0aW9uLgoKVHJhY2tzIGFsbCBkeW5hbWljIGF1Y3Rpb24gZGF0YSBpbmNsdWRpbmcgYmlkcywgdGltaW5nLCBhbmQgcGF5bWVudCB0eXBlLgpVcGRhdGVkIG9uIGV2ZXJ5IGJpZCBhbmQgcmVzZXQgb24gc2V0dGxlbWVudC4AAAAAAAAADEF1Y3Rpb25TdGF0ZQAAAAcAAABoVW5peCB0aW1lc3RhbXAgd2hlbiBhdWN0aW9uIGVuZHMuCgpDYW4gYmUgZXh0ZW5kZWQgaWYgYmlkcyBhcnJpdmUgd2l0aGluIHRoZSB0aW1lIGJ1ZmZlciAobWF4IDEwIHRpbWVzKS4AAAAIZW5kX3RpbWUAAAAGAAAAmk51bWJlciBvZiB0aW1lIGV4dGVuc2lvbnMgYXBwbGllZCB0byB0aGlzIGF1Y3Rpb24uCgpJbmNyZW1lbnRzIHdoZW4gYmlkcyBleHRlbmQgdGhlIGVuZCB0aW1lLiBDYXBwZWQgYXQgW2BNQVhfQVVDVElPTl9FWFRFTlNJT05TYF0KdG8gcHJldmVudCBEb1MgYXR0YWNrcy4AAAAAAA9leHRlbnNpb25fY291bnQAAAAABAAAAGBDdXJyZW50IGhpZ2hlc3QgYmlkIGFtb3VudC4KCkluaXRpYWxpemVkIHRvIDAgKG5vIGJpZHMpLiBNdXN0IGV4Y2VlZCByZXNlcnZlIHByaWNlIG9uIGZpcnN0IGJpZC4AAAALaGlnaGVzdF9iaWQAAAAACwAAAG1DdXJyZW50IGhpZ2hlc3QgYmlkZGVyIGFkZHJlc3MuCgpgTm9uZWAgaWYgbm8gYmlkcyB5ZXQuIFRoZSB3aW5uZXIgcmVjZWl2ZXMgdGhlIG1pbnRlZCB0b2tlbiB1cG9uIHNldHRsZW1lbnQuAAAAAAAADmhpZ2hlc3RfYmlkZGVyAAAAAAPoAAAAEwAAAIZXaGV0aGVyIGF1Y3Rpb24gaGFzIGJlZW4gc2V0dGxlZC4KCmB0cnVlYCBhZnRlciBgc2V0dGxlX2F1Y3Rpb24oKWAgb3IgYHNldHRsZV9hbmRfY3JlYXRlX25ldygpYCBjb21wbGV0ZXMuClByZXZlbnRzIGRvdWJsZS1zZXR0bGVtZW50LgAAAAAAB3NldHRsZWQAAAAAAQAAAF5Vbml4IHRpbWVzdGFtcCB3aGVuIGF1Y3Rpb24gc3RhcnRlZC4KClNldCB3aGVuIGF1Y3Rpb24gaXMgY3JlYXRlZCAobGF1bmNoIG9yIHBvc3Qtc2V0dGxlbWVudCkuAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAQZUaGUgdG9rZW4gSUQgYmVpbmcgYXVjdGlvbmVkLgoKVGhlIHRva2VuIGlzIG1pbnRlZCB0byB0aGUgYXVjdGlvbiBjb250cmFjdCB3aGVuIHRoZSBhdWN0aW9uIGlzIGNyZWF0ZWQKYW5kIHRyYW5zZmVycmVkIHRvIHRoZSB3aW5uZXIgKG9yIHRoZSBUcmVhc3VyeSwgaWYgbm9ib2R5IGJpZCkgb24Kc2V0dGxlbWVudC4gSWRzIGZvbGxvdyB0aGUgdG9rZW4ncyBzZXF1ZW5jZSwgc28gdGhleSBuZWVkIG5vdCBiZQpjb25zZWN1dGl2ZSBhY3Jvc3MgYXVjdGlvbnMuAAAAAAAIdG9rZW5faWQAAAAK", "AAAAAQAAANdBdWN0aW9uIGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVycy4KClRoZXNlIHNldHRpbmdzIGNvbnRyb2wgdGhlIGJlaGF2aW9yIG9mIGFsbCBhdWN0aW9ucy4gVGhlIGFkbWluIGNhbiBtb2RpZnkKdGhlbSB3aGVuIHRoZSBjb250cmFjdCBpcyBwYXVzZWQsIGJ1dCBjaGFuZ2VzIG9ubHkgYXBwbHkgdG8gZnV0dXJlIGF1Y3Rpb25zLApub3QgdGhlIGN1cnJlbnRseSBhY3RpdmUgb25lLgAAAAAAAAAADUF1Y3Rpb25Db25maWcAAAAAAAAHAAAAdER1cmF0aW9uIG9mIGVhY2ggYXVjdGlvbiBpbiBzZWNvbmRzLgoKU3RhbmRhcmQgYXVjdGlvbiB3aW5kb3cgYmVmb3JlIHRpbWUgZXh0ZW5zaW9ucy4gRm9yIGV4YW1wbGUsIDg2NDAwID0gMjQgaG91cnMuAAAACGR1cmF0aW9uAAAABgAAAK9NaW5pbXVtIGJpZCBpbmNyZW1lbnQgYXMgcGVyY2VudGFnZSAoZS5nLiwgMTAgPSAxMCUpLgoKRWFjaCBuZXcgYmlkIG11c3QgYmUgYXQgbGVhc3QgYGN1cnJlbnRfYmlkICsgKGN1cnJlbnRfYmlkICogaW5jcmVtZW50IC8gMTAwKWAuCk11c3QgYmUgPD0gW2BNQVhfQklEX0lOQ1JFTUVOVF9QRVJDRU5UYF0uAAAAABltaW5fYmlkX2luY3JlbWVudF9wZXJjZW50AAAAAAAABAAAAH5TQUMgdG9rZW4gYWRkcmVzcyBmb3IgcGF5bWVudHMuCgpBbGwgYXVjdGlvbnMgdXNlIHRoaXMgU0FDIHRva2VuIGZvciBiaWRzIGFuZCBwYXltZW50cy4KTmF0aXZlIFhMTSBwYXltZW50cyBhcmUgbm90IHN1cHBvcnRlZC4AAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAFxNaW5pbXVtIGZpcnN0IGJpZCBhbW91bnQuCgpNdXN0IGJlID49IFtgTUlOX1JFU0VSVkVfUFJJQ0VgXS4gUHJvdGVjdHMgYWdhaW5zdCBkdXN0IGF1Y3Rpb25zLgAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAKRUaW1lIGJ1ZmZlciBpbiBzZWNvbmRzLgoKSWYgYSBiaWQgYXJyaXZlcyB3aXRoaW4gdGhpcyB3aW5kb3cgb2YgdGhlIGF1Y3Rpb24gZW5kLCB0aGUgZW5kIHRpbWUgZXh0ZW5kcwpieSB0aGUgYnVmZmVyIGFtb3VudCAodXAgdG8gW2BNQVhfQVVDVElPTl9FWFRFTlNJT05TYF0gdGltZXMpLgAAAAt0aW1lX2J1ZmZlcgAAAAAGAAAAbFRoZSBnb3Zlcm5hbmNlIHRva2VuIGNvbnRyYWN0IHRvIG1pbnQgTkZUcyBmcm9tLgoKTXVzdCBoYXZlIGdyYW50ZWQgbWludCBhdXRob3JpdHkgdG8gdGhpcyBhdWN0aW9uIGNvbnRyYWN0LgAAAA50b2tlbl9jb250cmFjdAAAAAAAEwAAAHRUaGUgdHJlYXN1cnkgYWRkcmVzcyB0byByZWNlaXZlIGF1Y3Rpb24gcHJvY2VlZHMuCgpBbGwgd2lubmluZyBiaWRzIGFyZSB0cmFuc2ZlcnJlZCB0byB0aGlzIGFkZHJlc3MgdXBvbiBzZXR0bGVtZW50LgAAAAh0cmVhc3VyeQAAABM=", "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=", "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAA", "AAAAAAAAAbBPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCAoU2V0dXAgLT4gTGl2ZSksIGBEYW9Nb2R1bGU6OmxhdW5jaGAuCgpNYXJrcyB0aGUgbW9kdWxlIGxpdmUgZmlyc3QsIHRoZW4gaGFuZHMgdGhlIGFkbWluIHRvIGB0cmVhc3VyeWAKKHVubGVzcyBgaGFuZG9mZmAgYWxyZWFkeSBkaWQpIGFuZCwgd2hlbiBgc3RhcnRgIGlzIHRydWUsIHVucGF1c2VzIGFuZApjcmVhdGVzIHRoZSBmaXJzdCBhdWN0aW9uICh0aGUgdG9rZW4gbXVzdCBhbHJlYWR5IGJlIGxpdmUgc28gdGhlCmF1Y3Rpb24gaG9sZHMgYW4gYWxsb3dhbmNlKS4gVGhlIE1hbmFnZXIgY2hlY2tzIHRoZSBwYXltZW50IHRva2VuCmFnYWluc3QgdGhlIG9uZSByZWNvcmRlZCBhdCBgY3JlYXRlX2Rhb2AgYmVmb3JlIGNhbGxpbmcuIEEgc2Vjb25kIGNhbGwKcGFuaWNzIHdpdGggYEFscmVhZHlMaXZlYC4AAAAGbGF1bmNoAAAAAAACAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAABXN0YXJ0AAAAAAAAAQAAAAA=", "AAAAAAAAAHFSZXR1cm5zIHRydWUgaWYgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZCwgYW5kIGZhbHNlIG90aGVyd2lzZS4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byBTb3JvYmFuIGVudmlyb25tZW50LgAAAAAAAAZwYXVzZWQAAAAAAAAAAAABAAAAAQ==", "AAAAAAAAALFNYW5hZ2VyLW9ubHkgZWFybHkgaGFuZG9mZjogdGhlIGFkbWluIG1vdmVzIHRvIGB0cmVhc3VyeWAgYW5kIHRoZQptb2R1bGUgc3RheXMgaW4gU2V0dXAsIHNvIGl0cyBzZXR0ZXJzIGFuZCB1cGdyYWRlcyBhcmUgZnJvemVuIHVudGlsCmxhdW5jaC4gUGFuaWNzIGBBbHJlYWR5TGl2ZWAgb25jZSBsYXVuY2hlZC4AAAAAAAAHaGFuZG9mZgAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAA", "AAAAAAAAAAAAAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAA", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAAAAAAAKY3JlYXRlX2JpZAAAAAAABAAAAAAAAAAGYmlkZGVyAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAoAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAHY29tbWVudAAAAAAQAAAAAA==", "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAADUF1Y3Rpb25Db25maWcAAAA=", "AAAAAAAAAAAAAAALZ2V0X2F1Y3Rpb24AAAAAAAAAAAEAAAfQAAAADEF1Y3Rpb25TdGF0ZQ==", "AAAAAAAAAMNFdmVyeSBhdWN0aW9uIGVudHJ5IGlzIGluc3RhbmNlIHN0b3JhZ2U7IGBQZW5kaW5nUmVmdW5kKGJpZGRlcilgIGlzCnRoZSBiaWRkZXIncyBvd24gKGhvbGRlciBjbGFzcykuIFNvIHRoZXJlIGFyZSBubyBrZXlzLCBvbmx5IHRoZQpiYWxhbmNlcyB0aGUgQXVjdGlvbiBob2xkczogdGhlIHRva2VuIGl0IGF1Y3Rpb25zIGFuZCB0aGUgYmlkcy4AAAAADHJlbmV3YWxfa2V5cwAAAAIAAAAAAAAABmN1cnNvcgAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAB9AAAAALUmVuZXdhbFBhZ2UA", "AAAAAAAAAAAAAAAMc2V0X2R1cmF0aW9uAAAAAQAAAAAAAAAIZHVyYXRpb24AAAAGAAAAAA==", "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAoAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAOdG9rZW5fY29udHJhY3QAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAIZHVyYXRpb24AAAAGAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAAZbWluX2JpZF9pbmNyZW1lbnRfcGVyY2VudAAAAAAAAAQAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAAAAAADXBheW1lbnRfdG9rZW4AAAAAAAATAAAAAAAAAAdtYW5hZ2VyAAAAABMAAAAAAAAADGN1cnJlbnRfaGFzaAAAA+4AAAAgAAAAAA==", "AAAAAAAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAAH1DYW5jZWwgdGhlIGN1cnJlbnQgYXVjdGlvbiBhbmQgcmVmdW5kIHRoZSBoaWdoZXN0IGJpZGRlciAoYWRtaW4gb25seSwKd2hlbiBwYXVzZWQpLiBUaGUgZW1lcmdlbmN5IGV4aXQgZm9yIGEgcnVubmluZyBhdWN0aW9uLgAAAAAAAA5jYW5jZWxfYXVjdGlvbgAAAAAAAAAAAAA=", "AAAAAAAAAAAAAAAOcGVuZGluZ19yZWZ1bmQAAAAAAAEAAAAAAAAABmJpZGRlcgAAAAAAEwAAAAEAAAAL", "AAAAAAAAAHdQZXJtaXNzaW9ubGVzcyBsaWtlIGBzZXR0bGVfYW5kX2NyZWF0ZV9uZXdgLCBhbmQgbGlrZXdpc2Ugb25seSBhZnRlcgp0aGUgYXVjdGlvbiBoYXMgZW5kZWQgKGBBdWN0aW9uQWN0aXZlYCBvdGhlcndpc2UpLgAAAAAOc2V0dGxlX2F1Y3Rpb24AAAAAAAAAAAAA", "AAAAAAAAAAAAAAAPc2V0X3RpbWVfYnVmZmVyAAAAAAEAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAA", "AAAAAAAAAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAAAAAAAPd2l0aGRyYXdfcmVmdW5kAAAAAAEAAAAAAAAABmJpZGRlcgAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAARc2V0X3BheW1lbnRfdG9rZW4AAAAAAAABAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAARc2V0X3Jlc2VydmVfcHJpY2UAAAAAAAABAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAA=", "AAAAAAAAAAAAAAAVc2V0X21pbl9iaWRfaW5jcmVtZW50AAAAAAAAAQAAAAAAAAAZbWluX2JpZF9pbmNyZW1lbnRfcGVyY2VudAAAAAAAAAQAAAAA", "AAAAAAAAATNERVNJR04gTk9URTogc2V0dGxlX2FuZF9jcmVhdGVfbmV3IGlzIGludGVudGlvbmFsbHkgcGVybWlzc2lvbmxlc3MuCkFueW9uZSBjYW4gY2FsbCB0aGlzIGFmdGVyIGFuIGF1Y3Rpb24gZW5kcyB0byBzZXR0bGUgaXQgYW5kIGNyZWF0ZSB0aGUgbmV4dCBvbmUuClRoaXMgaXMgYSBkZWxpYmVyYXRlIGRlc2lnbiBjaG9pY2UgdG8gZW5zdXJlIGF1Y3Rpb25zIGNvbnRpbnVlIGF1dG9tYXRpY2FsbHkuClRoZSBvbmx5IGdyaWVmaW5nIHZlY3RvciBpcyBzZXR0bGluZyBhdCBleGFjdCBlbmQgdGltZSwgd2hpY2ggaXMgbWluaW1hbCBpbXBhY3QuAAAAABVzZXR0bGVfYW5kX2NyZWF0ZV9uZXcAAAAAAAAAAAAAAA==", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAAAQAAACZPbmUgcGFnZSBvZiBgRGFvTW9kdWxlOjpyZW5ld2FsX2tleXNgLgAAAAAAAAAAAAtSZW5ld2FsUGFnZQAAAAADAAAAmUFzc2V0IGNvbnRyYWN0cyAodGhlIERBTyB0b2tlbiBpbmNsdWRlZCkgd2hvc2UgYEJhbGFuY2UobW9kdWxlKWAgZW50cnkKdGhlIG1vZHVsZSBob2xkcy4gUmVwb3J0ZWQgb24gdGhlIGZpcnN0IHBhZ2U7IGxhdGVyIHBhZ2VzIG1heSByZXBlYXQKb3Igb21pdCB0aGVtLgAAAAAAAAZhc3NldHMAAAAAA+oAAAATAAAB9GAoa2V5LCBwZXJzaXN0ZW50KWAgZm9yIGVhY2ggc3RvcmFnZSBlbnRyeSB0aGUgbW9kdWxlIGFza3MgdGhlIHN3ZWVwCnRvIGtlZXAgYWxpdmUuIGBrZXlgIGlzIHRoZSBleGFjdCBgVmFsYCB0aGUgbW9kdWxlIHN0b3JlcyB1bmRlciwKYWxyZWFkeSBuYW1lc3BhY2VkIChgY3JhdGU6Om5zYCksIHNvIHRoZSBzd2VlcCBidWlsZHMKYExlZGdlcktleTo6Q29udHJhY3REYXRhIHsgY29udHJhY3Q6IG1vZHVsZSwga2V5LCBkdXJhYmlsaXR5IH1gIGZyb20gaXQKZGlyZWN0bHk7IGBwZXJzaXN0ZW50YCBpcyBmYWxzZSBmb3IgdGVtcG9yYXJ5IGVudHJpZXMuIEluc3RhbmNlIGVudHJpZXMKYXJlIG5vdCBsaXN0ZWQ6IHRoZSBzd2VlcCByZW5ld3MgZXZlcnkgbW9kdWxlJ3MgaW5zdGFuY2UuIEEga2V5IG1heSBuYW1lCmFuIGVudHJ5IHRoYXQgZG9lcyBub3QgZXhpc3QgKGEgbGlzdGluZyBzbG90IG5vYm9keSB1c2VkKTsgdGhlIHN3ZWVwCnJlbmV3cyBvbmx5IHdoYXQgaXQgZmluZHMuAAAABGtleXMAAAPqAAAD7QAAAAIAAAAAAAAAAQAAADBDdXJzb3Igb2YgdGhlIG5leHQgcGFnZSwgYE5vbmVgIG9uIHRoZSBsYXN0IG9uZS4AAAALbmV4dF9jdXJzb3IAAAAD6AAAAAQ=", "AAAABQAAABVFbWl0dGVkIGJ5IGBtaWdyYXRlYC4AAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAAAAAAFGZyb21fc3RvcmFnZV92ZXJzaW9uAAAABAAAAAAAAAAAAAAAEnRvX3N0b3JhZ2VfdmVyc2lvbgAAAAAABAAAAAAAAAAC", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAAAAAAAAAAGUGF1c2VkAAAAAAABAAAABnBhdXNlZAAAAAAAAAAAAAI=", "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHVucGF1c2VkLgAAAAAAAAAIVW5wYXVzZWQAAAABAAAACHVucGF1c2VkAAAAAAAAAAI=", "AAAABAAAAAAAAAAAAAAADVBhdXNhYmxlRXJyb3IAAAAAAAACAAAANFRoZSBvcGVyYXRpb24gZmFpbGVkIGJlY2F1c2UgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAANRW5mb3JjZWRQYXVzZQAAAAAAA+gAAAA4VGhlIG9wZXJhdGlvbiBmYWlsZWQgYmVjYXVzZSB0aGUgY29udHJhY3QgaXMgbm90IHBhdXNlZC4AAAANRXhwZWN0ZWRQYXVzZQAAAAAAA+k="]),
      options
    );
  }

   static deploy<T = Client>({ admin, token_contract, treasury, duration, reserve_price, min_bid_increment_percent, time_buffer, payment_token, manager, current_hash }: { admin: string | Address; token_contract: string | Address; treasury: string | Address; duration: bigint; reserve_price: bigint; min_bid_increment_percent: number; time_buffer: bigint; payment_token: string | Address; manager: string | Address; current_hash: Uint8Array }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, token_contract, treasury, duration, reserve_price, min_bid_increment_percent, time_buffer, payment_token, manager, current_hash }, options);
  }
  public readonly fromJson = {
    admin : this.txFromJson<string>,  pause : this.txFromJson<void>,  launch : this.txFromJson<void>,  paused : this.txFromJson<boolean>,  handoff : this.txFromJson<void>,  migrate : this.txFromJson<void>,  unpause : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  wasm_hash : this.txFromJson<Uint8Array>,  create_bid : this.txFromJson<void>,  get_config : this.txFromJson<AuctionConfig>,  get_auction : this.txFromJson<AuctionState>,  renewal_keys : this.txFromJson<RenewalPage>,  set_duration : this.txFromJson<void>,  payment_asset : this.txFromJson<string>,  cancel_auction : this.txFromJson<void>,  pending_refund : this.txFromJson<bigint>,  settle_auction : this.txFromJson<void>,  set_time_buffer : this.txFromJson<void>,  storage_version : this.txFromJson<number>,  withdraw_refund : this.txFromJson<void>,  set_payment_token : this.txFromJson<void>,  set_reserve_price : this.txFromJson<void>,  set_min_bid_increment : this.txFromJson<void>,  settle_and_create_new : this.txFromJson<void>
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
   * Build a topics filter row for the "AuctionLaunched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  auctionLaunchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("AuctionLaunched", topicValues);
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
  auctionInitializedEventFilter(topicValues?: { admin?: string | Address }): string[] {
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