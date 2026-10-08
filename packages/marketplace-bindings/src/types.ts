import {Address} from '@stellar/stellar-sdk';

    /**
 * Error Enum: MarketplaceError
 */
export const MarketplaceError = {
  1301 : { message: "NotInitialized" },
  1303 : { message: "InvalidPrice" },
  1304 : { message: "InvalidExpiry" },
  1305 : { message: "ListingExists" },
  1306 : { message: "ListingNotFound" },
  1307 : { message: "ListingExpired" },
  1308 : { message: "ListingActive" },
  1309 : { message: "NotSeller" },
  1310 : { message: "InvalidFee" },
  1311 : { message: "ArithmeticOverflow" },
  /**
   * `launch` treasury differs from the treasury wired at construction.
   */
  1312 : { message: "TreasuryMismatch" },
  /**
   * `launch` expected payment asset differs from the configured one
   */
  1313 : { message: "PaymentAssetMismatch" },
  /**
   * The marketplace is paused (new listings and purchases are rejected).
   */
  1314 : { message: "Paused" }
}

/**
 * Emitted once when the Manager launches the marketplace (Setup -> Live).
 */
export interface LaunchedEvent {
  name: "Launched";
  data: {
    treasury: string;
    /**
     * Whether the marketplace was unpaused at launch.
     */
    opened?: boolean;
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

  };
}

/**
 * Event: MarketplaceUnpaused
 */
export interface MarketplaceUnpausedEvent {
  name: "MarketplaceUnpaused";
  data: {

  };
}

/**
 * Event: MarketplaceUpgraded
 */
export interface MarketplaceUpgradedEvent {
  name: "MarketplaceUpgraded";
  data: {
    from_hash?: Uint8Array;
    to_hash?: Uint8Array;
  };
}

/**
 * Event: PaymentAssetUpdated
 */
export interface PaymentAssetUpdatedEvent {
  name: "PaymentAssetUpdated";
  data: {
    payment_asset?: string;
  };
}

/**
 * Event: SecondaryFeeUpdated
 */
export interface SecondaryFeeUpdatedEvent {
  name: "SecondaryFeeUpdated";
  data: {
    fee_bps?: number;
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
  /**
   * Setup-phase admin of the param setters; replaced by `treasury` once Live.
   */
  launch_admin: string;
  manager: string;
  paused: boolean;
  payment_asset: string;
  token: string;
  treasury: string;
}

/**
 * Errors shared by all module contracts. Codes live in the 9000 range so
 * they never collide with module (11xx-13xx, 3, 30) or manager (10xx) codes.
 */
export const CommonError = {
  /**
   * Operation requires the module to be live (launched).
   */
  9001 : { message: "NotLive" },
  /**
   * Operation is only valid during setup; the module is already live.
   */
  9002 : { message: "AlreadyLive" },
  /**
   * Manager address missing from storage.
   */
  9003 : { message: "ManagerNotSet" },
  /**
   * `CurrentHash` missing from storage.
   */
  9004 : { message: "CurrentHashNotSet" },
  /**
   * `from_hash` does not equal the stored `CurrentHash`.
   */
  9005 : { message: "HashMismatch" },
  /**
   * Manager did not approve this upgrade path.
   */
  9006 : { message: "UpgradeNotApproved" },
  /**
   * Manager has no registry entry for the requested hash.
   */
  9007 : { message: "ImplementationNotFound" },
  /**
   * Owner missing from storage.
   */
  9008 : { message: "OwnerNotSet" },
  /**
   * `CurrentVersion` missing from storage.
   */
  9009 : { message: "VersionNotSet" },
  /**
   * Treasury address missing from storage.
   */
  9010 : { message: "TreasuryNotSet" },
  /**
   * Governor address missing from storage.
   */
  9011 : { message: "GovernorNotSet" }
}
    export type ContractEvent = LaunchedEvent | ListingExpiredEvent | ListingCancelledEvent | ListingPurchasedEvent | MarketplacePausedEvent | MarketplaceUnpausedEvent | MarketplaceUpgradedEvent | PaymentAssetUpdatedEvent | SecondaryFeeUpdatedEvent | PrimaryListingCreatedEvent | PrimaryListingExpiredEvent | MarketplaceInitializedEvent | PrimaryListingCancelledEvent | PrimaryListingPurchasedEvent | SecondaryListingCreatedEvent;
    