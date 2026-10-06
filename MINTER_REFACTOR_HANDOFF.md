# Minter Contract Refactor - Comprehensive Handoff

**Date**: October 6, 2026
**For**: contract-writer Agent
**Status**: READY FOR REFACTORING
**Priority**: HIGH (Simplifies architecture significantly)
**Estimated Effort**: 3-4 hours for complete refactor + testing

---

## Context

The current Minter contract uses a **strategy pattern with IDs** (Strategy 0, 1, 2, etc.). Through user feedback, we've identified a **much simpler and cleaner architecture** that eliminates complexity while improving security and usability.

### Key Architectural Changes

1. **No strategy registry** - Remove strategy ID pattern
2. **Direct methods** - Explicit `mint_batch()`, `mint_merkle()`, `mint_allowlist()` methods
3. **Token ID parameter** - Each minting call requires token contract address
4. **Dynamic admin derivation** - Admin authority comes from token owner, not stored state
5. **Reduced storage** - Only store merkle_root, allowlist, allowlist_amount, claimed tracking

---

## Current Problems with Existing Minter

### Problem 1: Strategy Pattern Complexity
```rust
// Current (problematic)
pub fn mint(
    strategy_id: u32,
    recipient: Address,
    amount: u128,
    proof: Bytes
) -> Result<(), Error>

// Router logic:
match strategy_type {
    Batch => validate_batch(...),
    Merkle => validate_merkle(...),
    Allowlist => validate_allowlist(...),
}
```

**Issues**:
- Generic method that tries to handle all cases
- Router logic hard to understand
- Strategy registry adds complexity
- Strategy IDs must be tracked and remembered

### Problem 2: Admin Stored as State
```rust
// Current
ADMIN: Address  // Stored in contract

// Problem: If token owner changes, Minter doesn't know
// Solution: Derive admin from token owner each time
```

### Problem 3: No Token ID Parameter
```rust
// Current
Minter stores which token it serves
// Problem: Can't serve multiple tokens

// New
Each call includes token_id
// Solution: Flexible, can work with any token
```

---

## New Architecture - Three Direct Methods

### Method 1: mint_batch (Admin Only)

```rust
pub fn mint_batch(
    env: Env,
    token_id: Address,
    recipients: Vec<Address>,
    amounts: Vec<u128>,
) -> Result<(), Error> {
    // Get admin from token owner
    let admin = self.get_admin(&env, &token_id)?;
    admin.require_auth();

    // Validate token_id
    self.validate_token_id(&env, &token_id)?;

    // Validate batch
    if recipients.len() != amounts.len() {
        return Err(Error::InvalidInput);
    }
    if recipients.len() > 100 {
        return Err(Error::BatchTooLarge);
    }

    // Mint to each recipient
    for (recipient, amount) in recipients.iter().zip(amounts.iter()) {
        self.validate_and_mint(&env, &token_id, recipient, amount)?;
    }
    Ok(())
}
```

**Use Case**: Admin distributes tokens to founders, treasury, early supporters
**Who Calls**: Token owner / Governor contract
**Authorization**: Token owner signature required

---

### Method 2: mint_merkle (User Self-Service with Proof)

```rust
pub fn mint_merkle(
    env: Env,
    token_id: Address,
    recipient: Address,
    amount: u128,
    proof: Bytes,
) -> Result<(), Error> {
    recipient.require_auth();

    // Validate token_id
    self.validate_token_id(&env, &token_id)?;

    // Get merkle root from storage
    let merkle_root = self.get_merkle_root(&env, &token_id)?;

    // Verify proof against root
    self.verify_merkle_proof(&recipient, &amount, &proof, &merkle_root)?;

    // Check not already claimed
    if self.is_claimed(&env, &token_id, &recipient) {
        return Err(Error::AlreadyClaimed);
    }

    // Mint
    self.validate_and_mint(&env, &token_id, &recipient, &amount)?;
    self.mark_claimed(&env, &token_id, &recipient);

    Ok(())
}
```

**Use Case**: Community members claim tokens with merkle proof (whitelisted)
**Who Calls**: Any user with valid merkle proof
**Authorization**: Merkle proof + user signature
**Storage**: merkle_root per token

---

### Method 3: mint_allowlist (User Self-Service Fixed Amount)

