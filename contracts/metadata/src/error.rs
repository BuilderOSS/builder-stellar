use soroban_sdk::contracterror;

/// Metadata errors (block `common::error::codes::METADATA`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Settings missing (contract not initialized)
    NotInitialized = 7301,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 7302,
    /// The first `add_properties` call must add at least one property and one item
    OnePropertyAndItemRequired = 7303,
    /// A call added no items, or a new property got no items
    PropertyHasNoItems = 7304,
    /// More than 16 properties
    TooManyProperties = 7305,
    /// An item references a property that does not exist
    InvalidPropertySelected = 7306,
    /// `regenerate` called while no properties exist
    NoProperties = 7307,
    /// More than `MAX_ITEMS_PER_CALL` items in one `add_properties` call
    TooManyItems = 7308,
    /// A paginated/bump `limit` above `MAX_PAGE`
    LimitTooHigh = 7309,
    /// The token does not exist (or has no attributes yet)
    TokenNotMinted = 7310,
    /// `regenerate` called for a token that already has attributes
    AlreadySeeded = 7311,
    /// A settings string is longer than `common::MAX_STRING_LENGTH`
    StringTooLong = 7312,
}
