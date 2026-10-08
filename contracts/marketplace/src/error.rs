use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MarketplaceError {
    NotInitialized = 1301,
    InvalidPrice = 1303,
    InvalidExpiry = 1304,
    ListingExists = 1305,
    ListingNotFound = 1306,
    ListingExpired = 1307,
    ListingActive = 1308,
    NotSeller = 1309,
    InvalidFee = 1310,
    ArithmeticOverflow = 1311,
    /// `launch` treasury differs from the treasury wired at construction.
    TreasuryMismatch = 1312,
    /// `launch` expected payment asset differs from the configured one
    PaymentAssetMismatch = 1313,
    /// The marketplace is paused (new listings and purchases are rejected).
    Paused = 1314,
}
