//! Core Minter contract implementation.

use soroban_sdk::{
    contract, contractimpl, panic_with_error, symbol_short, vec, Address, Bytes, Env, IntoVal,
    String, Vec,
};

use crate::errors::MinterError;
use crate::events::*;
use crate::storage::*;
use crate::strategy;

#[contract]
pub struct MinterContract;

#[contractimpl]
impl MinterContract {
    /// Initializes the Minter contract with token and admin addresses.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `token` - The token contract address (who can call mint functions)
    /// * `admin` - The admin address (who can register/update strategies)
    ///
    /// # Errors
    ///
    /// Returns error if contract is already initialized.
    pub fn __constructor(e: &Env, token: Address, admin: Address) {
        // Verify not already initialized
        if get_admin(e).is_some() {
            panic_with_error!(e, MinterError::AdminNotSet);
        }

        set_admin(e, &admin);
        set_token(e, &token);
        set_next_strategy_id(e, 1); // Start from 1, reserve 0 for default batch
    }

    /// Registers a new minting strategy.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `strategy_type` - The type of strategy
    /// * `name` - Human-readable name
    /// * `description` - Detailed description
    /// * `authorization` - Who can call this strategy
    /// * `config` - Strategy-specific configuration
    ///
    /// # Returns
    ///
    /// The newly assigned strategy ID
    ///
    /// # Authorization
    ///
    /// Requires admin authentication.
    pub fn register_strategy(
        e: &Env,
        strategy_type: StrategyType,
        name: String,
        description: String,
        authorization: StrategyAuthorization,
        config: StrategyConfig,
    ) -> Result<u32, MinterError> {
        let admin = get_admin(e).ok_or(MinterError::AdminNotSet)?;
        admin.require_auth();

        // Get next available ID
        let strategy_id = get_next_strategy_id(e);
        if strategy_id >= MAX_STRATEGIES {
            return Err(MinterError::InvalidConfig);
        }

        // Create strategy info
        let strategy = StrategyInfo {
            id: strategy_id,
            strategy_type,
            name: name.clone(),
            description,
            created_ledger: get_ledger(e),
            updated_ledger: get_ledger(e),
            is_paused: false,
            authorization,
            config,
        };

        // Save strategy
        set_strategy_info(e, &strategy);

        // Initialize state
        let state = StrategyState::new(strategy_id, get_ledger(e));
        set_strategy_state(e, &state);

        // Increment strategy ID counter
        set_next_strategy_id(e, strategy_id + 1);

        // Emit event
        emit_strategy_registered(e, strategy_id, &name);

        Ok(strategy_id)
    }

