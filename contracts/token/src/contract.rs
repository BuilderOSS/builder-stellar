#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use soroban_sdk::{contract, contractimpl, panic_with_error, Address, BytesN, Env, String, Vec};
use stellar_governance::votes::{
    emit_delegate_changed as emit_library_delegate_changed, get_delegate, num_checkpoints,
    transfer_voting_units, Votes, VotesStorageKey,
};
use stellar_tokens::non_fungible::{
    emit_mint, sequential::increment_token_id, Base, NFTStorageKey,
};

use common::clients::MetadataHookClient;

use crate::error::TokenError;
use crate::events::{
    emit_launched, emit_metadata_updated, emit_mint_authority_changed, emit_token_batch_mint,
    emit_token_initialized, emit_token_mint,
};
use crate::storage::*;

/// DAO governance token: a sequential-id NFT where each token is one vote.
///
/// # Voting supply
///
/// Tokens held by the DAO's own Treasury, Auction and Marketplace carry no
/// voting power. Moving a token into one of them burns its voting unit
/// (OpenZeppelin `transfer_voting_units(Some(from), None, 1)`) and moving it
/// out mints the unit again. The votes `TotalSupply` checkpoint therefore
/// counts only tokens that can actually vote, which is what the Governor's
/// quorum and proposal-threshold checks read. Unsold auction tokens piling up
/// in the Treasury can never make quorum unreachable. The three addresses are
/// fixed at construction, so balances and voting units can never drift apart.
#[contract]
pub struct DaoTokenContract;

