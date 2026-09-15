# Phase 2: Platform Contracts & Multi-DAO

## Overview

Phase 2 transforms the single-DAO prototype into a full Nouns Builder-style platform where anyone can create DAOs through a Factory, discover them in a Registry, and mint NFTs with Nouns artwork traits.

**Timeline**: ~12 weeks
**Complexity**: High (new contract patterns, multi-DAO architecture)

## Goals

1. ✅ **Factory-based DAO creation** - Atomic deployment of all modules
2. ✅ **DAO discovery** - Registry for browsing and finding DAOs
3. ✅ **Nouns artwork** - Deterministic trait-based NFT generation
4. ✅ **Multi-DAO frontend** - Single app serving multiple DAOs
5. ✅ **Automatic indexing** - New DAOs appear without manual config

## New Contracts

### 1. Manager Contract

**Location**: `contracts/manager/`
**Purpose**: Implementation registry and upgrade governance

**Key Features**:
- Register contract implementations with version/WASM hash
- Approve upgrade transitions (version A → version B)
- Revoke compromised implementations
- Emergency factory pause capability
- Multisig authority (start with single admin for MVP)

**Interface**:
```rust
pub fn register_implementation(
    env: Env,
    name: String,           // e.g., "Token", "Governor"
    version: u32,
    wasm_hash: BytesN<32>,
) -> Result<(), Error>;

pub fn approve_upgrade(
    env: Env,
    from_hash: BytesN<32>,
    to_hash: BytesN<32>,
) -> Result<(), Error>;

pub fn revoke_implementation(
    env: Env,
    wasm_hash: BytesN<32>,
) -> Result<(), Error>;

pub fn is_upgrade_approved(
    env: Env,
    from_hash: BytesN<32>,
    to_hash: BytesN<32>,
) -> bool;

pub fn pause_factory(env: Env) -> Result<(), Error>;
pub fn unpause_factory(env: Env) -> Result<(), Error>;
```

**Storage**:
```rust
pub struct ImplementationVersion {
    pub name: String,
    pub version: u32,
    pub wasm_hash: BytesN<32>,
    pub published_at: u64,
    pub revoked: bool,
}

Map<BytesN<32>, ImplementationVersion>      // wasm_hash → version
Map<(BytesN<32>, BytesN<32>), bool>         // (from, to) → approved
```

**Tests Needed**:
- [ ] Register implementation (owner only)
- [ ] Approve upgrade path
- [ ] Revoke implementation
- [ ] Unauthorized access fails
- [ ] Factory pause/unpause

---

### 2. Factory Contract

**Location**: `contracts/factory/`
**Purpose**: Atomic DAO deployment

**Inspired by**: Nouns Builder Manager.sol
**Adapted for**: Soroban salt-based deployment (no CREATE2/CREATE3)

**Key Features**:
- Authenticate creator
- Validate bounded configuration
- Derive deterministic salts
- Predict all module addresses
- Deploy all 5 modules atomically
- Initialize founder allocations (modulo-100)
- Set final governance authorities
- Register in Registry
- Emit creation event

**Interface**:
```rust
pub struct DaoCreationParams {
    pub deployer: Address,
    pub nonce: u64,

    // Token
    pub token_name: String,
    pub token_symbol: String,

    // Metadata
    pub ipfs_base_cid: String,
    pub trait_counts: TraitCounts,

    // Auction
    pub auction_duration: u64,
    pub reserve_price: i128,
    pub time_buffer: u64,
    pub payment_asset: Address,

    // Governance
    pub voting_delay: u64,
    pub voting_period: u64,
    pub quorum_bps: u32,
    pub proposal_threshold_bps: u32,

    // Founders
    pub founders: Vec<FounderAllocation>,

    // Launch
    pub launch_admin: Option<Address>,  // None = governance-only
}

pub fn create_dao(
    env: Env,
    params: DaoCreationParams,
) -> Result<DaoAddresses, Error>;

pub fn predict_addresses(
    env: Env,
    creator: Address,
    nonce: u64,
) -> DaoAddresses;
```

