//! Storage keys and data structures for the Manager contract.

use soroban_sdk::{
    contracttype, Address, BytesN, Env, IntoVal, String, Symbol, TryFromVal, Val, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImplementationVersion {
    pub name: String,
    pub version: String,
    pub wasm_hash: BytesN<32>,
    /// Ledger sequence of the registration.
    pub published_ledger: u64,
    pub revoked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeApproval {
    pub from_hash: BytesN<32>,
    pub to_hash: BytesN<32>,
    /// Ledger sequence of the approval.
    pub approved_ledger: u64,
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

/// ClaimMinter creation config: the asset Setup lists are priced in.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimsConfig {
    pub payment_asset: Address,
}

/// A module the Manager deploys for a DAO (`create_dao` / `create_module`),
/// with its creation config. Each variant is one registry kind.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ModuleSpec {
    Auction(AuctionConfig),
    Marketplace(MarketplaceConfig),
    Claims(ClaimsConfig),
}

impl ModuleSpec {
    /// The registry kind (`common::modules::KIND_*`).
    pub fn kind_str(&self) -> &'static str {
        match self {
            ModuleSpec::Auction(_) => common::modules::KIND_AUCTION,
            ModuleSpec::Marketplace(_) => common::modules::KIND_MARKETPLACE,
            ModuleSpec::Claims(_) => common::modules::KIND_CLAIMS,
        }
    }

    pub fn kind(&self, env: &Env) -> Symbol {
        Symbol::new(env, self.kind_str())
    }

    /// The asset fixed in the creation config; the Manager compares the
    /// module's `payment_asset()` with it before launch.
    pub fn payment_asset(&self) -> Address {
        match self {
            ModuleSpec::Auction(c) => c.payment_asset.clone(),
            ModuleSpec::Marketplace(c) => c.payment_asset.clone(),
            ModuleSpec::Claims(c) => c.payment_asset.clone(),
        }
    }

    /// The registry name its implementations are registered under.
    pub fn implementation_name(&self) -> &'static str {
        match self {
            ModuleSpec::Auction(_) => "Auction",
            ModuleSpec::Marketplace(_) => "Marketplace",
            ModuleSpec::Claims(_) => "ClaimMinter",
        }
    }

    /// The `Current*Wasm` key `create_dao` / `create_module` deploy from.
    pub fn current_wasm_key(&self) -> ManagerKey {
        match self {
            ModuleSpec::Auction(_) => ManagerKey::CurrentAuctionWasm,
            ModuleSpec::Marketplace(_) => ManagerKey::CurrentMarketplaceWasm,
            ModuleSpec::Claims(_) => ManagerKey::CurrentClaimsWasm,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InitialDaoConfigValues {
    pub token_name: String,
    pub token_symbol: String,
    /// DAO profile JSON (description, links, image), 1 to
    /// `common::MAX_PROFILE_LENGTH` bytes. Event-only: the Metadata contract
    /// emits it and stores its hash.
    pub profile: String,
    /// Base URL of the image compositor used by the on-chain `token_uri`.
    pub renderer_base: String,
    /// Requested human-friendly DAO identifier (`[a-z0-9-]`, 4-63 chars).
    /// Claimed (unique) only at `launch_dao`; a launched DAO can move to a new
    /// slug by vote (`change_slug`).
    pub slug: String,
    pub governance: GovernanceConfig,
    /// The modules to deploy with the DAO, each kind at most once; all are
    /// optional (docs/designs/membership-models.md §2). More can be added
    /// later with `create_module`.
    pub modules: Vec<ModuleSpec>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LaunchConfig {
    /// Start the Auction (if the DAO has one) and grant it an allowance.
    pub launch_auction: bool,
    /// Open the Marketplace (if the DAO has one).
    pub launch_marketplace: bool,
}

/// The paid claim list a pending DAO's assurance drive opens (`open_assurance`),
/// priced in the DAO's recorded `claims_payment_asset`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssuranceListParams {
    pub root: BytesN<32>,
    pub tree_uri: String,
    /// Price per token (0 for a free drive that still needs its threshold).
    pub price: i128,
    /// Claims stop at this ledger timestamp (after launch, too).
    pub expires_at: u64,
    pub total: u32,
    /// Distinct claimers needed before the DAO may launch.
    pub threshold_claimers: u32,
    /// Ledger timestamp after which an unlaunched drive has failed.
    pub deadline: u64,
}

/// A recorded assurance drive: the ClaimMinter list, its deadline and the
/// launch config every launch path uses.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Assurance {
    pub claim_minter: Address,
    pub list_id: u32,
    pub deadline: u64,
    pub launch_config: LaunchConfig,
}

/// WASM hashes a DAO's contracts were deployed from (emitted in
/// `DaoCreated`); a module the DAO was created without is `None`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoWasmHashes {
    pub token: BytesN<32>,
    pub metadata: BytesN<32>,
    pub governor: BytesN<32>,
    pub treasury: BytesN<32>,
    pub auction: Option<BytesN<32>>,
    pub marketplace: Option<BytesN<32>>,
    pub claims: Option<BytesN<32>>,
}

