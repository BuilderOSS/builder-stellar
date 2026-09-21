# Manager Contract Design

## Overview

The **Manager** contract is the central hub for the Stellar Builder platform. It combines three responsibilities:

1. **Implementation Management** - Registry of contract implementations and upgrade approval
2. **DAO Factory** - Atomic deployment of new DAOs with all modules
3. **DAO Registry** - Discovery and enumeration of deployed DAOs

**Single responsibility at high level:** Manage the entire DAO lifecycle (implementations → creation → discovery)

---

## 1. Implementation Management

### Purpose
Maintain a registry of contract implementations with versioning, allow governance-controlled upgrades, and provide emergency revocation.

### Data Structures

```rust
pub struct ImplementationVersion {
    pub name: String,                    // e.g., "Token", "Governor", "Metadata"
    pub version: u32,
    pub wasm_hash: BytesN<32>,
    pub published_at: u64,               // Ledger sequence
    pub revoked: bool,
}

pub struct UpgradeApproval {
    pub from_hash: BytesN<32>,
    pub to_hash: BytesN<32>,
    pub approved_at: u64,                // Ledger sequence
}
```

### Storage

```rust
// All implementations by WASM hash
Map<BytesN<32>, ImplementationVersion>

// Approved upgrade paths (from → to)
Map<(BytesN<32>, BytesN<32>), UpgradeApproval>

// Latest version for each implementation name
Map<String, BytesN<32>>  // "Token" → latest_wasm_hash

// Single admin address (MVP; upgrade to multisig later)
Address (admin)

// Factory pause flag (emergency only)
bool (factory_paused)
```

### Interface

```rust
/// Register a new implementation version
/// - Only callable by admin
/// - Emits ImplementationRegistered event
pub fn register_implementation(
    env: Env,
    name: String,           // "Token", "Governor", "Auction", "Treasury", "Metadata"
    version: u32,
    wasm_hash: BytesN<32>,
) -> Result<(), Error>;

/// Approve an upgrade path from one hash to another
/// - Only callable by admin
/// - Both hashes must exist and not be revoked
/// - Emits UpgradeApproved event
pub fn approve_upgrade(
    env: Env,
    from_hash: BytesN<32>,
    to_hash: BytesN<32>,
) -> Result<(), Error>;

/// Revoke an implementation (emergency measure)
/// - Only callable by admin
/// - Prevents it from being deployed or upgraded to
/// - Emits ImplementationRevoked event
pub fn revoke_implementation(
    env: Env,
    wasm_hash: BytesN<32>,
) -> Result<(), Error>;

/// Check if an upgrade is approved
/// - Callable by anyone
/// - Returns false if either hash is revoked
pub fn is_upgrade_approved(
    env: Env,
    from_hash: BytesN<32>,
    to_hash: BytesN<32>,
) -> bool;

/// Get latest version of an implementation by name
/// - Callable by anyone
/// - Useful for getting current "Token" version to deploy
pub fn get_latest_implementation(
    env: Env,
    name: String,
) -> Option<ImplementationVersion>;

/// Get implementation by hash
pub fn get_implementation(
    env: Env,
    wasm_hash: BytesN<32>,
) -> Option<ImplementationVersion>;
```

---

## 2. DAO Factory

### Purpose
Deploy a complete DAO with all 5 modules (Token, Metadata, Auction, Governor, Treasury) atomically.

### Key Design Decisions

**Deterministic Addressing:**
- Use keccak256 salts derived from (creator, nonce, module_name)
- Allows frontend to predict addresses before deployment
- Prevents address collisions across DAOs

**Founder Allocation (Modulo-100):**
- Each founder has a percentage (must sum ≤ 99%)
- Tokens minted in sequence are distributed by modulo
- Example: 50% founder allocation → every 2nd token goes to founder

**Governance-Owned from Start:**
- Treasury owns both Token and Auction
- Governor controls Treasury via proposals
- No admin backdoors after creation

### Data Structures

