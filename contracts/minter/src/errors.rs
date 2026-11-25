//! Error types for the ClaimMinter module.

use soroban_sdk::contracterror;

/// ClaimMinter errors (block `common::error::codes::MINTER`). Errors raised by
/// the token during a mint (`AllowanceExceeded`, the batch budget) propagate
/// unchanged with the token's code. Codes of the retired shared Minter (7802,
/// 7804, 7811, 7813, 7814) are not reused.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ClaimMinterError {
    /// `open_list` with a `total` of zero, or `claim` with a `leaf_amount` or
    /// `mint_now` of zero
    InvalidAmount = 7801,
    /// `claim` with `mint_now` above `common::MAX_BATCH_MINT` (claim the rest
    /// in another call)
    BatchTooLarge = 7803,
    /// `claim` with `mint_now` above what is left of the claimer's leaf
    AlreadyClaimed = 7807,
    /// `claim` whose proof doesn't lead from the claimer's leaf to the list's
    /// root, or has more than 32 siblings
    MerkleProofInvalid = 7808,
    /// `claim` whose cost, `price × mint_now`, overflows
    InvalidInput = 7809,
    /// `release` before the DAO is Live
    TokenNotLive = 7810,
    /// `open_list` with a `tree_uri` that is empty, longer than
    /// `common::MAX_STRING_LENGTH`, or not an `ipfs://` URI
    InvalidTreeUri = 7812,
    /// No list with this id
    ListNotFound = 7815,
    /// `claim` or `close_list` at or after the list's `expires_at`
    ListExpired = 7816,
    /// `claim` that would mint past the list's `total`
    ListSoldOut = 7817,
    /// `claim` on a list whose price is above the claimer's `max_price`
    PriceAboveMax = 7818,
    /// `claim` on an assurance list that failed: refunds only
    AssuranceFailed = 7819,
    /// `assurance_state` or `refund` on a list with no assurance terms
    NotAssurance = 7820,
    /// `open_list` with assurance terms once Live, or `close_list` on the
    /// assurance list before launch
    AssuranceNotAllowed = 7821,
    /// `open_list` with assurance terms when this ClaimMinter already has its
    /// assurance list
    AssuranceExists = 7822,
    /// `refund` on a list that has not failed
    NotFailed = 7823,
    /// `refund` for a claimer with nothing in escrow
    NothingToRefund = 7824,
    /// `open_list` with assurance terms whose threshold is zero or above
    /// `total`, or whose deadline is not after now or is after `expires_at`
    InvalidAssurance = 7825,
    /// `open_list` before launch while the artwork has no properties
    ArtworkMissing = 7826,
    /// `open_list` before launch in an asset other than the configured one
    PaymentAssetMismatch = 7827,
    /// `open_list` with a negative price
    InvalidPrice = 7828,
    /// `open_list` with an `expires_at` not in the future
    InvalidExpiry = 7829,
    /// `launch` / `handoff` treasury differs from the one wired at construction
    TreasuryMismatch = 7830,
}
