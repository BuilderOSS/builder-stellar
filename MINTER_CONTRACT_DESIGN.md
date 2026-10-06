# Minter Contract Design — Pluggable Minting Architecture

**Date**: October 6, 2026
**Purpose**: Design a flexible, composable minting system that supports multiple minting strategies
**Status**: DESIGN PHASE - Ready for contract-writer implementation

---

## Executive Summary

Instead of embedding all minting logic in the Token contract, we propose a **single, pluggable Minter contract** that the Token contract can delegate to. This Minter implements a **strategy pattern** allowing different minting types to be registered and invoked dynamically, reducing Token contract size while enabling future extensibility.

**Architecture**: Single Minter contract with dynamic minting strategy registration
**Token Contract Integration**: Call external Minter contract for all minting operations
**Expected Size Savings**: Token: 135K → 40K, Minter: 30K (net improvement of 65K)

---

## 1. Core Concept: Pluggable Minting Strategies

### Single Minter Contract vs. Multiple Minters

**Option A: Single Minter Contract with Strategy Pattern** ✅ RECOMMENDED
- One contract: `minter.wasm` (30K)
- Admin can register multiple minting strategies dynamically
- Token contract calls `minter.mint()` with strategy ID
- Flexible: Add new strategies without redeploying
- Efficient: Single contract to manage
- **Chosen**: Better architecture, easier maintenance

**Option B: Multiple Minting Contracts**
- One for basic minting
- One for batch minting
- One for merkle-verified minting
- Problem: Token needs to know about each contract
- Problem: Harder to coordinate between them
- Problem: More contracts to deploy and manage

### Why Single Minter with Strategies?

1. **Token contract stays simple** — Just calls `minter.mint(strategy_id, args)`
2. **Strategies are pluggable** — Register new minting types without Token updates
3. **Version independently** — Minter upgrades don't affect Token
4. **Easy coordination** — Single contract manages all minting state
5. **Future-proof** — Support merkle, allowlist, tiered, custom strategies

---

## 2. Minter Contract Architecture

### Core Components

```rust
pub contract Minter {
    // ============ STORAGE ============

    // Admin (who can register/update strategies)
    static ADMIN: Address

    // Token contract address (who can call mint)
    static TOKEN_ADDRESS: Address

    // Registered minting strategies
    static STRATEGIES: Map<u32, StrategyInfo>

    // Strategy counter (auto-increment IDs)
    static NEXT_STRATEGY_ID: u32

    // Per-strategy state (rate limits, caps, tracking)
    static STRATEGY_STATE: Map<u32, StrategyState>

    // ============ INITIALIZATION ============

    pub fn initialize(token: Address, admin: Address) -> Result

    // ============ STRATEGY MANAGEMENT ============

    pub fn register_strategy(
        strategy_type: StrategyType,  // BATCH, MERKLE, ALLOWLIST, CUSTOM
        name: String,
        config: Bytes,                 // Strategy-specific config
    ) -> Result<u32>  // Returns strategy_id

    pub fn update_strategy(
        strategy_id: u32,
        config: Bytes,
    ) -> Result

    pub fn pause_strategy(strategy_id: u32) -> Result
    pub fn resume_strategy(strategy_id: u32) -> Result

    // ============ MINTING OPERATIONS ============

    pub fn mint(
        strategy_id: u32,
        recipient: Address,
        amount: u128,
    ) -> Result<bool>  // true if successful

    pub fn mint_batch(
        strategy_id: u32,
        recipients: Vec<Address>,
        amounts: Vec<u128>,
    ) -> Result<Vec<bool>>  // per-recipient success

    pub fn mint_with_proof(
        strategy_id: u32,
        recipient: Address,
        amount: u128,
        proof: Bytes,  // Merkle proof or other validation data
    ) -> Result<bool>

    // ============ STRATEGY QUERIES ============

    pub fn get_strategy(strategy_id: u32) -> Result<StrategyInfo>
    pub fn list_strategies() -> Result<Vec<(u32, StrategyInfo)>>
    pub fn get_strategy_state(strategy_id: u32) -> Result<StrategyState>

    // ============ ADMIN OPERATIONS ============

    pub fn update_token(new_token: Address) -> Result
    pub fn update_admin(new_admin: Address) -> Result
}
```