    /// Updates an existing strategy's configuration.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `strategy_id` - The ID of strategy to update
    /// * `config` - New configuration
    ///
    /// # Authorization
    ///
    /// Requires admin authentication.
    pub fn update_strategy(
        e: &Env,
        strategy_id: u32,
        config: StrategyConfig,
    ) -> Result<(), MinterError> {
        let admin = get_admin(e).ok_or(MinterError::AdminNotSet)?;
        admin.require_auth();

        // Load and update strategy
        let mut strategy =
            get_strategy_info(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;
        strategy.config = config;
        strategy.updated_ledger = get_ledger(e);

        set_strategy_info(e, &strategy);
        emit_strategy_updated(e, strategy_id);

        Ok(())
    }

    /// Pauses a strategy, preventing further mints.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `strategy_id` - The ID of strategy to pause
    ///
    /// # Authorization
    ///
    /// Requires admin authentication.
    pub fn pause_strategy(e: &Env, strategy_id: u32) -> Result<(), MinterError> {
        let admin = get_admin(e).ok_or(MinterError::AdminNotSet)?;
        admin.require_auth();

        let mut strategy =
            get_strategy_info(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;
        if strategy.is_paused {
            return Ok(()); // Already paused
        }

        strategy.is_paused = true;
        let mut state = get_strategy_state(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;
        state.is_paused = true;

        set_strategy_info(e, &strategy);
        set_strategy_state(e, &state);
        emit_strategy_paused(e, strategy_id);

        Ok(())
    }

    /// Resumes a paused strategy.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `strategy_id` - The ID of strategy to resume
    ///
    /// # Authorization
    ///
    /// Requires admin authentication.
    pub fn resume_strategy(e: &Env, strategy_id: u32) -> Result<(), MinterError> {
        let admin = get_admin(e).ok_or(MinterError::AdminNotSet)?;
        admin.require_auth();

        let mut strategy =
            get_strategy_info(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;
        if !strategy.is_paused {
            return Ok(()); // Not paused
        }

        strategy.is_paused = false;
        let mut state = get_strategy_state(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;
        state.is_paused = false;

        set_strategy_info(e, &strategy);
        set_strategy_state(e, &state);
        emit_strategy_resumed(e, strategy_id);

        Ok(())
    }

    /// Mints tokens to a single recipient using a strategy.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `strategy_id` - The strategy to use
    /// * `recipient` - Who receives the tokens
    /// * `amount` - How many tokens to mint
    ///
    /// # Returns
    ///
    /// `true` if mint was successful
    pub fn mint(
        e: &Env,
        strategy_id: u32,
        recipient: Address,
        amount: u128,
    ) -> Result<bool, MinterError> {
        let token = get_token(e).ok_or(MinterError::TokenNotSet)?;
        let strategy = get_strategy_info(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;

        // Check strategy not paused
        if strategy.is_paused {
            return Err(MinterError::StrategyPaused);
        }

        // Authorize based on strategy type
        authorize_mint(e, &strategy, &token)?;

        // Validate amount
        if amount == 0 {
            return Err(MinterError::InvalidAmount);
        }

        // Route to strategy-specific validation
        validate_strategy_mint(e, &strategy, &recipient, amount)?;

        // Check if already claimed (for single-claim strategies)
        let claimed = get_claimed(e, strategy_id, &recipient);
        if claimed > 0 && is_single_claim_strategy(&strategy) {
            return Err(MinterError::AlreadyClaimed);
        }

        // Load and update state
        let mut state = get_strategy_state(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;
        state.record_mint(amount, get_ledger(e));
        set_strategy_state(e, &state);

        // Record claimed amount
        set_claimed(e, strategy_id, &recipient, claimed + amount);

        // Call token contract to transfer
        call_token_transfer(e, &token, &recipient, amount)?;

        emit_mint(e, strategy_id, &recipient, amount);
        Ok(true)
    }

    /// Batch mints tokens to multiple recipients.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `strategy_id` - The strategy to use
    /// * `recipients` - Who receives tokens
    /// * `amounts` - How many tokens each receives
    ///
    /// # Returns
    ///
    /// Vector of success/failure for each recipient
    pub fn mint_batch(
        e: &Env,
        strategy_id: u32,
        recipients: Vec<Address>,
        amounts: Vec<u128>,
    ) -> Result<Vec<bool>, MinterError> {
        let token = get_token(e).ok_or(MinterError::TokenNotSet)?;
        let strategy = get_strategy_info(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;

        // Check strategy not paused
        if strategy.is_paused {
            return Err(MinterError::StrategyPaused);
        }

        // Validate batch size
        let count = recipients.len() as u32;
        if count == 0 || count > MAX_BATCH_RECIPIENTS {
            return Err(MinterError::InvalidBatchSize);
        }

        // Validate amounts list
        if amounts.len() as u32 != count {
            return Err(MinterError::AmountsMismatch);
        }

        // Authorize based on strategy type
        authorize_mint(e, &strategy, &token)?;

        // Validate batch for this strategy type
        strategy::batch::validate_batch_mint(e, &strategy, count, &amounts)?;

        // Calculate total amount
        let mut total_amount = 0u128;
        for i in 0..count {
            let amount = amounts.get(i).unwrap();
            total_amount = total_amount
                .checked_add(amount)
                .ok_or(MinterError::CapExceeded)?;
        }

        // Update state once for entire batch
        let mut state = get_strategy_state(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;
        state.record_mint(total_amount, get_ledger(e));
        set_strategy_state(e, &state);

        // Mint to each recipient
        let mut results: Vec<bool> = vec![e];
        for i in 0..count {
            let recipient = recipients.get(i).unwrap();
            let amount = amounts.get(i).unwrap();

            // Record claimed
            let claimed = get_claimed(e, strategy_id, &recipient);
            set_claimed(e, strategy_id, &recipient, claimed + amount);

            // Transfer tokens
            match call_token_transfer(e, &token, &recipient, amount) {
                Ok(_) => {
                    results.push_back(true);
                    emit_mint(e, strategy_id, &recipient, amount);
                }
                Err(_) => {
                    results.push_back(false);
                }
            }
        }

        emit_batch_mint(e, strategy_id, count, total_amount);
        Ok(results)
    }

    /// Mints with proof verification (for merkle, custom, etc).
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `strategy_id` - The strategy to use
    /// * `recipient` - Who receives tokens
    /// * `amount` - How many tokens to mint
    /// * `proof` - Proof data (merkle proof, signature, etc)
    ///
    /// # Returns
    ///
    /// `true` if mint was successful
    pub fn mint_with_proof(
        e: &Env,
        strategy_id: u32,
        recipient: Address,
        amount: u128,
        proof: Bytes,
    ) -> Result<bool, MinterError> {
        let token = get_token(e).ok_or(MinterError::TokenNotSet)?;
        let strategy = get_strategy_info(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;

        // Check strategy not paused
        if strategy.is_paused {
            return Err(MinterError::StrategyPaused);
        }

        // Authorize based on strategy type
        authorize_mint(e, &strategy, &token)?;

        // Validate amount
        if amount == 0 {
            return Err(MinterError::InvalidAmount);
        }

        // Validate proof based on strategy type
        match strategy.strategy_type {
            StrategyType::Merkle => {
                strategy::merkle::validate_merkle_proof(e, &strategy, &recipient, amount, &proof)?;
            }
            StrategyType::Custom => {
                strategy::custom::validate_custom_mint(e, &strategy, &recipient, amount, &proof)?;
            }
            _ => {
                return Err(MinterError::InvalidConfig);
            }
        }

        // Check if already claimed
        let claimed = get_claimed(e, strategy_id, &recipient);
        if claimed > 0 {
            return Err(MinterError::AlreadyClaimed);
        }

        // Load and update state
        let mut state = get_strategy_state(e, strategy_id).ok_or(MinterError::StrategyNotFound)?;
        state.record_mint(amount, get_ledger(e));
        set_strategy_state(e, &state);

        // Record claimed amount
        set_claimed(e, strategy_id, &recipient, amount);

        // Call token contract to transfer
        call_token_transfer(e, &token, &recipient, amount)?;

        emit_mint(e, strategy_id, &recipient, amount);
        Ok(true)
    }

    /// Query a strategy's information.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `strategy_id` - The strategy to query
    ///
    /// # Returns
    ///
    /// The strategy information
    pub fn get_strategy(e: &Env, strategy_id: u32) -> Result<StrategyInfo, MinterError> {
        get_strategy_info(e, strategy_id).ok_or(MinterError::StrategyNotFound)
    }

    /// Query a strategy's runtime state.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `strategy_id` - The strategy to query
    ///
    /// # Returns
    ///
    /// The strategy state
    pub fn get_strategy_state(e: &Env, strategy_id: u32) -> Result<StrategyState, MinterError> {
        get_strategy_state(e, strategy_id).ok_or(MinterError::StrategyNotFound)
    }

    /// Get total strategies registered.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    ///
    /// # Returns
    ///
    /// The next strategy ID (total count)
    pub fn total_strategies(e: &Env) -> u32 {
        get_next_strategy_id(e)
    }

    /// Update the token contract address.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `new_token` - The new token address
    ///
    /// # Authorization
    ///
    /// Requires admin authentication.
    pub fn update_token(e: &Env, new_token: Address) -> Result<(), MinterError> {
        let admin = get_admin(e).ok_or(MinterError::AdminNotSet)?;
        admin.require_auth();

        if let Some(old_token) = get_token(e) {
            emit_token_updated(e, &old_token, &new_token);
        }

        set_token(e, &new_token);
        Ok(())
    }

    /// Transfer admin to a new address.
    ///
    /// # Arguments
    ///
    /// * `e` - The environment
    /// * `new_admin` - The new admin address
    ///
    /// # Authorization
    ///
    /// Requires current admin authentication.
    pub fn update_admin(e: &Env, new_admin: Address) -> Result<(), MinterError> {
        let admin = get_admin(e).ok_or(MinterError::AdminNotSet)?;
        admin.require_auth();

        emit_admin_transferred(e, &admin, &new_admin);
        set_admin(e, &new_admin);
        Ok(())
    }
}

// ========== Private helper functions ==========

/// Authorize a mint operation based on strategy type.
fn authorize_mint(e: &Env, strategy: &StrategyInfo, token: &Address) -> Result<(), MinterError> {
    match strategy.authorization {
        StrategyAuthorization::AdminOnly => {
            let admin = get_admin(e).ok_or(MinterError::AdminNotSet)?;
            admin.require_auth();
            Ok(())
        }
        StrategyAuthorization::TokenOnly => {
            // Caller must be the token contract
            let caller = e.current_contract_address();
            if caller != *token {
                return Err(MinterError::AuthFailed);
            }
            Ok(())
        }
        StrategyAuthorization::PublicWithProof | StrategyAuthorization::Public => {
            // Public strategies don't require pre-authorization
            Ok(())
        }
        StrategyAuthorization::Custom => {
            // Custom authorization would be handled by the strategy itself
            Ok(())
        }
    }
}

/// Validate a mint operation based on strategy type.
fn validate_strategy_mint(
    e: &Env,
    strategy: &StrategyInfo,
    recipient: &Address,
    amount: u128,
) -> Result<(), MinterError> {
    match strategy.strategy_type {
        StrategyType::Batch => {
            // For batch validation, use the single-item validation
            let amounts = vec![e, amount];
            strategy::batch::validate_batch_mint(e, strategy, 1, &amounts)?;
            Ok(())
        }
        StrategyType::Merkle => {
            // Merkle requires proof, so this shouldn't be called for merkle
            Err(MinterError::InvalidConfig)
        }
        StrategyType::Allowlist => {
            strategy::allowlist::validate_allowlist_mint(e, strategy, recipient, amount)?;
            Ok(())
        }
        StrategyType::Tiered => {
            // Tiered validation would require querying voting power
            // For now, just check amount is non-zero
            if amount == 0 {
                return Err(MinterError::InvalidAmount);
            }
            Ok(())
        }
        StrategyType::Custom => {
            // Custom validation would be handled externally
            if amount == 0 {
                return Err(MinterError::InvalidAmount);
            }
            Ok(())
        }
    }
}

/// Check if a strategy type only allows single claims per recipient.
fn is_single_claim_strategy(strategy: &StrategyInfo) -> bool {
    matches!(
        strategy.strategy_type,
        StrategyType::Merkle | StrategyType::Allowlist
    )
}

/// Call token contract's transfer method.
fn call_token_transfer(
    e: &Env,
    token: &Address,
    recipient: &Address,
    amount: u128,
) -> Result<(), MinterError> {
    // Call token contract's transfer method
    // For now, we'll attempt an invoke_contract call
    let result: Result<(), soroban_sdk::Error> = e.invoke_contract(
        token,
        &symbol_short!("transfer"),
        vec![
            e,
            recipient.clone().into_val(e),
            (amount as i128).into_val(e),
        ],
    );

    match result {
        Ok(_) => Ok(()),
        Err(_) => Err(MinterError::CrossContractFailed),
    }
}
