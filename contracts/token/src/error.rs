use soroban_sdk::contracterror;

/// Token errors (block `common::error::codes::TOKEN`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    /// Minter is not authorized to mint tokens
    MintAuthorityNotAllowed = 7201,
    /// Invalid input parameters (mismatched lengths, zero amounts, etc.)
    InvalidInput = 7202,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 7203,
    /// `launch` minters list does not contain the treasury
    TreasuryNotMinter = 7204,
    /// `batch_mint` exceeds the event budget (`common::batch_mint_fits`)
    BatchTooLarge = 7205,
}
