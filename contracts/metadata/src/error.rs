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
    /// A settings or artwork string is longer than its cap
    StringTooLong = 7312,
    /// An artwork name contains `"`, `\` or a control character
    InvalidName = 7313,
    /// More than `MAX_IPFS_GROUPS` distinct IPFS groups
    TooManyIpfsGroups = 7314,
    /// A property would exceed `MAX_ITEMS_PER_PROPERTY` items
    PropertyFull = 7315,
    /// A profile is empty or longer than `common::MAX_PROFILE_LENGTH`
    InvalidProfile = 7316,
    /// `update_profile` was given a stale `expected_seq`
    ProfileSeqMismatch = 7317,
    /// The token JSON would exceed its buffer (a string over its cap)
    TokenUriTooLong = 7318,
    /// The token exists but was minted before any artwork; `regenerate` seeds it.
    NotSeeded = 7319,
}
