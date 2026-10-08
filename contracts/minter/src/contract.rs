//! Core Minter contract implementation.

use soroban_sdk::{contract, contractimpl, vec, xdr::ToXdr, Address, Bytes, BytesN, Env, Vec};

use crate::errors::MinterError;
use crate::events::*;
use crate::storage::*;
use common::clients::NftClient;

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
        // Get admin from token owner (also validates token_id)
        require_token_live(e, &token_id)?;
        let admin = get_admin(e, &token_id)?;
        admin.require_auth();

        // Validate inputs
        if recipients.len() != amounts.len() {
            return Err(MinterError::InvalidInput);
        }

        let count = recipients.len();
        if count == 0 || count > MAX_BATCH_RECIPIENTS {
            return Err(MinterError::BatchTooLarge);
        }

        // Call Token's batch_mint() directly instead of looping
        // This optimizes both delegation checks and checkpoint creation
        // Token batch_mint signature: batch_mint(minter: &Address, recipients: &Vec<Address>, amounts: &Vec<u128>) -> Vec<u32>
        let minter = e.current_contract_address();
        match NftClient::new(e, &token_id).try_batch_mint(&minter, &recipients, &amounts) {
            Ok(Ok(token_ids)) => {
                let total_amount: u128 = amounts.iter().fold(0u128, |acc, a| acc.saturating_add(a));
                let first_token_id = token_ids.first().unwrap_or(0);
                emit_mint_batch(e, &token_id, count, total_amount, first_token_id);
                Ok(())
            }
            _ => Err(MinterError::TokenContractError),
        }
    }

    /// Mints tokens to a recipient with merkle proof verification.
    /// User self-service claiming.
    ///
    /// The leaf is `sha256(recipient_xdr || amount_be_u128)`; internal nodes are
    /// `sha256(min(a, b) || max(a, b))` so proofs carry no direction bits.
    ///
    /// # Authorization
    ///
    /// Requires authentication from recipient
    pub fn mint_merkle(
        e: &Env,
        token_id: Address,
        recipient: Address,
        amount: u128,
        proof: Vec<BytesN<32>>,
    ) -> Result<(), MinterError> {
        recipient.require_auth();
        require_token_live(e, &token_id)?;

        let merkle_root = get_merkle_root(e, &token_id).ok_or(MinterError::MerkleRootNotSet)?;

        let round = get_merkle_round(e, &token_id);
        if is_merkle_claimed(e, &token_id, round, &recipient) {
            return Err(MinterError::AlreadyClaimed);
        }

        verify_merkle_proof(e, &recipient, amount, &proof, &merkle_root)?;

        mark_merkle_claimed(e, &token_id, round, &recipient);
        mint_claim(e, &token_id, &recipient, amount)?;

        emit_merkle_claim(e, &token_id, &recipient, amount);

        Ok(())
    }

    /// Mints tokens to a recipient from the allowlist.
    /// User self-service claiming with fixed amount.
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
        require_token_live(e, &token_id)?;

        let fixed_amount =
            get_allowlist_amount(e, &token_id).ok_or(MinterError::AllowlistNotSet)?;
        let version = get_allowlist_version(e, &token_id);

        if !is_allowlisted(e, &token_id, version, &recipient) {
            return Err(MinterError::NotInAllowlist);
        }

        if amount != fixed_amount {
            return Err(MinterError::InvalidAmount);
        }

        if is_allowlist_claimed(e, &token_id, version, &recipient) {
            return Err(MinterError::AlreadyClaimed);
        }

        mark_allowlist_claimed(e, &token_id, version, &recipient);
        mint_claim(e, &token_id, &recipient, amount)?;

        emit_allowlist_claim(e, &token_id, &recipient, amount);

        Ok(())
    }

    /// Sets the merkle root for a token and starts a new MERKLE claim round only
    /// (allowlist claims are unaffected); earlier merkle claimers may claim again
    /// under the new root. Claim markers are per method, so a recipient can claim
    /// once on each method per round; admins control both lists.
    /// Only callable by token owner (admin).
    ///
    /// # Authorization
    ///
    /// Requires authentication from token owner
    pub fn set_merkle_root(
        e: &Env,
        token_id: Address,
        root: BytesN<32>,
    ) -> Result<(), MinterError> {
        // Roots set during setup would otherwise survive launch.
        require_token_live(e, &token_id)?;
        let admin = get_admin(e, &token_id)?;
        admin.require_auth();

        set_merkle_root(e, &token_id, &root);
        bump_merkle_round(e, &token_id);

        emit_merkle_root_set(e, &token_id);

        Ok(())
    }

    /// Sets the allowlist for a token, replacing any previous allowlist.
    /// Only callable by token owner (admin).
    ///
    /// Each address gets its own persistent entry under a fresh version, so the
    /// previous list is invalidated without deleting its entries. Claim markers
    /// are keyed by round; this call starts a new ALLOWLIST round only
    /// (merkle claims are unaffected), so earlier allowlist claimers may claim
    /// again under the new list.
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
        require_token_live(e, &token_id)?;
        let admin = get_admin(e, &token_id)?;
        admin.require_auth();

        let count = addresses.len();
        let version = get_allowlist_version(e, &token_id) + 1;

        for addr in addresses.iter() {
            add_allowlisted(e, &token_id, version, &addr);
        }
        set_allowlist_version(e, &token_id, version);
        set_allowlist_amount(e, &token_id, &fixed_amount);

        emit_allowlist_set(e, &token_id, count);

        Ok(())
    }
}

