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
//!
//! # Merkle hashing
//!
//! A leaf is `sha256(xdr(claimer) || amount)`, where `xdr(claimer)` is the
//! `ScVal::Address` XDR of the claimer and `amount` is the leaf amount as a
//! 16-byte big-endian u128. An internal node is `sha256(min(a, b) || max(a, b))`.
//! Leaves and nodes carry no tag, and nothing binds a root to a list, this
//! contract, or the network. They are told apart by length:
//!
//! - a node hashes 64 bytes;
//! - a leaf hashes 60 bytes for an account (`G…`) claimer and 56 bytes for a
//!   contract (`C…`) claimer;
//! - a muxed account (`M…`) would give a 64-byte leaf, but `claim` takes an
//!   `Address`, which the host never builds from a muxed address, so no claim
//!   can hash one.
//!
//! The contract always computes the leaf from the claimer and amount it is
//! given; no caller supplies a leaf hash. A proof is only accepted against a
//! root an admin opened a list with, and only for the claimer who authorizes
//! the claim. The shared test vectors in `test-vectors/merkle-v1.json` pin
//! this format for the web's tree builder (`apps/web/src/lib/minter/tree.ts`).
//!
//! # Funds this contract holds
//!
//! Only assurance payments made through `claim` are tracked, per list
//! (`ClaimList::escrow`) and per claimer (`ClaimRecord::escrowed`). `release`
//! sends a list's escrow to the Treasury wired at construction, and `refund`
//! sends a claimer's escrow back to that same claimer address; this code
//! sends escrow nowhere else. Assets transferred to this contract directly
//! are in no escrow, and no function moves them. An upgrade (the DAO's
//! `upgrade`, or the Manager's `recovery_upgrade` after a failed drive)
//! replaces this code and could change any of this.

use soroban_sdk::{
    contract, contractimpl, token::TokenClient, vec, xdr::ToXdr, Address, Bytes, BytesN, Env,
    IntoVal, String, Val, Vec,
};

use crate::errors::ClaimMinterError as Error;
use crate::events::*;
use crate::storage::*;
use common::clients::{ArtworkClient, NftClient};
use common::modules::RenewalPage;

/// The per-DAO ClaimMinter contract.
#[contract]
pub struct ClaimMinter;

#[contractimpl]
impl ClaimMinter {
    /// Wire the module to its DAO. Runs once, when the Manager deploys it.
    ///
    /// * `admin` - the launch admin in Setup; the Treasury once Live
    /// * `token` / `treasury` - the DAO's Token and Treasury (fixed)
    /// * `manager` - the Manager: registry, launcher and recovery caller
    /// * `payment_asset` - the asset Setup lists are priced in
    /// * `current_hash` - this implementation's WASM hash
    ///
    /// No function changes the Token, Treasury, Manager, or payment asset, so
    /// this code releases escrow only to this Treasury.
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

