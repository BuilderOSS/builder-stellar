//! Storage keys and data structures for the Manager contract.
//!
//! This module defines the storage structure for:
//! 1. Implementation Management - WASM hash registry and upgrade approvals
//! 2. DAO Factory - Creation parameters and deployed DAOs
//! 3. DAO Registry - DAO discovery and enumeration

use soroban_sdk::{contracttype, Address, BytesN, Env, String, Vec};

// ============================================================================
// Implementation Management
// ============================================================================

/// Represents a registered contract implementation version.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImplementationVersion {
    /// Implementation name (e.g., "Token", "Governor", "Metadata")
    pub name: String,
    /// Version number (monotonically increasing)
    pub version: u32,
    /// WASM bytecode hash
    pub wasm_hash: BytesN<32>,
    /// Ledger sequence when published
    pub published_at: u64,
    /// Whether this implementation has been revoked (emergency measure)
    pub revoked: bool,
}

/// Represents an approved upgrade path between two implementations.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeApproval {
    /// Source WASM hash
    pub from_hash: BytesN<32>,
    /// Target WASM hash
    pub to_hash: BytesN<32>,
    /// Ledger sequence when approved
    pub approved_at: u64,
}

// ============================================================================
// DAO Factory
// ============================================================================

/// Fixed founder allocation minted before the DAO is launched.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FounderAllocation {
    /// Founder address receiving tokens
    pub address: Address,
    /// Number of NFTs to mint
    pub amount: u32,
}

/// Complete parameters for creating a new DAO.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoCreationParams {
    /// Who's creating this DAO
    pub deployer: Address,
    /// Uniqueness key (user increments to avoid collisions)
    pub nonce: u64,

    // Token configuration
    pub token_name: String,
    pub token_symbol: String,
    pub token_uri: String,

    // Metadata configuration
    pub project_uri: String,
    pub description: String,
    pub contract_image: String,
    pub renderer_base: String,

    // Auction configuration
    pub auction_duration: u64,
    pub reserve_price: i128,
    pub time_buffer: u64,
    pub payment_asset: Address,

    // Governance configuration
    pub voting_delay: u64,
    pub voting_period: u64,
    pub quorum_bps: u32,
    pub proposal_threshold_bps: u32,

    // Founder configuration
    pub founders: Vec<FounderAllocation>,

    // Launch configuration
    pub launch_admin: Address,
}

/// Addresses of all deployed DAO modules.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoAddresses {
    pub token: Address,
    pub metadata: Address,
    pub auction: Address,
    pub governor: Address,
    pub treasury: Address,
}

/// Complete record of a DAO creation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoCreation {
    /// All module addresses
    pub addresses: DaoAddresses,
    /// Creator address
    pub creator: Address,
    /// Ledger sequence when created
    pub created_ledger: u32,
    /// Timestamp when created
    pub created_at: u64,
    /// Creation parameters
    pub params: DaoCreationParams,
}

// ============================================================================
// DAO Registry
// ============================================================================

/// Module addresses for a DAO (same as DaoAddresses but for registry context).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoModules {
    pub token: Address,
    pub metadata: Address,
    pub auction: Address,
    pub governor: Address,
    pub treasury: Address,
}

/// Metadata about a DAO.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoMetadata {
    /// DAO name
    pub name: String,
    /// Optional description (can be updated by governance)
    pub description: Option<String>,
}

/// Complete registration record for a DAO.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoRegistration {
    /// Token address (canonical DAO ID)
    pub token_address: Address,
    /// Creator address
    pub creator: Address,
    /// Ledger when created
    pub created_ledger: u32,
    /// Timestamp when created
    pub created_at: u64,
    /// Manager version that created this DAO
    pub factory_version: u32,
    /// All module addresses
    pub modules: DaoModules,
    /// DAO metadata
    pub metadata: DaoMetadata,
}

// ============================================================================
// Storage Keys
// ============================================================================

/// Storage keys for the Manager contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ManagerKey {
    // Admin and configuration
    Admin,
    FactoryPaused,
    FactoryVersion,

    // Implementation management
    Implementation(BytesN<32>),   // WASM hash → ImplementationVersion
    LatestImplementation(String), // name → WASM hash
    UpgradeApproval(BytesN<32>, BytesN<32>), // (from, to) → UpgradeApproval

    // Current implementation hashes (for factory use)
    CurrentTokenWasm,
    CurrentMetadataWasm,
    CurrentAuctionWasm,
    CurrentGovernorWasm,
    CurrentTreasuryWasm,

    // DAO factory
    DaoCreation(Address),    // token address → DaoCreation
    NonceUsed(Address, u64), // (creator, nonce) → bool

    // DAO registry
    DaoRegistration(Address), // token address → DaoRegistration
    DaoList,                  // Vec<Address> of all DAOs
    DaoCount,                 // u32 total count
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get the admin address.
pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&ManagerKey::Admin)
}

/// Set the admin address.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&ManagerKey::Admin, admin);
}

/// Check if factory is paused.
pub fn is_factory_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&ManagerKey::FactoryPaused)
        .unwrap_or(false)
}

/// Set factory pause state.
pub fn set_factory_paused(env: &Env, paused: bool) {
    env.storage()
        .instance()
        .set(&ManagerKey::FactoryPaused, &paused);
}

/// Get current factory version.
pub fn get_factory_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ManagerKey::FactoryVersion)
        .unwrap_or(1)
}

/// Set factory version.
pub fn set_factory_version(env: &Env, version: u32) {
    env.storage()
        .instance()
        .set(&ManagerKey::FactoryVersion, &version);
}

/// Get DAO count.
pub fn get_dao_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ManagerKey::DaoCount)
        .unwrap_or(0)
}

/// Set DAO count.
pub fn set_dao_count(env: &Env, count: u32) {
    env.storage().instance().set(&ManagerKey::DaoCount, &count);
}

/// Get all DAOs.
pub fn get_dao_list(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&ManagerKey::DaoList)
        .unwrap_or_else(|| Vec::new(env))
}

/// Set DAO list.
pub fn set_dao_list(env: &Env, list: &Vec<Address>) {
    env.storage().instance().set(&ManagerKey::DaoList, list);
}

/// Add a DAO to the list.
pub fn add_dao_to_list(env: &Env, token_address: &Address) {
    let mut list = get_dao_list(env);
    list.push_back(token_address.clone());
    set_dao_list(env, &list);

    let count = get_dao_count(env);
    set_dao_count(env, count + 1);
}

/// Check if a nonce has been used.
pub fn is_nonce_used(env: &Env, creator: &Address, nonce: u64) -> bool {
    env.storage()
        .instance()
        .get(&ManagerKey::NonceUsed(creator.clone(), nonce))
        .unwrap_or(false)
}

/// Mark a nonce as used.
pub fn set_nonce_used(env: &Env, creator: &Address, nonce: u64) {
    env.storage()
        .instance()
        .set(&ManagerKey::NonceUsed(creator.clone(), nonce), &true);
}
