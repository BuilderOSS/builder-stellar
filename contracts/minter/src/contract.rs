//! Core Minter contract implementation.

use soroban_sdk::{
    contract, contractimpl, symbol_short, vec, Address, Bytes, Env, IntoVal, Symbol, Vec,
};

use crate::errors::MinterError;
use crate::events::*;
use crate::storage::*;

#[contract]
pub struct MinterContract;

#[contractimpl]
impl MinterContract {
    /// Batch mints tokens to multiple recipients.
    /// Only callable by the token owner (admin).
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `token_id` - The token contract address
    /// * `recipients` - Vec of recipient addresses
    /// * `amounts` - Vec of amounts to mint
    ///
    /// # Authorization
    ///
    /// Requires authentication from token owner
    pub fn mint_batch(
        e: &Env,
        token_id: Address,
        recipients: Vec<Address>,
        amounts: Vec<u128>,
    ) -> Result<(), MinterError> {
        // Get admin from token owner
        let admin = get_admin(e, &token_id)?;
        admin.require_auth();

        // Validate token_id
        validate_token_id(e, &token_id)?;

        // Validate inputs
        if recipients.len() != amounts.len() {
            return Err(MinterError::InvalidInput);
        }

        let count = recipients.len() as u32;
        if count == 0 || count > MAX_BATCH_RECIPIENTS {
            return Err(MinterError::BatchTooLarge);
        }

        // Call Token's batch_mint() directly instead of looping
        // This optimizes both delegation checks and checkpoint creation
        // Token batch_mint signature: batch_mint(minter: &Address, recipients: &Vec<Address>, amounts: &Vec<u128>) -> Vec<u32>
        let minter = e.current_contract_address();
        let result: Result<soroban_sdk::Vec<u32>, soroban_sdk::Error> = e.invoke_contract(
            &token_id,
            &Symbol::new(e, "batch_mint"),
            vec![
                e,
                minter.into_val(e),
                recipients.into_val(e),
                amounts.into_val(e),
            ],
        );

        match result {
            Ok(_) => {
                // Emit batch event
                let total_amount: u128 = amounts.iter().fold(0u128, |acc, a| acc.saturating_add(a));
                emit_mint_batch(e, &token_id, count, total_amount);
                Ok(())
            }
            Err(_) => Err(MinterError::TokenContractError),
        }
    }

    /// Mints tokens to a recipient with merkle proof verification.
    /// User self-service claiming.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `token_id` - The token contract address
    /// * `recipient` - The recipient address
    /// * `amount` - The amount to mint
    /// * `proof` - The merkle proof
    ///
    /// # Authorization
    ///
    /// Requires authentication from recipient
    pub fn mint_merkle(
        e: &Env,
        token_id: Address,
        recipient: Address,
        amount: u128,
        proof: Bytes,
    ) -> Result<(), MinterError> {
        recipient.require_auth();

        // Validate token_id
        validate_token_id(e, &token_id)?;

        // Get merkle root
        let merkle_root = get_merkle_root(e, &token_id).ok_or(MinterError::MerkleRootNotSet)?;

        // Verify proof
        verify_merkle_proof(e, &recipient, &amount, &proof, &merkle_root)?;

        // Check not already claimed
        if is_claimed(e, &token_id, &recipient) {
            return Err(MinterError::AlreadyClaimed);
        }

        // Mint
        validate_and_mint(e, &token_id, &recipient, &amount)?;
        mark_claimed(e, &token_id, &recipient);

        emit_mint(e, &token_id, &recipient, amount);

        Ok(())
    }

    /// Mints tokens to a recipient from the allowlist.
    /// User self-service claiming with fixed amount.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `token_id` - The token contract address
    /// * `recipient` - The recipient address
    /// * `amount` - The amount to mint (must match fixed allowlist amount)
    ///
    /// # Authorization
    ///
    /// Requires authentication from recipient
    pub fn mint_allowlist(
        e: &Env,
        token_id: Address,
        recipient: Address,
        amount: u128,
    ) -> Result<(), MinterError> {
        recipient.require_auth();

        // Validate token_id
        validate_token_id(e, &token_id)?;

        // Get allowlist
        let allowlist = get_allowlist(e, &token_id).ok_or(MinterError::AllowlistNotSet)?;

        let fixed_amount =
            get_allowlist_amount(e, &token_id).ok_or(MinterError::AllowlistNotSet)?;

        // Check recipient in allowlist
        let mut found = false;
        for addr in allowlist.iter() {
            if addr == recipient {
                found = true;
                break;
            }
        }
        if !found {
            return Err(MinterError::NotInAllowlist);
        }

        // Check amount matches
        if amount != fixed_amount {
            return Err(MinterError::InvalidAmount);
        }

        // Check not already claimed
        if is_claimed(e, &token_id, &recipient) {
            return Err(MinterError::AlreadyClaimed);
        }

        // Mint
        validate_and_mint(e, &token_id, &recipient, &amount)?;
        mark_claimed(e, &token_id, &recipient);

        emit_mint(e, &token_id, &recipient, amount);

        Ok(())
    }

