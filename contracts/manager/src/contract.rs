//! Manager Contract
//!
//! The central hub for the Stellar Builder platform, combining:
//! 1. Implementation Management - Registry of contract implementations
//! 2. DAO Factory - Atomic deployment of new DAOs
//! 3. DAO Lifecycle - Deployment and launch handoff

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

/// Maximum string length for implementation names.
const MAX_STRING_LENGTH: u32 = 256;
const MIN_AUCTION_DURATION: u64 = 300;
const MIN_RESERVE_PRICE: i128 = 1_000;
const MIN_GOVERNANCE_DELAY: u64 = 300;
const DEFAULT_TIME_BUFFER: u64 = 60;
const DEFAULT_QUORUM_BPS: u32 = 1;
const MAX_BPS: u32 = 10_000;
const DEFAULT_QUEUE_DELAY: u32 = 300;
const DEFAULT_VOTING_PERIOD: u32 = 600;
const DEFAULT_SECONDARY_FEE_BPS: u32 = 250;

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
    /// * `version` - Version string (e.g., "0.1.0")
    /// * `wasm_hash` - WASM bytecode hash
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not admin
    /// * `InvalidImplementationName` - Name is empty or too long
    /// * `InvalidVersion` - Version is empty or too long
    pub fn register_implementation(
        env: Env,
        name: String,
        version: String,
        wasm_hash: BytesN<32>,
    ) -> Result<(), ManagerError> {
        // Check authorization
        Self::require_admin(&env)?;

        // Validate inputs
        Self::validate_string(&name)?;
        Self::validate_string(&version)?;

        // Create implementation record
        let implementation = ImplementationVersion {
            name: name.clone(),
            version: version.clone(),
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
            &version,
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
    /// This deploys all six modules with safe defaults. The launch administrator
    /// owns the setup window and may configure the modules before `launch_dao`.
    ///
    /// # Arguments
    ///
    /// * `params` - Deployer, deterministic nonce, and launch administrator
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
    pub fn create_dao(env: Env, params: DaoCreationParams) -> Result<DaoAddresses, ManagerError> {
        // The deployer owns the newly-created modules and must authorize the
        // factory operation and subsequent owner-gated setup calls.
        params.deployer.require_auth();

        // Check factory not paused
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }

        // Validate and extract configuration
        Self::validate_initial_config(&params.initial_config)?;
        let (
            token_name,
            token_symbol,
            token_uri,
            project_uri,
            description,
            contract_image,
            renderer_base,
            governance,
            auction_duration,
            reserve_price,
            time_buffer,
            payment_asset,
            marketplace_payment_asset,
            marketplace_fee_bps,
        ) = (
            params.initial_config.token_name.clone(),
            params.initial_config.token_symbol.clone(),
            params.initial_config.token_uri.clone(),
            params.initial_config.project_uri.clone(),
            params.initial_config.description.clone(),
            params.initial_config.contract_image.clone(),
            params.initial_config.renderer_base.clone(),
            params.initial_config.governance.clone(),
            params.initial_config.auction.duration,
            params.initial_config.auction.reserve_price,
            params.initial_config.auction.time_buffer,
            params.initial_config.auction.payment_asset.clone(),
            params.initial_config.marketplace.payment_asset.clone(),
            params.initial_config.marketplace.secondary_fee_bps,
        );

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
                String::from_str(&env, "0.1.0"),
            ),
        );

        // Step 2: Deploy and initialize Token with launch_admin as owner.
        // The launch_admin configures the token, governance, and auction before launch.
        token_deployer.deploy_v2(
            token_wasm.clone(),
            (
                params.launch_admin.clone(),
                token_uri,
                token_name,
                token_symbol,
                metadata_addr.clone(),
                env.current_contract_address(),
                token_wasm.clone(),
                String::from_str(&env, "0.1.0"),
            ),
        );

        // Step 3: Deploy Metadata (no constructor - we'll call initialize separately)
        metadata_deployer.deploy_v2(metadata_wasm.clone(), ());

        // Step 4: Deploy and initialize Governor
        // Governor starts with minimum valid timing and permissive thresholds;
        // launch_admin may replace them before launch.
        governor_deployer.deploy_v2(
            governor_wasm.clone(),
            (
                params.launch_admin.clone(),
                token_addr.clone(),
                treasury_addr.clone(),
                governance.voting_delay,
                governance.voting_period,
                governance.queue_delay,
                governance.proposal_threshold,
                governance.quorum_bps,
                env.current_contract_address(),
                governor_wasm.clone(),
                String::from_str(&env, "0.1.0"),
            ),
        );

        // Step 5: Deploy and initialize Auction
        // Auction starts with safe defaults and uses launch_admin as a temporary
        // payment address until it is configured before launch.
        let min_bid_increment = 10u32; // 10% default

        auction_deployer.deploy_v2(
            auction_wasm.clone(),
            (
                params.launch_admin.clone(),
                token_addr.clone(),
                treasury_addr.clone(),
                auction_duration,
                reserve_price,
                min_bid_increment,
                time_buffer,
                payment_asset,
                env.current_contract_address(),
                auction_wasm.clone(),
                String::from_str(&env, "0.1.0"),
            ),
        );

        // Marketplace is deployed paused and receives mint authority at finalization.
        marketplace_deployer.deploy_v2(
            marketplace_wasm.clone(),
            (
                token_addr.clone(),
                params.launch_admin.clone(),
                marketplace_payment_asset,
                env.current_contract_address(),
                marketplace_wasm,
                String::from_str(&env, "0.1.0"),
                marketplace_fee_bps,
            ),
        );

        // Initialize Metadata with empty values. The launch administrator can
        // replace the settings and add artwork before launch.
        let empty_property_names: Vec<String> = Vec::new(&env);
        let empty_items: Vec<Val> = Vec::new(&env);
        // Using invoke_contract directly since we don't have a Client import
        let _: () = env.invoke_contract(
            &metadata_addr,
            &Symbol::new(&env, "initialize"),
            vec![
                &env,
                token_addr.clone().into_val(&env),
                project_uri.into_val(&env),
                description.into_val(&env),
                contract_image.into_val(&env),
                renderer_base.into_val(&env),
                env.current_contract_address().into_val(&env),
                metadata_wasm.clone().into_val(&env),
                params.launch_admin.clone().into_val(&env),
                empty_property_names.into_val(&env),
                empty_items.into_val(&env),
                ArtworkIpfsGroup {
                    base_uri: String::from_str(&env, ""),
                    extension: String::from_str(&env, ""),
                }
                .into_val(&env),
                String::from_str(&env, "0.1.0").into_val(&env),
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
            launch_admin: params.launch_admin.clone(),
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
            env.ledger().sequence() as u64,
            &modules,
        );

        Ok(addresses)
    }

    /// Launch a configured DAO.
    ///
    /// # Authorization
    ///
    /// Only callable by the launch_admin who created the DAO.
    ///
    /// # Arguments
    ///
    /// * `token_address` - Address of the DAO's token contract
    /// * `launch_config` - Configuration for what to enable at launch
    ///   - `launch_auction` - Whether to unpause the auction
    ///   - `launch_marketplace` - Whether to unpause the marketplace
    ///
    /// # Validation
    ///
    /// - Token total supply must be > 0 (at least one token minted)
    /// - launch_admin must be the current token owner
    ///
    /// # Effects
    ///
    /// 1. Validates launch preconditions
    /// 2. Grants Treasury and Marketplace mint authority over tokens
    /// 3. Optionally grants Auction mint authority if launch_auction is true
    /// 4. Transfers Token, Governor, Treasury, Marketplace, and Auction ownership to Treasury
    /// 5. Transfers Metadata upgrade authority to Treasury
    /// 6. Conditionally unpauses Auction and Marketplace based on launch_config
    /// 7. Deletes the temporary PendingDao state
    pub fn launch_dao(
        env: Env,
        token_address: Address,
        launch_config: LaunchConfig,
    ) -> Result<(), ManagerError> {
        let pending: PendingDao = env
            .storage()
            .instance()
            .get(&ManagerKey::PendingDao(token_address.clone()))
            .ok_or(ManagerError::DaoNotFound)?;
        pending.launch_admin.require_auth();

        let treasury = pending.addresses.treasury.clone();

        // Validate launch preconditions
        // Check that launch_admin is the token owner
        let token_owner: Address = env.invoke_contract(
            &pending.addresses.token,
            &Symbol::new(&env, "owner"),
            vec![&env],
        );
        if token_owner != pending.launch_admin {
            return Err(ManagerError::Unauthorized);
        }

        // Check that token total supply > 0
        let total_supply: i128 = env.invoke_contract(
            &pending.addresses.token,
            &Symbol::new(&env, "total_supply"),
            vec![&env],
        );
        if total_supply <= 0 {
            return Err(ManagerError::InvalidVersion); // Reusing error type for now
        }

        // Grant mint authorities to Treasury, Marketplace, and optionally Auction
        let _: () = env.invoke_contract(
            &pending.addresses.token,
            &Symbol::new(&env, "enable_mint_authority_by_manager"),
            vec![&env, pending.addresses.treasury.clone().into_val(&env)],
        );
        if launch_config.launch_auction {
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

        // Transfer ownership of modules to Treasury (using finalize_ownership which directly sets owner)
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

        // Transfer Auction ownership with launch_auction flag
        let _: () = env.invoke_contract(
            &pending.addresses.auction,
            &Symbol::new(&env, "finalize_ownership"),
            vec![
                &env,
                treasury.clone().into_val(&env),
                launch_config.launch_auction.into_val(&env),
            ],
        );

        // Conditionally unpause Marketplace if requested
        if launch_config.launch_marketplace {
            let _: () = env.invoke_contract(
                &pending.addresses.marketplace,
                &Symbol::new(&env, "unpause"),
                vec![&env],
            );
        }

        // Transfer Metadata upgrade authority to Treasury
        let _: () = env.invoke_contract(
            &pending.addresses.metadata,
            &Symbol::new(&env, "finalize_upgrade_authority"),
            vec![&env, treasury.clone().into_val(&env)],
        );

        // Delete pending DAO state
        env.storage()
            .instance()
            .remove(&ManagerKey::PendingDao(token_address.clone()));

        // Emit launch event
        let modules = DaoModules {
            token: pending.addresses.token.clone(),
            metadata: pending.addresses.metadata.clone(),
            auction: pending.addresses.auction.clone(),
            governor: pending.addresses.governor.clone(),
            treasury: pending.addresses.treasury.clone(),
            marketplace: pending.addresses.marketplace.clone(),
        };
        emit_dao_launched(
            &env,
            &token_address,
            env.ledger().sequence() as u64,
            &modules,
            launch_config.launch_auction,
            launch_config.launch_marketplace,
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

    fn validate_initial_config(config: &InitialDaoConfigValues) -> Result<(), ManagerError> {
        for value in [
            &config.token_name,
            &config.token_symbol,
            &config.token_uri,
            &config.project_uri,
            &config.description,
            &config.contract_image,
            &config.renderer_base,
        ] {
            Self::validate_string(value)?;
        }

        if u64::from(config.governance.voting_delay) < MIN_GOVERNANCE_DELAY
            || u64::from(config.governance.voting_period) < MIN_GOVERNANCE_DELAY
            || u64::from(config.governance.queue_delay) < MIN_GOVERNANCE_DELAY
        {
            return Err(ManagerError::InvalidGovernanceTiming);
        }
        if config.governance.quorum_bps > MAX_BPS {
            return Err(ManagerError::InvalidQuorumBps);
        }

        if config.auction.duration < MIN_AUCTION_DURATION {
            return Err(ManagerError::InvalidDuration);
        }
        if config.auction.reserve_price < MIN_RESERVE_PRICE {
            return Err(ManagerError::InvalidParamBounds);
        }
        if config.auction.time_buffer == 0 {
            return Err(ManagerError::InvalidTimeBuffer);
        }
        if config.marketplace.secondary_fee_bps > MAX_BPS {
            return Err(ManagerError::InvalidParamBounds);
        }
        Ok(())
    }
}
