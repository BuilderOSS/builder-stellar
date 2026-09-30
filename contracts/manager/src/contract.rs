//! Manager Contract
//!
//! The central hub for the Stellar Builder platform, combining:
//! 1. Implementation Management - Registry of contract implementations
//! 2. DAO Factory - Atomic deployment of new DAOs
//! 3. DAO Registry - Discovery and enumeration of deployed DAOs

use soroban_sdk::{
    contract, contractimpl, vec, Address, BytesN, Env, IntoVal, String, Symbol, Val, Vec,
};

use crate::error::ManagerError;
use crate::events::*;
use crate::storage::*;

/// Manager contract structure.
#[contract]
pub struct ManagerContract;

// ============================================================================
// Constants
// ============================================================================

/// Maximum string length for names, symbols, URIs (prevent DoS)
const MAX_STRING_LENGTH: u32 = 256;

/// Maximum number of founders per DAO
const MAX_FOUNDERS: u32 = 10;

/// Maximum basis points (100%)
const MAX_BPS: u32 = 10000;
const MAX_FOUNDER_ALLOCATION: u32 = 10_000;
const MIN_AUCTION_DURATION: u64 = 300;
const MIN_RESERVE_PRICE: i128 = 1_000;
const MIN_GOVERNANCE_DELAY: u64 = 300;

#[contractimpl]
impl ManagerContract {
    // ========================================================================
    // Initialization
    // ========================================================================

    /// Initialize the Manager contract with an admin.
    ///
    /// # Arguments
    ///
    /// * `admin` - The address that will control implementation management and factory settings
    pub fn __constructor(env: Env, admin: Address) {
        set_admin(&env, &admin);
        set_factory_paused(&env, false);
    }

    // ========================================================================
    // Implementation Management
    // ========================================================================

    /// Register a new implementation version.
    ///
    /// # Authorization
    ///
    /// Only callable by admin.
    ///
    /// # Arguments
    ///
    /// * `name` - Implementation name (e.g., "Token", "Governor")
    /// * `version` - Version number (must be > 0)
    /// * `wasm_hash` - WASM bytecode hash
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not admin
    /// * `InvalidImplementationName` - Name is empty or too long
    /// * `InvalidVersion` - Version is 0
    pub fn register_implementation(
        env: Env,
        name: String,
        version: u32,
        wasm_hash: BytesN<32>,
    ) -> Result<(), ManagerError> {
        // Check authorization
        Self::require_admin(&env)?;

        // Validate inputs
        Self::validate_string(&name)?;
        if version == 0 {
            return Err(ManagerError::InvalidVersion);
        }

        // Create implementation record
        let implementation = ImplementationVersion {
            name: name.clone(),
            version,
            wasm_hash: wasm_hash.clone(),
            published_at: env.ledger().sequence() as u64,
            revoked: false,
        };

        // Store implementation
        env.storage().instance().set(
            &ManagerKey::Implementation(wasm_hash.clone()),
            &implementation,
        );

        // Update latest version for this name
        env.storage()
            .instance()
            .set(&ManagerKey::LatestImplementation(name.clone()), &wasm_hash);

        // Emit event
        emit_implementation_registered(
            &env,
            &name,
            version,
            &wasm_hash,
            implementation.published_at,
        );

        Ok(())
    }

