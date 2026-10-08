use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // Initialization
    NotInitialized = 3,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 4,

    // Properties
    OnePropertyAndItemRequired = 10,
    PropertyHasNoItems = 11,
    TooManyProperties = 12,
    InvalidPropertySelected = 13,
    /// `regenerate` called while no properties exist
    NoProperties = 14,
    /// More than `MAX_ITEMS_PER_CALL` items in one `add_properties` call
    TooManyItems = 15,
    /// A paginated/bump `limit` above the allowed cap
    LimitTooHigh = 16,

    // Minting
    OnlyToken = 20,
    TokenNotMinted = 21,
    /// `regenerate` called for a token that already has attributes
    AlreadySeeded = 22,

    // Authorization
    Unauthorized = 30,
    // Data
}
