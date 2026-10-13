//! Error types for the Manager contract.

use soroban_sdk::contracterror;

/// Manager errors (block `common::error::codes::MANAGER`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ManagerError {
    // Implementation registry
    /// Implementation name is wrong for the slot it is used in
    InvalidImplementationName = 7101,
    /// Manager hash/version missing, or `from_hash` is not the current hash
    InvalidVersion = 7102,
    /// Implementation not registered (or revoked where an active one is required)
    ImplementationNotFound = 7103,
    /// Implementation already revoked
    ImplementationAlreadyRevoked = 7104,
    /// Upgrade target revoked, names differ, or the path is not approved
    InvalidUpgradePath = 7105,
    /// Admin not set
    AdminNotSet = 7106,
    /// No admin handover is pending
    NoPendingAdmin = 7107,
    // 7108 (PlatformMinterNotSet) and 7110 (PlatformMinterMismatch) are
    // retired with the shared Minter.
    /// An implementation is already registered for this WASM hash
    ImplementationAlreadyRegistered = 7109,

    // Factory
    /// Factory is paused (no `create_dao` or `launch_dao`)
    FactoryPaused = 7111,
    /// Auction reserve price below `common::MIN_RESERVE_PRICE`
    InvalidParamBounds = 7112,
    /// Quorum basis points outside 1..=10000
    InvalidQuorumBps = 7113,
    /// Auction duration outside 5 minutes ..= 30 days
    InvalidDuration = 7114,
    /// Auction time buffer outside 1..=86400 seconds
    InvalidTimeBuffer = 7115,
    /// String longer than `common::MAX_STRING_LENGTH`
    StringTooLong = 7116,
    /// String empty
    StringEmpty = 7117,
    /// Governance timing out of range: each of voting delay, voting period and
    /// queue delay must be within 300 seconds ..= 30 days (2_592_000 seconds)
    InvalidGovernanceTiming = 7118,
    /// Proposal threshold must be at least 1
    InvalidProposalThreshold = 7119,
    /// No voting-capable token exists; mint at least one token to a holder
    /// other than the Treasury, Auction or Marketplace before launch
    LaunchSupplyZero = 7120,
    /// A module of the pending DAO currently runs a revoked or unregistered
    /// WASM hash; upgrade it (admin `upgrade` to an approved, non-revoked hash)
    /// before launching
    PendingDaoUsesRevokedImplementation = 7121,
    /// Slug is not 4-63 chars of `[a-z0-9-]` without a leading, trailing or
    /// doubled hyphen
    InvalidSlug = 7122,
    /// Slug is already claimed by a launched DAO
    SlugTaken = 7123,
    /// Current implementations not set
    CurrentImplementationsNotSet = 7124,
    /// Secondary-sale fee above `common::MAX_FEE_BPS`
    InvalidFee = 7125,
    /// The launch admin is no longer the token admin
    LaunchAdminNotOwner = 7126,

    // Registry
    /// No pending DAO for this token address
    DaoNotFound = 7127,
    /// No launched DAO is registered under this slug
    SlugNotFound = 7128,
    /// `change_slug` to the slug the DAO already has
    SlugUnchanged = 7129,
    /// The Manager's own upgrade was approved less than `upgrade_delay()` ledgers ago.
    UpgradeDelayNotElapsed = 7130,
    /// `upgrade_manager` to a hash that is not the latest Manager implementation.
    UpgradeNotLatest = 7131,
    /// A module's payment asset differs from the one recorded when it was
    /// created (the launch admin changed it in Setup); change it back first
    PaymentAssetMismatch = 7132,
    /// `modules` lists a kind twice, or lacks the Auction or Marketplace
    /// Phase 1 still requires
    InvalidModules = 7133,
    /// `create_module`'s `expected_n` is not `module_count(token, kind)`: a
    /// module of this kind was created since the proposal was drafted
    StaleModuleIndex = 7134,
}
