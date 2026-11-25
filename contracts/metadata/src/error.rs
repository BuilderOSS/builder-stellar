use soroban_sdk::contracterror;

/// Metadata errors (block `common::error::codes::METADATA`). Entry points
/// return them as `Result` errors, or panic with them where they cannot
/// return one (the constructor, `launch`, `handoff`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Settings or profile state missing (contract not initialised)
    NotInitialized = 7301,
    /// `launch` or `handoff` was given a Treasury other than the one wired at
    /// construction
    TreasuryMismatch = 7302,
    /// The first `add_properties` call must add at least one property and one item
    OnePropertyAndItemRequired = 7303,
    /// A call added no items, or a new property got no items
    PropertyHasNoItems = 7304,
    /// More than `MAX_PROPERTIES` (16) properties
    TooManyProperties = 7305,
    /// An item references a property that does not exist
    InvalidPropertySelected = 7306,
    /// `regenerate` called while no properties exist
    NoProperties = 7307,
    /// More than `MAX_ITEMS_PER_CALL` items in one `add_properties` call
    TooManyItems = 7308,
    /// `get_items` was given a `limit` above `MAX_PAGE`
    LimitTooHigh = 7309,
    /// `regenerate`: the token does not exist. `get_attributes`: the token
    /// has no selections (it does not exist, or was minted before artwork)
    TokenNotMinted = 7310,
    /// `regenerate` called for a token that already has attributes
    AlreadySeeded = 7311,
    /// A settings or artwork string, or the `token_uri` name, is longer than
    /// its cap
    StringTooLong = 7312,
    /// A string copied into the token JSON (an artwork name, the renderer
    /// base or the `token_uri` name) contains `"`, `\` or a control character
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
    /// `token_uri`: the token has no selections, because it was minted before
    /// any artwork (`regenerate` seeds it) or was never minted (`token_uri`
    /// does not check existence)
    NotSeeded = 7319,
    /// The stored data layout is not the one this code expects: an upgrade
    /// whose `migrate` has not run yet, or an upgrade to code with an older
    /// layout. Every entry point that changes state refuses until `migrate`
    /// (or, for an older layout, another `upgrade`) brings the two back in
    /// step
    StorageVersionMismatch = 7320,
}
