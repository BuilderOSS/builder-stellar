//! The ClaimMinter module (docs/designs/membership-models.md §3).
//!
//! Each list is a merkle root of `(claimer, amount)` leaves. Claimers mint
//! their own tokens, in parts if they like, paying `price` per token. An
//! assurance list is the one list opened before launch with a price: its
//! payments stay in escrow here until the DAO launches.
//!
//! ```text
//! Assurance state (per assurance list)
//!   Open ──(distinct claimers ≥ threshold)──► Met ──(launch before deadline)──► Live
//!    │                                         │                                 └─► escrow released
//!    └──(deadline passed, DAO not Live)──► Failed ◄┘   (in the launch transaction)
//!                                            └─► refund(list, claimer); claims refused
//! ```
//!
//! `Failed` is computed from the deadline and the Token's `is_live()`, never
//! stored, so `release` (needs Live) and `refund` (needs Failed) exclude each
//! other. The Manager applies the same rule from its own copy of the
//! deadline and never asks this contract whether a drive failed.

use soroban_sdk::{
    contract, contractimpl, token::TokenClient, vec, xdr::ToXdr, Address, Bytes, BytesN, Env,
    IntoVal, String, Val, Vec,
};

use crate::errors::ClaimMinterError as Error;
use crate::events::*;
use crate::storage::*;
use common::clients::{ArtworkClient, NftClient};
use common::modules::RenewalPage;

#[contract]
pub struct ClaimMinter;

#[contractimpl]
impl ClaimMinter {
    /// * `admin` - the launch admin in Setup; the Treasury once Live
    /// * `token` / `treasury` - the DAO's Token and Treasury (fixed)
    /// * `manager` - the Manager: registry, launcher and recovery caller
    /// * `payment_asset` - the asset Setup lists are priced in
    /// * `current_hash` - this implementation's WASM hash
    pub fn __constructor(
        e: &Env,
        admin: Address,
        token: Address,
        treasury: Address,
        manager: Address,
        payment_asset: Address,
        current_hash: BytesN<32>,
    ) {
        set_config(
            e,
            &ClaimsConfig {
                token,
                treasury,
                manager,
                payment_asset,
            },
        );
        common::admin::init(e, &admin);
        common::upgrade::init(e, &current_hash, STORAGE_VERSION);
    }

    // ========== DaoModule (Manager-only launch and handoff) ==========

    /// Setup -> Live, called by the Manager in the launch transaction, after
    /// the Token is Live. Hands the admin to the Treasury unless `handoff`
    /// already did, and releases the assurance escrow to the Treasury, so the
    /// fees arrive with the launch (eng review R4). `open` is ignored: lists
    /// have no pause.
    pub fn launch(e: &Env, treasury: Address, _open: bool) -> Result<(), Error> {
        let config = get_config(e);
        config.manager.require_auth();
        common::lifecycle::mark_live(e);
        Self::hand_to(e, &config, &treasury)?;
        if let Some(list_id) = assurance_list(e) {
            Self::release(e, list_id)?;
        }
        common::ttl::extend_instance(e);
        ClaimMinterLaunched { treasury }.publish(e);
        Ok(())
    }

    /// Manager-only early handoff: the admin moves to the Treasury and the
    /// module stays in Setup, so no list can be opened and no upgrade applied
    /// until launch (`open_assurance` freezes the DAO this way).
    pub fn handoff(e: &Env, treasury: Address) -> Result<(), Error> {
        let config = get_config(e);
        config.manager.require_auth();
        common::lifecycle::require_setup(e);
        Self::hand_to(e, &config, &treasury)?;
        common::ttl::extend_instance(e);
        Ok(())
    }

    /// The asset Setup lists are priced in (`DaoModule::payment_asset`).
    pub fn payment_asset(e: &Env) -> Address {
        get_config(e).payment_asset
    }

    /// `List(0..next_list_id)` from the instance counter, and the payment
    /// asset (the escrow balance). `Claim(list, claimer)` records belong to
    /// their claimers and are left out (holder class).
    pub fn renewal_keys(e: &Env, cursor: u32, limit: u32) -> RenewalPage {
        let (end, next_cursor) = common::modules::renewal_window(cursor, limit, next_list_id(e));
        let mut keys: Vec<(Val, bool)> = Vec::new(e);
        for list_id in cursor..end {
            keys.push_back((common::ns(e, ClaimsKey::List(list_id)).into_val(e), true));
        }
        RenewalPage {
            keys,
            assets: vec![e, get_config(e).payment_asset],
            next_cursor,
        }
    }

    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    // ========== Lists ==========