**Deployment Flow**:
```
1. Validate params (bounded checks)
2. Derive salts:
   - token_salt = keccak256(creator, nonce, "token")
   - metadata_salt = keccak256(creator, nonce, "metadata")
   - auction_salt = keccak256(creator, nonce, "auction")
   - governor_salt = keccak256(creator, nonce, "governor")
   - treasury_salt = keccak256(creator, nonce, "treasury")

3. Predict addresses using salts

4. Deploy contracts:
   env.deployer().deploy_contract(wasm_hash, token_salt)
   (repeat for all 5 modules)

5. Initialize contracts:
   - Token: (name, symbol, metadata_addr, auction_addr, governor_addr)
   - MetadataRenderer: (ipfs_cid, trait_counts, token_addr)
   - Auction: (token, treasury, duration, reserve, payment_asset, launch_admin)
   - Governor: (token, treasury, voting_delay, voting_period, quorum, threshold)
   - Treasury: (governor)

6. Initialize founders (modulo-100 allocation)

7. Finalize authorities:
   - Token.transfer_ownership(treasury)
   - Auction.transfer_ownership(treasury)

8. Register in Registry:
   registry.register_dao(DaoRegistration {
       token_address,
       creator,
       created_ledger: env.ledger().sequence(),
       modules: DaoModules { token, metadata, auction, governor, treasury },
   })

9. Emit creation event
```

**Tests Needed**:
- [ ] Full deployment succeeds
- [ ] Address prediction matches actual
- [ ] Founder allocation correct (modulo-100)
- [ ] Final authorities correct (governance-owned)
- [ ] Duplicate nonce fails
- [ ] Invalid params fail
- [ ] Registry integration works
- [ ] Resource limit measurements

---

### 3. Registry Contract

**Location**: `contracts/registry/`
**Purpose**: DAO discovery and module tracking

**Key Features**:
- Token address as canonical DAO ID
- Module address registry
- Creator and creation metadata
- Bounded enumeration support
- Factory-only registration

**Interface**:
```rust
pub struct DaoRegistration {
    pub token_address: Address,
    pub creator: Address,
    pub created_ledger: u32,
    pub factory_version: u32,
    pub modules: DaoModules,
}

pub struct DaoModules {
    pub token: Address,
    pub metadata_renderer: Address,
    pub auction: Address,
    pub governor: Address,
    pub treasury: Address,
}

pub fn register_dao(
    env: Env,
    registration: DaoRegistration,
) -> Result<(), Error>;

pub fn get_dao(
    env: Env,
    token_address: Address,
) -> Option<DaoRegistration>;

pub fn enumerate_daos(
    env: Env,
    start: u32,
    limit: u32,
) -> Vec<Address>;  // Token addresses

pub fn get_dao_count(env: Env) -> u32;
```

**Storage**:
```rust
Map<Address, DaoRegistration>  // token_address → registration
Vec<Address>                    // All token addresses (for enumeration)
```

**Tests Needed**:
- [ ] Factory can register
- [ ] Non-factory cannot register
- [ ] Get DAO by token address
- [ ] Enumerate DAOs (pagination)
- [ ] DAO count accurate

---

### 4. MetadataRenderer Contract

**Location**: `contracts/metadata-renderer/`
**Purpose**: Nouns artwork generation (per-DAO instance)

**Inspired by**: Nouns Builder MetadataRenderer.sol
**Adapted for**: Deterministic seeds (not pseudo-random)

**Key Features**:
- Store immutable artwork seeds per token
- IPFS base CID for trait images
- Deterministic seed generation from token ID
- Governance-controlled metadata updates
- Trait compatibility validation (counts can only increase)

**Interface**:
```rust
pub struct MetadataConfig {
    pub version: u32,
    pub ipfs_base_cid: String,
    pub trait_counts: TraitCounts,
    pub updated_by_proposal: Option<u32>,
}

pub struct TraitCounts {
    pub background: u8,
    pub body: u8,
    pub accessory: u8,
    pub head: u8,
    pub glasses: u8,
}

pub struct ArtSeed {
    pub background: u8,
    pub body: u8,
    pub accessory: u8,
    pub head: u8,
    pub glasses: u8,
}

pub fn initialize(
    env: Env,
    ipfs_base_cid: String,
    trait_counts: TraitCounts,
    token_address: Address,
) -> Result<(), Error>;

pub fn generate_seed(
    env: Env,
    token_id: u32,
) -> ArtSeed;

pub fn update_metadata(
    env: Env,
    new_ipfs_base_cid: String,
    new_trait_counts: TraitCounts,
    proposal_id: u32,
) -> Result<(), Error>;

pub fn get_config(env: Env) -> MetadataConfig;
```

**Seed Generation** (deterministic):
```rust
pub fn generate_seed(env: &Env, token_id: u32, trait_counts: &TraitCounts) -> ArtSeed {
    let hash = env.crypto().keccak256(&token_id.to_le_bytes());

    ArtSeed {
        background: hash.get(0).unwrap() % trait_counts.background,
        body: hash.get(1).unwrap() % trait_counts.body,
        accessory: hash.get(2).unwrap() % trait_counts.accessory,
        head: hash.get(3).unwrap() % trait_counts.head,
        glasses: hash.get(4).unwrap() % trait_counts.glasses,
    }
}
```

