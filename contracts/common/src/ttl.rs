//! The TTL policy shared by all modules.
//!
//! The network caps every entry at its `max_entry_ttl` (~3,110,400 ledgers,
//! about 180 days) and the host clamps an over-long `extend_to`.
//!
//! - **Instance** entries are bumped to 170 days whenever fewer than 60 days
//!   remain, so a real extension (and its rent) happens at most about once
//!   every 110 days per contract. Between bumps, [`extend_instance`] is one
//!   cheap TTL check.
//! - **Persistent** entries that must live indefinitely (registry records,
//!   delegations, artwork, claim markers, refunds) are bumped to the cap
//!   (requested as one year, clamped by the host) whenever fewer than 30 days
//!   remain, via [`extend_persistent`].
//!
//! The threshold is always well below the extend-to value: when they are
//! (nearly) equal, every touch re-pays rent for no extra safety.
//! Short-lived data (listings, proposals) uses [`extend_persistent_for`] with
//! explicit values that follow the same rule.

use soroban_sdk::{Env, IntoVal, Val};

/// Approximate ledgers per day (5 second ledgers).
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// TTL requested after an instance extension (~170 days, below the ~180 day network cap).
pub const INSTANCE_TTL_EXTEND_TO: u32 = 170 * DAY_IN_LEDGERS;
/// Extend the instance only when remaining TTL falls below this (~60 days).
pub const INSTANCE_TTL_THRESHOLD: u32 = 60 * DAY_IN_LEDGERS;
/// TTL requested for long-lived persistent entries (nominally one year; the
/// host clamps it to the ~180 day network cap).
pub const PERSISTENT_TTL_EXTEND_TO: u32 = 365 * DAY_IN_LEDGERS;
/// Extend a long-lived persistent entry only when fewer than ~30 days remain.
pub const PERSISTENT_TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;

/// Bump the contract code only when fewer than ~2 days remain.
pub const CODE_TTL_THRESHOLD: u32 = 2 * DAY_IN_LEDGERS;
/// ...and then only to ~4 days. Code is shared by every DAO on a release and
/// is kept long by the platform (`scripts/renew-code-ttl.mjs`, extended at
/// upload). This in-contract bump is a backstop so code never archives while
/// it is used, sized so a caller pays a few days of rent at most.
pub const CODE_TTL_EXTEND_TO: u32 = 4 * DAY_IN_LEDGERS;

// Thresholds sit well below their targets, and instances never ask for more
// than testnet's maximum entry TTL (3,110,400 ledgers, 2026-10-12).
const _: () = assert!(INSTANCE_TTL_THRESHOLD * 2 < INSTANCE_TTL_EXTEND_TO);
const _: () = assert!(CODE_TTL_THRESHOLD * 2 <= CODE_TTL_EXTEND_TO);
const _: () = assert!(PERSISTENT_TTL_THRESHOLD * 2 < 3_110_400);
const _: () = assert!(INSTANCE_TTL_EXTEND_TO < 3_110_400);

/// Extend this contract's instance (60 -> 170 days) and, separately, its code
/// (`CODE_TTL_THRESHOLD` -> `CODE_TTL_EXTEND_TO`).
///
/// Not `instance().extend_ttl`: that applies the same threshold and target to
/// the code entry, so whenever shared code had under 60 days left the next
/// caller paid 170 days of its rent (~300 XLM per ~35 KB on testnet,
/// docs/STORAGE_DIET_REVIEW.md Finding 2).
pub fn extend_instance(e: &Env) {
    let this = e.current_contract_address();
    let deployer = e.deployer();
    deployer.extend_ttl_for_contract_instance(
        this.clone(),
        INSTANCE_TTL_THRESHOLD,
        INSTANCE_TTL_EXTEND_TO,
    );
    deployer.extend_ttl_for_code(this, CODE_TTL_THRESHOLD, CODE_TTL_EXTEND_TO);
}

/// Extend a long-lived persistent entry. The entry must exist.
pub fn extend_persistent<K: IntoVal<Env, Val>>(e: &Env, key: &K) {
    e.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
}

/// Extend a persistent entry with explicit values (for data with a bounded
/// lifetime). The entry must exist; keep `threshold` well below `extend_to`.
pub fn extend_persistent_for<K: IntoVal<Env, Val>>(
    e: &Env,
    key: &K,
    threshold: u32,
    extend_to: u32,
) {
    e.storage()
        .persistent()
        .extend_ttl(key, threshold, extend_to);
}
