use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    /// Owner not set in contract storage
    OwnerNotSet = 1102,
    /// Minter is not authorized to mint tokens
    MintAuthorityNotAllowed = 1103,
    /// Invalid input parameters (mismatched lengths, zero amounts, etc.)
    InvalidInput = 1104,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 1105,
    /// `launch` minters list does not contain the treasury
    TreasuryNotMinter = 1106,
}
