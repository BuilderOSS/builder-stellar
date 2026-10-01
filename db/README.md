# Database Migrations

This directory owns the PostgreSQL schema for the Goldsky-backed multi-tenant read model.

## Migration Order

1. **0001_goldsky_base.sql** - Foundation
   - Creates all schemas (chain, governance, token, auction, treasury, manager, metadata, app)
   - Creates Goldsky event landing tables (chain.raw_events, chain.decoded_events)
   - Creates activity feed table (app.activity_feed_events)
   - Creates the Goldsky read model for DAO discovery and module history; Manager itself has no permanent DAO registry
   - All tables are immutable (triggers prevent updates/deletes on events)

2. **0002_goldsky_views.sql** - Views and Queries
   - Creates views over raw events for domain-specific queries
   - Governance views: proposals, votes, lifecycle
   - Token views: transfers, inventory, members
   - Treasury views
   - Auction views

The next clean testnet baseline uses a versioned schema and wipes the legacy
read model before ingestion. Do not mix events from the legacy five-module
Manager deployment with the new six-module `0.1.0` deployment.

## Multi-Tenant Design

All data is keyed by `(deployment_id, dao_id)`:

- **deployment_id** = Manager contract address (format: "manager:CONTRACT_ADDRESS")
  - One per app instance (constant)
  - Filters queries at database level for isolation

- **dao_id** = Token contract address (immutable DAO identifier)
  - Primary key within a manager
  - Example: "CBGLIC3V..."
  - Composite key ensures complete multi-tenant isolation

## manager.daos Read Model

The database projection is the durable DAO registry. It is populated from
`DaoCreated` and `DaoLaunched` events, not from Manager storage:

```sql
CREATE TABLE manager.daos (
  deployment_id TEXT,           -- Manager contract (constant per app)
  dao_id TEXT,                  -- Token contract (primary DAO ID)
  token_address TEXT,           -- Same as dao_id
  deployer VARCHAR(56),         -- Account that initiated DAO creation (salt component)
  launch_admin VARCHAR(56),     -- Account with DAO setup authority during launch window
  manager_contract TEXT,        -- Manager contract address

  -- Contracts (immutable after creation)
  token_contract TEXT,          -- ERC721 token
  governor_contract TEXT,       -- Governance
  auction_contract TEXT,        -- Auctions
  treasury_contract TEXT,       -- Treasury
  metadata_contract TEXT,       -- NFT metadata
  marketplace_contract TEXT,    -- Fixed-price sales

  -- Token Metadata
  token_name VARCHAR(255),      -- "Nouns", "Builder"
  token_symbol VARCHAR(16),     -- "NOUNS", "BUILD"
  token_description TEXT,
  token_uri TEXT,

  -- Lifecycle
  status TEXT,                  -- 'pending' or 'operational'
  auction_enabled BOOLEAN,      -- Whether auction module is active (from DaoLaunched)
  marketplace_enabled BOOLEAN,  -- Whether marketplace module is active (from DaoLaunched)

  -- Blockchain Timeline
  created_ledger BIGINT,        -- When created
  created_at TIMESTAMPTZ,
  created_tx_hash TEXT,

  launched_ledger BIGINT,       -- When launched (if completed)
  launched_at TIMESTAMPTZ,
  launched_tx_hash TEXT,

  PRIMARY KEY (deployment_id, dao_id)
);
```

## DAO Lifecycle

```
1. create_dao(deployer, nonce, launch_admin)
   └─ DaoCreated event emitted with topics: [token_address, deployer, launch_admin]
   └─ Goldsky decodes → inserts into manager.daos with status='pending'
   └─ launch_admin owns all modules during setup window

2. add_properties() → configure metadata (launch_admin authorized)
3. accept_ownership() → transfer token ownership (launch_admin authorized)
4. launch_dao(token_address, launch_config)
   └─ launch_config contains { launch_auction: bool, launch_marketplace: bool }
   └─ Unpauses selected modules (auction, marketplace if enabled)
   └─ Transfers all module ownership to Treasury
   └─ DaoLaunched event emitted with module status
   └─ Goldsky UPDATE manager.daos: status='operational', auction_enabled, marketplace_enabled
```

Completed Manager creation state and module initialization snapshots are
deleted on-chain after launch. Goldsky keeps the immutable event history and
reconstructs the API views for all DAO operations.

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