**Trait Compatibility Validation**:
```rust
fn validate_trait_compatibility(
    current: &TraitCounts,
    new: &TraitCounts,
) -> Result<(), Error> {
    // Counts can only INCREASE (never decrease)
    // This ensures existing seeds don't reference missing traits
    if new.background < current.background { return Err(Error::TraitCountDecreased); }
    if new.body < current.body { return Err(Error::TraitCountDecreased); }
    if new.accessory < current.accessory { return Err(Error::TraitCountDecreased); }
    if new.head < current.head { return Err(Error::TraitCountDecreased); }
    if new.glasses < current.glasses { return Err(Error::TraitCountDecreased); }
    Ok(())
}
```

**Tests Needed**:
- [ ] Initialize config
- [ ] Generate deterministic seeds
- [ ] Update with compatible traits (success)
- [ ] Update with incompatible traits (fail)
- [ ] Unauthorized update fails
- [ ] Version tracking works

---

## Contract Integration Changes

### Token Contract Updates

**Add**:
- Reference to MetadataRenderer
- Seed storage on mint
- Founder vesting (modulo-100 allocation)
- Upgrade entrypoint

**Changes**:
```rust
// Add to storage
metadata_renderer: Address

// Update mint
pub fn mint(env: Env, to: Address, token_id: u32) -> Result<(), Error> {
    // 1. Check founder allocation
    let recipient = determine_recipient(&env, token_id);

    // 2. Generate and store seed
    let metadata_renderer = get_metadata_renderer(&env);
    let seed = metadata_renderer.generate_seed(token_id);
    storage::set_seed(&env, token_id, &seed);

    // 3. Mint NFT
    internal_mint(&env, &recipient, token_id)?;

    Ok(())
}

// Add upgrade
pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
    require_owner(&env)?;  // Treasury (governance)

    let manager = get_manager(&env);
    let current_hash = env.deployer().current_contract_wasm_hash();
    require(manager.is_upgrade_approved(current_hash, new_wasm_hash), Error::UpgradeNotApproved);

    env.deployer().update_current_contract_wasm(new_wasm_hash);
    Ok(())
}
```

### Auction Contract Updates

**Add**:
- One-shot launch capability
- Persistent refund claims
- Upgrade entrypoint

**Changes**:
```rust
// Add to storage
launch_admin: Option<Address>
claims: Map<Address, Claim>

// One-shot launch
pub fn launch(env: Env) -> Result<(), Error> {
    let launch_admin = storage::get_launch_admin(&env)?;

    // Either launch admin OR governance can launch
    if let Some(admin) = launch_admin {
        admin.require_auth();
    } else {
        require_owner(&env)?;  // Treasury
    }

    // Consume launch permission
    storage::remove_launch_admin(&env);

    create_auction(&env)?;
    Ok(())
}

// Claim system
pub struct Claim {
    pub asset: Address,
    pub amount: i128,
}

pub fn create_bid(...) {
    // Try push refund
    if let Err(_) = refund_previous_bidder() {
        // Create persistent claim
        storage::create_claim(&env, prev_bidder, Claim { asset, amount });
    }
}

pub fn claim_refund(env: Env, claimant: Address) -> Result<(), Error> {
    claimant.require_auth();
    let claim = storage::get_claim(&env, &claimant)?;
    claim.asset.transfer(&env.current_contract_address(), &claimant, &claim.amount)?;
    storage::remove_claim(&env, &claimant);
    Ok(())
}
```

### Governor Contract Updates

**Add**:
- Non-reentrant internal dispatch for self-actions
- Upgrade entrypoint

**Changes**:
```rust
pub enum ActionTarget {
    External(Address),
    Governor,    // Self-action (non-reentrant)
    Treasury,
}

pub fn execute(env: Env, proposal_id: u32) -> Result<(), Error> {
    // ... existing execute logic

    for action in proposal.actions {
        match action.target {
            ActionTarget::External(addr) => {
                env.invoke_contract(&addr, &action.function, action.args);
            },
            ActionTarget::Governor => {
                execute_governor_action(&env, &action)?;  // Internal
            },
            ActionTarget::Treasury => {
                let treasury = get_treasury(&env);
                treasury.execute_action(proposal_id, action);
            },
        }
    }
}

fn execute_governor_action(env: &Env, action: &Action) -> Result<(), Error> {
    match action.function.as_str() {
        "update_voting_delay" => { /* ... */ },
        "upgrade" => { /* ... */ },
        _ => Err(Error::UnknownAction),
    }
}
```