```rust
pub struct FounderAllocation {
    pub address: Address,
    pub percentage: u8,              // 0-99
    pub vesting_schedule: Option<u64>, // Future: cliff timestamp
}

pub struct TraitCounts {
    pub background: u8,
    pub body: u8,
    pub accessory: u8,
    pub head: u8,
    pub glasses: u8,
}

pub struct DaoCreationParams {
    pub deployer: Address,           // Who's creating this DAO
    pub nonce: u64,                  // Uniqueness key (user increments)

    // Token
    pub token_name: String,
    pub token_symbol: String,

    // Metadata
    pub ipfs_base_cid: String,       // IPFS directory with trait images
    pub trait_counts: TraitCounts,

    // Auction
    pub auction_duration: u64,       // Seconds
    pub reserve_price: i128,
    pub time_buffer: u64,            // Time before auction end resets timer
    pub payment_asset: Address,      // XLM or other SAC

    // Governance
    pub voting_delay: u64,           // Blocks
    pub voting_period: u64,          // Blocks
    pub quorum_bps: u32,             // Basis points (5000 = 50%)
    pub proposal_threshold_bps: u32, // Basis points

    // Founders
    pub founders: Vec<FounderAllocation>,

    // Launch
    pub launch_admin: Option<Address>, // Optional one-time launcher
}

pub struct DaoAddresses {
    pub token: Address,
    pub metadata_renderer: Address,
    pub auction: Address,
    pub governor: Address,
    pub treasury: Address,
}

pub struct DaoCreation {
    pub addresses: DaoAddresses,
    pub creator: Address,
    pub created_ledger: u32,
    pub created_at: u64,
    pub params: DaoCreationParams,
}
```

### Storage

```rust
// All DAO creations by token address
Map<Address, DaoCreation>

// Mapping from (creator, nonce) → token address (prevent duplicates)
Map<(Address, u64), Address>

// Track all DAOs for enumeration
Vec<Address>  // Token addresses in order

// WASM hashes for each module type (linked to implementation registry)
Address (current_token_wasm)
Address (current_metadata_wasm)
Address (current_auction_wasm)
Address (current_governor_wasm)
Address (current_treasury_wasm)
```

### Interface

```rust
/// Create a new DAO with all 5 modules
/// - Validates all parameters (bounded checks)
/// - Derives deterministic salts
/// - Deploys all 5 contracts atomically
/// - Initializes them with proper cross-references
/// - Registers in DAO registry
/// - Checks factory_paused flag
/// - Emits DaoCreated event
pub fn create_dao(
    env: Env,
    params: DaoCreationParams,
) -> Result<DaoAddresses, Error>;

/// Predict DAO addresses without deploying
/// - Useful for frontend to show addresses before user confirms
/// - Returns deterministic addresses based on (creator, nonce)
pub fn predict_addresses(
    env: Env,
    creator: Address,
    nonce: u64,
) -> Result<DaoAddresses, Error>;

/// Check if a (creator, nonce) pair has been used
pub fn is_nonce_used(
    env: Env,
    creator: Address,
    nonce: u64,
) -> bool;
```

### Deployment Flow

```
1. Validate params (all bounded, sums correct, etc.)
   - Check founders sum ≤ 99%
   - Check voting_delay, voting_period bounded
   - Check quorum_bps, proposal_threshold_bps ≤ 10000
   - Check strings not empty, not too long
   - Check factory not paused

2. Check (creator, nonce) not already used
   - Prevents replay attacks

3. Derive deterministic salts
   - token_salt = keccak256(creator, nonce, "token", version)
   - metadata_salt = keccak256(creator, nonce, "metadata", version)
   - auction_salt = keccak256(creator, nonce, "auction", version)
   - governor_salt = keccak256(creator, nonce, "governor", version)
   - treasury_salt = keccak256(creator, nonce, "treasury", version)

4. Predict all addresses using salts
   - Use env.deployer().address_from_contract_id()

5. Deploy contracts in order (all must succeed or entire tx reverts)
   env.deployer().deploy_contract(token_wasm_hash, token_salt)
   env.deployer().deploy_contract(metadata_wasm_hash, metadata_salt)
   ... (repeat for all 5)

6. Initialize contracts (cross-references must be accurate)
   Token.initialize(
       name, symbol, metadata_addr, auction_addr, governor_addr
   )

   MetadataRenderer.initialize(
       ipfs_base_cid, trait_counts, token_addr
   )

   Auction.initialize(
       token_addr, treasury_addr, duration, reserve_price,
       time_buffer, payment_asset, launch_admin
   )

   Governor.initialize(
       token_addr, treasury_addr, voting_delay, voting_period,
       quorum_bps, proposal_threshold_bps
   )

   Treasury.initialize(governor_addr)

7. Initialize founder allocations on Token
   Token.initialize_founders(founders)
   - Calculates distribution based on modulo-100

8. Transfer ownership to Treasury (governance-owned)
   Token.transfer_ownership(treasury_addr)
   Auction.transfer_ownership(treasury_addr)

9. Register in DAO registry
   (see below)

10. Emit DaoCreated event with all addresses and params
```

