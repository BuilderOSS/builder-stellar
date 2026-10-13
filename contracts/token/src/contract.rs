#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use soroban_sdk::{
    contract, contractimpl, panic_with_error, Address, BytesN, Env, Executable, String, Symbol, Vec,
};
use stellar_governance::votes::{
    emit_delegate_changed as emit_library_delegate_changed, get_delegate, num_checkpoints,
    transfer_voting_units, Votes, VotesStorageKey,
};
use stellar_tokens::non_fungible::{
    emit_mint,
    sequential::{increment_token_id, next_token_id},
    Base, NFTStorageKey,
};

use common::clients::{MetadataHookClient, TokenUriClient};
use common::modules::{self, MintGrant, ModuleEntry};

use crate::error::TokenError;
use crate::events::{
    emit_launched, emit_metadata_updated, emit_mint_allowance_changed, emit_module_registered,
    emit_module_unregistered, emit_token_batch_mint, emit_token_initialized, emit_token_mint,
};
use crate::storage::*;

/// DAO governance token: a sequential-id NFT where each token is one vote.
///
/// # Voting supply
///
/// Tokens held by the DAO's Treasury and by every registered module marked
/// `non_voting` (today the Auction and the Marketplace) carry no voting power.
/// Moving a token into one of them burns its voting unit (OpenZeppelin
/// `transfer_voting_units(Some(from), None, 1)`) and moving it out mints the
/// unit again. The votes `TotalSupply` checkpoint therefore counts only tokens
/// that can actually vote, which is what the Governor's quorum and
/// proposal-threshold checks read. Registering or unregistering a non-voting
/// module moves the votes of whatever it already holds the same way, so
/// balances and voting units can never drift apart
/// (docs/designs/membership-models.md §1).
///
/// # Minting
///
/// The admin (the launch admin in Setup, the Treasury once live) mints without
/// limit. A registered module mints against its `MintAllowance`. Before launch
/// only the `claims` module may use its allowance.
#[contract]
pub struct DaoTokenContract;

