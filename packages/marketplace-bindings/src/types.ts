import {Address, xdr} from '@stellar/stellar-sdk';

    /**
 * Marketplace errors (block `common::error::codes::MARKETPLACE`).
 */
export const MarketplaceError = {
  /**
   * Contract configuration missing
   */
  7701 : { message: "NotInitialized" },
  /**
   * Price is not positive
   */
  7702 : { message: "InvalidPrice" },
  /**
   * Expiry is not in the future
   */
  7703 : { message: "InvalidExpiry" },
  /**
   * The token is already listed (or, for `recover_token`, is listed)
   */
  7704 : { message: "ListingExists" },
  /**
   * No such listing
   */
  7705 : { message: "ListingNotFound" },
  /**
   * The listing has expired
   */
  7706 : { message: "ListingExpired" },
  /**
   * The listing has not expired yet
   */
  7707 : { message: "ListingActive" },
  /**
   * The caller is not the token owner / listing seller
   */
  7708 : { message: "NotSeller" },
  /**
   * Fee above `common::MAX_FEE_BPS`
   */
  7709 : { message: "InvalidFee" },
  /**
   * Arithmetic overflow in fee calculations
   */
  7710 : { message: "ArithmeticOverflow" },
  /**
   * `launch` treasury differs from the treasury wired at construction
   */
  7711 : { message: "TreasuryMismatch" },
  /**
   * The payment asset differs from the one the caller expected
   */
  7712 : { message: "PaymentAssetMismatch" },
  /**
   * The marketplace is paused (new listings and purchases are rejected)
   */
  7713 : { message: "Paused" },
  /**
   * The current fee exceeds the seller's `max_fee_bps`
   */
  7714 : { message: "FeeAboveMax" },
  /**
   * The listing price exceeds the buyer's `max_price`
   */
  7715 : { message: "PriceAboveMax" },
  /**
   * Comment body is empty
   */
  7716 : { message: "CommentEmpty" },
  /**
   * Comment body exceeds `MAX_COMMENT_LENGTH`
   */
  7717 : { message: "CommentTooLong" },
  /**
   * The Marketplace's allowance not reserved by open pools is below the
   * pool size (grant the allowance first)
   */
  7718 : { message: "AllowanceNotReserved" },
  /**
   * No such pool
   */
  7719 : { message: "PoolNotFound" },
  /**
   * The pool is closed or past its expiry
   */
  7720 : { message: "PoolClosed" },
  /**
   * The buyer reached the pool's `max_per_buyer`
   */
  7721 : { message: "BuyerLimitReached" },
  /**
   * The pool sold `max_sold_per_period` this period
   */
  7722 : { message: "PoolRateLimited" },
  /**
   * The token is not in that pool stock page (sold, or another page)
   */
  7723 : { message: "NotInPool" },
  /**
   * `MAX_OPEN_POOLS` pools are open (close and sweep one first)
   */
  7724 : { message: "TooManyPools" },
  /**
   * `sweep_pool` on a pool that is still open, or `recover_token` while
   * any pool is not yet swept empty
   */
  7725 : { message: "PoolOpen" },
  /**
   * A pool size, buyer cap, sales rate or period of zero
   */
  7726 : { message: "InvalidPool" },
  /**
   * The pool has stocked its whole size
   */
  7727 : { message: "PoolFullyStocked" },
  /**
   * The payment asset is not a Stellar Asset Contract
   */
  7728 : { message: "NotStellarAsset" },
  /**
   * `return_listing` or `recover_token` while the marketplace is open
   * (pause it first)
   */
  7729 : { message: "NotPaused" },
  /**
   * The stored data layout is not the one this code expects: an upgrade
   * whose `migrate` has not run yet, or an upgrade to code with an older
   * layout. Every entry point that changes state refuses until `migrate`
   * (or, for an older layout, another `upgrade`) brings the two back in
   * step
   */
  7730 : { message: "StorageVersionMismatch" }
}