    /// Open a list (the admin). Returns its id.
    ///
    /// - **Setup:** the list uses the configured payment asset and needs
    ///   artwork. A list with a price or assurance terms also needs the
    ///   Manager's authorization, so only `manager.open_assurance` opens one
    ///   and the Manager always records it; the launch admin alone opens only
    ///   free lists. At most one assurance list.
    /// - **Live:** the Treasury, by proposal, with any asset and price, and no
    ///   assurance terms.
    ///
    /// `tree_uri` is the `ipfs://<cid>` of the full tree in the
    /// `builder-stellar-merkle-v1` format. The chain cannot check it against
    /// the root; consumers recompute the root from the file before claiming.
    #[allow(clippy::too_many_arguments)]
    pub fn open_list(
        e: &Env,
        root: BytesN<32>,
        tree_uri: String,
        asset: Address,
        price: i128,
        expires_at: u64,
        total: u32,
        assurance: Option<AssuranceTerms>,
    ) -> Result<u32, Error> {
        common::ttl::extend_instance(e);
        common::admin::require_admin(e);
        let config = get_config(e);
        let now = e.ledger().timestamp();
        if price < 0 {
            return Err(Error::InvalidPrice);
        }
        if total == 0 {
            return Err(Error::InvalidAmount);
        }
        if expires_at <= now {
            return Err(Error::InvalidExpiry);
        }
        check_tree_uri(&tree_uri)?;
        if let Some(terms) = &assurance {
            if terms.threshold_claimers == 0 || terms.deadline <= now || terms.deadline > expires_at
            {
                return Err(Error::InvalidAssurance);
            }
        }
        if common::lifecycle::is_live(e) {
            if assurance.is_some() {
                return Err(Error::AssuranceNotAllowed);
            }
        } else {
            if price > 0 || assurance.is_some() {
                config.manager.require_auth();
            }
            if asset != config.payment_asset {
                return Err(Error::PaymentAssetMismatch);
            }
            let metadata = NftClient::new(e, &config.token).metadata();
            let has_artwork = metadata
                .map(|m| ArtworkClient::new(e, &m).properties_count() > 0)
                .unwrap_or(false);
            if !has_artwork {
                return Err(Error::ArtworkMissing);
            }
            if assurance.is_some() && assurance_list(e).is_some() {
                return Err(Error::AssuranceExists);
            }
        }

        let list_id = take_list_id(e);
        if assurance.is_some() {
            set_assurance_list(e, list_id);
        }
        let list = ClaimList {
            root,
            tree_uri,
            asset,
            price,
            expires_at,
            total,
            minted: 0,
            claimers: 0,
            threshold_claimers: assurance.as_ref().map_or(0, |t| t.threshold_claimers),
            deadline: assurance.as_ref().map_or(0, |t| t.deadline),
            escrow: 0,
        };
        set_list(e, list_id, &list);
        ListOpened {
            list_id,
            root: list.root,
            tree_uri: list.tree_uri,
            asset: list.asset,
            price: list.price,
            expires_at: list.expires_at,
            total: list.total,
            assurance,
        }
        .publish(e);
        Ok(list_id)
    }