#[contractimpl]
impl DaoTokenContract {
    /// Initializes the token.
    ///
    /// * `admin` - setup-phase admin (the launch admin); becomes the Treasury at launch
    /// * `treasury` - DAO Treasury; `launch` must be called with exactly this address
    /// * `auction` - DAO Auction (holds the token being auctioned)
    /// * `marketplace` - DAO Marketplace (escrows listed tokens)
    /// * `uri`, `name`, `symbol` - collection metadata
    /// * `metadata` - metadata contract called on every mint to seed artwork
    /// * `manager` - Manager contract (upgrade approvals, launch)
    /// * `current_hash`, `version` - this implementation's WASM hash and release
    pub fn __constructor(
        e: &Env,
        admin: Address,
        treasury: Address,
        auction: Address,
        marketplace: Address,
        uri: String,
        name: String,
        symbol: String,
        metadata: Address,
        manager: Address,
        current_hash: BytesN<32>,
        version: String,
    ) {
        Base::set_metadata(e, uri.clone(), name.clone(), symbol.clone());
        common::admin::init(e, &admin);
        let instance = e.storage().instance();
        instance.set(&TokenKey::Metadata, &metadata);
        instance.set(&TokenKey::Manager, &manager);
        instance.set(&TokenKey::Treasury, &treasury);
        instance.set(&TokenKey::Auction, &auction);
        instance.set(&TokenKey::Marketplace, &marketplace);
        common::upgrade::init(e, &current_hash, &version, STORAGE_VERSION);
        emit_token_initialized(e, &admin, &uri, &name, &symbol, &version);
    }

    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        common::admin::require_admin(e);
        common::upgrade::apply(e, &Self::manager(e), &from_hash, &to_hash);
    }

    /// Advance the storage layout after an upgrade (admin only).
    pub fn migrate(e: &Env) {
        common::admin::require_admin(e);
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    /// Re-reads the version for the active WASM hash from the Manager registry.
    pub fn sync_version(e: &Env) {
        common::admin::require_admin(e);
        common::upgrade::sync_version(e, &Self::manager(e));
    }

    /// Returns the release version registered for the active token WASM.
    pub fn version(e: &Env) -> String {
        common::upgrade::version(e)
    }

    /// Returns the active token WASM hash.
    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    /// Storage-layout version of the data held by this contract.
    pub fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }

    /// Module admin: the launch admin during setup, the Treasury once live.
    pub fn admin(e: &Env) -> Address {
        common::admin::admin(e)
    }

    /// Updates collection metadata (admin only). Emits `MetadataUpdated`.
    pub fn set_metadata(e: &Env, uri: String, name: String, symbol: String) {
        common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Base::set_metadata(e, uri.clone(), name.clone(), symbol.clone());
        emit_metadata_updated(e, &uri, &name, &symbol);
    }

    /// Grants or revokes minting authority (admin only, live token only; the
    /// launch writes the initial set). Emits `MintAuthorityChanged`.
    pub fn set_mint_authority(e: &Env, authority: Address, enabled: bool) {
        let changed_by = common::admin::require_admin(e);
        common::lifecycle::require_live(e);
        common::ttl::extend_instance(e);
        let old_enabled = Self::mint_authority(e, authority.clone());
        Self::write_mint_authority(e, &authority, enabled);
        emit_mint_authority_changed(e, &authority, old_enabled, enabled, &changed_by);
    }

    /// Whether `authority` holds explicit minting authority. The admin always
    /// has implicit authority without an entry.
    pub fn mint_authority(e: &Env, authority: Address) -> bool {
        let key = TokenKey::MintAuthority(authority);
        let enabled: Option<bool> = e.storage().persistent().get(&key);
        if enabled.is_some() {
            common::ttl::extend_persistent(e, &key);
        }
        enabled.unwrap_or(false)
    }

    /// One-shot, Manager-only launch handoff (Setup -> Live).
    ///
    /// Hands the admin to `treasury`, grants mint authority to exactly
    /// `minters` (which must contain the treasury), marks the token live and
    /// emits `TokenLaunched`. A second call panics with `AlreadyLive`, so after
    /// launch the Manager has no authority over the token.
    pub fn launch(e: &Env, treasury: Address, minters: Vec<Address>) {
        let manager = Self::manager(e);
        manager.require_auth();
        common::lifecycle::mark_live(e);
        if treasury != Self::treasury(e) {
            panic_with_error!(e, TokenError::TreasuryMismatch);
        }
        if !minters.contains(&treasury) {
            panic_with_error!(e, TokenError::TreasuryNotMinter);
        }
        common::admin::handoff(e, &treasury);
        for minter in minters.iter() {
            let old_enabled = Self::mint_authority(e, minter.clone());
            Self::write_mint_authority(e, &minter, true);
            emit_mint_authority_changed(e, &minter, old_enabled, true, &manager);
        }
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury, &minters);
    }

    /// Whether the token has been launched (Setup -> Live).
    pub fn is_live(e: &Env) -> bool {
        common::lifecycle::is_live(e)
    }

    /// Returns the metadata contract used for mint hooks.
    pub fn metadata(e: &Env) -> Option<Address> {
        e.storage().instance().get(&TokenKey::Metadata)
    }

    /// Voting-capable supply: every minted token except those held by the
    /// Treasury, Auction and Marketplace. The Manager requires it to be
    /// positive at launch, so a DAO can never launch without a single vote.
    pub fn total_supply(e: &Env) -> i128 {
        <Self as Votes>::get_total_supply(e) as i128
    }

    /// Mints the next sequential token id to `to` (minter auth; the minter must
    /// be the admin or, once live, hold mint authority). A recipient without a
    /// delegate is self-delegated so it can vote immediately. Emits
    /// OpenZeppelin `Mint` plus `MintWithMinter`. Returns the token id.
    pub fn mint(e: &Env, minter: &Address, to: &Address) -> u32 {
        minter.require_auth();
        Self::ensure_mint_authority(e, minter);
        common::ttl::extend_instance(e);
        let holder = Self::voting_holder(e, to);
        if let Some(holder) = holder {
            Self::ensure_self_delegate(e, holder);
        }
        let token_id = Base::sequential_mint(e, to);
        if holder.is_some() {
            transfer_voting_units(e, None, holder, 1);
        }
        Self::call_metadata_hook(e, token_id);
        emit_token_mint(e, minter, to, token_id);
        token_id
    }

    /// Mints `amounts[i]` sequential tokens to each `recipients[i]` in one call
    /// (same authority rules as `mint`). The batch must fit the event budget
    /// (`common::batch_mint_fits`, `BatchTooLarge`): at most
    /// `common::MAX_BATCH_MINT` tokens to one recipient, or
    /// `common::MAX_BATCH_RECIPIENTS` recipients of one token each. Each new
    /// recipient adds delegation events on top of the per-token cost. The cap
    /// also bounds the metadata hook.
    ///
    /// Delegation, balance and vote checkpoints are touched once per recipient
    /// entry rather than once per token, which keeps the footprint small.
    /// Emits OpenZeppelin `Mint` per token and one `MintBatchWithMinter` for
    /// the whole range. Returns every new token id in order.
    pub fn batch_mint(
        e: &Env,
        minter: &Address,
        recipients: &Vec<Address>,
        amounts: &Vec<u128>,
    ) -> Vec<u32> {
        minter.require_auth();
        Self::ensure_mint_authority(e, minter);
        common::ttl::extend_instance(e);

        if recipients.len() != amounts.len() {
            panic_with_error!(e, TokenError::InvalidInput);
        }

        // Validate amounts and size the batch up front so the whole id range
        // is reserved with a single counter write.
        let mut total: u32 = 0;
        for amount in amounts.iter() {
            let amount: u32 = match amount.try_into() {
                Ok(v) if v > 0 => v,
                _ => panic_with_error!(e, TokenError::InvalidInput),
            };
            total = total
                .checked_add(amount)
                .unwrap_or_else(|| panic_with_error!(e, TokenError::BatchTooLarge));
        }
        if total == 0 {
            panic_with_error!(e, TokenError::InvalidInput);
        }
        if !common::batch_mint_fits(total, recipients.len()) {
            panic_with_error!(e, TokenError::BatchTooLarge);
        }

        let first_id = increment_token_id(e, total);
        let mut next_id = first_id;
        let mut token_ids = Vec::new(e);
        let mut delegated: Vec<Address> = Vec::new(e);

        for (recipient, amount) in recipients.iter().zip(amounts.iter()) {
            let holder = Self::voting_holder(e, &recipient);
            if let Some(holder) = holder {
                if !delegated.contains(holder) {
                    Self::ensure_self_delegate(e, holder);
                    delegated.push_back(holder.clone());
                }
            }

            // Ownership is written per token; balance and vote checkpoints
            // once per recipient entry.
            for _ in 0..amount {
                let key = NFTStorageKey::Owner(next_id);
                e.storage().persistent().set(&key, &recipient);
                common::ttl::extend_persistent(e, &key);
                emit_mint(e, &recipient, next_id);
                token_ids.push_back(next_id);
                next_id += 1;
            }
            Base::increase_balance(e, &recipient, amount as u32);
            if holder.is_some() {
                transfer_voting_units(e, None, holder, amount);
            }
        }

        Self::call_metadata_batch_hook(e, first_id, total);
        emit_token_batch_mint(e, minter, first_id, total);
        token_ids
    }

    /// Number of tokens owned by `account`.
    pub fn balance(e: &Env, account: &Address) -> u32 {
        Base::balance(e, account)
    }

    /// Owner of `token_id`. Panics if the token does not exist.
    pub fn owner_of(e: &Env, token_id: u32) -> Address {
        Base::owner_of(e, token_id)
    }

    /// Transfers `token_id` from `from` (auth) to `to`, moving the voting unit
    /// between their delegates. A recipient without a delegate is
    /// self-delegated. Emits OpenZeppelin `Transfer`.
    pub fn transfer(e: &Env, from: &Address, to: &Address, token_id: u32) {
        common::ttl::extend_instance(e);
        let to_holder = Self::voting_holder(e, to);
        if let Some(holder) = to_holder {
            Self::ensure_self_delegate(e, holder);
        }
        Base::transfer(e, from, to, token_id);
        Self::move_voting_unit(e, Self::voting_holder(e, from), to_holder);
    }

    /// Like `transfer`, by an approved `spender` (auth).
    pub fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        common::ttl::extend_instance(e);
        let to_holder = Self::voting_holder(e, to);
        if let Some(holder) = to_holder {
            Self::ensure_self_delegate(e, holder);
        }
        Base::transfer_from(e, spender, from, to, token_id);
        Self::move_voting_unit(e, Self::voting_holder(e, from), to_holder);
    }

    /// Approves `spender` to transfer `token_id` until `expiration_ledger`
    /// (`owner` auth). Emits OpenZeppelin `Approve`.
    pub fn approve(
        e: &Env,
        owner: &Address,
        spender: &Address,
        token_id: u32,
        expiration_ledger: u32,
    ) {
        Base::approve(e, owner, spender, token_id, expiration_ledger);
    }

    /// Number of vote checkpoints recorded for `account`.
    pub fn num_checkpoints(e: &Env, account: Address) -> u32 {
        num_checkpoints(e, &account)
    }
}