/**
 * `count` unsold tokens returned to the Treasury; `pages_left` 0 when done.
 */
export interface PoolSweptEvent {
  name: "PoolSwept";
  data: {
    pool_id: number;
    count?: number;
    pages_left?: number;
  };
}

/**
 * A pool closed; `released` is the unstocked allowance given back.
 */
export interface PoolClosedEvent {
  name: "PoolClosed";
  data: {
    pool_id: number;
    released?: number;
  };
}

/**
 * A quick-buy pool opened (by proposal).
 */
export interface PoolOpenedEvent {
  name: "PoolOpened";
  data: {
    pool_id: number;
    price?: bigint;
    asset?: string;
    expires_at?: bigint;
    size?: number;
    max_per_buyer?: number;
    max_sold_per_period?: number;
    period_secs?: bigint;
  };
}

/**
 * A buyer picked `token_id` from a pool.
 */
export interface PoolPurchasedEvent {
  name: "PoolPurchased";
  data: {
    pool_id: number;
    buyer: string;
    token_id?: number;
    price?: bigint;
    asset?: string;
  };
}

/**
 * `count` tokens from `first_token_id` minted into the pool's custody.
 */
export interface PoolRestockedEvent {
  name: "PoolRestocked";
  data: {
    pool_id: number;
    first_token_id?: number;
    count?: number;
    stocked?: number;
  };
}

/**
 * `expire`: an expired listing's token went back to `seller`.
 */
export interface ListingExpiredEvent {
  name: "ListingExpired";
  data: {
    token_id: number;
    seller?: string;
  };
}

/**
 * The listing ended and `token_id` went back to `seller`: the seller's
 * `cancel`, or the admin's `return_listing`.
 */
export interface ListingCancelledEvent {
  name: "ListingCancelled";
  data: {
    token_id: number;
    seller?: string;
  };
}

/**
 * A comment on a token's secondary listings. Keyed by token, so the thread
 * carries over relistings. Event-only: the body is never stored.
 */
export interface ListingCommentedEvent {
  name: "ListingCommented";
  data: {
    token_id: number;
    author: string;
    body?: string;
  };
}

/**
 * `buy`: `buyer` paid `price` (of which `fee` went to the Treasury) and
 * received `token_id`.
 */
export interface ListingPurchasedEvent {
  name: "ListingPurchased";
  data: {
    token_id: number;
    buyer: string;
    seller?: string;
    price?: bigint;
    fee?: bigint;
    payment_asset?: string;
  };
}

/**
 * The marketplace paused: no new listings, purchases, or pools.
 */
export interface MarketplacePausedEvent {
  name: "MarketplacePaused";
  data: {
    /**
     * The admin, or the Manager when `launch` forces the pause.
     */
    changed_by: string;
  };
}

/**
 * Emitted once when the Manager launches the marketplace (Setup -> Live).
 */
export interface MarketplaceLaunchedEvent {
  name: "MarketplaceLaunched";
  data: {
    treasury: string;
    /**
     * Whether the marketplace was unpaused at launch.
     */
    opened?: boolean;
  };
}

/**
 * The marketplace reopened.
 */
export interface MarketplaceUnpausedEvent {
  name: "MarketplaceUnpaused";
  data: {
    /**
     * The admin, or the Manager when `launch` opens the marketplace.
     */
    changed_by: string;
  };
}

/**
 * `set_payment_asset`: new listings are priced in `payment_asset`.
 */
export interface PaymentAssetUpdatedEvent {
  name: "PaymentAssetUpdated";
  data: {
    payment_asset?: string;
    changed_by: string;
  };
}

/**
 * `set_secondary_fee_bps`: the fee new listings capture.
 */
export interface SecondaryFeeUpdatedEvent {
  name: "SecondaryFeeUpdated";
  data: {
    fee_bps?: number;
    changed_by: string;
  };
}

/**
 * Emitted once by the constructor, with the starting configuration.
 */