### Initialization Parameters

Each module is initialized by the Manager contract immediately after deployment:

**Token**
```rust
pub fn initialize(
    env: Env,
    name: String,
    symbol: String,
    metadata_renderer: Address,
    auction: Address,
    governor: Address,
    owner: Address,  // Set to treasury later
) -> Result<(), Error>;
```

**MetadataRenderer**
```rust
pub fn initialize(
    env: Env,
    ipfs_base_cid: String,
    trait_counts: TraitCounts,
    token_address: Address,
) -> Result<(), Error>;
```

**Auction**
```rust
pub fn initialize(
    env: Env,
    token: Address,
    treasury: Address,
    duration: u64,
    reserve_price: i128,
    time_buffer: u64,
    payment_asset: Address,
    launch_admin: Option<Address>,
) -> Result<(), Error>;
```

**Governor**
```rust
pub fn initialize(
    env: Env,
    token: Address,
    treasury: Address,
    voting_delay: u64,
    voting_period: u64,
    quorum_bps: u32,
    proposal_threshold_bps: u32,
) -> Result<(), Error>;
```

**Treasury**
```rust
pub fn initialize(
    env: Env,
    governor: Address,
) -> Result<(), Error>;
```

---

## 3. DAO Registry

### Purpose
Enable DAO discovery, enumeration, and module lookup.

### Data Structures

```rust
pub struct DaoModules {
    pub token: Address,
    pub metadata_renderer: Address,
    pub auction: Address,
    pub governor: Address,
    pub treasury: Address,
}

pub struct DaoRegistration {
    pub token_address: Address,      // Canonical DAO ID
    pub creator: Address,
    pub created_ledger: u32,
    pub created_at: u64,
    pub factory_version: u32,        // Which Manager version created this
    pub modules: DaoModules,
    pub metadata: DaoMetadata,
}

pub struct DaoMetadata {
    pub name: String,
    pub description: Option<String>,  // Can be updated by governance
}
```

### Storage

```rust
// Canonical registry by token address
Map<Address, DaoRegistration>

// All DAOs in creation order (for enumeration)
Vec<Address>  // Token addresses

// Count for quick queries
u32  // Total DAO count
```

### Interface

```rust
/// Register a newly created DAO
/// - Only callable by Manager.create_dao()
/// - Emits DaoRegistered event
pub(crate) fn register_dao(
    env: Env,
    registration: DaoRegistration,
) -> Result<(), Error>;

/// Get DAO by token address
/// - Callable by anyone
/// - Returns full registration including modules
pub fn get_dao(
    env: Env,
    token_address: Address,
) -> Option<DaoRegistration>;

/// Enumerate DAOs with pagination
/// - Callable by anyone
/// - Returns token addresses in creation order
pub fn enumerate_daos(
    env: Env,
    start: u32,
    limit: u32,
) -> Result<Vec<Address>, Error>;

/// Get total DAO count
pub fn get_dao_count(env: Env) -> u32;

/// Check if token address is a registered DAO
pub fn is_dao(env: Env, token_address: Address) -> bool;
```

---

## Events

### Implementation Management

```rust
#[derive(Debug, Clone)]
pub struct ImplementationRegistered {
    pub name: String,
    pub version: u32,
    pub wasm_hash: BytesN<32>,
    pub published_at: u64,
}

#[derive(Debug, Clone)]
pub struct UpgradeApproved {
    pub from_hash: BytesN<32>,
    pub to_hash: BytesN<32>,
    pub approved_at: u64,
}

#[derive(Debug, Clone)]
pub struct ImplementationRevoked {
    pub wasm_hash: BytesN<32>,
    pub revoked_at: u64,
}
```

### Factory

```rust
#[derive(Debug, Clone)]
pub struct DaoCreated {
    pub token_address: Address,
    pub creator: Address,
    pub created_ledger: u32,
    pub modules: DaoModules,
    pub founders: Vec<FounderAllocation>,
}

#[derive(Debug, Clone)]
pub struct FactoryPaused;

#[derive(Debug, Clone)]
pub struct FactoryUnpaused;
```

### Registry

```rust
#[derive(Debug, Clone)]
pub struct DaoRegistered {
    pub token_address: Address,
    pub creator: Address,
    pub modules: DaoModules,
}
```