impl DaoTokenContract {
    fn manager(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage().instance().get(&TokenKey::Manager),
            common::CommonError::ManagerNotSet,
        )
    }

    fn treasury(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage().instance().get(&TokenKey::Treasury),
            common::CommonError::TreasuryNotSet,
        )
    }

    /// The address whose voting units represent `account`'s tokens: `None`
    /// for the DAO's Treasury, Auction and Marketplace (no voting power), the
    /// account itself otherwise.
    fn voting_holder<'a>(e: &Env, account: &'a Address) -> Option<&'a Address> {
        let instance = e.storage().instance();
        for key in [TokenKey::Treasury, TokenKey::Auction, TokenKey::Marketplace] {
            if instance.get::<TokenKey, Address>(&key).as_ref() == Some(account) {
                return None;
            }
        }
        Some(account)
    }

    /// Move one voting unit; `None` on a side burns/mints it from the voting
    /// supply. Nothing moves between two non-voting holders.
    fn move_voting_unit(e: &Env, from: Option<&Address>, to: Option<&Address>) {
        if from.is_some() || to.is_some() {
            transfer_voting_units(e, from, to, 1);
        }
    }

    fn write_mint_authority(e: &Env, authority: &Address, enabled: bool) {
        let key = TokenKey::MintAuthority(authority.clone());
        e.storage().persistent().set(&key, &enabled);
        common::ttl::extend_persistent(e, &key);
    }

    /// Calls the metadata `on_minted` hook. Failures are ignored so a broken
    /// metadata contract cannot block minting; `regenerate` re-seeds later.
    fn call_metadata_hook(e: &Env, token_id: u32) {
        if let Some(metadata) = Self::metadata(e) {
            let _ = MetadataHookClient::new(e, &metadata).try_on_minted(&token_id);
        }
    }

    /// Batch variant of `call_metadata_hook` for a contiguous id range.
    fn call_metadata_batch_hook(e: &Env, first_token_id: u32, count: u32) {
        if let Some(metadata) = Self::metadata(e) {
            let _ =
                MetadataHookClient::new(e, &metadata).try_on_minted_batch(&first_token_id, &count);
        }
    }

    /// Self-delegates `account` if it has no delegate yet, and renews the
    /// delegation's TTL.
    ///
    /// `stellar_governance::votes::delegate()` would require the account's
    /// auth, so the delegatee is written directly (as the library does) before
    /// the mint/transfer; the following `transfer_voting_units` then credits the
    /// new delegate's checkpoints. Emits the library's `DelegateChanged`.
    fn ensure_self_delegate(e: &Env, account: &Address) {
        let key = VotesStorageKey::Delegatee(account.clone());
        if get_delegate(e, account).is_none() {
            e.storage().persistent().set(&key, account);
            emit_library_delegate_changed(e, account, None, account);
        }
        common::ttl::extend_persistent(e, &key);
    }

    /// The admin may always mint; anyone else needs explicit authority and a
    /// live token (before launch only the launch admin mints).
    fn ensure_mint_authority(e: &Env, minter: &Address) {
        if *minter == common::admin::admin(e) {
            return;
        }
        if common::lifecycle::is_live(e) && Self::mint_authority(e, minter.clone()) {
            return;
        }
        panic_with_error!(e, TokenError::MintAuthorityNotAllowed);
    }
}

/// OpenZeppelin `Votes`: `delegate`, `get_votes`, `get_votes_at_checkpoint`,
/// `get_total_supply`, `get_total_supply_at_checkpoint`, `get_delegate`. The
/// Governor reads voting power and voting supply through these.
#[contractimpl(contracttrait)]
impl Votes for DaoTokenContract {}