```rust
pub fn mint_allowlist(
    env: Env,
    token_id: Address,
    recipient: Address,
    amount: u128,
) -> Result<(), Error> {
    recipient.require_auth();

    // Validate token_id
    self.validate_token_id(&env, &token_id)?;

    // Get allowlist config
    let (allowlist, fixed_amount) = self.get_allowlist_config(&env, &token_id)?;

    // Validate recipient in allowlist
    if !allowlist.contains(&recipient) {
        return Err(Error::NotInAllowlist);
    }

    // Validate amount matches fixed amount
    if amount != fixed_amount {
        return Err(Error::InvalidAmount);
    }

    // Check not already claimed
    if self.is_claimed(&env, &token_id, &recipient) {
        return Err(Error::AlreadyClaimed);
    }

    // Mint
    self.validate_and_mint(&env, &token_id, &recipient, &amount)?;
    self.mark_claimed(&env, &token_id, &recipient);

    Ok(())
}
```

**Use Case**: Team members or partners claim fixed token amounts
**Who Calls**: Any user in the allowlist
**Authorization**: Allowlist membership + user signature
**Storage**: allowlist and allowlist_amount per token

---

## Admin Functions (Configuration)

### set_merkle_root

```rust
pub fn set_merkle_root(
    env: Env,
    token_id: Address,
    root: Bytes,
) -> Result<(), Error> {
    // Admin check: derive from token owner
    let admin = self.get_admin(&env, &token_id)?;
    admin.require_auth();

    // Validate token_id
    self.validate_token_id(&env, &token_id)?;

    // Store merkle root
    env.storage().instance()
        .set(&("merkle_root", &token_id), &root);

    env.events().publish(("merkle_root_set",), &token_id);
    Ok(())
}
```

**Who Calls**: Token owner / Governor
**When**: Before users can claim via merkle proof

---

### set_allowlist

```rust
pub fn set_allowlist(
    env: Env,
    token_id: Address,
    addresses: Vec<Address>,
    fixed_amount: u128,
) -> Result<(), Error> {
    // Admin check: derive from token owner
    let admin = self.get_admin(&env, &token_id)?;
    admin.require_auth();

    // Validate token_id
    self.validate_token_id(&env, &token_id)?;

    // Store allowlist config
    env.storage().instance()
        .set(&("allowlist", &token_id), &addresses);
    env.storage().instance()
        .set(&("allowlist_amount", &token_id), &fixed_amount);

    env.events().publish(("allowlist_set",), (&token_id, addresses.len()));
    Ok(())
}
```

**Who Calls**: Token owner / Governor
**When**: Before users can claim via allowlist

---

## Storage Layout (Simplified)

```rust
// contracts/minter/src/storage.rs

#[contracttype]
pub enum MinterKey {
    /// Merkle root for proof-based claims
    /// Maps token_id -> merkle root bytes
    MerkleRoot(Address),

    /// Allowlist for fixed-amount claims
    /// Maps token_id -> Vec<Address>
    Allowlist(Address),

    /// Fixed amount for allowlist claims
    /// Maps token_id -> u128
    AllowlistAmount(Address),

    /// Track who's already claimed
    /// Maps (token_id, recipient) -> bool
    Claimed(Address, Address),
}
```

**No stored admin** - derived from token owner
**No strategy registry** - methods are direct
**No strategy state** - validation is inline

---

## Helper Functions (Internal)

### get_admin (Derives from Token Owner)

```rust
fn get_admin(&self, env: &Env, token_id: &Address) -> Result<Address, Error> {
    // Query token contract for owner
    let token_client = TokenClient::new(env, token_id);
    let owner = token_client.owner()
        .map_err(|_| Error::TokenContractError)?;
    Ok(owner)
}
```

**Key Point**: Admin is NOT stored - it's derived from token owner
**Benefit**: Admin changes automatically if token owner changes

---

### validate_token_id

```rust
fn validate_token_id(&self, env: &Env, token_id: &Address) -> Result<(), Error> {
    // Verify token contract responds to mint() call
    // This ensures it's actually a valid token contract
    let token_client = TokenClient::new(env, token_id);
    let _ = token_client.owner()?;  // Simple check
    Ok(())
}
```

**Purpose**: Ensure token_id is a valid token contract
**Prevents**: Calling mint on wrong contract

---

### validate_and_mint

```rust
fn validate_and_mint(
    &self,
    env: &Env,
    token_id: &Address,
    recipient: &Address,
    amount: &u128,
) -> Result<(), Error> {
    // Final validation
    if *amount == 0 {
        return Err(Error::InvalidAmount);
    }

    // Call Token.mint() to create tokens
    let token_client = TokenClient::new(env, token_id);
    token_client.mint(recipient, *amount)?;

    // Emit event
    env.events().publish(("mint",), (recipient, amount));

    Ok(())
}
```

