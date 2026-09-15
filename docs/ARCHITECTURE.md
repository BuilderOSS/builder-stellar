# Architecture

## Current (Phase 1)

### Overview

Single-DAO deployment with 4 modular Soroban contracts providing governance, token management, treasury control, and flexible membership mechanisms. All contracts are proven, tested, and production-ready. The auction contract provides one membership option; other mechanisms (allowlists, direct minting) can be added as alternatives.

### Contracts

```
┌─────────────────────────────────────────────────────────────┐
│                      DAO Governance System                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐         │
│  │  Token   │◄─────│ Governor │─────►│ Treasury │         │
│  │  (NFT)   │      │(Voting)  │      │ (Assets) │         │
│  └────┬─────┘      └──────────┘      └──────────┘         │
│       │                                                      │
│       │                                                      │
│  ┌────▼─────┐                                               │
│  │ Auction  │  (Optional membership module)                │
│  │(Continuous)│                                             │
│  └──────────┘                                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Token Contract
**Purpose**: NFT-based governance tokens with delegation

**Key Features**:
- ERC-721-like ownership and transfers
- Delegation system with checkpointed voting power
- Batch minting (1-100 tokens per call)
- Minter authorization (Auction + additional minters)

**Storage**:
- Owner mappings
- Delegation mappings
- Voting power checkpoints
- Minter permissions

#### Governor Contract
**Purpose**: On-chain proposal creation and voting

**Key Features**:
- Proposal creation with action encoding
- Timestamp-based voting windows
- Historical voting power snapshots
- Quorum and threshold enforcement
- Proposal states: Pending → Active → Succeeded/Defeated → Queued → Executed

**Configuration**:
- Voting delay (min 300s)
- Voting period (min 300s)
- Quorum percentage
- Proposal threshold

#### Treasury Contract
**Purpose**: DAO-controlled asset management

**Key Features**:
- Governor-authorized execution
- Arbitrary contract calls
- Asset custody
- Timelock-protected actions

**Authority**: Owned by Governor (governance-controlled)

#### Auction Contract
**Purpose**: Continuous token distribution via English auctions

**Key Features**:
- Timed auctions with reserve price
- Minimum bid increments
- Time buffer for last-minute bids
- SAC asset payments (configurable, defaults to XLM)
- Pausable by owner

**Flow**:
1. Auction created automatically or manually
2. Users place bids (SAC transfers)
3. Auction extends if bid within time buffer
4. Settlement transfers token to winner
5. Proceeds sent to Treasury
6. New auction created

### Data Layer

**Goldsky Indexer**:
```
Stellar Network Events
         ↓
Goldsky Event Source
         ↓
Event Transform (decode XDR-JSON)
         ↓
Decoded Events (extract data)
         ↓
Activity Feed (user-friendly)
         ↓
PostgreSQL (Neon)
```

**Database Schema**:
- `chain.*` - Raw event tables
- `governance.*` - Proposals, votes, authorities
- `token.*` - Inventory, members, delegations
- `auction.*` - Auctions, bids
- `treasury.*` - Executions
- `app.*` - Denormalized views for UI

### Frontend

**Next.js 15 Application**:
- Server-side rendering
- SWR for data fetching
- Zustand for state management
- Panda CSS for styling
- Stellar Wallets Kit for wallet connection

**Key Pages**:
- Dashboard - Overview of activity
- Proposals - Browse and create proposals
- Proposal Detail - Vote, queue, execute
- Auctions - Current auction and bidding
- Treasury - Asset balances
- Members - Token holders and voting power
- Admin - Configuration (owner-only)

### Deployment Flow

**Current (Manual)**:
```
1. Compile contracts (cargo build)
2. Generate TypeScript bindings
3. Deploy Token contract
4. Deploy Governor contract
5. Deploy Treasury contract
6. Deploy Auction contract
7. Initialize each contract individually
8. Set up authorities manually
9. Generate deployment config
```

**Limitations**:
- Manual multi-step process
- Single DAO per deployment
- No DAO discovery
- Environment-based configuration

---

## Planned (Phase 2)

### Multi-DAO Platform

```
┌───────────────────────────────────────────────────────────────┐
│                    Platform Layer (New)                        │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────┐      ┌───────────┐      ┌──────────────┐      │
│  │ Manager  │◄─────│  Factory  │─────►│   Registry   │      │
│  │(Upgrades)│      │(Deployer) │      │ (Discovery)  │      │
│  └──────────┘      └─────┬─────┘      └──────────────┘      │
│                           │                                    │
└───────────────────────────┼────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
┌─────────────▼────────────┐  ┌──────────▼──────────┐
│       DAO Instance 1      │  │   DAO Instance 2     │
├──────────────────────────┤  ├─────────────────────┤
│ Token, Governor,         │  │ Token, Governor,     │
│ Treasury, Auction,       │  │ Treasury, Auction,   │
│ MetadataRenderer         │  │ MetadataRenderer     │
└──────────────────────────┘  └─────────────────────┘
```

### New Contracts

#### Manager Contract
**Purpose**: Implementation registry and upgrade approval

**Features**:
- Register contract implementations with version/WASM hash
- Approve upgrade transitions (from → to)
- Revoke compromised implementations
- Emergency factory pause

**Storage**:
```rust
Map<BytesN<32>, ImplementationVersion>  // wasm_hash → version info
Map<(BytesN<32>, BytesN<32>), bool>     // (from, to) → approved
```

#### Factory Contract
**Purpose**: Atomic DAO deployment

**Features**:
- Deploy all 5 modules in single transaction
- Deterministic address prediction using salts
- Initialize founder allocations (modulo-100)
- Set final governance authorities
- Register in Registry

**Deployment Flow**:
```
1. Validate creation params
2. Derive salts for each module
3. Predict all addresses
4. Deploy Token, MetadataRenderer, Auction, Governor, Treasury
5. Initialize founder vesting
6. Transfer ownership to governance
7. Register in Registry
8. Emit creation event
```

#### Registry Contract
**Purpose**: DAO discovery and directory

**Features**:
- Token address as canonical DAO ID
- Track all module addresses
- Store creator and creation metadata
- Bounded enumeration support

**Storage**:
```rust
pub struct DaoRegistration {
    pub token_address: Address,
    pub creator: Address,
    pub created_ledger: u32,
    pub modules: DaoModules,
}

