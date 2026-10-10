use soroban_sdk::contracterror;

/// Error-code blocks, one per crate. Every project error code lives in
/// `7000..=7899`, outside every OpenZeppelin `stellar-contracts` range
/// (0-414, 1000-1001, 1300-1302, 1400-1403, 1500-1502, 2000-2203, 3000-3603,
/// 4000-4104, 5000-5023, 6000-6001), so a code identifies its crate without
/// knowing which contract raised it. Each crate numbers its errors from
/// `block + 1`. The e2e suite asserts every enum stays inside its block.
pub mod codes {
    pub const COMMON: u32 = 7000;
    pub const MANAGER: u32 = 7100;
    pub const TOKEN: u32 = 7200;
    pub const METADATA: u32 = 7300;
    pub const AUCTION: u32 = 7400;
    pub const GOVERNOR: u32 = 7500;
    pub const TREASURY: u32 = 7600;
    pub const MARKETPLACE: u32 = 7700;
    pub const MINTER: u32 = 7800;
    /// Size of each block.
    pub const BLOCK_SIZE: u32 = 100;
}

/// Errors shared by all module contracts (block `codes::COMMON`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CommonError {
    /// Operation requires the module to be live (launched).
    NotLive = 7001,
    /// Operation is only valid during setup; the module is already live.
    AlreadyLive = 7002,
    /// Manager address missing from storage.
    ManagerNotSet = 7003,
    /// `CurrentHash` missing from storage.
    CurrentHashNotSet = 7004,
    /// `from_hash` does not equal the stored `CurrentHash`.
    HashMismatch = 7005,
    /// Manager did not approve this upgrade path.
    UpgradeNotApproved = 7006,
    /// Manager has no registry entry for the requested hash.
    ImplementationNotFound = 7007,
    /// Module admin missing from storage.
    AdminNotSet = 7008,
    /// `CurrentVersion` missing from storage.
    VersionNotSet = 7009,
    /// Treasury address missing from storage.
    TreasuryNotSet = 7010,
    /// Governor address missing from storage.
    GovernorNotSet = 7011,
    /// `migrate` called while the stored layout is already current.
    NothingToMigrate = 7012,
    /// `StorageVersion` missing from storage.
    StorageVersionNotSet = 7013,
}

/// Unwrap `v` or abort the invocation with `err`.
pub fn require<T>(e: &soroban_sdk::Env, v: Option<T>, err: CommonError) -> T {
    v.unwrap_or_else(|| soroban_sdk::panic_with_error!(e, err))
}
