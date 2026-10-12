//! Core Minter contract implementation.

use soroban_sdk::{
    contract, contractimpl, vec, xdr::ToXdr, Address, Bytes, BytesN, Env, String, Vec,
};

use crate::errors::MinterError;
use crate::events::*;
use crate::storage::*;
use common::clients::{ManagerRegistryClient, NftClient};

#[contract]
pub struct MinterContract;

#[contractimpl]
impl MinterContract {
    /// * `manager` - the Manager: registry for `version()` and upgrade
    ///   approvals; its admin is the Minter's upgrade authority
    /// * `current_hash` - this implementation's WASM hash
    /// * `upgrade_delay` - ledgers between a Manager approval and the earliest
    ///   upgrade of this Minter (`RECOMMENDED_UPGRADE_DELAY` on a public
    ///   network; short on testnet). Changeable with `set_upgrade_delay`.
    pub fn __constructor(e: &Env, manager: Address, current_hash: BytesN<32>, upgrade_delay: u32) {
        set_manager(e, &manager);
        common::upgrade::init_delay(e, upgrade_delay);
        common::upgrade::init(e, &current_hash, STORAGE_VERSION);
    }

    /// The upgrade notice in force: ledgers between a Manager approval and
    /// the earliest upgrade.
    pub fn upgrade_delay(e: &Env) -> u32 {
        common::upgrade::delay(e)
    }

    /// Change the upgrade notice (Manager admin). A longer notice applies at
    /// once; a shorter one only after the notice in force has passed, so a
    /// compromised admin cannot shorten it to rush a hostile upgrade through.
    pub fn set_upgrade_delay(e: &Env, ledgers: u32) -> Result<(), MinterError> {
        require_manager_admin(e)?;
        common::upgrade::set_delay(e, ledgers);
        Ok(())
    }

    /// Batch mints tokens to multiple recipients.
    /// Only callable by the token's admin.
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
    /// Requires authentication from the token's admin
    pub fn mint_batch(
        e: &Env,
        token_id: Address,
        recipients: Vec<Address>,
        amounts: Vec<u128>,
    ) -> Result<(), MinterError> {
        common::ttl::extend_instance(e);
        // Admin is the token's admin (also validates token_id)
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

        // One token call for the whole batch: delegation and vote checkpoints
        // are touched once per recipient. Token errors propagate unchanged.
        let minter = e.current_contract_address();
        let token_ids = NftClient::new(e, &token_id).batch_mint(&minter, &recipients, &amounts);
        let total_amount: u128 = amounts.iter().fold(0u128, |acc, a| acc.saturating_add(a));
        let first_token_id = token_ids.first().unwrap_or(0);
        emit_mint_batch(e, &token_id, count, total_amount, first_token_id);
        Ok(())
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
        common::ttl::extend_instance(e);
        require_token_live(e, &token_id)?;

        let merkle_root = get_merkle_config(e, &token_id)
            .ok_or(MinterError::MerkleRootNotSet)?
            .root;

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

    /// Sets the merkle root for a token, stores where its full tree is
    /// published, and starts a new claim round: earlier claimers may claim
    /// again under the new root. Only callable by the token's admin, and only
    /// once the token is live.
    ///
    /// `tree_uri` is the `ipfs://<cid>` of the full tree in the
    /// `builder-stellar-merkle-v1` format (docs/STORAGE_DIET.md § 4 Minter).
    /// The chain cannot check it against the root; consumers recompute the
    /// root from the file before offering a claim.
    pub fn set_merkle_root(
        e: &Env,
        token_id: Address,
        root: BytesN<32>,
        tree_uri: String,
    ) -> Result<(), MinterError> {
        common::ttl::extend_instance(e);
        // Roots set during setup would otherwise survive launch.
        require_token_live(e, &token_id)?;
        let admin = get_admin(e, &token_id)?;
        admin.require_auth();
        check_tree_uri(&tree_uri)?;

        set_merkle_config(
            e,
            &token_id,
            &MerkleConfig {
                root: root.clone(),
                tree_uri: tree_uri.clone(),
            },
        );
        let round = bump_merkle_round(e, &token_id);

        emit_merkle_root_set(e, &token_id, &root, round, &tree_uri);

        Ok(())
    }

    /// The token's current root, round and tree URI, and whether `recipient`
    /// already claimed in this round. Read-only.
    pub fn claim_status(e: &Env, token_id: Address, recipient: Address) -> ClaimStatus {
        let config = get_merkle_config(e, &token_id);
        let round = get_merkle_round(e, &token_id);
        ClaimStatus {
            claimed: config.is_some() && is_merkle_claimed(e, &token_id, round, &recipient),
            root: config.as_ref().map(|c| c.root.clone()),
            tree_uri: config.map(|c| c.tree_uri),
            round,
        }
    }

    // ========== Upgrades (common::upgrade, Manager admin) ==========

    /// Upgrade the shared Minter to a registry-approved WASM. The Manager
    /// admin authorizes it, as for every platform contract, but only
    /// `upgrade_delay()` ledgers after the approval was recorded: every DAO
    /// pins this Minter as a mint authority, so a hostile upgrade could mint
    /// against all of them, and the notice gives DAOs time to revoke that
    /// authority by proposal (contract review M1).
    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) -> Result<(), MinterError> {
        let manager = require_manager_admin(e)?;
        let approved = ManagerRegistryClient::new(e, &manager)
            .upgrade_approved_ledger(&from_hash, &to_hash)
            .ok_or(MinterError::UpgradeDelayNotElapsed)?;
        if !common::upgrade::notice_passed(e, approved) {
            return Err(MinterError::UpgradeDelayNotElapsed);
        }
        common::upgrade::apply(e, &manager, &from_hash, &to_hash);
        Ok(())
    }