/// The implementation hashes `create_dao` and `create_module` deploy from.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CurrentImplementations {
    pub token: BytesN<32>,
    pub metadata: BytesN<32>,
    pub auction: BytesN<32>,
    pub governor: BytesN<32>,
    pub treasury: BytesN<32>,
    pub marketplace: BytesN<32>,
    pub claims: BytesN<32>,
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
    pub governor: Address,
    pub treasury: Address,
    /// Modules deployed with the DAO (or added in Setup by `create_module`);
    /// `None` for a kind it does not have. The Token's registry is the
    /// source of truth for modules added later.
    pub auction: Option<Address>,
    pub marketplace: Option<Address>,
    pub claims: Option<Address>,
}

/// The only factory state retained until the launch administrator finalizes a DAO.
///
/// Module WASM hashes are deliberately NOT stored: `launch_dao` reads each
/// module's current `wasm_hash()` and checks it against the registry, so a
/// pre-launch admin `upgrade` is honored and a revoked hash is rejected.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingDao {
    pub addresses: DaoAddresses,
    pub launch_admin: Address,
    /// Requested slug; claimed at `launch_dao`, changeable with `update_pending_slug`.
    pub slug: String,
    /// Payment assets fixed in each module's creation config; launch refuses
    /// a module whose `payment_asset()` changed (`PaymentAssetMismatch`).
    /// `None` for a kind the DAO does not have.
    pub auction_payment_asset: Option<Address>,
    pub marketplace_payment_asset: Option<Address>,
    pub claims_payment_asset: Option<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ManagerKey {
    ManagerAdmin,
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
    /// slug -> token address, written at `launch_dao`, moved by `change_slug` (the old
    /// slug is removed). Renewed by the DAO's renewal sweep.
    SlugToDao(String),
    /// token address -> current slug, written at `launch_dao` and `change_slug`.
    /// Renewed by the DAO's renewal sweep.
    DaoSlug(Address),
    /// Instance: the ClaimMinter implementation `create_dao` deploys.
    CurrentClaimsWasm,
    /// (token, kind) -> u32: modules of `kind` `create_module` deployed for
    /// the DAO, the `n` in its salt. Persistent, renewed by the DAO's sweep.
    ModuleCount(Address, Symbol),
    /// token -> [`Assurance`], written by `open_assurance` and kept for the
    /// pending DAO's life (a failed drive keeps it: the DAO never launches).
    /// Persistent, renewed by the DAO's sweep while pending.
    Assurance(Address),
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get(&common::ns(env, ManagerKey::ManagerAdmin))
}

pub fn write_admin(env: &Env, admin: &Address) {
    env.storage()
        .instance()
        .set(&common::ns(env, ManagerKey::ManagerAdmin), admin);
}

pub fn is_factory_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&common::ns(env, ManagerKey::FactoryPaused))
        .unwrap_or(false)
}

pub fn set_factory_paused(env: &Env, paused: bool) {
    env.storage()
        .instance()
        .set(&common::ns(env, ManagerKey::FactoryPaused), &paused);
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
    let key = common::ns(env, key.clone());
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        common::ttl::extend_persistent(env, &key);
    }
    value
}

