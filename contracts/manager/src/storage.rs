//! Storage keys and data structures for the Manager contract.

use soroban_sdk::{contracttype, Address, BytesN, Env, IntoVal, String, TryFromVal, Val};

/// Ledgers per day at 5s per ledger.
const DAY_IN_LEDGERS: u32 = 17_280;
/// Persistent and instance entries are extended to ~1 year on touch.
pub const TTL_EXTEND_TO: u32 = 365 * DAY_IN_LEDGERS;
/// Extension only happens when remaining TTL drops below ~30 days.
pub const TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImplementationVersion {
    pub name: String,
    pub version: String,
    pub wasm_hash: BytesN<32>,
    pub published_at: u64,
    pub revoked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeApproval {
    pub from_hash: BytesN<32>,
    pub to_hash: BytesN<32>,
    pub approved_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArtworkIpfsGroup {
    pub base_uri: String,
    pub extension: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceConfig {
    pub voting_delay: u32,
    pub voting_period: u32,
    pub queue_delay: u32,
    pub proposal_threshold: u128,
    pub quorum_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionConfig {
    pub duration: u64,
    pub reserve_price: i128,
    pub time_buffer: u64,
    pub payment_asset: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceConfig {
    pub payment_asset: Address,
    pub secondary_fee_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InitialDaoConfigValues {
    pub token_name: String,
    pub token_symbol: String,
    pub token_uri: String,
    pub project_uri: String,
    pub description: String,
    pub contract_image: String,
    pub renderer_base: String,
    pub governance: GovernanceConfig,
    pub auction: AuctionConfig,
    pub marketplace: MarketplaceConfig,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LaunchConfig {
    pub launch_auction: bool,
    pub launch_marketplace: bool,
    /// Grant mint authority to the Manager-registered PlatformMinter. The
    /// caller can never name an arbitrary minter address.
    pub enable_minter: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoCreationParams {
    pub deployer: Address,
    pub nonce: u64,
    pub launch_admin: Address,
    pub initial_config: InitialDaoConfigValues,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoAddresses {
    pub token: Address,
    pub metadata: Address,
    pub auction: Address,
    pub governor: Address,
    pub treasury: Address,
    pub marketplace: Address,
}

/// The only factory state retained until the launch administrator finalizes a DAO.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingDao {
    pub addresses: DaoAddresses,
    pub launch_admin: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ManagerKey {
    Admin,
    FactoryPaused,
    Implementation(BytesN<32>),
    LatestImplementation(String),
    UpgradeApproval(BytesN<32>, BytesN<32>),
    CurrentTokenWasm,
    CurrentMetadataWasm,
    CurrentAuctionWasm,
    CurrentGovernorWasm,
    CurrentTreasuryWasm,
    CurrentMarketplaceWasm,
    CurrentManagerWasm,
    CurrentManagerVersion,
    PendingDao(Address),
    PendingAdmin,
    PlatformMinter,
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&ManagerKey::Admin)
}

pub fn write_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&ManagerKey::Admin, admin);
}

pub fn is_factory_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&ManagerKey::FactoryPaused)
        .unwrap_or(false)
}

pub fn set_factory_paused(env: &Env, paused: bool) {
    env.storage()
        .instance()
        .set(&ManagerKey::FactoryPaused, &paused);
}

/// Extend the Manager instance entry. Called by every entrypoint.
///
/// The instance entry holds only bounded keys (Admin, FactoryPaused, Current*),
/// so its size never grows with registrations or DAO creations.
pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Read a persistent entry and extend its TTL when present.
pub fn get_persistent<V: TryFromVal<Env, Val>>(env: &Env, key: &ManagerKey) -> Option<V> {
    let value = env.storage().persistent().get(key);
    if value.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
    value
}

/// Write a persistent entry and extend its TTL.
pub fn set_persistent<V: IntoVal<Env, Val>>(env: &Env, key: &ManagerKey, value: &V) {
    env.storage().persistent().set(key, value);
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn remove_persistent(env: &Env, key: &ManagerKey) {
    env.storage().persistent().remove(key);
}