---

## Error Handling

```rust
#[derive(Debug, Clone)]
pub enum Error {
    // Implementation management
    Unauthorized,                    // Not admin
    InvalidImplementationName,       // Name validation
    InvalidVersion,                  // Version = 0
    ImplementationNotFound,          // Unknown wasm_hash
    ImplementationAlreadyRevoked,    // Can't use revoked impl
    InvalidUpgradePath,              // from/to not found or revoked

    // Factory
    DaoCreationFailed,               // Generic creation error
    FactoryPaused,                   // Emergency pause active
    NonceAlreadyUsed,                // (creator, nonce) duplicate
    InvalidParamBounds,              // String too long, % > 99, etc.
    FoundersExceed99Percent,         // Sum > 99%
    InvalidQuorumBps,                // > 10000
    InvalidProposalThresholdBps,     // > 10000
    InvalidDuration,                 // Duration = 0
    InvalidTimeBuffer,               // Other validation
    DeploymentFailed,                // Module deployment error
    InitializationFailed,            // Module init error
    InvalidPaymentAsset,             // Asset validation

    // Registry
    DaoAlreadyRegistered,            // Duplicate registration
}
```

---

## Tests Needed

### Implementation Management
- [ ] Register implementation (admin only)
- [ ] Register multiple implementations
- [ ] Get latest implementation
- [ ] Approve upgrade (both must exist)
- [ ] is_upgrade_approved returns true for approved paths
- [ ] Revoke implementation blocks new deployments
- [ ] Revoke blocks upgrades to revoked hash
- [ ] Unauthorized registration fails
- [ ] Unauthorized upgrade approval fails
- [ ] Unauthorized revoke fails

### Factory
- [ ] Full DAO deployment succeeds
- [ ] All 5 modules deployed with correct addresses
- [ ] Address prediction matches actual deployment
- [ ] Founder allocation (modulo-100) correct
- [ ] Founder allocation edge cases (1%, 99%, split founders)
- [ ] Final authorities correct (governance-owned)
- [ ] Duplicate (creator, nonce) fails
- [ ] Invalid params fail (overflow, empty strings, etc.)
- [ ] Factory pause prevents creation
- [ ] Factory unpause allows creation
- [ ] Multiple DAOs can be created sequentially
- [ ] Different creators can use same nonce

### Registry
- [ ] DAO registered automatically after creation
- [ ] Get DAO by token address
- [ ] Enumerate DAOs (pagination)
- [ ] Get DAO count accurate
- [ ] is_dao returns true for registered, false otherwise
- [ ] Enumeration pagination works correctly

### Integration
- [ ] Create DAO, then call contracts successfully
- [ ] Token minting works with MetadataRenderer
- [ ] Auction can be launched
- [ ] Governor can create proposals
- [ ] Treasury receives assets

---

## Storage Considerations

**Estimated costs per DAO:**
- DaoCreation struct: ~500 bytes
- Registry entry: ~200 bytes
- Total per DAO: ~700 bytes

**For 1000 DAOs:** ~700 KB (very manageable on Soroban)

---

## Future Enhancements

1. **Multisig Admin** - Replace single admin with multisig
2. **Version Constraints** - Specify version ranges in upgrade approval
3. **Factory Fees** - Charge for DAO creation (protocol revenue)
4. **DAO Metadata Updates** - Governance-controlled name/description changes
5. **Module Replacement** - Allow swapping out one module type
6. **Admin Transfer** - Ownership handoff flow

---

## Security Considerations

1. **Deterministic Deployment** - Salt includes version to prevent cross-version issues
2. **Atomic Deployment** - All-or-nothing: if any module fails, entire transaction reverts
3. **Governance Ownership** - No admin backdoors after creation
4. **Nonce Uniqueness** - (creator, nonce) prevents replay
5. **Implementation Revocation** - Emergency measure for compromised WASM
6. **Factory Pause** - Kill switch for critical vulnerabilities
7. **Bounded Input Validation** - All strings, percentages, periods checked

---

## Deployment Checklist

- [ ] Manager contract implementation complete
- [ ] All tests passing
- [ ] Error handling comprehensive
- [ ] Event emissions correct
- [ ] TypeScript bindings generated
- [ ] Frontend can predict addresses
- [ ] Frontend can call create_dao
- [ ] Indexer configured for new events
- [ ] Documentation complete
