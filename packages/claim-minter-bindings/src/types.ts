import {Address, xdr} from '@stellar/stellar-sdk';

    /**
 * ClaimMinter errors (block `common::error::codes::MINTER`). Errors raised by
 * the token during a mint (`AllowanceExceeded`, the batch budget) propagate
 * unchanged with the token's code. Codes of the retired shared Minter (7802,
 * 7804, 7811, 7813, 7814) are not reused.
 */
export const ClaimMinterError = {
  /**
   * `total`, `leaf_amount` or `mint_now` is zero
   */
  7801 : { message: "InvalidAmount" },
  /**
   * `mint_now` above `common::MAX_BATCH_MINT` (claim the rest in another call)
   */
  7803 : { message: "BatchTooLarge" },
  /**
   * `mint_now` is more than is left of the claimer's leaf
   */
  7807 : { message: "AlreadyClaimed" },
  /**
   * Merkle proof verification failed
   */
  7808 : { message: "MerkleProofInvalid" },
  /**
   * Arithmetic overflow in the price
   */
  7809 : { message: "InvalidInput" },
  /**
   * `release` before the DAO is Live
   */
  7810 : { message: "TokenNotLive" },
  /**
   * `tree_uri` is empty, longer than `common::MAX_STRING_LENGTH`, or not
   * an `ipfs://` URI
   */
  7812 : { message: "InvalidTreeUri" },
  /**
   * No list with this id
   */
  7815 : { message: "ListNotFound" },
  /**
   * The list's `expires_at` has passed
   */
  7816 : { message: "ListExpired" },
  /**
   * The claim would mint past the list's `total`
   */
  7817 : { message: "ListSoldOut" },
  /**
   * The list's price is above the claimer's `max_price`
   */
  7818 : { message: "PriceAboveMax" },
  /**
   * The assurance list failed: refunds only
   */
  7819 : { message: "AssuranceFailed" },
  /**
   * The list has no assurance terms
   */
  7820 : { message: "NotAssurance" },
  /**
   * Assurance terms are only allowed before launch
   */
  7821 : { message: "AssuranceNotAllowed" },
  /**
   * This ClaimMinter already has its assurance list
   */
  7822 : { message: "AssuranceExists" },
  /**
   * `refund` on a list that has not failed
   */
  7823 : { message: "NotFailed" },
  /**
   * `refund` for a claimer with nothing in escrow
   */
  7824 : { message: "NothingToRefund" },
  /**
   * Threshold of zero, or a deadline not after now or after `expires_at`
   */
  7825 : { message: "InvalidAssurance" },
  /**
   * Lists opened before launch need artwork (`properties_count() > 0`)
   */
  7826 : { message: "ArtworkMissing" },
  /**
   * A list opened before launch must use the configured payment asset
   */
  7827 : { message: "PaymentAssetMismatch" },
  /**
   * Negative price
   */
  7828 : { message: "InvalidPrice" },
  /**
   * `expires_at` not in the future
   */
  7829 : { message: "InvalidExpiry" },
  /**
   * `launch` / `handoff` treasury differs from the one wired at construction
   */
  7830 : { message: "TreasuryMismatch" }
}

/**
 * A claim: `amount` tokens minted from `first_token_id` to `claimer`.
 */
export interface ClaimedEvent {
  name: "Claimed";
  data: {
    list_id: number;
    claimer: string;
    amount?: number;
    first_token_id?: number;
    /**
     * Paid for this claim, in the list's asset.
     */
    paid?: bigint;
    /**
     * Whether the payment went to escrow (assurance list before launch)
     * rather than the Treasury.
     */
    escrowed?: boolean;
    /**
     * The claimer's total on this list after this claim.
     */
    claimed?: number;
  };
}

/**
 * A failed list's escrow returned to a claimer.
 */
export interface RefundedEvent {
  name: "Refunded";
  data: {
    list_id: number;
    claimer: string;
    amount?: bigint;
  };
}

/**
 * A list opened: its root, where the full tree is published, and its terms.
 */
export interface ListOpenedEvent {
  name: "ListOpened";
  data: {
    list_id: number;
    root?: Uint8Array;
    tree_uri?: string;
    asset?: string;
    price?: bigint;
    expires_at?: bigint;
    total?: number;
    assurance?: AssuranceTerms | null;
  };
}

/**
 * The assurance escrow moved to the Treasury (at launch).
 */
export interface EscrowReleasedEvent {
  name: "EscrowReleased";
  data: {
    list_id: number;
    treasury?: string;
    amount?: bigint;
  };
}

/**
 * `<Module>Launched`: the ClaimMinter went Live with the DAO.
 */
export interface ClaimMinterLaunchedEvent {
  name: "ClaimMinterLaunched";
  data: {
    treasury: string;
  };
}

/**
 * One claim list: a merkle root of `(claimer, amount)` leaves.
 */
export interface ClaimList {
  asset: string;
  /**
   * Distinct addresses that claimed at least once.
   */
  claimers: number;
  deadline: bigint;
  /**
   * Payments held until launch (assurance list in Setup only).
   */
  escrow: bigint;
  /**
   * Claims stop at this ledger timestamp.
   */
  expires_at: bigint;
  minted: number;
  /**
   * Price per token in `asset`, 0 for a free list.
   */
  price: bigint;
  root: Uint8Array;
  /**
   * Assurance terms, flattened: a threshold of 0 means none (see
   * [`ClaimList::assurance`]).
   */
  threshold_claimers: number;
  /**
   * Most tokens this list mints across all claimers.
   */
  total: number;
  /**
   * `ipfs://<cid>` of the full tree (`builder-stellar-merkle-v1`). A hint:
   * consumers recompute the root from it before offering a claim.
   */
  tree_uri: string;
}

/**
 * A claimer's progress on one list.
 */
export interface ClaimRecord {
  /**
   * Tokens claimed so far, at most the leaf amount.
   */
  claimed: number;
  /**
   * Payments in escrow for this claimer (refundable while `Failed`).
   */
  escrowed: bigint;
}

/**
 * Wiring fixed at construction.
 */
export interface ClaimsConfig {
  /**
   * Registry for `version()` and upgrade approvals; the only caller of
   * `launch`, `handoff` and `recovery_upgrade`.
   */
  manager: string;
  /**
   * The asset every list opened in Setup is priced in (`ClaimsConfig` at
   * `create_dao` / `create_module`). Lists opened after launch may use any
   * asset.
   */
  payment_asset: string;
  token: string;
  /**
   * Receives every payment once the DAO is Live, and the assurance escrow
   * at launch. Fixed here, so nobody can redirect the escrow.
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
 * `assurance_state` of a ClaimMinter assurance list.
 */
 export type AssuranceState =
  /**
   * Fewer distinct claimers than the threshold, deadline not passed.
   */
  { tag: "Open"; values: void } |
  /**
   * The threshold is reached; the DAO may launch until the deadline.
   */
  { tag: "Met"; values: void } |
  /**
   * The deadline passed and the DAO is not Live: refunds only.
   */
  { tag: "Failed"; values: void };

/**
 * What a ClaimMinter assurance list must reach, and by when (design §3).
 */
export interface AssuranceTerms {
  /**
   * Ledger timestamp after which an unlaunched DAO's list is `Failed`.
   */
  deadline: bigint;
  /**
   * Distinct claimers needed for `Met`.
   */
  threshold_claimers: number;
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
    export type ContractEvent = ClaimedEvent | RefundedEvent | ListOpenedEvent | EscrowReleasedEvent | ClaimMinterLaunchedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent;
    