#[contractimpl]
impl DaoTokenContract {
    /// Initializes the token.
    ///
    /// * `admin` - setup-phase admin (the launch admin); becomes the Treasury at launch
    /// * `treasury` - DAO Treasury; `launch` must be called with exactly this address
    /// * `name`, `symbol` - collection name and symbol (OpenZeppelin caps them
    ///   at 40 and 10 bytes; the name may not contain `"`, `\` or control
    ///   characters because the on-chain token JSON copies it verbatim)
    /// * `metadata` - metadata contract called on every mint to seed artwork
    /// * `manager` - Manager contract (upgrade approvals, launch)
    /// * `current_hash` - this implementation's WASM hash (the release version is
    ///   read from the Manager registry, see `version`)
    ///
    /// Core wiring only: the Manager registers the DAO's modules (Auction,
    /// Marketplace, ClaimMinter) with `register_module` right after deploying
    /// them.
    pub fn __constructor(
        e: &Env,
        admin: Address,
        treasury: Address,
        name: String,
        symbol: String,
        metadata: Address,
        manager: Address,
        current_hash: BytesN<32>,
    ) {
        Self::set_name_and_symbol(e, &name, &symbol);
        common::admin::init(e, &admin);
        let instance = e.storage().instance();
        instance.set(&common::ns(e, TokenKey::MetadataContract), &metadata);
        instance.set(&common::ns(e, TokenKey::Manager), &manager);
        instance.set(&common::ns(e, TokenKey::Treasury), &treasury);
        common::upgrade::init(e, &current_hash, STORAGE_VERSION);
        emit_token_initialized(e, &admin, &name, &symbol);
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

    /// Returns the release version registered for the active token WASM.
    pub fn version(e: &Env) -> String {
        common::upgrade::version(e, &Self::manager(e))
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

    /// Updates the collection name and symbol (admin only). Emits
    /// `MetadataUpdated`. Token metadata itself is built by the Metadata
    /// contract (`token_uri`).
    pub fn set_metadata(e: &Env, name: String, symbol: String) {
        common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        Self::set_name_and_symbol(e, &name, &symbol);
        emit_metadata_updated(e, &name, &symbol);
    }

    /// How many more tokens `module` may mint (0 for unregistered addresses).
    pub fn mint_allowance(e: &Env, module: Address) -> u32 {
        let key = common::ns(e, TokenKey::MintAllowance(module));
        let allowance: Option<u32> = e.storage().persistent().get(&key);
        if allowance.is_some() {
            common::ttl::extend_persistent(e, &key);
        }
        allowance.unwrap_or(0)
    }

    /// Raises a registered module's allowance by `amount` (admin only;
    /// `NotAModule` otherwise). Adds rather than overwrites, so a grant for a
    /// second list never erases the first. Emits `MintAllowanceChanged`.
    pub fn increase_mint_allowance(e: &Env, module: Address, amount: u32) {
        let changed_by = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        if Self::find_module(e, &module).is_none() {
            panic_with_error!(e, TokenError::NotAModule);
        }
        let old = Self::mint_allowance(e, module.clone());
        Self::set_allowance(e, &module, old, old.saturating_add(amount), &changed_by);
    }

    /// Lowers `module`'s allowance by `amount`, saturating at 0 (admin only).
    /// Emits `MintAllowanceChanged`.
    pub fn decrease_mint_allowance(e: &Env, module: Address, amount: u32) {
        let changed_by = common::admin::require_admin(e);
        common::ttl::extend_instance(e);
        let old = Self::mint_allowance(e, module.clone());
        Self::set_allowance(e, &module, old, old.saturating_sub(amount), &changed_by);
    }

    /// A module gives back `amount` of its own allowance (module auth),
    /// saturating at 0: for example a closed pool's unstocked remainder.
    /// Emits `MintAllowanceChanged`. An unlimited allowance (`u32::MAX`) stays
    /// unlimited: it was never spent, so there is nothing to give back.
    pub fn release_mint_allowance(e: &Env, module: Address, amount: u32) {
        module.require_auth();
        common::ttl::extend_instance(e);
        let old = Self::mint_allowance(e, module.clone());
        if old == u32::MAX || amount == 0 {
            return;
        }
        Self::set_allowance(e, &module, old, old.saturating_sub(amount), &module);
    }

    /// Every registered module, in registration order.
    pub fn modules(e: &Env) -> Vec<ModuleEntry> {
        Self::read_modules(e)
    }

    /// The registered module of `kind`, if any.
    pub fn module(e: &Env, kind: Symbol) -> Option<Address> {
        Self::read_modules(e)
            .iter()
            .find(|m| m.kind == kind)
            .map(|m| m.address)
    }

    /// Registers `address` as a module of `kind`. In Setup only the Manager
    /// may register (during `create_dao` / `create_module`); once live only
    /// the admin (the Treasury, by proposal).
    ///
    /// `address` must be a deployed Wasm contract (`NotAContract`): wallets,
    /// Stellar Asset Contracts and predicted addresses are refused, so a
    /// proposal can never mark a holder's wallet non-voting. `kind` is a
    /// built-in kind or `custom_<name>` (`InvalidKind`) and unique
    /// (`KindTaken`). If the module is `non_voting` and already holds tokens,
    /// their votes leave the supply now. Emits `ModuleRegistered`.
    pub fn register_module(e: &Env, kind: Symbol, address: Address, non_voting: bool) {
        Self::require_registrar(e);
        common::ttl::extend_instance(e);
        if !modules::is_valid_kind(e, &kind) {
            panic_with_error!(e, TokenError::InvalidKind);
        }
        if !matches!(address.executable(), Some(Executable::Wasm(_))) {
            panic_with_error!(e, TokenError::NotAContract);
        }
        // The Treasury is core, never a module (it is non-voting already).
        if address == Self::treasury(e) {
            panic_with_error!(e, TokenError::ModuleAlreadyRegistered);
        }
        let mut entries = Self::read_modules(e);
        if entries.len() >= modules::MAX_MODULES {
            panic_with_error!(e, TokenError::TooManyModules);
        }
        for m in entries.iter() {
            if m.address == address {
                panic_with_error!(e, TokenError::ModuleAlreadyRegistered);
            }
            if m.kind == kind {
                panic_with_error!(e, TokenError::KindTaken);
            }
        }
        if non_voting {
            // A voting holder's units equal its balance (the invariant), so all
            // of them leave the supply, debited from its delegate.
            let held = u128::from(Base::balance(e, &address));
            if held > 0 {
                transfer_voting_units(e, Some(&address), None, held);
            }
        }
        entries.push_back(ModuleEntry {
            kind: kind.clone(),
            address: address.clone(),
            non_voting,
        });
        Self::write_modules(e, &entries);
        emit_module_registered(e, &kind, &address, non_voting);
    }

    /// Removes `address` from the registry (same authority as
    /// `register_module`; `NotAModule` if absent). Its allowance drops to 0.
    /// If it was `non_voting` and still holds tokens, it is self-delegated
    /// first and their votes return to the supply under its own address, so
    /// the account checkpoints keep adding up to `TotalSupply`. Empty a module
    /// before unregistering it: leftover tokens become that contract's own
    /// votes. Emits `ModuleUnregistered`.
    pub fn unregister_module(e: &Env, address: Address) {
        let changed_by = Self::require_registrar(e);
        common::ttl::extend_instance(e);
        let mut entries = Self::read_modules(e);
        let Some(index) = entries.iter().position(|m| m.address == address) else {
            panic_with_error!(e, TokenError::NotAModule);
        };
        let entry = entries.get_unchecked(index as u32);
        let old = Self::mint_allowance(e, address.clone());
        if old > 0 {
            Self::set_allowance(e, &address, old, 0, &changed_by);
        }
        if entry.non_voting {
            let held = u128::from(Base::balance(e, &address));
            if held > 0 {
                Self::ensure_self_delegate(e, &address);
                transfer_voting_units(e, None, Some(&address), held);
            }
        }
        entries.remove(index as u32);
        Self::write_modules(e, &entries);
        emit_module_unregistered(e, &entry.kind, &address);
    }

    /// Manager-only early handoff (`manager.open_assurance`): the admin moves
    /// to the Treasury and the token stays in Setup, so founder mints,
    /// settings and allowances are frozen until launch. Panics `AlreadyLive`
    /// once launched.
    pub fn handoff(e: &Env, treasury: Address) {
        Self::manager(e).require_auth();
        common::lifecycle::require_setup(e);
        if treasury != Self::treasury(e) {
            panic_with_error!(e, TokenError::TreasuryMismatch);
        }
        common::admin::handoff_once(e, &treasury);
        common::ttl::extend_instance(e);
    }

    /// One-shot, Manager-only launch (Setup -> Live).
    ///
    /// Hands the admin to `treasury` (unless `handoff` already did), raises
    /// each registered module's allowance by its grant (`NotAModule` for
    /// anything else), marks the token live and emits `TokenLaunched`. The
    /// Treasury needs no grant: as admin it mints without limit. A second call
    /// panics with `AlreadyLive`, so after launch the Manager has no authority
    /// over the token.
    pub fn launch(e: &Env, treasury: Address, grants: Vec<MintGrant>) {
        let manager = Self::manager(e);
        manager.require_auth();
        common::lifecycle::mark_live(e);
        if treasury != Self::treasury(e) {
            panic_with_error!(e, TokenError::TreasuryMismatch);
        }
        common::admin::handoff_once(e, &treasury);
        for grant in grants.iter() {
            if Self::find_module(e, &grant.module).is_none() {
                panic_with_error!(e, TokenError::NotAModule);
            }
            let old = Self::mint_allowance(e, grant.module.clone());
            Self::set_allowance(
                e,
                &grant.module,
                old,
                old.saturating_add(grant.allowance),
                &manager,
            );
        }
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury, &grants);
    }

    /// Whether the token has been launched (Setup -> Live).
    pub fn is_live(e: &Env) -> bool {
        common::lifecycle::is_live(e)
    }

    /// Returns the metadata contract used for mint hooks.
    pub fn metadata(e: &Env) -> Option<Address> {
        e.storage()
            .instance()
            .get(&common::ns(e, TokenKey::MetadataContract))
    }

    /// SEP-50 collection name.
    pub fn name(e: &Env) -> String {
        Base::name(e)
    }

    /// SEP-50 collection symbol.
    pub fn symbol(e: &Env) -> String {
        Base::symbol(e)
    }

    /// SEP-50 token metadata, built on-chain by the Metadata contract (a
    /// `data:application/json;base64` document). Panics if the token does not
    /// exist or has no artwork yet.
    ///
    /// Existence is `token_id < next id` (ids are sequential and never burned),
    /// not `owner_of`: OpenZeppelin renews an ownership entry for 30 days per
    /// touch, so reading it would make an idle holder's token unrenderable
    /// once the entry archives.
    pub fn token_uri(e: &Env, token_id: u32) -> String {
        if token_id >= next_token_id(e) {
            panic_with_error!(
                e,
                stellar_tokens::non_fungible::NonFungibleTokenError::NonExistentToken
            );
        }
        let metadata = Self::metadata(e)
            .unwrap_or_else(|| panic_with_error!(e, crate::error::TokenError::MetadataNotSet));
        TokenUriClient::new(e, &metadata).token_uri(&token_id, &Base::name(e))
    }

    /// Manager that approves upgrades and performed the launch.
    pub fn manager(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage()
                .instance()
                .get(&common::ns(e, TokenKey::Manager)),
            common::CommonError::ManagerNotSet,
        )
    }

