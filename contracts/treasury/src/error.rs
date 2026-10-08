use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreasuryError {
    /// `launch` treasury argument is not this contract's address
    TreasuryMismatch = 1401,
    /// A proposal targeted the Treasury with a function outside the allowlist
    UnknownSelfCall = 1402,
    /// Malformed arguments for an allowlisted self call
    InvalidSelfCallArgs = 1403,
    /// targets/functions/args lengths differ
    InvalidProposalLength = 1404,
}
