# Minter Contract Implementation Handoff

**Date**: October 6, 2026
**For**: contract-writer Agent
**Status**: READY FOR IMPLEMENTATION
**Priority**: HIGH (Blocks testnet deployment)
**Estimated Effort**: 5-7 days for full implementation

---

## Context

The Token contract is currently **135K** and exceeds testnet RPC simulation capacity. The solution is to extract all minting logic into a dedicated **Minter contract** and refactor the Token contract to delegate minting calls to it.

**Result**:
- Token: 135K → 40K (48% reduction)
- Minter: 30K (new)
- Net: 65K savings
- **Benefit**: Enables testnet deployment + better architecture

---

## Design Summary

**Single Minter Contract with Pluggable Strategies**

The Minter implements a **strategy pattern** allowing Token to delegate minting to different registered strategies:

```
Token Contract
    ↓
    Minter.mint(strategy_id, recipient, amount)
    ↓
    Strategy Router
    ├─ Strategy 0: Batch Minting
    ├─ Strategy 1: Merkle Verified
    ├─ Strategy 2: Allowlist
    ├─ Strategy 3: Tiered (future)
    └─ Strategy 4+: Custom Validators
```

**Key Design Points**:
1. Single contract (not multiple minter contracts)
2. Admin registers strategies dynamically
3. Token delegates all minting calls
4. Strategies contain their own config and state
5. Each strategy type has its own validation logic

---

## Full Specification

**See**: `/MINTER_CONTRACT_DESIGN.md` (1100+ lines)

This document contains:
- Complete Rust interface definition
- All data structures and enums
- Detailed explanation of each strategy type
- Authorization model
- Storage layout
- Security considerations
- Events and indexer integration
- Implementation roadmap

**Start here before coding.**

---

## Implementation Tasks

### Phase 1: Core Minter Contract (Days 1-3)

**Goal**: Functional Minter contract with Batch strategy

**Tasks**:

1. **Create contract scaffold**
   ```
   contracts/minter/
   ├── Cargo.toml
   ├── src/
   │   ├── lib.rs
   │   ├── contract.rs
   │   ├── strategy/
   │   │   ├── mod.rs
   │   │   ├── batch.rs
   │   │   ├── merkle.rs
   │   │   ├── allowlist.rs
   │   │   └── custom.rs
   │   ├── storage.rs
   │   ├── errors.rs
   │   └── events.rs
   └── tests/
   ```

2. **Implement storage layer**
   - `ADMIN` static
   - `TOKEN_ADDRESS` static
   - `STRATEGIES` map (u32 → StrategyInfo)
   - `NEXT_STRATEGY_ID` counter
   - `STRATEGY_STATE` map (u32 → StrategyState)

3. **Implement initialization**
   - `initialize(token: Address, admin: Address)`
   - Set admin and token address
   - Initialize strategy ID counter at 1 (0 reserved for default)

4. **Implement Batch Strategy**
   - Create `BatchConfig` struct with caps
   - Implement `mint(strategy_id, recipient, amount)`
   - Implement `mint_batch(strategy_id, recipients[], amounts[])`
   - Validate: admin authorized, batch size limits, global caps
   - Call `Token.transfer()` for each mint

5. **Implement core admin functions**
   - `register_strategy(type, name, config)` → u32
   - `update_admin(new_admin)`
   - `update_token(new_token)`
   - Guard with admin check

6. **Test integration with Token contract**
   - Token calls `Minter.mint_batch()`
   - Verify tokens transferred correctly
   - Verify caps enforced

---

### Phase 2: Strategy Types (Days 3-4)

**Goal**: Full strategy routing and all strategy types working

**Tasks**:

1. **Implement Merkle Strategy**
   - `MerkleConfig` with merkle_root, decimals, claimable amount
   - `mint_with_proof(strategy_id, recipient, amount, proof: Bytes)`
   - Merkle proof verification logic
   - Track per-recipient claimed amounts
   - Return error if already claimed

2. **Implement Allowlist Strategy**
   - `AllowlistConfig` with address set and fixed amount
   - Validation: address in allowlist, amount matches config amount
   - Track per-address claims

3. **Implement Strategy Routing**
   - Router in `mint()` and `mint_batch()` to call strategy-specific logic
   - Update state regardless of strategy type
   - Emit events with strategy_id