    /// The DAO Treasury (admin once live; holds no voting power).
    pub fn treasury(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage()
                .instance()
                .get(&common::ns(e, TokenKey::Treasury)),
            common::CommonError::TreasuryNotSet,
        )
    }

    /// The registered `auction` module (holds no voting power).
    pub fn auction(e: &Env) -> Option<Address> {
        Self::module(e, Symbol::new(e, modules::KIND_AUCTION))
    }

    /// The registered `marketplace` module (escrow; holds no voting power).
    pub fn marketplace(e: &Env) -> Option<Address> {
        Self::module(e, Symbol::new(e, modules::KIND_MARKETPLACE))
    }

    /// Voting-capable supply: every minted token except those held by the
    /// Treasury and non-voting modules. The Manager requires it to be
    /// positive at launch, so a DAO can never launch without a single vote.
    pub fn total_supply(e: &Env) -> i128 {
        <Self as Votes>::get_total_supply(e) as i128
    }

    /// The voting supply at the previous ledger: the ledger a proposal's
    /// votes are snapshotted at, so the Governor's quorum and the voters'
    /// weights describe the same supply (contract review H1). Reads only the
    /// latest checkpoint, or the one before it when the latest was written in
    /// this ledger (that one was read, and so renewed, by the write). Never a
    /// binary search over history that the sweep lets archive.
    pub fn voting_supply_at_previous_ledger(e: &Env) -> u128 {
        use stellar_governance::votes::{get_checkpoint, CheckpointType, VotesStorageKey};
        let n: u32 = e
            .storage()
            .instance()
            .get(&VotesStorageKey::NumTotalSupplyCheckpoints)
            .unwrap_or(0);
        if n == 0 {
            return 0;
        }
        let latest = get_checkpoint(e, &CheckpointType::TotalSupply, n - 1);
        if latest.ledger < e.ledger().sequence() {
            return latest.votes;
        }
        if n == 1 {
            return 0;
        }
        get_checkpoint(e, &CheckpointType::TotalSupply, n - 2).votes
    }

    /// Tokens minted so far (the next id). Ids are sequential and never
    /// burned, so a token exists exactly when its id is below this.
    pub fn minted(e: &Env) -> u32 {
        next_token_id(e)
    }

    /// Mints the next sequential token id to `to` (minter auth; the minter must
    /// be the admin or a registered module with allowance, see `# Minting`). A recipient without a
    /// delegate is self-delegated so it can vote immediately. Emits
    /// OpenZeppelin `Mint` plus `MintWithMinter`. Returns the token id.
    pub fn mint(e: &Env, minter: &Address, to: &Address) -> u32 {
        minter.require_auth();
        Self::spend_mint_authority(e, minter, 1);
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
        Self::spend_mint_authority(e, minter, total);

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
    /// (`owner` auth). The approval is cleared when the token moves. Emits
    /// OpenZeppelin `Approve`.
    pub fn approve(
        e: &Env,
        owner: &Address,
        spender: &Address,
        token_id: u32,
        expiration_ledger: u32,
    ) {
        Base::approve(e, owner, spender, token_id, expiration_ledger);
    }

    /// Lets `operator` transfer every token of `owner` until
    /// `live_until_ledger` (`owner` auth; 0 revokes). Operator transfers go
    /// through `transfer_from`, so votes move exactly as on a direct transfer.
    /// Emits OpenZeppelin `ApproveForAll`.
    pub fn approve_for_all(e: &Env, owner: &Address, operator: &Address, live_until_ledger: u32) {
        Base::approve_for_all(e, owner, operator, live_until_ledger);
    }

    /// The live single-token approval of `token_id`, if any. Panics if the
    /// token does not exist.
    pub fn get_approved(e: &Env, token_id: u32) -> Option<Address> {
        Base::owner_of(e, token_id);
        Base::get_approved(e, token_id)
    }

    /// Whether `operator` currently holds a live approval for all of `owner`'s
    /// tokens.
    pub fn is_approved_for_all(e: &Env, owner: &Address, operator: &Address) -> bool {
        Base::is_approved_for_all(e, owner, operator)
    }

    /// Number of vote checkpoints recorded for `account`.
    pub fn num_checkpoints(e: &Env, account: Address) -> u32 {
        num_checkpoints(e, &account)
    }
}

