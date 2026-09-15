import {Address, xdr} from '@stellar/stellar-sdk';

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
   * Token minting failed
   */
  1209 : { message: "MintFailed" },
  /**
   * Token or payment transfer failed
   */
  1210 : { message: "TransferFailed" },
  /**
   * Payment token not configured for SAC bids
   */
  1211 : { message: "NoPaymentTokenSet" },
  /**
   * Auction not launched yet
   */
  1212 : { message: "NotLaunched" },
  /**
   * Cannot create new auction
   */
  1213 : { message: "CannotCreateAuction" },
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
   * Inconsistent payment type between bids
   */
  1217 : { message: "InconsistentPaymentType" },
  /**
   * Maximum auction extensions exceeded
   */
  1218 : { message: "MaxExtensionsExceeded" },
  /**
   * Contract not initialized properly
   */
  1219 : { message: "NotInitialized" },
  /**
   * Token ID exceeds valid range
   */
  1220 : { message: "TokenIdOverflow" },
  /**
   * External contract call failed
   */
  1221 : { message: "ExternalCallFailed" }
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
    payment_type?: PaymentType;
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
    bidder: string;
    amount?: bigint;
    payment_type?: PaymentType;
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
    payment_type?: PaymentType;
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
 * Event: TreasuryUpdated
 */
export interface TreasuryUpdatedEvent {
  name: "TreasuryUpdated";
  data: {
    treasury?: string;
    changed_by?: string;
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
    payment_token?: string | null;
  };
}

/**
 * Event: PaymentTokenUpdated
 */
