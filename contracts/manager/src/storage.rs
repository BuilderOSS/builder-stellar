//! Storage keys and data structures for the Manager contract.

use soroban_sdk::{contracttype, Address, BytesN, Env, IntoVal, String, TryFromVal, Val};

/// Ledgers per day at 5s per ledger.
const DAY_IN_LEDGERS: u32 = 17_280;
/// Persistent and instance entries are extended on touch to a nominal 1 year;
/// the network caps this at ~180 days (max_entry_ttl) and it renews on touch.
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
    /// The platform minter the launch admin saw and approves. Required (and
    /// must equal the registered PlatformMinter) when `enable_minter` is set,
    /// so a Manager admin cannot swap the minter between signing and launch.
    /// Ignored when `enable_minter` is false.
    pub expected_minter: Option<Address>,
}

/// WASM hashes the six modules were deployed from (emitted in `DaoCreated`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoWasmHashes {
    pub token: BytesN<32>,
    pub metadata: BytesN<32>,
    pub auction: BytesN<32>,
    pub governor: BytesN<32>,
    pub treasury: BytesN<32>,
    pub marketplace: BytesN<32>,
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
///
/// Module WASM hashes are deliberately NOT stored: `launch_dao` reads each
/// module's current `wasm_hash()` and checks it against the registry, so a
/// pre-launch owner `upgrade` is honored and a revoked hash is rejected.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingDao {
    pub addresses: DaoAddresses,
    pub launch_admin: Address,
    /// Auction payment token chosen at create_dao; launch refuses if it changed.
    pub auction_payment_asset: Address,
    /// Marketplace payment asset chosen at create_dao; launch refuses if it changed.
    pub marketplace_payment_asset: Address,
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
    common::ttl::extend_instance(env);
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
