# Multi-Tenant Architecture

> **Status**: Phase 2 Complete - Database and frontend infrastructure ready

This document describes the multi-tenant DAO architecture where one application instance manages multiple DAOs through a single manager contract.

## Overview

The multi-tenant model separates concerns into two levels:

1. **Deployment Level** - One per application instance
   - Identified by `deployment_id` = "manager:CONTRACT_ADDRESS"
   - Constant throughout app lifetime
   - Filters all database queries for isolation

2. **DAO Level** - Multiple per deployment
   - Identified by `dao_id` = token contract address
   - Immutable after creation
   - Composite key: `(deployment_id, dao_id)`

## Architecture Diagram

```
┌─ Application Instance ─────────────────────┐
│                                             │
│  deployment_id = "manager:CBSKIHNN..."    │
│  NEXT_PUBLIC_NETWORK = "testnet"          │
│                                             │
│  ┌─ DAO 1 ────────────────────┐           │
│  │ dao_id = "CBGLIC3V..."      │           │
│  │ token_address = "CBGLIC3V..." │         │
│  │ status = "operational"       │           │
│  │ Contracts:                   │           │
│  │  - Governor, Auction         │           │
│  │  - Treasury, Metadata        │           │
│  └──────────────────────────────┘           │
│                                             │
│  ┌─ DAO 2 ────────────────────┐           │
│  │ dao_id = "CBY5K7XM..."      │           │
│  │ token_address = "CBY5K7XM..." │         │
│  │ status = "pending"           │           │
│  │ Contracts:                   │           │
│  │  - Governor, Auction         │           │
│  │  - Treasury, Metadata        │           │
│  └──────────────────────────────┘           │
│                                             │
│  ┌─ DAO N ────────────────────┐           │
│  │ ...                          │           │
│  └──────────────────────────────┘           │
│                                             │
└─────────────────────────────────────────────┘
```

## Core Concepts

### deployment_id

Format: `"manager:CONTRACT_ADDRESS"`

Example: `"manager:CBSKIHNNVKEJWV3A2OI63BWUC637LR4P2GBV4MPJB5PDOMVUMS6KOMAH"`

**Properties:**
- Set via environment variable `NEXT_PUBLIC_DEPLOYMENT_ID`
- Constant per application instance
- Never changes during app lifetime
- Filters all database queries at the database level
- Prevents data leaks between manager instances

### dao_id

The token contract address of each DAO.

Example: `"CBGLIC3VWMWVBX3JCDHQQMVJQCQ2B7YQPG6Q7XWPZC63HFKUVYYTQC2"`

**Properties:**
- Token contract address (same as `token_address`)
- Immutable after DAO creation
- Primary identifier within a manager
- Unique within a deployment
- Composite key with `deployment_id`

### Composite Key Pattern

All multi-tenant queries use:

```sql
WHERE deployment_id = $1 AND dao_id = $2
```

This ensures:
- Complete isolation between deployments
- Complete isolation between DAOs
- Efficient indexing
- Database-level security

## DAO Lifecycle

### Creation Phase

1. **create_dao(params)**
   - Manager deploys 5 contracts (Token, Governor, Auction, Treasury, Metadata)
   - DaoCreated event emitted
   - Status: **pending**
   - Contracts owned by launch_admin
   - Token metadata stored: name, symbol, description, uri

2. **Configuration**
   - add_properties() - Configure NFT metadata properties
   - Metadata is set up for token rendering

3. **Ownership Transfer**
   - accept_ownership() - launch_admin accepts token ownership

### Finalization Phase

4. **finalize_dao(token_address)**
   - Manager validates completion
   - Transfers module ownership to Treasury
   - Status: **operational**
   - First auction launched
   - Cannot be repeated (idempotent check)

### Operational Phase

5. **Live DAO**
   - Proposals can be created
   - Auctions run continuously
   - Treasury manages funds
   - Governance controls all operations

