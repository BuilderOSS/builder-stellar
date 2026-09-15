use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env, String};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_governance::votes::{
    emit_delegate_changed as emit_library_delegate_changed, get_delegate, Votes, VotesStorageKey,
};
use stellar_macros::only_owner;
use stellar_tokens::non_fungible::{votes::NonFungibleVotes, Base};

use crate::error::TokenError;
use crate::events::{
    emit_batch_mint, emit_mint_authority_changed, emit_token_initialized, emit_token_mint,
};
use crate::storage::*;

/// Main contract for the DAO governance token.
///
/// This contract implements a non-fungible token with integrated voting capabilities,
/// combining OpenZeppelin's NFT base implementation with the Votes trait for governance.
/// Each token represents one unit of voting power that can be delegated to any address.
#[contract]
pub struct DaoTokenContract;

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
    ///
    /// # Events
    ///
    /// Emits a `TokenInitialized` event with the initialization parameters.
    pub fn __constructor(e: &Env, owner: Address, uri: String, name: String, symbol: String) {
        Base::set_metadata(e, uri.clone(), name.clone(), symbol.clone());
        set_owner(e, &owner);
        emit_token_initialized(e, &owner, &uri, &name, &symbol);
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
    pub fn mint(e: &Env, minter: &Address, to: &Address) -> u32 {
        minter.require_auth();
        Self::ensure_mint_authority(e, minter);
        Self::ensure_self_delegate(e, to);
        let token_id = NonFungibleVotes::sequential_mint(e, to);
        // Note: OpenZeppelin's NonFungibleVotes::sequential_mint() automatically emits standard Mint event

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

        for _ in 0..amount {
            let token_id = NonFungibleVotes::sequential_mint(e, to);
            last_token_id = token_id;
        }

        emit_batch_mint(e, minter, to, amount, last_token_id);
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
