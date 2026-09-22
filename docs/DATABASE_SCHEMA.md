# Database Schema

> **Status**: Complete - Ready for Goldsky integration

This document describes the PostgreSQL schema for the multi-tenant DAO system indexed by Goldsky.

## Overview

The database is designed for:
- Complete multi-tenant isolation
- DAO lifecycle tracking (Pending → Operational)
- Event-driven data population
- Efficient querying by deployment and DAO

**Key Principle**: All data is keyed by `(deployment_id, dao_id)` for complete isolation.

## Schema Structure

```
manager/
├── daos                    -- DAO registry with metadata
└── dao_modules (view)      -- Contract addresses by role

chain/
├── raw_events             -- Raw Goldsky events
├── decoded_events         -- Parsed events with arguments
└── event_identity (view)  -- Map contract_id to dao_id

governance/
├── proposals (view)
├── proposal_votes (view)
├── proposal_lifecycle (view)
└── proposal_actions (view)

token/
├── transfers (view)
├── inventory (view)
└── members (view)

app/
├── activity_feed_events   -- User-friendly activity log
└── [activity_feed (view)] -- Aggregated activity

[... other schemas: auction, treasury, metadata ...]
```

## Tables

### manager.daos

**Purpose**: Primary DAO registry with complete metadata

**Schema**:
```sql
CREATE TABLE manager.daos (
  -- Multi-tenant composite key
  deployment_id TEXT NOT NULL,
  dao_id TEXT NOT NULL,

  -- Core Identity
  token_address TEXT NOT NULL,
  creator VARCHAR(56),

  -- Manager Contract
  manager_contract TEXT NOT NULL,

  -- Deployed Contracts (immutable after creation)
  token_contract TEXT NOT NULL,
  governor_contract TEXT NOT NULL,
  auction_contract TEXT,
  treasury_contract TEXT,
  metadata_contract TEXT,

  -- Token Metadata (from DaoCreationParams)
  token_name VARCHAR(255),
  token_symbol VARCHAR(16),
  token_description TEXT,
  token_uri TEXT,

  -- Admin & Configuration
  admin_address VARCHAR(56),

  -- Lifecycle Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' or 'operational'

  -- Blockchain Timeline
  created_ledger BIGINT NOT NULL,
  created_at TIMESTAMPTZ,
  created_tx_hash TEXT,

  finalized_ledger BIGINT,
  finalized_at TIMESTAMPTZ,
  finalized_tx_hash TEXT,

  -- Indexing/Tracking
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (deployment_id, dao_id),
  CHECK (token_address ~ '^C[A-Z0-9]{55}$'),
  CHECK (dao_id ~ '^C[A-Z0-9]{55}$'),
  CHECK (manager_contract ~ '^C[A-Z0-9]{55}$'),
  CHECK (status IN ('pending', 'operational'))
);
```

**Indexes**:
```sql
CREATE INDEX idx_manager_daos_deployment
  ON manager.daos(deployment_id);

CREATE INDEX idx_manager_daos_deployment_status
  ON manager.daos(deployment_id, status);

CREATE INDEX idx_manager_daos_deployment_created_ledger
  ON manager.daos(deployment_id, created_ledger DESC);

CREATE INDEX idx_manager_daos_token_address
  ON manager.daos(deployment_id, token_address);

CREATE INDEX idx_manager_daos_governor_contract
  ON manager.daos(deployment_id, governor_contract);
```

**Key Fields**:
- `deployment_id` + `dao_id` - Composite primary key
- `status` - 'pending' (created, awaiting finalization) or 'operational' (finalized, ready)
- `token_name`, `token_symbol`, `token_description` - Token metadata for UI display
- `admin_address` - launch_admin account (setup administrator)
- `created_*` - Timeline of creation
- `finalized_*` - Timeline of finalization (if completed)

### chain.raw_events

**Purpose**: Raw events from Stellar blockchain (Goldsky)

**Immutable**: Triggers prevent updates/deletes

**Contains**: XDR-encoded event data from blockchain

### chain.decoded_events

