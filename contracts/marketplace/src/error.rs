use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MarketplaceError {
    NotInitialized = 1301,
    Unauthorized = 1302,
    InvalidPrice = 1303,
    InvalidExpiry = 1304,
    ListingExists = 1305,
    ListingNotFound = 1306,
    ListingExpired = 1307,
    ListingActive = 1308,
    NotSeller = 1309,
    InvalidFee = 1310,
    ArithmeticOverflow = 1311,
}
