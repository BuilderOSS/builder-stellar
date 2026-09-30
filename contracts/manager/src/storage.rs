//! Storage keys and data structures for the Manager contract.

use soroban_sdk::{contracttype, Address, BytesN, Env, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImplementationVersion {
    pub name: String,
    pub version: u32,
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
pub struct FounderAllocation {
    pub address: Address,
    pub amount: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArtworkItem {
    pub property_id: u32,
    pub name: String,
    pub is_new_property: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArtworkIpfsGroup {
    pub base_uri: String,
    pub extension: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoCreationParams {
    pub deployer: Address,
    pub nonce: u64,
    pub token_name: String,
    pub token_symbol: String,
    pub token_uri: String,
    pub project_uri: String,
    pub description: String,
    pub contract_image: String,
    pub renderer_base: String,
    pub artwork_property_names: Vec<String>,
    pub artwork_items: Vec<ArtworkItem>,
    pub artwork_ipfs: ArtworkIpfsGroup,
    pub auction_duration: u64,
    pub reserve_price: i128,
    pub time_buffer: u64,
    pub payment_asset: Address,
    pub voting_delay: u64,
    pub voting_period: u64,
    pub quorum_bps: u32,
    pub proposal_threshold_bps: u32,
    pub founders: Vec<FounderAllocation>,
    pub launch_admin: Address,
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
    pub creator: Address,
    pub launch_admin: Address,
    pub founder_supply: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoModules {
    pub token: Address,
    pub metadata: Address,
    pub auction: Address,
    pub governor: Address,
    pub treasury: Address,
    pub marketplace: Address,
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
    PendingDao(Address),
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&ManagerKey::Admin)
}

pub fn set_admin(env: &Env, admin: &Address) {
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
