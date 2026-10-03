import {Address, xdr} from '@stellar/stellar-sdk';

    /**
 * Error Enum: MarketplaceError
 */
export const MarketplaceError = {
  1301 : { message: "NotInitialized" },
  1302 : { message: "Unauthorized" },
  1303 : { message: "InvalidPrice" },
  1304 : { message: "InvalidExpiry" },
  1305 : { message: "ListingExists" },
  1306 : { message: "ListingNotFound" },
  1307 : { message: "ListingExpired" },
  1308 : { message: "ListingActive" },
  1309 : { message: "NotSeller" },
  1310 : { message: "InvalidFee" },
  1311 : { message: "ArithmeticOverflow" }
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
    token_id: number;
    seller?: string;
    price?: bigint;
    expires_at?: bigint;
    fee_bps?: number;
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
  };
}

/**
 * Union: DataKey
 */
 export type DataKey =
  { tag: "Config"; values: void } |
  { tag: "Listing"; values: readonly [number] };

/**
 * Struct: Listing
 */
export interface Listing {
  expires_at: bigint;
  fee_bps: number;
  kind: ListingKind;
  price: bigint;
  seller: string;
}

/**
 * Union: ListingKind
 */
 export type ListingKind =
  { tag: "Primary"; values: void } |
  { tag: "Secondary"; values: void };

/**
 * Struct: MarketplaceConfig
 */
export interface MarketplaceConfig {
  current_hash: Uint8Array;
  default_secondary_fee_bps: number;
  manager: string;
  paused: boolean;
  payment_asset: string;
  token: string;
  treasury: string;
  version: string;
}

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
    export type ContractEvent = ListingExpiredEvent | ListingCancelledEvent | ListingPurchasedEvent | MarketplacePausedEvent | MarketplaceUnpausedEvent | MarketplaceUpgradedEvent | PaymentAssetUpdatedEvent | SecondaryFeeUpdatedEvent | PrimaryListingCreatedEvent | MarketplaceInitializedEvent | SecondaryListingCreatedEvent;
    