### Treasury Contract Updates

**Add**:
- Internal self-action dispatch
- Upgrade entrypoint

**Similar pattern to Governor** (see above)

---

## Database Updates

### New Tables

```sql
-- Platform layer
CREATE TABLE platform.factory_deployments (
  token_address TEXT PRIMARY KEY,
  creator TEXT NOT NULL,
  created_ledger BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  tx_hash TEXT NOT NULL,
  factory_version INT NOT NULL,
  
  -- Module addresses
  metadata_renderer TEXT NOT NULL,
  auction TEXT NOT NULL,
  governor TEXT NOT NULL,
  treasury TEXT NOT NULL
);

CREATE TABLE platform.registry_entries (
  token_address TEXT PRIMARY KEY REFERENCES platform.factory_deployments(token_address),
  registered_at TIMESTAMP DEFAULT NOW()
);

-- Artwork metadata
CREATE TABLE metadata.configs (
  deployment_id TEXT NOT NULL,
  version INT NOT NULL,
  ipfs_base_cid TEXT NOT NULL,
  trait_counts JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  updated_by_proposal INT,
  PRIMARY KEY (deployment_id, version)
);

CREATE TABLE metadata.seeds (
  deployment_id TEXT NOT NULL,
  token_id INT NOT NULL,
  background INT NOT NULL,
  body INT NOT NULL,
  accessory INT NOT NULL,
  head INT NOT NULL,
  glasses INT NOT NULL,
  PRIMARY KEY (deployment_id, token_id)
);

-- Auction claims
CREATE TABLE auction.claims (
  deployment_id TEXT NOT NULL,
  claimant TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  claimed_at TIMESTAMP,
  PRIMARY KEY (deployment_id, claimant)
);

-- Deployment identity update
ALTER TABLE governance.proposals ADD COLUMN deployment_id TEXT NOT NULL;
ALTER TABLE token.inventory ADD COLUMN deployment_id TEXT NOT NULL;
-- (Apply to all existing tables)
```

### Goldsky Updates

**New Event Decoders**:
- Factory: `dao_create` event
- Registry: `dao_registered` event
- MetadataRenderer: `metadata_updated` event, `seed_generated` event
- Manager: `implementation_registered`, `upgrade_approved`, `implementation_revoked`

**Automatic Discovery Controller**:
```javascript
// packages/goldsky/src/onboarding-controller.mjs

class DaoOnboardingController {
  async observeFactoryEvents() {
    const events = await pollFactoryCreationEvents()

    for (const event of events) {
      await this.onboardDao(event.dao_addresses)
    }
  }

  async onboardDao(daoAddresses) {
    // 1. Register in database
    await db.registerDeployment(daoAddresses)

    // 2. Update Goldsky pipeline filters
    await goldsky.addAddresses([
      daoAddresses.token,
      daoAddresses.metadata,
      daoAddresses.auction,
      daoAddresses.governor,
      daoAddresses.treasury,
    ])

    // 3. Trigger backfill from creation ledger
    await goldsky.backfill({
      addresses: Object.values(daoAddresses),
      fromLedger: daoAddresses.created_ledger,
    })
  }
}
```

---

## Frontend Updates

### Routing Changes

**Current**:
```
/proposals
/proposals/[id]
/auctions
/treasury
/members
/admin
```

**New**:
```
/                                # DAO directory
/create                          # DAO creation wizard
/dao/[daoId]/proposals
/dao/[daoId]/proposals/[id]
/dao/[daoId]/auctions
/dao/[daoId]/treasury
/dao/[daoId]/members
/dao/[daoId]/admin
```

### New Pages

#### 1. DAO Directory (`/`)
- Search DAOs
- Filter by creator, date
- DAO cards (name, description, token count, proposal count)
- "Create DAO" button

#### 2. DAO Creation Wizard (`/create`)

**6 Steps** (inspired by Nouns Builder):

1. **General**
   - DAO name
   - Token symbol
   - Description

2. **Artwork**
   - IPFS upload
   - Trait validation
   - Preview (5 sample seeds)

3. **Auction Settings**
   - Duration
   - Reserve price
   - Time buffer
   - Payment asset (default XLM SAC)

4. **Governance Settings**
   - Voting delay
   - Voting period
   - Quorum %
   - Proposal threshold %

5. **Founder Allocation**
   - Add founders (address, %, vest expiry)
   - Validate total ≤ 99%

6. **Review & Deploy**
   - Review all settings
   - Sign transaction
   - Wait for indexing
   - Redirect to DAO page