Map<Address, DaoRegistration>  // token_address → registration
```

#### MetadataRenderer Contract (per-DAO)
**Purpose**: Nouns artwork generation

**Features**:
- Store immutable artwork seeds per token
- IPFS base CID for trait images
- Deterministic seed generation from token ID
- Governance-controlled metadata updates
- Trait compatibility validation

**Seed Generation**:
```rust
pub fn generate_seed(token_id: u32, trait_counts: &TraitCounts) -> ArtSeed {
    let hash = env.crypto().keccak256(&token_id.to_le_bytes());
    ArtSeed {
        background: hash[0] % trait_counts.background,
        body: hash[1] % trait_counts.body,
        accessory: hash[2] % trait_counts.accessory,
        head: hash[3] % trait_counts.head,
        glasses: hash[4] % trait_counts.glasses,
    }
}
```

### Authority Model (Phase 2)

```
Creator
   ↓
Factory.create_dao()
   ↓
All modules deployed with FINAL authorities:
   - Token owner: Treasury (governance)
   - Governor owner: Self (governance)
   - Treasury owner: Governor (governance)
   - Auction owner: Treasury (governance)
   - MetadataRenderer owner: Token owner (governance)
   
NO admin owner after creation!
```

### Frontend Changes

**Multi-DAO Routing**:
```
Current: /proposals, /auctions
New:     /dao/[daoId]/proposals, /dao/[daoId]/auctions
```

**New Pages**:
- `/` - DAO directory
- `/create` - 6-step creation wizard
- `/dao/[daoId]/*` - All existing pages scoped to DAO

**DAO Context**:
```typescript
interface DaoContext {
  daoId: string              // Token address
  deploymentId: string       // {token}:{network}:{epoch}
  modules: DaoModules
  network: Network
}
```

### Data Layer Changes

**Deployment Identity**:
```
Current: label + network (mutable)
New:     token_address + network + epoch (immutable)
```

**Automatic Discovery**:
```
1. Goldsky monitors Factory contract
2. Creation event emitted
3. Controller extracts child addresses
4. Pipeline updated to index new DAO
5. Backfill from creation ledger
6. DAO appears in directory
```

## Key Design Decisions

### Soroban-Specific Adaptations

1. **No CREATE2/CREATE3** - Use Soroban's salt-based deployment
2. **WASM Upgrades** - Direct `update_current_contract_wasm()` instead of proxy pattern
3. **Deterministic Seeds** - Hash-based instead of block-based randomness
4. **Pull-based Refunds** - Persistent claims instead of push-only

### From Nouns Builder EVM

**Kept**:
- Modulo-100 founder vesting
- Continuous auction with time buffer
- Proposal lifecycle states
- Governor → Treasury execution flow
- Manager upgrade registry pattern

**Adapted**:
- UUPS proxies → WASM upgrades
- EIP-712 signatures → Ed25519
- Block randomness → Deterministic from token ID
- ETH payments → SAC assets
- CREATE2/3 → Salt-based deployment

**Added**:
- One-shot launch capability
- Persistent refund claims
- Explicit awaiting-indexing states
- Multi-DAO runtime discovery

## Security Considerations

### Phase 1
- ✅ Tested with 630+ unit tests
- ✅ E2E integration tests
- ✅ OpenZeppelin governance primitives
- ⚠️ Admin ownership (deploy-time only)

### Phase 2
- ✅ Governance ownership from creation
- ✅ Manager-approved upgrades only
- ✅ No admin backdoors
- ✅ Timelock-protected execution
- ✅ Explicit authorization chains

## Performance

**Contract Resource Limits**:
- Factory deployment: TBD (measure with real WASM sizes)
- Founder allocation: Bounded by modulo-100 (max 99% = 99 iterations)
- Batch mint: 100 tokens max per call
- Proposal actions: Bounded by transaction size

**Database Indexing**:
- Event lag: <10 ledgers acceptable
- Query performance: Indexed by deployment_id
- Multi-DAO scaling: Tested with 2+ DAOs

## Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Smart Contracts | Rust + Soroban SDK | Native Stellar, WASM efficiency |
| Governance | OpenZeppelin | Proven security patterns |
| Indexing | Goldsky + PostgreSQL | Reliable, scalable event indexing |
| Frontend | Next.js 15 | SSR, modern React patterns |
| Styling | Panda CSS | Type-safe, performant |
| State | Zustand + SWR | Simple, effective caching |
| Wallet | Stellar Wallets Kit | Standard Stellar integration |

## Future Enhancements (Post-Phase 2)

- Updatable proposals (Governor V3 feature from Nouns)
- Proposal candidates (pre-proposal discussion)
- Multi-chain deployment (same addresses via deterministic salts)
- Governance delegation marketplace
- Advanced artwork traits and rarity
- On-chain SVG rendering