    /// Approve an upgrade path from one implementation to another.
    ///
    /// # Authorization
    ///
    /// Only callable by admin.
    ///
    /// # Arguments
    ///
    /// * `from_hash` - Source WASM hash
    /// * `to_hash` - Target WASM hash
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not admin
    /// * `InvalidUpgradePath` - One or both implementations don't exist or are revoked
    pub fn approve_upgrade(
        env: Env,
        from_hash: BytesN<32>,
        to_hash: BytesN<32>,
    ) -> Result<(), ManagerError> {
        // Check authorization
        Self::require_admin(&env)?;

        // Validate both implementations exist and are not revoked
        let from_impl: ImplementationVersion = env
            .storage()
            .instance()
            .get(&ManagerKey::Implementation(from_hash.clone()))
            .ok_or(ManagerError::ImplementationNotFound)?;

        let to_impl: ImplementationVersion = env
            .storage()
            .instance()
            .get(&ManagerKey::Implementation(to_hash.clone()))
            .ok_or(ManagerError::ImplementationNotFound)?;

        if from_impl.revoked || to_impl.revoked {
            return Err(ManagerError::InvalidUpgradePath);
        }

        // Create approval record
        let approval = UpgradeApproval {
            from_hash: from_hash.clone(),
            to_hash: to_hash.clone(),
            approved_at: env.ledger().sequence() as u64,
        };

        // Store approval
        env.storage().instance().set(
            &ManagerKey::UpgradeApproval(from_hash.clone(), to_hash.clone()),
            &approval,
        );

        // Emit event
        emit_upgrade_approved(&env, &from_hash, &to_hash, approval.approved_at);

        Ok(())
    }

    /// Revoke an implementation (emergency measure).
    ///
    /// # Authorization
    ///
    /// Only callable by admin.
    ///
    /// # Arguments
    ///
    /// * `wasm_hash` - WASM hash to revoke
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not admin
    /// * `ImplementationNotFound` - Implementation doesn't exist
    /// * `ImplementationAlreadyRevoked` - Implementation already revoked
    pub fn revoke_implementation(env: Env, wasm_hash: BytesN<32>) -> Result<(), ManagerError> {
        // Check authorization
        Self::require_admin(&env)?;

        // Get implementation
        let mut implementation: ImplementationVersion = env
            .storage()
            .instance()
            .get(&ManagerKey::Implementation(wasm_hash.clone()))
            .ok_or(ManagerError::ImplementationNotFound)?;

        // Check if already revoked
        if implementation.revoked {
            return Err(ManagerError::ImplementationAlreadyRevoked);
        }

        // Mark as revoked
        implementation.revoked = true;

        // Update storage
        env.storage().instance().set(
            &ManagerKey::Implementation(wasm_hash.clone()),
            &implementation,
        );

        // Emit event
        let revoked_at = env.ledger().sequence() as u64;
        emit_implementation_revoked(&env, &wasm_hash, revoked_at);

        Ok(())
    }

    /// Check if an upgrade is approved.
    ///
    /// # Arguments
    ///
    /// * `from_hash` - Source WASM hash
    /// * `to_hash` - Target WASM hash
    ///
    /// # Returns
    ///
    /// `true` if upgrade is approved and neither implementation is revoked.
    pub fn is_upgrade_approved(env: Env, from_hash: BytesN<32>, to_hash: BytesN<32>) -> bool {
        // Check if approval exists
        let approval_exists: bool = env
            .storage()
            .instance()
            .get::<ManagerKey, UpgradeApproval>(&ManagerKey::UpgradeApproval(
                from_hash.clone(),
                to_hash.clone(),
            ))
            .is_some();

        if !approval_exists {
            return false;
        }

        // Check both implementations exist and are not revoked
        let from_impl: Option<ImplementationVersion> = env
            .storage()
            .instance()
            .get(&ManagerKey::Implementation(from_hash));

        let to_impl: Option<ImplementationVersion> = env
            .storage()
            .instance()
            .get(&ManagerKey::Implementation(to_hash));

        match (from_impl, to_impl) {
            (Some(from), Some(to)) => !from.revoked && !to.revoked,
            _ => false,
        }
    }

    /// Get latest version of an implementation by name.
    ///
    /// # Arguments
    ///
    /// * `name` - Implementation name
    ///
    /// # Returns
    ///
    /// The latest implementation version, or `None` if not found.
    pub fn get_latest_implementation(env: Env, name: String) -> Option<ImplementationVersion> {
        let wasm_hash: Option<BytesN<32>> = env
            .storage()
            .instance()
            .get(&ManagerKey::LatestImplementation(name));

        wasm_hash.and_then(|hash| {
            env.storage()
                .instance()
                .get::<ManagerKey, ImplementationVersion>(&ManagerKey::Implementation(hash))
                .filter(|implementation| !implementation.revoked)
        })
    }