## Database Schema

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema details.

**Key Table: manager.daos**

```sql
CREATE TABLE manager.daos (
  -- Multi-tenant composite key
  deployment_id TEXT NOT NULL,
  dao_id TEXT NOT NULL,

  -- Identity & Ownership
  token_address TEXT NOT NULL,
  creator VARCHAR(56),
  admin_address VARCHAR(56),

  -- Contracts (immutable)
  manager_contract TEXT NOT NULL,
  token_contract TEXT NOT NULL,
  governor_contract TEXT NOT NULL,
  auction_contract TEXT,
  treasury_contract TEXT,
  metadata_contract TEXT,

  -- Token Metadata
  token_name VARCHAR(255),
  token_symbol VARCHAR(16),
  token_description TEXT,
  token_uri TEXT,

  -- Lifecycle
  status TEXT DEFAULT 'pending',  -- 'pending' or 'operational'

  -- Blockchain Timeline
  created_ledger BIGINT NOT NULL,
  created_at TIMESTAMPTZ,
  created_tx_hash TEXT,

  finalized_ledger BIGINT,
  finalized_at TIMESTAMPTZ,
  finalized_tx_hash TEXT,

  PRIMARY KEY (deployment_id, dao_id)
);
```

## Configuration

### Environment Variables

```env
# Multi-tenant Deployment
NEXT_PUBLIC_DEPLOYMENT_ID=manager:CBSKIHNNVKEJWV3A2OI63BWUC637LR4P2GBV4MPJB5PDOMVUMS6KOMAH

# Network Configuration
NEXT_PUBLIC_NETWORK=testnet  # or 'public', 'local'

# Database Connection
APP_DATABASE_URL=postgres://user:password@host/database
```

### Static Network Config

Network-specific settings are stored in `src/config/networks.ts`:

```typescript
export const NETWORKS = {
  testnet: {
    name: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    label: 'Testnet',
  },
  public: {
    name: 'public',
    rpcUrl: 'https://soroban-mainnet.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    label: 'Public',
  },
  local: {
    name: 'local',
    rpcUrl: 'http://localhost:8000',
    networkPassphrase: 'Test SDF Network ; September 2015',
    label: 'Local',
  }
};
```

**Why Separate?**
- Network infrastructure never changes
- Same for all managers in a region
- Safe to check into version control
- Used by contract clients and SDK

## Frontend Data Access

### Query Functions

```typescript
import { getDaoConfigFromDatabase, getAllDaosFromDatabase } from '@/lib/dao-db';

// Get single DAO
const dao = await getDaoConfigFromDatabase(tokenContractAddress);
// Returns: all contracts, metadata, status, timeline

// List all DAOs
const allDaos = await getAllDaosFromDatabase();
// Returns: array of DAOs, ordered by creation time

// List operational DAOs only
const operationalDaos = await getAllDaosFromDatabase('operational');
// Returns: DAOs ready for use

// List pending DAOs only
const pendingDaos = await getAllDaosFromDatabase('pending');
// Returns: DAOs awaiting finalization
```

### DaoConfig Interface

```typescript
export interface DaoConfig {
  // Multi-tenant keys
  deployment_id: string;
  dao_id: string;

  // Identity
  token_address: string;
  creator: string | null;
  network: NetworkName;

  // Contracts
  manager_contract: string;
  token_contract: string;
  governor_contract: string;
  auction_contract: string | null;
  treasury_contract: string | null;
  metadata_contract: string | null;

  // Token Metadata
  token_name: string | null;
  token_symbol: string | null;
  token_description: string | null;
  token_uri: string | null;

  // Admin
  admin_address: string | null;
  label: string;

  // Lifecycle
  status: 'pending' | 'operational';

  // Blockchain Timeline
  created_ledger: number;
  created_at: string | null;
  created_tx_hash: string | null;
  finalized_ledger: number | null;
  finalized_at: string | null;
  finalized_tx_hash: string | null;

  indexed_at: string | null;
}
```

