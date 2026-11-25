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
    /// Manager-only launch: hands the admin to `treasury` and writes the
    /// initial mint allowances.
    fn launch(e: &Env, treasury: Address, grants: Vec<crate::modules::MintGrant>);
    /// Manager-only early handoff (stays in Setup).
    fn handoff(e: &Env, treasury: Address);
    /// Raises a module's mint allowance (admin).
    fn increase_mint_allowance(e: &Env, module: Address, amount: u32);
    /// A module's remaining mint allowance.
    fn mint_allowance(e: &Env, module: Address) -> u32;
    /// A module gives back part of its own allowance (module auth).
    fn release_mint_allowance(e: &Env, module: Address, amount: u32);
    /// The DAO's Treasury.
    fn treasury(e: &Env) -> Address;
    /// The Metadata contract, if the Token has one.
    fn metadata(e: &Env) -> Option<Address>;
    /// Every registered module.
    fn modules(e: &Env) -> Vec<crate::modules::ModuleEntry>;
    /// The module registered under `kind`, if any.
    fn module(e: &Env, kind: Symbol) -> Option<Address>;
    /// Module registry (Manager in Setup, admin once live).
    fn register_module(e: &Env, kind: Symbol, address: Address, non_voting: bool);
    /// Transfer agents (same authority as `register_module`).
    fn set_transfer_agent(e: &Env, module: Address, enabled: bool);
    /// The Token's admin (launch admin in setup, the Treasury once live).
    fn admin(e: &Env) -> Address;
    /// Whether the Token has launched.
    fn is_live(e: &Env) -> bool;
    /// Voting-capable supply (excludes tokens held by the Treasury and
    /// non-voting modules).
    fn total_supply(e: &Env) -> i128;
    /// Voting-capable supply at the previous ledger, the ledger votes are
    /// snapshotted at; reads at most the two latest checkpoints.
    fn voting_supply_at_previous_ledger(e: &Env) -> u128;
    /// Tokens minted so far (the next id); ids are sequential and never burned.
    fn minted(e: &Env) -> u32;
    /// The owner of `token_id`.
    fn owner_of(e: &Env, token_id: u32) -> Address;
    /// Mints the next token to `to` (minter auth and allowance).
    fn mint(e: &Env, minter: Address, to: Address) -> u32;
    /// Mints `amounts[i]` tokens to each `recipients[i]` within
    /// `crate::batch_mint_fits` (minter auth and allowance).
    fn batch_mint(
        e: &Env,
        minter: Address,
        recipients: Vec<Address>,
        amounts: Vec<u128>,
    ) -> Vec<u32>;
    /// Moves `token_id` from `from` (owner auth).
    fn transfer(e: &Env, from: Address, to: Address, token_id: u32);
    /// Moves `token_id` from `from` with `spender`'s approval.
    fn transfer_from(e: &Env, spender: Address, from: Address, to: Address, token_id: u32);
}

/// Where a Governor's voting power comes from (docs/designs/governance-adapter.md).
///
/// The DAO's Token implements it unchanged: the first three are the OZ
/// `Votes` reads and the fourth is the Token's own extension. An adapter (a
/// mock in tests, NQG later) implements all five. The Governor calls only
/// the four vote reads; `decimals` is for the Manager's approval probe and
/// for clients that display voting power.
///
/// Every read is keyed by ledger sequence. An adapter that has rounds or
/// epochs maps each ledger to the epoch active at that ledger. Invariant:
/// `voting_supply_at_previous_ledger()` equals
/// `get_total_supply_at_checkpoint(current_ledger - 1)`, so a proposal's
/// quorum and its voters' weights describe the same supply.
#[contractclient(name = "VoteSourceClient")]
pub trait VoteSourceApi {
    /// Voting power of `account` at `ledger` (a past ledger).
    fn get_votes_at_checkpoint(e: &Env, account: Address, ledger: u32) -> u128;
    /// Total voting power at `ledger` (a past ledger).
    fn get_total_supply_at_checkpoint(e: &Env, ledger: u32) -> u128;
    /// Total voting power now.
    fn get_total_supply(e: &Env) -> u128;
    /// Total voting power at the previous ledger, without a search over
    /// history that may have archived.
    fn voting_supply_at_previous_ledger(e: &Env) -> u128;
    /// Decimal places of one vote. The Token has none (it isn't asked);
    /// adapters report theirs so clients can display power as units.
    fn decimals(e: &Env) -> u32;
}

/// The Governor's vote source view (Governor 0.5.0+; older Governors read
/// the Token, so callers treat a failed call as the Token).
#[contractclient(name = "GovernorVoteSourceClient")]
pub trait GovernorVoteSourceApi {
    /// The Governor's vote source: the Token or an approved adapter.
    fn vote_source(e: &Env) -> Address;
}

/// Metadata's on-chain SEP-50 token JSON (the token forwards `token_uri`).
#[contractclient(name = "TokenUriClient")]
pub trait TokenUriApi {
    /// The SEP-50 JSON for `token_id`, named `token_name`.
    fn token_uri(e: &Env, token_id: u32, token_name: String) -> String;
}