impl DaoTokenContract {
    /// The name is copied verbatim into the on-chain token JSON, so it may not
    /// contain `"`, `\` or control characters (`InvalidName`). OpenZeppelin
    /// enforces the 40- and 10-byte caps.
    fn set_name_and_symbol(e: &Env, name: &String, symbol: &String) {
        let len = name.len() as usize;
        let mut buf = [0u8; stellar_tokens::non_fungible::MAX_NAME_LEN];
        if len <= buf.len() {
            name.copy_into_slice(&mut buf[..len]);
            if buf[..len]
                .iter()
                .any(|b| *b == b'"' || *b == b'\\' || *b < 0x20)
            {
                panic_with_error!(e, TokenError::InvalidName);
            }
        }
        Base::set_metadata(e, String::from_str(e, ""), name.clone(), symbol.clone());
    }

    /// The address whose voting units represent `account`'s tokens: `None`
    /// for the DAO's Treasury and every non-voting module, the account itself
    /// otherwise.
    fn voting_holder<'a>(e: &Env, account: &'a Address) -> Option<&'a Address> {
        if *account == Self::treasury(e) {
            return None;
        }
        if Self::read_modules(e)
            .iter()
            .any(|m| m.non_voting && m.address == *account)
        {
            return None;
        }
        Some(account)
    }

    fn read_modules(e: &Env) -> Vec<ModuleEntry> {
        e.storage()
            .instance()
            .get(&common::ns(e, TokenKey::Modules))
            .unwrap_or_else(|| Vec::new(e))
    }

    fn write_modules(e: &Env, entries: &Vec<ModuleEntry>) {
        e.storage()
            .instance()
            .set(&common::ns(e, TokenKey::Modules), entries);
    }

    fn find_module(e: &Env, address: &Address) -> Option<ModuleEntry> {
        Self::read_modules(e).iter().find(|m| m.address == *address)
    }

    /// In Setup the Manager registers modules; once live the admin does.
    /// Returns the authorizer (for `changed_by`).
    fn require_registrar(e: &Env) -> Address {
        if common::lifecycle::is_live(e) {
            common::admin::require_admin(e)
        } else {
            let manager = Self::manager(e);
            manager.require_auth();
            manager
        }
    }

    fn set_allowance(e: &Env, module: &Address, old: u32, new: u32, changed_by: &Address) {
        let key = common::ns(e, TokenKey::MintAllowance(module.clone()));
        if new == 0 {
            e.storage().persistent().remove(&key);
        } else {
            e.storage().persistent().set(&key, &new);
            common::ttl::extend_persistent(e, &key);
        }
        if old != new {
            emit_mint_allowance_changed(e, module, old, new, changed_by);
        }
    }

    /// Move one voting unit; `None` on a side burns/mints it from the voting
    /// supply. Nothing moves between two non-voting holders.
    fn move_voting_unit(e: &Env, from: Option<&Address>, to: Option<&Address>) {
        if from.is_some() || to.is_some() {
            transfer_voting_units(e, from, to, 1);
        }
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

    /// The admin always mints. Anyone else must be a registered module and
    /// spends `count` from its allowance (`AllowanceExceeded`; `u32::MAX` is
    /// unlimited and never spent); before launch
    /// only the `claims` module may (`MintAuthorityNotAllowed`), so the
    /// Auction's large allowance is inert until the DAO is live.
    fn spend_mint_authority(e: &Env, minter: &Address, count: u32) {
        if *minter == common::admin::admin(e) {
            return;
        }
        let Some(entry) = Self::find_module(e, minter) else {
            panic_with_error!(e, TokenError::MintAuthorityNotAllowed);
        };
        if !common::lifecycle::is_live(e) && !modules::kind_is(e, &entry.kind, modules::KIND_CLAIMS)
        {
            panic_with_error!(e, TokenError::MintAuthorityNotAllowed);
        }
        let allowance = Self::mint_allowance(e, minter.clone());
        if allowance < count {
            panic_with_error!(e, TokenError::AllowanceExceeded);
        }
        // `u32::MAX` is unlimited (the Auction): never spent.
        if allowance == u32::MAX {
            return;
        }
        let key = common::ns(e, TokenKey::MintAllowance(minter.clone()));
        let left = allowance - count;
        if left == 0 {
            e.storage().persistent().remove(&key);
        } else {
            e.storage().persistent().set(&key, &left);
        }
    }
}

/// OpenZeppelin `Votes`: `delegate`, `get_votes`, `get_votes_at_checkpoint`,
/// `get_total_supply`, `get_total_supply_at_checkpoint`, `get_delegate`. The
/// Governor reads voting power and voting supply through these.
#[contractimpl(contracttrait)]
impl Votes for DaoTokenContract {}