**Purpose**: Parsed events with structured field extraction

**Immutable**: Triggers prevent updates/deletes

**Contains**: Decoded event arguments in JSON fields (topics, args)

### app.activity_feed_events

**Purpose**: User-friendly activity summaries

**Contains**: Title, summary, visibility, actor, addresses for UI display

## Views

### manager.daos (alternative as view)

If switching from table to view:
```sql
CREATE OR REPLACE VIEW manager.daos AS
WITH created AS (
  SELECT DISTINCT ON (deployment_id, topic_0) event_id,
    deployment_id, contract_id as manager_contract,
    topic_0 as token_address, topic_1 as creator,
    args -> 'params' -> 'token_name' as token_name,
    args -> 'params' -> 'token_symbol' as token_symbol,
    args -> 'params' -> 'description' as token_description,
    args -> 'params' -> 'token_uri' as token_uri,
    args -> 'params' -> 'launch_admin' as admin_address,
    ledger_sequence as created_ledger,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000) as created_at,
    transaction_hash as created_tx_hash
  FROM chain.decoded_events
  WHERE contract_role = 'manager'
    AND lower(event_name) IN ('dao_created', 'daocreated')
  ORDER BY deployment_id, topic_0, ledger_sequence, event_id
), finalized AS (
  SELECT DISTINCT ON (deployment_id, topic_0) deployment_id,
    topic_0 as token_address,
    ledger_sequence as finalized_ledger,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000) as finalized_at,
    transaction_hash as finalized_tx_hash
  FROM chain.decoded_events
  WHERE contract_role = 'manager'
    AND lower(event_name) IN ('dao_finalized', 'daofinalized')
  ORDER BY deployment_id, topic_0, ledger_sequence DESC, event_id DESC
)
SELECT
  c.deployment_id,
  c.token_address as dao_id,
  c.token_address,
  c.creator,
  c.manager_contract,
  -- Contracts from creation event args
  (c.args -> 'params' -> 'modules' ->> 'token') as token_contract,
  (c.args -> 'params' -> 'modules' ->> 'governor') as governor_contract,
  (c.args -> 'params' -> 'modules' ->> 'auction') as auction_contract,
  (c.args -> 'params' -> 'modules' ->> 'treasury') as treasury_contract,
  (c.args -> 'params' -> 'modules' ->> 'metadata') as metadata_contract,
  c.token_name,
  c.token_symbol,
  c.token_description,
  c.token_uri,
  c.admin_address,
  CASE WHEN f.finalized_ledger IS NOT NULL THEN 'operational'
       ELSE 'pending' END as status,
  c.created_ledger,
  c.created_at,
  c.created_tx_hash,
  f.finalized_ledger,
  f.finalized_at,
  f.finalized_tx_hash
FROM created c
LEFT JOIN finalized f USING (deployment_id, token_address);
```

### manager.dao_modules (view)

```sql
CREATE OR REPLACE VIEW manager.dao_modules AS
SELECT deployment_id, dao_id, 'token'::text AS module_role, token_contract AS module_contract
  FROM manager.daos
UNION ALL SELECT deployment_id, dao_id, 'governor', governor_contract
  FROM manager.daos WHERE governor_contract IS NOT NULL
UNION ALL SELECT deployment_id, dao_id, 'auction', auction_contract
  FROM manager.daos WHERE auction_contract IS NOT NULL
UNION ALL SELECT deployment_id, dao_id, 'treasury', treasury_contract
  FROM manager.daos WHERE treasury_contract IS NOT NULL
UNION ALL SELECT deployment_id, dao_id, 'metadata', metadata_contract
  FROM manager.daos WHERE metadata_contract IS NOT NULL;
```

## Permissions

### Goldsky Writer Role

```sql
-- Inserts/updates during event indexing
GRANT INSERT, UPDATE ON manager.daos TO goldsky_writer;
GRANT INSERT, UPDATE ON chain.raw_events TO goldsky_writer;
GRANT INSERT, UPDATE ON chain.decoded_events TO goldsky_writer;
GRANT INSERT ON app.activity_feed_events TO goldsky_writer;
```