**Key Point**: This is where Minter calls Token.mint()
**Important**: Token.mint() must validate caller is Minter via require_auth

---

## Complete Method Reference

| Method | Params | Auth | Purpose |
|--------|--------|------|---------|
| **mint_batch** | token_id, recipients[], amounts[] | Token owner | Admin distributes tokens |
| **mint_merkle** | token_id, recipient, amount, proof | Merkle proof + user | User claims with proof |
| **mint_allowlist** | token_id, recipient, amount | Allowlist + user | User claims from list |
| **set_merkle_root** | token_id, root | Token owner | Admin sets merkle whitelist |
| **set_allowlist** | token_id, addresses[], amount | Token owner | Admin sets allowlist |

---

## Error Types (Comprehensive)

```rust
// contracts/minter/src/errors.rs

#[derive(Debug)]
pub enum Error {
    // Validation errors
    InvalidInput,
    InvalidAmount,
    InvalidTokenId,
    BatchTooLarge,

    // Authorization errors
    Unauthorized,
    NotTokenOwner,
    NotInAllowlist,

    // State errors
    AlreadyClaimed,
    MerkleRootNotSet,
    AllowlistNotSet,

    // Cross-contract errors
    TokenContractError,
    MerkleProofInvalid,

    // System errors
    StorageError,
}
```

---

## Event Types

```rust
// contracts/minter/src/events.rs

#[contractevent]
pub struct MintEvent {
    pub recipient: Address,
    pub amount: u128,
    pub ledger: u32,
}

#[contractevent]
pub struct MintBatchEvent {
    pub recipient_count: u32,
    pub total_amount: u128,
    pub ledger: u32,
}

#[contractevent]
pub struct MerkleRootSetEvent {
    pub token_id: Address,
    pub ledger: u32,
}

#[contractevent]
pub struct AllowlistSetEvent {
    pub token_id: Address,
    pub member_count: u32,
    pub ledger: u32,
}
```

---

## Implementation Tasks

### Phase 1: Core Contract Restructure (1.5 hours)

- [ ] Remove strategy pattern entirely
  - Delete `strategy/` module directory
  - Remove `StrategyInfo`, `StrategyConfig`, `StrategyState` enums
  - Remove `register_strategy()`, `update_strategy()`, `pause_strategy()` methods

- [ ] Remove admin storage
  - Delete `ADMIN` static
  - Remove `update_admin()` method
  - Update `get_admin()` to derive from token owner

- [ ] Add token_id parameter to all public methods
  - Add to `mint_batch()`, `mint_merkle()`, `mint_allowlist()`
  - Add to `set_merkle_root()`, `set_allowlist()`
  - Update all internal calls to use token_id

- [ ] Simplify storage
  - Keep: MerkleRoot(Address), Allowlist(Address), AllowlistAmount(Address), Claimed(Address, Address)
  - Remove: All strategy-related storage

---

### Phase 2: Core Methods Implementation (1 hour)

- [ ] Implement `mint_batch()` with direct validation
- [ ] Implement `mint_merkle()` with proof validation
- [ ] Implement `mint_allowlist()` with list validation
- [ ] Implement `set_merkle_root()`
- [ ] Implement `set_allowlist()`
- [ ] Update all helper functions to use token_id parameter

---

### Phase 3: Testing (1-1.5 hours)

- [ ] Unit tests for each minting method
- [ ] Test admin derivation from token owner
- [ ] Test token_id validation
- [ ] Test merkle proof validation
- [ ] Test allowlist membership validation
- [ ] Test double-claim prevention
- [ ] Integration test: Minter calls Token.mint()
- [ ] Test all error cases

---

### Phase 4: Token Contract Integration (0.5 hours)

- [ ] Verify Token has single `mint()` method
- [ ] Verify Token.mint() calls require_auth(&minter)
- [ ] Test Token ↔ Minter integration
- [ ] Ensure backwards compatibility where needed

---

## Compilation & Size Goals

- **Minter WASM**: Target < 40K (current 46K)
- **Compilation time**: < 2s
- **Warnings**: Zero (except intentional dead code for future features)
- **Errors**: Zero

---

## Key Design Principles

1. **No Stored Admin**
   - Admin = Token owner (derived from token contract)
   - Changes automatically if token owner changes
   - One source of truth

2. **Token ID Required**
   - Every call includes token_id parameter
   - Validates token_id in validate_token_id()
   - Prevents wrong token minting

