//! Instance TTL policy shared by all modules.
//!
//! One documented set of constants: instance storage is bumped to 365 days
//! whenever fewer than 364 days remain. Calling [`extend_instance`] on each
//! entrypoint costs one TTL check; the actual extension happens at most once
//! a day per contract.

use soroban_sdk::Env;

/// Approximate ledgers per day (5 second ledgers).
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// Target TTL after an extension (1 year).
pub const INSTANCE_TTL_EXTEND_TO: u32 = 365 * DAY_IN_LEDGERS;
/// Extend only when remaining TTL falls below this (~364 days).
pub const INSTANCE_TTL_THRESHOLD: u32 = INSTANCE_TTL_EXTEND_TO - DAY_IN_LEDGERS;

/// Extend the instance storage (and therefore the contract code reference) TTL.
pub fn extend_instance(e: &Env) {
    e.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}
