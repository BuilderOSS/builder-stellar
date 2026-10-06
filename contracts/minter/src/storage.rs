//! Storage definitions for the Minter contract.

use soroban_sdk::{contracttype, Address, Bytes, Env, String};

/// Maximum number of recipients in a single batch mint.
pub const MAX_BATCH_RECIPIENTS: u32 = 100;

/// Maximum number of strategies that can be registered.
pub const MAX_STRATEGIES: u32 = 1000;

/// Storage keys for the Minter contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MinterKey {
    /// Admin address - who can register/update strategies
    Admin,
    /// Token contract address - who can call mint functions
    Token,
    /// Counter for next strategy ID
    NextStrategyId,
    /// Strategy information by ID: Map<u32, StrategyInfo>
    Strategy(u32),
    /// Strategy state by ID: Map<u32, StrategyState>
    StrategyState(u32),
    /// Claimed amounts per recipient: Map<(strategy_id, recipient), amount>
    Claimed(u32, Address),
}

/// Strategy type enumeration.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq, Copy)]
pub enum StrategyType {
    /// Simple batch minting
    Batch = 0,
    /// Merkle tree verified minting
    Merkle = 1,
    /// Fixed allowlist minting
    Allowlist = 2,
    /// Tiered amount based on voting power
    Tiered = 3,
    /// Custom validator contract
    Custom = 4,
}

/// Authorization level for a strategy.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq, Copy)]
pub enum StrategyAuthorization {
    /// Only admin can mint
    AdminOnly = 0,
    /// Only token contract can mint
    TokenOnly = 1,
    /// Anyone can mint with valid proof
    PublicWithProof = 2,
    /// Anyone can mint
    Public = 3,
    /// Custom authorization contract
    Custom = 4,
}

/// Configuration for Batch strategy.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchConfig {
    /// Maximum recipients per single transaction
    pub max_recipients_per_tx: u32,
    /// Optional: maximum tokens per block
    pub rate_limit_per_block: Option<u128>,
    /// Optional: caps on total and per-recipient amounts
    pub caps: Option<BatchCaps>,
}

/// Caps configuration for batch strategy.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchCaps {
    /// Global cap on total tokens for this strategy
    pub global_cap: u128,
    /// Per-round cap
    pub per_round_cap: Option<u128>,
    /// Per-recipient maximum
    pub per_recipient_cap: Option<u128>,
}

/// Configuration for Merkle strategy.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MerkleConfig {
    /// Root of merkle tree
    pub merkle_root: Bytes,
    /// Token decimals
    pub decimals: u32,
    /// Total claimable via this merkle tree
    pub total_claimable: u128,
    /// Description of this merkle round
    pub description: String,
}

/// Configuration for Allowlist strategy.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AllowlistConfig {
    /// Fixed amount per address
    pub amount_per_address: u128,
}

/// Configuration for Tiered strategy.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TieredConfig {
    /// Optional: contract to verify voting power
    pub verification_contract: Option<Address>,
}

/// Configuration for Custom strategy.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CustomConfig {
    /// Validator contract address
    pub validator_contract: Address,
    /// Method to call for validation
    pub validator_method: String,
    /// Custom data passed to validator
    pub user_data: Bytes,
}

/// Unified strategy configuration enum.
#[contracttype]
#[derive(Clone, Debug)]
pub enum StrategyConfig {
    Batch(BatchConfig),
    Merkle(MerkleConfig),
    Allowlist(AllowlistConfig),
    Tiered(TieredConfig),
    Custom(CustomConfig),
}

/// Information about a registered strategy.
#[contracttype]
#[derive(Clone, Debug)]
pub struct StrategyInfo {
    /// Unique strategy ID
    pub id: u32,
    /// Type of strategy
    pub strategy_type: StrategyType,
    /// Human-readable name
    pub name: String,
    /// Detailed description
    pub description: String,
    /// Ledger when created
    pub created_ledger: u32,
    /// Ledger when last updated
    pub updated_ledger: u32,
    /// Whether strategy is paused
    pub is_paused: bool,
    /// Authorization level
    pub authorization: StrategyAuthorization,
    /// Strategy-specific configuration
    pub config: StrategyConfig,
}

