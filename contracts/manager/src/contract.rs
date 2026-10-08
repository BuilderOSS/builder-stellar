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
const MAX_BPS: u32 = 10_000;

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
    /// * `current_hash` - Current Manager WASM hash for upgrade tracking
    /// * `version` - Current Manager version (e.g., "0.1.0")
    pub fn __constructor(env: Env, admin: Address, current_hash: BytesN<32>, version: String) {
        write_admin(&env, &admin);
        extend_instance_ttl(&env);
        set_factory_paused(&env, false);
        env.storage()
            .instance()
            .set(&ManagerKey::CurrentManagerWasm, &current_hash);
        env.storage()
            .instance()
            .set(&ManagerKey::CurrentManagerVersion, &version);

        // Emit initialization event
        emit_manager_initialized(&env, &admin, &version, env.ledger().sequence() as u64);
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
        set_persistent(
            &env,
            &ManagerKey::Implementation(wasm_hash.clone()),
            &implementation,
        );

        // Update latest version for this name
        set_persistent(
            &env,
            &ManagerKey::LatestImplementation(name.clone()),
            &wasm_hash,
        );

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
        let from_impl: ImplementationVersion = get_persistent::<ImplementationVersion>(
            &env,
            &ManagerKey::Implementation(from_hash.clone()),
        )
        .ok_or(ManagerError::ImplementationNotFound)?;

        let to_impl: ImplementationVersion = get_persistent::<ImplementationVersion>(
            &env,
            &ManagerKey::Implementation(to_hash.clone()),
        )
        .ok_or(ManagerError::ImplementationNotFound)?;

        if from_impl.revoked || to_impl.revoked {
            return Err(ManagerError::InvalidUpgradePath);
        }
        if from_impl.name != to_impl.name {
            return Err(ManagerError::InvalidUpgradePath);
        }

        // Create approval record
        let approval = UpgradeApproval {
            from_hash: from_hash.clone(),
            to_hash: to_hash.clone(),
            approved_at: env.ledger().sequence() as u64,
        };

        // Store approval
        set_persistent(
            &env,
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
        let mut implementation: ImplementationVersion = get_persistent::<ImplementationVersion>(
            &env,
            &ManagerKey::Implementation(wasm_hash.clone()),
        )
        .ok_or(ManagerError::ImplementationNotFound)?;

        // Check if already revoked
        if implementation.revoked {
            return Err(ManagerError::ImplementationAlreadyRevoked);
        }

        // Mark as revoked
        implementation.revoked = true;

        // Update storage
        set_persistent(
            &env,
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
        extend_instance_ttl(&env);
        let approval_exists: bool = get_persistent::<UpgradeApproval>(
            &env,
            &ManagerKey::UpgradeApproval(from_hash.clone(), to_hash.clone()),
        )
        .is_some();

        if !approval_exists {
            return false;
        }

        // Check both implementations exist and are not revoked
        let from_impl: Option<ImplementationVersion> =
            get_persistent::<ImplementationVersion>(&env, &ManagerKey::Implementation(from_hash));

        let to_impl: Option<ImplementationVersion> =
            get_persistent::<ImplementationVersion>(&env, &ManagerKey::Implementation(to_hash));

        match (from_impl, to_impl) {
            (Some(from), Some(to)) => !from.revoked && !to.revoked && from.name == to.name,
            _ => false,
        }
    }

    /// Returns the registered release version for a WASM hash.
    ///
    /// Module contracts call this only while applying an approved upgrade, so
    /// their stored version always corresponds to their active WASM hash.
    pub fn get_implementation_version(env: Env, wasm_hash: BytesN<32>) -> Option<String> {
        extend_instance_ttl(&env);
        get_persistent::<ImplementationVersion>(&env, &ManagerKey::Implementation(wasm_hash))
            .filter(|implementation| !implementation.revoked)
            .map(|implementation| implementation.version)
    }

    /// Returns the active Manager release version.
    pub fn version(env: Env) -> String {
        extend_instance_ttl(&env);
        env.storage()
            .instance()
            .get(&ManagerKey::CurrentManagerVersion)
            .expect("manager version not set")
    }

    /// Returns the active Manager WASM hash.
    pub fn wasm_hash(env: Env) -> BytesN<32> {
        extend_instance_ttl(&env);
        env.storage()
            .instance()
            .get(&ManagerKey::CurrentManagerWasm)
            .expect("manager hash not set")
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
        extend_instance_ttl(&env);
        let wasm_hash: Option<BytesN<32>> =
            get_persistent(&env, &ManagerKey::LatestImplementation(name));

        wasm_hash.and_then(|hash| {
            get_persistent::<ImplementationVersion>(&env, &ManagerKey::Implementation(hash))
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
        extend_instance_ttl(&env);
        get_persistent::<ImplementationVersion>(&env, &ManagerKey::Implementation(wasm_hash))
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

        for (hash, expected_name) in [
            (&token, "Token"),
            (&metadata, "Metadata"),
            (&auction, "Auction"),
            (&governor, "Governor"),
            (&treasury, "Treasury"),
            (&marketplace, "Marketplace"),
        ] {
            let implementation = Self::active_implementation(&env, hash)?;
            if implementation.name != String::from_str(&env, expected_name) {
                return Err(ManagerError::InvalidImplementationName);
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
    /// * `CurrentImplementationsNotSet` - Current WASM hashes not configured
    pub fn create_dao(env: Env, params: DaoCreationParams) -> Result<DaoAddresses, ManagerError> {
        // The deployer owns the newly-created modules and must authorize the
        // factory operation and subsequent owner-gated setup calls.
        extend_instance_ttl(&env);
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

        // Load current implementation hashes, rejecting unset or revoked ones in one pass.
        let (token_wasm, token_version) =
            Self::current_wasm(&env, &ManagerKey::CurrentTokenWasm, "Token")?;
        let (metadata_wasm, metadata_version) =
            Self::current_wasm(&env, &ManagerKey::CurrentMetadataWasm, "Metadata")?;
        let (auction_wasm, auction_version) =
            Self::current_wasm(&env, &ManagerKey::CurrentAuctionWasm, "Auction")?;
        let (governor_wasm, governor_version) =
            Self::current_wasm(&env, &ManagerKey::CurrentGovernorWasm, "Governor")?;
        let (treasury_wasm, treasury_version) =
            Self::current_wasm(&env, &ManagerKey::CurrentTreasuryWasm, "Treasury")?;
        let (marketplace_wasm, marketplace_version) =
            Self::current_wasm(&env, &ManagerKey::CurrentMarketplaceWasm, "Marketplace")?;

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
                treasury_version,
            ),
        );

        // Step 2: Deploy and initialize Token with launch_admin as owner.
        // The launch_admin configures the token, governance, and auction before launch.
        token_deployer.deploy_v2(
            token_wasm.clone(),
            (
                params.launch_admin.clone(),
                treasury_addr.clone(),
                token_uri,
                token_name,
                token_symbol,
                metadata_addr.clone(),
                env.current_contract_address(),
                token_wasm.clone(),
                token_version,
            ),
        );

        // Step 3: Deploy Metadata with empty artwork. The launch administrator can
        // replace the settings and add artwork before launch.
        let empty_property_names: Vec<String> = Vec::new(&env);
        let empty_items: Vec<Val> = Vec::new(&env);
        metadata_deployer.deploy_v2(
            metadata_wasm.clone(),
            (
                token_addr.clone(),
                project_uri,
                description,
                contract_image,
                renderer_base,
                env.current_contract_address(),
                metadata_wasm.clone(),
                params.launch_admin.clone(),
                treasury_addr.clone(),
                empty_property_names,
                empty_items,
                ArtworkIpfsGroup {
                    base_uri: String::from_str(&env, ""),
                    extension: String::from_str(&env, ""),
                },
                metadata_version,
            ),
        );

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
                governor_version,
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
                payment_asset.clone(),
                env.current_contract_address(),
                auction_wasm.clone(),
                auction_version,
            ),
        );

        // Marketplace is deployed paused; it is wired to the real (predicted)
        // treasury and receives mint authority at launch. `launch_admin` gates
        // its param setters until launch.
        marketplace_deployer.deploy_v2(
            marketplace_wasm.clone(),
            (
                token_addr.clone(),
                params.launch_admin.clone(),
                treasury_addr.clone(),
                marketplace_payment_asset.clone(),
                env.current_contract_address(),
                marketplace_wasm,
                marketplace_version,
                marketplace_fee_bps,
            ),
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
            auction_payment_asset: payment_asset,
            marketplace_payment_asset,
        };
        // One persistent entry per pending DAO; no expiry semantics. Archived
        // entries are restorable, so an abandoned creation only costs its creator's rent.
        set_persistent(&env, &ManagerKey::PendingDao(token_addr.clone()), &pending);

        // Emit events
        emit_dao_created(
            &env,
            &token_addr,
            &params.deployer,
            &params.launch_admin,
            env.ledger().sequence() as u64,
            &addresses,
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
    ///   - `enable_minter` - Whether to grant mint authority to the registered PlatformMinter
    ///
    /// # Validation
    ///
    /// - Token total supply must be > 0 (at least one token minted)
    /// - launch_admin must be the current token owner
    ///
    /// # Effects
    ///
    /// 1. Validates launch preconditions (`Unauthorized`, `LaunchSupplyZero`)
    /// 2. Calls `token.launch` with minters = [Treasury, Marketplace] + [Auction if
    ///    launch_auction] + [PlatformMinter if enable_minter; `PlatformMinterNotSet`
    ///    when unset], then `launch` on Governor, Treasury, Marketplace, Auction, Metadata
    /// 3. Each module becomes Live: ownership moves to the Treasury and the Manager
    ///    has no further authority over the DAO (a second launch panics `AlreadyLive`)
    /// 4. Deletes the temporary PendingDao state
    pub fn launch_dao(
        env: Env,
        token_address: Address,
        launch_config: LaunchConfig,
    ) -> Result<(), ManagerError> {
        extend_instance_ttl(&env);
        let pending: PendingDao =
            get_persistent(&env, &ManagerKey::PendingDao(token_address.clone()))
                .ok_or(ManagerError::DaoNotFound)?;
        pending.launch_admin.require_auth();

        let addresses = pending.addresses.clone();
        let treasury = addresses.treasury.clone();
        // NOTE: calls are Symbol-based on purpose. Using the module crates'
        // generated clients would link their `#[contractimpl]` exports into the
        // Manager WASM (duplicate `version`/`upgrade`/... symbols). Task #6
        // replaces these with `contractimport!` clients.
        let token_owner: Address =
            env.invoke_contract(&addresses.token, &Symbol::new(&env, "owner"), vec![&env]);
        // launch_admin must still be the token owner.
        if token_owner != pending.launch_admin {
            return Err(ManagerError::Unauthorized);
        }
        // At least one token must exist.
        let total_supply: i128 = env.invoke_contract(
            &addresses.token,
            &Symbol::new(&env, "total_supply"),
            vec![&env],
        );
        if total_supply <= 0 {
            return Err(ManagerError::LaunchSupplyZero);
        }

        // Mint authority is exactly this canonical set; the launch_admin cannot
        // add to it. The optional minter is the admin-registered PlatformMinter.
        let mut minters: Vec<Address> = vec![&env, treasury.clone(), addresses.marketplace.clone()];
        if launch_config.launch_auction {
            minters.push_back(addresses.auction.clone());
        }
        if launch_config.enable_minter {
            let minter: Address = get_persistent(&env, &ManagerKey::PlatformMinter)
                .ok_or(ManagerError::PlatformMinterNotSet)?;
            minters.push_back(minter);
        }

        // One-shot handoff. The token launches first so the auction holds mint
        // authority when it creates its first auction. After these calls every
        // module is Live and the Manager has no further authority over the DAO.
        let launch_args = vec![&env, treasury.clone().into_val(&env)];
        let _: () = env.invoke_contract(
            &addresses.token,
            &Symbol::new(&env, "launch"),
            vec![
                &env,
                treasury.clone().into_val(&env),
                minters.into_val(&env),
            ],
        );
        for module in [&addresses.governor, &addresses.treasury] {
            let _: () =
                env.invoke_contract(module, &Symbol::new(&env, "launch"), launch_args.clone());
        }
        let _: () = env.invoke_contract(
            &addresses.marketplace,
            &Symbol::new(&env, "launch"),
            vec![
                &env,
                treasury.clone().into_val(&env),
                launch_config.launch_marketplace.into_val(&env),
                pending.marketplace_payment_asset.clone().into_val(&env),
            ],
        );
        let _: () = env.invoke_contract(
            &addresses.auction,
            &Symbol::new(&env, "launch"),
            vec![
                &env,
                treasury.clone().into_val(&env),
                launch_config.launch_auction.into_val(&env),
                pending.auction_payment_asset.clone().into_val(&env),
            ],
        );
        let _: () = env.invoke_contract(
            &addresses.metadata,
            &Symbol::new(&env, "launch"),
            launch_args,
        );

        // Delete pending DAO state
        remove_persistent(&env, &ManagerKey::PendingDao(token_address.clone()));

        // Emit launch event
        emit_dao_launched(
            &env,
            &token_address,
            env.ledger().sequence() as u64,
            &pending.addresses,
            launch_config.launch_auction,
            launch_config.launch_marketplace,
            launch_config.enable_minter,
        );
        Ok(())
    }

    pub fn get_pending_dao(env: Env, token_address: Address) -> Option<PendingDao> {
        extend_instance_ttl(&env);
        get_persistent(&env, &ManagerKey::PendingDao(token_address))
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
        extend_instance_ttl(&env);
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

    /// Upgrade the Manager contract itself.
    ///
    /// # Authorization
    ///
    /// Only callable by admin.
    ///
    /// # Arguments
    ///
    /// * `from_hash` - Current Manager WASM hash (must match stored hash)
    /// * `to_hash` - Target Manager WASM hash (must be registered and active)
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not admin
    /// * `ImplementationNotFound` - Target implementation doesn't exist or is revoked
    /// * `InvalidVersion` - from_hash doesn't match current hash
    pub fn upgrade_manager(
        env: Env,
        from_hash: BytesN<32>,
        to_hash: BytesN<32>,
    ) -> Result<(), ManagerError> {
        // Require admin authorization
        Self::require_admin(&env)?;

        // Get current Manager hash and version
        let current_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&ManagerKey::CurrentManagerWasm)
            .ok_or(ManagerError::InvalidVersion)?;

        let current_version: String = env
            .storage()
            .instance()
            .get(&ManagerKey::CurrentManagerVersion)
            .ok_or(ManagerError::InvalidVersion)?;

        // Verify from_hash matches current hash
        if from_hash != current_hash {
            return Err(ManagerError::InvalidVersion);
        }

        // Verify to_hash is registered and not revoked
        let to_impl: ImplementationVersion = get_persistent::<ImplementationVersion>(
            &env,
            &ManagerKey::Implementation(to_hash.clone()),
        )
        .ok_or(ManagerError::ImplementationNotFound)?;

        if to_impl.revoked {
            return Err(ManagerError::ImplementationNotFound);
        }
        if to_impl.name != String::from_str(&env, "Manager") {
            return Err(ManagerError::InvalidUpgradePath);
        }
        if !Self::is_upgrade_approved(env.clone(), from_hash.clone(), to_hash.clone()) {
            return Err(ManagerError::InvalidUpgradePath);
        }

        // Update Manager's stored hash and version
        env.storage()
            .instance()
            .set(&ManagerKey::CurrentManagerWasm, &to_hash);
        env.storage()
            .instance()
            .set(&ManagerKey::CurrentManagerVersion, &to_impl.version.clone());

        // Emit upgrade event
        emit_manager_upgraded(
            &env,
            &from_hash,
            &to_hash,
            &current_version,
            &to_impl.version,
            env.ledger().sequence() as u64,
        );

        // Update Manager's own WASM
        env.deployer().update_current_contract_wasm(to_hash);

        Ok(())
    }

    // ========================================================================
    // Admin handover and platform configuration
    // ========================================================================

    /// Propose a new admin. The handover completes when `accept_admin` is called.
    ///
    /// Only callable by the current admin. Overwrites any earlier proposal.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), ManagerError> {
        Self::require_admin(&env)?;
        let current = get_admin(&env).ok_or(ManagerError::AdminNotSet)?;
        set_persistent(&env, &ManagerKey::PendingAdmin, &new_admin);
        emit_admin_proposed(&env, &current, &new_admin);
        Ok(())
    }

    /// Accept a pending admin handover. Requires the proposed admin's authorization.
    pub fn accept_admin(env: Env) -> Result<(), ManagerError> {
        extend_instance_ttl(&env);
        let pending: Address =
            get_persistent(&env, &ManagerKey::PendingAdmin).ok_or(ManagerError::NoPendingAdmin)?;
        pending.require_auth();
        let old = get_admin(&env).ok_or(ManagerError::AdminNotSet)?;
        write_admin(&env, &pending);
        remove_persistent(&env, &ManagerKey::PendingAdmin);
        emit_admin_changed(&env, &old, &pending);
        Ok(())
    }

    /// Current admin.
    pub fn get_admin(env: Env) -> Option<Address> {
        extend_instance_ttl(&env);
        get_admin(&env)
    }

    /// Pending admin awaiting acceptance, if any.
    pub fn get_pending_admin(env: Env) -> Option<Address> {
        extend_instance_ttl(&env);
        get_persistent(&env, &ManagerKey::PendingAdmin)
    }

    /// Register the platform minter granted mint authority at launch (admin only).
    pub fn set_platform_minter(env: Env, minter: Address) -> Result<(), ManagerError> {
        Self::require_admin(&env)?;
        set_persistent(&env, &ManagerKey::PlatformMinter, &minter);
        emit_platform_minter_set(&env, &minter);
        Ok(())
    }

    /// The registered platform minter, if any.
    pub fn get_platform_minter(env: Env) -> Option<Address> {
        extend_instance_ttl(&env);
        get_persistent(&env, &ManagerKey::PlatformMinter)
    }

    // ========================================================================
    // Helper Functions
    // ========================================================================

    /// Load a registered, non-revoked implementation record.
    fn active_implementation(
        env: &Env,
        hash: &BytesN<32>,
    ) -> Result<ImplementationVersion, ManagerError> {
        let implementation: ImplementationVersion =
            get_persistent(env, &ManagerKey::Implementation(hash.clone()))
                .ok_or(ManagerError::ImplementationNotFound)?;
        if implementation.revoked {
            return Err(ManagerError::ImplementationNotFound);
        }
        Ok(implementation)
    }

    /// Load a `Current*Wasm` hash, verify it is an active implementation with the
    /// expected name, and return it with its registered version.
    fn current_wasm(
        env: &Env,
        key: &ManagerKey,
        expected_name: &str,
    ) -> Result<(BytesN<32>, String), ManagerError> {
        let hash: BytesN<32> = env
            .storage()
            .instance()
            .get(key)
            .ok_or(ManagerError::CurrentImplementationsNotSet)?;
        let implementation = Self::active_implementation(env, &hash)?;
        if implementation.name != String::from_str(env, expected_name) {
            return Err(ManagerError::ImplementationNotFound);
        }
        Ok((hash, implementation.version))
    }

    /// Require caller to be admin.
    fn require_admin(env: &Env) -> Result<(), ManagerError> {
        extend_instance_ttl(env);
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
        if config.governance.quorum_bps == 0 || config.governance.quorum_bps > MAX_BPS {
            return Err(ManagerError::InvalidQuorumBps);
        }
        if config.governance.proposal_threshold == 0 {
            return Err(ManagerError::InvalidProposalThreshold);
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