    /// Claim `mint_now` tokens of the leaf `(claimer, leaf_amount)`.
    ///
    /// The proof covers the full leaf; a claimer may claim it in parts,
    /// at most `common::MAX_BATCH_MINT` tokens per call. Each claim pays
    /// `price × mint_now` in the list's asset: into escrow on the assurance
    /// list before launch, otherwise to the Treasury. `max_price` bounds the
    /// unit price the claimer accepts. Returns the minted token ids.
    ///
    /// The leaf is `sha256(claimer_xdr || leaf_amount_be_u128)`; internal
    /// nodes are `sha256(min(a, b) || max(a, b))`, so proofs carry no
    /// direction bits.
    pub fn claim(
        e: &Env,
        list_id: u32,
        claimer: Address,
        leaf_amount: u128,
        mint_now: u32,
        proof: Vec<BytesN<32>>,
        max_price: i128,
    ) -> Result<Vec<u32>, Error> {
        claimer.require_auth();
        common::ttl::extend_instance(e);
        let config = get_config(e);
        let mut list = get_list(e, list_id).ok_or(Error::ListNotFound)?;
        if e.ledger().timestamp() >= list.expires_at {
            return Err(Error::ListExpired);
        }
        let live = NftClient::new(e, &config.token).is_live();
        if let Some(terms) = list.assurance() {
            if failed(e, &terms, live) {
                return Err(Error::AssuranceFailed);
            }
        }
        if list.price > max_price {
            return Err(Error::PriceAboveMax);
        }
        if mint_now == 0 || leaf_amount == 0 {
            return Err(Error::InvalidAmount);
        }
        if mint_now > common::MAX_BATCH_MINT {
            return Err(Error::BatchTooLarge);
        }
        verify_merkle_proof(e, &claimer, leaf_amount, &proof, &list.root)?;

        let mut record = get_claim(e, list_id, &claimer);
        if u128::from(record.claimed) + u128::from(mint_now) > leaf_amount {
            return Err(Error::AlreadyClaimed);
        }
        if list.minted.saturating_add(mint_now) > list.total {
            return Err(Error::ListSoldOut);
        }

        let cost = list
            .price
            .checked_mul(i128::from(mint_now))
            .ok_or(Error::InvalidInput)?;
        let escrowed = list.threshold_claimers > 0 && !live;
        if cost > 0 {
            let to = if escrowed {
                e.current_contract_address()
            } else {
                config.treasury.clone()
            };
            TokenClient::new(e, &list.asset).transfer(&claimer, &to, &cost);
            if escrowed {
                record.escrowed += cost;
                list.escrow += cost;
            }
        }
        if record.claimed == 0 {
            list.claimers += 1;
        }
        record.claimed += mint_now;
        list.minted += mint_now;
        set_claim(e, list_id, &claimer, &record);
        set_list(e, list_id, &list);

        // One token call: delegation and vote checkpoints are touched once.
        // The Token checks this module's allowance; its errors propagate.
        let ids = NftClient::new(e, &config.token).batch_mint(
            &e.current_contract_address(),
            &vec![e, claimer.clone()],
            &vec![e, u128::from(mint_now)],
        );
        Claimed {
            list_id,
            claimer,
            amount: mint_now,
            first_token_id: ids.first().unwrap_or(0),
            paid: cost,
            escrowed,
            claimed: record.claimed,
        }
        .publish(e);
        Ok(ids)
    }

    /// The assurance list's state (`NotAssurance` for any other list).
    pub fn assurance_state(e: &Env, list_id: u32) -> Result<AssuranceState, Error> {
        let list = get_list(e, list_id).ok_or(Error::ListNotFound)?;
        let terms = list.assurance().ok_or(Error::NotAssurance)?;
        let live = NftClient::new(e, &get_config(e).token).is_live();
        Ok(if failed(e, &terms, live) {
            AssuranceState::Failed
        } else if list.claimers >= terms.threshold_claimers {
            AssuranceState::Met
        } else {
            AssuranceState::Open
        })
    }

    /// Move a list's escrow to the Treasury wired at construction. Anyone may
    /// call it once the DAO is Live; `launch` calls it for the assurance list.
    /// Returns the amount moved (0 when nothing is held).
    pub fn release(e: &Env, list_id: u32) -> Result<i128, Error> {
        common::ttl::extend_instance(e);
        let config = get_config(e);
        if !NftClient::new(e, &config.token).is_live() {
            return Err(Error::TokenNotLive);
        }
        let mut list = get_list(e, list_id).ok_or(Error::ListNotFound)?;
        let amount = list.escrow;
        if amount == 0 {
            return Ok(0);
        }
        list.escrow = 0;
        set_list(e, list_id, &list);
        TokenClient::new(e, &list.asset).transfer(
            &e.current_contract_address(),
            &config.treasury,
            &amount,
        );
        EscrowReleased {
            list_id,
            treasury: config.treasury,
            amount,
        }
        .publish(e);
        Ok(amount)
    }

    /// Return a claimer's escrow from a `Failed` list. Anyone may call it;
    /// the funds go only to the claimer. The claimer keeps the tokens, which
    /// carry no power because the DAO never goes Live.
    pub fn refund(e: &Env, list_id: u32, claimer: Address) -> Result<i128, Error> {
        common::ttl::extend_instance(e);
        let mut list = get_list(e, list_id).ok_or(Error::ListNotFound)?;
        let terms = list.assurance().ok_or(Error::NotAssurance)?;
        let live = NftClient::new(e, &get_config(e).token).is_live();
        if !failed(e, &terms, live) {
            return Err(Error::NotFailed);
        }
        let mut record = get_claim(e, list_id, &claimer);
        let amount = record.escrowed;
        if amount == 0 {
            return Err(Error::NothingToRefund);
        }
        record.escrowed = 0;
        list.escrow -= amount;
        set_claim(e, list_id, &claimer, &record);
        set_list(e, list_id, &list);
        TokenClient::new(e, &list.asset).transfer(&e.current_contract_address(), &claimer, &amount);
        Refunded {
            list_id,
            claimer,
            amount,
        }
        .publish(e);
        Ok(amount)
    }

