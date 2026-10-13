import {Pool, MarketplaceConfig, PoolSlot, Listing, RenewalPage, ContractEvent} from './types.js';
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
   * One-shot, Manager-only launch (Setup -> Live), `DaoModule::launch`.
   *
   * `treasury` must equal the treasury wired at construction (wiring is
   * immutable). Hands the admin to the treasury unless `handoff` already
   * did. The marketplace is left unpaused when `open` is true and forced
   * paused otherwise. The Manager checks the payment asset against the one
   * recorded at `create_dao` before calling. A second call panics with
   * `AlreadyLive`.
   */
  launch({ treasury, open }: { treasury: string | Address; open: boolean }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Manager-only early handoff: the admin moves to `treasury` and the
   * module stays in Setup, so its setters and upgrades are frozen until
   * launch. Panics `AlreadyLive` once launched.
   */
  handoff({ treasury }: { treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Advance the storage layout after an upgrade (admin only).
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Mint the pool's next chunk (at most `common::MAX_RESTOCK`) into this
   * contract's custody and append the ids to its stock pages. Anyone may
   * call it until the pool closes or expires. Returns how many it minted.
   */
  restock({ pool_id }: { pool_id: number }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  unpause(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  get_pool({ pool_id }: { pool_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Pool | null>>;
  /**
   * Open a pool of `size` tokens (the Treasury, by proposal, once Live).
   *
   * The pool reserves `size` of the Marketplace's mint allowance for
   * itself: the allowance not reserved by other open pools must cover it
   * (`AllowanceNotReserved`), so closing one pool never starves another.
   * Returns the pool id.
   */
  open_pool({ price, asset, expires_at, size, max_per_buyer, max_sold_per_period, period_secs }: { price: bigint; asset: string | Address; expires_at: bigint; size: number; max_per_buyer: number; max_sold_per_period: number; period_secs: bigint }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Close a pool: the Treasury (by proposal) at any time, anyone once it
   * has expired. Gives the unstocked rest of the pool's reservation back
   * to the Token (`release_mint_allowance`, which saturates if the
   * Treasury lowered the allowance meanwhile). Unsold stock stays here
   * until `sweep_pool`.
   */
  close_pool({ pool_id }: { pool_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  get_config(options?: MethodOptions): Promise<AssembledTransaction<MarketplaceConfig>>;
  /**
   * Pools opened and not yet swept empty, with their unstocked
   * reservations and page counts.
   */
  open_pools(options?: MethodOptions): Promise<AssembledTransaction<Array<PoolSlot>>>;
  /**
   * The token ids on one stock page (empty once sold or swept).
   */
  pool_stock({ pool_id, page }: { pool_id: number; page: number }, options?: MethodOptions): Promise<AssembledTransaction<Array<number>>>;
  /**
   * Return up to `MAX_SWEEP` unsold tokens of a closed pool to the
   * Treasury, emptying its stock pages from the last. Anyone may call it
   * until it returns 0 (pages left). Both holders are non-voting, so no
   * votes move.
   */
  sweep_pool({ pool_id }: { pool_id: number }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  get_listing({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Listing | null>>;
  /**
   * Id the next pool will receive.
   */
  next_pool_id(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * DAO-owned keys for the renewal sweep (`DaoModule::renewal_keys`).
   *
   * The key space is `Listing(0..minted)`, then for each open pool its
   * `Pool(id)` and `PoolStock(id, 0..pages)` (a 100-token pool is 3 pages,
   * eng review R8). The bounds come from instance storage only, so the
   * page answers even when the entries have archived. Most listing slots
   * hold nothing; the sweep renews only what it finds. `PoolBuyer` counts
   * are the buyers' (holder class). The balances held are the escrowed and
   * stocked tokens and the payment assets (a listing created before
   * `set_payment_asset` may be priced in an older one; the sweep reads
   * those from the listings it finds).
   */
  renewal_keys({ cursor, limit }: { cursor: number; limit: number }, options?: MethodOptions): Promise<AssembledTransaction<RenewalPage>>;
  /**
   * Buy `token_id` from page `page` of a pool: pays the pool price to the
   * Treasury and sends the token to `buyer`. Refuses once the pool is
   * closed or expired (`PoolClosed`), past the buyer's cap
   * (`BuyerLimitReached`) or the period's sales (`PoolRateLimited`), or
   * above `max_price` (`PriceAboveMax`).
   */
  buy_from_pool({ pool_id, page, token_id, buyer, max_price }: { pool_id: number; page: number; token_id: number; buyer: string | Address; max_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The configured payment asset (`DaoModule::payment_asset`).
   */
  payment_asset(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * How many tokens `buyer` bought from a pool.
   */
  pool_purchases({ pool_id, buyer }: { pool_id: number; buyer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Comment on `token_id`'s secondary listings. No active listing is
   * required, so the thread survives relisting. Anyone may comment, even
   * while paused. Event-only: emits `ListingCommented`, writes no storage.
   */
  comment_listing({ token_id, body, author }: { token_id: number; body: string; author: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Storage-layout version of the data held by this contract.
   */
  storage_version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Asset used by new listings (existing listings keep theirs).
   */
  set_payment_asset({ payment_asset }: { payment_asset: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Fee applied to new listings (existing listings keep theirs). At most
   * `common::MAX_FEE_BPS` (25%).
   */
  set_secondary_fee_bps({ fee_bps }: { fee_bps: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAD9NYXJrZXRwbGFjZSBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6TUFSS0VUUExBQ0VgKS4AAAAAAAAAABBNYXJrZXRwbGFjZUVycm9yAAAAGwAAAB5Db250cmFjdCBjb25maWd1cmF0aW9uIG1pc3NpbmcAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAeFQAAABVQcmljZSBpcyBub3QgcG9zaXRpdmUAAAAAAAAMSW52YWxpZFByaWNlAAAeFgAAABtFeHBpcnkgaXMgbm90IGluIHRoZSBmdXR1cmUAAAAADUludmFsaWRFeHBpcnkAAAAAAB4XAAAAG1RoZSB0b2tlbiBpcyBhbHJlYWR5IGxpc3RlZAAAAAANTGlzdGluZ0V4aXN0cwAAAAAAHhgAAAAPTm8gc3VjaCBsaXN0aW5nAAAAAA9MaXN0aW5nTm90Rm91bmQAAAAeGQAAABdUaGUgbGlzdGluZyBoYXMgZXhwaXJlZAAAAAAOTGlzdGluZ0V4cGlyZWQAAAAAHhoAAAAfVGhlIGxpc3RpbmcgaGFzIG5vdCBleHBpcmVkIHlldAAAAAANTGlzdGluZ0FjdGl2ZQAAAAAAHhsAAAAyVGhlIGNhbGxlciBpcyBub3QgdGhlIHRva2VuIG93bmVyIC8gbGlzdGluZyBzZWxsZXIAAAAAAAlOb3RTZWxsZXIAAAAAAB4cAAAAH0ZlZSBhYm92ZSBgY29tbW9uOjpNQVhfRkVFX0JQU2AAAAAACkludmFsaWRGZWUAAAAAHh0AAAAnQXJpdGhtZXRpYyBvdmVyZmxvdyBpbiBmZWUgY2FsY3VsYXRpb25zAAAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAAHh4AAABBYGxhdW5jaGAgdHJlYXN1cnkgZGlmZmVycyBmcm9tIHRoZSB0cmVhc3VyeSB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24AAAAAAAAQVHJlYXN1cnlNaXNtYXRjaAAAHh8AAAA6VGhlIHBheW1lbnQgYXNzZXQgZGlmZmVycyBmcm9tIHRoZSBvbmUgdGhlIGNhbGxlciBleHBlY3RlZAAAAAAAFFBheW1lbnRBc3NldE1pc21hdGNoAAAeIAAAAENUaGUgbWFya2V0cGxhY2UgaXMgcGF1c2VkIChuZXcgbGlzdGluZ3MgYW5kIHB1cmNoYXNlcyBhcmUgcmVqZWN0ZWQpAAAAAAZQYXVzZWQAAAAAHiEAAAAyVGhlIGN1cnJlbnQgZmVlIGV4Y2VlZHMgdGhlIHNlbGxlcidzIGBtYXhfZmVlX2Jwc2AAAAAAAAtGZWVBYm92ZU1heAAAAB4iAAAAMVRoZSBsaXN0aW5nIHByaWNlIGV4Y2VlZHMgdGhlIGJ1eWVyJ3MgYG1heF9wcmljZWAAAAAAAAANUHJpY2VBYm92ZU1heAAAAAAAHiMAAAAVQ29tbWVudCBib2R5IGlzIGVtcHR5AAAAAAAADENvbW1lbnRFbXB0eQAAHiQAAAApQ29tbWVudCBib2R5IGV4Y2VlZHMgYE1BWF9DT01NRU5UX0xFTkdUSGAAAAAAAAAOQ29tbWVudFRvb0xvbmcAAAAAHiUAAABpVGhlIE1hcmtldHBsYWNlJ3MgYWxsb3dhbmNlIG5vdCByZXNlcnZlZCBieSBvcGVuIHBvb2xzIGlzIGJlbG93IHRoZQpwb29sIHNpemUgKGdyYW50IHRoZSBhbGxvd2FuY2UgZmlyc3QpAAAAAAAAFEFsbG93YW5jZU5vdFJlc2VydmVkAAAeJgAAAAxObyBzdWNoIHBvb2wAAAAMUG9vbE5vdEZvdW5kAAAeJwAAACVUaGUgcG9vbCBpcyBjbG9zZWQgb3IgcGFzdCBpdHMgZXhwaXJ5AAAAAAAAClBvb2xDbG9zZWQAAAAAHigAAAAsVGhlIGJ1eWVyIHJlYWNoZWQgdGhlIHBvb2wncyBgbWF4X3Blcl9idXllcmAAAAARQnV5ZXJMaW1pdFJlYWNoZWQAAAAAAB4pAAAAL1RoZSBwb29sIHNvbGQgYG1heF9zb2xkX3Blcl9wZXJpb2RgIHRoaXMgcGVyaW9kAAAAAA9Qb29sUmF0ZUxpbWl0ZWQAAAAeKgAAAEBUaGUgdG9rZW4gaXMgbm90IGluIHRoYXQgcG9vbCBzdG9jayBwYWdlIChzb2xkLCBvciBhbm90aGVyIHBhZ2UpAAAACU5vdEluUG9vbAAAAAAAHisAAAA7YE1BWF9PUEVOX1BPT0xTYCBwb29scyBhcmUgb3BlbiAoY2xvc2UgYW5kIHN3ZWVwIG9uZSBmaXJzdCkAAAAADFRvb01hbnlQb29scwAAHiwAAAApYHN3ZWVwX3Bvb2xgIG9uIGEgcG9vbCB0aGF0IGlzIHN0aWxsIG9wZW4AAAAAAAAIUG9vbE9wZW4AAB4tAAAANEEgcG9vbCBzaXplLCBidXllciBjYXAsIHNhbGVzIHJhdGUgb3IgcGVyaW9kIG9mIHplcm8AAAALSW52YWxpZFBvb2wAAAAeLgAAACNUaGUgcG9vbCBoYXMgc3RvY2tlZCBpdHMgd2hvbGUgc2l6ZQAAAAAQUG9vbEZ1bGx5U3RvY2tlZAAAHi8=", "AAAABQAAAElgY291bnRgIHVuc29sZCB0b2tlbnMgcmV0dXJuZWQgdG8gdGhlIFRyZWFzdXJ5OyBgcGFnZXNfbGVmdGAgMCB3aGVuIGRvbmUuAAAAAAAAAAAAAAlQb29sU3dlcHQAAAAAAAABAAAACnBvb2xfc3dlcHQAAAAAAAMAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAAAAAAABWNvdW50AAAAAAAABAAAAAAAAAAAAAAACnBhZ2VzX2xlZnQAAAAAAAQAAAAAAAAAAg==", "AAAABQAAAEBBIHBvb2wgY2xvc2VkOyBgcmVsZWFzZWRgIGlzIHRoZSB1bnN0b2NrZWQgYWxsb3dhbmNlIGdpdmVuIGJhY2suAAAAAAAAAApQb29sQ2xvc2VkAAAAAAABAAAAC3Bvb2xfY2xvc2VkAAAAAAIAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAAAAAAACHJlbGVhc2VkAAAABAAAAAAAAAAC", "AAAABQAAACZBIHF1aWNrLWJ1eSBwb29sIG9wZW5lZCAoYnkgcHJvcG9zYWwpLgAAAAAAAAAAAApQb29sT3BlbmVkAAAAAAABAAAAC3Bvb2xfb3BlbmVkAAAAAAgAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAAAAAABWFzc2V0AAAAAAAAEwAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAAAAAARzaXplAAAABAAAAAAAAAAAAAAADW1heF9wZXJfYnV5ZXIAAAAAAAAEAAAAAAAAAAAAAAATbWF4X3NvbGRfcGVyX3BlcmlvZAAAAAAEAAAAAAAAAAAAAAALcGVyaW9kX3NlY3MAAAAABgAAAAAAAAAC", "AAAABQAAACZBIGJ1eWVyIHBpY2tlZCBgdG9rZW5faWRgIGZyb20gYSBwb29sLgAAAAAAAAAAAA1Qb29sUHVyY2hhc2VkAAAAAAAAAQAAAA5wb29sX3B1cmNoYXNlZAAAAAAABQAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAQAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAAI=", "AAAABQAAAERgY291bnRgIHRva2VucyBmcm9tIGBmaXJzdF90b2tlbl9pZGAgbWludGVkIGludG8gdGhlIHBvb2wncyBjdXN0b2R5LgAAAAAAAAANUG9vbFJlc3RvY2tlZAAAAAAAAAEAAAAOcG9vbF9yZXN0b2NrZWQAAAAAAAQAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAAAAAAADmZpcnN0X3Rva2VuX2lkAAAAAAAEAAAAAAAAAAAAAAAFY291bnQAAAAAAAAEAAAAAAAAAAAAAAAHc3RvY2tlZAAAAAAEAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADkxpc3RpbmdFeHBpcmVkAAAAAAABAAAAD2xpc3RpbmdfZXhwaXJlZAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAEExpc3RpbmdDYW5jZWxsZWQAAAABAAAAEWxpc3RpbmdfY2FuY2VsbGVkAAAAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAI=", "AAAABQAAAIdBIGNvbW1lbnQgb24gYSB0b2tlbidzIHNlY29uZGFyeSBsaXN0aW5ncy4gS2V5ZWQgYnkgdG9rZW4sIHNvIHRoZSB0aHJlYWQKY2FycmllcyBvdmVyIHJlbGlzdGluZ3MuIEV2ZW50LW9ubHk6IHRoZSBib2R5IGlzIG5ldmVyIHN0b3JlZC4AAAAAAAAAABBMaXN0aW5nQ29tbWVudGVkAAAAAQAAABFsaXN0aW5nX2NvbW1lbnRlZAAAAAAAAAMAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAABmF1dGhvcgAAAAAAEwAAAAEAAAAAAAAABGJvZHkAAAAQAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEExpc3RpbmdQdXJjaGFzZWQAAAABAAAAEWxpc3RpbmdfcHVyY2hhc2VkAAAAAAAABgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAAAAAADZmVlAAAAAAsAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlUGF1c2VkAAAAAAAAAQAAABJtYXJrZXRwbGFjZV9wYXVzZWQAAAAAAAEAAAA5VGhlIGFkbWluLCBvciB0aGUgTWFuYWdlciB3aGVuIGBsYXVuY2hgIGZvcmNlcyB0aGUgcGF1c2UuAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAABAAAAAg==", "AAAABQAAAEdFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgbWFya2V0cGxhY2UgKFNldHVwIC0+IExpdmUpLgAAAAAAAAAAE01hcmtldHBsYWNlTGF1bmNoZWQAAAAAAQAAABRtYXJrZXRwbGFjZV9sYXVuY2hlZAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAEAAAAvV2hldGhlciB0aGUgbWFya2V0cGxhY2Ugd2FzIHVucGF1c2VkIGF0IGxhdW5jaC4AAAAABm9wZW5lZAAAAAAAAQAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAE01hcmtldHBsYWNlVW5wYXVzZWQAAAAAAQAAABRtYXJrZXRwbGFjZV91bnBhdXNlZAAAAAEAAAA+VGhlIGFkbWluLCBvciB0aGUgTWFuYWdlciB3aGVuIGBsYXVuY2hgIG9wZW5zIHRoZSBtYXJrZXRwbGFjZS4AAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAAE1BheW1lbnRBc3NldFVwZGF0ZWQAAAAAAQAAABVwYXltZW50X2Fzc2V0X3VwZGF0ZWQAAAAAAAACAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAABAAAAAg==", "AAAABQAAAAAAAAAAAAAAE1NlY29uZGFyeUZlZVVwZGF0ZWQAAAAAAQAAABVzZWNvbmRhcnlfZmVlX3VwZGF0ZWQAAAAAAAACAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAQAAAAI=", "AAAABQAAAAAAAAAAAAAAFk1hcmtldHBsYWNlSW5pdGlhbGl6ZWQAAAAAAAEAAAAXbWFya2V0cGxhY2VfaW5pdGlhbGl6ZWQAAAAABQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAAAAAABlkZWZhdWx0X3NlY29uZGFyeV9mZWVfYnBzAAAAAAAABAAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAF1NlY29uZGFyeUxpc3RpbmdDcmVhdGVkAAAAAAEAAAAZc2Vjb25kYXJ5X2xpc3RpbmdfY3JlYXRlZAAAAAAAAAYAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAAAQAAAK1BIHF1aWNrLWJ1eSBwb29sOiBzdG9jayBtaW50ZWQgaW50byB0aGUgTWFya2V0cGxhY2UncyBjdXN0b2R5IGFuZCBzb2xkIGF0Cm9uZSBwcmljZSwgd2l0aCBhIHBlci1idXllciBjYXAgYW5kIGEgcG9vbC13aWRlIHNhbGVzIHJhdGUKKGRvY3MvZGVzaWducy9tZW1iZXJzaGlwLW1vZGVscy5tZCDCpzQpLgAAAAAAAAAAAAAEUG9vbAAAAAwAAAAAAAAABWFzc2V0AAAAAAAAEwAAAAAAAAAGY2xvc2VkAAAAAAABAAAAMVNhbGVzIGFuZCByZXN0b2NrcyBzdG9wIGF0IHRoaXMgbGVkZ2VyIHRpbWVzdGFtcC4AAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAANbWF4X3Blcl9idXllcgAAAAAAAAQAAAAoTW9zdCBzYWxlcyBwZXIgYHBlcmlvZF9zZWNzYCwgcG9vbC13aWRlLgAAABNtYXhfc29sZF9wZXJfcGVyaW9kAAAAAAQAAAAAAAAAC3BlcmlvZF9zZWNzAAAAAAYAAAAAAAAADHBlcmlvZF9zdGFydAAAAAYAAAAAAAAABXByaWNlAAAAAAAACwAAAD1Ub2tlbnMgdGhlIHBvb2wgbWF5IHN0b2NrIGluIGFsbCAoaXRzIGFsbG93YW5jZSByZXNlcnZhdGlvbikuAAAAAAAABHNpemUAAAAEAAAAAAAAAARzb2xkAAAABAAAAAAAAAAOc29sZF9pbl9wZXJpb2QAAAAAAAQAAAAAAAAAB3N0b2NrZWQAAAAABA==", "AAAAAQAAADZTZWNvbmRhcnkgKGVzY3Jvd2VkLXRva2VuKSBsaXN0aW5nLCBrZXllZCBieSB0b2tlbiBpZC4AAAAAAAAAAAAHTGlzdGluZwAAAAAFAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAAdmZWVfYnBzAAAAAAQAAABOQXNzZXQgY2FwdHVyZWQgYXQgbGlzdCB0aW1lOyBsYXRlciBgc2V0X3BheW1lbnRfYXNzZXRgIGNhbGxzIGRvIG5vdCBhZmZlY3QgaXQuAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAGc2VsbGVyAAAAAAAT", "AAAAAQAAAERJbnN0YW5jZSBib29ra2VlcGluZyBmb3IgYW4gb3BlbiBwb29sIChvcGVuZWQsIG5vdCB5ZXQgc3dlcHQgZW1wdHkpLgAAAAAAAAAIUG9vbFNsb3QAAAADAAAANFN0b2NrIHBhZ2VzIHdyaXR0ZW4sIGBQb29sU3RvY2socG9vbF9pZCwgMC4ucGFnZXMpYC4AAAAFcGFnZXMAAAAAAAAEAAAAAAAAAAdwb29sX2lkAAAAAAQAAAA/VGhlIHBvb2wncyBzaGFyZSBvZiB0aGUgTWFya2V0cGxhY2UncyBhbGxvd2FuY2Ugbm90IHlldCBtaW50ZWQuAAAAAAl1bnN0b2NrZWQAAAAAAAAE", "AAAAAQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAABgAAAAAAAAAZZGVmYXVsdF9zZWNvbmRhcnlfZmVlX2JwcwAAAAAAAAQAAAAAAAAAB21hbmFnZXIAAAAAEwAAAAAAAAAGcGF1c2VkAAAAAAABAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAS0ZlZSBhbmQgcHJpbWFyeS1zYWxlIHJlY2lwaWVudC4gQWxzbyB0aGUgYWRtaW4gb25jZSBsaXZlIChgY29tbW9uOjphZG1pbmApLgAAAAAIdHJlYXN1cnkAAAAT", "AAAAAAAAAFxCdXkgYSBzZWNvbmRhcnkgbGlzdGluZy4gUmVqZWN0cyAoYFByaWNlQWJvdmVNYXhgKSBpZiB0aGUgbGlzdGluZyBwcmljZQpleGNlZWRzIGBtYXhfcHJpY2VgLgAAAANidXkAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAACW1heF9wcmljZQAAAAAAAAsAAAAA", "AAAAAAAAAYBMaXN0IGB0b2tlbl9pZGAgKGVzY3Jvd2VkIGhlcmUgdW50aWwgYm91Z2h0LCBjYW5jZWxsZWQgb3IgZXhwaXJlZCkuCgpUaGUgZmVlIGFuZCBwYXltZW50IGFzc2V0IGluIGZvcmNlIGFyZSBjYXB0dXJlZCBpbiB0aGUgbGlzdGluZy4KYG1heF9mZWVfYnBzYCBhbmQgYHBheW1lbnRfYXNzZXRgIGFyZSB0aGUgdGVybXMgdGhlIHNlbGxlciBzaWduZWQgZm9yOgp0aGUgY2FsbCBmYWlscyAoYEZlZUFib3ZlTWF4YCAvIGBQYXltZW50QXNzZXRNaXNtYXRjaGApIGlmIHRoZSBjdXJyZW50CmNvbmZpZyBpcyB3b3JzZSwgc28gYSBmZWUgb3IgYXNzZXQgY2hhbmdlIGxhbmRpbmcgYmV0d2VlbiBzaWduaW5nIGFuZAppbmNsdXNpb24gY2Fubm90IGFwcGx5IHRvIHRoaXMgbGlzdGluZy4AAAAEbGlzdAAAAAYAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAC21heF9mZWVfYnBzAAAAAAQAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAA==", "AAAAAAAAAERNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgb25jZSBsaXZlLgAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAGY2FuY2VsAAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAAGZXhwaXJlAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA", "AAAAAAAAAatPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCAoU2V0dXAgLT4gTGl2ZSksIGBEYW9Nb2R1bGU6OmxhdW5jaGAuCgpgdHJlYXN1cnlgIG11c3QgZXF1YWwgdGhlIHRyZWFzdXJ5IHdpcmVkIGF0IGNvbnN0cnVjdGlvbiAod2lyaW5nIGlzCmltbXV0YWJsZSkuIEhhbmRzIHRoZSBhZG1pbiB0byB0aGUgdHJlYXN1cnkgdW5sZXNzIGBoYW5kb2ZmYCBhbHJlYWR5CmRpZC4gVGhlIG1hcmtldHBsYWNlIGlzIGxlZnQgdW5wYXVzZWQgd2hlbiBgb3BlbmAgaXMgdHJ1ZSBhbmQgZm9yY2VkCnBhdXNlZCBvdGhlcndpc2UuIFRoZSBNYW5hZ2VyIGNoZWNrcyB0aGUgcGF5bWVudCBhc3NldCBhZ2FpbnN0IHRoZSBvbmUKcmVjb3JkZWQgYXQgYGNyZWF0ZV9kYW9gIGJlZm9yZSBjYWxsaW5nLiBBIHNlY29uZCBjYWxsIHBhbmljcyB3aXRoCmBBbHJlYWR5TGl2ZWAuAAAAAAZsYXVuY2gAAAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAEb3BlbgAAAAEAAAAA", "AAAAAAAAALFNYW5hZ2VyLW9ubHkgZWFybHkgaGFuZG9mZjogdGhlIGFkbWluIG1vdmVzIHRvIGB0cmVhc3VyeWAgYW5kIHRoZQptb2R1bGUgc3RheXMgaW4gU2V0dXAsIHNvIGl0cyBzZXR0ZXJzIGFuZCB1cGdyYWRlcyBhcmUgZnJvemVuIHVudGlsCmxhdW5jaC4gUGFuaWNzIGBBbHJlYWR5TGl2ZWAgb25jZSBsYXVuY2hlZC4AAAAAAAAHaGFuZG9mZgAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAA", "AAAAAAAAADlBZHZhbmNlIHRoZSBzdG9yYWdlIGxheW91dCBhZnRlciBhbiB1cGdyYWRlIChhZG1pbiBvbmx5KS4AAAAAAAAHbWlncmF0ZQAAAAAAAAAAAA==", "AAAAAAAAAM9NaW50IHRoZSBwb29sJ3MgbmV4dCBjaHVuayAoYXQgbW9zdCBgY29tbW9uOjpNQVhfUkVTVE9DS2ApIGludG8gdGhpcwpjb250cmFjdCdzIGN1c3RvZHkgYW5kIGFwcGVuZCB0aGUgaWRzIHRvIGl0cyBzdG9jayBwYWdlcy4gQW55b25lIG1heQpjYWxsIGl0IHVudGlsIHRoZSBwb29sIGNsb3NlcyBvciBleHBpcmVzLiBSZXR1cm5zIGhvdyBtYW55IGl0IG1pbnRlZC4AAAAAB3Jlc3RvY2sAAAAAAQAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAQAAAAQ=", "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAAAAAAAAIZ2V0X3Bvb2wAAAABAAAAAAAAAAdwb29sX2lkAAAAAAQAAAABAAAD6AAAB9AAAAAEUG9vbA==", "AAAAAAAAASVPcGVuIGEgcG9vbCBvZiBgc2l6ZWAgdG9rZW5zICh0aGUgVHJlYXN1cnksIGJ5IHByb3Bvc2FsLCBvbmNlIExpdmUpLgoKVGhlIHBvb2wgcmVzZXJ2ZXMgYHNpemVgIG9mIHRoZSBNYXJrZXRwbGFjZSdzIG1pbnQgYWxsb3dhbmNlIGZvcgppdHNlbGY6IHRoZSBhbGxvd2FuY2Ugbm90IHJlc2VydmVkIGJ5IG90aGVyIG9wZW4gcG9vbHMgbXVzdCBjb3ZlciBpdAooYEFsbG93YW5jZU5vdFJlc2VydmVkYCksIHNvIGNsb3Npbmcgb25lIHBvb2wgbmV2ZXIgc3RhcnZlcyBhbm90aGVyLgpSZXR1cm5zIHRoZSBwb29sIGlkLgAAAAAAAAlvcGVuX3Bvb2wAAAAAAAAHAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAABWFzc2V0AAAAAAAAEwAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAEc2l6ZQAAAAQAAAAAAAAADW1heF9wZXJfYnV5ZXIAAAAAAAAEAAAAAAAAABNtYXhfc29sZF9wZXJfcGVyaW9kAAAAAAQAAAAAAAAAC3BlcmlvZF9zZWNzAAAAAAYAAAABAAAABA==", "AAAAAAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAAR9DbG9zZSBhIHBvb2w6IHRoZSBUcmVhc3VyeSAoYnkgcHJvcG9zYWwpIGF0IGFueSB0aW1lLCBhbnlvbmUgb25jZSBpdApoYXMgZXhwaXJlZC4gR2l2ZXMgdGhlIHVuc3RvY2tlZCByZXN0IG9mIHRoZSBwb29sJ3MgcmVzZXJ2YXRpb24gYmFjawp0byB0aGUgVG9rZW4gKGByZWxlYXNlX21pbnRfYWxsb3dhbmNlYCwgd2hpY2ggc2F0dXJhdGVzIGlmIHRoZQpUcmVhc3VyeSBsb3dlcmVkIHRoZSBhbGxvd2FuY2UgbWVhbndoaWxlKS4gVW5zb2xkIHN0b2NrIHN0YXlzIGhlcmUKdW50aWwgYHN3ZWVwX3Bvb2xgLgAAAAAKY2xvc2VfcG9vbAAAAAAAAQAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAA==", "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAA", "AAAAAAAAAFhQb29scyBvcGVuZWQgYW5kIG5vdCB5ZXQgc3dlcHQgZW1wdHksIHdpdGggdGhlaXIgdW5zdG9ja2VkCnJlc2VydmF0aW9ucyBhbmQgcGFnZSBjb3VudHMuAAAACm9wZW5fcG9vbHMAAAAAAAAAAAABAAAD6gAAB9AAAAAIUG9vbFNsb3Q=", "AAAAAAAAADtUaGUgdG9rZW4gaWRzIG9uIG9uZSBzdG9jayBwYWdlIChlbXB0eSBvbmNlIHNvbGQgb3Igc3dlcHQpLgAAAAAKcG9vbF9zdG9jawAAAAAAAgAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAAAAAARwYWdlAAAABAAAAAEAAAPqAAAABA==", "AAAAAAAAANNSZXR1cm4gdXAgdG8gYE1BWF9TV0VFUGAgdW5zb2xkIHRva2VucyBvZiBhIGNsb3NlZCBwb29sIHRvIHRoZQpUcmVhc3VyeSwgZW1wdHlpbmcgaXRzIHN0b2NrIHBhZ2VzIGZyb20gdGhlIGxhc3QuIEFueW9uZSBtYXkgY2FsbCBpdAp1bnRpbCBpdCByZXR1cm5zIDAgKHBhZ2VzIGxlZnQpLiBCb3RoIGhvbGRlcnMgYXJlIG5vbi12b3RpbmcsIHNvIG5vCnZvdGVzIG1vdmUuAAAAAApzd2VlcF9wb29sAAAAAAABAAAAAAAAAAdwb29sX2lkAAAAAAQAAAABAAAABA==", "AAAAAAAAAAAAAAALZ2V0X2xpc3RpbmcAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAA+gAAAfQAAAAB0xpc3RpbmcA", "AAAAAAAAAB5JZCB0aGUgbmV4dCBwb29sIHdpbGwgcmVjZWl2ZS4AAAAAAAxuZXh0X3Bvb2xfaWQAAAAAAAAAAQAAAAQ=", "AAAAAAAAAodEQU8tb3duZWQga2V5cyBmb3IgdGhlIHJlbmV3YWwgc3dlZXAgKGBEYW9Nb2R1bGU6OnJlbmV3YWxfa2V5c2ApLgoKVGhlIGtleSBzcGFjZSBpcyBgTGlzdGluZygwLi5taW50ZWQpYCwgdGhlbiBmb3IgZWFjaCBvcGVuIHBvb2wgaXRzCmBQb29sKGlkKWAgYW5kIGBQb29sU3RvY2soaWQsIDAuLnBhZ2VzKWAgKGEgMTAwLXRva2VuIHBvb2wgaXMgMyBwYWdlcywKZW5nIHJldmlldyBSOCkuIFRoZSBib3VuZHMgY29tZSBmcm9tIGluc3RhbmNlIHN0b3JhZ2Ugb25seSwgc28gdGhlCnBhZ2UgYW5zd2VycyBldmVuIHdoZW4gdGhlIGVudHJpZXMgaGF2ZSBhcmNoaXZlZC4gTW9zdCBsaXN0aW5nIHNsb3RzCmhvbGQgbm90aGluZzsgdGhlIHN3ZWVwIHJlbmV3cyBvbmx5IHdoYXQgaXQgZmluZHMuIGBQb29sQnV5ZXJgIGNvdW50cwphcmUgdGhlIGJ1eWVycycgKGhvbGRlciBjbGFzcykuIFRoZSBiYWxhbmNlcyBoZWxkIGFyZSB0aGUgZXNjcm93ZWQgYW5kCnN0b2NrZWQgdG9rZW5zIGFuZCB0aGUgcGF5bWVudCBhc3NldHMgKGEgbGlzdGluZyBjcmVhdGVkIGJlZm9yZQpgc2V0X3BheW1lbnRfYXNzZXRgIG1heSBiZSBwcmljZWQgaW4gYW4gb2xkZXIgb25lOyB0aGUgc3dlZXAgcmVhZHMKdGhvc2UgZnJvbSB0aGUgbGlzdGluZ3MgaXQgZmluZHMpLgAAAAAMcmVuZXdhbF9rZXlzAAAAAgAAAAAAAAAGY3Vyc29yAAAAAAAEAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAH0AAAAAtSZW5ld2FsUGFnZQA=", "AAAAAAAAAGkqIGBhZG1pbmAgLSBzZXR1cC1waGFzZSBhZG1pbiBvZiB0aGUgcGFyYW1ldGVyIHNldHRlcnMgKHRoZSBsYXVuY2ggYWRtaW4pOwpiZWNvbWVzIHRoZSBUcmVhc3VyeSBhdCBsYXVuY2gAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAcAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAAdtYW5hZ2VyAAAAABMAAAAAAAAADGN1cnJlbnRfaGFzaAAAA+4AAAAgAAAAAAAAABlkZWZhdWx0X3NlY29uZGFyeV9mZWVfYnBzAAAAAAAABAAAAAA=", "AAAAAAAAASdCdXkgYHRva2VuX2lkYCBmcm9tIHBhZ2UgYHBhZ2VgIG9mIGEgcG9vbDogcGF5cyB0aGUgcG9vbCBwcmljZSB0byB0aGUKVHJlYXN1cnkgYW5kIHNlbmRzIHRoZSB0b2tlbiB0byBgYnV5ZXJgLiBSZWZ1c2VzIG9uY2UgdGhlIHBvb2wgaXMKY2xvc2VkIG9yIGV4cGlyZWQgKGBQb29sQ2xvc2VkYCksIHBhc3QgdGhlIGJ1eWVyJ3MgY2FwCihgQnV5ZXJMaW1pdFJlYWNoZWRgKSBvciB0aGUgcGVyaW9kJ3Mgc2FsZXMgKGBQb29sUmF0ZUxpbWl0ZWRgKSwgb3IKYWJvdmUgYG1heF9wcmljZWAgKGBQcmljZUFib3ZlTWF4YCkuAAAAAA1idXlfZnJvbV9wb29sAAAAAAAABQAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAAAAAARwYWdlAAAABAAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAACW1heF9wcmljZQAAAAAAAAsAAAAA", "AAAAAAAAADpUaGUgY29uZmlndXJlZCBwYXltZW50IGFzc2V0IChgRGFvTW9kdWxlOjpwYXltZW50X2Fzc2V0YCkuAAAAAAANcGF5bWVudF9hc3NldAAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAACtIb3cgbWFueSB0b2tlbnMgYGJ1eWVyYCBib3VnaHQgZnJvbSBhIHBvb2wuAAAAAA5wb29sX3B1cmNoYXNlcwAAAAAAAgAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAAAAAAVidXllcgAAAAAAABMAAAABAAAABA==", "AAAAAAAAAMxDb21tZW50IG9uIGB0b2tlbl9pZGAncyBzZWNvbmRhcnkgbGlzdGluZ3MuIE5vIGFjdGl2ZSBsaXN0aW5nIGlzCnJlcXVpcmVkLCBzbyB0aGUgdGhyZWFkIHN1cnZpdmVzIHJlbGlzdGluZy4gQW55b25lIG1heSBjb21tZW50LCBldmVuCndoaWxlIHBhdXNlZC4gRXZlbnQtb25seTogZW1pdHMgYExpc3RpbmdDb21tZW50ZWRgLCB3cml0ZXMgbm8gc3RvcmFnZS4AAAAPY29tbWVudF9saXN0aW5nAAAAAAMAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAEYm9keQAAABAAAAAAAAAABmF1dGhvcgAAAAAAEwAAAAA=", "AAAAAAAAADlTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4AAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAADtBc3NldCB1c2VkIGJ5IG5ldyBsaXN0aW5ncyAoZXhpc3RpbmcgbGlzdGluZ3Mga2VlcCB0aGVpcnMpLgAAAAARc2V0X3BheW1lbnRfYXNzZXQAAAAAAAABAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAA=", "AAAAAAAAAGFGZWUgYXBwbGllZCB0byBuZXcgbGlzdGluZ3MgKGV4aXN0aW5nIGxpc3RpbmdzIGtlZXAgdGhlaXJzKS4gQXQgbW9zdApgY29tbW9uOjpNQVhfRkVFX0JQU2AgKDI1JSkuAAAAAAAAFXNldF9zZWNvbmRhcnlfZmVlX2JwcwAAAAAAAAEAAAAAAAAAB2ZlZV9icHMAAAAABAAAAAA=", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAAAQAAACZPbmUgcGFnZSBvZiBgRGFvTW9kdWxlOjpyZW5ld2FsX2tleXNgLgAAAAAAAAAAAAtSZW5ld2FsUGFnZQAAAAADAAAAmUFzc2V0IGNvbnRyYWN0cyAodGhlIERBTyB0b2tlbiBpbmNsdWRlZCkgd2hvc2UgYEJhbGFuY2UobW9kdWxlKWAgZW50cnkKdGhlIG1vZHVsZSBob2xkcy4gUmVwb3J0ZWQgb24gdGhlIGZpcnN0IHBhZ2U7IGxhdGVyIHBhZ2VzIG1heSByZXBlYXQKb3Igb21pdCB0aGVtLgAAAAAAAAZhc3NldHMAAAAAA+oAAAATAAAB9GAoa2V5LCBwZXJzaXN0ZW50KWAgZm9yIGVhY2ggc3RvcmFnZSBlbnRyeSB0aGUgbW9kdWxlIGFza3MgdGhlIHN3ZWVwCnRvIGtlZXAgYWxpdmUuIGBrZXlgIGlzIHRoZSBleGFjdCBgVmFsYCB0aGUgbW9kdWxlIHN0b3JlcyB1bmRlciwKYWxyZWFkeSBuYW1lc3BhY2VkIChgY3JhdGU6Om5zYCksIHNvIHRoZSBzd2VlcCBidWlsZHMKYExlZGdlcktleTo6Q29udHJhY3REYXRhIHsgY29udHJhY3Q6IG1vZHVsZSwga2V5LCBkdXJhYmlsaXR5IH1gIGZyb20gaXQKZGlyZWN0bHk7IGBwZXJzaXN0ZW50YCBpcyBmYWxzZSBmb3IgdGVtcG9yYXJ5IGVudHJpZXMuIEluc3RhbmNlIGVudHJpZXMKYXJlIG5vdCBsaXN0ZWQ6IHRoZSBzd2VlcCByZW5ld3MgZXZlcnkgbW9kdWxlJ3MgaW5zdGFuY2UuIEEga2V5IG1heSBuYW1lCmFuIGVudHJ5IHRoYXQgZG9lcyBub3QgZXhpc3QgKGEgbGlzdGluZyBzbG90IG5vYm9keSB1c2VkKTsgdGhlIHN3ZWVwCnJlbmV3cyBvbmx5IHdoYXQgaXQgZmluZHMuAAAABGtleXMAAAPqAAAD7QAAAAIAAAAAAAAAAQAAADBDdXJzb3Igb2YgdGhlIG5leHQgcGFnZSwgYE5vbmVgIG9uIHRoZSBsYXN0IG9uZS4AAAALbmV4dF9jdXJzb3IAAAAD6AAAAAQ=", "AAAABQAAABVFbWl0dGVkIGJ5IGBtaWdyYXRlYC4AAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAAAAAAFGZyb21fc3RvcmFnZV92ZXJzaW9uAAAABAAAAAAAAAAAAAAAEnRvX3N0b3JhZ2VfdmVyc2lvbgAAAAAABAAAAAAAAAAC", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ token, admin, treasury, payment_asset, manager, current_hash, default_secondary_fee_bps }: { token: string | Address; admin: string | Address; treasury: string | Address; payment_asset: string | Address; manager: string | Address; current_hash: Uint8Array; default_secondary_fee_bps: number }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ token, admin, treasury, payment_asset, manager, current_hash, default_secondary_fee_bps }, options);
  }
  public readonly fromJson = {
    buy : this.txFromJson<void>,  list : this.txFromJson<void>,  admin : this.txFromJson<string>,  pause : this.txFromJson<void>,  cancel : this.txFromJson<void>,  expire : this.txFromJson<void>,  launch : this.txFromJson<void>,  handoff : this.txFromJson<void>,  migrate : this.txFromJson<void>,  restock : this.txFromJson<number>,  unpause : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  get_pool : this.txFromJson<Pool | null>,  open_pool : this.txFromJson<number>,  wasm_hash : this.txFromJson<Uint8Array>,  close_pool : this.txFromJson<void>,  get_config : this.txFromJson<MarketplaceConfig>,  open_pools : this.txFromJson<Array<PoolSlot>>,  pool_stock : this.txFromJson<Array<number>>,  sweep_pool : this.txFromJson<number>,  get_listing : this.txFromJson<Listing | null>,  next_pool_id : this.txFromJson<number>,  renewal_keys : this.txFromJson<RenewalPage>,  buy_from_pool : this.txFromJson<void>,  payment_asset : this.txFromJson<string>,  pool_purchases : this.txFromJson<number>,  comment_listing : this.txFromJson<void>,  storage_version : this.txFromJson<number>,  set_payment_asset : this.txFromJson<void>,  set_secondary_fee_bps : this.txFromJson<void>
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
   * Build a topics filter row for the "PoolSwept" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  poolSweptEventFilter(topicValues?: { pool_id?: number }): string[] {
    return this.spec.eventTopicFilter("PoolSwept", topicValues);
  }
  /**
   * Build a topics filter row for the "PoolClosed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  poolClosedEventFilter(topicValues?: { pool_id?: number }): string[] {
    return this.spec.eventTopicFilter("PoolClosed", topicValues);
  }
  /**
   * Build a topics filter row for the "PoolOpened" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  poolOpenedEventFilter(topicValues?: { pool_id?: number }): string[] {
    return this.spec.eventTopicFilter("PoolOpened", topicValues);
  }
  /**
   * Build a topics filter row for the "PoolPurchased" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  poolPurchasedEventFilter(topicValues?: { pool_id?: number; buyer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("PoolPurchased", topicValues);
  }
  /**
   * Build a topics filter row for the "PoolRestocked" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  poolRestockedEventFilter(topicValues?: { pool_id?: number }): string[] {
    return this.spec.eventTopicFilter("PoolRestocked", topicValues);
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
   * Build a topics filter row for the "ListingCommented" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingCommentedEventFilter(topicValues?: { token_id?: number; author?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ListingCommented", topicValues);
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
   * Build a topics filter row for the "MarketplaceInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplaceInitializedEventFilter(topicValues?: { token?: string | Address; admin?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MarketplaceInitialized", topicValues);
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
}