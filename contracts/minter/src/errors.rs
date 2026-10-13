//! Error types for the ClaimMinter module.

use soroban_sdk::contracterror;

/// ClaimMinter errors (block `common::error::codes::MINTER`). Errors raised by
/// the token during a mint (`AllowanceExceeded`, the batch budget) propagate
/// unchanged with the token's code. Codes of the retired shared Minter (7802,
/// 7804, 7811, 7813, 7814) are not reused.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ClaimMinterError {
    /// `total`, `leaf_amount` or `mint_now` is zero
    InvalidAmount = 7801,
    /// `mint_now` above `common::MAX_BATCH_MINT` (claim the rest in another call)
    BatchTooLarge = 7803,
    /// `mint_now` is more than is left of the claimer's leaf
    AlreadyClaimed = 7807,
    /// Merkle proof verification failed
    MerkleProofInvalid = 7808,
    /// Arithmetic overflow in the price
    InvalidInput = 7809,
    /// `release` before the DAO is Live
    TokenNotLive = 7810,
    /// `tree_uri` is empty, longer than `common::MAX_STRING_LENGTH`, or not
    /// an `ipfs://` URI
    InvalidTreeUri = 7812,
    /// No list with this id
    ListNotFound = 7815,
    /// The list's `expires_at` has passed
    ListExpired = 7816,
    /// The claim would mint past the list's `total`
    ListSoldOut = 7817,
    /// The list's price is above the claimer's `max_price`
    PriceAboveMax = 7818,
    /// The assurance list failed: refunds only
    AssuranceFailed = 7819,
    /// The list has no assurance terms
    NotAssurance = 7820,
    /// Assurance terms are only allowed before launch
    AssuranceNotAllowed = 7821,
    /// This ClaimMinter already has its assurance list
    AssuranceExists = 7822,
    /// `refund` on a list that has not failed
    NotFailed = 7823,
    /// `refund` for a claimer with nothing in escrow
    NothingToRefund = 7824,
    /// Threshold of zero, or a deadline not after now or after `expires_at`
    InvalidAssurance = 7825,
    /// Lists opened before launch need artwork (`properties_count() > 0`)
    ArtworkMissing = 7826,
    /// A list opened before launch must use the configured payment asset
    PaymentAssetMismatch = 7827,
    /// Negative price
    InvalidPrice = 7828,
    /// `expires_at` not in the future
    InvalidExpiry = 7829,
    /// `launch` / `handoff` treasury differs from the one wired at construction
    TreasuryMismatch = 7830,
}