    /// Get implementation by WASM hash.
    ///
    /// # Arguments
    ///
    /// * `wasm_hash` - WASM hash to query
    ///
    /// # Returns
    ///
    /// The implementation version, or `None` if not found.
    pub fn get_implementation(env: Env, wasm_hash: BytesN<32>) -> Option<ImplementationVersion> {
        env.storage()
            .instance()
            .get(&ManagerKey::Implementation(wasm_hash))
    }

    /// Set the current implementation WASM hashes used by the factory.
    ///
    /// # Authorization
    ///
    /// Only callable by admin.
    ///
    /// # Arguments
    ///
    /// * `token` - Token implementation WASM hash
    /// * `metadata` - Metadata implementation WASM hash
    /// * `auction` - Auction implementation WASM hash (TODO: needs implementation)
    /// * `governor` - Governor implementation WASM hash (TODO: needs implementation)
    /// * `treasury` - Treasury implementation WASM hash (TODO: needs implementation)
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not admin
    /// * `ImplementationNotFound` - One or more implementations don't exist
    pub fn set_current_implementations(
        env: Env,
        token: BytesN<32>,
        metadata: BytesN<32>,
        auction: BytesN<32>,
        governor: BytesN<32>,
        treasury: BytesN<32>,
        marketplace: BytesN<32>,
    ) -> Result<(), ManagerError> {
        // Check authorization
        Self::require_admin(&env)?;

        for hash in [
            &token,
            &metadata,
            &auction,
            &governor,
            &treasury,
            &marketplace,
        ] {
            let implementation: ImplementationVersion = env
                .storage()
                .instance()
                .get(&ManagerKey::Implementation(hash.clone()))
                .ok_or(ManagerError::ImplementationNotFound)?;
            if implementation.revoked {
                return Err(ManagerError::ImplementationNotFound);
            }
        }

        env.storage()
            .instance()
            .set(&ManagerKey::CurrentTokenWasm, &token);
        env.storage()
            .instance()
            .set(&ManagerKey::CurrentMetadataWasm, &metadata);
        env.storage()
            .instance()
            .set(&ManagerKey::CurrentAuctionWasm, &auction);
        env.storage()
            .instance()
            .set(&ManagerKey::CurrentGovernorWasm, &governor);
        env.storage()
            .instance()
            .set(&ManagerKey::CurrentTreasuryWasm, &treasury);
        env.storage()
            .instance()
            .set(&ManagerKey::CurrentMarketplaceWasm, &marketplace);

        emit_current_implementations_updated(
            &env,
            &token,
            &metadata,
            &auction,
            &governor,
            &treasury,
            &marketplace,
        );

        Ok(())
    }

    // ========================================================================
    // Factory Pause/Unpause
    // ========================================================================

    /// Pause the factory (emergency measure).
    ///
    /// # Authorization
    ///
    /// Only callable by admin.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not admin
    pub fn pause_factory(env: Env) -> Result<(), ManagerError> {
        Self::require_admin(&env)?;
        set_factory_paused(&env, true);
        emit_factory_paused(&env);
        Ok(())
    }

    /// Unpause the factory.
    ///
    /// # Authorization
    ///
    /// Only callable by admin.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not admin
    pub fn unpause_factory(env: Env) -> Result<(), ManagerError> {
        Self::require_admin(&env)?;
        set_factory_paused(&env, false);
        emit_factory_unpaused(&env);
        Ok(())
    }

    // ========================================================================
    // DAO Factory
    // ========================================================================