    /// Setup -> Live, in the launch transaction, after the Token is Live.
    ///
    /// Only the Manager may call it, and `treasury` must be the Treasury
    /// wired at construction (`TreasuryMismatch`). It hands the admin to the
    /// Treasury unless `handoff` already did, and releases the assurance
    /// escrow to the Treasury, so the fees arrive with the launch (eng review
    /// R4). `open` is ignored: lists have no pause. Fails if already Live.
    pub fn launch(e: &Env, treasury: Address, _open: bool) -> Result<(), Error> {
        let config = get_config(e);
        // Launch releases escrow and moves the admin: only the Manager's
        // launch, which has checked the drive and the DAO, may start it.
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

    /// Early handoff, in Setup: the admin moves to the Treasury and the
    /// module stays in Setup.
    ///
    /// Only the Manager may call it (`open_assurance` freezes the DAO this
    /// way), and `treasury` must be the wired Treasury. Afterwards no list can
    /// be opened or closed and no upgrade applied until launch, because the
    /// Treasury can't act before the DAO is Live.
    pub fn handoff(e: &Env, treasury: Address) -> Result<(), Error> {
        let config = get_config(e);
        // Moving the admin freezes the module: only the Manager may do it.
        config.manager.require_auth();
        common::lifecycle::require_setup(e);
        Self::hand_to(e, &config, &treasury)?;
        common::ttl::extend_instance(e);
        Ok(())
    }

    /// The asset Setup lists are priced in (`DaoModule::payment_asset`).
    /// Anyone may read it; it never changes.
    pub fn payment_asset(e: &Env) -> Address {
        get_config(e).payment_asset
    }

    /// One page of the persistent keys the DAO's storage sweep renews.
    ///
    /// Lists `List(cursor..)` up to `limit` ids below `next_list_id`, and the
    /// payment asset (whose balance entry holds the escrow). `Claim(list,
    /// claimer)` records belong to their claimers and are left out (holder
    /// class). Anyone may read it.
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

    /// The WASM hash this contract records for its code: set at construction
    /// and by each upgrade. It is self-reported; the contract's executable is
    /// the authority. Anyone may read it.
    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    // ========== Lists ==========

    /// Open a list and return its id. Only the admin may call it.
    ///
    /// - **Setup:** the list uses the configured payment asset and needs
    ///   artwork. A list with a price or assurance terms also needs the
    ///   Manager's authorization, so only `manager.open_assurance` opens one
    ///   and the Manager always records it; the launch admin alone opens only
    ///   free lists. At most one assurance list.
    /// - **Live:** the Treasury, by proposal, with any asset and price, and no
    ///   assurance terms.
    ///
    /// Assurance terms need a threshold from 1 to `total` and a deadline after
    /// now and no later than `expires_at` (`InvalidAssurance`).
    ///
    /// `tree_uri` is the `ipfs://<cid>` of the full tree in the
    /// `builder-stellar-merkle-v1` format. The chain cannot check it against
    /// the root; consumers recompute the root from the file before claiming.
    /// The list's terms never change after opening; only `close_list` moves
    /// its `expires_at` earlier.
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
        // A list mints the DAO's tokens: only its admin opens one (the
        // Treasury, by proposal, once Live).
        common::admin::require_admin(e);
        let config = get_config(e);
        let now = e.ledger().timestamp();
        if price < 0 {
            return Err(Error::InvalidPrice);
        }
        if total == 0 {
            return Err(Error::InvalidAmount);
        }
        // A list that is already over could never be claimed.
        if expires_at <= now {
            return Err(Error::InvalidExpiry);
        }
        check_tree_uri(&tree_uri)?;
        if let Some(terms) = &assurance {
            // A zero threshold would read as "no assurance" (`ClaimList::assurance`).
            // Each distinct claimer mints at least one token, so a threshold
            // above `total` could never be met and the drive could only fail.
            // The deadline must fall while claims are still open.
            if terms.threshold_claimers == 0
                || terms.threshold_claimers > total
                || terms.deadline <= now
                || terms.deadline > expires_at
            {
                return Err(Error::InvalidAssurance);
            }
        }
        if common::lifecycle::is_live(e) {
            // Escrow exists for a launch that hasn't happened yet; after
            // launch, payments go straight to the Treasury.
            if assurance.is_some() {
                return Err(Error::AssuranceNotAllowed);
            }
        } else {
            // A priced list in Setup takes money for a DAO that may never
            // launch, so it must be the assurance drive, whose escrow is
            // refunded if the launch fails. Only `manager.open_assurance`
            // opens it: it records the drive, reserves the slug, and freezes
            // the DAO.
            if price > 0 || assurance.is_some() {
                config.manager.require_auth();
            }
            // Escrow and refunds are tracked in the asset fixed at creation.
            if asset != config.payment_asset {
                return Err(Error::PaymentAssetMismatch);
            }
            // Tokens minted before the artwork exists would have no traits.
            let metadata = NftClient::new(e, &config.token).metadata();
            let has_artwork = metadata
                .map(|m| ArtworkClient::new(e, &m).properties_count() > 0)
                .unwrap_or(false);
            if !has_artwork {
                return Err(Error::ArtworkMissing);
            }
            // `launch` releases one list's escrow; a second drive would have
            // escrow nothing releases.
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

    /// Close a list early (the admin): claims stop at once.
    ///
    /// A list stays claimable until its `expires_at`, including after launch,
    /// so a free list the launch admin opened in Setup can still mint once
    /// the DAO is Live (up to this module's allowance). This is how the DAO,
    /// by proposal, ends such a list. The assurance list can't be closed
    /// before launch, since its refunds and release depend on it
    /// (`AssuranceNotAllowed`); a list already past its expiry fails with
    /// `ListExpired`. The list keeps its record; only `expires_at` moves to
    /// now.
    pub fn close_list(e: &Env, list_id: u32) -> Result<(), Error> {
        common::ttl::extend_instance(e);
        // Ending a list cuts off its claimers: only the admin may, the
        // Treasury by proposal once Live.
        common::admin::require_admin(e);
        let mut list = get_list(e, list_id).ok_or(Error::ListNotFound)?;
        let now = e.ledger().timestamp();
        if now >= list.expires_at {
            return Err(Error::ListExpired);
        }
        // A drive's terms stay fixed until launch: closing it early would stop
        // it short of its threshold after people paid in.
        if assurance_list(e) == Some(list_id) && !common::lifecycle::is_live(e) {
            return Err(Error::AssuranceNotAllowed);
        }
        list.expires_at = now;
        set_list(e, list_id, &list);
        ListClosed {
            list_id,
            minted: list.minted,
            total: list.total,
        }
        .publish(e);
        Ok(())
    }

    /// Claim `mint_now` tokens of the leaf `(claimer, leaf_amount)`. Returns
    /// the minted token ids.
    ///
    /// Only `claimer` may call it: they authorize, pay, and receive. The proof
    /// covers the full leaf; a claimer may claim it in parts, at most
    /// `common::MAX_BATCH_MINT` tokens per call, and never more than the leaf
    /// or the list's `total` in all. Each claim pays `price × mint_now` in the
    /// list's asset: into escrow on the assurance list before launch,
    /// otherwise to the Treasury. `max_price` bounds the unit price the
    /// claimer accepts. Claims stop at `expires_at` and when a drive fails.
    ///
    /// The leaf is `sha256(claimer_xdr || leaf_amount_be_u128)`; internal
    /// nodes are `sha256(min(a, b) || max(a, b))`, so proofs carry no
    /// direction bits (see the module docs on hashing).
    pub fn claim(
        e: &Env,
        list_id: u32,
        claimer: Address,
        leaf_amount: u128,
        mint_now: u32,
        proof: Vec<BytesN<32>>,
        max_price: i128,
    ) -> Result<Vec<u32>, Error> {
        // The claimer pays and receives; nobody else may spend their leaf.
        claimer.require_auth();
        common::ttl::extend_instance(e);
        let config = get_config(e);
        let mut list = get_list(e, list_id).ok_or(Error::ListNotFound)?;
        // A list's expiry, or `close_list`, ends its claims for good.
        if e.ledger().timestamp() >= list.expires_at {
            return Err(Error::ListExpired);
        }
        let live = NftClient::new(e, &config.token).is_live();
        if let Some(terms) = list.assurance() {
            // A failed drive only refunds: new payments would go into an
            // escrow that can never be released.
            if failed(e, &terms, live) {
                return Err(Error::AssuranceFailed);
            }
        }
        // The claimer's own bound on what one token costs them.
        if list.price > max_price {
            return Err(Error::PriceAboveMax);
        }
        // A zero claim would count a distinct claimer towards an assurance
        // threshold without minting or paying.
        if mint_now == 0 || leaf_amount == 0 {
            return Err(Error::InvalidAmount);
        }
        // One claim is one `batch_mint`, which must fit the event budget.
        if mint_now > common::MAX_BATCH_MINT {
            return Err(Error::BatchTooLarge);
        }
        verify_merkle_proof(e, &claimer, leaf_amount, &proof, &list.root)?;

        let mut record = get_claim(e, list_id, &claimer);
        // Parts of a leaf may never add up to more than the leaf.
        if u128::from(record.claimed) + u128::from(mint_now) > leaf_amount {
            return Err(Error::AlreadyClaimed);
        }
        // The list's `total` caps all claimers together, whatever the tree holds.
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

    /// The assurance list's state: `Failed` once its deadline has passed
    /// while the DAO is not Live, otherwise `Met` once enough distinct
    /// addresses have claimed, otherwise `Open`. `NotAssurance` for any other
    /// list. Anyone may read it; it is computed, never stored.
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

    /// Move a list's escrow to the Treasury wired at construction. Returns
    /// the amount moved (0 when nothing is held).
    ///
    /// Anyone may call it once the DAO is Live; `launch` calls it for the
    /// assurance list. The destination is fixed, so a caller chooses only
    /// when it runs. It moves only what `claim` recorded as escrow, never
    /// other balances this contract holds.
    pub fn release(e: &Env, list_id: u32) -> Result<i128, Error> {
        common::ttl::extend_instance(e);
        let config = get_config(e);
        // Before launch the escrow must stay refundable.
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

    /// Return a claimer's escrow from a `Failed` list. Returns the amount.
    ///
    /// Anyone may call it; this code sends the funds only to `claimer`, the
    /// address that paid, and to nowhere else. If that address
    /// can't receive the asset (for example, its issuer deauthorized it, or an
    /// account removed its trustline), the call fails and the escrow stays
    /// here until a later call succeeds. The claimer keeps the tokens, which
    /// carry no power because the DAO never goes Live.
    pub fn refund(e: &Env, list_id: u32, claimer: Address) -> Result<i128, Error> {
        common::ttl::extend_instance(e);
        let mut list = get_list(e, list_id).ok_or(Error::ListNotFound)?;
        let terms = list.assurance().ok_or(Error::NotAssurance)?;
        let live = NftClient::new(e, &get_config(e).token).is_live();
        // Refunds and `release` exclude each other: escrow leaves either to
        // the Treasury at launch or back to the claimers, never both.
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

    /// A list's record, or `None` for an unknown id. Anyone may read it.
    pub fn get_list(e: &Env, list_id: u32) -> Option<ClaimList> {
        get_list(e, list_id)
    }

    /// A claimer's progress on a list (zero before their first claim).
    /// Anyone may read it.
    pub fn get_claim(e: &Env, list_id: u32, claimer: Address) -> ClaimRecord {
        get_claim(e, list_id, &claimer)
    }

    /// The id the next list receives (the number of lists so far). Anyone
    /// may read it. A list opened by a proposal gets the id current when the
    /// proposal executes, which may differ from the one read when drafting.
    pub fn next_list_id(e: &Env) -> u32 {
        next_list_id(e)
    }

    /// The assurance list, if one was opened. Anyone may read it.
    pub fn assurance_list(e: &Env) -> Option<u32> {
        assurance_list(e)
    }

    /// The wiring fixed at construction. Anyone may read it.
    pub fn get_config(e: &Env) -> ClaimsConfig {
        get_config(e)
    }

    /// Module admin: the launch admin in Setup, the Treasury once handed over.
    /// Anyone may read it.
    pub fn admin(e: &Env) -> Address {
        common::admin::admin(e)
    }

    // ========== Upgrades (common::upgrade, DAO admin) ==========

    /// Upgrade to a Manager-approved WASM.
    ///
    /// Only the admin may call it: the launch admin in Setup, the Treasury by
    /// proposal once handed over. The Manager's registry must approve the
    /// pair `from_hash -> to_hash`, and `from_hash` must be the running code.
    /// Lists, records, and escrow are kept.
    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        // New code can move escrow and mint: only the DAO's own admin may
        // install it, and only a hash the registry approved.
        common::admin::require_admin(e);
        common::upgrade::apply(e, &get_config(e).manager, &from_hash, &to_hash);
    }

    /// Manager-only upgrade of a frozen ClaimMinter, for a failed drive whose
    /// refunds are broken (`manager.recover_claims`, review B2). It checks only
    /// the Manager's authorization and that the module is still in Setup, not
    /// this contract's own state machine, which may be the broken code; the
    /// Manager decides that the drive failed. The Manager has already checked
    /// the registry approval for this hash and passes `version`, because asking
    /// it back from here would be contract re-entry.
    pub fn recovery_upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>, version: String) {
        // The Manager checks the drive failed and the hash is approved; a
        // Live module upgrades only by the DAO's own proposal.
        get_config(e).manager.require_auth();
        common::lifecycle::require_setup(e);
        common::upgrade::apply_checked_by_manager(e, &from_hash, &to_hash, version);
    }

    /// Advance the storage layout after an upgrade. Only the admin may call
    /// it; it fails with `NothingToMigrate` when the layout is current.
    pub fn migrate(e: &Env) {
        // Rewriting stored data is the admin's, like the upgrade before it.
        common::admin::require_admin(e);
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    /// The registry version of the running code. Anyone may read it.
    pub fn version(e: &Env) -> String {
        common::upgrade::version(e, &get_config(e).manager)
    }

    /// Storage-layout version of the data held by this contract. Anyone may
    /// read it.
    pub fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }
}

impl ClaimMinter {
    /// Hand the admin to the Treasury, once.
    fn hand_to(e: &Env, config: &ClaimsConfig, treasury: &Address) -> Result<(), Error> {
        // The admin may only ever move to the DAO's own Treasury, whatever
        // the caller passes.
        if *treasury != config.treasury {
            return Err(Error::TreasuryMismatch);
        }
        common::admin::handoff_once(e, treasury);
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

/// The leaf of `(claimer, amount)`: `sha256(xdr(claimer) || amount_be_u128)`.
///
/// `xdr(claimer)` is the `ScVal::Address` XDR: 44 bytes for an account and
/// 40 for a contract, so a leaf hashes 60 or 56 bytes, never the 64 bytes of
/// a node (see the module docs on hashing).
pub(crate) fn leaf_hash(e: &Env, claimer: &Address, amount: u128) -> BytesN<32> {
    let mut leaf = Bytes::new(e);
    leaf.append(&claimer.clone().to_xdr(e));
    leaf.extend_from_array(&amount.to_be_bytes());
    e.crypto().sha256(&leaf).into()
}

/// An internal node: `sha256(min(a, b) || max(a, b))`, so proofs carry no
/// direction bits.
pub(crate) fn node_hash(e: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let (low, high) = if a.to_array() <= b.to_array() {
        (a, b)
    } else {
        (b, a)
    };
    let mut pair = Bytes::new(e);
    pair.extend_from_array(&low.to_array());
    pair.extend_from_array(&high.to_array());
    e.crypto().sha256(&pair).into()
}

/// Verify a merkle proof of the leaf `(claimer, amount)` against `root`.
fn verify_merkle_proof(
    e: &Env,
    claimer: &Address,
    amount: u128,
    proof: &Vec<BytesN<32>>,
    root: &BytesN<32>,
) -> Result<(), Error> {
    // Bounds the hashing work per claim; 32 levels cover 2^32 leaves.
    if proof.len() > MAX_PROOF_LEN {
        return Err(Error::MerkleProofInvalid);
    }
    let mut node = leaf_hash(e, claimer, amount);
    for sibling in proof.iter() {
        node = node_hash(e, &node, &sibling);
    }
    if node == *root {
        Ok(())
    } else {
        Err(Error::MerkleProofInvalid)
    }
}
