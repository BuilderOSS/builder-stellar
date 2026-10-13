//! Manager Contract
//!
//! The central hub for the Stellar Builder platform, combining:
//! 1. Implementation Management - Registry of contract implementations
//! 2. DAO Factory - Atomic deployment of new DAOs
//! 3. DAO Lifecycle - Deployment and launch handoff

use common::clients::{
    ClaimsClient, DaoModuleClient, NftClient, TreasuryLaunchClient, WasmHashClient,
};
use common::modules::{
    AssuranceState, AssuranceTerms, MintGrant, KIND_AUCTION, KIND_CLAIMS, KIND_MARKETPLACE,
};
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, String, Symbol, Val, Vec};

use crate::error::ManagerError;
use crate::events::*;
use crate::storage::*;
use common::upgrade::LatestPointer;

/// OpenZeppelin non-fungible caps on the collection name and symbol.
const MAX_TOKEN_NAME_LENGTH: u32 = 40;
const MAX_TOKEN_SYMBOL_LENGTH: u32 = 10;

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
/// Minimum bid increment every Manager-built Auction starts with (10%).
const MIN_BID_INCREMENT_PERCENT: u32 = 10;
/// Longest an assurance drive may run (90 days, seconds): it bounds how long
/// a drive holds its slug and keeps members' fees in escrow (review S2).
pub const MAX_ASSURANCE_WINDOW: u64 = 90 * 86_400;

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
    /// `upgrade_delay`: ledgers between an approval and the earliest
    /// `upgrade_manager` (`common::upgrade::RECOMMENDED_UPGRADE_DELAY` on a
    /// public network; short on testnet). Changeable with `set_upgrade_delay`.
    pub fn __constructor(
        env: Env,
        admin: Address,
        current_hash: BytesN<32>,
        version: String,
        upgrade_delay: u32,
    ) {
        write_admin(&env, &admin);
        common::upgrade::init_delay(&env, upgrade_delay);
        extend_instance_ttl(&env);
        set_factory_paused(&env, false);
        env.storage().instance().set(
            &common::ns(&env, ManagerKey::CurrentManagerWasm),
            &current_hash,
        );
        env.storage().instance().set(
            &common::ns(&env, ManagerKey::CurrentManagerVersion),
            &version,
        );

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
        // Re-announcing the same hash keeps its ledger: the platform notice
        // counts from the first announcement and cannot be restarted (D42).
        if let Some(current) = Self::latest_pointer(env.clone(), name.clone()) {
            if current.wasm_hash == wasm_hash {
                return Ok(());
            }
        }
        set_persistent(
            &env,
            &ManagerKey::LatestImplementation(name.clone()),
            &LatestPointer {
                wasm_hash: wasm_hash.clone(),
                set_ledger: env.ledger().sequence() as u64,
            },
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
        // Re-approving keeps the first ledger: the notice a platform upgrade
        // waits for counts from the earliest approval and cannot be restarted.
        if get_persistent::<UpgradeApproval>(
            &env,
            &ManagerKey::UpgradeApproval(from_hash.clone(), to_hash.clone()),
        )
        .is_some()
        {
            return Ok(());
        }

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
    /// revoked hashes (a module still running a revoked hash keeps answering
    /// `version()`, which reads this). Callers that must reject revoked targets rely on
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
                .get(&common::ns(&env, ManagerKey::CurrentManagerVersion)),
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
                .get(&common::ns(&env, ManagerKey::CurrentManagerWasm)),
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
        Self::latest_pointer(env.clone(), name).and_then(|pointer| {
            get_persistent::<ImplementationVersion>(
                &env,
                &ManagerKey::Implementation(pointer.wasm_hash),
            )
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

    /// Set the current implementation WASM hashes used by the factory and by
    /// `create_module` (admin only). Each hash must be registered, not
    /// revoked, and registered under its slot's name (`Token`, `Metadata`,
    /// `Auction`, `Governor`, `Treasury`, `Marketplace`, `ClaimMinter`).
    ///
    /// # Errors
    ///
    /// * `ImplementationNotFound` - One or more implementations don't exist or are revoked
    /// * `InvalidImplementationName` - A hash is registered under the wrong module name
    pub fn set_current_implementations(
        env: Env,
        current: CurrentImplementations,
    ) -> Result<(), ManagerError> {
        Self::require_admin(&env)?;
        let slots = [
            (&current.token, "Token", ManagerKey::CurrentTokenWasm),
            (
                &current.metadata,
                "Metadata",
                ManagerKey::CurrentMetadataWasm,
            ),
            (&current.auction, "Auction", ManagerKey::CurrentAuctionWasm),
            (
                &current.governor,
                "Governor",
                ManagerKey::CurrentGovernorWasm,
            ),
            (
                &current.treasury,
                "Treasury",
                ManagerKey::CurrentTreasuryWasm,
            ),
            (
                &current.marketplace,
                "Marketplace",
                ManagerKey::CurrentMarketplaceWasm,
            ),
            (
                &current.claims,
                "ClaimMinter",
                ManagerKey::CurrentClaimsWasm,
            ),
        ];
        for (hash, expected_name, _) in &slots {
            let implementation = Self::active_implementation(&env, hash)?;
            if implementation.name != String::from_str(&env, expected_name) {
                return Err(ManagerError::InvalidImplementationName);
            }
        }
        for (hash, _, key) in slots {
            env.storage().instance().set(&common::ns(&env, key), hash);
        }
        emit_current_implementations_updated(&env, &current);
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

    /// Create a new DAO: the four core contracts (Token, Metadata, Governor,
    /// Treasury) and the modules listed in `initial_config.modules`, deployed
    /// atomically, with each module registered on the Token.
    ///
    /// The launch administrator owns the setup window and may configure the
    /// contracts before `launch_dao`.
    ///
    /// # Authorization
    ///
    /// Requires BOTH `params.deployer` and `params.launch_admin` to authorize
    /// the call (one signature if they are the same address). Module
    /// constructors do not require auth.
    ///
    /// The requested slug is validated and must not belong to a launched DAO,
    /// but it is only claimed at `launch_dao` (pending DAOs hold no slug, so an
    /// abandoned creation blocks nothing).
    ///
    /// # Errors
    ///
    /// * `FactoryPaused` - Factory is paused
    /// * `CurrentImplementationsNotSet` - Current WASM hashes not configured
    /// * `InvalidModules` - A kind listed twice, or no Auction or Marketplace
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
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }

        // Validate configuration; the slug is claimed only at launch.
        let config = &params.initial_config;
        Self::validate_initial_config(&env, config)?;
        Self::require_slug_unclaimed(&env, &config.slug)?;
        let governance = &config.governance;

        // Load current implementation hashes, rejecting unset or revoked ones in one pass.
        let token_wasm = Self::current_wasm(&env, &ManagerKey::CurrentTokenWasm, "Token")?;
        let metadata_wasm = Self::current_wasm(&env, &ManagerKey::CurrentMetadataWasm, "Metadata")?;
        let governor_wasm = Self::current_wasm(&env, &ManagerKey::CurrentGovernorWasm, "Governor")?;
        let treasury_wasm = Self::current_wasm(&env, &ManagerKey::CurrentTreasuryWasm, "Treasury")?;
        let mut module_wasms: Vec<BytesN<32>> = Vec::new(&env);
        for spec in config.modules.iter() {
            module_wasms.push_back(Self::current_wasm(
                &env,
                &spec.current_wasm_key(),
                spec.implementation_name(),
            )?);
        }

        // Predict the core addresses so each constructor can be given the
        // others (Token, Metadata, Governor and Treasury reference each other).
        let salt = |module: &str| Self::generate_salt(&env, &params.deployer, params.nonce, module);
        let token_deployer = env.deployer().with_current_contract(salt("token"));
        let token_addr = token_deployer.deployed_address();
        let metadata_deployer = env.deployer().with_current_contract(salt("metadata"));
        let metadata_addr = metadata_deployer.deployed_address();
        let treasury_deployer = env.deployer().with_current_contract(salt("treasury"));
        let treasury_addr = treasury_deployer.deployed_address();
        let governor_deployer = env.deployer().with_current_contract(salt("governor"));
        let governor_addr = governor_deployer.deployed_address();

        // Treasury (needs the governor).
        treasury_deployer.deploy_v2(
            treasury_wasm.clone(),
            (
                params.launch_admin.clone(),
                governor_addr.clone(),
                env.current_contract_address(),
                treasury_wasm.clone(),
            ),
        );

        // Token with the launch admin as admin; modules are registered below.
        token_deployer.deploy_v2(
            token_wasm.clone(),
            (
                params.launch_admin.clone(),
                treasury_addr.clone(),
                config.token_name.clone(),
                config.token_symbol.clone(),
                metadata_addr.clone(),
                env.current_contract_address(),
                token_wasm.clone(),
            ),
        );

        // Metadata with empty artwork. The launch administrator can replace the
        // settings and add artwork before launch.
        let empty_property_names: Vec<String> = Vec::new(&env);
        let empty_items: Vec<Val> = Vec::new(&env);
        metadata_deployer.deploy_v2(
            metadata_wasm.clone(),
            (
                token_addr.clone(),
                config.profile.clone(),
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
            ),
        );

        // Governor with the requested timing; the launch admin may replace
        // it before launch.
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
            ),
        );

        let mut addresses = DaoAddresses {
            token: token_addr.clone(),
            metadata: metadata_addr.clone(),
            governor: governor_addr.clone(),
            treasury: treasury_addr.clone(),
            auction: None,
            marketplace: None,
            claims: None,
        };
        let mut wasm_hashes = DaoWasmHashes {
            token: token_wasm,
            metadata: metadata_wasm,
            governor: governor_wasm,
            treasury: treasury_wasm,
            auction: None,
            marketplace: None,
            claims: None,
        };
        let mut pending = PendingDao {
            addresses: addresses.clone(),
            launch_admin: params.launch_admin.clone(),
            slug: config.slug.clone(),
            auction_payment_asset: None,
            marketplace_payment_asset: None,
            claims_payment_asset: None,
        };

        // Modules: deployed paused or empty, wired to the real (predicted)
        // Token and Treasury, then registered on the Token. They receive
        // allowances at launch (or from the launch admin, for ClaimMinter).
        let nft = NftClient::new(&env, &token_addr);
        for (spec, wasm) in config.modules.iter().zip(module_wasms.iter()) {
            let address = Self::deploy_module(
                &env,
                salt(spec.kind_str()),
                &spec,
                &wasm,
                &params.launch_admin,
                &token_addr,
                &treasury_addr,
            );
            let kind = spec.kind(&env);
            nft.register_module(
                &kind,
                &address,
                &common::modules::builtin_non_voting(&env, &kind),
            );
            Self::record_module(&mut pending, &spec, &address);
            match spec {
                ModuleSpec::Auction(_) => wasm_hashes.auction = Some(wasm),
                ModuleSpec::Marketplace(_) => wasm_hashes.marketplace = Some(wasm),
                ModuleSpec::Claims(_) => wasm_hashes.claims = Some(wasm),
            }
        }
        addresses = pending.addresses.clone();

        // One persistent entry per pending DAO; no expiry semantics. Archived
        // entries are restorable, so an abandoned creation only costs its creator's rent.
        set_persistent(&env, &ManagerKey::PendingDao(token_addr.clone()), &pending);

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

    /// Deploy a module for an existing DAO from the current implementation
    /// of `spec`'s kind (docs/designs/membership-models.md §2). Needs the
    /// authorization of the Token's admin: the launch admin in Setup, the
    /// Treasury (by proposal) once Live.
    ///
    /// The module lands at `predict_module_address(token, kind, n)` with
    /// `n = module_count(token, kind)`, and `expected_n` must equal that `n`
    /// (`StaleModuleIndex`). A proposal reads `module_count` while drafting
    /// and bakes the same `n` into this action, so it either deploys exactly
    /// the module its later actions target or the whole execution reverts.
    ///
    /// - **Setup:** the module is registered on the Token, and its payment
    ///   asset recorded for the launch check; `launch_dao` launches it.
    /// - **Live:** the module is launched at once (its admin is the
    ///   Treasury); the same proposal then registers it on the Token and
    ///   grants its allowance. A module created after launch is not opened:
    ///   the proposal opens it once it holds an allowance.
    ///
    /// # Errors
    ///
    /// * `FactoryPaused` - Factory is paused
    /// * `DaoNotFound` - `token` is not a DAO this Manager created
    /// * `StaleModuleIndex` - `expected_n` is not `module_count(token, kind)`
    /// * `CurrentImplementationsNotSet` / `ImplementationNotFound` - no usable
    ///   implementation for the kind
    pub fn create_module(
        env: Env,
        token: Address,
        spec: ModuleSpec,
        expected_n: u32,
    ) -> Result<Address, ManagerError> {
        extend_instance_ttl(&env);
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }
        let pending: Option<PendingDao> =
            get_persistent(&env, &ManagerKey::PendingDao(token.clone()));
        if pending.is_none() && !has_persistent(&env, &ManagerKey::DaoSlug(token.clone())) {
            return Err(ManagerError::DaoNotFound);
        }
        let nft = NftClient::new(&env, &token);
        let admin = nft.admin();
        admin.require_auth();
        let kind = spec.kind(&env);
        let n = Self::module_count(env.clone(), token.clone(), kind.clone());
        if expected_n != n {
            return Err(ManagerError::StaleModuleIndex);
        }
        Self::validate_module_spec(&spec)?;
        let wasm = Self::current_wasm(&env, &spec.current_wasm_key(), spec.implementation_name())?;
        let treasury = nft.treasury();
        let address = Self::deploy_module(
            &env,
            Self::module_salt(&env, &token, &kind, n),
            &spec,
            &wasm,
            &admin,
            &token,
            &treasury,
        );
        set_persistent(
            &env,
            &ManagerKey::ModuleCount(token.clone(), kind.clone()),
            &(n + 1),
        );
        match pending {
            Some(mut pending) => {
                nft.register_module(
                    &kind,
                    &address,
                    &common::modules::builtin_non_voting(&env, &kind),
                );
                Self::record_module(&mut pending, &spec, &address);
                set_persistent(&env, &ManagerKey::PendingDao(token.clone()), &pending);
            }
            None => DaoModuleClient::new(&env, &address).launch(&treasury, &false),
        }
        emit_module_created(&env, &token, &kind, n, &address);
        Ok(address)
    }

    /// Modules of `kind` `create_module` deployed for `token` so far: the `n`
    /// the next one is deployed with.
    pub fn module_count(env: Env, token: Address, kind: Symbol) -> u32 {
        get_persistent(&env, &ManagerKey::ModuleCount(token, kind)).unwrap_or(0)
    }

    /// Where `create_module(token, <kind>, n)` deploys. A pure function of
    /// its inputs and this Manager's address.
    pub fn predict_module_address(env: Env, token: Address, kind: Symbol, n: u32) -> Address {
        env.deployer()
            .with_current_contract(Self::module_salt(&env, &token, &kind, n))
            .deployed_address()
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
        // The drive reserved `pending.slug`; the two must not drift apart.
        if has_persistent(&env, &ManagerKey::Assurance(token_address.clone())) {
            return Err(ManagerError::AssuranceOpen);
        }
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
    /// # Validation
    ///
    /// - The factory must not be paused (`FactoryPaused`)
    /// - Token voting supply must be > 0 (at least one token minted to a holder
    ///   other than the Treasury or a non-voting module)
    /// - launch_admin must be the current token admin (`LaunchAdminNotOwner`)
    /// - The requested slug must still be unclaimed (`SlugTaken`; change it with
    ///   `update_pending_slug`)
    /// - The core contracts and every registered module must CURRENTLY run a
    ///   registered, non-revoked hash (`PendingDaoUsesRevokedImplementation`)
    /// - Every module's `payment_asset()` must equal the asset recorded at its
    ///   creation (`PaymentAssetMismatch`)
    ///
    /// All checks run before any launch call, so a refusal launches nothing.
    ///
    /// # Effects
    ///
    /// 1. `token.launch` with an unlimited allowance for the Auction if
    ///    `launch_auction`; the Marketplace is funded per pool by proposal and
    ///    the ClaimMinter keeps what the launch admin granted
    /// 2. `launch` on the Governor and Treasury, then `DaoModule::launch` on
    ///    every registered module (the Auction opens with `launch_auction`, the
    ///    Marketplace with `launch_marketplace`), then the Metadata
    /// 3. Every contract is Live with the Treasury as admin; the Manager has no
    ///    further authority over the DAO (a second launch panics `AlreadyLive`)
    /// 4. Claims the slug and deletes the PendingDao state
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
        // During an assurance drive the stored config wins, so the launch
        // admin cannot change what members signed up for.
        let assurance: Option<Assurance> =
            get_persistent(&env, &ManagerKey::Assurance(token_address.clone()));
        let config = assurance
            .as_ref()
            .map_or(launch_config, |a| a.launch_config.clone());
        Self::launch_pending(&env, &token_address, pending, config, assurance)
    }

    // ========================================================================
    // Assurance launch (docs/designs/membership-models.md §2)
    // ========================================================================

    /// Open a paid claim drive before launch: members claim (and pay into the
    /// ClaimMinter's escrow) until `threshold_claimers` distinct addresses
    /// have, then anyone may launch the DAO with `launch_config`
    /// (`launch_when_ready`). If the deadline passes first, the drive fails
    /// and members are refunded. Needs the launch admin's authorization.
    ///
    /// In one call it:
    /// 1. opens the list on the DAO's ClaimMinter, priced in the asset
    ///    recorded at its creation, and grants the ClaimMinter `total` mint
    ///    allowance;
    /// 2. records the drive (list, deadline, launch config) and reserves the
    ///    DAO's slug (`SlugClaimed`), so no other DAO can launch with it;
    /// 3. hands every contract's admin to the Treasury without going Live,
    ///    which freezes settings, artwork, mints, allowances, registrations
    ///    and upgrades until launch. Founders and artwork must be in place
    ///    before.
    ///
    /// Returns the list id.
    ///
    /// # Errors
    ///
    /// * `DaoNotFound` / `FactoryPaused` / `LaunchAdminNotOwner`
    /// * `AssuranceExists` - one drive per DAO
    /// * `NoClaimMinter` - the DAO has no registered ClaimMinter
    /// * `DeadlineTooFar` - more than `MAX_ASSURANCE_WINDOW` away
    /// * `SlugTaken` - another DAO launched with the slug
    /// * ClaimMinter errors for the list terms (block 7800)
    pub fn open_assurance(
        env: Env,
        token_address: Address,
        list: AssuranceListParams,
        launch_config: LaunchConfig,
    ) -> Result<u32, ManagerError> {
        extend_instance_ttl(&env);
        let pending: PendingDao =
            get_persistent(&env, &ManagerKey::PendingDao(token_address.clone()))
                .ok_or(ManagerError::DaoNotFound)?;
        pending.launch_admin.require_auth();
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }
        let assurance_key = ManagerKey::Assurance(token_address.clone());
        if has_persistent(&env, &assurance_key) {
            return Err(ManagerError::AssuranceExists);
        }
        let nft = NftClient::new(&env, &token_address);
        if nft.admin() != pending.launch_admin {
            return Err(ManagerError::LaunchAdminNotOwner);
        }
        let claim_minter = nft
            .module(&Symbol::new(&env, KIND_CLAIMS))
            .ok_or(ManagerError::NoClaimMinter)?;
        let asset = pending
            .claims_payment_asset
            .clone()
            .ok_or(ManagerError::NoClaimMinter)?;
        if list.deadline
            > env
                .ledger()
                .timestamp()
                .saturating_add(MAX_ASSURANCE_WINDOW)
        {
            return Err(ManagerError::DeadlineTooFar);
        }
        Self::require_slug_unclaimed(&env, &pending.slug)?;

        // 1. The list and its allowance (the ClaimMinter checks the terms,
        //    the artwork and the asset).
        let list_id = ClaimsClient::new(&env, &claim_minter).open_list(
            &list.root,
            &list.tree_uri,
            &asset,
            &list.price,
            &list.expires_at,
            &list.total,
            &Some(AssuranceTerms {
                threshold_claimers: list.threshold_claimers,
                deadline: list.deadline,
            }),
        );
        nft.increase_mint_allowance(&claim_minter, &list.total);

        // 2. The drive and its slug.
        let assurance = Assurance {
            claim_minter: claim_minter.clone(),
            list_id,
            deadline: list.deadline,
            launch_config: launch_config.clone(),
        };
        set_persistent(&env, &assurance_key, &assurance);
        Self::claim_slug(&env, &token_address, &pending.slug);

        // 3. Freeze: every admin moves to the Treasury, nothing goes Live.
        let addresses = &pending.addresses;
        let treasury = addresses.treasury.clone();
        nft.handoff(&treasury);
        for core in [
            &addresses.metadata,
            &addresses.governor,
            &addresses.treasury,
        ] {
            TreasuryLaunchClient::new(&env, core).handoff(&treasury);
        }
        for entry in nft.modules().iter() {
            DaoModuleClient::new(&env, &entry.address).handoff(&treasury);
        }

        AssuranceOpened {
            token_address,
            claim_minter,
            list_id,
            deadline: list.deadline,
            launch_auction: launch_config.launch_auction,
            launch_marketplace: launch_config.launch_marketplace,
        }
        .publish(&env);
        Ok(list_id)
    }

    /// Launch a DAO whose assurance list has met its threshold, with the
    /// stored launch config. Anyone may call it; no authorization.
    ///
    /// # Errors
    ///
    /// * `DaoNotFound` / `NoAssurance`
    /// * `AssuranceFailed` - the deadline passed first
    /// * `AssuranceNotMet` - fewer distinct claimers than the threshold
    /// * every `launch_dao` check
    pub fn launch_when_ready(env: Env, token_address: Address) -> Result<(), ManagerError> {
        extend_instance_ttl(&env);
        let pending: PendingDao =
            get_persistent(&env, &ManagerKey::PendingDao(token_address.clone()))
                .ok_or(ManagerError::DaoNotFound)?;
        let assurance: Assurance =
            get_persistent(&env, &ManagerKey::Assurance(token_address.clone()))
                .ok_or(ManagerError::NoAssurance)?;
        let config = assurance.launch_config.clone();
        Self::launch_pending(&env, &token_address, pending, config, Some(assurance))
    }

    /// Free the slug a failed drive reserved. Anyone may call it.
    ///
    /// # Errors
    ///
    /// * `DaoNotFound` / `NoAssurance`
    /// * `AssuranceNotFailed` - the drive may still launch
    /// * `SlugNotFound` - already released
    pub fn release_slug(env: Env, token_address: Address) -> Result<(), ManagerError> {
        extend_instance_ttl(&env);
        let pending: PendingDao =
            get_persistent(&env, &ManagerKey::PendingDao(token_address.clone()))
                .ok_or(ManagerError::DaoNotFound)?;
        let assurance: Assurance =
            get_persistent(&env, &ManagerKey::Assurance(token_address.clone()))
                .ok_or(ManagerError::NoAssurance)?;
        if !Self::drive_failed(&env, &token_address, &assurance) {
            return Err(ManagerError::AssuranceNotFailed);
        }
        let holder: Option<Address> =
            get_persistent(&env, &ManagerKey::SlugToDao(pending.slug.clone()));
        if holder != Some(token_address.clone()) {
            return Err(ManagerError::SlugNotFound);
        }
        remove_persistent(&env, &ManagerKey::SlugToDao(pending.slug.clone()));
        remove_persistent(&env, &ManagerKey::DaoSlug(token_address.clone()));
        SlugReleased {
            token_address,
            slug: pending.slug,
        }
        .publish(&env);
        Ok(())
    }

    /// Upgrade a failed drive's ClaimMinter, for refunds its code cannot pay
    /// (review B2). Only the launch admin recorded in PendingDao, only once
    /// the drive has failed (the Manager's own rule: the deadline passed and
    /// the Token is not Live; ClaimMinter's state machine is never asked), and
    /// only to a hash the registry approves for the running ClaimMinter.
    ///
    /// # Errors
    ///
    /// * `DaoNotFound` / `NoAssurance`
    /// * `AssuranceNotFailed` - the drive may still launch
    pub fn recover_claims(
        env: Env,
        token_address: Address,
        from_hash: BytesN<32>,
        to_hash: BytesN<32>,
    ) -> Result<(), ManagerError> {
        extend_instance_ttl(&env);
        let pending: PendingDao =
            get_persistent(&env, &ManagerKey::PendingDao(token_address.clone()))
                .ok_or(ManagerError::DaoNotFound)?;
        pending.launch_admin.require_auth();
        let assurance: Assurance =
            get_persistent(&env, &ManagerKey::Assurance(token_address.clone()))
                .ok_or(ManagerError::NoAssurance)?;
        if !Self::drive_failed(&env, &token_address, &assurance) {
            return Err(ManagerError::AssuranceNotFailed);
        }
        // The registry check happens here: the ClaimMinter cannot ask the
        // Manager back (re-entry). Same rule as every module upgrade.
        if !Self::is_upgrade_approved(env.clone(), from_hash.clone(), to_hash.clone()) {
            return Err(ManagerError::InvalidUpgradePath);
        }
        let version: ImplementationVersion =
            get_persistent(&env, &ManagerKey::Implementation(to_hash.clone()))
                .ok_or(ManagerError::ImplementationNotFound)?;
        ClaimsClient::new(&env, &assurance.claim_minter).recovery_upgrade(
            &from_hash,
            &to_hash,
            &version.version,
        );
        Ok(())
    }

    /// The pending DAO's assurance drive, if one is recorded.
    pub fn get_assurance(env: Env, token_address: Address) -> Option<Assurance> {
        extend_instance_ttl(&env);
        get_persistent(&env, &ManagerKey::Assurance(token_address))
    }

    /// Move a launched DAO to a new slug. The old slug is released at once and
    /// any DAO may claim it, from this same transaction on.
    ///
    /// # Authorization
    ///
    /// The token's admin, which after launch is the DAO's Treasury, so this
    /// only runs through a passed proposal (`treasury.execute`). This relies on
    /// the token having no admin transfer after launch (`common::admin::handoff`
    /// is one-shot); a token release that adds one must revisit this check.
    ///
    /// # Errors
    ///
    /// * `FactoryPaused` - Slug claims are stopped while the factory is paused
    /// * `SlugNotFound` - `token_address` is not a launched DAO (pending DAOs
    ///   use `update_pending_slug`)
    /// * `SlugUnchanged` - `new_slug` is the DAO's current slug
    /// * `InvalidSlug` / `SlugTaken` - Malformed slug, or claimed by a launched DAO
    pub fn change_slug(
        env: Env,
        token_address: Address,
        new_slug: String,
    ) -> Result<(), ManagerError> {
        extend_instance_ttl(&env);
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }
        // Only `launch_dao` writes DaoSlug, so this gates out unknown token
        // contracts before any call into them.
        let old_slug: String = get_persistent(&env, &ManagerKey::DaoSlug(token_address.clone()))
            .ok_or(ManagerError::SlugNotFound)?;
        NftClient::new(&env, &token_address).admin().require_auth();
        if new_slug == old_slug {
            return Err(ManagerError::SlugUnchanged);
        }
        Self::validate_slug(&new_slug)?;
        Self::require_slug_unclaimed(&env, &new_slug)?;

        remove_persistent(&env, &ManagerKey::SlugToDao(old_slug.clone()));
        set_persistent(
            &env,
            &ManagerKey::SlugToDao(new_slug.clone()),
            &token_address,
        );
        set_persistent(&env, &ManagerKey::DaoSlug(token_address.clone()), &new_slug);
        emit_slug_changed(&env, &token_address, &old_slug, &new_slug);
        Ok(())
    }

    pub fn get_pending_dao(env: Env, token_address: Address) -> Option<PendingDao> {
        extend_instance_ttl(&env);
        get_persistent(&env, &ManagerKey::PendingDao(token_address))
    }

    /// Token address of the launched DAO that claimed `slug`.
    ///
    /// Plain read: does not extend TTL (the DAO's storage sweep renews the slug entries).
    pub fn get_dao_by_slug(env: Env, slug: String) -> Result<Address, ManagerError> {
        extend_instance_ttl(&env);
        env.storage()
            .persistent()
            .get(&common::ns(&env, ManagerKey::SlugToDao(slug)))
            .ok_or(ManagerError::SlugNotFound)
    }

    /// Slug claimed by a launched DAO, if any (a pending DAO's requested slug
    /// is in `get_pending_dao`).
    pub fn get_slug(env: Env, token_address: Address) -> Option<String> {
        extend_instance_ttl(&env);
        env.storage()
            .persistent()
            .get(&common::ns(&env, ManagerKey::DaoSlug(token_address)))
    }

    /// Predict DAO addresses without deploying.
    ///
    /// Useful for frontends to show addresses before user confirms deployment.
    /// Every module kind `create_dao` can deploy is predicted; a DAO created
    /// without one simply never uses its address.
    pub fn predict_addresses(
        env: Env,
        creator: Address,
        nonce: u64,
    ) -> Result<DaoAddresses, ManagerError> {
        extend_instance_ttl(&env);
        let predict = |module: &str| {
            env.deployer()
                .with_current_contract(Self::generate_salt(&env, &creator, nonce, module))
                .deployed_address()
        };
        Ok(DaoAddresses {
            token: predict("token"),
            metadata: predict("metadata"),
            governor: predict("governor"),
            treasury: predict("treasury"),
            auction: Some(predict(KIND_AUCTION)),
            marketplace: Some(predict(KIND_MARKETPLACE)),
            claims: Some(predict(KIND_CLAIMS)),
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
            .get(&common::ns(&env, ManagerKey::CurrentManagerWasm))
            .ok_or(ManagerError::InvalidVersion)?;

        let current_version: String = env
            .storage()
            .instance()
            .get(&common::ns(&env, ManagerKey::CurrentManagerVersion))
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
        // The approval must exist and its notice must have passed: the Manager
        // is every DAO's registry and factory, so its code never changes
        // without warning.
        let approved =
            Self::upgrade_approved_ledger(env.clone(), from_hash.clone(), to_hash.clone())
                .ok_or(ManagerError::InvalidUpgradePath)?;
        // Only to the announced latest, and the notice counts from the later of
        // the approval and the announcement, so a quietly approved hash made
        // latest at the last moment still waits the full notice (D42).
        let latest = Self::latest_pointer(env.clone(), String::from_str(&env, "Manager"))
            .ok_or(ManagerError::UpgradeNotLatest)?;
        if latest.wasm_hash != to_hash {
            return Err(ManagerError::UpgradeNotLatest);
        }
        if !common::upgrade::notice_passed(&env, approved.max(latest.set_ledger)) {
            return Err(ManagerError::UpgradeDelayNotElapsed);
        }

        // Update Manager's stored hash and version
        env.storage()
            .instance()
            .set(&common::ns(&env, ManagerKey::CurrentManagerWasm), &to_hash);
        env.storage().instance().set(
            &common::ns(&env, ManagerKey::CurrentManagerVersion),
            &to_impl.version.clone(),
        );

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

    // ========================================================================
    // Helper Functions
    // ========================================================================

    /// Every launch path: checks, then launches `pending` with `launch_config`.
    /// With an assurance drive the list must be `Met` before its deadline
    /// (the Manager's failure rule decides `Failed`), the slug is already
    /// reserved, and the admins were already handed over.
    fn launch_pending(
        env: &Env,
        token_address: &Address,
        pending: PendingDao,
        launch_config: LaunchConfig,
        assurance: Option<Assurance>,
    ) -> Result<(), ManagerError> {
        let env = env.clone();
        let token_address = token_address.clone();
        if is_factory_paused(&env) {
            return Err(ManagerError::FactoryPaused);
        }
        let addresses = pending.addresses.clone();
        let treasury = addresses.treasury.clone();
        // Typed clients (common::clients) rather than the module crates:
        // linking those would export their functions from the Manager WASM.
        let nft = NftClient::new(&env, &addresses.token);
        match &assurance {
            Some(drive) => {
                if Self::drive_failed(&env, &token_address, drive) {
                    return Err(ManagerError::AssuranceFailed);
                }
                // Only `Met` is read from the ClaimMinter.
                let state =
                    ClaimsClient::new(&env, &drive.claim_minter).assurance_state(&drive.list_id);
                if state != AssuranceState::Met {
                    return Err(ManagerError::AssuranceNotMet);
                }
            }
            None => {
                if nft.admin() != pending.launch_admin {
                    return Err(ManagerError::LaunchAdminNotOwner);
                }
            }
        }
        // A drive already reserved the slug; otherwise it must still be free.
        let slug_held = get_persistent::<String>(&env, &ManagerKey::DaoSlug(token_address.clone()))
            == Some(pending.slug.clone());
        if !slug_held {
            Self::require_slug_unclaimed(&env, &pending.slug)?;
        }
        let registry = nft.modules();
        // Every contract must currently run a registered, non-revoked hash. The
        // CURRENT hash is read from each (not the one recorded at create_dao)
        // so a pre-launch `upgrade` to an approved hash is honored.
        let mut contracts: Vec<Address> = Vec::from_array(
            &env,
            [
                addresses.token.clone(),
                addresses.metadata.clone(),
                addresses.governor.clone(),
                addresses.treasury.clone(),
            ],
        );
        for entry in registry.iter() {
            contracts.push_back(entry.address);
        }
        for contract in contracts.iter() {
            let current = WasmHashClient::new(&env, &contract).wasm_hash();
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
        // Payment assets are tunable in Setup; each module launches only with
        // the asset recorded when it was created.
        for entry in registry.iter() {
            let recorded = Self::recorded_asset(&env, &pending, &entry.kind);
            let current = DaoModuleClient::new(&env, &entry.address).payment_asset();
            if recorded != Some(current) {
                return Err(ManagerError::PaymentAssetMismatch);
            }
        }

        // Only a started Auction gets an allowance at launch (unlimited: it
        // sells one token per auction). The Marketplace mints only pool stock,
        // funded by the proposal that opens each pool; the ClaimMinter keeps
        // what the launch admin granted. The Treasury needs none (as admin it
        // mints without limit).
        let mut grants: Vec<MintGrant> = Vec::new(&env);
        for entry in registry.iter() {
            let unlimited = launch_config.launch_auction
                && common::modules::kind_is(&env, &entry.kind, KIND_AUCTION);
            if unlimited {
                grants.push_back(MintGrant {
                    module: entry.address,
                    allowance: u32::MAX,
                });
            }
        }

        // One-shot handoff. The token launches first so the auction holds an
        // allowance when it creates its first auction.
        nft.launch(&treasury, &grants);
        TreasuryLaunchClient::new(&env, &addresses.governor).launch(&treasury);
        TreasuryLaunchClient::new(&env, &addresses.treasury).launch(&treasury);
        for entry in registry.iter() {
            let open = if common::modules::kind_is(&env, &entry.kind, KIND_AUCTION) {
                launch_config.launch_auction
            } else if common::modules::kind_is(&env, &entry.kind, KIND_MARKETPLACE) {
                launch_config.launch_marketplace
            } else {
                false
            };
            DaoModuleClient::new(&env, &entry.address).launch(&treasury, &open);
        }
        TreasuryLaunchClient::new(&env, &addresses.metadata).launch(&treasury);

        // Claim the slug (held until `change_slug`, renewed by the DAO's
        // storage sweep) and delete the pending DAO state.
        if !slug_held {
            Self::claim_slug(&env, &token_address, &pending.slug);
        }
        remove_persistent(&env, &ManagerKey::PendingDao(token_address.clone()));
        remove_persistent(&env, &ManagerKey::Assurance(token_address.clone()));

        emit_dao_launched(
            &env,
            &token_address,
            env.ledger().sequence() as u64,
            &pending.addresses,
            launch_config.launch_auction,
            launch_config.launch_marketplace,
            &registry,
        );
        Ok(())
    }

    /// The Manager's failure rule (review 2 A3): the deadline passed and the
    /// Token is not Live. ClaimMinter's `refund` applies the same rule.
    fn drive_failed(env: &Env, token: &Address, assurance: &Assurance) -> bool {
        env.ledger().timestamp() > assurance.deadline && !NftClient::new(env, token).is_live()
    }

    /// Record `slug` as `token`'s (`SlugToDao`, `DaoSlug`, `SlugClaimed`).
    fn claim_slug(env: &Env, token: &Address, slug: &String) {
        set_persistent(env, &ManagerKey::SlugToDao(slug.clone()), token);
        set_persistent(env, &ManagerKey::DaoSlug(token.clone()), slug);
        emit_slug_claimed(env, token, slug);
    }

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

    /// The hashes `create_dao` and `create_module` deploy from, or `None`
    /// before `set_current_implementations`. Raw values: a hash revoked since
    /// it was set is still returned (DAOs created from it still run it), which
    /// is what platform code renewal needs. `create_dao` itself rechecks each.
    pub fn current_implementations(env: Env) -> Option<CurrentImplementations> {
        let read = |key: ManagerKey| -> Option<BytesN<32>> {
            env.storage().instance().get(&common::ns(&env, key))
        };
        Some(CurrentImplementations {
            token: read(ManagerKey::CurrentTokenWasm)?,
            metadata: read(ManagerKey::CurrentMetadataWasm)?,
            auction: read(ManagerKey::CurrentAuctionWasm)?,
            governor: read(ManagerKey::CurrentGovernorWasm)?,
            treasury: read(ManagerKey::CurrentTreasuryWasm)?,
            marketplace: read(ManagerKey::CurrentMarketplaceWasm)?,
            claims: read(ManagerKey::CurrentClaimsWasm)?,
        })
    }

    /// The hash announced as latest for `name` and the ledger it was announced
    /// at (D42). Unlike `get_latest_implementation`, a revoked hash is still
    /// returned: the pointer is what the platform's upgrade rule and the app's
    /// pending-upgrade display read.
    pub fn latest_pointer(env: Env, name: String) -> Option<LatestPointer> {
        get_persistent(&env, &ManagerKey::LatestImplementation(name))
    }

    /// The upgrade notice in force for `upgrade_manager`.
    pub fn upgrade_delay(env: Env) -> u32 {
        common::upgrade::delay(&env)
    }

    /// Change the Manager's upgrade notice (admin). A longer notice applies
    /// at once; a shorter one only after the notice in force has passed.
    pub fn set_upgrade_delay(env: Env, ledgers: u32) -> Result<(), ManagerError> {
        Self::require_admin(&env)?;
        common::upgrade::set_delay(&env, ledgers);
        Ok(())
    }

    /// Ledger at which `approve_upgrade(from, to)` was recorded, if it was.
    /// `upgrade_manager` waits `upgrade_delay()` after it.
    pub fn upgrade_approved_ledger(
        env: Env,
        from_hash: BytesN<32>,
        to_hash: BytesN<32>,
    ) -> Option<u64> {
        get_persistent::<UpgradeApproval>(&env, &ManagerKey::UpgradeApproval(from_hash, to_hash))
            .map(|approval| approval.approved_ledger)
    }

    /// Load a `Current*Wasm` hash, verify it is an active implementation with the
    /// expected name, and return it with its registered version.
    fn current_wasm(
        env: &Env,
        key: &ManagerKey,
        expected_name: &str,
    ) -> Result<BytesN<32>, ManagerError> {
        let hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&common::ns(env, key.clone()))
            .ok_or(ManagerError::CurrentImplementationsNotSet)?;
        let implementation = Self::active_implementation(env, &hash)?;
        if implementation.name != String::from_str(env, expected_name) {
            return Err(ManagerError::ImplementationNotFound);
        }
        Ok(hash)
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

    /// `create_module`'s salt: `sha256(xdr(token) || xdr(kind) || n_be)`.
    fn module_salt(env: &Env, token: &Address, kind: &Symbol, n: u32) -> BytesN<32> {
        use soroban_sdk::xdr::ToXdr;
        let mut bytes = token.clone().to_xdr(env);
        bytes.append(&kind.clone().to_xdr(env));
        bytes.append(&Bytes::from_array(env, &n.to_be_bytes()));
        env.crypto().sha256(&bytes).into()
    }

    /// Deploy `spec` at `salt` from `wasm`, wired to `token` and `treasury`,
    /// with `admin` as its admin and this Manager as its launcher.
    fn deploy_module(
        env: &Env,
        salt: BytesN<32>,
        spec: &ModuleSpec,
        wasm: &BytesN<32>,
        admin: &Address,
        token: &Address,
        treasury: &Address,
    ) -> Address {
        let deployer = env.deployer().with_current_contract(salt);
        let manager = env.current_contract_address();
        match spec {
            ModuleSpec::Auction(c) => deployer.deploy_v2(
                wasm.clone(),
                (
                    admin.clone(),
                    token.clone(),
                    treasury.clone(),
                    c.duration,
                    c.reserve_price,
                    MIN_BID_INCREMENT_PERCENT,
                    c.time_buffer,
                    c.payment_asset.clone(),
                    manager,
                    wasm.clone(),
                ),
            ),
            ModuleSpec::Marketplace(c) => deployer.deploy_v2(
                wasm.clone(),
                (
                    token.clone(),
                    admin.clone(),
                    treasury.clone(),
                    c.payment_asset.clone(),
                    manager,
                    wasm.clone(),
                    c.secondary_fee_bps,
                ),
            ),
            ModuleSpec::Claims(c) => deployer.deploy_v2(
                wasm.clone(),
                (
                    admin.clone(),
                    token.clone(),
                    treasury.clone(),
                    manager,
                    c.payment_asset.clone(),
                    wasm.clone(),
                ),
            ),
        }
    }

    /// Record a Setup module's address and creation asset in `pending`.
    fn record_module(pending: &mut PendingDao, spec: &ModuleSpec, address: &Address) {
        let asset = Some(spec.payment_asset());
        match spec {
            ModuleSpec::Auction(_) => {
                pending.addresses.auction = Some(address.clone());
                pending.auction_payment_asset = asset;
            }
            ModuleSpec::Marketplace(_) => {
                pending.addresses.marketplace = Some(address.clone());
                pending.marketplace_payment_asset = asset;
            }
            ModuleSpec::Claims(_) => {
                pending.addresses.claims = Some(address.clone());
                pending.claims_payment_asset = asset;
            }
        }
    }

    /// The asset recorded in `pending` for a module of `kind`.
    fn recorded_asset(env: &Env, pending: &PendingDao, kind: &Symbol) -> Option<Address> {
        if common::modules::kind_is(env, kind, KIND_AUCTION) {
            pending.auction_payment_asset.clone()
        } else if common::modules::kind_is(env, kind, KIND_MARKETPLACE) {
            pending.marketplace_payment_asset.clone()
        } else if common::modules::kind_is(env, kind, KIND_CLAIMS) {
            pending.claims_payment_asset.clone()
        } else {
            None
        }
    }

    /// The profile is event-only and may be longer than other strings.
    fn validate_profile(profile: &String) -> Result<(), ManagerError> {
        let len = profile.len();
        if len == 0 {
            return Err(ManagerError::StringEmpty);
        }
        if len > common::MAX_PROFILE_LENGTH {
            return Err(ManagerError::StringTooLong);
        }
        Ok(())
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

    fn validate_initial_config(
        env: &Env,
        config: &InitialDaoConfigValues,
    ) -> Result<(), ManagerError> {
        for value in [
            &config.token_name,
            &config.token_symbol,
            &config.renderer_base,
        ] {
            Self::validate_string(value)?;
        }
        // OpenZeppelin's caps, checked here so create_dao fails with a Manager
        // error instead of inside the token constructor.
        if config.token_name.len() > MAX_TOKEN_NAME_LENGTH
            || config.token_symbol.len() > MAX_TOKEN_SYMBOL_LENGTH
        {
            return Err(ManagerError::StringTooLong);
        }
        Self::validate_profile(&config.profile)?;
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

        // Each kind at most once. Phase 1 (cut line) still requires the
        // Auction and the Marketplace; Phase 4 drops this rule.
        let mut kinds: Vec<Symbol> = Vec::new(env);
        for spec in config.modules.iter() {
            let kind = spec.kind(env);
            if kinds.contains(&kind) {
                return Err(ManagerError::InvalidModules);
            }
            kinds.push_back(kind);
            Self::validate_module_spec(&spec)?;
        }
        for required in [KIND_AUCTION, KIND_MARKETPLACE] {
            if !kinds.contains(Symbol::new(env, required)) {
                return Err(ManagerError::InvalidModules);
            }
        }
        Ok(())
    }

    /// Bounds on a module's creation config (each module checks them again).
    fn validate_module_spec(spec: &ModuleSpec) -> Result<(), ManagerError> {
        match spec {
            ModuleSpec::Auction(auction) => {
                if auction.duration < MIN_AUCTION_DURATION
                    || auction.duration > MAX_AUCTION_DURATION
                {
                    return Err(ManagerError::InvalidDuration);
                }
                if auction.reserve_price < MIN_RESERVE_PRICE {
                    return Err(ManagerError::InvalidParamBounds);
                }
                if auction.time_buffer == 0 || auction.time_buffer > MAX_AUCTION_TIME_BUFFER {
                    return Err(ManagerError::InvalidTimeBuffer);
                }
            }
            ModuleSpec::Marketplace(marketplace) => {
                if marketplace.secondary_fee_bps > MAX_FEE_BPS {
                    return Err(ManagerError::InvalidFee);
                }
            }
            ModuleSpec::Claims(_) => {}
        }
        Ok(())
    }
}