/// `launch(treasury)` and the early `handoff(treasury)` shared by Governor,
/// Treasury and Metadata (both Manager-only).
#[contractclient(name = "TreasuryLaunchClient")]
pub trait TreasuryLaunchApi {
    /// Setup -> Live: hands the admin to `treasury` (Manager only).
    fn launch(e: &Env, treasury: Address);
    /// Hands the admin to `treasury` and stays in Setup (Manager only).
    fn handoff(e: &Env, treasury: Address);
}

/// The interface every Manager-built module implements (Auction,
/// Marketplace, ClaimMinter; docs/designs/membership-models.md §2, eng review
/// R5). `launch` and `handoff` are Manager-only. Modules a DAO deploys itself
/// and registers by proposal never receive them, and `renewal_keys` is
/// optional for those.
#[contractclient(name = "DaoModuleClient")]
pub trait DaoModuleApi {
    /// Setup -> Live: hands the admin to `treasury` unless `handoff` already
    /// did. `open` starts the module (the Auction's first auction, the
    /// Marketplace unpaused); a module without a pause ignores it.
    fn launch(e: &Env, treasury: Address, open: bool);
    /// Hands the admin to `treasury` and stays in Setup, which freezes the
    /// module's setters and upgrades until launch.
    fn handoff(e: &Env, treasury: Address);
    /// The asset the module is paid in. The Manager compares it with the
    /// asset recorded at creation before launching the module.
    fn payment_asset(e: &Env) -> Address;
    /// The module's DAO-owned storage keys from `cursor` (see
    /// `crate::modules::RenewalPage`). Reads only instance storage, never the
    /// entries it lists, so it still answers once they have archived.
    fn renewal_keys(e: &Env, cursor: u32, limit: u32) -> crate::modules::RenewalPage;
    /// The module's running code hash.
    fn wasm_hash(e: &Env) -> BytesN<32>;
}

/// The ClaimMinter surface the Manager drives for an assurance drive
/// (docs/designs/membership-models.md §2-3).
#[contractclient(name = "ClaimsClient")]
pub trait ClaimsApi {
    /// Opens a claim list (here, the assurance list) and returns its id.
    #[allow(clippy::too_many_arguments)]
    fn open_list(
        e: &Env,
        root: BytesN<32>,
        tree_uri: String,
        asset: Address,
        price: i128,
        expires_at: u64,
        total: u32,
        assurance: Option<crate::modules::AssuranceTerms>,
    ) -> u32;
    /// Whether the assurance list is Open, Met or Failed.
    fn assurance_state(e: &Env, list_id: u32) -> crate::modules::AssuranceState;
    /// The Manager's recovery upgrade after a failed drive (Manager only).
    fn recovery_upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>, version: String);
}

/// Metadata artwork reads (ClaimMinter refuses Setup lists without artwork).
#[contractclient(name = "ArtworkClient")]
pub trait ArtworkApi {
    /// Number of artwork properties (0 means no artwork yet).
    fn properties_count(e: &Env) -> u32;
}

/// Metadata mint hooks called by the token.
#[contractclient(name = "MetadataHookClient")]
pub trait MetadataHookApi {
    /// Seeds the artwork of `token_id` (Token only).
    fn on_minted(e: &Env, token_id: u32) -> bool;
    /// Seeds `count` tokens from `first_token_id` (Token only).
    fn on_minted_batch(e: &Env, first_token_id: u32, count: u32) -> bool;
}

/// `wasm_hash()` exposed by every DAO module (token, governor, treasury,
/// auction, marketplace, metadata): the module's currently active WASM hash.
#[contractclient(name = "WasmHashClient")]
pub trait WasmHashApi {
    /// The module's running code hash.
    fn wasm_hash(e: &Env) -> BytesN<32>;
}

/// Manager registry reads used by the shared upgrade flow.
#[contractclient(name = "ManagerRegistryClient")]
pub trait ManagerRegistryApi {
    /// Whether the Manager approved `from_hash -> to_hash` and `to_hash` is
    /// not revoked.
    fn is_upgrade_approved(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) -> bool;
    /// The release version registered for `wasm_hash`, if any.
    fn get_implementation_version(e: &Env, wasm_hash: BytesN<32>) -> Option<String>;
    /// The Manager admin: the shared Minter's upgrade authority.
    fn get_admin(e: &Env) -> Option<Address>;
    /// Ledger at which `approve_upgrade(from, to)` was recorded, if it was.
    fn upgrade_approved_ledger(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) -> Option<u64>;
    /// The hash announced as latest for `name`, and when (D42).
    fn latest_pointer(e: &Env, name: String) -> Option<crate::upgrade::LatestPointer>;
}

/// Governor `consume`, called by the Treasury from `execute`.
#[contractclient(name = "GovernorConsumeClient")]
pub trait GovernorConsumeApi {
    /// Marks the queued proposal Executed and returns its id (Treasury only).
    fn consume(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
    ) -> BytesN<32>;
}
