#[cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env};

// Simple smoke tests for contract compilation and basic functionality

#[test]
fn test_contract_compiles() {
    // Just verify the contract can be instantiated
    let _env = Env::default();
}

#[test]
fn test_constants_defined() {
    use minter::MAX_BATCH_RECIPIENTS;
    assert_eq!(MAX_BATCH_RECIPIENTS, 100);
}

#[test]
fn test_minter_contract_exists() {
    use minter::MinterContract;
    let _contract = MinterContract;
}

#[test]
fn test_storage_enums_defined() {
    use minter::MinterKey;
    let token_id = Address::generate(&Env::default());

    // Just verify the enum variants compile
    let _key1 = MinterKey::MerkleRoot(token_id.clone());
    let _key2 = MinterKey::AllowlistVersion(token_id.clone());
    let _key3 = MinterKey::AllowlistAmount(token_id.clone());
    let recipient = Address::generate(&Env::default());
    let _key4 = MinterKey::MerkleClaimed(token_id, 0, recipient);
}

#[test]
fn test_errors_defined() {
    use minter::MinterError;

    // Just verify errors exist
    let _err2 = MinterError::InvalidAmount;
    let _err3 = MinterError::InvalidTokenId;
    let _err4 = MinterError::BatchTooLarge;
}