/// Write a persistent entry and extend its TTL.
pub fn set_persistent<V: IntoVal<Env, Val>>(env: &Env, key: &ManagerKey, value: &V) {
    let key = common::ns(env, key.clone());
    env.storage().persistent().set(&key, value);
    common::ttl::extend_persistent(env, &key);
}

pub fn remove_persistent(env: &Env, key: &ManagerKey) {
    env.storage()
        .persistent()
        .remove(&common::ns(env, key.clone()));
}

/// Whether a live persistent entry exists. Does not extend TTL.
pub fn has_persistent(env: &Env, key: &ManagerKey) -> bool {
    env.storage()
        .persistent()
        .has(&common::ns(env, key.clone()))
}

/// Every `ManagerKey` variant with sample arguments, for the key guard test.
/// `index` fails to compile when a variant is added: give it the next index,
/// raise `VARIANTS` and add a sample to `all`, or the guard test fails.
#[cfg(test)]
pub(crate) mod key_samples {
    extern crate std;
    use super::*;
    #[allow(unused_imports)]
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, IntoVal, Val};

    pub const VARIANTS: usize = 20;

    pub fn index(key: &ManagerKey) -> usize {
        match key {
            ManagerKey::ManagerAdmin => 0,
            ManagerKey::FactoryPaused => 1,
            ManagerKey::Implementation(_) => 2,
            ManagerKey::LatestImplementation(_) => 3,
            ManagerKey::UpgradeApproval(..) => 4,
            ManagerKey::CurrentTokenWasm => 5,
            ManagerKey::CurrentMetadataWasm => 6,
            ManagerKey::CurrentAuctionWasm => 7,
            ManagerKey::CurrentGovernorWasm => 8,
            ManagerKey::CurrentTreasuryWasm => 9,
            ManagerKey::CurrentMarketplaceWasm => 10,
            ManagerKey::CurrentManagerWasm => 11,
            ManagerKey::CurrentManagerVersion => 12,
            ManagerKey::PendingDao(_) => 13,
            ManagerKey::PendingAdmin => 14,
            ManagerKey::SlugToDao(_) => 15,
            ManagerKey::DaoSlug(_) => 16,
            ManagerKey::CurrentClaimsWasm => 17,
            ManagerKey::ModuleCount(..) => 18,
            ManagerKey::Assurance(_) => 19,
        }
    }

    #[allow(unused_variables)]
    pub fn all(e: &Env) -> std::vec::Vec<Val> {
        let a = soroban_sdk::Address::generate(e);
        let id = soroban_sdk::BytesN::<32>::from_array(e, &[0; 32]);
        let text = soroban_sdk::String::from_str(e, "x");
        let keys = std::vec![
            ManagerKey::ManagerAdmin,
            ManagerKey::FactoryPaused,
            ManagerKey::Implementation(id.clone()),
            ManagerKey::LatestImplementation(text.clone()),
            ManagerKey::UpgradeApproval(id.clone(), id.clone()),
            ManagerKey::CurrentTokenWasm,
            ManagerKey::CurrentMetadataWasm,
            ManagerKey::CurrentAuctionWasm,
            ManagerKey::CurrentGovernorWasm,
            ManagerKey::CurrentTreasuryWasm,
            ManagerKey::CurrentMarketplaceWasm,
            ManagerKey::CurrentManagerWasm,
            ManagerKey::CurrentManagerVersion,
            ManagerKey::PendingDao(a.clone()),
            ManagerKey::PendingAdmin,
            ManagerKey::SlugToDao(text.clone()),
            ManagerKey::DaoSlug(a.clone()),
            ManagerKey::CurrentClaimsWasm,
            ManagerKey::ModuleCount(a.clone(), soroban_sdk::Symbol::new(e, "claims")),
            ManagerKey::Assurance(a.clone()),
        ];
        common::testutils::assert_every_variant_sampled(
            "ManagerKey",
            &keys.iter().map(index).collect::<std::vec::Vec<_>>(),
            VARIANTS,
        );
        keys.into_iter().map(|k| k.into_val(e)).collect()
    }
}
