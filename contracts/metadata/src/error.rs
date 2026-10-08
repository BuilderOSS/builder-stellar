use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // Initialization
    AlreadyInitialized = 1,
    OnlyManager = 2,
    NotInitialized = 3,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 4,

    // Properties
    OnePropertyAndItemRequired = 10,
    PropertyHasNoItems = 11,
    TooManyProperties = 12,
    InvalidPropertySelected = 13,

    // Minting
    OnlyToken = 20,
    TokenNotMinted = 21,

    // Authorization
    Unauthorized = 30,

    // Data
    InvalidTokenId = 40,
}