export interface MarketplaceInitializedEvent {
  name: "MarketplaceInitialized";
  data: {
    token: string;
    admin: string;
    treasury?: string;
    payment_asset?: string;
    default_secondary_fee_bps?: number;
  };
}

/**
 * `list`: `token_id` is escrowed here on the captured terms.
 */
export interface SecondaryListingCreatedEvent {
  name: "SecondaryListingCreated";
  data: {
    token_id: number;
    seller?: string;
    price?: bigint;
    expires_at?: bigint;
    fee_bps?: number;
    payment_asset?: string;
  };
}

/**
 * A quick-buy pool: stock minted into the Marketplace's custody and sold at
 * one price, with a per-buyer cap and a pool-wide sales rate
 * (docs/designs/membership-models.md §4).
 */
export interface Pool {
  /**
   * The Stellar Asset Contract buyers pay in.
   */
  asset: string;
  /**
   * Set by `close_pool`; a closed pool sells and restocks nothing.
   */
  closed: boolean;
  /**
   * Sales and restocks stop at this ledger timestamp.
   */
  expires_at: bigint;
  /**
   * Most tokens one buyer may buy from this pool.
   */
  max_per_buyer: number;
  /**
   * Most sales per `period_secs`, pool-wide.
   */
  max_sold_per_period: number;
  /**
   * Length of a sales period, in seconds.
   */
  period_secs: bigint;
  /**
   * When the current sales period started.
   */
  period_start: bigint;
  /**
   * Price of one token, in `asset`.
   */
  price: bigint;
  /**
   * Tokens the pool may stock in all (its allowance reservation).
   */
  size: number;
  /**
   * Tokens sold so far.
   */
  sold: number;
  /**
   * Sales in the current period.
   */
  sold_in_period: number;
  /**
   * Tokens minted into the pool so far.
   */
  stocked: number;
}

/**
 * Secondary (escrowed-token) listing, keyed by token id.
 */
export interface Listing {
  /**
   * Purchases stop, and `expire` opens, at this ledger timestamp.
   */
  expires_at: bigint;
  /**
   * Fee captured at list time, in basis points of the price.
   */
  fee_bps: number;
  /**
   * Asset captured at list time; later `set_payment_asset` calls do not affect it.
   */
  payment_asset: string;
  /**
   * Asking price, in `payment_asset`.
   */
  price: bigint;
  /**
   * Who listed the token and receives the proceeds, or the token back.
   */
  seller: string;
}

/**
 * Instance bookkeeping for an open pool (opened, not yet swept empty).
 */
export interface PoolSlot {
  /**
   * Stock pages written, `PoolStock(pool_id, 0..pages)`.
   */
  pages: number;
  pool_id: number;
  /**
   * The pool's share of the Marketplace's allowance not yet minted.
   */
  unstocked: number;
}

/**
 * The Marketplace's wiring and settings.
 */
export interface MarketplaceConfig {
  /**
   * Fee new listings capture, in basis points (at most `MAX_FEE_BPS`).
   */
  default_secondary_fee_bps: number;
  /**
   * The Manager that approves upgrades and performs the launch.
   */
  manager: string;
  /**
   * While true, no new listings, purchases, or pools.
   */
  paused: boolean;
  /**
   * Asset new listings are priced in, a Stellar Asset Contract.
   */
  payment_asset: string;
  /**
   * The DAO's membership token.
   */
  token: string;
  /**
   * Fee and primary-sale recipient. Also the admin once live (`common::admin`).
   */
  treasury: string;
}

/**
 * Emitted by [`handoff`]. The emitting contract address is the event's contract id.
 *
 * Same shape as the Manager's own `AdminChanged`, so indexers decode both
 * with one schema.
 */
export interface AdminChangedEvent {
  name: "AdminChanged";
  data: {
    /**
     * The admin before the handoff (the launch admin).
     */
    old_admin: string;
    /**
     * The admin after it (the Treasury).
     */
    new_admin: string;
  };
}

