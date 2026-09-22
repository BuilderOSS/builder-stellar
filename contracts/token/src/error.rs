use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    /// Batch mint amount is invalid (must be 1-100)
    InvalidBatchMintAmount = 1101,
    /// Owner not set in contract storage
    OwnerNotSet = 1102,
    /// Minter is not authorized to mint tokens
    MintAuthorityNotAllowed = 1103,
}
