import {Address} from '@stellar/stellar-sdk';

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
  7715 : { message: "PriceAboveMax" }
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
 * Event: PrimaryListingCreated
 */
export interface PrimaryListingCreatedEvent {
  name: "PrimaryListingCreated";
  data: {
    listing_id: bigint;
    price?: bigint;
    expires_at?: bigint;
    payment_asset?: string;
  };
}

/**
 * Event: PrimaryListingExpired
 */
export interface PrimaryListingExpiredEvent {
  name: "PrimaryListingExpired";
  data: {
    listing_id: bigint;
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
    version?: string;
    default_secondary_fee_bps?: number;
  };
}

/**
 * Event: PrimaryListingCancelled
 */
export interface PrimaryListingCancelledEvent {
  name: "PrimaryListingCancelled";
  data: {
    listing_id: bigint;
  };
}

/**
 * Event: PrimaryListingPurchased
 */
export interface PrimaryListingPurchasedEvent {
  name: "PrimaryListingPurchased";
  data: {
    listing_id: bigint;
    buyer: string;
    token_id?: number;
    price?: bigint;
    payment_asset?: string;
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
 * Primary sale listing, keyed by listing id. No token exists until bought.
 */
export interface PrimaryListing {
  expires_at: bigint;
  /**
   * Asset captured at creation time.
   */
  payment_asset: string;
  price: bigint;
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
   * `CurrentVersion` missing from storage.
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

/**
 * Emitted by `sync_version`.
 */
export interface VersionSyncedEvent {
  name: "VersionSynced";
  data: {
    version?: string;
  };
}
    export type ContractEvent = ListingExpiredEvent | ListingCancelledEvent | ListingPurchasedEvent | MarketplacePausedEvent | MarketplaceLaunchedEvent | MarketplaceUnpausedEvent | PaymentAssetUpdatedEvent | SecondaryFeeUpdatedEvent | PrimaryListingCreatedEvent | PrimaryListingExpiredEvent | MarketplaceInitializedEvent | PrimaryListingCancelledEvent | PrimaryListingPurchasedEvent | SecondaryListingCreatedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent | VersionSyncedEvent;
    