4. **Implement Admin Functions**
   - `pause_strategy(strategy_id)`
   - `resume_strategy(strategy_id)`
   - `update_strategy(strategy_id, new_config)`
   - Prevent updates to already-used strategies (mark immutable after first mint)

5. **Implement Query Functions**
   - `get_strategy(strategy_id)` → StrategyInfo
   - `list_strategies()` → Vec<(u32, StrategyInfo)>
   - `get_strategy_state(strategy_id)` → StrategyState

6. **Testing**
   - Unit tests for each strategy
   - Integration tests with Token contract
   - Edge cases: double-claiming merkle, allowlist exhaustion, cap overflow

---

### Phase 3: Token Contract Refactoring (Days 4-5)

**Goal**: Token contract delegates all minting to Minter

**Tasks**:

1. **Update Token initialization**
   - Add `minter_address: Address` field
   - `initialize()` now takes minter address
   - Manager contract passes minter address to Token

2. **Replace batch minting logic**
   - Remove embedded `batch_mint()` implementation
   - Implement `mint_batch()` as delegation to `Minter.mint_batch()`
   - Keep same public interface (Token.mint_batch())

3. **Remove merkle verification**
   - Delete merkle proof code from Token
   - If users call `mint_with_merkle()` on Token, delegate to Minter

4. **Reduce Token size**
   - Verify WASM shrinks to ~40K
   - Check build time (should be faster)
   - Run tests to ensure nothing broke

5. **Integration testing**
   - Full Token ↔ Minter workflow
   - Verify mint calls from Token are counted in Minter state
   - Verify events emitted from Minter, not Token

---

### Phase 4: Events and Indexing (Days 5-6)

**Goal**: Minter events properly emitted and indexed

**Tasks**:

1. **Define and emit events**
   - `MintEvent` (strategy_id, recipient, amount, ledger)
   - `StrategyRegisteredEvent` (strategy_id, type, name)
   - `StrategyPausedEvent` (strategy_id)
   - `StrategyUpdatedEvent` (strategy_id)

2. **Update Goldsky transforms** (if applicable)
   - Ensure Minter events reach indexed tables
   - Map event data to activity feed schema
   - Verify event name and topics extraction

3. **Add debug logging**
   - Log strategy selection
   - Log validation steps
   - Log cap calculations

4. **Testing**
   - Event emission tests
   - Event parsing tests
   - Audit trail completeness

---

### Phase 5: Polish and Testing (Days 6-7)

**Goal**: Production-ready implementation

**Tasks**:

1. **Comprehensive testing**
   - [ ] Unit tests for all strategies
   - [ ] Integration tests with Token
   - [ ] Fuzzing / edge case testing
   - [ ] Gas cost verification
   - [ ] Storage cost verification

2. **Error handling**
   - [ ] All error cases have descriptive messages
   - [ ] No panics in production code
   - [ ] Proper error propagation

3. **Documentation**
   - [ ] Inline code comments
   - [ ] Admin operations guide
   - [ ] Integration examples
   - [ ] Strategy configuration reference

4. **Pre-deployment verification**
   - [ ] WASM size: Minter < 35K, Token < 45K
   - [ ] No compiler warnings
   - [ ] All tests passing
   - [ ] Code review by team

5. **Deployment preparation**
   - [ ] Build script updates (if needed)
   - [ ] Testnet deployment checklist
   - [ ] Manager contract integration verified

---

## Key Design Decisions

### 1. Single Minter vs. Multiple Minters
**Decision**: Single Minter with pluggable strategies
**Rationale**: Easier to manage, cleaner Token integration, supports future strategies

### 2. Strategy ID Assignment
**Decision**: Admin-assigned unique IDs (auto-incremented)
**Rationale**: Allows strategy reordering, makes references stable

### 3. Claimed Tracking
**Decision**: Store per-recipient claimed amounts in Minter state
**Rationale**: Prevents double-claiming, works for all strategy types, efficient

### 4. Token Contract's Role
**Decision**: Token just delegates, doesn't enforce minting rules
**Rationale**: Keeps Token contract simple, Minter is the source of truth

### 5. Authorization Model
**Decision**: Strategy-level authorization (admin-only, token-only, public-with-proof, public, custom)
**Rationale**: Flexible for different use cases

---

## Rust Implementation Guidance

### Cargo.toml Dependencies