// ========== Private helper functions ==========

/// Get admin from token owner. NO stored admin - derived from token.owner().
/// A failing call means `token_id` is not a valid token contract.
fn get_admin(e: &Env, token_id: &Address) -> Result<Address, MinterError> {
    match NftClient::new(e, token_id).try_owner() {
        Ok(Ok(owner)) => Ok(owner),
        _ => Err(MinterError::InvalidTokenId),
    }
}

/// Refuse to operate on a token that has not been launched. A failing call
/// means `token_id` is not a valid token contract.
fn require_token_live(e: &Env, token_id: &Address) -> Result<(), MinterError> {
    match NftClient::new(e, token_id).try_is_live() {
        Ok(Ok(true)) => Ok(()),
        Ok(Ok(false)) => Err(MinterError::TokenNotLive),
        _ => Err(MinterError::InvalidTokenId),
    }
}

/// Mint `amount` tokens to `recipient` with a single token call, so delegation
/// and voting checkpoints are handled once per claim rather than once per token.
fn mint_claim(
    e: &Env,
    token_id: &Address,
    recipient: &Address,
    amount: u128,
) -> Result<(), MinterError> {
    if amount == 0 {
        return Err(MinterError::InvalidAmount);
    }

    let minter = e.current_contract_address();
    let recipients = vec![e, recipient.clone()];
    let amounts = vec![e, amount];

    match NftClient::new(e, token_id).try_batch_mint(&minter, &recipients, &amounts) {
        Ok(Ok(_)) => Ok(()),
        _ => Err(MinterError::TokenContractError),
    }
}

/// Verify a merkle proof against `merkle_root`.
fn verify_merkle_proof(
    e: &Env,
    recipient: &Address,
    amount: u128,
    proof: &Vec<BytesN<32>>,
    merkle_root: &BytesN<32>,
) -> Result<(), MinterError> {
    if proof.len() > MAX_PROOF_LEN {
        return Err(MinterError::MerkleProofInvalid);
    }

    let mut leaf = Bytes::new(e);
    leaf.append(&recipient.clone().to_xdr(e));
    leaf.extend_from_array(&amount.to_be_bytes());
    let mut node: BytesN<32> = e.crypto().sha256(&leaf).into();

    for sibling in proof.iter() {
        let (a, b) = if node.to_array() <= sibling.to_array() {
            (node, sibling)
        } else {
            (sibling, node)
        };
        let mut pair = Bytes::new(e);
        pair.extend_from_array(&a.to_array());
        pair.extend_from_array(&b.to_array());
        node = e.crypto().sha256(&pair).into();
    }

    if node == *merkle_root {
        Ok(())
    } else {
        Err(MinterError::MerkleProofInvalid)
    }
}