### Data Structures

```rust
pub enum StrategyType {
    Batch,       // Simple batch minting
    Merkle,      // Merkle tree verified minting
    Allowlist,   // Allowlist (addresses only)
    Tiered,      // Tiered amounts based on address
    Custom,      // Custom validation logic (via callbacks)
}

pub struct StrategyInfo {
    id: u32,
    strategy_type: StrategyType,
    name: String,
    description: String,
    created_ledger: u32,
    updated_ledger: u32,
    is_paused: bool,

    // Strategy-specific config
    config: StrategyConfig,
}

pub enum StrategyConfig {
    Batch(BatchConfig),
    Merkle(MerkleConfig),
    Allowlist(AllowlistConfig),
    Tiered(TieredConfig),
    Custom(CustomConfig),
}

pub struct BatchConfig {
    max_recipients_per_tx: u32,
    rate_limit_per_block: Option<u128>,  // Max tokens per block
    caps: Option<BatchCaps>,
}

pub struct MerkleConfig {
    merkle_root: Bytes,
    decimals: u8,
    total_claimable: u128,
    description: String,  // e.g., "Whitelist round 1"
}

pub struct AllowlistConfig {
    addresses: Set<Address>,
    amount_per_address: u128,
}

pub struct TieredConfig {
    tiers: Vec<(u32, u128)>,  // (threshold: voting power, amount)
    verification_contract: Option<Address>,  // Verify voting power
}

pub struct CustomConfig {
    validator_contract: Address,  // Contract to validate minting
    validator_method: String,      // Method to call
    user_data: Bytes,             // Custom data for validator
}

pub struct StrategyState {
    strategy_id: u32,
    total_minted: u128,
    mint_count: u32,
    last_mint_block: u32,
    is_paused: bool,

    // Per-minting-round data (can reset)
    round_number: u32,
    round_minted: u128,
    round_mint_count: u32,
}

pub struct BatchCaps {
    global_cap: u128,               // Total tokens ever for this strategy
    per_round_cap: Option<u128>,    // Per period
    per_recipient_cap: Option<u128>, // Max per address
}
```

---

## 3. Integration with Token Contract

### Token Contract Changes

**Current** (135K - monolithic):
```rust
pub fn mint_batch(recipients: Vec<Address>, amounts: Vec<u128>) -> Result {
    // All logic embedded here
}
```

**New** (40K - delegated):
```rust
pub fn mint_batch(recipients: Vec<Address>, amounts: Vec<u128>) -> Result {
    // Delegate to Minter contract
    let minter = contract::Minter::client();
    for (i, recipient) in recipients.iter().enumerate() {
        minter.mint(
            strategy_id: 0,  // Default batch strategy
            recipient,
            amounts[i],
        )?;
    }
}

pub fn mint_batch_via_strategy(
    strategy_id: u32,
    recipients: Vec<Address>,
    amounts: Vec<u128>,
) -> Result {
    // Token delegates entire batch to Minter with specific strategy
    let minter = contract::Minter::client();
    for (i, recipient) in recipients.iter().enumerate() {
        minter.mint(strategy_id, recipient, amounts[i])?;
    }
}
```

### Initialization Flow

```
Manager Contract
    ↓
    └─→ Deploy Token Contract (40K)
        ├─ Initialize with Minter address
        ├─ Set up metadata hooks
        └─ Enable governance integration

    └─→ Deploy Minter Contract (30K)
        ├─ Initialize with Token address
        ├─ Register default strategies:
        │  ├─ Strategy 0: Batch minting
        │  ├─ Strategy 1: Merkle verified
        │  └─ Strategy 2: Allowlist
        └─ Ready for additional strategies
```

---

## 4. Minting Strategy Types

### Strategy 1: Batch Minting (DEFAULT)

**Purpose**: Simple batch minting for admin operations
**Use Case**: Mint to founders, deploy initial supply