    // ========== Reads ==========

    pub fn get_list(e: &Env, list_id: u32) -> Option<ClaimList> {
        get_list(e, list_id)
    }

    /// A claimer's progress on a list (zero before their first claim).
    pub fn get_claim(e: &Env, list_id: u32, claimer: Address) -> ClaimRecord {
        get_claim(e, list_id, &claimer)
    }

    /// The id the next list receives (the number of lists so far).
    pub fn next_list_id(e: &Env) -> u32 {
        next_list_id(e)
    }

    /// The assurance list, if one was opened.
    pub fn assurance_list(e: &Env) -> Option<u32> {
        assurance_list(e)
    }

    pub fn get_config(e: &Env) -> ClaimsConfig {
        get_config(e)
    }

    /// Module admin: the launch admin in Setup, the Treasury once handed over.
    pub fn admin(e: &Env) -> Address {
        common::admin::admin(e)
    }

    // ========== Upgrades (common::upgrade, DAO admin) ==========

    /// Upgrade to a Manager-approved WASM (the admin: the launch admin in
    /// Setup, the Treasury by proposal once handed over).
    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        common::admin::require_admin(e);
        common::upgrade::apply(e, &get_config(e).manager, &from_hash, &to_hash);
    }

    /// Manager-only upgrade of a frozen ClaimMinter, for a failed drive whose
    /// refunds are broken (`manager.recover_claims`, review B2). It checks only
    /// the Manager's authorization and that the module is still in Setup, not
    /// this contract's own state machine, which may be the broken code; the
    /// Manager decides that the drive failed. The target must be approved for
    /// this hash in the registry, as for every upgrade.
    pub fn recovery_upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        let manager = get_config(e).manager;
        manager.require_auth();
        common::lifecycle::require_setup(e);
        common::upgrade::apply(e, &manager, &from_hash, &to_hash);
    }

    /// Advance the storage layout after an upgrade (admin only).
    pub fn migrate(e: &Env) {
        common::admin::require_admin(e);
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    /// The registry version of the running code.
    pub fn version(e: &Env) -> String {
        common::upgrade::version(e, &get_config(e).manager)
    }

    /// Storage-layout version of the data held by this contract.
    pub fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }
}

impl ClaimMinter {
    fn hand_to(e: &Env, config: &ClaimsConfig, treasury: &Address) -> Result<(), Error> {
        if *treasury != config.treasury {
            return Err(Error::TreasuryMismatch);
        }
        if common::admin::admin(e) != *treasury {
            common::admin::handoff(e, treasury);
        }
        Ok(())
    }
}

/// `Failed`: the deadline passed and the DAO is not Live (eng review R1).
fn failed(e: &Env, terms: &AssuranceTerms, live: bool) -> bool {
    e.ledger().timestamp() > terms.deadline && !live
}

/// `tree_uri` must be an `ipfs://` URI with a non-empty path, at most
/// `common::MAX_STRING_LENGTH` bytes.
fn check_tree_uri(tree_uri: &String) -> Result<(), Error> {
    const PREFIX: &[u8; 7] = b"ipfs://";
    let len = tree_uri.len();
    if len <= PREFIX.len() as u32 || len > common::MAX_STRING_LENGTH {
        return Err(Error::InvalidTreeUri);
    }
    let mut head = [0u8; 7];
    tree_uri
        .to_bytes()
        .slice(0..PREFIX.len() as u32)
        .copy_into_slice(&mut head);
    if head != *PREFIX {
        return Err(Error::InvalidTreeUri);
    }
    Ok(())
}

/// Verify a merkle proof of the leaf `(claimer, amount)` against `root`.
fn verify_merkle_proof(
    e: &Env,
    claimer: &Address,
    amount: u128,
    proof: &Vec<BytesN<32>>,
    root: &BytesN<32>,
) -> Result<(), Error> {
    if proof.len() > MAX_PROOF_LEN {
        return Err(Error::MerkleProofInvalid);
    }

    let mut leaf = Bytes::new(e);
    leaf.append(&claimer.clone().to_xdr(e));
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

    if node == *root {
        Ok(())
    } else {
        Err(Error::MerkleProofInvalid)
    }
}