/**
 * Errors shared by all module contracts (block `codes::COMMON`).
 */
export const CommonError = {
  /**
   * Operation requires the module to be live (launched).
   */
  7001 : { message: "NotLive" },
  /**
   * Operation is only valid during setup; the module is already live.
   */
  7002 : { message: "AlreadyLive" },
  /**
   * Manager address missing from storage.
   */
  7003 : { message: "ManagerNotSet" },
  /**
   * `CurrentHash` missing from storage.
   */
  7004 : { message: "CurrentHashNotSet" },
  /**
   * `from_hash` does not equal the stored `CurrentHash`.
   */
  7005 : { message: "HashMismatch" },
  /**
   * Manager did not approve this upgrade path.
   */
  7006 : { message: "UpgradeNotApproved" },
  /**
   * Manager has no registry entry for the requested hash.
   */
  7007 : { message: "ImplementationNotFound" },
  /**
   * Module admin missing from storage.
   */
  7008 : { message: "AdminNotSet" },
  /**
   * The Manager's own `CurrentManagerVersion` missing from storage.
   */
  7009 : { message: "VersionNotSet" },
  /**
   * Treasury address missing from storage.
   */
  7010 : { message: "TreasuryNotSet" },
  /**
   * Governor address missing from storage.
   */
  7011 : { message: "GovernorNotSet" },
  /**
   * `migrate` called while the stored layout is already current.
   */
  7012 : { message: "NothingToMigrate" },
  /**
   * `StorageVersion` missing from storage.
   */
  7013 : { message: "StorageVersionNotSet" }
}

/**
 * One page of `DaoModule::renewal_keys`.
 */
export interface RenewalPage {
  /**
   * Asset contracts (the DAO token included) whose `Balance(module)` entry
   * the module holds. Reported on the first page; later pages may repeat
   * or omit them.
   */
  assets: Array<string>;
  /**
   * `(key, persistent)` for each storage entry the module asks the sweep
   * to keep alive. `key` is the exact `Val` the module stores under,
   * already namespaced (`crate::ns`), so the sweep builds
   * `LedgerKey::ContractData { contract: module, key, durability }` from it
   * directly; `persistent` is false for temporary entries. Instance entries
   * are not listed: the sweep renews every module's instance. A key may name
   * an entry that does not exist (a listing slot nobody used); the sweep
   * renews only what it finds.
   */
  keys: Array<[any, boolean]>;
  /**
   * Cursor of the next page, `None` on the last one.
   */
  next_cursor: number | null;
}

/**
 * Emitted by [`migrate`] when the stored layout moves forward. The emitting
 * contract address is the event's contract id.
 */
export interface MigratedEvent {
  name: "Migrated";
  data: {
    /**
     * The layout version before the migration.
     */
    from_storage_version?: number;
    /**
     * The layout version after it (the code's `STORAGE_VERSION`).
     */
    to_storage_version?: number;
  };
}

/**
 * Emitted by `apply`. The emitting contract address is the event's contract id.
 */
export interface UpgradedEvent {
  name: "Upgraded";
  data: {
    /**
     * The code hash before the upgrade.
     */
    from_hash: Uint8Array;
    /**
     * The code hash after it.
     */
    to_hash: Uint8Array;
    /**
     * The registry's release version for `to_hash`.
     */
    version?: string;
  };
}
    export type ContractEvent = PoolSweptEvent | PoolClosedEvent | PoolOpenedEvent | PoolPurchasedEvent | PoolRestockedEvent | ListingExpiredEvent | ListingCancelledEvent | ListingCommentedEvent | ListingPurchasedEvent | MarketplacePausedEvent | MarketplaceLaunchedEvent | MarketplaceUnpausedEvent | PaymentAssetUpdatedEvent | SecondaryFeeUpdatedEvent | MarketplaceInitializedEvent | SecondaryListingCreatedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent;
    