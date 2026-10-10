import {Address} from '@stellar/stellar-sdk';

    /**
 * Auction errors (block `common::error::codes::AUCTION`).
 */
export const AuctionError = {
  /**
   * Bid placed for a token id other than the one being auctioned
   */
  7401 : { message: "InvalidTokenId" },
  /**
   * Bid placed at or after the auction end time
   */
  7402 : { message: "AuctionOver" },
  /**
   * The auction has no start time
   */
  7403 : { message: "AuctionNotStarted" },
  /**
   * Settlement attempted before the auction end time
   */
  7404 : { message: "AuctionActive" },
  /**
   * The auction is already settled (or cancelled)
   */
  7405 : { message: "AuctionSettled" },
  /**
   * First bid below the reserve price
   */
  7406 : { message: "ReservePriceNotMet" },
  /**
   * Bid below the previous bid plus the minimum increment
   */
  7407 : { message: "MinBidNotMet" },
  /**
   * Configuration out of bounds (duration outside 5 minutes ..= 30 days,
   * increment outside 1..=100%, or payment token locked)
   */
  7408 : { message: "InvalidConfig" },
  /**
   * No auction has been created yet
   */
  7409 : { message: "NotLaunched" },
  /**
   * Caller is not the admin
   */
  7410 : { message: "Unauthorized" },
  /**
   * Arithmetic overflow in bid or time calculations
   */
  7411 : { message: "ArithmeticOverflow" },
  /**
   * Bid amount not positive, or reserve price below `common::MIN_RESERVE_PRICE`
   */
  7412 : { message: "InvalidBid" },
  /**
   * Contract configuration missing
   */
  7413 : { message: "NotInitialized" },
  /**
   * `launch` treasury differs from the treasury wired at construction
   */
  7414 : { message: "TreasuryMismatch" },
  /**
   * `launch` expected payment token differs from the configured one
   */
  7415 : { message: "PaymentTokenMismatch" },
  /**
   * `withdraw_refund` called with no pending refund balance
   */
  7416 : { message: "NoPendingRefund" },
  /**
   * `time_buffer` outside 1..=86400 seconds
   */
  7417 : { message: "InvalidTimeBuffer" }
}

/**
 * Event: BidPlaced
 */
export interface BidPlacedEvent {
  name: "BidPlaced";
  data: {
    token_id: bigint;
    bidder: string;
    amount?: bigint;
    extended?: boolean;
    new_end_time?: bigint;
  };
}

/**
 * Event: BidRefunded
 */
export interface BidRefundedEvent {
  name: "BidRefunded";
  data: {
    token_id: bigint;
    bidder: string;
    amount?: bigint;
  };
}

/**
 * Event: AuctionCreated
 */
export interface AuctionCreatedEvent {
  name: "AuctionCreated";
  data: {
    token_id: bigint;
    start_time?: bigint;
    end_time?: bigint;
    reserve_price?: bigint;
    payment_token?: string;
  };
}

/**
 * Event: AuctionSettled
 */
export interface AuctionSettledEvent {
  name: "AuctionSettled";
  data: {
    token_id: bigint;
    winner?: string | null;
    amount?: bigint;
  };
}

/**
 * Emitted when a push refund failed and was credited to `PendingRefund`.
 * `amount` is the amount added by this event, not the running total.
 */
export interface RefundDeferredEvent {
  name: "RefundDeferred";
  data: {
    token_id: bigint;
    bidder: string;
    amount?: bigint;
  };
}

/**
 * Emitted once when the Manager launches the auction (Setup -> Live).
 */
export interface AuctionLaunchedEvent {
  name: "AuctionLaunched";
  data: {
    treasury: string;
    /**
     * Whether the auction was unpaused and the first auction created.
     */
    started?: boolean;
  };
}

/**
 * Event: DurationUpdated
 */
export interface DurationUpdatedEvent {
  name: "DurationUpdated";
  data: {
    duration?: bigint;
    changed_by?: string;
  };
}

/**
 * Emitted when a bidder pulls their deferred refund via `withdraw_refund`.
 */
export interface RefundWithdrawnEvent {
  name: "RefundWithdrawn";
  data: {
    bidder: string;
    amount?: bigint;
  };
}

/**
 * Event: AuctionCancelled
 */
export interface AuctionCancelledEvent {
  name: "AuctionCancelled";
  data: {
    token_id: bigint;
    reason?: number;
    cancelled_by?: string;
  };
}

/**
 * Event: TimeBufferUpdated
 */
export interface TimeBufferUpdatedEvent {
  name: "TimeBufferUpdated";
  data: {
    time_buffer?: bigint;
    changed_by?: string;
  };
}

/**
 * Event: AuctionInitialized
 */
export interface AuctionInitializedEvent {
  name: "AuctionInitialized";
  data: {
    admin: string;
    token_contract?: string;
    treasury?: string;
    duration?: bigint;
    reserve_price?: bigint;
    min_bid_increment_percent?: number;
    time_buffer?: bigint;
    payment_token?: string;
    version?: string;
  };
}

