use soroban_sdk::contracterror;

/// Treasury errors (block `common::error::codes::TREASURY`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreasuryError {
    /// `launch` treasury is not this contract
    TreasuryMismatch = 7601,
    /// A proposal action targets the Treasury with a function outside the allowlist
    UnknownSelfCall = 7602,
    /// Wrong number or type of arguments for an allowlisted self call
    InvalidSelfCallArgs = 7603,
    /// `targets`, `functions` and `args` lengths differ
    InvalidProposalLength = 7604,
    /// An `authorize` action is malformed, too large, or not followed by an
    /// external call it can apply to
    InvalidAuthorization = 7605,
}