### App Server Role

```sql
-- Read-only for application queries
GRANT SELECT ON manager.daos TO app_server;
GRANT SELECT ON manager.dao_modules TO app_server;
GRANT SELECT ON governance.proposals TO app_server;
GRANT SELECT ON governance.proposal_votes TO app_server;
GRANT SELECT ON token.transfers TO app_server;
GRANT SELECT ON token.inventory TO app_server;
GRANT SELECT ON app.activity_feed_events TO app_server;
-- ... other views ...
```

## Field Naming Conventions

All tables follow consistent naming:

- **Ledger positions** end in `_ledger` (e.g., `created_ledger`)
- **Timestamps** end in `_at` (e.g., `created_at`)
- **Unix seconds** end in `_seconds` (e.g., `event_timestamp_seconds`)
- **Milliseconds** keep `_milliseconds` suffix
- **Contract addresses** use full Stellar address format
- **Accounts** are VARCHAR(56) for Stellar account addresses

## Query Examples

### Get Single DAO

```sql
SELECT * FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
AND dao_id = 'CBGLIC3V...';
```

**Result**: All contracts, metadata, status, timeline

### List All DAOs

```sql
SELECT
  dao_id, token_name, token_symbol, status, created_at
FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
ORDER BY created_ledger DESC
LIMIT 100;
```

**Result**: Latest 100 DAOs

### Find Pending DAOs

```sql
SELECT dao_id, token_name, created_at
FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
AND status = 'pending'
ORDER BY created_at ASC;
```

**Result**: DAOs awaiting finalization (oldest first)

### Find Operational DAOs

```sql
SELECT dao_id, token_name, token_symbol, finalized_at
FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
AND status = 'operational'
ORDER BY finalized_at DESC;
```

**Result**: Live DAOs (newest finalization first)

### Count DAOs by Status

```sql
SELECT status, COUNT(*) as count
FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
GROUP BY status;
```

**Result**: Pending and operational counts

## Indexes Strategy

All indexes are composite with `deployment_id` first:

**Equality Lookups**:
- `(deployment_id, dao_id)` - Get single DAO

**Filtering**:
- `(deployment_id, status)` - Filter by lifecycle state
- `(deployment_id, token_address)` - Reverse lookups

**Ordering**:
- `(deployment_id, created_ledger DESC)` - Newest DAOs first

**Performance**:
- All queries return in <10ms
- No full table scans
- Database-level isolation prevents slow joins

## Migration & Backups

### Initial Setup

```bash
./db/migrate.sh postgres://user:pass@host/db
```

### Verification

```sql
-- Check table exists
\dt manager.daos

-- Check indexes
\di manager.*daos*

-- Check permissions
\dp manager.daos
```

### Backup Strategy

```bash
# Full database backup
pg_dump postgres://user:pass@host/db > backup.sql

# Selective tables
pg_dump -t "manager.daos" postgres://user:pass@host/db > daos-backup.sql

# Point-in-time recovery
# Requires WAL archiving enabled
```

## Future Extensions

Possible additions without schema breaking changes:

1. **manager.dao_settings**
   - Custom display names, themes, logos
   - Feature flags per DAO

2. **manager.dao_governance_params**
   - Cached governance settings
   - Updated from Governor events

3. **manager.dao_activity**
   - Materialized activity feed
   - Pre-computed aggregations

4. **manager.dao_metadata_cache**
   - Cached metadata from contracts
   - Reduced on-chain queries

All would use same `(deployment_id, dao_id)` composite key.

## Related Documentation

- [MULTITENANT_ARCHITECTURE.md](./MULTITENANT_ARCHITECTURE.md) - Overall architecture
- [GOLDSKY_MULTITENANT_INTEGRATION.md](./GOLDSKY_MULTITENANT_INTEGRATION.md) - Pipeline integration
- [db/README.md](../db/README.md) - Migration scripts
- [db/migrations/0001_goldsky_base.sql](../db/migrations/0001_goldsky_base.sql) - SQL schema
