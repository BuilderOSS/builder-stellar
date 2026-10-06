use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, vec, Address, BytesN,
    Env, Error, IntoVal, String, Vec,
};
use stellar_access::ownable::{set_owner, Ownable, OwnableStorageKey};
use stellar_governance::votes::{
    emit_delegate_changed as emit_library_delegate_changed, get_delegate, Checkpoint, Votes,
    VotesStorageKey,
};
use stellar_macros::only_owner;
use stellar_tokens::non_fungible::{votes::NonFungibleVotes, Base};

use crate::error::TokenError;
use crate::events::{
    emit_batch_mint, emit_batch_mint_many, emit_metadata_hook_failed, emit_mint_authority_changed,
    emit_token_initialized, emit_token_mint,
};
use crate::storage::*;

/// Main contract for the DAO governance token.
///
/// This contract implements a non-fungible token with integrated voting capabilities,
/// combining OpenZeppelin's NFT base implementation with the Votes trait for governance.
/// Each token represents one unit of voting power that can be delegated to any address.
#[contract]
pub struct DaoTokenContract;

/// A bounded multi-recipient mint allocation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchMintRecipient {
    pub to: Address,
    pub amount: u32,
}

#[contractimpl]
impl DaoTokenContract {
    /// Initializes the token contract with metadata and ownership.
    ///
    /// # Arguments
    ///
    /// * `owner` - The address that will own and control the contract
    /// * `uri` - The base URI for token metadata (typically an IPFS or HTTP link)
    /// * `name` - The human-readable name of the token collection
    /// * `symbol` - The short symbol/ticker for the token
    /// * `metadata` - The metadata contract address for artwork generation
    /// * `manager` - The Manager contract address for upgrade validation
    /// * `current_hash` - The WASM hash of this contract implementation
    /// * `version` - The semantic version string (e.g., "0.1.0")
    ///
    /// # Events
    ///
    /// Emits a `TokenInitialized` event with the initialization parameters.
    pub fn __constructor(
        e: &Env,
        owner: Address,
        uri: String,
        name: String,
        symbol: String,
        metadata: Address,
        manager: Address,
        current_hash: BytesN<32>,
        version: String,
    ) {
        Base::set_metadata(e, uri.clone(), name.clone(), symbol.clone());
        set_owner(e, &owner);
        e.storage().instance().set(&TokenKey::Metadata, &metadata);
        e.storage().instance().set(&TokenKey::Manager, &manager);
        e.storage()
            .instance()
            .set(&TokenKey::CurrentHash, &current_hash);
        e.storage()
            .instance()
            .set(&TokenKey::CurrentVersion, &version);
        emit_token_initialized(e, &owner, &uri, &name, &symbol, &version);
    }

    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        let owner = stellar_access::ownable::get_owner(e).expect("owner not set");
        owner.require_auth();
        let manager: Address = e
            .storage()
            .instance()
            .get(&TokenKey::Manager)
            .expect("manager not set");
        let current: BytesN<32> = e
            .storage()
            .instance()
            .get(&TokenKey::CurrentHash)
            .expect("current hash not set");
        if from_hash != current {
            panic!("from hash does not match current hash");
        }
        let approved: bool = e.invoke_contract(
            &manager,
            &soroban_sdk::Symbol::new(e, "is_upgrade_approved"),
            soroban_sdk::vec![e, from_hash.into_val(e), to_hash.clone().into_val(e)],
        );
        if !approved {
            panic!("upgrade not approved");
        }
        let version: Option<String> = e.invoke_contract(
            &manager,
            &soroban_sdk::Symbol::new(e, "get_implementation_version"),
            soroban_sdk::vec![e, to_hash.clone().into_val(e)],
        );
        let version = version.expect("target version not registered");
        e.storage().instance().set(&TokenKey::CurrentHash, &to_hash);
        e.storage()
            .instance()
            .set(&TokenKey::CurrentVersion, &version);
        e.deployer().update_current_contract_wasm(to_hash);
    }

    /// Returns the release version registered for the active token WASM.
    pub fn version(e: &Env) -> String {
        e.storage()
            .instance()
            .get(&TokenKey::CurrentVersion)
            .expect("token version not set")
    }

    /// Returns the active token WASM hash.
    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        e.storage()
            .instance()
            .get(&TokenKey::CurrentHash)
            .expect("token hash not set")
    }

    /// Synchronizes the stored release version with the active registered WASM.
    /// Required once after upgrading a DAO from a release that predates version
    /// synchronization in its `upgrade` entrypoint.
    pub fn sync_version(e: &Env) {
        let owner = stellar_access::ownable::get_owner(e).expect("owner not set");
        owner.require_auth();
        let manager: Address = e
            .storage()
            .instance()
            .get(&TokenKey::Manager)
            .expect("manager not set");
        let current = Self::wasm_hash(e);
        let version: Option<String> = e.invoke_contract(
            &manager,
            &soroban_sdk::Symbol::new(e, "get_implementation_version"),
            soroban_sdk::vec![e, current.into_val(e)],
        );
        e.storage().instance().set(
            &TokenKey::CurrentVersion,
            &version.expect("active WASM version not registered"),
        );
    }

    /// Updates collection metadata during the launch-admin setup window or
    /// later through the module owner.
    #[only_owner]
    pub fn set_metadata(e: &Env, uri: String, name: String, symbol: String) {
        Base::set_metadata(e, uri, name, symbol);
    }

    /// Grants or revokes minting authority for an address.
    ///
    /// Only the contract owner can call this function. This allows delegating
    /// minting capabilities to other contracts (e.g., an auction contract) without
    /// transferring ownership.
    ///
    /// # Arguments
    ///
    /// * `authority` - The address to grant or revoke minting authority
    /// * `enabled` - `true` to grant authority, `false` to revoke it
    ///
    /// # Authorization
    ///
    /// Requires owner authentication (enforced by `#[only_owner]` macro).
    ///
    /// # Events
    ///
    /// Emits a `MintAuthorityChanged` event with old and new permission states.
    #[only_owner]
    pub fn set_mint_authority(e: &Env, authority: Address, enabled: bool) {
        let old_enabled = Self::mint_authority(e, authority.clone());
        let changed_by = stellar_access::ownable::get_owner(e).expect("owner not set");

        e.storage()
            .instance()
            .set(&TokenKey::MintAuthority(authority.clone()), &enabled);

        emit_mint_authority_changed(e, &authority, old_enabled, enabled, &changed_by);
    }

    /// Checks if an address has minting authority.
    ///
    /// # Arguments
    ///
    /// * `authority` - The address to check
    ///
    /// # Returns
    ///
    /// `true` if the address has minting authority, `false` otherwise.
    /// The owner always has implicit minting authority even if not explicitly set.
    pub fn mint_authority(e: &Env, authority: Address) -> bool {
        e.storage()
            .instance()
            .get(&TokenKey::MintAuthority(authority))
            .unwrap_or(false)
    }

    /// Finalizes DAO setup by moving ownership from the launch administrator
    /// to the Treasury. This one-time handoff is authorized by the Manager.
    pub fn finalize_ownership(e: &Env, new_owner: Address) {
        let manager: Address = e
            .storage()
            .instance()
            .get(&TokenKey::Manager)
            .expect("manager not set");
        manager.require_auth();
        e.storage()
            .instance()
            .set(&OwnableStorageKey::Owner, &new_owner);
    }

    /// Enables a module's mint authority during manager-controlled finalization.
    ///
    /// The Manager uses this for the Auction contract only when auctions are
    /// enabled. Keeping this separate from owner authorization allows founder
    /// minting to happen before the Treasury owns the token.
    pub fn enable_mint_authority_by_manager(e: &Env, authority: Address) {
        let manager: Address = e
            .storage()
            .instance()
            .get(&TokenKey::Manager)
            .expect("manager not set");
        manager.require_auth();
        let old_enabled = Self::mint_authority(e, authority.clone());
        e.storage()
            .instance()
            .set(&TokenKey::MintAuthority(authority.clone()), &true);
        emit_mint_authority_changed(e, &authority, old_enabled, true, &manager);
    }

    /// Returns the metadata contract used for mint hooks.
    pub fn metadata(e: &Env) -> Option<Address> {
        e.storage().instance().get(&TokenKey::Metadata)
    }

    /// Mints a single NFT to the specified address.
    ///
    /// The token is assigned a sequential ID (starting from 0) and the recipient
    /// is automatically self-delegated if they don't have an existing delegation,
    /// ensuring they immediately receive voting power.
    ///
    /// # Arguments
    ///
    /// * `minter` - The address performing the mint (must be owner or have mint authority)
    /// * `to` - The address receiving the newly minted token
    ///
    /// # Returns
    ///
    /// The ID of the newly minted token.
    ///
    /// # Authorization
    ///
    /// Requires authentication from `minter` and validates minting authority.
    ///
    /// # Panics
    ///
    /// Panics with `TokenError::MintAuthorityNotAllowed` if the minter lacks authority.
    ///
    /// # Events
    ///
    /// Emits both a standard `Mint` event (via OpenZeppelin) and a custom
    /// `MintWithMinter` event that includes the minter's address.
    /// Returns total minted voting units for manager launch validation.
    pub fn total_supply(e: &Env) -> i128 {
        <Self as Votes>::get_total_supply(e) as i128
    }

    pub fn mint(e: &Env, minter: &Address, to: &Address) -> u32 {
        minter.require_auth();
        Self::ensure_mint_authority(e, minter);
        Self::ensure_self_delegate(e, to);
        Self::preflight_checkpoint_writes(e, to, 1);
        let token_id = NonFungibleVotes::sequential_mint(e, to);
        // Note: OpenZeppelin's NonFungibleVotes::sequential_mint() automatically emits standard Mint event

        // Generate artwork seed via metadata contract
        Self::call_metadata_hook(e, token_id);

        emit_token_mint(e, minter, to, token_id);
        token_id
    }

    /// Mints multiple NFTs to the same address in a single transaction.
    ///
    /// This is more efficient than calling `mint()` multiple times when distributing
    /// many tokens to one address. All tokens are sequentially numbered and the
    /// recipient is auto-delegated once (not per token).
    ///
    /// # Arguments
    ///
    /// * `minter` - The address performing the mint (must be owner or have mint authority)
    /// * `to` - The address receiving all the newly minted tokens
    /// * `amount` - Number of tokens to mint (must be between 1 and `MAX_BATCH_MINT`)
    ///
    /// # Returns
    ///
    /// The ID of the last minted token in the batch.
    ///
    /// # Authorization
    ///
    /// Requires authentication from `minter` and validates minting authority.
    ///
    /// # Panics
    ///
    /// Panics with `TokenError::InvalidBatchMintAmount` if `amount` is 0 or exceeds
    /// `MAX_BATCH_MINT` (100).
    ///
    /// # Events
    ///
    /// Emits individual `Mint` events for each token (via OpenZeppelin) plus one
    /// `BatchMint` summary event with the total amount and last token ID.
    pub fn batch_mint(e: &Env, minter: &Address, to: &Address, amount: u32) -> u32 {
        if amount == 0 || amount > MAX_BATCH_MINT {
            panic_with_error!(e, TokenError::InvalidBatchMintAmount);
        }

        minter.require_auth();
        Self::ensure_mint_authority(e, minter);
        Self::ensure_self_delegate(e, to);

        let mut last_token_id = 0;

        Self::preflight_checkpoint_writes(e, to, amount);
        for _ in 0..amount {
            let token_id = NonFungibleVotes::sequential_mint(e, to);

            // Generate artwork seed via metadata contract
            Self::call_metadata_hook(e, token_id);

            last_token_id = token_id;
        }

        emit_batch_mint(e, minter, to, amount, last_token_id);
        last_token_id
    }

    /// Mints tokens to multiple recipients in one transaction.
    ///
    /// The combined amount is bounded by `MAX_BATCH_MINT`. Each recipient gets
    /// sequential token IDs, and one `BatchMint` summary event is emitted for
    /// each allocation. The existing `batch_mint` method remains available for
    /// callers minting to a single recipient.
    pub fn batch_mint_many(e: &Env, minter: &Address, recipients: Vec<BatchMintRecipient>) -> u32 {
        if recipients.is_empty() {
            panic_with_error!(e, TokenError::InvalidBatchMintAmount);
        }
        if recipients.len() > MAX_BATCH_MINT_RECIPIENTS {
            panic_with_error!(e, TokenError::InvalidBatchMintAmount);
        }

        minter.require_auth();
        Self::ensure_mint_authority(e, minter);

        let mut total_amount = 0u32;
        for recipient in recipients.iter() {
            if recipient.amount == 0 {
                panic_with_error!(e, TokenError::InvalidBatchMintAmount);
            }
            total_amount = total_amount
                .checked_add(recipient.amount)
                .unwrap_or(MAX_BATCH_MINT + 1);
            if total_amount > MAX_BATCH_MINT {
                panic_with_error!(e, TokenError::InvalidBatchMintAmount);
            }
        }

        // Preflight all checkpoint keys before minting. Total-supply checkpoints
        // are shared by every recipient, while delegate checkpoints are per
        // recipient and must account for duplicate allocations.
        Self::preflight_total_supply_writes(e, total_amount);
        let mut prepared_recipients: Vec<(Address, u32)> = Vec::new(e);
        for recipient in recipients.iter() {
            Self::ensure_self_delegate(e, &recipient.to);

            let mut cumulative_amount = recipient.amount;
            for prepared in prepared_recipients.iter() {
                if prepared.0 == recipient.to {
                    cumulative_amount += prepared.1;
                }
            }
            Self::preflight_delegate_checkpoint_writes(e, &recipient.to, cumulative_amount);

            let mut merged = false;
            for index in 0..prepared_recipients.len() {
                let prepared = prepared_recipients.get(index).unwrap();
                if prepared.0 == recipient.to {
                    prepared_recipients.set(index, (prepared.0, prepared.1 + recipient.amount));
                    merged = true;
                    break;
                }
            }
            if !merged {
                prepared_recipients.push_back((recipient.to.clone(), recipient.amount));
            }
        }

        let mut last_token_id = 0;
        for recipient in recipients.iter() {
            for _ in 0..recipient.amount {
                let token_id = NonFungibleVotes::sequential_mint(e, &recipient.to);
                Self::call_metadata_hook(e, token_id);
                last_token_id = token_id;
            }
            emit_batch_mint(e, minter, &recipient.to, recipient.amount, last_token_id);
        }

        emit_batch_mint_many(e, minter, total_amount, recipients.len());

        last_token_id
    }

    /// Returns the number of tokens owned by an account.
    ///
    /// # Arguments
    ///
    /// * `account` - The address to query
    ///
    /// # Returns
    ///
    /// The total number of NFTs owned by the account.
    pub fn balance(e: &Env, account: &Address) -> u32 {
        Base::balance(e, account)
    }

    /// Returns the owner of a specific token.
    ///
    /// # Arguments
    ///
    /// * `token_id` - The ID of the token to query
    ///
    /// # Returns
    ///
    /// The address that owns the specified token.
    ///
    /// # Panics
    ///
    /// Panics if the token ID does not exist.
    pub fn owner_of(e: &Env, token_id: u32) -> Address {
        Base::owner_of(e, token_id)
    }

    /// Returns the token contract owner used during the launch setup window.
    pub fn owner(e: &Env) -> Address {
        stellar_access::ownable::get_owner(e).expect("owner not set")
    }

    /// Transfers a token from one address to another.
    ///
    /// The recipient is automatically self-delegated if they don't have an existing
    /// delegation, and voting power is automatically moved from the old owner's
    /// delegate to the new owner's delegate via the checkpoint system.
    ///
    /// # Arguments
    ///
    /// * `from` - The current owner of the token (must authenticate)
    /// * `to` - The address receiving the token
    /// * `token_id` - The ID of the token to transfer
    ///
    /// # Authorization
    ///
    /// Requires authentication from `from` address.
    ///
    /// # Events
    ///
    /// Emits a standard `Transfer` event (via OpenZeppelin) and updates voting
    /// power checkpoints for both sender and receiver delegates.
    pub fn transfer(e: &Env, from: &Address, to: &Address, token_id: u32) {
        Self::ensure_self_delegate(e, to);
        Self::preflight_checkpoint_writes(e, from, 1);
        Self::preflight_checkpoint_writes(e, to, 1);
        NonFungibleVotes::transfer(e, from, to, token_id);
        // Note: OpenZeppelin's NonFungibleVotes::transfer() automatically emits standard Transfer event
    }

    /// Transfers a token on behalf of the owner using a previously granted approval.
    ///
    /// Similar to `transfer()` but allows an approved spender to transfer the token.
    /// The recipient is automatically self-delegated and voting power is updated.
    ///
    /// # Arguments
    ///
    /// * `spender` - The address performing the transfer (must be approved or operator)
    /// * `from` - The current owner of the token
    /// * `to` - The address receiving the token
    /// * `token_id` - The ID of the token to transfer
    ///
    /// # Authorization
    ///
    /// Requires authentication from `spender` and validates approval for `token_id`.
    ///
    /// # Events
    ///
    /// Emits a standard `Transfer` event (via OpenZeppelin) and updates voting
    /// power checkpoints for both sender and receiver delegates.
    pub fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        Self::ensure_self_delegate(e, to);
        Self::preflight_checkpoint_writes(e, from, 1);
        Self::preflight_checkpoint_writes(e, to, 1);
        NonFungibleVotes::transfer_from(e, spender, from, to, token_id);
        // Note: OpenZeppelin's NonFungibleVotes::transfer_from() automatically emits standard Transfer event
    }

    /// Approves an address to transfer a specific token.
    ///
    /// # Arguments
    ///
    /// * `owner` - The owner of the token (must authenticate)
    /// * `spender` - The address being approved
    /// * `token_id` - The ID of the token to approve
    /// * `expiration_ledger` - The ledger sequence when the approval expires
    ///
    /// # Authorization
    ///
    /// Requires authentication from `owner`.
    ///
    /// # Events
    ///
    /// Emits a standard `Approve` event (via OpenZeppelin).
    pub fn approve(
        e: &Env,
        owner: &Address,
        spender: &Address,
        token_id: u32,
        expiration_ledger: u32,
    ) {
        Base::approve(e, owner, spender, token_id, expiration_ledger);
        // Note: OpenZeppelin's Base::approve() automatically emits standard Approve event
    }

    /// Extends the TTL of delegation data to ensure it persists long-term.
    ///
    /// Delegation data is stored in persistent storage with a 1-year TTL that
    /// automatically extends when accessed. This ensures voting power delegations
    /// remain available for governance operations.
    ///
    /// # Arguments
    ///
    /// * `account` - The address whose delegation TTL should be extended
    fn extend_delegation_ttl(e: &Env, account: &Address) {
        let key = VotesStorageKey::Delegatee(account.clone());
        e.storage().persistent().extend_ttl(
            &key,
            DELEGATION_TTL_THRESHOLD,
            DELEGATION_TTL_EXTEND_AMOUNT,
        );
    }

    /// Ensures an account has a delegate set, defaulting to self-delegation.
    ///
    /// This function auto-delegates to self if no delegation exists, providing
    /// better UX by ensuring users automatically receive voting power when they
    /// receive tokens.
    ///
    /// Note: We cannot use `stellar_governance::votes::delegate()` here because
    /// it requires authentication from the account. Instead, we:
    /// 1. Set the delegatee storage directly (before minting/transfer)
    /// 2. Let `transfer_voting_units()` (called by mint/transfer) handle vote movement
    ///
    /// This approach is safe because:
    /// - Storage write happens before vote transfer
    /// - `transfer_voting_units()` properly updates voting power checkpoints
    /// - Events are emitted for transparency
    fn call_metadata_hook(e: &Env, token_id: u32) {
        if let Some(metadata_addr) = e
            .storage()
            .instance()
            .get::<TokenKey, Address>(&TokenKey::Metadata)
        {
            // The metadata hook is best-effort. Minting remains available if the
            // optional artwork service is unavailable, but the failure is visible
            // to indexers and operators instead of being silently discarded.
            match e.try_invoke_contract::<bool, Error>(
                &metadata_addr,
                &symbol_short!("on_minted"),
                vec![e, token_id.into_val(e)],
            ) {
                Ok(Ok(true)) => {}
                Ok(Ok(false)) | Ok(Err(_)) | Err(_) => emit_metadata_hook_failed(e, token_id),
            }
        }
    }

    fn ensure_self_delegate(e: &Env, account: &Address) {
        if get_delegate(e, account).is_none() {
            // Set delegatee storage (same as library's delegate() function)
            e.storage()
                .persistent()
                .set(&VotesStorageKey::Delegatee(account.clone()), account);

            // Emit standard delegation event (same as library)
            emit_library_delegate_changed(e, account, None, account);

            // Note: Vote movement happens automatically when transfer_voting_units()
            // is called by sequential_mint() or transfer(), which looks up the
            // delegatee we just set and properly updates voting power checkpoints.
        }

        // Always extend TTL when delegation is checked/used
        Self::extend_delegation_ttl(e, account);
    }

    /// Include the next checkpoint keys in Soroban's transaction footprint.
    /// The votes library writes these keys directly when a mint creates a new
    /// ledger checkpoint, so a missing-key write must be preflighted first.
    fn preflight_checkpoint_writes(e: &Env, account: &Address, count: u32) {
        Self::preflight_total_supply_writes(e, count);
        Self::preflight_delegate_checkpoint_writes(e, account, count);
    }

    fn preflight_total_supply_writes(e: &Env, count: u32) {
        let total_supply_index = e
            .storage()
            .instance()
            .get::<VotesStorageKey, u32>(&VotesStorageKey::NumTotalSupplyCheckpoints)
            .unwrap_or(0);
        for index in total_supply_index..total_supply_index + count {
            e.storage().persistent().set(
                &VotesStorageKey::TotalSupplyCheckpoint(index),
                &Checkpoint {
                    ledger: e.ledger().sequence(),
                    votes: 0,
                },
            );
        }
    }

    fn preflight_delegate_checkpoint_writes(e: &Env, account: &Address, count: u32) {
        let delegate_count_key = VotesStorageKey::NumCheckpoints(account.clone());
        let delegate_count = e
            .storage()
            .persistent()
            .get::<VotesStorageKey, u32>(&delegate_count_key);
        let delegate_index = delegate_count.unwrap_or(0);
        e.storage()
            .persistent()
            .set(&delegate_count_key, &delegate_index);
        for index in delegate_index..delegate_index + count {
            e.storage().persistent().set(
                &VotesStorageKey::DelegateCheckpoint(account.clone(), index),
                &Checkpoint {
                    ledger: e.ledger().sequence(),
                    votes: 0,
                },
            );
        }
    }

    /// Validates that an address has permission to mint tokens.
    ///
    /// Minting is allowed for:
    /// 1. The contract owner (implicit authority)
    /// 2. Any address explicitly granted authority via `set_mint_authority()`
    ///
    /// # Arguments
    ///
    /// * `minter` - The address to validate
    ///
    /// # Panics
    ///
    /// - Panics with `TokenError::OwnerNotSet` if the contract owner is not set
    /// - Panics with `TokenError::MintAuthorityNotAllowed` if the minter lacks authority
    fn ensure_mint_authority(e: &Env, minter: &Address) {
        let Some(owner) = stellar_access::ownable::get_owner(e) else {
            panic_with_error!(e, TokenError::OwnerNotSet);
        };

        if minter == &owner || Self::mint_authority(e, minter.clone()) {
            return;
        }

        panic_with_error!(e, TokenError::MintAuthorityNotAllowed);
    }
}

/// Implements the Votes trait for governance functionality.
///
/// Provides vote delegation and checkpoint-based voting power queries including:
/// - `delegate()` - Delegate voting power to another address
/// - `get_votes()` - Get current voting power for an address
/// - `get_past_votes()` - Get historical voting power at a specific timestamp
/// - `get_past_total_supply()` - Get historical total voting power
///
/// These functions are used by the Governor contract to determine voting eligibility
/// and power for proposals.
#[contractimpl(contracttrait)]
impl Votes for DaoTokenContract {}

/// Implements the Ownable trait for access control.
///
/// Provides owner management functions:
/// - `owner()` - Get the current owner address
/// - `transfer_ownership()` - Transfer ownership to a new address
/// - `renounce_ownership()` - Remove the owner (use with caution)
#[contractimpl(contracttrait)]
impl Ownable for DaoTokenContract {}
