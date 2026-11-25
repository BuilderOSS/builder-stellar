import {Pool, MarketplaceConfig, PoolSlot, Listing, RenewalPage, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  /**
   * Buy a secondary listing (`buyer` signs; refused while paused or once
   * the listing expired, `ListingExpired`). Rejects (`PriceAboveMax`) if
   * the listing price exceeds `max_price`. The buyer pays the fee to the
   * Treasury and the rest to the seller, in the asset captured at list
   * time, and receives the token. Emits `ListingPurchased`.
   */
  buy({ token_id, buyer, max_price }: { token_id: number; buyer: string | Address; max_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * List `token_id` for `price` until `expires_at` (`seller` signs and
   * must own it; Live only; refused while paused). The token moves into
   * this contract's custody until it is bought, cancelled, expired, or
   * returned. The seller must first approve the Marketplace for the
   * token; in a locked DAO the Token refuses that approval, so no new
   * listing can be made. Emits `SecondaryListingCreated`.
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
  /**
   * Pause new listings, purchases, and pools (the admin). Cancel, expire,
   * restock, close, and sweep keep working. Emits `MarketplacePaused`.
   */
  pause(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Cancel a listing and take the token back (`seller` signs and must be
   * the listing's seller, `NotSeller`). Works while paused and after
   * expiry. Emits `ListingCancelled`.
   */
  cancel({ token_id, seller }: { token_id: number; seller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Return an expired listing's token to its seller (anyone may call;
   * `ListingActive` before the expiry). Works while paused. Emits
   * `ListingExpired`.
   */
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
   * Advance the storage layout after an upgrade (admin only;
   * `NothingToMigrate` when already current).
   */
  migrate(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Mint the pool's next chunk (at most `common::MAX_RESTOCK`) into this
   * contract's custody and append the ids to its stock pages. Anyone may
   * call it until the pool closes or expires (`PoolClosed`) or has stocked
   * its size (`PoolFullyStocked`); it spends this contract's allowance.
   * Emits `PoolRestocked` and returns how many it minted.
   */
  restock({ pool_id }: { pool_id: number }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Reopen the marketplace (the admin). Emits `MarketplaceUnpaused`.
   */
  unpause(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Replaces this contract's WASM with `to_hash` (admin only: the launch
   * admin in Setup, the Treasury by proposal once live). `from_hash` must
   * be the running hash, and the Manager must have approved the
   * `from_hash` to `to_hash` step (`common::upgrade::apply`).
   */
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The release version registered in the Manager for the running WASM
   * (read-only; `ImplementationNotFound` if the registry has none).
   */
  version(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Pool `pool_id`, if it was opened (read-only; kept after it closes).
   */
  get_pool({ pool_id }: { pool_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Pool | null>>;
  /**
   * Open a pool of `size` tokens (the Treasury, by proposal, once Live;
   * refused while paused).
   *
   * Buyers pay `price` of `asset`, a Stellar Asset Contract
   * (`NotStellarAsset`), until `expires_at`. Each buyer may buy at most
   * `max_per_buyer`, and the pool sells at most `max_sold_per_period` per
   * `period_secs` (`InvalidPool` if any of these is zero). The pool
   * reserves `size` of the Marketplace's mint allowance for itself: the
   * allowance not reserved by other open pools must cover it
   * (`AllowanceNotReserved`), so closing one pool never starves another.
   * At most `MAX_OPEN_POOLS` are open (`TooManyPools`). Emits `PoolOpened`
   * and returns the pool id.
   */
  open_pool({ price, asset, expires_at, size, max_per_buyer, max_sold_per_period, period_secs }: { price: bigint; asset: string | Address; expires_at: bigint; size: number; max_per_buyer: number; max_sold_per_period: number; period_secs: bigint }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * The running WASM hash (read-only).
   */
  wasm_hash(options?: MethodOptions): Promise<AssembledTransaction<Uint8Array>>;
  /**
   * Close a pool: the Treasury (by proposal) at any time, anyone once it
   * has expired. Gives the unstocked rest of the pool's reservation back
   * to the Token (`release_mint_allowance`, which saturates if the
   * Treasury lowered the allowance meanwhile). Unsold stock stays here
   * until `sweep_pool`. Emits `PoolClosed`.
   */
  close_pool({ pool_id }: { pool_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The configuration: wiring, payment asset, default fee, and pause state
   * (read-only).
   */
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
   * until it returns 0 (pages left); `PoolOpen` before `close_pool`. Both
   * holders are non-voting, so no votes move. Emits `PoolSwept`.
   */
  sweep_pool({ pool_id }: { pool_id: number }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * The live listing of `token_id`, if any (read-only; an expired listing
   * stays until `expire`).
   */
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
   * Buy `token_id` from page `page` of a pool (`buyer` signs; refused
   * while paused): pays the pool price to the Treasury and sends the
   * token to `buyer`. Refuses once the pool is closed or expired
   * (`PoolClosed`), past the buyer's cap (`BuyerLimitReached`) or the
   * period's sales (`PoolRateLimited`), above `max_price`
   * (`PriceAboveMax`), or when the token is not on that page
   * (`NotInPool`). Emits `PoolPurchased`.
   */
  buy_from_pool({ pool_id, page, token_id, buyer, max_price }: { pool_id: number; page: number; token_id: number; buyer: string | Address; max_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * The configured payment asset (`DaoModule::payment_asset`; read-only).
   * The Manager compares it with the asset recorded at `create_dao`
   * before launch.
   */
  payment_asset(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Send `token_id`, a membership token this contract holds that no
   * listing or pool records, to the Treasury (the admin, while paused,
   * `NotPaused`). For a token someone transferred here directly. A listed
   * token is refused (`ListingExists`: use `return_listing`), and so is
   * any token while a pool is not yet swept empty (`PoolOpen`), because
   * stock pages are not indexed by token. The Token's `Transfer` records
   * the move; no marketplace event is emitted.
   *
   * The Token refuses to unregister the Marketplace while it holds
   * tokens, so without this anyone could keep it registered by sending it
   * one.
   */
  recover_token({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * How many tokens `buyer` bought from a pool.
   */
  pool_purchases({ pool_id, buyer }: { pool_id: number; buyer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  /**
   * Return a listing's token to its seller and remove the listing, before
   * its expiry and without the seller (the admin: the Treasury, by
   * proposal; only while paused, `NotPaused`). No payment moves. Emits
   * `ListingCancelled`.
   *
   * This is how the DAO empties the Marketplace's escrow, for example
   * before unregistering it, which the Token refuses while the Marketplace
   * holds tokens. Without it, one listing with a distant expiry would keep
   * the Marketplace registered.
   */
  return_listing({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
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
   * Asset used by new listings (the admin; existing listings keep
   * theirs). It must be a Stellar Asset Contract (`NotStellarAsset`).
   * Emits `PaymentAssetUpdated`.
   */
  set_payment_asset({ payment_asset }: { payment_asset: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  /**
   * Fee applied to new listings (the admin; existing listings keep
   * theirs). At most `common::MAX_FEE_BPS` (25%, `InvalidFee`). Emits
   * `SecondaryFeeUpdated`.
   */
  set_secondary_fee_bps({ fee_bps }: { fee_bps: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAD9NYXJrZXRwbGFjZSBlcnJvcnMgKGJsb2NrIGBjb21tb246OmVycm9yOjpjb2Rlczo6TUFSS0VUUExBQ0VgKS4AAAAAAAAAABBNYXJrZXRwbGFjZUVycm9yAAAAHQAAAB5Db250cmFjdCBjb25maWd1cmF0aW9uIG1pc3NpbmcAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAeFQAAABVQcmljZSBpcyBub3QgcG9zaXRpdmUAAAAAAAAMSW52YWxpZFByaWNlAAAeFgAAABtFeHBpcnkgaXMgbm90IGluIHRoZSBmdXR1cmUAAAAADUludmFsaWRFeHBpcnkAAAAAAB4XAAAAQFRoZSB0b2tlbiBpcyBhbHJlYWR5IGxpc3RlZCAob3IsIGZvciBgcmVjb3Zlcl90b2tlbmAsIGlzIGxpc3RlZCkAAAANTGlzdGluZ0V4aXN0cwAAAAAAHhgAAAAPTm8gc3VjaCBsaXN0aW5nAAAAAA9MaXN0aW5nTm90Rm91bmQAAAAeGQAAABdUaGUgbGlzdGluZyBoYXMgZXhwaXJlZAAAAAAOTGlzdGluZ0V4cGlyZWQAAAAAHhoAAAAfVGhlIGxpc3RpbmcgaGFzIG5vdCBleHBpcmVkIHlldAAAAAANTGlzdGluZ0FjdGl2ZQAAAAAAHhsAAAAyVGhlIGNhbGxlciBpcyBub3QgdGhlIHRva2VuIG93bmVyIC8gbGlzdGluZyBzZWxsZXIAAAAAAAlOb3RTZWxsZXIAAAAAAB4cAAAAH0ZlZSBhYm92ZSBgY29tbW9uOjpNQVhfRkVFX0JQU2AAAAAACkludmFsaWRGZWUAAAAAHh0AAAAnQXJpdGhtZXRpYyBvdmVyZmxvdyBpbiBmZWUgY2FsY3VsYXRpb25zAAAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAAHh4AAABBYGxhdW5jaGAgdHJlYXN1cnkgZGlmZmVycyBmcm9tIHRoZSB0cmVhc3VyeSB3aXJlZCBhdCBjb25zdHJ1Y3Rpb24AAAAAAAAQVHJlYXN1cnlNaXNtYXRjaAAAHh8AAAA6VGhlIHBheW1lbnQgYXNzZXQgZGlmZmVycyBmcm9tIHRoZSBvbmUgdGhlIGNhbGxlciBleHBlY3RlZAAAAAAAFFBheW1lbnRBc3NldE1pc21hdGNoAAAeIAAAAENUaGUgbWFya2V0cGxhY2UgaXMgcGF1c2VkIChuZXcgbGlzdGluZ3MgYW5kIHB1cmNoYXNlcyBhcmUgcmVqZWN0ZWQpAAAAAAZQYXVzZWQAAAAAHiEAAAAyVGhlIGN1cnJlbnQgZmVlIGV4Y2VlZHMgdGhlIHNlbGxlcidzIGBtYXhfZmVlX2Jwc2AAAAAAAAtGZWVBYm92ZU1heAAAAB4iAAAAMVRoZSBsaXN0aW5nIHByaWNlIGV4Y2VlZHMgdGhlIGJ1eWVyJ3MgYG1heF9wcmljZWAAAAAAAAANUHJpY2VBYm92ZU1heAAAAAAAHiMAAAAVQ29tbWVudCBib2R5IGlzIGVtcHR5AAAAAAAADENvbW1lbnRFbXB0eQAAHiQAAAApQ29tbWVudCBib2R5IGV4Y2VlZHMgYE1BWF9DT01NRU5UX0xFTkdUSGAAAAAAAAAOQ29tbWVudFRvb0xvbmcAAAAAHiUAAABpVGhlIE1hcmtldHBsYWNlJ3MgYWxsb3dhbmNlIG5vdCByZXNlcnZlZCBieSBvcGVuIHBvb2xzIGlzIGJlbG93IHRoZQpwb29sIHNpemUgKGdyYW50IHRoZSBhbGxvd2FuY2UgZmlyc3QpAAAAAAAAFEFsbG93YW5jZU5vdFJlc2VydmVkAAAeJgAAAAxObyBzdWNoIHBvb2wAAAAMUG9vbE5vdEZvdW5kAAAeJwAAACVUaGUgcG9vbCBpcyBjbG9zZWQgb3IgcGFzdCBpdHMgZXhwaXJ5AAAAAAAAClBvb2xDbG9zZWQAAAAAHigAAAAsVGhlIGJ1eWVyIHJlYWNoZWQgdGhlIHBvb2wncyBgbWF4X3Blcl9idXllcmAAAAARQnV5ZXJMaW1pdFJlYWNoZWQAAAAAAB4pAAAAL1RoZSBwb29sIHNvbGQgYG1heF9zb2xkX3Blcl9wZXJpb2RgIHRoaXMgcGVyaW9kAAAAAA9Qb29sUmF0ZUxpbWl0ZWQAAAAeKgAAAEBUaGUgdG9rZW4gaXMgbm90IGluIHRoYXQgcG9vbCBzdG9jayBwYWdlIChzb2xkLCBvciBhbm90aGVyIHBhZ2UpAAAACU5vdEluUG9vbAAAAAAAHisAAAA7YE1BWF9PUEVOX1BPT0xTYCBwb29scyBhcmUgb3BlbiAoY2xvc2UgYW5kIHN3ZWVwIG9uZSBmaXJzdCkAAAAADFRvb01hbnlQb29scwAAHiwAAABjYHN3ZWVwX3Bvb2xgIG9uIGEgcG9vbCB0aGF0IGlzIHN0aWxsIG9wZW4sIG9yIGByZWNvdmVyX3Rva2VuYCB3aGlsZQphbnkgcG9vbCBpcyBub3QgeWV0IHN3ZXB0IGVtcHR5AAAAAAhQb29sT3BlbgAAHi0AAAA0QSBwb29sIHNpemUsIGJ1eWVyIGNhcCwgc2FsZXMgcmF0ZSBvciBwZXJpb2Qgb2YgemVybwAAAAtJbnZhbGlkUG9vbAAAAB4uAAAAI1RoZSBwb29sIGhhcyBzdG9ja2VkIGl0cyB3aG9sZSBzaXplAAAAABBQb29sRnVsbHlTdG9ja2VkAAAeLwAAADFUaGUgcGF5bWVudCBhc3NldCBpcyBub3QgYSBTdGVsbGFyIEFzc2V0IENvbnRyYWN0AAAAAAAAD05vdFN0ZWxsYXJBc3NldAAAAB4wAAAAUmByZXR1cm5fbGlzdGluZ2Agb3IgYHJlY292ZXJfdG9rZW5gIHdoaWxlIHRoZSBtYXJrZXRwbGFjZSBpcyBvcGVuCihwYXVzZSBpdCBmaXJzdCkAAAAAAAlOb3RQYXVzZWQAAAAAAB4x", "AAAABQAAAElgY291bnRgIHVuc29sZCB0b2tlbnMgcmV0dXJuZWQgdG8gdGhlIFRyZWFzdXJ5OyBgcGFnZXNfbGVmdGAgMCB3aGVuIGRvbmUuAAAAAAAAAAAAAAlQb29sU3dlcHQAAAAAAAABAAAACnBvb2xfc3dlcHQAAAAAAAMAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAAAAAAABWNvdW50AAAAAAAABAAAAAAAAAAAAAAACnBhZ2VzX2xlZnQAAAAAAAQAAAAAAAAAAg==", "AAAABQAAAEBBIHBvb2wgY2xvc2VkOyBgcmVsZWFzZWRgIGlzIHRoZSB1bnN0b2NrZWQgYWxsb3dhbmNlIGdpdmVuIGJhY2suAAAAAAAAAApQb29sQ2xvc2VkAAAAAAABAAAAC3Bvb2xfY2xvc2VkAAAAAAIAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAAAAAAACHJlbGVhc2VkAAAABAAAAAAAAAAC", "AAAABQAAACZBIHF1aWNrLWJ1eSBwb29sIG9wZW5lZCAoYnkgcHJvcG9zYWwpLgAAAAAAAAAAAApQb29sT3BlbmVkAAAAAAABAAAAC3Bvb2xfb3BlbmVkAAAAAAgAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAAAAAABWFzc2V0AAAAAAAAEwAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAAAAAARzaXplAAAABAAAAAAAAAAAAAAADW1heF9wZXJfYnV5ZXIAAAAAAAAEAAAAAAAAAAAAAAATbWF4X3NvbGRfcGVyX3BlcmlvZAAAAAAEAAAAAAAAAAAAAAALcGVyaW9kX3NlY3MAAAAABgAAAAAAAAAC", "AAAABQAAACZBIGJ1eWVyIHBpY2tlZCBgdG9rZW5faWRgIGZyb20gYSBwb29sLgAAAAAAAAAAAA1Qb29sUHVyY2hhc2VkAAAAAAAAAQAAAA5wb29sX3B1cmNoYXNlZAAAAAAABQAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAQAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAAI=", "AAAABQAAAERgY291bnRgIHRva2VucyBmcm9tIGBmaXJzdF90b2tlbl9pZGAgbWludGVkIGludG8gdGhlIHBvb2wncyBjdXN0b2R5LgAAAAAAAAANUG9vbFJlc3RvY2tlZAAAAAAAAAEAAAAOcG9vbF9yZXN0b2NrZWQAAAAAAAQAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAAAAAAADmZpcnN0X3Rva2VuX2lkAAAAAAAEAAAAAAAAAAAAAAAFY291bnQAAAAAAAAEAAAAAAAAAAAAAAAHc3RvY2tlZAAAAAAEAAAAAAAAAAI=", "AAAABQAAADtgZXhwaXJlYDogYW4gZXhwaXJlZCBsaXN0aW5nJ3MgdG9rZW4gd2VudCBiYWNrIHRvIGBzZWxsZXJgLgAAAAAAAAAADkxpc3RpbmdFeHBpcmVkAAAAAAABAAAAD2xpc3RpbmdfZXhwaXJlZAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAAAg==", "AAAABQAAAG9UaGUgbGlzdGluZyBlbmRlZCBhbmQgYHRva2VuX2lkYCB3ZW50IGJhY2sgdG8gYHNlbGxlcmA6IHRoZSBzZWxsZXIncwpgY2FuY2VsYCwgb3IgdGhlIGFkbWluJ3MgYHJldHVybl9saXN0aW5nYC4AAAAAAAAAABBMaXN0aW5nQ2FuY2VsbGVkAAAAAQAAABFsaXN0aW5nX2NhbmNlbGxlZAAAAAAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAC", "AAAABQAAAIdBIGNvbW1lbnQgb24gYSB0b2tlbidzIHNlY29uZGFyeSBsaXN0aW5ncy4gS2V5ZWQgYnkgdG9rZW4sIHNvIHRoZSB0aHJlYWQKY2FycmllcyBvdmVyIHJlbGlzdGluZ3MuIEV2ZW50LW9ubHk6IHRoZSBib2R5IGlzIG5ldmVyIHN0b3JlZC4AAAAAAAAAABBMaXN0aW5nQ29tbWVudGVkAAAAAQAAABFsaXN0aW5nX2NvbW1lbnRlZAAAAAAAAAMAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAABmF1dGhvcgAAAAAAEwAAAAEAAAAAAAAABGJvZHkAAAAQAAAAAAAAAAI=", "AAAABQAAAFpgYnV5YDogYGJ1eWVyYCBwYWlkIGBwcmljZWAgKG9mIHdoaWNoIGBmZWVgIHdlbnQgdG8gdGhlIFRyZWFzdXJ5KSBhbmQKcmVjZWl2ZWQgYHRva2VuX2lkYC4AAAAAAAAAAAAQTGlzdGluZ1B1cmNoYXNlZAAAAAEAAAARbGlzdGluZ19wdXJjaGFzZWQAAAAAAAAGAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAAAVidXllcgAAAAAAABMAAAABAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAAAAAAAANmZWUAAAAACwAAAAAAAAAAAAAADXBheW1lbnRfYXNzZXQAAAAAAAATAAAAAAAAAAI=", "AAAABQAAAD1UaGUgbWFya2V0cGxhY2UgcGF1c2VkOiBubyBuZXcgbGlzdGluZ3MsIHB1cmNoYXNlcywgb3IgcG9vbHMuAAAAAAAAAAAAABFNYXJrZXRwbGFjZVBhdXNlZAAAAAAAAAEAAAASbWFya2V0cGxhY2VfcGF1c2VkAAAAAAABAAAAOVRoZSBhZG1pbiwgb3IgdGhlIE1hbmFnZXIgd2hlbiBgbGF1bmNoYCBmb3JjZXMgdGhlIHBhdXNlLgAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAQAAAAI=", "AAAABQAAAEdFbWl0dGVkIG9uY2Ugd2hlbiB0aGUgTWFuYWdlciBsYXVuY2hlcyB0aGUgbWFya2V0cGxhY2UgKFNldHVwIC0+IExpdmUpLgAAAAAAAAAAE01hcmtldHBsYWNlTGF1bmNoZWQAAAAAAQAAABRtYXJrZXRwbGFjZV9sYXVuY2hlZAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAEAAAAvV2hldGhlciB0aGUgbWFya2V0cGxhY2Ugd2FzIHVucGF1c2VkIGF0IGxhdW5jaC4AAAAABm9wZW5lZAAAAAAAAQAAAAAAAAAC", "AAAABQAAABlUaGUgbWFya2V0cGxhY2UgcmVvcGVuZWQuAAAAAAAAAAAAABNNYXJrZXRwbGFjZVVucGF1c2VkAAAAAAEAAAAUbWFya2V0cGxhY2VfdW5wYXVzZWQAAAABAAAAPlRoZSBhZG1pbiwgb3IgdGhlIE1hbmFnZXIgd2hlbiBgbGF1bmNoYCBvcGVucyB0aGUgbWFya2V0cGxhY2UuAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAEAAAAC", "AAAABQAAAEBgc2V0X3BheW1lbnRfYXNzZXRgOiBuZXcgbGlzdGluZ3MgYXJlIHByaWNlZCBpbiBgcGF5bWVudF9hc3NldGAuAAAAAAAAABNQYXltZW50QXNzZXRVcGRhdGVkAAAAAAEAAAAVcGF5bWVudF9hc3NldF91cGRhdGVkAAAAAAAAAgAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAQAAAAI=", "AAAABQAAADZgc2V0X3NlY29uZGFyeV9mZWVfYnBzYDogdGhlIGZlZSBuZXcgbGlzdGluZ3MgY2FwdHVyZS4AAAAAAAAAAAATU2Vjb25kYXJ5RmVlVXBkYXRlZAAAAAABAAAAFXNlY29uZGFyeV9mZWVfdXBkYXRlZAAAAAAAAAIAAAAAAAAAB2ZlZV9icHMAAAAABAAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAABAAAAAg==", "AAAABQAAAEFFbWl0dGVkIG9uY2UgYnkgdGhlIGNvbnN0cnVjdG9yLCB3aXRoIHRoZSBzdGFydGluZyBjb25maWd1cmF0aW9uLgAAAAAAAAAAAAAWTWFya2V0cGxhY2VJbml0aWFsaXplZAAAAAAAAQAAABdtYXJrZXRwbGFjZV9pbml0aWFsaXplZAAAAAAFAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAAAAAAGWRlZmF1bHRfc2Vjb25kYXJ5X2ZlZV9icHMAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAADpgbGlzdGA6IGB0b2tlbl9pZGAgaXMgZXNjcm93ZWQgaGVyZSBvbiB0aGUgY2FwdHVyZWQgdGVybXMuAAAAAAAAAAAAF1NlY29uZGFyeUxpc3RpbmdDcmVhdGVkAAAAAAEAAAAZc2Vjb25kYXJ5X2xpc3RpbmdfY3JlYXRlZAAAAAAAAAYAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAC", "AAAAAQAAAK1BIHF1aWNrLWJ1eSBwb29sOiBzdG9jayBtaW50ZWQgaW50byB0aGUgTWFya2V0cGxhY2UncyBjdXN0b2R5IGFuZCBzb2xkIGF0Cm9uZSBwcmljZSwgd2l0aCBhIHBlci1idXllciBjYXAgYW5kIGEgcG9vbC13aWRlIHNhbGVzIHJhdGUKKGRvY3MvZGVzaWducy9tZW1iZXJzaGlwLW1vZGVscy5tZCDCpzQpLgAAAAAAAAAAAAAEUG9vbAAAAAwAAAApVGhlIFN0ZWxsYXIgQXNzZXQgQ29udHJhY3QgYnV5ZXJzIHBheSBpbi4AAAAAAAAFYXNzZXQAAAAAAAATAAAAPlNldCBieSBgY2xvc2VfcG9vbGA7IGEgY2xvc2VkIHBvb2wgc2VsbHMgYW5kIHJlc3RvY2tzIG5vdGhpbmcuAAAAAAAGY2xvc2VkAAAAAAABAAAAMVNhbGVzIGFuZCByZXN0b2NrcyBzdG9wIGF0IHRoaXMgbGVkZ2VyIHRpbWVzdGFtcC4AAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAC1Nb3N0IHRva2VucyBvbmUgYnV5ZXIgbWF5IGJ1eSBmcm9tIHRoaXMgcG9vbC4AAAAAAAANbWF4X3Blcl9idXllcgAAAAAAAAQAAAAoTW9zdCBzYWxlcyBwZXIgYHBlcmlvZF9zZWNzYCwgcG9vbC13aWRlLgAAABNtYXhfc29sZF9wZXJfcGVyaW9kAAAAAAQAAAAlTGVuZ3RoIG9mIGEgc2FsZXMgcGVyaW9kLCBpbiBzZWNvbmRzLgAAAAAAAAtwZXJpb2Rfc2VjcwAAAAAGAAAAJldoZW4gdGhlIGN1cnJlbnQgc2FsZXMgcGVyaW9kIHN0YXJ0ZWQuAAAAAAAMcGVyaW9kX3N0YXJ0AAAABgAAAB9QcmljZSBvZiBvbmUgdG9rZW4sIGluIGBhc3NldGAuAAAAAAVwcmljZQAAAAAAAAsAAAA9VG9rZW5zIHRoZSBwb29sIG1heSBzdG9jayBpbiBhbGwgKGl0cyBhbGxvd2FuY2UgcmVzZXJ2YXRpb24pLgAAAAAAAARzaXplAAAABAAAABNUb2tlbnMgc29sZCBzbyBmYXIuAAAAAARzb2xkAAAABAAAABxTYWxlcyBpbiB0aGUgY3VycmVudCBwZXJpb2QuAAAADnNvbGRfaW5fcGVyaW9kAAAAAAAEAAAAI1Rva2VucyBtaW50ZWQgaW50byB0aGUgcG9vbCBzbyBmYXIuAAAAAAdzdG9ja2VkAAAAAAQ=", "AAAAAQAAADZTZWNvbmRhcnkgKGVzY3Jvd2VkLXRva2VuKSBsaXN0aW5nLCBrZXllZCBieSB0b2tlbiBpZC4AAAAAAAAAAAAHTGlzdGluZwAAAAAFAAAAPVB1cmNoYXNlcyBzdG9wLCBhbmQgYGV4cGlyZWAgb3BlbnMsIGF0IHRoaXMgbGVkZ2VyIHRpbWVzdGFtcC4AAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAADhGZWUgY2FwdHVyZWQgYXQgbGlzdCB0aW1lLCBpbiBiYXNpcyBwb2ludHMgb2YgdGhlIHByaWNlLgAAAAdmZWVfYnBzAAAAAAQAAABOQXNzZXQgY2FwdHVyZWQgYXQgbGlzdCB0aW1lOyBsYXRlciBgc2V0X3BheW1lbnRfYXNzZXRgIGNhbGxzIGRvIG5vdCBhZmZlY3QgaXQuAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAhQXNraW5nIHByaWNlLCBpbiBgcGF5bWVudF9hc3NldGAuAAAAAAAABXByaWNlAAAAAAAACwAAAEJXaG8gbGlzdGVkIHRoZSB0b2tlbiBhbmQgcmVjZWl2ZXMgdGhlIHByb2NlZWRzLCBvciB0aGUgdG9rZW4gYmFjay4AAAAAAAZzZWxsZXIAAAAAABM=", "AAAAAQAAAERJbnN0YW5jZSBib29ra2VlcGluZyBmb3IgYW4gb3BlbiBwb29sIChvcGVuZWQsIG5vdCB5ZXQgc3dlcHQgZW1wdHkpLgAAAAAAAAAIUG9vbFNsb3QAAAADAAAANFN0b2NrIHBhZ2VzIHdyaXR0ZW4sIGBQb29sU3RvY2socG9vbF9pZCwgMC4ucGFnZXMpYC4AAAAFcGFnZXMAAAAAAAAEAAAAAAAAAAdwb29sX2lkAAAAAAQAAAA/VGhlIHBvb2wncyBzaGFyZSBvZiB0aGUgTWFya2V0cGxhY2UncyBhbGxvd2FuY2Ugbm90IHlldCBtaW50ZWQuAAAAAAl1bnN0b2NrZWQAAAAAAAAE", "AAAAAQAAACZUaGUgTWFya2V0cGxhY2UncyB3aXJpbmcgYW5kIHNldHRpbmdzLgAAAAAAAAAAABFNYXJrZXRwbGFjZUNvbmZpZwAAAAAAAAYAAABCRmVlIG5ldyBsaXN0aW5ncyBjYXB0dXJlLCBpbiBiYXNpcyBwb2ludHMgKGF0IG1vc3QgYE1BWF9GRUVfQlBTYCkuAAAAAAAZZGVmYXVsdF9zZWNvbmRhcnlfZmVlX2JwcwAAAAAAAAQAAAA7VGhlIE1hbmFnZXIgdGhhdCBhcHByb3ZlcyB1cGdyYWRlcyBhbmQgcGVyZm9ybXMgdGhlIGxhdW5jaC4AAAAAB21hbmFnZXIAAAAAEwAAADFXaGlsZSB0cnVlLCBubyBuZXcgbGlzdGluZ3MsIHB1cmNoYXNlcywgb3IgcG9vbHMuAAAAAAAABnBhdXNlZAAAAAAAAQAAADtBc3NldCBuZXcgbGlzdGluZ3MgYXJlIHByaWNlZCBpbiwgYSBTdGVsbGFyIEFzc2V0IENvbnRyYWN0LgAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAbVGhlIERBTydzIG1lbWJlcnNoaXAgdG9rZW4uAAAAAAV0b2tlbgAAAAAAABMAAABLRmVlIGFuZCBwcmltYXJ5LXNhbGUgcmVjaXBpZW50LiBBbHNvIHRoZSBhZG1pbiBvbmNlIGxpdmUgKGBjb21tb246OmFkbWluYCkuAAAAAAh0cmVhc3VyeQAAABM=", "AAAAAAAAAUlCdXkgYSBzZWNvbmRhcnkgbGlzdGluZyAoYGJ1eWVyYCBzaWduczsgcmVmdXNlZCB3aGlsZSBwYXVzZWQgb3Igb25jZQp0aGUgbGlzdGluZyBleHBpcmVkLCBgTGlzdGluZ0V4cGlyZWRgKS4gUmVqZWN0cyAoYFByaWNlQWJvdmVNYXhgKSBpZgp0aGUgbGlzdGluZyBwcmljZSBleGNlZWRzIGBtYXhfcHJpY2VgLiBUaGUgYnV5ZXIgcGF5cyB0aGUgZmVlIHRvIHRoZQpUcmVhc3VyeSBhbmQgdGhlIHJlc3QgdG8gdGhlIHNlbGxlciwgaW4gdGhlIGFzc2V0IGNhcHR1cmVkIGF0IGxpc3QKdGltZSwgYW5kIHJlY2VpdmVzIHRoZSB0b2tlbi4gRW1pdHMgYExpc3RpbmdQdXJjaGFzZWRgLgAAAAAAAANidXkAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAACW1heF9wcmljZQAAAAAAAAsAAAAA", "AAAAAAAAAr5MaXN0IGB0b2tlbl9pZGAgZm9yIGBwcmljZWAgdW50aWwgYGV4cGlyZXNfYXRgIChgc2VsbGVyYCBzaWducyBhbmQKbXVzdCBvd24gaXQ7IExpdmUgb25seTsgcmVmdXNlZCB3aGlsZSBwYXVzZWQpLiBUaGUgdG9rZW4gbW92ZXMgaW50bwp0aGlzIGNvbnRyYWN0J3MgY3VzdG9keSB1bnRpbCBpdCBpcyBib3VnaHQsIGNhbmNlbGxlZCwgZXhwaXJlZCwgb3IKcmV0dXJuZWQuIFRoZSBzZWxsZXIgbXVzdCBmaXJzdCBhcHByb3ZlIHRoZSBNYXJrZXRwbGFjZSBmb3IgdGhlCnRva2VuOyBpbiBhIGxvY2tlZCBEQU8gdGhlIFRva2VuIHJlZnVzZXMgdGhhdCBhcHByb3ZhbCwgc28gbm8gbmV3Cmxpc3RpbmcgY2FuIGJlIG1hZGUuIEVtaXRzIGBTZWNvbmRhcnlMaXN0aW5nQ3JlYXRlZGAuCgpUaGUgZmVlIGFuZCBwYXltZW50IGFzc2V0IGluIGZvcmNlIGFyZSBjYXB0dXJlZCBpbiB0aGUgbGlzdGluZy4KYG1heF9mZWVfYnBzYCBhbmQgYHBheW1lbnRfYXNzZXRgIGFyZSB0aGUgdGVybXMgdGhlIHNlbGxlciBzaWduZWQgZm9yOgp0aGUgY2FsbCBmYWlscyAoYEZlZUFib3ZlTWF4YCAvIGBQYXltZW50QXNzZXRNaXNtYXRjaGApIGlmIHRoZSBjdXJyZW50CmNvbmZpZyBpcyB3b3JzZSwgc28gYSBmZWUgb3IgYXNzZXQgY2hhbmdlIGxhbmRpbmcgYmV0d2VlbiBzaWduaW5nIGFuZAppbmNsdXNpb24gY2Fubm90IGFwcGx5IHRvIHRoaXMgbGlzdGluZy4AAAAAAARsaXN0AAAABgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAALbWF4X2ZlZV9icHMAAAAABAAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAA", "AAAAAAAAAERNb2R1bGUgYWRtaW46IHRoZSBsYXVuY2ggYWRtaW4gZHVyaW5nIHNldHVwLCB0aGUgVHJlYXN1cnkgb25jZSBsaXZlLgAAAAVhZG1pbgAAAAAAAAAAAAABAAAAEw==", "AAAAAAAAAIhQYXVzZSBuZXcgbGlzdGluZ3MsIHB1cmNoYXNlcywgYW5kIHBvb2xzICh0aGUgYWRtaW4pLiBDYW5jZWwsIGV4cGlyZSwKcmVzdG9jaywgY2xvc2UsIGFuZCBzd2VlcCBrZWVwIHdvcmtpbmcuIEVtaXRzIGBNYXJrZXRwbGFjZVBhdXNlZGAuAAAABXBhdXNlAAAAAAAAAAAAAAA=", "AAAAAAAAAKdDYW5jZWwgYSBsaXN0aW5nIGFuZCB0YWtlIHRoZSB0b2tlbiBiYWNrIChgc2VsbGVyYCBzaWducyBhbmQgbXVzdCBiZQp0aGUgbGlzdGluZydzIHNlbGxlciwgYE5vdFNlbGxlcmApLiBXb3JrcyB3aGlsZSBwYXVzZWQgYW5kIGFmdGVyCmV4cGlyeS4gRW1pdHMgYExpc3RpbmdDYW5jZWxsZWRgLgAAAAAGY2FuY2VsAAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAA=", "AAAAAAAAAJFSZXR1cm4gYW4gZXhwaXJlZCBsaXN0aW5nJ3MgdG9rZW4gdG8gaXRzIHNlbGxlciAoYW55b25lIG1heSBjYWxsOwpgTGlzdGluZ0FjdGl2ZWAgYmVmb3JlIHRoZSBleHBpcnkpLiBXb3JrcyB3aGlsZSBwYXVzZWQuIEVtaXRzCmBMaXN0aW5nRXhwaXJlZGAuAAAAAAAABmV4cGlyZQAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAA==", "AAAAAAAAAatPbmUtc2hvdCwgTWFuYWdlci1vbmx5IGxhdW5jaCAoU2V0dXAgLT4gTGl2ZSksIGBEYW9Nb2R1bGU6OmxhdW5jaGAuCgpgdHJlYXN1cnlgIG11c3QgZXF1YWwgdGhlIHRyZWFzdXJ5IHdpcmVkIGF0IGNvbnN0cnVjdGlvbiAod2lyaW5nIGlzCmltbXV0YWJsZSkuIEhhbmRzIHRoZSBhZG1pbiB0byB0aGUgdHJlYXN1cnkgdW5sZXNzIGBoYW5kb2ZmYCBhbHJlYWR5CmRpZC4gVGhlIG1hcmtldHBsYWNlIGlzIGxlZnQgdW5wYXVzZWQgd2hlbiBgb3BlbmAgaXMgdHJ1ZSBhbmQgZm9yY2VkCnBhdXNlZCBvdGhlcndpc2UuIFRoZSBNYW5hZ2VyIGNoZWNrcyB0aGUgcGF5bWVudCBhc3NldCBhZ2FpbnN0IHRoZSBvbmUKcmVjb3JkZWQgYXQgYGNyZWF0ZV9kYW9gIGJlZm9yZSBjYWxsaW5nLiBBIHNlY29uZCBjYWxsIHBhbmljcyB3aXRoCmBBbHJlYWR5TGl2ZWAuAAAAAAZsYXVuY2gAAAAAAAIAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAEb3BlbgAAAAEAAAAA", "AAAAAAAAALFNYW5hZ2VyLW9ubHkgZWFybHkgaGFuZG9mZjogdGhlIGFkbWluIG1vdmVzIHRvIGB0cmVhc3VyeWAgYW5kIHRoZQptb2R1bGUgc3RheXMgaW4gU2V0dXAsIHNvIGl0cyBzZXR0ZXJzIGFuZCB1cGdyYWRlcyBhcmUgZnJvemVuIHVudGlsCmxhdW5jaC4gUGFuaWNzIGBBbHJlYWR5TGl2ZWAgb25jZSBsYXVuY2hlZC4AAAAAAAAHaGFuZG9mZgAAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAA", "AAAAAAAAAGJBZHZhbmNlIHRoZSBzdG9yYWdlIGxheW91dCBhZnRlciBhbiB1cGdyYWRlIChhZG1pbiBvbmx5OwpgTm90aGluZ1RvTWlncmF0ZWAgd2hlbiBhbHJlYWR5IGN1cnJlbnQpLgAAAAAAB21pZ3JhdGUAAAAAAAAAAAA=", "AAAAAAAAAUpNaW50IHRoZSBwb29sJ3MgbmV4dCBjaHVuayAoYXQgbW9zdCBgY29tbW9uOjpNQVhfUkVTVE9DS2ApIGludG8gdGhpcwpjb250cmFjdCdzIGN1c3RvZHkgYW5kIGFwcGVuZCB0aGUgaWRzIHRvIGl0cyBzdG9jayBwYWdlcy4gQW55b25lIG1heQpjYWxsIGl0IHVudGlsIHRoZSBwb29sIGNsb3NlcyBvciBleHBpcmVzIChgUG9vbENsb3NlZGApIG9yIGhhcyBzdG9ja2VkCml0cyBzaXplIChgUG9vbEZ1bGx5U3RvY2tlZGApOyBpdCBzcGVuZHMgdGhpcyBjb250cmFjdCdzIGFsbG93YW5jZS4KRW1pdHMgYFBvb2xSZXN0b2NrZWRgIGFuZCByZXR1cm5zIGhvdyBtYW55IGl0IG1pbnRlZC4AAAAAAAdyZXN0b2NrAAAAAAEAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAAE", "AAAAAAAAAEBSZW9wZW4gdGhlIG1hcmtldHBsYWNlICh0aGUgYWRtaW4pLiBFbWl0cyBgTWFya2V0cGxhY2VVbnBhdXNlZGAuAAAAB3VucGF1c2UAAAAAAAAAAAA=", "AAAAAAAAAQBSZXBsYWNlcyB0aGlzIGNvbnRyYWN0J3MgV0FTTSB3aXRoIGB0b19oYXNoYCAoYWRtaW4gb25seTogdGhlIGxhdW5jaAphZG1pbiBpbiBTZXR1cCwgdGhlIFRyZWFzdXJ5IGJ5IHByb3Bvc2FsIG9uY2UgbGl2ZSkuIGBmcm9tX2hhc2hgIG11c3QKYmUgdGhlIHJ1bm5pbmcgaGFzaCwgYW5kIHRoZSBNYW5hZ2VyIG11c3QgaGF2ZSBhcHByb3ZlZCB0aGUKYGZyb21faGFzaGAgdG8gYHRvX2hhc2hgIHN0ZXAgKGBjb21tb246OnVwZ3JhZGU6OmFwcGx5YCkuAAAAB3VwZ3JhZGUAAAAAAgAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAB3RvX2hhc2gAAAAD7gAAACAAAAAA", "AAAAAAAAAIJUaGUgcmVsZWFzZSB2ZXJzaW9uIHJlZ2lzdGVyZWQgaW4gdGhlIE1hbmFnZXIgZm9yIHRoZSBydW5uaW5nIFdBU00KKHJlYWQtb25seTsgYEltcGxlbWVudGF0aW9uTm90Rm91bmRgIGlmIHRoZSByZWdpc3RyeSBoYXMgbm9uZSkuAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=", "AAAAAAAAAENQb29sIGBwb29sX2lkYCwgaWYgaXQgd2FzIG9wZW5lZCAocmVhZC1vbmx5OyBrZXB0IGFmdGVyIGl0IGNsb3NlcykuAAAAAAhnZXRfcG9vbAAAAAEAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAEAAAPoAAAH0AAAAARQb29s", "AAAAAAAAAn9PcGVuIGEgcG9vbCBvZiBgc2l6ZWAgdG9rZW5zICh0aGUgVHJlYXN1cnksIGJ5IHByb3Bvc2FsLCBvbmNlIExpdmU7CnJlZnVzZWQgd2hpbGUgcGF1c2VkKS4KCkJ1eWVycyBwYXkgYHByaWNlYCBvZiBgYXNzZXRgLCBhIFN0ZWxsYXIgQXNzZXQgQ29udHJhY3QKKGBOb3RTdGVsbGFyQXNzZXRgKSwgdW50aWwgYGV4cGlyZXNfYXRgLiBFYWNoIGJ1eWVyIG1heSBidXkgYXQgbW9zdApgbWF4X3Blcl9idXllcmAsIGFuZCB0aGUgcG9vbCBzZWxscyBhdCBtb3N0IGBtYXhfc29sZF9wZXJfcGVyaW9kYCBwZXIKYHBlcmlvZF9zZWNzYCAoYEludmFsaWRQb29sYCBpZiBhbnkgb2YgdGhlc2UgaXMgemVybykuIFRoZSBwb29sCnJlc2VydmVzIGBzaXplYCBvZiB0aGUgTWFya2V0cGxhY2UncyBtaW50IGFsbG93YW5jZSBmb3IgaXRzZWxmOiB0aGUKYWxsb3dhbmNlIG5vdCByZXNlcnZlZCBieSBvdGhlciBvcGVuIHBvb2xzIG11c3QgY292ZXIgaXQKKGBBbGxvd2FuY2VOb3RSZXNlcnZlZGApLCBzbyBjbG9zaW5nIG9uZSBwb29sIG5ldmVyIHN0YXJ2ZXMgYW5vdGhlci4KQXQgbW9zdCBgTUFYX09QRU5fUE9PTFNgIGFyZSBvcGVuIChgVG9vTWFueVBvb2xzYCkuIEVtaXRzIGBQb29sT3BlbmVkYAphbmQgcmV0dXJucyB0aGUgcG9vbCBpZC4AAAAACW9wZW5fcG9vbAAAAAAAAAcAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAARzaXplAAAABAAAAAAAAAANbWF4X3Blcl9idXllcgAAAAAAAAQAAAAAAAAAE21heF9zb2xkX3Blcl9wZXJpb2QAAAAABAAAAAAAAAALcGVyaW9kX3NlY3MAAAAABgAAAAEAAAAE", "AAAAAAAAACJUaGUgcnVubmluZyBXQVNNIGhhc2ggKHJlYWQtb25seSkuAAAAAAAJd2FzbV9oYXNoAAAAAAAAAAAAAAEAAAPuAAAAIA==", "AAAAAAAAATNDbG9zZSBhIHBvb2w6IHRoZSBUcmVhc3VyeSAoYnkgcHJvcG9zYWwpIGF0IGFueSB0aW1lLCBhbnlvbmUgb25jZSBpdApoYXMgZXhwaXJlZC4gR2l2ZXMgdGhlIHVuc3RvY2tlZCByZXN0IG9mIHRoZSBwb29sJ3MgcmVzZXJ2YXRpb24gYmFjawp0byB0aGUgVG9rZW4gKGByZWxlYXNlX21pbnRfYWxsb3dhbmNlYCwgd2hpY2ggc2F0dXJhdGVzIGlmIHRoZQpUcmVhc3VyeSBsb3dlcmVkIHRoZSBhbGxvd2FuY2UgbWVhbndoaWxlKS4gVW5zb2xkIHN0b2NrIHN0YXlzIGhlcmUKdW50aWwgYHN3ZWVwX3Bvb2xgLiBFbWl0cyBgUG9vbENsb3NlZGAuAAAAAApjbG9zZV9wb29sAAAAAAABAAAAAAAAAAdwb29sX2lkAAAAAAQAAAAA", "AAAAAAAAAFNUaGUgY29uZmlndXJhdGlvbjogd2lyaW5nLCBwYXltZW50IGFzc2V0LCBkZWZhdWx0IGZlZSwgYW5kIHBhdXNlIHN0YXRlCihyZWFkLW9ubHkpLgAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAA", "AAAAAAAAAFhQb29scyBvcGVuZWQgYW5kIG5vdCB5ZXQgc3dlcHQgZW1wdHksIHdpdGggdGhlaXIgdW5zdG9ja2VkCnJlc2VydmF0aW9ucyBhbmQgcGFnZSBjb3VudHMuAAAACm9wZW5fcG9vbHMAAAAAAAAAAAABAAAD6gAAB9AAAAAIUG9vbFNsb3Q=", "AAAAAAAAADtUaGUgdG9rZW4gaWRzIG9uIG9uZSBzdG9jayBwYWdlIChlbXB0eSBvbmNlIHNvbGQgb3Igc3dlcHQpLgAAAAAKcG9vbF9zdG9jawAAAAAAAgAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAAAAAARwYWdlAAAABAAAAAEAAAPqAAAABA==", "AAAAAAAAAQZSZXR1cm4gdXAgdG8gYE1BWF9TV0VFUGAgdW5zb2xkIHRva2VucyBvZiBhIGNsb3NlZCBwb29sIHRvIHRoZQpUcmVhc3VyeSwgZW1wdHlpbmcgaXRzIHN0b2NrIHBhZ2VzIGZyb20gdGhlIGxhc3QuIEFueW9uZSBtYXkgY2FsbCBpdAp1bnRpbCBpdCByZXR1cm5zIDAgKHBhZ2VzIGxlZnQpOyBgUG9vbE9wZW5gIGJlZm9yZSBgY2xvc2VfcG9vbGAuIEJvdGgKaG9sZGVycyBhcmUgbm9uLXZvdGluZywgc28gbm8gdm90ZXMgbW92ZS4gRW1pdHMgYFBvb2xTd2VwdGAuAAAAAAAKc3dlZXBfcG9vbAAAAAAAAQAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAQAAAAQ=", "AAAAAAAAAFxUaGUgbGl2ZSBsaXN0aW5nIG9mIGB0b2tlbl9pZGAsIGlmIGFueSAocmVhZC1vbmx5OyBhbiBleHBpcmVkIGxpc3RpbmcKc3RheXMgdW50aWwgYGV4cGlyZWApLgAAAAtnZXRfbGlzdGluZwAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAD6AAAB9AAAAAHTGlzdGluZwA=", "AAAAAAAAAB5JZCB0aGUgbmV4dCBwb29sIHdpbGwgcmVjZWl2ZS4AAAAAAAxuZXh0X3Bvb2xfaWQAAAAAAAAAAQAAAAQ=", "AAAAAAAAAodEQU8tb3duZWQga2V5cyBmb3IgdGhlIHJlbmV3YWwgc3dlZXAgKGBEYW9Nb2R1bGU6OnJlbmV3YWxfa2V5c2ApLgoKVGhlIGtleSBzcGFjZSBpcyBgTGlzdGluZygwLi5taW50ZWQpYCwgdGhlbiBmb3IgZWFjaCBvcGVuIHBvb2wgaXRzCmBQb29sKGlkKWAgYW5kIGBQb29sU3RvY2soaWQsIDAuLnBhZ2VzKWAgKGEgMTAwLXRva2VuIHBvb2wgaXMgMyBwYWdlcywKZW5nIHJldmlldyBSOCkuIFRoZSBib3VuZHMgY29tZSBmcm9tIGluc3RhbmNlIHN0b3JhZ2Ugb25seSwgc28gdGhlCnBhZ2UgYW5zd2VycyBldmVuIHdoZW4gdGhlIGVudHJpZXMgaGF2ZSBhcmNoaXZlZC4gTW9zdCBsaXN0aW5nIHNsb3RzCmhvbGQgbm90aGluZzsgdGhlIHN3ZWVwIHJlbmV3cyBvbmx5IHdoYXQgaXQgZmluZHMuIGBQb29sQnV5ZXJgIGNvdW50cwphcmUgdGhlIGJ1eWVycycgKGhvbGRlciBjbGFzcykuIFRoZSBiYWxhbmNlcyBoZWxkIGFyZSB0aGUgZXNjcm93ZWQgYW5kCnN0b2NrZWQgdG9rZW5zIGFuZCB0aGUgcGF5bWVudCBhc3NldHMgKGEgbGlzdGluZyBjcmVhdGVkIGJlZm9yZQpgc2V0X3BheW1lbnRfYXNzZXRgIG1heSBiZSBwcmljZWQgaW4gYW4gb2xkZXIgb25lOyB0aGUgc3dlZXAgcmVhZHMKdGhvc2UgZnJvbSB0aGUgbGlzdGluZ3MgaXQgZmluZHMpLgAAAAAMcmVuZXdhbF9rZXlzAAAAAgAAAAAAAAAGY3Vyc29yAAAAAAAEAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAH0AAAAAtSZW5ld2FsUGFnZQA=", "AAAAAAAAAkNEZXBsb3ktdGltZSBzZXR1cCwgcnVuIG9uY2UgYnkgdGhlIE1hbmFnZXIgYXQgYGNyZWF0ZV9kYW9gIG9yCmBjcmVhdGVfbW9kdWxlYC4gU3RhcnRzIHBhdXNlZCBhbmQgaW4gU2V0dXAuCgoqIGB0b2tlbmAgLSB0aGUgREFPJ3MgbWVtYmVyc2hpcCB0b2tlbgoqIGBhZG1pbmAgLSBzZXR1cC1waGFzZSBhZG1pbiBvZiB0aGUgcGFyYW1ldGVyIHNldHRlcnMgKHRoZSBsYXVuY2ggYWRtaW4pOwpiZWNvbWVzIHRoZSBUcmVhc3VyeSBhdCBsYXVuY2gKKiBgdHJlYXN1cnlgIC0gcmVjZWl2ZXMgZmVlcyBhbmQgcG9vbCBzYWxlcwoqIGBwYXltZW50X2Fzc2V0YCAtIGFzc2V0IG9mIG5ldyBsaXN0aW5ncywgYSBTdGVsbGFyIEFzc2V0IENvbnRyYWN0CihgTm90U3RlbGxhckFzc2V0YCkKKiBgbWFuYWdlcmAsIGBjdXJyZW50X2hhc2hgIC0gdXBncmFkZSBhcHByb3ZhbHMgYW5kIHRoZSBydW5uaW5nIGhhc2gKKiBgZGVmYXVsdF9zZWNvbmRhcnlfZmVlX2Jwc2AgLSBmZWUgb24gc2Vjb25kYXJ5IHNhbGVzLCBhdCBtb3N0CmBNQVhfRkVFX0JQU2AgKGBJbnZhbGlkRmVlYCkKCkVtaXRzIGBNYXJrZXRwbGFjZUluaXRpYWxpemVkYC4AAAAADV9fY29uc3RydWN0b3IAAAAAAAAHAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAZZGVmYXVsdF9zZWNvbmRhcnlfZmVlX2JwcwAAAAAAAAQAAAAA", "AAAAAAAAAZZCdXkgYHRva2VuX2lkYCBmcm9tIHBhZ2UgYHBhZ2VgIG9mIGEgcG9vbCAoYGJ1eWVyYCBzaWduczsgcmVmdXNlZAp3aGlsZSBwYXVzZWQpOiBwYXlzIHRoZSBwb29sIHByaWNlIHRvIHRoZSBUcmVhc3VyeSBhbmQgc2VuZHMgdGhlCnRva2VuIHRvIGBidXllcmAuIFJlZnVzZXMgb25jZSB0aGUgcG9vbCBpcyBjbG9zZWQgb3IgZXhwaXJlZAooYFBvb2xDbG9zZWRgKSwgcGFzdCB0aGUgYnV5ZXIncyBjYXAgKGBCdXllckxpbWl0UmVhY2hlZGApIG9yIHRoZQpwZXJpb2QncyBzYWxlcyAoYFBvb2xSYXRlTGltaXRlZGApLCBhYm92ZSBgbWF4X3ByaWNlYAooYFByaWNlQWJvdmVNYXhgKSwgb3Igd2hlbiB0aGUgdG9rZW4gaXMgbm90IG9uIHRoYXQgcGFnZQooYE5vdEluUG9vbGApLiBFbWl0cyBgUG9vbFB1cmNoYXNlZGAuAAAAAAANYnV5X2Zyb21fcG9vbAAAAAAAAAUAAAAAAAAAB3Bvb2xfaWQAAAAABAAAAAAAAAAEcGFnZQAAAAQAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAAltYXhfcHJpY2UAAAAAAAALAAAAAA==", "AAAAAAAAAJRUaGUgY29uZmlndXJlZCBwYXltZW50IGFzc2V0IChgRGFvTW9kdWxlOjpwYXltZW50X2Fzc2V0YDsgcmVhZC1vbmx5KS4KVGhlIE1hbmFnZXIgY29tcGFyZXMgaXQgd2l0aCB0aGUgYXNzZXQgcmVjb3JkZWQgYXQgYGNyZWF0ZV9kYW9gCmJlZm9yZSBsYXVuY2guAAAADXBheW1lbnRfYXNzZXQAAAAAAAAAAAAAAQAAABM=", "AAAAAAAAAktTZW5kIGB0b2tlbl9pZGAsIGEgbWVtYmVyc2hpcCB0b2tlbiB0aGlzIGNvbnRyYWN0IGhvbGRzIHRoYXQgbm8KbGlzdGluZyBvciBwb29sIHJlY29yZHMsIHRvIHRoZSBUcmVhc3VyeSAodGhlIGFkbWluLCB3aGlsZSBwYXVzZWQsCmBOb3RQYXVzZWRgKS4gRm9yIGEgdG9rZW4gc29tZW9uZSB0cmFuc2ZlcnJlZCBoZXJlIGRpcmVjdGx5LiBBIGxpc3RlZAp0b2tlbiBpcyByZWZ1c2VkIChgTGlzdGluZ0V4aXN0c2A6IHVzZSBgcmV0dXJuX2xpc3RpbmdgKSwgYW5kIHNvIGlzCmFueSB0b2tlbiB3aGlsZSBhIHBvb2wgaXMgbm90IHlldCBzd2VwdCBlbXB0eSAoYFBvb2xPcGVuYCksIGJlY2F1c2UKc3RvY2sgcGFnZXMgYXJlIG5vdCBpbmRleGVkIGJ5IHRva2VuLiBUaGUgVG9rZW4ncyBgVHJhbnNmZXJgIHJlY29yZHMKdGhlIG1vdmU7IG5vIG1hcmtldHBsYWNlIGV2ZW50IGlzIGVtaXR0ZWQuCgpUaGUgVG9rZW4gcmVmdXNlcyB0byB1bnJlZ2lzdGVyIHRoZSBNYXJrZXRwbGFjZSB3aGlsZSBpdCBob2xkcwp0b2tlbnMsIHNvIHdpdGhvdXQgdGhpcyBhbnlvbmUgY291bGQga2VlcCBpdCByZWdpc3RlcmVkIGJ5IHNlbmRpbmcgaXQKb25lLgAAAAANcmVjb3Zlcl90b2tlbgAAAAAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAA=", "AAAAAAAAACtIb3cgbWFueSB0b2tlbnMgYGJ1eWVyYCBib3VnaHQgZnJvbSBhIHBvb2wuAAAAAA5wb29sX3B1cmNoYXNlcwAAAAAAAgAAAAAAAAAHcG9vbF9pZAAAAAAEAAAAAAAAAAVidXllcgAAAAAAABMAAAABAAAABA==", "AAAAAAAAAchSZXR1cm4gYSBsaXN0aW5nJ3MgdG9rZW4gdG8gaXRzIHNlbGxlciBhbmQgcmVtb3ZlIHRoZSBsaXN0aW5nLCBiZWZvcmUKaXRzIGV4cGlyeSBhbmQgd2l0aG91dCB0aGUgc2VsbGVyICh0aGUgYWRtaW46IHRoZSBUcmVhc3VyeSwgYnkKcHJvcG9zYWw7IG9ubHkgd2hpbGUgcGF1c2VkLCBgTm90UGF1c2VkYCkuIE5vIHBheW1lbnQgbW92ZXMuIEVtaXRzCmBMaXN0aW5nQ2FuY2VsbGVkYC4KClRoaXMgaXMgaG93IHRoZSBEQU8gZW1wdGllcyB0aGUgTWFya2V0cGxhY2UncyBlc2Nyb3csIGZvciBleGFtcGxlCmJlZm9yZSB1bnJlZ2lzdGVyaW5nIGl0LCB3aGljaCB0aGUgVG9rZW4gcmVmdXNlcyB3aGlsZSB0aGUgTWFya2V0cGxhY2UKaG9sZHMgdG9rZW5zLiBXaXRob3V0IGl0LCBvbmUgbGlzdGluZyB3aXRoIGEgZGlzdGFudCBleHBpcnkgd291bGQga2VlcAp0aGUgTWFya2V0cGxhY2UgcmVnaXN0ZXJlZC4AAAAOcmV0dXJuX2xpc3RpbmcAAAAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAA=", "AAAAAAAAAMxDb21tZW50IG9uIGB0b2tlbl9pZGAncyBzZWNvbmRhcnkgbGlzdGluZ3MuIE5vIGFjdGl2ZSBsaXN0aW5nIGlzCnJlcXVpcmVkLCBzbyB0aGUgdGhyZWFkIHN1cnZpdmVzIHJlbGlzdGluZy4gQW55b25lIG1heSBjb21tZW50LCBldmVuCndoaWxlIHBhdXNlZC4gRXZlbnQtb25seTogZW1pdHMgYExpc3RpbmdDb21tZW50ZWRgLCB3cml0ZXMgbm8gc3RvcmFnZS4AAAAPY29tbWVudF9saXN0aW5nAAAAAAMAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAEYm9keQAAABAAAAAAAAAABmF1dGhvcgAAAAAAEwAAAAA=", "AAAAAAAAADlTdG9yYWdlLWxheW91dCB2ZXJzaW9uIG9mIHRoZSBkYXRhIGhlbGQgYnkgdGhpcyBjb250cmFjdC4AAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==", "AAAAAAAAAJxBc3NldCB1c2VkIGJ5IG5ldyBsaXN0aW5ncyAodGhlIGFkbWluOyBleGlzdGluZyBsaXN0aW5ncyBrZWVwCnRoZWlycykuIEl0IG11c3QgYmUgYSBTdGVsbGFyIEFzc2V0IENvbnRyYWN0IChgTm90U3RlbGxhckFzc2V0YCkuCkVtaXRzIGBQYXltZW50QXNzZXRVcGRhdGVkYC4AAAARc2V0X3BheW1lbnRfYXNzZXQAAAAAAAABAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAA=", "AAAAAAAAAJdGZWUgYXBwbGllZCB0byBuZXcgbGlzdGluZ3MgKHRoZSBhZG1pbjsgZXhpc3RpbmcgbGlzdGluZ3Mga2VlcAp0aGVpcnMpLiBBdCBtb3N0IGBjb21tb246Ok1BWF9GRUVfQlBTYCAoMjUlLCBgSW52YWxpZEZlZWApLiBFbWl0cwpgU2Vjb25kYXJ5RmVlVXBkYXRlZGAuAAAAABVzZXRfc2Vjb25kYXJ5X2ZlZV9icHMAAAAAAAABAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAA", "AAAABQAAAKtFbWl0dGVkIGJ5IFtgaGFuZG9mZmBdLiBUaGUgZW1pdHRpbmcgY29udHJhY3QgYWRkcmVzcyBpcyB0aGUgZXZlbnQncyBjb250cmFjdCBpZC4KClNhbWUgc2hhcGUgYXMgdGhlIE1hbmFnZXIncyBvd24gYEFkbWluQ2hhbmdlZGAsIHNvIGluZGV4ZXJzIGRlY29kZSBib3RoCndpdGggb25lIHNjaGVtYS4AAAAAAAAAAAxBZG1pbkNoYW5nZWQAAAABAAAADWFkbWluX2NoYW5nZWQAAAAAAAACAAAAAAAAAAlvbGRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAAC", "AAAABAAAAD5FcnJvcnMgc2hhcmVkIGJ5IGFsbCBtb2R1bGUgY29udHJhY3RzIChibG9jayBgY29kZXM6OkNPTU1PTmApLgAAAAAAAAAAAAtDb21tb25FcnJvcgAAAAANAAAANE9wZXJhdGlvbiByZXF1aXJlcyB0aGUgbW9kdWxlIHRvIGJlIGxpdmUgKGxhdW5jaGVkKS4AAAAHTm90TGl2ZQAAABtZAAAAQU9wZXJhdGlvbiBpcyBvbmx5IHZhbGlkIGR1cmluZyBzZXR1cDsgdGhlIG1vZHVsZSBpcyBhbHJlYWR5IGxpdmUuAAAAAAAAC0FscmVhZHlMaXZlAAAAG1oAAAAlTWFuYWdlciBhZGRyZXNzIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAAAAA1NYW5hZ2VyTm90U2V0AAAAAAAbWwAAACNgQ3VycmVudEhhc2hgIG1pc3NpbmcgZnJvbSBzdG9yYWdlLgAAAAARQ3VycmVudEhhc2hOb3RTZXQAAAAAABtcAAAANGBmcm9tX2hhc2hgIGRvZXMgbm90IGVxdWFsIHRoZSBzdG9yZWQgYEN1cnJlbnRIYXNoYC4AAAAMSGFzaE1pc21hdGNoAAAbXQAAACpNYW5hZ2VyIGRpZCBub3QgYXBwcm92ZSB0aGlzIHVwZ3JhZGUgcGF0aC4AAAAAABJVcGdyYWRlTm90QXBwcm92ZWQAAAAAG14AAAA1TWFuYWdlciBoYXMgbm8gcmVnaXN0cnkgZW50cnkgZm9yIHRoZSByZXF1ZXN0ZWQgaGFzaC4AAAAAAAAWSW1wbGVtZW50YXRpb25Ob3RGb3VuZAAAAAAbXwAAACJNb2R1bGUgYWRtaW4gbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAALQWRtaW5Ob3RTZXQAAAAbYAAAAD9UaGUgTWFuYWdlcidzIG93biBgQ3VycmVudE1hbmFnZXJWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAADVZlcnNpb25Ob3RTZXQAAAAAABthAAAAJlRyZWFzdXJ5IGFkZHJlc3MgbWlzc2luZyBmcm9tIHN0b3JhZ2UuAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAG2IAAAAmR292ZXJub3IgYWRkcmVzcyBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAAA5Hb3Zlcm5vck5vdFNldAAAAAAbYwAAADxgbWlncmF0ZWAgY2FsbGVkIHdoaWxlIHRoZSBzdG9yZWQgbGF5b3V0IGlzIGFscmVhZHkgY3VycmVudC4AAAAQTm90aGluZ1RvTWlncmF0ZQAAG2QAAAAmYFN0b3JhZ2VWZXJzaW9uYCBtaXNzaW5nIGZyb20gc3RvcmFnZS4AAAAAABRTdG9yYWdlVmVyc2lvbk5vdFNldAAAG2U=", "AAAAAQAAACZPbmUgcGFnZSBvZiBgRGFvTW9kdWxlOjpyZW5ld2FsX2tleXNgLgAAAAAAAAAAAAtSZW5ld2FsUGFnZQAAAAADAAAAmUFzc2V0IGNvbnRyYWN0cyAodGhlIERBTyB0b2tlbiBpbmNsdWRlZCkgd2hvc2UgYEJhbGFuY2UobW9kdWxlKWAgZW50cnkKdGhlIG1vZHVsZSBob2xkcy4gUmVwb3J0ZWQgb24gdGhlIGZpcnN0IHBhZ2U7IGxhdGVyIHBhZ2VzIG1heSByZXBlYXQKb3Igb21pdCB0aGVtLgAAAAAAAAZhc3NldHMAAAAAA+oAAAATAAAB9GAoa2V5LCBwZXJzaXN0ZW50KWAgZm9yIGVhY2ggc3RvcmFnZSBlbnRyeSB0aGUgbW9kdWxlIGFza3MgdGhlIHN3ZWVwCnRvIGtlZXAgYWxpdmUuIGBrZXlgIGlzIHRoZSBleGFjdCBgVmFsYCB0aGUgbW9kdWxlIHN0b3JlcyB1bmRlciwKYWxyZWFkeSBuYW1lc3BhY2VkIChgY3JhdGU6Om5zYCksIHNvIHRoZSBzd2VlcCBidWlsZHMKYExlZGdlcktleTo6Q29udHJhY3REYXRhIHsgY29udHJhY3Q6IG1vZHVsZSwga2V5LCBkdXJhYmlsaXR5IH1gIGZyb20gaXQKZGlyZWN0bHk7IGBwZXJzaXN0ZW50YCBpcyBmYWxzZSBmb3IgdGVtcG9yYXJ5IGVudHJpZXMuIEluc3RhbmNlIGVudHJpZXMKYXJlIG5vdCBsaXN0ZWQ6IHRoZSBzd2VlcCByZW5ld3MgZXZlcnkgbW9kdWxlJ3MgaW5zdGFuY2UuIEEga2V5IG1heSBuYW1lCmFuIGVudHJ5IHRoYXQgZG9lcyBub3QgZXhpc3QgKGEgbGlzdGluZyBzbG90IG5vYm9keSB1c2VkKTsgdGhlIHN3ZWVwCnJlbmV3cyBvbmx5IHdoYXQgaXQgZmluZHMuAAAABGtleXMAAAPqAAAD7QAAAAIAAAAAAAAAAQAAADBDdXJzb3Igb2YgdGhlIG5leHQgcGFnZSwgYE5vbmVgIG9uIHRoZSBsYXN0IG9uZS4AAAALbmV4dF9jdXJzb3IAAAAD6AAAAAQ=", "AAAABQAAABVFbWl0dGVkIGJ5IGBtaWdyYXRlYC4AAAAAAAAAAAAACE1pZ3JhdGVkAAAAAQAAAAhtaWdyYXRlZAAAAAIAAAAAAAAAFGZyb21fc3RvcmFnZV92ZXJzaW9uAAAABAAAAAAAAAAAAAAAEnRvX3N0b3JhZ2VfdmVyc2lvbgAAAAAABAAAAAAAAAAC", "AAAABQAAAE1FbWl0dGVkIGJ5IGBhcHBseWAuIFRoZSBlbWl0dGluZyBjb250cmFjdCBhZGRyZXNzIGlzIHRoZSBldmVudCdzIGNvbnRyYWN0IGlkLgAAAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAwAAAAAAAAAJZnJvbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAAAAAAd0b19oYXNoAAAAA+4AAAAgAAAAAQAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAAAI="]),
      options
    );
  }

   static deploy<T = Client>({ token, admin, treasury, payment_asset, manager, current_hash, default_secondary_fee_bps }: { token: string | Address; admin: string | Address; treasury: string | Address; payment_asset: string | Address; manager: string | Address; current_hash: Uint8Array; default_secondary_fee_bps: number }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ token, admin, treasury, payment_asset, manager, current_hash, default_secondary_fee_bps }, options);
  }
  public readonly fromJson = {
    buy : this.txFromJson<void>,  list : this.txFromJson<void>,  admin : this.txFromJson<string>,  pause : this.txFromJson<void>,  cancel : this.txFromJson<void>,  expire : this.txFromJson<void>,  launch : this.txFromJson<void>,  handoff : this.txFromJson<void>,  migrate : this.txFromJson<void>,  restock : this.txFromJson<number>,  unpause : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<string>,  get_pool : this.txFromJson<Pool | null>,  open_pool : this.txFromJson<number>,  wasm_hash : this.txFromJson<Uint8Array>,  close_pool : this.txFromJson<void>,  get_config : this.txFromJson<MarketplaceConfig>,  open_pools : this.txFromJson<Array<PoolSlot>>,  pool_stock : this.txFromJson<Array<number>>,  sweep_pool : this.txFromJson<number>,  get_listing : this.txFromJson<Listing | null>,  next_pool_id : this.txFromJson<number>,  renewal_keys : this.txFromJson<RenewalPage>,  buy_from_pool : this.txFromJson<void>,  payment_asset : this.txFromJson<string>,  recover_token : this.txFromJson<void>,  pool_purchases : this.txFromJson<number>,  return_listing : this.txFromJson<void>,  comment_listing : this.txFromJson<void>,  storage_version : this.txFromJson<number>,  set_payment_asset : this.txFromJson<void>,  set_secondary_fee_bps : this.txFromJson<void>
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