## React Context

All components under `/dao/[daoId]/*` have access to DAO context:

```typescript
import { useDaoContext } from '@/contexts/dao-context';

function MyComponent() {
  const { daoId, daoConfig } = useDaoContext();

  // Use daoId for API calls
  const proposals = await fetch(`/api/dao/${daoId}/proposals`);

  // Use daoConfig for display
  return <h1>{daoConfig.token_name}</h1>;
}
```

## Query Patterns

### Get Single DAO

```sql
SELECT * FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
AND dao_id = 'CBGLIC3V...'
```

### List All DAOs in Deployment

```sql
SELECT * FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
ORDER BY created_ledger DESC
LIMIT 100
```

### Find Pending DAOs (Awaiting Finalization)

```sql
SELECT * FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
AND status = 'pending'
ORDER BY created_ledger ASC
```

### Find DAOs Created in Last 24 Hours

```sql
SELECT * FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
AND created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC
```

## Goldsky Pipeline Integration

The Goldsky indexer populates the `manager.daos` table by:

1. **Decoding DaoCreated Events**
   - Extracts token metadata from DaoCreationParams
   - Records all 5 contract addresses
   - Stores creator and admin addresses

2. **Inserting into manager.daos**
   - Status: 'pending'
   - Records blockchain timeline
   - Stores transaction hashes

3. **Handling DaoFinalized Events**
   - Updates status to 'operational'
   - Records finalization timeline
   - Marks DAO ready for operation

See [GOLDSKY_MULTITENANT_INTEGRATION.md](./GOLDSKY_MULTITENANT_INTEGRATION.md) for implementation details.

## Security & Isolation

### Database-Level Isolation

- `deployment_id` primary key ensures managers cannot see each other's data
- `dao_id` secondary key ensures DAOs cannot see each other's data
- Queries always filtered by both keys
- Role-based permissions:
  - `goldsky_writer` - INSERT/UPDATE for pipeline
  - `app_server` - SELECT only for application

### Application-Level Isolation

- Environment variable `NEXT_PUBLIC_DEPLOYMENT_ID` is constant per instance
- All API routes include `daoId` parameter
- Context provider scopes components to single DAO
- Navigation links include `daoId` for route structure

### Smart Contract Isolation

- Each DAO has independent Governor, Treasury, Auction contracts
- Module ownership transferred to Treasury after finalization
- Governance controls module administration

## Migration Path

### Phase 1: Infrastructure ✅
- [x] Create `manager.daos` table
- [x] Add composite key indexing
- [x] Grant database permissions
- [x] Update frontend queries

### Phase 2: Integration (Current)
- [ ] Update Goldsky pipeline to decode events
- [ ] Update Goldsky pipeline to populate table
- [ ] Test with deployed DAOs

### Phase 3: Feature Development
- [ ] Build DAO creation UI
- [ ] Build finalization workflow
- [ ] Build directory/listing pages
- [ ] Status tracking and management

## Benefits

✅ **Unlimited DAOs** - No configuration changes needed to add DAOs
✅ **Complete Isolation** - Managers and DAOs cannot see each other's data
✅ **Automatic Discovery** - New DAOs appear in database immediately after creation
✅ **Status Tracking** - Pending/Operational lifecycle managed automatically
✅ **Full Metadata** - Token name, symbol, description all available
✅ **Efficient** - Indexed queries return instantly
✅ **Scalable** - No file generation or rebuilds needed
✅ **Auditable** - Event history immutable in blockchain

## Related Documentation

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Complete schema details
- [GOLDSKY_MULTITENANT_INTEGRATION.md](./GOLDSKY_MULTITENANT_INTEGRATION.md) - Pipeline updates
- [DAO_DEPLOYMENT.md](./DAO_DEPLOYMENT.md) - Creating and deploying DAOs
- [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md) - Manager contract deployment
