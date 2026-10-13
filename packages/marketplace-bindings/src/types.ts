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
   * The token is already listed
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
   * `sweep_pool` on a pool that is still open
   */
  7725 : { message: "PoolOpen" },
  /**
   * A pool size, buyer cap, sales rate or period of zero
   */
  7726 : { message: "InvalidPool" },
  /**
   * The pool has stocked its whole size
   */
  7727 : { message: "PoolFullyStocked" }
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
 * Event: ListingExpired
 */
export interface ListingExpiredEvent {
  name: "ListingExpired";
  data: {
    token_id: number;
    seller?: string;
  };
}

/**
 * Event: ListingCancelled
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
 * Event: ListingPurchased
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
 * Event: MarketplacePaused
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
 * Event: MarketplaceUnpaused
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
 * Event: PaymentAssetUpdated
 */
export interface PaymentAssetUpdatedEvent {
  name: "PaymentAssetUpdated";
  data: {
    payment_asset?: string;
    changed_by: string;
  };
}

/**
 * Event: SecondaryFeeUpdated
 */
export interface SecondaryFeeUpdatedEvent {
  name: "SecondaryFeeUpdated";
  data: {
    fee_bps?: number;
    changed_by: string;
  };
}

/**
 * Event: MarketplaceInitialized
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
 * Event: SecondaryListingCreated
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
  asset: string;
  closed: boolean;
  /**
   * Sales and restocks stop at this ledger timestamp.
   */
  expires_at: bigint;
  max_per_buyer: number;
  /**
   * Most sales per `period_secs`, pool-wide.
   */
  max_sold_per_period: number;
  period_secs: bigint;
  period_start: bigint;
  price: bigint;
  /**
   * Tokens the pool may stock in all (its allowance reservation).
   */
  size: number;
  sold: number;
  sold_in_period: number;
  stocked: number;
}

/**
 * Secondary (escrowed-token) listing, keyed by token id.
 */
export interface Listing {
  expires_at: bigint;
  fee_bps: number;
  /**
   * Asset captured at list time; later `set_payment_asset` calls do not affect it.
   */
  payment_asset: string;
  price: bigint;
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
 * Struct: MarketplaceConfig
 */
export interface MarketplaceConfig {
  default_secondary_fee_bps: number;
  manager: string;
  paused: boolean;
  payment_asset: string;
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
    old_admin: string;
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
 * Emitted by `migrate`.
 */
export interface MigratedEvent {
  name: "Migrated";
  data: {
    from_storage_version?: number;
    to_storage_version?: number;
  };
}

/**
 * Emitted by `apply`. The emitting contract address is the event's contract id.
 */
export interface UpgradedEvent {
  name: "Upgraded";
  data: {
    from_hash: Uint8Array;
    to_hash: Uint8Array;
    version?: string;
  };
}
    export type ContractEvent = PoolSweptEvent | PoolClosedEvent | PoolOpenedEvent | PoolPurchasedEvent | PoolRestockedEvent | ListingExpiredEvent | ListingCancelledEvent | ListingCommentedEvent | ListingPurchasedEvent | MarketplacePausedEvent | MarketplaceLaunchedEvent | MarketplaceUnpausedEvent | PaymentAssetUpdatedEvent | SecondaryFeeUpdatedEvent | MarketplaceInitializedEvent | SecondaryListingCreatedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent;
    