/// Runtime state for a strategy.
#[contracttype]
#[derive(Clone, Debug)]
pub struct StrategyState {
    /// Strategy ID this state is for
    pub strategy_id: u32,
    /// Total tokens minted via this strategy
    pub total_minted: u128,
    /// Total number of mints
    pub mint_count: u32,
    /// Last ledger where a mint occurred
    pub last_mint_block: u32,
    /// Whether strategy is currently paused
    pub is_paused: bool,
    /// Current round number
    pub round_number: u32,
    /// Tokens minted in current round
    pub round_minted: u128,
    /// Mints in current round
    pub round_mint_count: u32,
}

impl StrategyState {
    /// Create new strategy state.
    pub fn new(strategy_id: u32, ledger: u32) -> Self {
        StrategyState {
            strategy_id,
            total_minted: 0,
            mint_count: 0,
            last_mint_block: ledger,
            is_paused: false,
            round_number: 0,
            round_minted: 0,
            round_mint_count: 0,
        }
    }

    /// Update state after a mint operation.
    pub fn record_mint(&mut self, amount: u128, ledger: u32) {
        self.total_minted = self.total_minted.saturating_add(amount);
        self.mint_count = self.mint_count.saturating_add(1);
        self.last_mint_block = ledger;
        self.round_minted = self.round_minted.saturating_add(amount);
        self.round_mint_count = self.round_mint_count.saturating_add(1);
    }
}

/// Get the current ledger sequence.
pub fn get_ledger(env: &Env) -> u32 {
    env.ledger().sequence()
}

/// Load admin from storage.
pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&MinterKey::Admin)
}

/// Load token address from storage.
pub fn get_token(env: &Env) -> Option<Address> {
    env.storage().instance().get(&MinterKey::Token)
}

/// Load strategy info from storage.
pub fn get_strategy_info(env: &Env, strategy_id: u32) -> Option<StrategyInfo> {
    env.storage()
        .instance()
        .get(&MinterKey::Strategy(strategy_id))
}

/// Load strategy state from storage.
pub fn get_strategy_state(env: &Env, strategy_id: u32) -> Option<StrategyState> {
    env.storage()
        .instance()
        .get(&MinterKey::StrategyState(strategy_id))
}

/// Load claimed amount for a recipient.
pub fn get_claimed(env: &Env, strategy_id: u32, recipient: &Address) -> u128 {
    env.storage()
        .instance()
        .get(&MinterKey::Claimed(strategy_id, recipient.clone()))
        .unwrap_or(0)
}

/// Save admin to storage.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&MinterKey::Admin, admin);
}

/// Save token address to storage.
pub fn set_token(env: &Env, token: &Address) {
    env.storage().instance().set(&MinterKey::Token, token);
}

/// Save next strategy ID to storage.
pub fn set_next_strategy_id(env: &Env, id: u32) {
    env.storage()
        .instance()
        .set(&MinterKey::NextStrategyId, &id);
}

/// Get next strategy ID.
pub fn get_next_strategy_id(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&MinterKey::NextStrategyId)
        .unwrap_or(1)
}

/// Save strategy info to storage.
pub fn set_strategy_info(env: &Env, strategy: &StrategyInfo) {
    env.storage()
        .instance()
        .set(&MinterKey::Strategy(strategy.id), strategy);
}

/// Save strategy state to storage.
pub fn set_strategy_state(env: &Env, state: &StrategyState) {
    env.storage()
        .instance()
        .set(&MinterKey::StrategyState(state.strategy_id), state);
}

/// Record a claimed amount for a recipient.
pub fn set_claimed(env: &Env, strategy_id: u32, recipient: &Address, amount: u128) {
    env.storage()
        .instance()
        .set(&MinterKey::Claimed(strategy_id, recipient.clone()), &amount);
}
