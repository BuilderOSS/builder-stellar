//! Manager Contract
//!
//! The central hub for the Stellar Builder platform, combining:
//! 1. Implementation Management - Registry of contract implementations
//! 2. DAO Factory - Atomic deployment of new DAOs
//! 3. DAO Lifecycle - Deployment and launch handoff

use common::clients::{
    AuctionLaunchClient, MarketplaceLaunchClient, NftClient, TreasuryLaunchClient, WasmHashClient,
};
use soroban_sdk::{contract, contractimpl, vec, Address, BytesN, Env, String, Val, Vec};

use crate::error::ManagerError;
use crate::events::*;
use crate::storage::*;

/// Manager contract structure.
#[contract]
pub struct ManagerContract;

// ============================================================================
// Constants
// ============================================================================

// Parameter bounds come from `common` so the Manager and each module validate
// against the same values.
use common::{
    BPS_DENOMINATOR as MAX_BPS, MAX_AUCTION_DURATION, MAX_AUCTION_TIME_BUFFER, MAX_FEE_BPS,
    MAX_GOVERNANCE_DELAY, MAX_STRING_LENGTH, MIN_AUCTION_DURATION, MIN_GOVERNANCE_DELAY,
    MIN_RESERVE_PRICE,
};
/// Min 4 so only meaningful slugs are used; max 63 is the DNS label limit
/// (leaves room for `<slug>.example.com` subdomains later).
const MIN_SLUG_LENGTH: u32 = 4;
const MAX_SLUG_LENGTH: u32 = 63;

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
    /// * `InvalidImplementationName` - Name is empty or too long
    /// * `InvalidVersion` - Version is empty or too long
    /// * `ImplementationAlreadyRegistered` - A record already exists for this hash
    ///   (records are immutable: no renaming, re-versioning or un-revoking)
    ///
    /// Registration does not change the "latest" implementation for `name`;
    /// the admin selects it explicitly with `set_latest_implementation`, so
    /// registering an older (patch) release never regresses it.
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

        if get_persistent::<ImplementationVersion>(
            &env,
            &ManagerKey::Implementation(wasm_hash.clone()),
        )
        .is_some()
        {
            return Err(ManagerError::ImplementationAlreadyRegistered);
        }

        // Create implementation record
        let implementation = ImplementationVersion {
            name: name.clone(),
            version: version.clone(),
            wasm_hash: wasm_hash.clone(),
            published_ledger: env.ledger().sequence() as u64,
            revoked: false,
        };

        // Store implementation
        set_persistent(
            &env,
            &ManagerKey::Implementation(wasm_hash.clone()),
            &implementation,
        );

        emit_implementation_registered(
            &env,
            &name,
            &version,
            &wasm_hash,
            implementation.published_ledger,
        );

        Ok(())
    }

    /// Select the latest implementation for `name` (admin only).
    ///
    /// # Errors
    ///
    /// * `ImplementationNotFound` - `wasm_hash` is not registered or is revoked
    /// * `InvalidImplementationName` - `wasm_hash` is registered under another name
    pub fn set_latest_implementation(
        env: Env,
        name: String,
        wasm_hash: BytesN<32>,
    ) -> Result<(), ManagerError> {
        Self::require_admin(&env)?;
        let implementation = Self::active_implementation(&env, &wasm_hash)?;
        if implementation.name != name {
            return Err(ManagerError::InvalidImplementationName);
        }
        set_persistent(
            &env,
            &ManagerKey::LatestImplementation(name.clone()),
            &wasm_hash,
        );
        emit_latest_implementation_set(&env, &name, &wasm_hash, &implementation.version);
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
    /// * `ImplementationNotFound` - One or both implementations don't exist
    /// * `InvalidUpgradePath` - Target is revoked, or the names differ
    ///
    /// A revoked SOURCE is allowed on purpose: after revoking a vulnerable
    /// hash the admin must still be able to approve a migration off it.
    pub fn approve_upgrade(
        env: Env,
        from_hash: BytesN<32>,
        to_hash: BytesN<32>,
    ) -> Result<(), ManagerError> {
        // Check authorization
        Self::require_admin(&env)?;

        // Both implementations must exist; only the target must be active.
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

        if to_impl.revoked {
            return Err(ManagerError::InvalidUpgradePath);
        }
        if from_impl.name != to_impl.name {
            return Err(ManagerError::InvalidUpgradePath);
        }

        // Create approval record
        let approval = UpgradeApproval {
            from_hash: from_hash.clone(),
            to_hash: to_hash.clone(),
            approved_ledger: env.ledger().sequence() as u64,
        };

        // Store approval
        set_persistent(
            &env,
            &ManagerKey::UpgradeApproval(from_hash.clone(), to_hash.clone()),
            &approval,
        );

        // Emit event
        emit_upgrade_approved(&env, &from_hash, &to_hash, approval.approved_ledger);

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
        emit_implementation_revoked(&env, &wasm_hash, env.ledger().sequence() as u64);

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
    /// `true` if the path is approved, both hashes are registered under the
    /// same name and the TARGET is not revoked. A revoked source may still
    /// migrate away.
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
            (Some(from), Some(to)) => !to.revoked && from.name == to.name,
            _ => false,
        }
    }

    /// Returns the registered release version for a WASM hash, including
    /// revoked hashes (a module still running a revoked hash must be able to
    /// `sync_version`). Callers that must reject revoked targets rely on
    /// `is_upgrade_approved`, which checks the target is not revoked.
    pub fn get_implementation_version(env: Env, wasm_hash: BytesN<32>) -> Option<String> {
        extend_instance_ttl(&env);
        get_persistent::<ImplementationVersion>(&env, &ManagerKey::Implementation(wasm_hash))
            .map(|implementation| implementation.version)
    }

    /// Returns the active Manager release version.
    pub fn version(env: Env) -> String {
        extend_instance_ttl(&env);
        common::error::require(
            &env,
            env.storage()
                .instance()
                .get(&ManagerKey::CurrentManagerVersion),
            common::CommonError::VersionNotSet,
        )
    }

    /// Returns the active Manager WASM hash.
    pub fn wasm_hash(env: Env) -> BytesN<32> {
        extend_instance_ttl(&env);
        common::error::require(
            &env,
            env.storage()
                .instance()
                .get(&ManagerKey::CurrentManagerWasm),
            common::CommonError::CurrentHashNotSet,
        )
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
    /// * `auction` - Auction implementation WASM hash
    /// * `governor` - Governor implementation WASM hash
    /// * `treasury` - Treasury implementation WASM hash
    /// * `marketplace` - Marketplace implementation WASM hash
    ///
    /// # Errors
    ///
    /// * `ImplementationNotFound` - One or more implementations don't exist or are revoked
    /// * `InvalidImplementationName` - A hash is registered under the wrong module name
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
    /// # Authorization
    ///
    /// Requires BOTH `params.deployer` and `params.launch_admin` to authorize
    /// the call (one signature if they are the same address). Module
    /// constructors do not require auth.
    ///
    /// # Returns
    ///
    /// All deployed contract addresses
    ///
    /// The requested slug is validated and must not belong to a launched DAO,
    /// but it is only claimed at `launch_dao` (pending DAOs hold no slug, so an
    /// abandoned creation blocks nothing).
    ///
    /// # Errors
    ///
    /// * `FactoryPaused` - Factory is paused
    /// * `CurrentImplementationsNotSet` - Current WASM hashes not configured
    /// * `InvalidSlug` / `SlugTaken` - Malformed slug, or claimed by a launched DAO
    pub fn create_dao(env: Env, params: DaoCreationParams) -> Result<DaoAddresses, ManagerError> {
        // The deployer owns the newly-created modules and must authorize the
        // factory operation and subsequent admin-gated setup calls.
        extend_instance_ttl(&env);
        params.deployer.require_auth();
        // The launch admin becomes the admin of every module and must consent to
        // being named (prevents spam/impersonation). Soroban rejects a second
        // require_auth on the same address within one frame (Auth/ExistingValue),
        // so only call it when the launch admin differs from the deployer.
        if params.launch_admin != params.deployer {
            params.launch_admin.require_auth();
        }

        // Check factory not paused
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }

        // Validate configuration; the slug is claimed only at launch.
        let config = &params.initial_config;
        Self::validate_initial_config(config)?;
        Self::require_slug_unclaimed(&env, &config.slug)?;
        let governance = &config.governance;
        let payment_asset = config.auction.payment_asset.clone();
        let marketplace_payment_asset = config.marketplace.payment_asset.clone();

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

        let wasm_hashes = DaoWasmHashes {
            token: token_wasm.clone(),
            metadata: metadata_wasm.clone(),
            auction: auction_wasm.clone(),
            governor: governor_wasm.clone(),
            treasury: treasury_wasm.clone(),
            marketplace: marketplace_wasm.clone(),
        };

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

        // Step 1: Deploy and initialize Treasury (needs admin and governor)
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

        // Step 2: Deploy and initialize Token with launch_admin as admin.
        // The launch_admin configures the token, governance, and auction before
        // launch. Treasury, Auction and Marketplace hold no voting power.
        token_deployer.deploy_v2(
            token_wasm.clone(),
            (
                params.launch_admin.clone(),
                treasury_addr.clone(),
                auction_addr.clone(),
                marketplace_addr.clone(),
                config.token_uri.clone(),
                config.token_name.clone(),
                config.token_symbol.clone(),
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
                config.project_uri.clone(),
                config.description.clone(),
                config.contract_image.clone(),
                config.renderer_base.clone(),
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
                config.auction.duration,
                config.auction.reserve_price,
                min_bid_increment,
                config.auction.time_buffer,
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
                config.marketplace.secondary_fee_bps,
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
            slug: config.slug.clone(),
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
            &wasm_hashes,
            &config.slug,
        );

        Ok(addresses)
    }

    /// Change the requested slug of a pending DAO (launch admin only), for
    /// example after `launch_dao` failed with `SlugTaken`.
    ///
    /// # Errors
    ///
    /// * `DaoNotFound` - No pending DAO for `token_address`
    /// * `InvalidSlug` / `SlugTaken` - Malformed slug, or claimed by a launched DAO
    pub fn update_pending_slug(
        env: Env,
        token_address: Address,
        slug: String,
    ) -> Result<(), ManagerError> {
        extend_instance_ttl(&env);
        let key = ManagerKey::PendingDao(token_address.clone());
        let mut pending: PendingDao =
            get_persistent(&env, &key).ok_or(ManagerError::DaoNotFound)?;
        pending.launch_admin.require_auth();
        Self::validate_slug(&slug)?;
        Self::require_slug_unclaimed(&env, &slug)?;
        pending.slug = slug.clone();
        set_persistent(&env, &key, &pending);
        emit_pending_slug_updated(&env, &token_address, &slug);
        Ok(())
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
    ///   - `expected_minter` - Required when `enable_minter` is set; must equal the registered
    ///     PlatformMinter (`PlatformMinterMismatch` otherwise, including when `None`)
    ///
    /// # Validation
    ///
    /// - The factory must not be paused (`FactoryPaused`)
    /// - Token voting supply must be > 0 (at least one token minted to a holder
    ///   other than the Treasury, Auction or Marketplace)
    /// - launch_admin must be the current token admin (`LaunchAdminNotOwner`)
    /// - The requested slug must still be unclaimed (`SlugTaken`; change it with
    ///   `update_pending_slug`)
    /// - Every module's CURRENT `wasm_hash()` must be registered and not revoked
    ///   (`PendingDaoUsesRevokedImplementation`); checked before any launch call
    ///
    /// # Effects
    ///
    /// 1. Validates launch preconditions and claims the slug (`SlugClaimed`)
    /// 2. Calls `token.launch` with minters = [Treasury, Marketplace] + [Auction if
    ///    launch_auction] + [PlatformMinter if enable_minter; `PlatformMinterNotSet`
    ///    when unset], then `launch` on Governor, Treasury, Marketplace, Auction, Metadata
    /// 3. Each module becomes Live: its admin moves to the Treasury and the Manager
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
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }
        Self::require_slug_unclaimed(&env, &pending.slug)?;

        let addresses = pending.addresses.clone();
        let treasury = addresses.treasury.clone();
        // Typed clients (common::clients) rather than the module crates:
        // linking those would export their functions from the Manager WASM.
        let nft = NftClient::new(&env, &addresses.token);
        // launch_admin must still be the token admin.
        if nft.admin() != pending.launch_admin {
            return Err(ManagerError::LaunchAdminNotOwner);
        }
        // Every module must currently run a registered, non-revoked hash. The
        // CURRENT hash is read from each module (not the one recorded at
        // create_dao) so a pre-launch `upgrade` to an approved hash is honored.
        // Runs before any launch call so a rejection leaves nothing launched.
        for module in [
            &addresses.token,
            &addresses.metadata,
            &addresses.auction,
            &addresses.governor,
            &addresses.treasury,
            &addresses.marketplace,
        ] {
            let current = WasmHashClient::new(&env, module).wasm_hash();
            let record =
                get_persistent::<ImplementationVersion>(&env, &ManagerKey::Implementation(current));
            match record {
                Some(r) if !r.revoked => {}
                _ => return Err(ManagerError::PendingDaoUsesRevokedImplementation),
            }
        }
        // At least one voting-capable token must exist.
        if nft.total_supply() <= 0 {
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
            // The launch admin must pin the minter they reviewed; this closes
            // the window in which the Manager admin swaps it before launch.
            if launch_config.expected_minter != Some(minter.clone()) {
                return Err(ManagerError::PlatformMinterMismatch);
            }
            minters.push_back(minter);
        }

        // One-shot handoff. The token launches first so the auction holds mint
        // authority when it creates its first auction. After these calls every
        // module is Live and the Manager has no further authority over the DAO.
        nft.launch(&treasury, &minters);
        TreasuryLaunchClient::new(&env, &addresses.governor).launch(&treasury);
        TreasuryLaunchClient::new(&env, &addresses.treasury).launch(&treasury);
        MarketplaceLaunchClient::new(&env, &addresses.marketplace).launch(
            &treasury,
            &launch_config.launch_marketplace,
            &pending.marketplace_payment_asset,
        );
        AuctionLaunchClient::new(&env, &addresses.auction).launch(
            &treasury,
            &launch_config.launch_auction,
            &pending.auction_payment_asset,
        );
        TreasuryLaunchClient::new(&env, &addresses.metadata).launch(&treasury);

        // Claim the slug (permanent, renewed via `bump_slug_ttl`) and delete
        // the pending DAO state.
        set_persistent(
            &env,
            &ManagerKey::SlugToDao(pending.slug.clone()),
            &token_address,
        );
        set_persistent(
            &env,
            &ManagerKey::DaoSlug(token_address.clone()),
            &pending.slug,
        );
        emit_slug_claimed(&env, &token_address, &pending.slug);
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

    /// Token address of the launched DAO that claimed `slug`.
    ///
    /// Plain read: does not extend TTL (renewal is explicit via `bump_slug_ttl`).
    pub fn get_dao_by_slug(env: Env, slug: String) -> Result<Address, ManagerError> {
        extend_instance_ttl(&env);
        env.storage()
            .persistent()
            .get(&ManagerKey::SlugToDao(slug))
            .ok_or(ManagerError::SlugNotFound)
    }

    /// Slug claimed by a launched DAO, if any (a pending DAO's requested slug
    /// is in `get_pending_dao`).
    pub fn get_slug(env: Env, token_address: Address) -> Option<String> {
        extend_instance_ttl(&env);
        env.storage()
            .persistent()
            .get(&ManagerKey::DaoSlug(token_address))
    }

    /// Permissionless TTL renewal for a DAO's slug registry entries.
    ///
    /// Anyone (DAO operators, the platform admin) can pay to keep a slug live.
    /// The network clamps `extend_to` to its max entry TTL (~180 days), so call
    /// this periodically. Archived entries must be restored first.
    ///
    /// # Errors
    ///
    /// * `SlugNotFound` - no DAO is registered under this slug
    pub fn bump_slug_ttl(env: Env, slug: String) -> Result<(), ManagerError> {
        extend_instance_ttl(&env);
        let token: Address = env
            .storage()
            .persistent()
            .get(&ManagerKey::SlugToDao(slug.clone()))
            .ok_or(ManagerError::SlugNotFound)?;
        bump_persistent(&env, &ManagerKey::SlugToDao(slug));
        bump_persistent(&env, &ManagerKey::DaoSlug(token));
        Ok(())
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

    /// Cancel a pending admin handover (admin only).
    pub fn cancel_pending_admin(env: Env) -> Result<(), ManagerError> {
        Self::require_admin(&env)?;
        let current = get_admin(&env).ok_or(ManagerError::AdminNotSet)?;
        let pending: Address =
            get_persistent(&env, &ManagerKey::PendingAdmin).ok_or(ManagerError::NoPendingAdmin)?;
        remove_persistent(&env, &ManagerKey::PendingAdmin);
        emit_admin_proposal_cancelled(&env, &current, &pending);
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

    /// Generate a deterministic deployment salt from the creator, the nonce and
    /// the module name, so each deployer has an independent nonce space.
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

    // TODO(pricing): before production, decide whether slugs should cost something
    // (ENS-style length-tiered rent, admin-managed reserve for brands). Today the
    // only cost is the create fee plus rent, which does not scale with a slug's value.
    fn validate_slug(slug: &String) -> Result<(), ManagerError> {
        let len = slug.len();
        if !(MIN_SLUG_LENGTH..=MAX_SLUG_LENGTH).contains(&len) {
            return Err(ManagerError::InvalidSlug);
        }
        let mut buf = [0u8; MAX_SLUG_LENGTH as usize];
        let bytes = &mut buf[..len as usize];
        slug.copy_into_slice(bytes);
        let mut prev_hyphen = true; // rejects a leading hyphen
        for &b in bytes.iter() {
            let hyphen = b == b'-';
            if !(b.is_ascii_lowercase() || b.is_ascii_digit() || hyphen) || (hyphen && prev_hyphen)
            {
                return Err(ManagerError::InvalidSlug);
            }
            prev_hyphen = hyphen;
        }
        if prev_hyphen {
            return Err(ManagerError::InvalidSlug); // trailing hyphen
        }
        Ok(())
    }

    /// `SlugTaken` if a launched DAO already claimed `slug`.
    fn require_slug_unclaimed(env: &Env, slug: &String) -> Result<(), ManagerError> {
        if has_persistent(env, &ManagerKey::SlugToDao(slug.clone())) {
            return Err(ManagerError::SlugTaken);
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
        Self::validate_slug(&config.slug)?;

        let timing = MIN_GOVERNANCE_DELAY..=MAX_GOVERNANCE_DELAY;
        if !timing.contains(&config.governance.voting_delay)
            || !timing.contains(&config.governance.voting_period)
            || !timing.contains(&config.governance.queue_delay)
        {
            return Err(ManagerError::InvalidGovernanceTiming);
        }
        if config.governance.quorum_bps == 0 || config.governance.quorum_bps > MAX_BPS {
            return Err(ManagerError::InvalidQuorumBps);
        }
        if config.governance.proposal_threshold == 0 {
            return Err(ManagerError::InvalidProposalThreshold);
        }

        if config.auction.duration < MIN_AUCTION_DURATION
            || config.auction.duration > MAX_AUCTION_DURATION
        {
            return Err(ManagerError::InvalidDuration);
        }
        if config.auction.reserve_price < MIN_RESERVE_PRICE {
            return Err(ManagerError::InvalidParamBounds);
        }
        if config.auction.time_buffer == 0 || config.auction.time_buffer > MAX_AUCTION_TIME_BUFFER {
            return Err(ManagerError::InvalidTimeBuffer);
        }
        if config.marketplace.secondary_fee_bps > MAX_FEE_BPS {
            return Err(ManagerError::InvalidFee);
        }
        Ok(())
    }
}