```rust
BatchConfig {
    max_recipients_per_tx: 100,
    rate_limit_per_block: None,
    caps: Some(BatchCaps {
        global_cap: 10_000_000,  // 10M tokens max
        per_round_cap: None,
        per_recipient_cap: None,
    }),
}
```

**Call Flow**:
```
Token.mint_batch([addr1, addr2, ...])
  ↓
Minter.mint_batch(strategy_id=0, [addr1, addr2, ...])
  ↓
Validate: admin authorized, batch size ok, caps not exceeded
  ↓
Token.transfer() called 100 times
```

### Strategy 2: Merkle-Verified Minting

**Purpose**: Prove ownership via merkle tree without listing all addresses
**Use Case**: Whitelist minting, community claims

```rust
MerkleConfig {
    merkle_root: 0xabcd...,
    decimals: 7,  // Stellar token decimals
    total_claimable: 100_000_000,  // Total available via this tree
    description: "Round 1 Whitelist".into(),
}
```

**Call Flow**:
```
User calls: Minter.mint_with_proof(
    strategy_id=1,
    recipient=user_addr,
    amount=1000,
    proof=[hash1, hash2, hash3, ...]
)
  ↓
Verify merkle proof:
  - Hash(user_addr + amount) + proof hashes → merkle_root
  - Check against stored merkle_root
  ↓
Check amount hasn't been claimed already (track per-recipient)
  ↓
Token.transfer(user_addr, amount)
```

### Strategy 3: Allowlist Minting

**Purpose**: Fixed amount to approved addresses
**Use Case**: Vesting for team members, community allocations

```rust
AllowlistConfig {
    addresses: {addr1, addr2, addr3, ...}.into(),
    amount_per_address: 10_000,  // Each address gets 10k
}
```

**Call Flow**:
```
User calls: Minter.mint(
    strategy_id=2,
    recipient=user_addr,
    amount=10_000  // Should match config amount
)
  ↓
Verify: user_addr in allowlist
Verify: amount matches allowlist amount
Verify: not already claimed
  ↓
Token.transfer(user_addr, 10_000)
```

### Strategy 4: Tiered Minting (FUTURE)

**Purpose**: Amount based on governance power
**Use Case**: Distribute tokens proportionally to existing voters

```rust
TieredConfig {
    tiers: vec![
        (1000, 100),     // 100 tokens if voting power >= 1000
        (10000, 1000),   // 1000 tokens if voting power >= 10000
        (100000, 10000), // 10000 tokens if voting power >= 100000
    ],
    verification_contract: Some(governor_address),
}
```

**Call Flow**:
```
User calls: Minter.mint(
    strategy_id=3,
    recipient=user_addr,
    amount=0  // Calculated from tier
)
  ↓
Call Governor contract: get_voting_power(user_addr)
  ↓
Determine tier and amount from voting power
  ↓
Token.transfer(user_addr, calculated_amount)
```

### Strategy 5: Custom Validation (EXTENSIBLE)

**Purpose**: Arbitrary minting validation via pluggable contract
**Use Case**: Complex eligibility rules, cross-chain verification

```rust
CustomConfig {
    validator_contract: custom_validator_addr,
    validator_method: "validate_mint".into(),
    user_data: Bytes::from("param1=value1&param2=value2"),
}
```

**Call Flow**:
```
User calls: Minter.mint_with_proof(
    strategy_id=4,
    recipient=user_addr,
    amount=5000,
    proof=arbitrary_bytes  // e.g., signed message, cross-chain proof
)
  ↓
Call CustomValidator.validate_mint(
    recipient=user_addr,
    amount=5000,
    proof=proof,
    user_data=custom_data
)
  ↓
If validation returns true:
  Token.transfer(user_addr, 5000)
Else:
  Error
```

---

## 5. Authorization Model

### Who Can Do What?