/**
 * Event: PaymentTokenUpdated
 */
export interface PaymentTokenUpdatedEvent {
  name: "PaymentTokenUpdated";
  data: {
    payment_token?: string;
    changed_by?: string;
  };
}

/**
 * Event: ReservePriceUpdated
 */
export interface ReservePriceUpdatedEvent {
  name: "ReservePriceUpdated";
  data: {
    reserve_price?: bigint;
    changed_by?: string;
  };
}

/**
 * Event: MinBidIncrementUpdated
 */
export interface MinBidIncrementUpdatedEvent {
  name: "MinBidIncrementUpdated";
  data: {
    min_bid_increment_percent?: number;
    changed_by?: string;
  };
}

/**
 * Current state of an active auction.
 *
 * Tracks all dynamic auction data including bids, timing, and payment type.
 * Updated on every bid and reset on settlement.
 */
export interface AuctionState {
  /**
   * Unix timestamp when auction ends.
   *
   * Can be extended if bids arrive within the time buffer (max 10 times).
   */
  end_time: bigint;
  /**
   * Number of time extensions applied to this auction.
   *
   * Increments when bids extend the end time. Capped at [`MAX_AUCTION_EXTENSIONS`]
   * to prevent DoS attacks.
   */
  extension_count: number;
  /**
   * Current highest bid amount.
   *
   * Initialized to 0 (no bids). Must exceed reserve price on first bid.
   */
  highest_bid: bigint;
  /**
   * Current highest bidder address.
   *
   * `None` if no bids yet. The winner receives the minted token upon settlement.
   */
  highest_bidder: string | null;
  /**
   * Whether auction has been settled.
   *
   * `true` after `settle_auction()` or `settle_and_create_new()` completes.
   * Prevents double-settlement.
   */
  settled: boolean;
  /**
   * Unix timestamp when auction started.
   *
   * Set when auction is created (launch or post-settlement).
   */
  start_time: bigint;
  /**
   * The token ID being auctioned.
   *
   * The token is minted to the auction contract when the auction is created
   * and transferred to the winner (or the Treasury, if nobody bid) on
   * settlement. Ids follow the token's sequence, so they need not be
   * consecutive across auctions.
   */
  token_id: bigint;
}

/**
 * Auction configuration parameters.
 *
 * These settings control the behavior of all auctions. The admin can modify
 * them when the contract is paused, but changes only apply to future auctions,
 * not the currently active one.
 */
export interface AuctionConfig {
  /**
   * Duration of each auction in seconds.
   *
   * Standard auction window before time extensions. For example, 86400 = 24 hours.
   */
  duration: bigint;
  /**
   * Minimum bid increment as percentage (e.g., 10 = 10%).
   *
   * Each new bid must be at least `current_bid + (current_bid * increment / 100)`.
   * Must be <= [`MAX_BID_INCREMENT_PERCENT`].
   */
  min_bid_increment_percent: number;
  /**
   * SAC token address for payments.
   *
   * All auctions use this SAC token for bids and payments.
   * Native XLM payments are not supported.
   */
  payment_token: string;
  /**
   * Minimum first bid amount.
   *
   * Must be >= [`MIN_RESERVE_PRICE`]. Protects against dust auctions.
   */
  reserve_price: bigint;
  /**
   * Time buffer in seconds.
   *
   * If a bid arrives within this window of the auction end, the end time extends
   * by the buffer amount (up to [`MAX_AUCTION_EXTENSIONS`] times).
   */
  time_buffer: bigint;
  /**
   * The governance token contract to mint NFTs from.
   *
   * Must have granted mint authority to this auction contract.
   */
  token_contract: string;
  /**
   * The treasury address to receive auction proceeds.
   *
   * All winning bids are transferred to this address upon settlement.
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

/**
 * Event emitted when the contract is paused.
 */
export interface PausedEvent {
  name: "Paused";
  data: {

  };
}

/**
 * Event emitted when the contract is unpaused.
 */
export interface UnpausedEvent {
  name: "Unpaused";
  data: {

  };
}

/**
 * Error Enum: PausableError
 */
export const PausableError = {
  /**
   * The operation failed because the contract is paused.
   */
  1000 : { message: "EnforcedPause" },
  /**
   * The operation failed because the contract is not paused.
   */
  1001 : { message: "ExpectedPause" }
}
    export type ContractEvent = BidPlacedEvent | BidRefundedEvent | AuctionCreatedEvent | AuctionSettledEvent | RefundDeferredEvent | AuctionLaunchedEvent | DurationUpdatedEvent | RefundWithdrawnEvent | AuctionCancelledEvent | TimeBufferUpdatedEvent | AuctionInitializedEvent | PaymentTokenUpdatedEvent | ReservePriceUpdatedEvent | MinBidIncrementUpdatedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent | VersionSyncedEvent | PausedEvent | UnpausedEvent;
    