### DAO Context Provider

```typescript
interface DaoContext {
  daoId: string              // Token address
  deploymentId: string       // {token}:{network}:{epoch}
  deployment: Deployment     // Full registration
  modules: DaoModules
  network: Network
  rpcUrl: string
}

function DaoProvider({ daoId, children }) {
  const { data: deployment } = useSWR(`/api/dao/${daoId}`)

  return (
    <DaoContext.Provider value={{
      daoId,
      deploymentId: deployment.deployment_id,
      deployment,
      modules: deployment.modules,
      network: deployment.network,
      rpcUrl: deployment.rpc_url,
    }}>
      {children}
    </DaoContext.Provider>
  )
}
```

### SWR Key Partitioning

```typescript
// Before (global)
useSWR('/api/proposals')

// After (scoped)
const { deploymentId } = useDaoContext()
useSWR(`/api/dao/${deploymentId}/proposals`)
```

---

## Implementation Timeline

### Week 1-2: Manager + Factory Contracts
- [ ] Implement Manager contract
- [ ] Write Manager tests
- [ ] Implement Factory contract
- [ ] Write Factory tests (deterministic deployment, founder allocation)
- [ ] Generate TypeScript bindings

### Week 3-4: Registry + MetadataRenderer Contracts
- [ ] Implement Registry contract
- [ ] Write Registry tests
- [ ] Implement MetadataRenderer contract
- [ ] Write MetadataRenderer tests (deterministic seeds)
- [ ] Generate TypeScript bindings

### Week 5-6: Contract Integration Updates
- [ ] Update Token contract (seeds, upgrade)
- [ ] Update Auction contract (launch, claims, upgrade)
- [ ] Update Governor contract (internal dispatch, upgrade)
- [ ] Update Treasury contract (internal dispatch, upgrade)
- [ ] Update all tests
- [ ] E2E factory deployment test

### Week 7-8: Database + Goldsky
- [ ] Add new database tables/migrations
- [ ] Update event decoders for new contracts
- [ ] Implement onboarding controller
- [ ] Test automatic discovery
- [ ] Deploy to testnet and verify

### Week 9-10: Frontend Multi-DAO Routing
- [ ] Add DAO context provider
- [ ] Update all routes for `/dao/[daoId]/*`
- [ ] Update all API routes (deployment scoping)
- [ ] Partition SWR keys
- [ ] Test isolation between DAOs

### Week 11: DAO Creation Wizard
- [ ] Implement 6-step wizard
- [ ] IPFS upload integration
- [ ] Artwork validation and preview
- [ ] Factory contract integration
- [ ] Post-creation flow

### Week 12: Directory + Polish
- [ ] Implement directory page
- [ ] Search and filtering
- [ ] Pre-launch state handling
- [ ] Testing on testnet (create 2 DAOs)
- [ ] Documentation updates

---

## Testing Checklist

- [ ] Factory deploys all 5 contracts atomically
- [ ] Addresses match predictions
- [ ] Founder allocation (modulo-100) correct
- [ ] Final authorities are governance (not admin)
- [ ] Registry stores all DAOs
- [ ] Enumeration works (pagination)
- [ ] MetadataRenderer generates deterministic seeds
- [ ] Trait compatibility validation works
- [ ] Token contract stores seeds
- [ ] Auction launch (one-shot) works
- [ ] Auction claims work (persistent refunds)
- [ ] Governor/Treasury internal dispatch works
- [ ] Upgrades require Manager approval
- [ ] Database scoping correct (2 DAOs isolated)
- [ ] Goldsky discovers new DAOs automatically
- [ ] Frontend shows multiple DAOs
- [ ] Creation wizard completes successfully
- [ ] Post-creation indexing lag handled

---

## Success Criteria

✅ Creator can deploy a DAO via Factory in one transaction
✅ New DAO appears in directory automatically (within ~10 ledgers)
✅ DAO has Nouns-style artwork (deterministic traits)
✅ All modules are governance-owned from creation
✅ Multiple DAOs can exist simultaneously
✅ Frontend isolates DAO data correctly
✅ Upgrades work via governance proposals
✅ No admin backdoors after creation

---

## Reference Documents

- Nouns Builder analysis: `/Users/dan13ram/code/nouns/stellar-dao/docs/nouns-reference-complete.md`
- Full implementation plan: `/Users/dan13ram/code/nouns/stellar-dao/docs/implementation-plan-updated.md`
- Salvage reference: `/Users/dan13ram/code/nouns/stellar-dao/docs/salvage-reference.md`