    /// Advance the storage layout after an upgrade (Manager admin).
    pub fn migrate(e: &Env) -> Result<(), MinterError> {
        require_manager_admin(e)?;
        common::upgrade::migrate(e, STORAGE_VERSION);
        Ok(())
    }

    /// The registry version of the running code.
    pub fn version(e: &Env) -> String {
        common::upgrade::version(e, &get_manager(e))
    }

    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    /// Storage-layout version of the data held by this contract.
    pub fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }

    /// The Manager this Minter answers to.
    pub fn manager(e: &Env) -> Address {
        get_manager(e)
    }
}

// ========== Private helper functions ==========

/// The token's admin (its Treasury once live). Nothing is stored here.
/// A failing call means `token_id` is not a valid token contract.
fn get_admin(e: &Env, token_id: &Address) -> Result<Address, MinterError> {
    match NftClient::new(e, token_id).try_admin() {
        Ok(Ok(admin)) => Ok(admin),
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

/// Require the Manager admin's auth; returns the Manager.
fn require_manager_admin(e: &Env) -> Result<Address, MinterError> {
    common::ttl::extend_instance(e);
    let manager = get_manager(e);
    let admin = ManagerRegistryClient::new(e, &manager)
        .get_admin()
        .ok_or(MinterError::ManagerAdminNotSet)?;
    admin.require_auth();
    Ok(manager)
}

/// `tree_uri` must be an `ipfs://` URI with a non-empty path, at most
/// `common::MAX_STRING_LENGTH` bytes.
fn check_tree_uri(tree_uri: &String) -> Result<(), MinterError> {
    const PREFIX: &[u8; 7] = b"ipfs://";
    let len = tree_uri.len();
    if len <= PREFIX.len() as u32 || len > common::MAX_STRING_LENGTH {
        return Err(MinterError::InvalidTreeUri);
    }
    let mut head = [0u8; 7];
    tree_uri
        .to_bytes()
        .slice(0..PREFIX.len() as u32)
        .copy_into_slice(&mut head);
    if head != *PREFIX {
        return Err(MinterError::InvalidTreeUri);
    }
    Ok(())
}

/// Mint `amount` tokens to `recipient` with a single token call, so delegation
/// and voting checkpoints are handled once per claim rather than once per
/// token. Token errors propagate unchanged.
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

    NftClient::new(e, token_id).batch_mint(&minter, &recipients, &amounts);
    Ok(())
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