    /// Sets the merkle root for a token.
    /// Only callable by token owner (admin).
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `token_id` - The token contract address
    /// * `root` - The merkle root bytes
    ///
    /// # Authorization
    ///
    /// Requires authentication from token owner
    pub fn set_merkle_root(e: &Env, token_id: Address, root: Bytes) -> Result<(), MinterError> {
        // Get admin from token owner
        let admin = get_admin(e, &token_id)?;
        admin.require_auth();

        // Validate token_id
        validate_token_id(e, &token_id)?;

        // Store merkle root
        set_merkle_root(e, &token_id, &root);

        emit_merkle_root_set(e, &token_id);

        Ok(())
    }

    /// Sets the allowlist for a token.
    /// Only callable by token owner (admin).
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `token_id` - The token contract address
    /// * `addresses` - Vec of allowlist addresses
    /// * `fixed_amount` - The fixed claim amount per address
    ///
    /// # Authorization
    ///
    /// Requires authentication from token owner
    pub fn set_allowlist(
        e: &Env,
        token_id: Address,
        addresses: Vec<Address>,
        fixed_amount: u128,
    ) -> Result<(), MinterError> {
        // Get admin from token owner
        let admin = get_admin(e, &token_id)?;
        admin.require_auth();

        // Validate token_id
        validate_token_id(e, &token_id)?;

        let count = addresses.len() as u32;

        // Store allowlist config
        set_allowlist(e, &token_id, &addresses);
        set_allowlist_amount(e, &token_id, &fixed_amount);

        emit_allowlist_set(e, &token_id, count);

        Ok(())
    }
}

// ========== Private helper functions ==========

/// Get admin from token owner. NO stored admin - derived from token.owner()
fn get_admin(e: &Env, token_id: &Address) -> Result<Address, MinterError> {
    // Call token contract's owner() method
    let result: Result<Address, soroban_sdk::Error> =
        e.invoke_contract(token_id, &symbol_short!("owner"), vec![e]);

    match result {
        Ok(owner) => Ok(owner),
        Err(_) => Err(MinterError::TokenContractError),
    }
}

/// Validate that token_id is a valid token contract
fn validate_token_id(e: &Env, token_id: &Address) -> Result<(), MinterError> {
    // Simple check: try to call owner() and see if it responds
    let result: Result<Address, soroban_sdk::Error> =
        e.invoke_contract(token_id, &symbol_short!("owner"), vec![e]);

    match result {
        Ok(_) => Ok(()),
        Err(_) => Err(MinterError::InvalidTokenId),
    }
}

/// Validate amount and mint tokens to recipient
fn validate_and_mint(
    e: &Env,
    token_id: &Address,
    recipient: &Address,
    amount: &u128,
) -> Result<(), MinterError> {
    // Validate amount > 0
    if *amount == 0 {
        return Err(MinterError::InvalidAmount);
    }

    // Get the Minter contract's address to use as the minter
    let minter = e.current_contract_address();

    // Call token contract's mint() method once for each NFT (sequential minting)
    // Token mint signature: mint(minter: &Address, to: &Address) -> u32
    for _ in 0..*amount {
        let result: Result<u32, soroban_sdk::Error> = e.invoke_contract(
            token_id,
            &symbol_short!("mint"),
            vec![e, minter.into_val(e), recipient.clone().into_val(e)],
        );

        match result {
            Ok(_) => {}
            Err(_) => return Err(MinterError::TokenContractError),
        }
    }

    Ok(())
}

/// Verify a merkle proof
fn verify_merkle_proof(
    _e: &Env,
    _recipient: &Address,
    _amount: &u128,
    _proof: &Bytes,
    _merkle_root: &Bytes,
) -> Result<(), MinterError> {
    // TODO: Implement merkle proof verification
    // For now, accept all proofs (this is a placeholder)
    Ok(())
}
