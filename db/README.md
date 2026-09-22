# Database Migrations

This directory owns the PostgreSQL schema for the Goldsky-backed multi-tenant read model.

## Migration Order

1. **0001_goldsky_base.sql** - Foundation
   - Creates all schemas (chain, governance, token, auction, treasury, manager, metadata, app)
   - Creates Goldsky event landing tables (chain.raw_events, chain.decoded_events)
   - Creates activity feed table (app.activity_feed_events)
   - **NEW:** Creates manager.daos table for DAO registry with multi-tenant support
   - All tables are immutable (triggers prevent updates/deletes on events)

2. **0002_goldsky_views.sql** - Views and Queries
   - Creates views over raw events for domain-specific queries
   - Governance views: proposals, votes, lifecycle
   - Token views: transfers, inventory, members
   - Treasury views
   - Auction views

No further migrations needed - schema is stable.

## Multi-Tenant Design

All data is keyed by `(deployment_id, dao_id)`:

- **deployment_id** = Manager contract address (format: "manager:CONTRACT_ADDRESS")
  - One per app instance (constant)
  - Filters queries at database level for isolation

- **dao_id** = Token contract address (immutable DAO identifier)
  - Primary key within a manager
  - Example: "CBGLIC3V..."
  - Composite key ensures complete multi-tenant isolation

## manager.daos Table

The primary DAO registry:

```sql
CREATE TABLE manager.daos (
  deployment_id TEXT,         -- Manager contract (constant per app)
  dao_id TEXT,                -- Token contract (primary DAO ID)
  token_address TEXT,         -- Same as dao_id
  creator VARCHAR(56),        -- Account that deployed DAO
  manager_contract TEXT,      -- Manager contract address

  -- Contracts (immutable after creation)
  token_contract TEXT,        -- ERC721 token
  governor_contract TEXT,     -- Governance
  auction_contract TEXT,      -- Auctions
  treasury_contract TEXT,     -- Treasury
  metadata_contract TEXT,     -- NFT metadata

  -- Token Metadata
  token_name VARCHAR(255),    -- "Nouns", "Builder"
  token_symbol VARCHAR(16),   -- "NOUNS", "BUILD"
  token_description TEXT,
  token_uri TEXT,

  -- Lifecycle
  status TEXT,                -- 'pending' or 'operational'

  -- Blockchain Timeline
  created_ledger BIGINT,      -- When created
  created_at TIMESTAMPTZ,
  created_tx_hash TEXT,

  finalized_ledger BIGINT,    -- When finalized (if completed)
  finalized_at TIMESTAMPTZ,
  finalized_tx_hash TEXT,

  PRIMARY KEY (deployment_id, dao_id)
);
```

## DAO Lifecycle

```
1. create_dao(params)
   └─ DaoCreated event emitted
   └─ Goldsky decodes → inserts into manager.daos with status='pending'

2. add_properties() → configure metadata
3. accept_ownership() → transfer token ownership
4. finalize_dao(token_address)
   └─ Finalizes DAO for operation
   └─ Event triggers UPDATE manager.daos SET status='operational'
```

## Field Naming Conventions

- Ledger positions end in `_ledger`
- Timestamps (when an event happened) end in `_at`
- Unix seconds end in `_seconds`; milliseconds retain `_milliseconds` suffix
- `dao_id` = token contract address (immutable DAO identifier)
- `deployment_id` = manager contract address for multi-tenant isolation

## Composite Keys

All DAO-owned data uses:
```sql
(deployment_id, dao_id, ...)
```

This ensures:
- Complete isolation between manager instances
- Complete isolation between DAOs within a manager
- Efficient indexing and querying
