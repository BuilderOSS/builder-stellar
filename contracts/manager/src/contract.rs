//! Manager Contract
//!
//! The central hub for the Stellar Builder platform, combining:
//! 1. Implementation Management - Registry of contract implementations
//! 2. DAO Factory - Atomic deployment of new DAOs
//! 3. DAO Registry - Discovery and enumeration of deployed DAOs

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

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

/// Maximum founder allocation total (99%)
const MAX_FOUNDER_PERCENT: u32 = 99;

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
        set_factory_version(&env, 1);
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
                .get(&ManagerKey::Implementation(hash))
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
    ) -> Result<(), ManagerError> {
        // Check authorization
        Self::require_admin(&env)?;

        // Validate all implementations exist (optional: could also check not revoked)
        // For now, just set them

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

        emit_current_implementations_updated(
            &env, &token, &metadata, &auction, &governor, &treasury,
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

    /// Create a new DAO with all 5 modules atomically deployed.
    ///
    /// This is the main factory function that:
    /// 1. Validates all parameters
    /// 2. Checks factory not paused and nonce not used
    /// 3. Deploys all 5 contracts (Token, Metadata, Auction, Governor, Treasury)
    /// 4. Initializes them with proper cross-references
    /// 5. Sets up founder allocations and mint authority
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
        // Check factory not paused
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }

        // Validate parameters
        Self::validate_dao_params(&params)?;

        // Check nonce not already used
        if is_nonce_used(&env, &params.deployer, params.nonce) {
            return Err(ManagerError::NonceAlreadyUsed);
        }

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

        // Generate deterministic salts
        let token_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "token");
        let metadata_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "metadata");
        let auction_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "auction");
        let governor_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "governor");
        let treasury_salt = Self::generate_salt(&env, &params.deployer, params.nonce, "treasury");

        // NOTE: In Soroban, contracts with __constructor need to have it called separately
        // after deployment. We deploy first, then initialize.

        // Deploy all contracts
        let token_addr = env
            .deployer()
            .with_current_contract(token_salt)
            .deploy(token_wasm);

        let metadata_addr = env
            .deployer()
            .with_current_contract(metadata_salt)
            .deploy(metadata_wasm);

        let auction_addr = env
            .deployer()
            .with_current_contract(auction_salt)
            .deploy(auction_wasm);

        let governor_addr = env
            .deployer()
            .with_current_contract(governor_salt)
            .deploy(governor_wasm);

        let treasury_addr = env
            .deployer()
            .with_current_contract(treasury_salt)
            .deploy(treasury_wasm);

        // TODO: Complete initialization after resolving deployment API
        // For now, this is a stub that will be implemented once we determine
        // the correct way to call __constructor on deployed contracts

        // The initialization sequence should be:
        // 1. Token.__constructor(treasury, uri, name, symbol, metadata)
        // 2. Metadata.initialize(token, project_uri, description, image, renderer)
        // 3. Treasury.__constructor(treasury, governor)
        // 4. Governor.__constructor(treasury, token, treasury, delays, thresholds)
        // 5. Auction.__constructor(treasury, token, treasury, auction_params)
        // 6. Token.set_mint_authority(auction, true)

        return Err(ManagerError::InitializationFailed);

        // Mark nonce as used
        set_nonce_used(&env, &params.deployer, params.nonce);

        // Create DAO addresses
        let addresses = DaoAddresses {
            token: token_addr.clone(),
            metadata: metadata_addr.clone(),
            auction: auction_addr.clone(),
            governor: governor_addr.clone(),
            treasury: treasury_addr.clone(),
        };

        // Register DAO
        let modules = DaoModules {
            token: token_addr.clone(),
            metadata: metadata_addr.clone(),
            auction: auction_addr.clone(),
            governor: governor_addr.clone(),
            treasury: treasury_addr.clone(),
        };

        let registration = DaoRegistration {
            token_address: token_addr.clone(),
            creator: params.deployer.clone(),
            created_ledger: env.ledger().sequence(),
            created_at: env.ledger().timestamp(),
            factory_version: get_factory_version(&env),
            modules: modules.clone(),
            metadata: DaoMetadata {
                name: params.token_name.clone(),
                description: Some(params.description.clone()),
            },
        };

        // Store registration
        env.storage().instance().set(
            &ManagerKey::DaoRegistration(token_addr.clone()),
            &registration,
        );

        // Add to DAO list
        add_dao_to_list(&env, &token_addr);

        // Emit events
        emit_dao_created(
            &env,
            &token_addr,
            &params.deployer,
            env.ledger().sequence(),
            &modules,
            &params.founders,
        );

        emit_dao_registered(&env, &token_addr, &params.deployer, &modules);

        Ok(addresses)
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
    /// Predicted addresses for all 5 modules
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

        Ok(DaoAddresses {
            token: token_addr,
            metadata: metadata_addr,
            auction: auction_addr,
            governor: governor_addr,
            treasury: treasury_addr,
        })
    }

    /// Check if a (creator, nonce) pair has been used.
    ///
    /// # Arguments
    ///
    /// * `creator` - Creator address
    /// * `nonce` - Nonce value
    ///
    /// # Returns
    ///
    /// `true` if the nonce has been used by this creator
    pub fn is_nonce_used(env: Env, creator: Address, nonce: u64) -> bool {
        is_nonce_used(&env, &creator, nonce)
    }

    // ========================================================================
    // DAO Registry (Read-only)
    // ========================================================================

    /// Get DAO by token address.
    ///
    /// # Arguments
    ///
    /// * `token_address` - Token address (canonical DAO ID)
    ///
    /// # Returns
    ///
    /// The DAO registration, or `None` if not found.
    pub fn get_dao(env: Env, token_address: Address) -> Option<DaoRegistration> {
        env.storage()
            .instance()
            .get(&ManagerKey::DaoRegistration(token_address))
    }

    /// Enumerate DAOs with pagination.
    ///
    /// # Arguments
    ///
    /// * `start` - Starting index
    /// * `limit` - Maximum number of DAOs to return
    ///
    /// # Returns
    ///
    /// Vector of token addresses in creation order.
    ///
    /// # Errors
    ///
    /// * `InvalidPaginationParams` - Invalid start/limit
    pub fn enumerate_daos(env: Env, start: u32, limit: u32) -> Result<Vec<Address>, ManagerError> {
        if limit == 0 || limit > 100 {
            return Err(ManagerError::InvalidPaginationParams);
        }

        let dao_list = get_dao_list(&env);
        let total = dao_list.len();

        if start >= total {
            return Ok(Vec::new(&env));
        }

        let end = core::cmp::min(start + limit, total);
        let mut result = Vec::new(&env);

        for i in start..end {
            if let Some(addr) = dao_list.get(i) {
                result.push_back(addr);
            }
        }

        Ok(result)
    }

    /// Get total DAO count.
    ///
    /// # Returns
    ///
    /// Total number of DAOs created.
    pub fn get_dao_count(env: Env) -> u32 {
        get_dao_count(&env)
    }

    /// Check if a token address is a registered DAO.
    ///
    /// # Arguments
    ///
    /// * `token_address` - Token address to check
    ///
    /// # Returns
    ///
    /// `true` if the address is a registered DAO.
    pub fn is_dao(env: Env, token_address: Address) -> bool {
        env.storage()
            .instance()
            .get::<ManagerKey, DaoRegistration>(&ManagerKey::DaoRegistration(token_address))
            .is_some()
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
    fn generate_salt(env: &Env, _creator: &Address, nonce: u64, module: &str) -> BytesN<32> {
        let mut bytes_to_hash = soroban_sdk::Bytes::new(env);

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
        if params.founders.is_empty() {
            return Err(ManagerError::NoFoundersSpecified);
        }

        if params.founders.len() > MAX_FOUNDERS {
            return Err(ManagerError::InvalidParamBounds);
        }

        let mut total_percentage: u32 = 0;
        for founder in params.founders.iter() {
            if founder.percentage == 0 || founder.percentage > MAX_FOUNDER_PERCENT {
                return Err(ManagerError::InvalidFounderPercentage);
            }
            total_percentage += founder.percentage;
        }

        if total_percentage > MAX_FOUNDER_PERCENT {
            return Err(ManagerError::FoundersExceed99Percent);
        }

        // Validate governance params
        if params.quorum_bps > MAX_BPS {
            return Err(ManagerError::InvalidQuorumBps);
        }

        if params.proposal_threshold_bps > MAX_BPS {
            return Err(ManagerError::InvalidProposalThresholdBps);
        }

        // Validate auction params
        if params.auction_duration == 0 {
            return Err(ManagerError::InvalidDuration);
        }

        if params.time_buffer == 0 {
            return Err(ManagerError::InvalidTimeBuffer);
        }

        Ok(())
    }
}