```toml
[package]
name = "minter"
version = "0.1.0"
edition = "2021"

[dependencies]
soroban-sdk = { workspace = true }
stellar-tokens = { workspace = true }

[lib]
crate-type = ["cdylib"]
```

### Module Structure

```rust
// lib.rs
pub mod contract;
pub mod strategy;
pub mod storage;
pub mod errors;
pub mod events;

pub use contract::MinterContract;
```

### Key Patterns

1. **Storage Access**
   ```rust
   let minter_state = MinterState::load(&env);
   minter_state.update(&env, |state| {
       state.total_minted += amount;
   });
   ```

2. **Cross-Contract Calls**
   ```rust
   let token = TokenContractClient::new(&env, &token_address);
   token.transfer(&minter_addr, &recipient, &amount, &[]);
   ```

3. **Strategy Routing**
   ```rust
   match strategy_info.strategy_type {
       StrategyType::Batch => self.execute_batch(&env, strategy_id, ...),
       StrategyType::Merkle => self.execute_merkle(&env, strategy_id, ...),
       // ...
   }
   ```

### Soroban-Specific Notes

- Use `Env::ledger().sequence()` for ledger number
- Use `Env::ledger().timestamp()` for time-based rate limiting
- Contract addresses are `Address` type (can be account or contract)
- Maps use `ScVal` internally; provide serialization if needed
- Event topics are limited to 4 items; pack efficiently

---

## Integration with Manager Contract

### Deployment Sequence

```
1. Deploy Minter contract
   minter_address = stellar contract deploy ...

2. Deploy Token contract (refactored)
   token_address = stellar contract deploy ... (pass minter_address)

3. Initialize Minter
   Minter.initialize(token_address, admin_address)

4. Register default strategies
   Minter.register_strategy(Batch, "Batch Minting", config)
   Minter.register_strategy(Merkle, "Whitelist", config)
   Minter.register_strategy(Allowlist, "Team", config)

5. Manager invokes Token.mint_batch() → works via delegation
```

### Manager Contract Changes

**No changes needed** to Manager contract itself. Just pass minter address to Token during initialization.

---

## Testing Checklist

### Unit Tests

- [ ] Batch strategy validates correctly
- [ ] Merkle proof verification works
- [ ] Allowlist lookup is accurate
- [ ] Rate limiting enforces correctly
- [ ] Global caps prevent overflow
- [ ] Per-recipient caps work
- [ ] Strategy state updates properly

### Integration Tests

- [ ] Token.mint_batch() calls Minter.mint_batch()
- [ ] Minter state tracked independently
- [ ] Events emitted from Minter
- [ ] Authorization checks work end-to-end
- [ ] Failed mints don't update state

### Edge Cases

- [ ] Merkle proof with extra bytes
- [ ] Merkle proof for unclaimed recipient
- [ ] Merkle proof for already-claimed recipient
- [ ] Allowlist with zero amount
- [ ] Strategy ID collision (shouldn't happen)
- [ ] Admin transfer during active strategy

---

## Success Criteria

- [ ] Minter contract deploys to testnet
- [ ] Token contract size < 45K
- [ ] Minter contract size < 35K
- [ ] All four strategy types work
- [ ] Token ↔ Minter integration seamless
- [ ] Events properly emitted and indexed
- [ ] All tests passing
- [ ] No compiler warnings
- [ ] Code reviewed and approved

---

## Questions to Clarify Before Starting

1. Should we support upgrading Minter (admin redeploy) with strategy data migration?
2. For merkle proofs, should we support variable amounts per leaf or fixed amounts?
3. Should rate limits be per-block or per-time-period?
4. For Custom validator strategy, should we cache validation results or call fresh each time?
5. Should Token contract have a "mint_direct" method bypassing Minter (for special cases)?

---

## Related Documents

- **MINTER_CONTRACT_DESIGN.md** — Full design specification (read first)
- **DEPLOYMENT_STATUS_2026-10-06.md** — Why this refactoring is needed
- **Token Contract** — `contracts/token/src/lib.rs` (will be modified)

---

## Handoff Status

✅ **Fully Specified**: All requirements documented
✅ **Design Approved**: Architecture reviewed and confirmed
✅ **Ready to Code**: Can start implementation immediately
✅ **Testnet Ready**: Deployment path clear

**Next Step**: contract-writer agent implements per this specification

---

**Prepared by**: Claude Code
**Date**: October 6, 2026
**For Delivery**: October 12, 2026 (estimated)

