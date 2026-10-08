//! Instance TTL policy shared by all modules.
//!
//! The network caps every entry at its `max_entry_ttl` (~3,110,400 ledgers,
//! about 180 days) and the host clamps an over-long `extend_to`. The constants
//! are therefore chosen below that cap: an instance is bumped to 170 days
//! whenever fewer than 60 days remain, so a real extension (and its rent)
//! happens at most about once every 110 days per contract. Between bumps,
//! [`extend_instance`] is one cheap TTL check. The lifetime renews on every
//! state-changing touch.

use soroban_sdk::Env;

/// Approximate ledgers per day (5 second ledgers).
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// TTL requested after an extension (~170 days, below the ~180 day network cap).
pub const INSTANCE_TTL_EXTEND_TO: u32 = 170 * DAY_IN_LEDGERS;
/// Extend only when remaining TTL falls below this (~60 days).
pub const INSTANCE_TTL_THRESHOLD: u32 = 60 * DAY_IN_LEDGERS;

/// Extend the instance storage (and therefore the contract code reference) TTL.
pub fn extend_instance(e: &Env) {
    e.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}
