use soroban_sdk::contracterror;

/// Errors shared by all module contracts. Codes live in the 9000 range so
/// they never collide with module (11xx-13xx, 3, 30) or manager (10xx) codes.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CommonError {
    /// Operation requires the module to be live (launched).
    NotLive = 9001,
    /// Operation is only valid during setup; the module is already live.
    AlreadyLive = 9002,
    /// Manager address missing from storage.
    ManagerNotSet = 9003,
    /// `CurrentHash` missing from storage.
    CurrentHashNotSet = 9004,
    /// `from_hash` does not equal the stored `CurrentHash`.
    HashMismatch = 9005,
    /// Manager did not approve this upgrade path.
    UpgradeNotApproved = 9006,
    /// Manager has no registry entry for the requested hash.
    ImplementationNotFound = 9007,
    /// Owner missing from storage.
    OwnerNotSet = 9008,
    /// `CurrentVersion` missing from storage.
    VersionNotSet = 9009,
}

/// Unwrap `v` or abort the invocation with `err`.
pub fn require<T>(e: &soroban_sdk::Env, v: Option<T>, err: CommonError) -> T {
    v.unwrap_or_else(|| soroban_sdk::panic_with_error!(e, err))
}