    /// Create a new DAO with all 6 modules atomically deployed.
    ///
    /// This is the main factory function that:
    /// 1. Validates all parameters
    /// 2. Checks factory not paused and nonce not used
    /// 3. Deploys all 6 contracts (Token, Metadata, Auction, Governor, Treasury, Marketplace)
    /// 4. Initializes them with proper cross-references
    /// 5. Sets up launch configuration and module relationships
    /// 6. Registers the DAO in the registry
    ///
    /// # Arguments
    ///
    /// * `params` - Complete DAO creation parameters
    ///
    /// # Returns
    ///
    /// All deployed contract addresses
    ///
    /// # Errors
    ///
    /// * `FactoryPaused` - Factory is paused
    /// * `NonceAlreadyUsed` - This (creator, nonce) pair was already used
    /// * `CurrentImplementationsNotSet` - Current WASM hashes not configured
    /// * `InvalidParamBounds` - Invalid parameter values
    /// * Various validation errors from `validate_dao_params`
    pub fn create_dao(env: Env, params: DaoCreationParams) -> Result<DaoAddresses, ManagerError> {
        // The deployer owns the newly-created modules and must authorize the
        // factory operation and subsequent owner-gated setup calls.
        params.deployer.require_auth();

        // Check factory not paused
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }

        // Validate parameters
        Self::validate_dao_params(&params)?;

        // Check nonce not already used
        // Get current implementation WASM hashes
        let token_wasm: BytesN<32> = env
            .storage()
            .instance()
            .get(&ManagerKey::CurrentTokenWasm)
            .ok_or(ManagerError::CurrentImplementationsNotSet)?;

        let metadata_wasm: BytesN<32> = env
            .storage()
            .instance()
            .get(&ManagerKey::CurrentMetadataWasm)
            .ok_or(ManagerError::CurrentImplementationsNotSet)?;

        let auction_wasm: BytesN<32> = env
            .storage()
            .instance()
            .get(&ManagerKey::CurrentAuctionWasm)
            .ok_or(ManagerError::CurrentImplementationsNotSet)?;

        let governor_wasm: BytesN<32> = env
            .storage()
            .instance()
            .get(&ManagerKey::CurrentGovernorWasm)
            .ok_or(ManagerError::CurrentImplementationsNotSet)?;

        let treasury_wasm: BytesN<32> = env
            .storage()
            .instance()
            .get(&ManagerKey::CurrentTreasuryWasm)
            .ok_or(ManagerError::CurrentImplementationsNotSet)?;
        let marketplace_wasm: BytesN<32> = env
            .storage()
            .instance()
            .get(&ManagerKey::CurrentMarketplaceWasm)
            .ok_or(ManagerError::CurrentImplementationsNotSet)?;

        for hash in [
            token_wasm.clone(),
            metadata_wasm.clone(),
            auction_wasm.clone(),
            governor_wasm.clone(),
            treasury_wasm.clone(),
            marketplace_wasm.clone(),
        ] {
            let implementation: ImplementationVersion = env
                .storage()
                .instance()
                .get(&ManagerKey::Implementation(hash))
                .ok_or(ManagerError::ImplementationNotFound)?;
            if implementation.revoked {
                return Err(ManagerError::ImplementationNotFound);
            }
        }

