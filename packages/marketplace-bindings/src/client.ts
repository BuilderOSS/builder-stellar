import {MarketplaceConfig, Listing, PrimaryListing, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Buy a secondary listing. Rejects (`PriceAboveMax`) if the listing price
   * exceeds `max_price`.
   */
  buy({ token_id, buyer, max_price }: { token_id: number; buyer: string | Address; max_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * List `token_id` (escrowed here until bought, cancelled or expired).
   *
   * The fee and payment asset in force are captured in the listing.
   * `max_fee_bps` and `payment_asset` are the terms the seller signed for:
   * the call fails (`FeeAboveMax` / `PaymentAssetMismatch`) if the current
   * config is worse, so a fee or asset change landing between signing and
   * inclusion cannot apply to this listing.
   */
  list({ token_id, seller, price, expires_at, max_fee_bps, payment_asset }: { token_id: number; seller: string | Address; price: bigint; expires_at: bigint; max_fee_bps: number; payment_asset: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Module admin: the launch admin during setup, the Treasury once live.
   */
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  pause(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  cancel({ token_id, seller }: { token_id: number; seller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  expire({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * One-shot, Manager-only launch handoff (Setup -> Live).
   *
   * `treasury` must equal the treasury wired at construction (wiring is
   * immutable). Hands the admin to the treasury. The marketplace is left
   * unpaused when `open` is true and forced paused otherwise. Panics
   * `PaymentAssetMismatch` if the payment asset differs from
   * `expected_payment_asset`. A second call panics with `AlreadyLive`.
   */
  launch({ treasury, open, expected_payment_asset }: { treasury: string | Address; open: boolean; expected_payment_asset: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Advance the storage layout after an upgrade (admin only).
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  unpause(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  get_config(options?: MethodOptions): Promise<AssembledTransaction<MarketplaceConfig>>;
  /**
   * Buy a primary listing: pays the treasury, mints one token to `buyer`.
   * Rejects (`PriceAboveMax`) if the listing price exceeds `max_price`.
   */
  buy_primary({ listing_id, buyer, max_price }: { listing_id: bigint; buyer: string | Address; max_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  get_listing({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Listing | null>>;
  sync_version(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Treasury cancels an unsold primary listing (nothing is escrowed).
   */
  cancel_primary({ listing_id }: { listing_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Anyone may clear an expired primary listing.
   */
  expire_primary({ listing_id }: { listing_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Id the next primary listing will receive.
   */
  next_listing_id(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Storage-layout version of the data held by this contract.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Asset used by new listings (existing listings keep theirs).
   */
  set_payment_asset({ payment_asset }: { payment_asset: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  get_primary_listing({ listing_id }: { listing_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<PrimaryListing | null>>;
  /**
   * Fee applied to new listings (existing listings keep theirs). At most
   * `common::MAX_FEE_BPS` (25%).
   */
  set_secondary_fee_bps({ fee_bps }: { fee_bps: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Create a primary sale listing (treasury-gated, Live, not paused).
   *
   * Nothing is minted or escrowed: the token is minted straight to the
   * buyer inside `buy_primary`. Returns the new listing id.
   */
  create_primary_listing({ price, expires_at }: { price: bigint; expires_at: bigint }, options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAD9NYXJrZXRwbGFjZSBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6TUFSS0VUUExBQ0VgKS4AAAAAAAAAABBNYXJrZXRwbGFjZUVycm9yAAAADwAAAB5Db250cmFjdCBjb25maWd1cmF0aW9uIG1pc3NpbmcAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAeFQAAABVQcmljZSBpcyBub3QgcG9zaXRpdmUAAAAAAAAMSW52YWxpZFByaWNlAAAeFgAAABtFeHBpcnkgaXMgbm90IGluIHRoZSBmdXR1cmUAAAAADUludmFsaWRFeHBpcnkAAAAAAB4XAAAAG1RoZSB0b2tlbiBpcyBhbHJlYWR5IGxpc3RlZAAAAAANTGlzdGluZ0V4aXN0cwAAAAAAHhgAAAAPTm8gc3VjaCBsaXN0aW5nAAAAAA9MaXN0aW5nTm90Rm91bmQAAAAeGQAAABdUaGUgbGlzdGluZyBoYXMgZXhwaXJlZAAAAAAOTGlzdGluZ0V4cGlyZWQAAAAAHhoAAAAfVGhlIGxpc3RpbmcgaGFzIG5vdCBleHBpcmVkIHlldAAAAAANTGlzdGluZ0FjdGl2ZQAAAAAAHhsAAAAyVGhlIGNhbGxlciBpcyBub3QgdGhlIHRva2VuIG93bmVyIC8gbGlzdGluZyBzZWxsZXIAAAAAAAlOb3RTZWxsZXIAAAAAAB4cAAAAH0ZlZSBhYm92ZSBgY29tbW9uOjpNQVhfRkVFX0JQU2AAAAAACkludmFsaWRGZWUAAAAAHh0AAAAnQXJpdGhtZXRpYyBvdmVyZmxvdyBpbiBmZWUgY2FsY3VsYXRpb25zAAAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAAHh4AAABBYGxhdW5jaGAgdHJlYXN1cnkgZGlmZmVycyBmcm9tIHRoZSB0cmVhc3VyeSB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24AAAAAAAAQVHJlYXN1cnlNaXNtYXRjaAAAHh8AAAA6VGhlIHBheW1lbnQgYXNzZXQgZGlmZmVycyBmcm9tIHRoZSBvbmUgdGhlIGNhbGxlciBleHBlY3RlZAAAAAAAFFBheW1lbnRBc3NldE1pc21hdGNoAAAeIAAAAENUaGUgbWFya2V0cGxhY2UgaXMgcGF1c2VkIChuZXcgbGlzdGluZ3MgYW5kIHB1cmNoYXNlcyBhcmUgcmVqZWN0ZWQpAAAAAAZQYXVzZWQAAAAAHiEAAAAyVGhlIGN1cnJlbnQgZmVlIGV4Y2VlZHMgdGhlIHNlbGxlcidzIGBtYXhfZmVlX2Jwc2AAAAAAAAtGZWVBYm92ZU1heAAAAB4iAAAAMVRoZSBsaXN0aW5nIHByaWNlIGV4Y2VlZHMgdGhlIGJ1eWVyJ3MgYG1heF9wcmljZWAAAAAAAAANUHJpY2VBYm92ZU1heAAAAAAAHiM=", "AAAABQAAAAAAAAAAAAAADkxpc3RpbmdFeHBpcmVkAAAAAAABAAAAD2xpc3RpbmdfZXhwaXJlZAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAEExpc3RpbmdDYW5jZWxsZWQAAAABAAAAEWxpc3RpbmdfY2FuY2VsbGVkAAAAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEExpc3RpbmdQdXJjaGFzZWQAAAABAAAAEWxpc3RpbmdfcHVyY2hhc2VkAAAAAAAABgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAAAAAADZmVlAAAAAAsAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlUGF1c2VkAAAAAAAAAQAAABJtYXJrZXRwbGFjZV9wYXVzZWQAAAAAAAEAAAA5VGhlIGFkbWluLCBvciB0aGUgTWFuYWdlciB3aGVuIGBsYXVuY2hgIGZvcmNlcyB0aGUgcGF1c2UuAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAABAAAAAg==", "AAAABQAAAEdFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgbWFya2V0cGxhY2UgKFNldHVwIC0+IExpdmUpLgAAAAAAAAAAE01hcmtldHBsYWNlTGF1bmNoZWQAAAAAAQAAABRtYXJrZXRwbGFjZV9sYXVuY2hlZAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAEAAAAvV2hldGhlciB0aGUgbWFya2V0cGxhY2Ugd2FzIHVucGF1c2VkIGF0IGxhdW5jaC4AAAAABm9wZW5lZAAAAAAAAQAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAE01hcmtldHBsYWNlVW5wYXVzZWQAAAAAAQAAABRtYXJrZXRwbGFjZV91bnBhdXNlZAAAAAEAAAA+VGhlIGFkbWluLCBvciB0aGUgTWFuYWdlciB3aGVuIGBsYXVuY2hgIG9wZW5zIHRoZSBtYXJrZXRwbGFjZS4AAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAAE1BheW1lbnRBc3NldFVwZGF0ZWQAAAAAAQAAABVwYXltZW50X2Fzc2V0X3VwZGF0ZWQAAAAAAAACAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAABAAAAAg==", "AAAABQAAAAAAAAAAAAAAE1NlY29uZGFyeUZlZVVwZGF0ZWQAAAAAAQAAABVzZWNvbmRhcnlfZmVlX3VwZGF0ZWQAAAAAAAACAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAAFVByaW1hcnlMaXN0aW5nQ3JlYXRlZAAAAAAAAAEAAAAXcHJpbWFyeV9saXN0aW5nX2NyZWF0ZWQAAAAABAAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAEAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAFVByaW1hcnlMaXN0aW5nRXhwaXJlZAAAAAAAAAEAAAAXcHJpbWFyeV9saXN0aW5nX2V4cGlyZWQAAAAAAQAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAAFk1hcmtldHBsYWNlSW5pdGlhbGl6ZWQAAAAAAAEAAAAXbWFya2V0cGxhY2VfaW5pdGlhbGl6ZWQAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAAAAAAAAAAABlkZWZhdWx0X3NlY29uZGFyeV9mZWVfYnBzAAAAAAAABAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAF1ByaW1hcnlMaXN0aW5nQ2FuY2VsbGVkAAAAAAEAAAAZcHJpbWFyeV9saXN0aW5nX2NhbmNlbGxlZAAAAAAAAAEAAAAAAAAACmxpc3RpbmdfaWQAAAAAAAYAAAABAAAAAg==", "AAAABQAAAAAAAAAAAAAAF1ByaW1hcnlMaXN0aW5nUHVyY2hhc2VkAAAAAAEAAAAZcHJpbWFyeV9saXN0aW5nX3B1cmNoYXNlZAAAAAAAAAUAAAAAAAAACmxpc3RpbmdfaWQAAAAAAAYAAAABAAAAAAAAAAVidXllcgAAAAAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAF1NlY29uZGFyeUxpc3RpbmdDcmVhdGVkAAAAAAEAAAAZc2Vjb25kYXJ5X2xpc3RpbmdfY3JlYXRlZAAAAAAAAAYAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAAAQAAADZTZWNvbmRhcnkgKGVzY3Jvd2VkLXRva2VuKSBsaXN0aW5nLCBrZXllZCBieSB0b2tlbiBpZC4AAAAAAAAAAAAHTGlzdGluZwAAAAAFAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAAdmZWVfYnBzAAAAAAQAAABOQXNzZXQgY2FwdHVyZWQgYXQgbGlzdCB0aW1lOyBsYXRlciBgc2V0X3BheW1lbnRfYXNzZXRgIGNhbGxzIGRvIG5vdCBhZmZlY3QgaXQuAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAGc2VsbGVyAAAAAAAT", "AAAAAQAAAEhQcmltYXJ5IHNhbGUgbGlzdGluZywga2V5ZWQgYnkgbGlzdGluZyBpZC4gTm8gdG9rZW4gZXhpc3RzIHVudGlsIGJvdWdodC4AAAAAAAAADlByaW1hcnlMaXN0aW5nAAAAAAADAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAIEFzc2V0IGNhcHR1cmVkIGF0IGNyZWF0aW9uIHRpbWUuAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAAVwcmljZQAAAAAAAAs=", "AAAAAQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAABgAAAAAAAAAZZGVmYXVsdF9zZWNvbmRhcnlfZmVlX2JwcwAAAAAAAAQAAAAAAAAAB21hbmFnZXIAAAAAEwAAAAAAAAAGcGF1c2VkAAAAAAABAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAS0ZlZSBhbmQgcHJpbWFyeS1zYWxlIHJlY2lwaWVudC4gQWxzbyB0aGUgYWRtaW4gb25jZSBsaXZlIChgY29tbW9uOjphZG1pbmApLgAAAAAIdHJlYXN1cnkAAAAT", "AAAAAAAAAFxCdXkgYSBzZWNvbmRhcnkgbGlzdGluZy4gUmVqZWN0cyAoYFByaWNlQWJvdmVNYXhgKSBpZiB0aGUgbGlzdGluZyBwcmljZQpleGNlZWRzIGBtYXhfcHJpY2VgLgAAAANidXkAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAACW1heF9wcmljZQAAAAAAAAsAAAAA", "AAAAAAAAAYBMaXN0IGB0b2tlbl9pZGAgKGVzY3Jvd2VkIGhlcmUgdW50aWwgYm91Z2h0LCBjYW5jZWxsZWQgb3IgZXhwaXJlZCkuCgpUaGUgZmVlIGFuZCBwYXltZW50IGFzc2V0IGluIGZvcmNlIGFyZSBjYXB0dXJlZCBpbiB0aGUgbGlzdGluZy4KYG1heF9mZWVfYnBzYCBhbmQgYHBheW1lbnRfYXNzZXRgIGFyZSB0aGUgdGVybXMgdGhlIHNlbGxlciBzaWduZWQgZm9yOgp0aGUgY2FsbCBmYWlscyAoYEZlZUFib3ZlTWF4YCAvIGBQYXltZW50QXNzZXRNaXNtYXRjaGApIGlmIHRoZSBjdXJyZW50CmNvbmZpZyBpcyB3b3JzZSwgc28gYSBmZWUgb3IgYXNzZXQgY2hhbmdlIGxhbmRpbmcgYmV0d2VlbiBzaWduaW5nIGFuZAppbmNsdXNpb24gY2Fubm90IGFwcGx5IHRvIHRoaXMgbGlzdGluZy4AAAAEbGlzdAAAAAYAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAC21heF9mZWVfYnBzAAAAAAQAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAA==", "AAAAAAAAAERNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgb25jZSBsaXZlLgAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAGY2FuY2VsAAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAAGZXhwaXJlAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA", "AAAAAAAAAX1PbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCBoYW5kb2ZmIChTZXR1cCAtPiBMaXZlKS4KCmB0cmVhc3VyeWAgbXVzdCBlcXVhbCB0aGUgdHJlYXN1cnkgd2lyZWQgYXQgY29uc3RydWN0aW9uICh3aXJpbmcgaXMKaW1tdXRhYmxlKS4gSGFuZHMgdGhlIGFkbWluIHRvIHRoZSB0cmVhc3VyeS4gVGhlIG1hcmtldHBsYWNlIGlzIGxlZnQKdW5wYXVzZWQgd2hlbiBgb3BlbmAgaXMgdHJ1ZSBhbmQgZm9yY2VkIHBhdXNlZCBvdGhlcndpc2UuIFBhbmljcwpgUGF5bWVudEFzc2V0TWlzbWF0Y2hgIGlmIHRoZSBwYXltZW50IGFzc2V0IGRpZmZlcnMgZnJvbQpgZXhwZWN0ZWRfcGF5bWVudF9hc3NldGAuIEEgc2Vjb25kIGNhbGwgcGFuaWNzIHdpdGggYEFscmVhZHlMaXZlYC4AAAAAAAAGbGF1bmNoAAAAAAADAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAABG9wZW4AAAABAAAAAAAAABZleHBlY3RlZF9wYXltZW50X2Fzc2V0AAAAAAATAAAAAA==", "AAAAAAAAADlBZHZhbmNlIHRoZSBzdG9yYWdlIGxheW91dCBhZnRlciBhbiB1cGdyYWRlIChhZG1pbiBvbmx5KS4AAAAAAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAA", "AAAAAAAAAIlCdXkgYSBwcmltYXJ5IGxpc3Rpbmc6IHBheXMgdGhlIHRyZWFzdXJ5LCBtaW50cyBvbmUgdG9rZW4gdG8gYGJ1eWVyYC4KUmVqZWN0cyAoYFByaWNlQWJvdmVNYXhgKSBpZiB0aGUgbGlzdGluZyBwcmljZSBleGNlZWRzIGBtYXhfcHJpY2VgLgAAAAAAAAtidXlfcHJpbWFyeQAAAAADAAAAAAAAAApsaXN0aW5nX2lkAAAAAAAGAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAACW1heF9wcmljZQAAAAAAAAsAAAABAAAABA==", "AAAAAAAAAAAAAAALZ2V0X2xpc3RpbmcAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAA+gAAAfQAAAAB0xpc3RpbmcA", "AAAAAAAAAAAAAAAMc3luY192ZXJzaW9uAAAAAAAAAAA=", "AAAAAAAAAGkqIGBhZG1pbmAgLSBzZXR1cC1waGFzZSBhZG1pbiBvZiB0aGUgcGFyYW1ldGVyIHNldHRlcnMgKHRoZSBsYXVuY2ggYWRtaW4pOwpiZWNvbWVzIHRoZSBUcmVhc3VyeSBhdCBsYXVuY2gAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAgAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAAdtYW5hZ2VyAAAAABMAAAAAAAAADGN1cnJlbnRfaGFzaAAAA+4AAAAgAAAAAAAAAAd2ZXJzaW9uAAAAABAAAAAAAAAAGWRlZmF1bHRfc2Vjb25kYXJ5X2ZlZV9icHMAAAAAAAAEAAAAAA==", "AAAAAAAAAEFUcmVhc3VyeSBjYW5jZWxzIGFuIHVuc29sZCBwcmltYXJ5IGxpc3RpbmcgKG5vdGhpbmcgaXMgZXNjcm93ZWQpLgAAAAAAAA5jYW5jZWxfcHJpbWFyeQAAAAAAAQAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAA=", "AAAAAAAAACxBbnlvbmUgbWF5IGNsZWFyIGFuIGV4cGlyZWQgcHJpbWFyeSBsaXN0aW5nLgAAAA5leHBpcmVfcHJpbWFyeQAAAAAAAQAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAA=", "AAAAAAAAAClJZCB0aGUgbmV4dCBwcmltYXJ5IGxpc3Rpbmcgd2lsbCByZWNlaXZlLgAAAAAAAA9uZXh0X2xpc3RpbmdfaWQAAAAAAAAAAAEAAAAG", "AAAAAAAAADlTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4AAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAADtBc3NldCB1c2VkIGJ5IG5ldyBsaXN0aW5ncyAoZXhpc3RpbmcgbGlzdGluZ3Mga2VlcCB0aGVpcnMpLgAAAAARc2V0X3BheW1lbnRfYXNzZXQAAAAAAAABAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAATZ2V0X3ByaW1hcnlfbGlzdGluZwAAAAABAAAAAAAAAApsaXN0aW5nX2lkAAAAAAAGAAAAAQAAA+gAAAfQAAAADlByaW1hcnlMaXN0aW5nAAA=", "AAAAAAAAAGFGZWUgYXBwbGllZCB0byBuZXcgbGlzdGluZ3MgKGV4aXN0aW5nIGxpc3RpbmdzIGtlZXAgdGhlaXJzKS4gQXQgbW9zdApgY29tbW9uOjpNQVhfRkVFX0JQU2AgKDI1JSkuAAAAAAAAFXNldF9zZWNvbmRhcnlfZmVlX2JwcwAAAAAAAAEAAAAAAAAAB2ZlZV9icHMAAAAABAAAAAA=", "AAAAAAAAAL1DcmVhdGUgYSBwcmltYXJ5IHNhbGUgbGlzdGluZyAodHJlYXN1cnktZ2F0ZWQsIExpdmUsIG5vdCBwYXVzZWQpLgoKTm90aGluZyBpcyBtaW50ZWQgb3IgZXNjcm93ZWQ6IHRoZSB0b2tlbiBpcyBtaW50ZWQgc3RyYWlnaHQgdG8gdGhlCmJ1eWVyIGluc2lkZSBgYnV5X3ByaW1hcnlgLiBSZXR1cm5zIHRoZSBuZXcgbGlzdGluZyBpZC4AAAAAAAAWY3JlYXRlX3ByaW1hcnlfbGlzdGluZwAAAAAAAgAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAQAAAAY=", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAACZgQ3VycmVudFZlcnNpb25gIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAABQAAABVFbWl0dGVkIGJ5IGBtaWdyYXRlYC4AAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAAAAAAFGZyb21fc3RvcmFnZV92ZXJzaW9uAAAABAAAAAAAAAAAAAAAEnRvX3N0b3JhZ2VfdmVyc2lvbgAAAAAABAAAAAAAAAAC", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI=", "AAAABQAAABpFbWl0dGVkIGJ5IGBzeW5jX3ZlcnNpb25gLgAAAAAAAAAAAA1WZXJzaW9uU3luY2VkAAAAAAAAAQAAAA52ZXJzaW9uX3N5bmNlZAAAAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ token, admin, treasury, payment_asset, manager, current_hash, version, default_secondary_fee_bps }: { token: string | Address; admin: string | Address; treasury: string | Address; payment_asset: string | Address; manager: string | Address; current_hash: Uint8Array; version: string; default_secondary_fee_bps: number }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ token, admin, treasury, payment_asset, manager, current_hash, version, default_secondary_fee_bps }, options);
  }
  public readonly fromJson = {
    buy : this.txFromJson<void>,  list : this.txFromJson<void>,  admin : this.txFromJson<string>,  pause : this.txFromJson<void>,  cancel : this.txFromJson<void>,  expire : this.txFromJson<void>,  launch : this.txFromJson<void>,  migrate : this.txFromJson<void>,  unpause : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  wasm_hash : this.txFromJson<Uint8Array>,  get_config : this.txFromJson<MarketplaceConfig>,  buy_primary : this.txFromJson<number>,  get_listing : this.txFromJson<Listing | null>,  sync_version : this.txFromJson<void>,  cancel_primary : this.txFromJson<void>,  expire_primary : this.txFromJson<void>,  next_listing_id : this.txFromJson<bigint>,  storage_version : this.txFromJson<number>,  set_payment_asset : this.txFromJson<void>,  get_primary_listing : this.txFromJson<PrimaryListing | null>,  set_secondary_fee_bps : this.txFromJson<void>,  create_primary_listing : this.txFromJson<bigint>
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
   * Build a topics filter row for the "ListingExpired" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingExpiredEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("ListingExpired", topicValues);
  }
  /**
   * Build a topics filter row for the "ListingCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingCancelledEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("ListingCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "ListingPurchased" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingPurchasedEventFilter(topicValues?: { token_id?: number; buyer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ListingPurchased", topicValues);
  }
  /**
   * Build a topics filter row for the "MarketplacePaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplacePausedEventFilter(topicValues?: { changed_by?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MarketplacePaused", topicValues);
  }
  /**
   * Build a topics filter row for the "MarketplaceLaunched" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplaceLaunchedEventFilter(topicValues?: { treasury?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MarketplaceLaunched", topicValues);
  }
  /**
   * Build a topics filter row for the "MarketplaceUnpaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplaceUnpausedEventFilter(topicValues?: { changed_by?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MarketplaceUnpaused", topicValues);
  }
  /**
   * Build a topics filter row for the "PaymentAssetUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  paymentAssetUpdatedEventFilter(topicValues?: { changed_by?: string | Address }): string[] {
    return this.spec.eventTopicFilter("PaymentAssetUpdated", topicValues);
  }
  /**
   * Build a topics filter row for the "SecondaryFeeUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  secondaryFeeUpdatedEventFilter(topicValues?: { changed_by?: string | Address }): string[] {
    return this.spec.eventTopicFilter("SecondaryFeeUpdated", topicValues);
  }
  /**
   * Build a topics filter row for the "PrimaryListingCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  primaryListingCreatedEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("PrimaryListingCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "PrimaryListingExpired" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  primaryListingExpiredEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("PrimaryListingExpired", topicValues);
  }
  /**
   * Build a topics filter row for the "MarketplaceInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplaceInitializedEventFilter(topicValues?: { token?: string | Address; admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MarketplaceInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "PrimaryListingCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  primaryListingCancelledEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("PrimaryListingCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "PrimaryListingPurchased" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  primaryListingPurchasedEventFilter(topicValues?: { listing_id?: bigint; buyer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("PrimaryListingPurchased", topicValues);
  }
  /**
   * Build a topics filter row for the "SecondaryListingCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  secondaryListingCreatedEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("SecondaryListingCreated", topicValues);
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