3. **Three Direct Methods**
   - `mint_batch()` - Admin distributes
   - `mint_merkle()` - User claims with proof
   - `mint_allowlist()` - User claims from list
   - No router, no strategy pattern

4. **Simple Storage**
   - Only store: merkle_root, allowlist, allowlist_amount, claimed tracking
   - Everything else: derive or inline

5. **Cross-Contract Safety**
   - Minter calls Token.mint()
   - Token verifies Minter via require_auth()
   - Clear authorization flow

---

## Security Checklist

- [ ] Admin derived from token owner
- [ ] Token ID validated on every call
- [ ] Auth required for admin functions
- [ ] Auth required for user claims
- [ ] Double-claim prevention via storage
- [ ] Merkle proof validation
- [ ] Allowlist membership validation
- [ ] No panics in production code
- [ ] All error cases handled
- [ ] Events properly emitted

---

## Testing Scenarios

### Scenario 1: Batch Minting
```
Admin calls: Minter.mint_batch(token_id, [Alice, Bob], [100, 200])
  ✓ Admin derived from token owner
  ✓ Token ID validated
  ✓ Recipients and amounts arrays match
  ✓ Minter calls Token.mint(Alice, 100)
  ✓ Minter calls Token.mint(Bob, 200)
  ✓ Events emitted for each mint
```

### Scenario 2: Merkle Claiming
```
User calls: Minter.mint_merkle(token_id, user, 100, proof)
  ✓ User signature verified
  ✓ Token ID validated
  ✓ Merkle proof verified
  ✓ User not already claimed
  ✓ Minter calls Token.mint(user, 100)
  ✓ User marked as claimed
```

### Scenario 3: Allowlist Claiming
```
User calls: Minter.mint_allowlist(token_id, user, 500)
  ✓ User signature verified
  ✓ Token ID validated
  ✓ User in allowlist
  ✓ Amount matches fixed amount
  ✓ User not already claimed
  ✓ Minter calls Token.mint(user, 500)
  ✓ User marked as claimed
```

---

## Commits to Create

1. **refactor: remove strategy pattern from Minter contract**
   - Delete strategy module and related code
   - Remove strategy storage and methods
   - Update lib.rs

2. **refactor: add token_id parameter to all Minter methods**
   - Add token_id to mint_batch, mint_merkle, mint_allowlist
   - Add token_id to set_merkle_root, set_allowlist
   - Update all internal logic

3. **refactor: derive admin from token owner instead of storing**
   - Remove stored ADMIN
   - Implement get_admin() to query token.owner()
   - Update all admin checks

4. **test: comprehensive Minter test suite**
   - Unit tests for each method
   - Integration tests with Token
   - Edge case testing

5. **docs: update Minter documentation**
   - Update README/comments
   - Document new method signatures
   - Document admin derivation

---

## Questions for Team Review

1. Should Minter support other token types (different standards)?
   - Current design works with any token that has `owner()` and `mint()`

2. Should merkle claims be rate-limited?
   - Currently no - add if needed for spam prevention

3. Should batch minting have per-recipient caps?
   - Currently validates total batch size only

4. Should admin functions emit more detailed events?
   - Current: just merkle_root_set, allowlist_set
   - Add more detail if needed for indexing

---

## Success Criteria

- [ ] All strategy pattern code removed
- [ ] Token ID parameter on all methods
- [ ] Admin derived from token owner
- [ ] All minting methods functional
- [ ] All tests passing
- [ ] WASM size < 40K
- [ ] Zero compilation errors
- [ ] Code reviewed and approved
- [ ] Documentation complete

---

## Timeline

- **Phase 1 (Core Restructure)**: 1.5 hours
- **Phase 2 (Implementation)**: 1 hour
- **Phase 3 (Testing)**: 1-1.5 hours
- **Phase 4 (Integration)**: 0.5 hours
- **Total**: 4-4.5 hours

---

## Related Documents

- **MINTER_CONTRACT_DESIGN.md** - Original (strategy-based) design
- **Architecture discussion** - User feedback leading to this refactor
- **Token contract** - contracts/token/src/lib.rs

---

## Handoff Status

✅ **Complete specification** - All requirements documented
✅ **Design approved** - Reviewed and confirmed
✅ **Architecture clear** - Three direct methods, no registry
✅ **Security design** - Token_id validation, admin derivation
✅ **Ready to code** - Can start implementation immediately

**Next Step**: contract-writer implements per this specification

---

**Prepared by**: Claude Code / User Feedback
**Date**: October 6, 2026
**For Implementation**: October 6-7, 2026