        // Generate deterministic salts
        let token_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "token");
        let metadata_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "metadata");
        let auction_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "auction");
        let governor_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "governor");
        let treasury_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "treasury");
        let marketplace_salt =
            Self::generate_salt(&env, &params.deployer, params.nonce, "marketplace");

        // Deploy contracts using deploy_v2 which handles constructor initialization atomically.
        // Deployment order matters due to circular dependencies between contracts.
        // We use predict_addresses internally to pass addresses before deployment.

        // First, predict all addresses so we can pass them to constructors
        let token_deployer = env.deployer().with_current_contract(token_salt);
        let token_addr = token_deployer.deployed_address();

        let metadata_deployer = env.deployer().with_current_contract(metadata_salt);
        let metadata_addr = metadata_deployer.deployed_address();

        let treasury_deployer = env.deployer().with_current_contract(treasury_salt);
        let treasury_addr = treasury_deployer.deployed_address();

        let governor_deployer = env.deployer().with_current_contract(governor_salt);
        let governor_addr = governor_deployer.deployed_address();

        let auction_deployer = env.deployer().with_current_contract(auction_salt);
        let auction_addr = auction_deployer.deployed_address();
        let marketplace_deployer = env.deployer().with_current_contract(marketplace_salt);
        let marketplace_addr = marketplace_deployer.deployed_address();

        // Step 1: Deploy and initialize Treasury (needs owner and governor)
        treasury_deployer.deploy_v2(
            treasury_wasm.clone(),
            (
                params.launch_admin.clone(),
                governor_addr.clone(),
                env.current_contract_address(),
                treasury_wasm.clone(),
            ),
        );

        // Step 2: Deploy and initialize Token. The manager owns the token during
        // creation so it can hand ownership to the launch administrator before
        // the launch configuration is completed.
        token_deployer.deploy_v2(
            token_wasm.clone(),
            (
                env.current_contract_address(),
                params.token_uri.clone(),
                params.token_name.clone(),
                params.token_symbol.clone(),
                metadata_addr.clone(),
                env.current_contract_address(),
                token_wasm.clone(),
            ),
        );

        // Step 3: Deploy Metadata (no constructor - we'll call initialize separately)
        metadata_deployer.deploy_v2(metadata_wasm.clone(), ());

        // Step 4: Deploy and initialize Governor
        // Governor constructor needs: owner, token, treasury, voting_delay, voting_period,
        // queue_delay (not in params - using voting_delay), proposal_threshold (needs conversion), quorum_bps
        let queue_delay = params.voting_delay; // Using same as voting_delay for now
        let founder_supply: u32 = params
            .founders
            .iter()
            .try_fold(0u32, |total, founder| total.checked_add(founder.amount))
            .ok_or(ManagerError::FounderAllocationTooLarge)?;
        let proposal_threshold = (founder_supply as u128)
            .checked_mul(params.proposal_threshold_bps as u128)
            .and_then(|value| value.checked_div(MAX_BPS as u128))
            .ok_or(ManagerError::FounderAllocationTooLarge)?;
        let proposal_threshold = if params.proposal_threshold_bps > 0 && proposal_threshold == 0 {
            1
        } else {
            proposal_threshold
        };

        governor_deployer.deploy_v2(
            governor_wasm.clone(),
            (
                params.launch_admin.clone(),
                token_addr.clone(),
                treasury_addr.clone(),
                params.voting_delay as u32,
                params.voting_period as u32,
                queue_delay as u32,
                proposal_threshold,
                params.quorum_bps,
                env.current_contract_address(),
                governor_wasm.clone(),
            ),
        );

        // Step 5: Deploy and initialize Auction
        // Auction constructor needs: owner, token, treasury, duration, reserve_price,
        // min_bid_increment_percent (using quorum_bps for now), time_buffer, payment_token
        let min_bid_increment = 10u32; // 10% default

        auction_deployer.deploy_v2(
            auction_wasm.clone(),
            (
                params.launch_admin.clone(),
                token_addr.clone(),
                treasury_addr.clone(),
                params.auction_duration,
                params.reserve_price,
                min_bid_increment,
                params.time_buffer,
                params.payment_asset.clone(),
                env.current_contract_address(),
                auction_wasm.clone(),
            ),
        );

        // Marketplace is deployed paused and receives mint authority at finalization.
        marketplace_deployer.deploy_v2(
            marketplace_wasm.clone(),
            (
                token_addr.clone(),
                treasury_addr.clone(),
                params.payment_asset.clone(),
                env.current_contract_address(),
                marketplace_wasm,
                String::from_str(&env, "0.1.0"),
            ),
        );

        // Step 6: Initialize Metadata contract without artwork properties.
        // launch_admin adds them after creation to keep this transaction within
        // Soroban resource limits.
        let empty_property_names: Vec<String> = Vec::new(&env);
        let empty_items: Vec<Val> = Vec::new(&env);
        // Using invoke_contract directly since we don't have a Client import
        let _: () = env.invoke_contract(
            &metadata_addr,
            &Symbol::new(&env, "initialize"),
            vec![
                &env,
                token_addr.clone().into_val(&env),
                params.project_uri.clone().into_val(&env),
                params.description.clone().into_val(&env),
                params.contract_image.clone().into_val(&env),
                params.renderer_base.clone().into_val(&env),
                env.current_contract_address().into_val(&env),
                metadata_wasm.clone().into_val(&env),
                params.launch_admin.clone().into_val(&env),
                empty_property_names.into_val(&env),
                empty_items.into_val(&env),
                params.artwork_ipfs.clone().into_val(&env),
            ],
        );

        // The manager owns the token during creation. Leave a pending transfer
        // for launch_admin to accept after metadata properties are configured.
        let _: () = env.invoke_contract(
            &token_addr,
            &Symbol::new(&env, "transfer_ownership"),
            vec![
                &env,
                params.launch_admin.clone().into_val(&env),
                (env.ledger().sequence() + 100_000).into_val(&env),
            ],
        );

        // Create DAO addresses
        let addresses = DaoAddresses {
            token: token_addr.clone(),
            metadata: metadata_addr.clone(),
            auction: auction_addr.clone(),
            governor: governor_addr.clone(),
            treasury: treasury_addr.clone(),
            marketplace: marketplace_addr.clone(),
        };

        let pending = PendingDao {
            addresses: addresses.clone(),
            creator: params.deployer.clone(),
            launch_admin: params.launch_admin.clone(),
            founder_supply,
        };
        env.storage()
            .instance()
            .set(&ManagerKey::PendingDao(token_addr.clone()), &pending);

        let modules = DaoModules {
            token: token_addr.clone(),
            metadata: metadata_addr.clone(),
            auction: auction_addr.clone(),
            governor: governor_addr.clone(),
            treasury: treasury_addr.clone(),
            marketplace: marketplace_addr,
        };

        // Emit events
        emit_dao_created(
            &env,
            &token_addr,
            &params.deployer,
            env.ledger().sequence(),
            &modules,
            &params.founders,
        );

        Ok(addresses)
    }

    /// Closes the launch-admin setup window and hands module ownership to the
    /// Treasury. All configuration remains editable by launch_admin until this
    /// one-way transition is executed. When `launch_auction` is false, the
    /// Auction module remains paused and does not receive mint authority.
    pub fn finalize_dao(
        env: Env,
        token_address: Address,
        launch_auction: bool,
    ) -> Result<(), ManagerError> {
        let pending: PendingDao = env
            .storage()
            .instance()
            .get(&ManagerKey::PendingDao(token_address.clone()))
            .ok_or(ManagerError::DaoNotFound)?;
        pending.launch_admin.require_auth();

        let token_owner: Address = env.invoke_contract(
            &pending.addresses.token,
            &Symbol::new(&env, "get_owner"),
            Vec::new(&env),
        );
        if token_owner != pending.launch_admin {
            return Err(ManagerError::InvalidParamBounds);
        }
        let total_supply: u32 = env.invoke_contract(
            &pending.addresses.token,
            &Symbol::new(&env, "get_total_supply"),
            Vec::new(&env),
        );
        if total_supply != pending.founder_supply {
            return Err(ManagerError::InvalidParamBounds);
        }

        let treasury = pending.addresses.treasury.clone();

        let auction_paused: bool = env.invoke_contract(
            &pending.addresses.auction,
            &Symbol::new(&env, "paused"),
            Vec::new(&env),
        );
        if !launch_auction && !auction_paused {
            return Err(ManagerError::AuctionMustBePaused);
        }

        // Treasury, Marketplace, and optionally Auction are all primary-sale minters.
        let _: () = env.invoke_contract(
            &pending.addresses.token,
            &Symbol::new(&env, "enable_mint_authority_by_manager"),
            vec![&env, pending.addresses.treasury.clone().into_val(&env)],
        );
        let _: () = env.invoke_contract(
            &pending.addresses.token,
            &Symbol::new(&env, "enable_mint_authority_by_manager"),
            vec![&env, pending.addresses.marketplace.clone().into_val(&env)],
        );
        if launch_auction {
            let _: () = env.invoke_contract(
                &pending.addresses.token,
                &Symbol::new(&env, "enable_mint_authority_by_manager"),
                vec![&env, pending.addresses.auction.clone().into_val(&env)],
            );
        }
        let _: () = env.invoke_contract(
            &pending.addresses.token,
            &Symbol::new(&env, "enable_mint_authority_by_manager"),
            vec![&env, pending.addresses.marketplace.clone().into_val(&env)],
        );
        for (module, method) in [
            (pending.addresses.token.clone(), "finalize_ownership"),
            (pending.addresses.governor.clone(), "finalize_ownership"),
            (pending.addresses.treasury.clone(), "finalize_ownership"),
            (pending.addresses.marketplace.clone(), "finalize_ownership"),
        ] {
            let _: () = env.invoke_contract(
                &module,
                &Symbol::new(&env, method),
                vec![&env, treasury.clone().into_val(&env)],
            );
        }
        let _: () = env.invoke_contract(
            &pending.addresses.auction,
            &Symbol::new(&env, "finalize_ownership"),
            vec![
                &env,
                treasury.clone().into_val(&env),
                launch_auction.into_val(&env),
            ],
        );
        let _: () = env.invoke_contract(
            &pending.addresses.metadata,
            &Symbol::new(&env, "finalize_upgrade_authority"),
            vec![&env, treasury.clone().into_val(&env)],
        );
        env.storage()
            .instance()
            .remove(&ManagerKey::PendingDao(token_address.clone()));
        let modules = DaoModules {
            token: pending.addresses.token.clone(),
            metadata: pending.addresses.metadata.clone(),
            auction: pending.addresses.auction.clone(),
            governor: pending.addresses.governor.clone(),
            treasury: pending.addresses.treasury.clone(),
            marketplace: pending.addresses.marketplace.clone(),
        };
        emit_dao_finalized(
            &env,
            &token_address,
            env.ledger().sequence(),
            &modules,
            launch_auction,
        );
        Ok(())
    }

    pub fn get_pending_dao(env: Env, token_address: Address) -> Option<PendingDao> {
        env.storage()
            .instance()
            .get(&ManagerKey::PendingDao(token_address))
    }

    pub fn get_dao_creation(env: Env, token_address: Address) -> Option<PendingDao> {
        Self::get_pending_dao(env, token_address)
    }

    /// Predict DAO addresses without deploying.
    ///
    /// Useful for frontends to show addresses before user confirms deployment.
    ///
    /// # Arguments
    ///
    /// * `creator` - Creator address
    /// * `nonce` - Nonce value
    ///
    /// # Returns
    ///
    /// Predicted addresses for all 6 modules
    pub fn predict_addresses(
        env: Env,
        creator: Address,
        nonce: u64,
    ) -> Result<DaoAddresses, ManagerError> {
        // Generate deterministic salts
        let token_salt = Self::generate_salt(&env, &creator, nonce, "token");
        let metadata_salt = Self::generate_salt(&env, &creator, nonce, "metadata");
        let auction_salt = Self::generate_salt(&env, &creator, nonce, "auction");
        let governor_salt = Self::generate_salt(&env, &creator, nonce, "governor");
        let treasury_salt = Self::generate_salt(&env, &creator, nonce, "treasury");
        let marketplace_salt = Self::generate_salt(&env, &creator, nonce, "marketplace");

        // Predict addresses using deployer
        let deployer = env.deployer().with_current_contract(token_salt);
        let token_addr = deployer.deployed_address();

        let deployer = env.deployer().with_current_contract(metadata_salt);
        let metadata_addr = deployer.deployed_address();

        let deployer = env.deployer().with_current_contract(auction_salt);
        let auction_addr = deployer.deployed_address();

        let deployer = env.deployer().with_current_contract(governor_salt);
        let governor_addr = deployer.deployed_address();

        let deployer = env.deployer().with_current_contract(treasury_salt);
        let treasury_addr = deployer.deployed_address();
        let deployer = env.deployer().with_current_contract(marketplace_salt);
        let marketplace_addr = deployer.deployed_address();

        Ok(DaoAddresses {
            token: token_addr,
            metadata: metadata_addr,
            auction: auction_addr,
            governor: governor_addr,
            treasury: treasury_addr,
            marketplace: marketplace_addr,
        })
    }

    // ========================================================================
    // Helper Functions
    // ========================================================================

    /// Require caller to be admin.
    fn require_admin(env: &Env) -> Result<(), ManagerError> {
        let admin = get_admin(env).ok_or(ManagerError::AdminNotSet)?;
        admin.require_auth();
        Ok(())
    }

    /// Generate deterministic salt for contract deployment.
    ///
    /// Combines nonce and module name to create a unique salt.
    /// Note: Simplified version - in production should also include creator address
    fn generate_salt(env: &Env, creator: &Address, nonce: u64, module: &str) -> BytesN<32> {
        let mut bytes_to_hash = soroban_sdk::Bytes::new(env);

        // Include the creator so the same nonce can be used independently by
        // different deployers.
        bytes_to_hash.append(&creator.to_string().to_bytes());

        // Add nonce
        bytes_to_hash.append(&soroban_sdk::Bytes::from_array(env, &nonce.to_be_bytes()));

        // Add module name
        bytes_to_hash.append(&soroban_sdk::Bytes::from_slice(env, module.as_bytes()));

        // Hash to create salt and convert to BytesN<32>
        let hash = env.crypto().keccak256(&bytes_to_hash);
        BytesN::from_array(env, &hash.to_array())
    }

    /// Validate string length.
    fn validate_string(s: &String) -> Result<(), ManagerError> {
        let len = s.len();
        if len == 0 {
            return Err(ManagerError::StringEmpty);
        }
        if len > MAX_STRING_LENGTH {
            return Err(ManagerError::StringTooLong);
        }
        Ok(())
    }

    /// Validate DAO creation parameters.
    fn validate_dao_params(params: &DaoCreationParams) -> Result<(), ManagerError> {
        // Validate strings
        Self::validate_string(&params.token_name)?;
        Self::validate_string(&params.token_symbol)?;
        Self::validate_string(&params.token_uri)?;
        Self::validate_string(&params.project_uri)?;
        Self::validate_string(&params.description)?;
        Self::validate_string(&params.contract_image)?;
        Self::validate_string(&params.renderer_base)?;

        // Validate founders
        if params.founders.len() > MAX_FOUNDERS {
            return Err(ManagerError::InvalidParamBounds);
        }

        for founder in params.founders.iter() {
            if founder.amount == 0 {
                return Err(ManagerError::InvalidFounderPercentage);
            }
        }

        // Validate governance params
        if params.quorum_bps > MAX_BPS {
            return Err(ManagerError::InvalidQuorumBps);
        }

        if params.proposal_threshold_bps > MAX_BPS {
            return Err(ManagerError::InvalidProposalThresholdBps);
        }

        if params.voting_delay < MIN_GOVERNANCE_DELAY
            || params.voting_period < MIN_GOVERNANCE_DELAY
            || params.voting_delay > u32::MAX as u64
            || params.voting_period > u32::MAX as u64
        {
            return Err(ManagerError::InvalidGovernanceTiming);
        }

        let founder_total = params
            .founders
            .iter()
            .try_fold(0u32, |total, founder| total.checked_add(founder.amount));
        if founder_total.is_none() || founder_total.unwrap() > MAX_FOUNDER_ALLOCATION {
            return Err(ManagerError::FounderAllocationTooLarge);
        }

        // Validate auction params
        if params.auction_duration < MIN_AUCTION_DURATION {
            return Err(ManagerError::InvalidDuration);
        }

        if params.reserve_price < MIN_RESERVE_PRICE {
            return Err(ManagerError::InvalidParamBounds);
        }

        if params.time_buffer == 0 {
            return Err(ManagerError::InvalidTimeBuffer);
        }

        Ok(())
    }
}
