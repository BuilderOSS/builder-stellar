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

    // ========================================================================
    // Factory Errors (1100-1199)
    // ========================================================================
    /// DAO creation failed
    DaoCreationFailed = 1100,

    /// Factory is paused
    FactoryPaused = 1101,

    /// Nonce already used
    NonceAlreadyUsed = 1102,

    /// Invalid parameter bounds
    InvalidParamBounds = 1103,

    /// Founders exceed 99 percent
    FoundersExceed99Percent = 1104,

    /// Invalid quorum basis points
    InvalidQuorumBps = 1105,

    /// Invalid proposal threshold basis points
    InvalidProposalThresholdBps = 1106,

    /// Invalid duration
    InvalidDuration = 1107,

    /// Invalid time buffer
    InvalidTimeBuffer = 1108,

    /// Deployment failed
    DeploymentFailed = 1109,

    /// Initialization failed
    InitializationFailed = 1110,

    /// Invalid payment asset
    InvalidPaymentAsset = 1111,

    /// String too long
    StringTooLong = 1112,

    /// String empty
    StringEmpty = 1113,

    /// Invalid founder allocation
    NoFoundersSpecified = 1114,

    /// Invalid founder percentage
    InvalidFounderPercentage = 1115,

    /// Current implementations not set
    CurrentImplementationsNotSet = 1116,

    // ========================================================================
    // Registry Errors (1200-1299)
    // ========================================================================
    /// DAO already registered
    DaoAlreadyRegistered = 1200,

    /// DAO not found
    DaoNotFound = 1201,

    /// Invalid pagination parameters
    InvalidPaginationParams = 1202,
}