```
┌─ ADMIN ──────────────────────────────────────────────┐
│                                                      │
│  ✅ Register new strategies                         │
│  ✅ Update strategy configs                        │
│  ✅ Pause/resume strategies                        │
│  ✅ Update token contract address                  │
│  ✅ Transfer admin to new address                  │
│  ❌ Mint directly (must use strategies)            │
│
└──────────────────────────────────────────────────────┘

┌─ TOKEN CONTRACT ──────────────────────────────────────┐
│                                                       │
│  ✅ Call Minter.mint() with any strategy            │
│  ✅ Call Minter.mint_batch() with any strategy      │
│  ✅ Call Minter.mint_with_proof() with proof        │
│  ❌ Modify strategy configs                         │
│
└───────────────────────────────────────────────────────┘

┌─ USERS ────────────────────────────────────────────────┐
│                                                        │
│  ✅ Call Minter.mint_with_proof() if eligible        │
│     (only if strategy allows public minting)         │
│  ✅ Query strategy info and state                    │
│  ❌ Modify any state                                 │
│
└────────────────────────────────────────────────────────┘
```

### Strategy-Level Authorization

```rust
pub struct StrategyInfo {
    // ...

    // Who can invoke this strategy?
    authorization: StrategyAuthorization,
}

pub enum StrategyAuthorization {
    AdminOnly,           // Only admin can call
    TokenOnly,           // Only Token contract can call
    PublicWithProof,     // Anyone can call with valid proof
    Public,              // Anyone can call anytime
    Custom(Address),     // Delegate to custom contract
}
```

---

## 6. Upgrade and Extensibility

### Adding New Strategies at Runtime

**Example**: Add NFT-gated minting without redeploying anything

```
Admin calls: Minter.register_strategy(
    strategy_type: Custom,
    name: "NFT Gated Minting",
    config: CustomConfig {
        validator_contract: nft_validator_addr,
        validator_method: "validate_holds_nft",
        user_data: "nft_contract=..." ,
    }
)

Returns: strategy_id = 5

User can now call:
Minter.mint_with_proof(
    strategy_id: 5,
    recipient: user_addr,
    amount: 1000,
    proof: ... // NFT ownership proof
)
```

### Redeploying Minter (Never Token)

If minting logic needs updates:
1. Deploy new Minter.wasm
2. Transfer admin to new contract
3. Register strategies again
4. Token contract remains unchanged ← **KEY BENEFIT**

---

## 7. Storage and Gas Efficiency

### Size Breakdown

**Current Token Contract (135K)**:
- Batch minting logic: 25K
- Merkle verification: 15K
- Metadata hooks: 20K
- Governor integration: 15K
- Core token logic: 60K
- **Total**: 135K

**Refactored Token Contract (40K)**:
- Metadata hooks: 20K
- Governor integration: 15K
- Core token logic: 5K (reduced, delegation calls)
- **Total**: 40K

**New Minter Contract (30K)**:
- Batch minting: 8K
- Merkle verification: 10K
- Strategy registration: 5K
- Routing logic: 7K
- **Total**: 30K

**Net Savings**: 135K → 70K = **65K reduction** (48% smaller)

### Storage Patterns

```rust
// Minimal on-chain storage for Minter
// Most state tracked in ledger entries (cheap)

static STRATEGIES: Map<u32, StrategyInfo>  // ~5KB per strategy
static STRATEGY_STATE: Map<u32, StrategyState>  // ~1KB per strategy

// Token contract storage unchanged
// Just adds reference to Minter address (~32 bytes)
```

---

## 8. Security Considerations

### Attack Vectors and Mitigations

| Vector | Mitigation |
|--------|-----------|
| Admin key compromised | Multi-sig admin (future enhancement) |
| Merkle root collision | Use standard merkle libraries, audit proof |
| Rate limit bypass | On-contract enforcement, ledger blocking |
| Double spending | Track claimed amounts per address |
| Strategy confusion | Clear IDs, event logging per strategy |
| Cross-contract reentrancy | Use checks-effects-interactions, Stellar's soroban_sdk handles safely |

### Audit Points

- [ ] Merkle proof validation is correct
- [ ] Rate limits are enforced
- [ ] Claimed amount tracking prevents double-mint
- [ ] Admin functions properly gated
- [ ] Token contract calls are validated
- [ ] Strategy configs can't be modified unsafely

