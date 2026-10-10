//! Shared helpers for the DAO module contracts (token, governor, treasury,
//! auction, marketplace, metadata).
//!
//! Library only: this crate exports no `#[contract]`.
//!
//! - [`admin`]: the single admin model (launch admin in setup, Treasury once live).
//! - [`lifecycle`]: the `Live` instance flag (setup vs. live phase).
//! - [`upgrade`]: manager-approved WASM upgrade, `CurrentHash` / `CurrentVersion`,
//!   and the `StorageVersion` / `migrate` convention.
//! - [`ttl`]: the shared instance and persistent TTL policy.
//! - [`clients`]: typed `#[contractclient]` traits for cross-contract calls (no linked exports).
//! - [`error`]: typed errors and the error-code block of every crate
//!   ([`error::codes`]); codes are unique across all project contracts.

#![no_std]

pub mod admin;
pub mod clients;
pub mod error;
pub mod lifecycle;
pub mod ttl;
pub mod upgrade;

pub use error::CommonError;

// Parameter bounds shared by the Manager (validated once at `create_dao`) and
// the module that owns each parameter (validated again by its constructor and
// setters). Keeping one definition here means the two can never disagree.

/// Lower bound for every governance timing value: voting delay, voting period
/// and queue delay (five minutes, seconds).
pub const MIN_GOVERNANCE_DELAY: u32 = 300;
/// Upper bound for every governance timing value (30 days, seconds).
pub const MAX_GOVERNANCE_DELAY: u32 = 2_592_000;

/// Lower bound for the auction `duration` (five minutes, seconds).
pub const MIN_AUCTION_DURATION: u64 = 300;
/// Upper bound for the auction `duration` (30 days, seconds). There is no
/// reserve-price cap by design (see docs/SECURITY_MODEL.md).
pub const MAX_AUCTION_DURATION: u64 = 2_592_000;
/// Upper bound for the auction anti-snipe `time_buffer` (one day, seconds).
/// The lower bound is 1.
pub const MAX_AUCTION_TIME_BUFFER: u64 = 86_400;
/// Minimum auction reserve price, in the payment asset's smallest unit.
pub const MIN_RESERVE_PRICE: i128 = 1_000;

/// Basis-point denominator (10,000 = 100%).
pub const BPS_DENOMINATOR: u32 = 10_000;
/// Upper bound for the marketplace secondary-sale fee (25%).
pub const MAX_FEE_BPS: u32 = 2_500;

/// Maximum length of a configurable string (names, URIs, descriptions).
pub const MAX_STRING_LENGTH: u32 = 256;

/// Contract-event budget for one `batch_mint` call, in estimated bytes.
///
/// A transaction may publish at most 16 KiB of contract events. A batch emits
/// OpenZeppelin `Mint` per token, one `MintBatchWithMinter` and one metadata
/// `SeedsGenerated`, plus OpenZeppelin delegation events for each recipient
/// that has no delegate yet. Measured worst case (16-trait artwork, every
/// recipient new): ~376 bytes per call, ~288 per token, ~436 per recipient.
/// The per-unit estimates below round those up, and the budget leaves ~15%
/// of the limit spare. The e2e suite mints batches at the edge of the budget
/// against real metadata; re-measure there if events change.
pub const BATCH_MINT_EVENT_BUDGET: u32 = 13_500;
/// Estimated event bytes per minted token (see `BATCH_MINT_EVENT_BUDGET`).
pub const BATCH_MINT_BYTES_PER_TOKEN: u32 = 300;
/// Estimated event bytes per recipient entry (see `BATCH_MINT_EVENT_BUDGET`).
pub const BATCH_MINT_BYTES_PER_RECIPIENT: u32 = 450;

/// Most tokens one `batch_mint` call can create (all to one recipient): 43.
pub const MAX_BATCH_MINT: u32 =
    (BATCH_MINT_EVENT_BUDGET - BATCH_MINT_BYTES_PER_RECIPIENT) / BATCH_MINT_BYTES_PER_TOKEN;
/// Most recipient entries one `batch_mint` call can take (one token each): 18.
pub const MAX_BATCH_RECIPIENTS: u32 =
    BATCH_MINT_EVENT_BUDGET / (BATCH_MINT_BYTES_PER_TOKEN + BATCH_MINT_BYTES_PER_RECIPIENT);

/// Whether a batch of `tokens` tokens over `recipients` recipient entries fits
/// `BATCH_MINT_EVENT_BUDGET`. Entries are counted as new recipients even when
/// an address repeats or already has a delegate (conservative).
pub fn batch_mint_fits(tokens: u32, recipients: u32) -> bool {
    let cost = (tokens as u64) * (BATCH_MINT_BYTES_PER_TOKEN as u64)
        + (recipients as u64) * (BATCH_MINT_BYTES_PER_RECIPIENT as u64);
    cost <= BATCH_MINT_EVENT_BUDGET as u64
}

/// WARNING: exports `MockManager` as a `#[contract]`. Enable the `testutils`
/// feature only through `[dev-dependencies]`. See README.md.
#[cfg(any(test, feature = "testutils"))]
pub mod testutils;

#[cfg(test)]
mod test;
