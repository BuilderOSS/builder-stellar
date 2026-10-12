//! Typed cross-contract clients, declared as traits.
//!
//! Depending on another module's crate would link its `#[contractimpl]`
//! exports into the caller's WASM. `#[contractclient]` over a local trait
//! generates only a client struct (no exports), so callers stay lean and every
//! call is type-checked against these declarations. Keep each signature in
//! sync with the callee's contract implementation.

use soroban_sdk::{contractclient, Address, BytesN, Env, String, Symbol, Val, Vec};

/// NFT token surface used by the Manager, Minter, Auction, Marketplace and
/// Metadata.
#[contractclient(name = "NftClient")]
pub trait NftApi {
    fn launch(
        e: &Env,
        treasury: Address,
        minters: Vec<Address>,
        minter: Address,
        guardian: Address,
    );
    fn admin(e: &Env) -> Address;
    fn is_live(e: &Env) -> bool;
    /// Voting-capable supply (excludes tokens held by the Treasury, Auction
    /// and Marketplace).
    fn total_supply(e: &Env) -> i128;
    /// Voting-capable supply at the previous ledger, the ledger votes are
    /// snapshotted at; reads at most the two latest checkpoints.
    fn voting_supply_at_previous_ledger(e: &Env) -> u128;
    /// Tokens minted so far (the next id); ids are sequential and never burned.
    fn minted(e: &Env) -> u32;
    fn owner_of(e: &Env, token_id: u32) -> Address;
    fn mint(e: &Env, minter: Address, to: Address) -> u32;
    fn batch_mint(
        e: &Env,
        minter: Address,
        recipients: Vec<Address>,
        amounts: Vec<u128>,
    ) -> Vec<u32>;
    fn transfer(e: &Env, from: Address, to: Address, token_id: u32);
    fn transfer_from(e: &Env, spender: Address, from: Address, to: Address, token_id: u32);
}

/// Metadata's on-chain SEP-50 token JSON (the token forwards `token_uri`).
#[contractclient(name = "TokenUriClient")]
pub trait TokenUriApi {
    fn token_uri(e: &Env, token_id: u32, token_name: String) -> String;
}

/// `launch(treasury)` shared by Governor, Treasury and Metadata.
#[contractclient(name = "TreasuryLaunchClient")]
pub trait TreasuryLaunchApi {
    fn launch(e: &Env, treasury: Address);
}

#[contractclient(name = "MarketplaceLaunchClient")]
pub trait MarketplaceLaunchApi {
    fn launch(e: &Env, treasury: Address, open: bool, expected_payment_asset: Address);
}

#[contractclient(name = "AuctionLaunchClient")]
pub trait AuctionLaunchApi {
    fn launch(e: &Env, treasury: Address, start: bool, expected_payment_token: Address);
}

/// Metadata mint hooks called by the token.
#[contractclient(name = "MetadataHookClient")]
pub trait MetadataHookApi {
    fn on_minted(e: &Env, token_id: u32) -> bool;
    fn on_minted_batch(e: &Env, first_token_id: u32, count: u32) -> bool;
}

/// `wasm_hash()` exposed by every DAO module (token, governor, treasury,
/// auction, marketplace, metadata): the module's currently active WASM hash.
#[contractclient(name = "WasmHashClient")]
pub trait WasmHashApi {
    fn wasm_hash(e: &Env) -> BytesN<32>;
}

/// Manager registry reads used by the shared upgrade flow.
#[contractclient(name = "ManagerRegistryClient")]
pub trait ManagerRegistryApi {
    fn is_upgrade_approved(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) -> bool;
    fn get_implementation_version(e: &Env, wasm_hash: BytesN<32>) -> Option<String>;
    /// The Manager admin: the shared Minter's upgrade authority.
    fn get_admin(e: &Env) -> Option<Address>;
    /// Ledger at which `approve_upgrade(from, to)` was recorded, if it was.
    fn upgrade_approved_ledger(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) -> Option<u64>;
}

/// Governor `consume`, called by the Treasury from `execute`.
#[contractclient(name = "GovernorConsumeClient")]
pub trait GovernorConsumeApi {
    fn consume(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
    ) -> BytesN<32>;
}