export interface PaymentTokenUpdatedEvent {
  name: "PaymentTokenUpdated";
  data: {
    payment_token?: string | null;
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
 * Storage keys for auction instance data.
 */
 export type DataKey =
  /**
   * Auction configuration parameters (duration, reserve price, etc.)
   */
  { tag: "Config"; values: void } |
  /**
   * Current auction state (token ID, bids, timing, etc.)
   */
  { tag: "Auction"; values: void } |
  /**
   * Whether the first auction has been launched (prevents re-initialization)
   */
  { tag: "Launched"; values: void };

/**
 * Payment currency type for an auction.
 *
 * The first bidder determines which payment type (XLM or SAC token) will be
 * used for the entire auction. All subsequent bids must use the same type.
 */
 export type PaymentType =
  /**
   * Native XLM (Stellar lumens) payment.
   */
  { tag: "Native"; values: void } |
  /**
   * SAC (Stellar Asset Contract) token payment.
   *
   * The address identifies which specific SAC token contract.
   */
  { tag: "SAC"; values: readonly [string] };

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
   * Payment type for this auction.
   *
   * Locked on the first bid. All subsequent bids must use the same currency.
   * Resets to undetermined on next auction.
   */
  payment_currency: PaymentType;
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
   * Configured SAC token address for payments.
   *
   * The constructor requires this value to be `Some`; native XLM payments are
   * not supported. Payment type locks on the first bid of each auction.
   */
  payment_token: string | null;
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
 * Union: UpgradeableStorageKey
 */
 export type UpgradeableStorageKey =
  { tag: "SchemaVersion"; values: void };

/**
 * Event emitted when the merkle root is set.
 */
export interface SetRootEvent {
  name: "SetRoot";
  data: {
    root?: Uint8Array;
  };
}

/**
 * Event emitted when an index is claimed.
 */
export interface SetClaimedEvent {
  name: "SetClaimed";
  data: {
    index?: number;
  };
}

/**
 * Error Enum: MerkleDistributorError
 */
export const MerkleDistributorError = {
  /**
   * The merkle root is not set.
   */
  1300 : { message: "RootNotSet" },
  /**
   * The provided index was already claimed.
   */
  1301 : { message: "IndexAlreadyClaimed" },
  /**
   * The proof is invalid.
   */
  1302 : { message: "InvalidProof" }
}

/**
 * Storage keys for the data associated with `MerkleDistributor`
 */
 export type MerkleDistributorStorageKey =
  /**
   * The Merkle root of the distribution tree
   */
  { tag: "Root"; values: void } |
  /**
   * Maps an index to its claimed status
   */
  { tag: "Claimed"; values: readonly [number] };

/**
 * Rounding direction for division operations
 */
 export type Rounding =
  /**
   * Round toward negative infinity (down)
   */
  { tag: "Floor"; values: void } |
  /**
   * Round toward positive infinity (up)
   */
  { tag: "Ceil"; values: void } |
  /**
   * Round toward zero (truncation)
   */
  { tag: "Truncate"; values: void };

/**
 * Error Enum: SorobanFixedPointError
 */
export const SorobanFixedPointError = {
  /**
   * Arithmetic overflow occurred
   */
  1500 : { message: "Overflow" },
  /**
   * Division by zero
   */
  1501 : { message: "DivisionByZero" },
  /**
   * Base is outside the valid domain (e.g. `ln(x)` for `x <= 0`,
   * or `powf(x, y)` with non-positive `x` combined with float exponent).
   */
  1502 : { message: "InvalidBase" }
}

/**
 * Error Enum: CryptoError
 */
export const CryptoError = {
  /**
   * The merkle proof length is out of bounds.
   */
  1400 : { message: "MerkleProofOutOfBounds" },
  /**
   * The index of the leaf is out of bounds.
   */
  1401 : { message: "MerkleIndexOutOfBounds" },
  /**
   * No data in hasher state.
   */
  1402 : { message: "HasherEmptyState" },
  /**
   * The point is neither the canonical identity encoding nor a canonical
   * on-curve point.
   */
  1403 : { message: "InvalidPoint" }
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

/**
 * Storage key for the pausable state
 */
 export type PausableStorageKey =
  /**
   * Indicates whether the contract is in paused state.
   */
  { tag: "Paused"; values: void };

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
 * Stores the pending role holder and the explicit deadline for acceptance.
 */
export interface PendingTransfer {
  address: string;
  live_until_ledger: number;
}

/**
 * Event emitted when a role is granted.
 */
export interface RoleGrantedEvent {
  name: "RoleGranted";
  data: {
    role: string;
    account: string;
    caller?: string;
  };
}

/**
 * Event emitted when a role is revoked.
 */
export interface RoleRevokedEvent {
  name: "RoleRevoked";
  data: {
    role: string;
    account: string;
    caller?: string;
  };
}

/**
 * Event emitted when the admin role is renounced.
 */
export interface AdminRenouncedEvent {
  name: "AdminRenounced";
  data: {
    admin: string;
  };
}

/**
 * Event emitted when a role admin is changed.
 */
export interface RoleAdminChangedEvent {
  name: "RoleAdminChanged";
  data: {
    role: string;
    previous_admin_role?: string;
    new_admin_role?: string;
  };
}

/**
 * Error Enum: AccessControlError
 */
export const AccessControlError = {
  2000 : { message: "Unauthorized" },
  2001 : { message: "AdminNotSet" },
  2002 : { message: "IndexOutOfBounds" },
  2003 : { message: "AdminRoleNotFound" },
  2004 : { message: "RoleCountIsNotZero" },
  2005 : { message: "RoleNotFound" },
  2006 : { message: "AdminAlreadySet" },
  2007 : { message: "RoleNotHeld" },
  2008 : { message: "RoleIsEmpty" },
  2009 : { message: "TransferInProgress" },
  2010 : { message: "MaxRolesExceeded" }
}

/**
 * Event emitted when an admin transfer is completed.
 */
export interface AdminTransferCompletedEvent {
  name: "AdminTransferCompleted";
  data: {
    new_admin: string;
    previous_admin?: string;
  };
}

/**
 * Event emitted when an admin transfer is initiated.
 */
export interface AdminTransferInitiatedEvent {
  name: "AdminTransferInitiated";
  data: {
    current_admin: string;
    new_admin?: string;
    live_until_ledger?: number;
  };
}

/**
 * Storage key for enumeration of accounts per role.
 */
export interface RoleAccountKey {
  index: number;
  role: string;
}

/**
 * Storage keys for the data associated with the access control
 */
 export type AccessControlStorageKey =
  { tag: "ExistingRoles"; values: void } |
  { tag: "RoleAccounts"; values: readonly [RoleAccountKey] } |
  { tag: "HasRole"; values: readonly [string, string] } |
  { tag: "RoleAccountsCount"; values: readonly [string] } |
  { tag: "RoleAdmin"; values: readonly [string] } |
  { tag: "Admin"; values: void } |
  { tag: "PendingAdmin"; values: void };

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
 * Storage keys for `Ownable` utility.
 */
 export type OwnableStorageKey =
  { tag: "Owner"; values: void } |
  { tag: "PendingOwner"; values: void };

/**
 * Context of a single authorized call performed by an address.
 *
 * Custom account contracts that implement `__check_auth` special function
 * receive a list of `Context` values corresponding to all the calls that
 * need to be authorized.
 */
 export type Context =
  /**
   * Contract invocation.
   */
  { tag: "Contract"; values: readonly [ContractContext] } |
  /**
   * Contract that has a constructor with no arguments is created.
   */
  { tag: "CreateContractHostFn"; values: readonly [CreateContractHostFnContext] } |
  /**
   * Contract that has a constructor with 1 or more arguments is created.
   */
  { tag: "CreateContractWithCtorHostFn"; values: readonly [CreateContractWithConstructorHostFnContext] };

/**
 * Authorization context of a single contract call.
 *
 * This struct corresponds to a `require_auth_for_args` call for an address
 * from `contract` function with `fn_name` name and `args` arguments.
 */
export interface ContractContext {
  args: Array<any>;
  contract: string;
  fn_name: string;
}

/**
 * Contract executable used for creating a new contract and used in
 * `CreateContractHostFnContext`.
 */
 export type ContractExecutable =
  { tag: "Wasm"; values: readonly [Uint8Array] };

/**
 * Value of contract node in InvokerContractAuthEntry tree.
 */
export interface SubContractInvocation {
  context: ContractContext;
  sub_invocations: Array<InvokerContractAuthEntry>;
}

/**
 * A node in the tree of authorizations performed on behalf of the current
 * contract as invoker of the contracts deeper in the call stack.
 *
 * This is used as an argument of `authorize_as_current_contract` host function.
 *
 * This tree corresponds `require_auth[_for_args]` calls on behalf of the
 * current contract.
 */
 export type InvokerContractAuthEntry =
  /**
   * Invoke a contract.
   */
  { tag: "Contract"; values: readonly [SubContractInvocation] } |
  /**
   * Create a contract passing 0 arguments to constructor.
   */
  { tag: "CreateContractHostFn"; values: readonly [CreateContractHostFnContext] } |
  /**
   * Create a contract passing 0 or more arguments to constructor.
   */
  { tag: "CreateContractWithCtorHostFn"; values: readonly [CreateContractWithConstructorHostFnContext] };

/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 */
export interface CreateContractHostFnContext {
  executable: ContractExecutable;
  salt: Uint8Array;
}

/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 * This is the same as `CreateContractHostFnContext`, but also has
 * contract constructor arguments.
 */
export interface CreateContractWithConstructorHostFnContext {
  constructor_args: Array<any>;
  executable: ContractExecutable;
  salt: Uint8Array;
}

/**
 * Union: Executable
 */
 export type Executable =
  { tag: "Wasm"; values: readonly [Uint8Array] } |
  { tag: "StellarAsset"; values: void } |
  { tag: "Account"; values: void };
    export type ContractEvent = BidPlacedEvent | BidRefundedEvent | AuctionCreatedEvent | AuctionSettledEvent | DurationUpdatedEvent | TreasuryUpdatedEvent | AuctionCancelledEvent | TimeBufferUpdatedEvent | AuctionInitializedEvent | PaymentTokenUpdatedEvent | ReservePriceUpdatedEvent | MinBidIncrementUpdatedEvent | SetRootEvent | SetClaimedEvent | PausedEvent | UnpausedEvent | RoleGrantedEvent | RoleRevokedEvent | AdminRenouncedEvent | RoleAdminChangedEvent | AdminTransferCompletedEvent | AdminTransferInitiatedEvent | OwnershipTransferEvent | OwnershipRenouncedEvent | OwnershipTransferCompletedEvent;
    