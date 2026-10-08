//! Error types for the Manager contract.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ManagerError {
    // ========================================================================
    // Implementation Management Errors (1000-1099)
    // ========================================================================
    /// Not authorized to perform this action
    Unauthorized = 1000,

    /// Invalid implementation name
    InvalidImplementationName = 1001,

    /// Invalid version number
    InvalidVersion = 1002,

    /// Implementation not found
    ImplementationNotFound = 1003,

    /// Implementation already revoked
    ImplementationAlreadyRevoked = 1004,

    /// Invalid upgrade path
    InvalidUpgradePath = 1005,

    /// Admin not set
    AdminNotSet = 1006,

    /// No admin handover is pending
    NoPendingAdmin = 1007,

    /// Platform minter not configured
    PlatformMinterNotSet = 1008,

    /// An implementation is already registered for this WASM hash
    ImplementationAlreadyRegistered = 1009,

    /// `enable_minter` requires `expected_minter` to equal the registered platform minter
    PlatformMinterMismatch = 1010,

    // ========================================================================
    // Factory Errors (1100-1199)
    // ========================================================================
    /// Factory is paused
    FactoryPaused = 1101,

    /// Invalid parameter bounds
    InvalidParamBounds = 1103,

    /// Invalid quorum basis points
    InvalidQuorumBps = 1105,

    /// Invalid duration
    InvalidDuration = 1107,

    /// Invalid time buffer
    InvalidTimeBuffer = 1108,

    /// String too long
    StringTooLong = 1112,

    /// String empty
    StringEmpty = 1113,

    /// Governance timing out of range: each of voting delay, voting period and
    /// queue delay must be within 300 seconds ..= 30 days (2_592_000 seconds)
    InvalidGovernanceTiming = 1117,

    /// Proposal threshold must be at least 1
    InvalidProposalThreshold = 1120,

    /// Token total supply is zero; mint at least one token before launch
    LaunchSupplyZero = 1121,

    /// Current implementations not set
    CurrentImplementationsNotSet = 1116,

    // ========================================================================
    // Registry Errors (1200-1299)
    // ========================================================================
    /// DAO not found
    DaoNotFound = 1201,
}