---

## 9. Events and Observability

### Events Emitted by Minter

```rust
pub struct MintEvent {
    strategy_id: u32,
    recipient: Address,
    amount: u128,
    ledger: u32,
}

pub struct StrategyRegisteredEvent {
    strategy_id: u32,
    strategy_type: StrategyType,
    name: String,
}

pub struct StrategyPausedEvent {
    strategy_id: u32,
}

pub struct StrategyUpdatedEvent {
    strategy_id: u32,
    // previous_config and new_config optional
}
```

### Indexer Integration (Goldsky)

```sql
CREATE VIEW minter_mints AS
SELECT
    decoded_events.event_index,
    decoded_events.topics[0]::text as strategy_id,
    decoded_events.topics[1]::text as recipient,
    decoded_events.args->>'amount' as amount,
    decoded_events.ledger_closed_at as created_at
FROM chain.decoded_events
WHERE
    contract_id = 'minter_contract_address'
    AND event_name = 'MintEvent'
```

---

## 10. Implementation Roadmap

### Phase 1: MVP (Immediate)
- [ ] Single Minter contract with Batch strategy
- [ ] Token contract delegates all minting to Minter
- [ ] Deploy to testnet, verify Token size reduction
- [ ] Create Manager → Token → Minter deployment chain

### Phase 2: Extended Strategies (Week 1)
- [ ] Merkle-verified minting
- [ ] Allowlist strategy
- [ ] Rate limiting and caps

### Phase 3: Governance Integration (Week 2)
- [ ] Tiered minting based on voting power
- [ ] Governor contract callbacks

### Phase 4: Extensibility (Week 3)
- [ ] Custom validation via pluggable contracts
- [ ] Event emission and indexing

### Phase 5: Polish (Week 4)
- [ ] Comprehensive audit
- [ ] Documentation and examples
- [ ] Multi-sig admin option

---

## 11. Specification for Contract Writer

### Interface Summary

```
TOKEN CONTRACT CALLS:
├─ Minter.mint(strategy_id, recipient, amount) → Result
├─ Minter.mint_batch(strategy_id, recipients[], amounts[]) → Result
└─ Minter.mint_with_proof(strategy_id, recipient, amount, proof) → Result

ADMIN CALLS:
├─ Minter.register_strategy(type, name, config) → u32
├─ Minter.update_strategy(strategy_id, config) → Result
├─ Minter.pause_strategy(strategy_id) → Result
└─ Minter.update_admin(new_admin) → Result

QUERY CALLS:
├─ Minter.get_strategy(strategy_id) → StrategyInfo
├─ Minter.list_strategies() → Vec<(u32, StrategyInfo)>
└─ Minter.get_strategy_state(strategy_id) → StrategyState

INITIALIZATION:
└─ Minter.initialize(token_address, admin_address) → Result
```

### Deliverables

1. **Minter.wasm** (~30K)
   - All strategy types implemented
   - Event emission
   - Full documentation

2. **Updated Token Contract** (~40K)
   - Remove batch minting logic
   - Add Minter delegation
   - Update initialization

3. **Documentation**
   - Integration guide
   - Strategy configuration examples
   - Admin operations guide

---

## 12. Questions for Contract Writer

1. Should `mint_with_proof` return the amount actually minted (for merkle with variable amounts)?
2. For rate limiting, should we use block-based or time-based (ledger closing time)?
3. Should strategies have version numbers or just update-ledger tracking?
4. For the Custom validator strategy, should we call back to Token contract for authorization too?
5. Should we pre-register default strategies (batch, merkle, allowlist) or let admin do it?

---

## Summary

This design enables:

✅ **Single Minter contract** with pluggable strategies
✅ **Token size reduction** from 135K → 40K (48% reduction)
✅ **Future extensibility** without Token redeployment
✅ **Clean separation** of concerns
✅ **Independent upgrades** for minting logic
✅ **Support for merkle, allowlist, tiered, custom minting**

**Ready for**: Contract-writer implementation → Testnet deployment → Full manager rollout

