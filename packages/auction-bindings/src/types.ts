import {Address} from '@stellar/stellar-sdk';

    /**
 * Error Enum: AuctionError
 */
export const AuctionError = {
  /**
   * Bid placed for incorrect token ID
   */
  1201 : { message: "InvalidTokenId" },
  /**
   * Bid placed after auction ended
   */
  1202 : { message: "AuctionOver" },
  /**
   * Auction hasn't started yet
   */
  1203 : { message: "AuctionNotStarted" },
  /**
   * Attempting to settle an active auction
   */
  1204 : { message: "AuctionActive" },
  /**
   * Auction already settled
   */
  1205 : { message: "AuctionSettled" },
  /**
   * First bid doesn't meet reserve price
   */
  1206 : { message: "ReservePriceNotMet" },
  /**
   * Bid doesn't meet minimum increment
   */
  1207 : { message: "MinBidNotMet" },
  /**
   * Invalid configuration parameters (e.g., duration < 5 minutes, zero increment)
   */
  1208 : { message: "InvalidConfig" },
  /**
   * Auction not launched yet
   */
  1212 : { message: "NotLaunched" },
  /**
   * Unauthorized access
   */
  1214 : { message: "Unauthorized" },
  /**
   * Arithmetic overflow in calculations
   */
  1215 : { message: "ArithmeticOverflow" },
  /**
   * Invalid bid amount (too low or unreasonable)
   */
  1216 : { message: "InvalidBid" },
  /**
   * Contract not initialized properly
   */
  1219 : { message: "NotInitialized" },
  /**
   * `launch` treasury differs from the treasury wired at construction
   */
  1222 : { message: "TreasuryMismatch" },
  /**
   * `launch` expected payment token differs from the configured one
   */
  1223 : { message: "PaymentTokenMismatch" },
  /**
   * `withdraw_refund` called with no pending refund balance
   */
  1224 : { message: "NoPendingRefund" },
  /**
   * `set_time_buffer` value outside 1..=86400 seconds
   */
  1225 : { message: "InvalidTimeBuffer" }
}

/**
 * Emitted once when the Manager launches the auction (Setup -> Live).
 */
export interface LaunchedEvent {
  name: "Launched";
  data: {
    treasury: string;
    /**
     * Whether the auction was unpaused and the first auction created.
     */
    started?: boolean;
  };
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
    owner: string;
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
   * Starts at 1 and increments with each auction. The token is minted to the
   * winner upon settlement.
   */
  token_id: bigint;
}

/**
 * Auction configuration parameters.
 *
 * These settings control the behavior of all auctions. The owner can modify
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

/**
 * Error Enum: RoleTransferError
 */
export const RoleTransferError = {
  2200 : { message: "NoPendingTransfer" },
  2201 : { message: "InvalidLiveUntilLedger" },
  2202 : { message: "InvalidPendingAccount" },
  2203 : { message: "TransferExpired" }
}

/**
 * Error Enum: OwnableError
 */
export const OwnableError = {
  2100 : { message: "OwnerNotSet" },
  2101 : { message: "TransferInProgress" },
  2102 : { message: "OwnerAlreadySet" }
}

/**
 * Event emitted when an ownership transfer is initiated.
 */
export interface OwnershipTransferEvent {
  name: "OwnershipTransfer";
  data: {
    old_owner?: string;
    new_owner?: string;
    live_until_ledger?: number;
  };
}

/**
 * Event emitted when ownership is renounced.
 */
export interface OwnershipRenouncedEvent {
  name: "OwnershipRenounced";
  data: {
    old_owner?: string;
  };
}

/**
 * Event emitted when an ownership transfer is completed.
 */
export interface OwnershipTransferCompletedEvent {
  name: "OwnershipTransferCompleted";
  data: {
    new_owner?: string;
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
    export type ContractEvent = LaunchedEvent | BidPlacedEvent | BidRefundedEvent | AuctionCreatedEvent | AuctionSettledEvent | RefundDeferredEvent | DurationUpdatedEvent | RefundWithdrawnEvent | AuctionCancelledEvent | TimeBufferUpdatedEvent | AuctionInitializedEvent | PaymentTokenUpdatedEvent | ReservePriceUpdatedEvent | MinBidIncrementUpdatedEvent | OwnershipTransferEvent | OwnershipRenouncedEvent | OwnershipTransferCompletedEvent | PausedEvent | UnpausedEvent;
    