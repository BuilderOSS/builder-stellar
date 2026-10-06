# Minter Contract Goldsky & Database Setup Guide

**Date**: October 6, 2026
**Status**: Implementation Ready
**Purpose**: Configure Goldsky indexing and database views for the Minter contract

---

## Overview

The Minter contract emits events that need to be indexed by Goldsky and stored in the PostgreSQL database. This guide covers:

1. **Event Types** - What events the Minter emits
2. **Database Schema** - Tables and views needed
3. **Goldsky Pipeline** - Configuration for indexing
4. **Activity Feed Integration** - Displaying Minter events in the activity feed
5. **API Queries** - Accessing Minter data

---

## Part 1: Minter Contract Events

### Events Emitted by Minter

Based on the refactored Minter contract, the following events are emitted:

#### 1. MintEvent
**Emitted**: Every individual mint operation
```rust
#[contractevent]
pub struct MintEvent {
    pub token_id: Address,
    pub recipient: Address,
    pub amount: u128,
}
```

**Activity Feed Kind**: `minter.mint`
**Title**: `Tokens minted`
**Summary**: `{amount} tokens minted to {recipient}`

#### 2. BatchMintEvent
**Emitted**: When batch minting completes
```rust
#[contractevent]
pub struct BatchMintEvent {
    pub token_id: Address,
    pub recipient_count: u32,
    pub total_amount: u128,
}
```

**Activity Feed Kind**: `minter.batch_mint`
**Title**: `Batch mint completed`
**Summary**: `{recipient_count} recipients received {total_amount} tokens`

#### 3. MerkleRootSetEvent
**Emitted**: When merkle root is configured
```rust
#[contractevent]
pub struct MerkleRootSetEvent {
    pub token_id: Address,
    pub root: Bytes,
}
```

**Activity Feed Kind**: `minter.merkle_root_set`
**Title**: `Merkle root configured`
**Summary**: `Merkle root configured for whitelist claims`

#### 4. AllowlistSetEvent
**Emitted**: When allowlist is configured
```rust
#[contractevent]
pub struct AllowlistSetEvent {
    pub token_id: Address,
    pub address_count: u32,
    pub fixed_amount: u128,
}
```

**Activity Feed Kind**: `minter.allowlist_set`
**Title**: `Allowlist configured`
**Summary**: `{address_count} addresses added to allowlist with {fixed_amount} tokens each`

#### 5. MerkleClaimEvent
**Emitted**: When user claims via merkle proof
```rust
#[contractevent]
pub struct MerkleClaimEvent {
    pub token_id: Address,
    pub recipient: Address,
    pub amount: u128,
    pub proof_valid: bool,
}
```

**Activity Feed Kind**: `minter.merkle_claim`
**Title**: `Merkle claim successful`
**Summary**: `{recipient} claimed {amount} tokens via merkle proof`

#### 6. AllowlistClaimEvent
**Emitted**: When user claims from allowlist
```rust
#[contractevent]
pub struct AllowlistClaimEvent {
    pub token_id: Address,
    pub recipient: Address,
    pub amount: u128,
}
```

**Activity Feed Kind**: `minter.allowlist_claim`
**Title**: `Allowlist claim successful`
**Summary**: `{recipient} claimed {amount} tokens from allowlist`

---

## Part 2: Database Schema

### New Tables in `minter` Schema

```sql
-- Main minting events log
CREATE TABLE minter.mint_events (
    event_id VARCHAR PRIMARY KEY,
    deployment_id VARCHAR NOT NULL,
    dao_id VARCHAR NOT NULL,
    contract_id VARCHAR NOT NULL,
    token_id VARCHAR NOT NULL,
    recipient VARCHAR NOT NULL,
    amount DECIMAL NOT NULL,
    event_type VARCHAR,
    ledger_sequence BIGINT NOT NULL,
    transaction_index BIGINT,
    operation_index BIGINT,
    event_index BIGINT,
    event_at TIMESTAMP,
    transaction_hash VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_deployment FOREIGN KEY (deployment_id),
    INDEX idx_token_id (token_id),
    INDEX idx_recipient (recipient),
    INDEX idx_ledger (ledger_sequence DESC),
    INDEX idx_dao_id (deployment_id, dao_id),
    FULLTEXT INDEX idx_search (recipient)
);

-- Batch mint operations
CREATE TABLE minter.batch_mint_events (
    event_id VARCHAR PRIMARY KEY,
    deployment_id VARCHAR NOT NULL,
    dao_id VARCHAR NOT NULL,
    contract_id VARCHAR NOT NULL,
    token_id VARCHAR NOT NULL,
    recipient_count INT NOT NULL,
    total_amount DECIMAL NOT NULL,
    ledger_sequence BIGINT NOT NULL,
    transaction_index BIGINT,
    operation_index BIGINT,
    event_index BIGINT,
    event_at TIMESTAMP,
    transaction_hash VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_token_id (token_id),
    INDEX idx_ledger (ledger_sequence DESC),
    INDEX idx_dao_id (deployment_id, dao_id)
);

-- Merkle root configurations
CREATE TABLE minter.merkle_root_events (
    event_id VARCHAR PRIMARY KEY,
    deployment_id VARCHAR NOT NULL,
    dao_id VARCHAR NOT NULL,
    contract_id VARCHAR NOT NULL,
    token_id VARCHAR NOT NULL,
    merkle_root VARCHAR NOT NULL,
    ledger_sequence BIGINT NOT NULL,
    transaction_index BIGINT,
    operation_index BIGINT,
    event_index BIGINT,
    event_at TIMESTAMP,
    transaction_hash VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_token_id (token_id),
    INDEX idx_dao_id (deployment_id, dao_id),
    UNIQUE KEY unique_merkle (token_id)  -- One active merkle root per token
);

-- Allowlist configurations
CREATE TABLE minter.allowlist_events (
    event_id VARCHAR PRIMARY KEY,
    deployment_id VARCHAR NOT NULL,
    dao_id VARCHAR NOT NULL,
    contract_id VARCHAR NOT NULL,
    token_id VARCHAR NOT NULL,
    address_count INT NOT NULL,
    fixed_amount DECIMAL NOT NULL,
    allowlist_addresses TEXT NOT NULL,  -- JSON array of addresses
    ledger_sequence BIGINT NOT NULL,
    transaction_index BIGINT,
    operation_index BIGINT,
    event_index BIGINT,
    event_at TIMESTAMP,
    transaction_hash VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_token_id (token_id),
    INDEX idx_dao_id (deployment_id, dao_id),
    UNIQUE KEY unique_allowlist (token_id)  -- One active allowlist per token
);

-- Merkle claims (successful claims via proof)
CREATE TABLE minter.merkle_claim_events (
    event_id VARCHAR PRIMARY KEY,
    deployment_id VARCHAR NOT NULL,
    dao_id VARCHAR NOT NULL,
    contract_id VARCHAR NOT NULL,
    token_id VARCHAR NOT NULL,
    recipient VARCHAR NOT NULL,
    amount DECIMAL NOT NULL,
    proof_valid BOOLEAN NOT NULL,
    ledger_sequence BIGINT NOT NULL,
    transaction_index BIGINT,
    operation_index BIGINT,
    event_index BIGINT,
    event_at TIMESTAMP,
    transaction_hash VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_token_id (token_id),
    INDEX idx_recipient (recipient),
    INDEX idx_ledger (ledger_sequence DESC),
    INDEX idx_dao_id (deployment_id, dao_id),
    UNIQUE KEY unique_merkle_claim (token_id, recipient)  -- One claim per recipient
);

-- Allowlist claims (successful claims from list)
CREATE TABLE minter.allowlist_claim_events (
    event_id VARCHAR PRIMARY KEY,
    deployment_id VARCHAR NOT NULL,
    dao_id VARCHAR NOT NULL,
    contract_id VARCHAR NOT NULL,
    token_id VARCHAR NOT NULL,
    recipient VARCHAR NOT NULL,
    amount DECIMAL NOT NULL,
    ledger_sequence BIGINT NOT NULL,
    transaction_index BIGINT,
    operation_index BIGINT,
    event_index BIGINT,
    event_at TIMESTAMP,
    transaction_hash VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_token_id (token_id),
    INDEX idx_recipient (recipient),
    INDEX idx_ledger (ledger_sequence DESC),
    INDEX idx_dao_id (deployment_id, dao_id),
    UNIQUE KEY unique_allowlist_claim (token_id, recipient)  -- One claim per recipient
);
```

### Prisma Schema Views

Add these views to `apps/web/prisma/schema.prisma`:

```prisma
// In the minter schema section
view MinterMintEvent {
  eventId           String    @map("event_id")
  deploymentId      String    @map("deployment_id")
  daoId             String    @map("dao_id")
  contractId        String    @map("contract_id")
  tokenId           String    @map("token_id")
  recipient         String
  amount            Decimal
  eventType         String?   @map("event_type")
  ledgerSequence    BigInt    @map("ledger_sequence")
  transactionIndex  BigInt?   @map("transaction_index")
  operationIndex    BigInt?   @map("operation_index")
  eventIndex        BigInt?   @map("event_index")
  eventAt           DateTime? @map("event_at")
  transactionHash   String    @map("transaction_hash")

  @@map("mint_events")
  @@schema("minter")
}

view MinterBatchMintEvent {
  eventId           String    @map("event_id")
  deploymentId      String    @map("deployment_id")
  daoId             String    @map("dao_id")
  contractId        String    @map("contract_id")
  tokenId           String    @map("token_id")
  recipientCount    Int       @map("recipient_count")
  totalAmount       Decimal   @map("total_amount")
  ledgerSequence    BigInt    @map("ledger_sequence")
  transactionIndex  BigInt?   @map("transaction_index")
  operationIndex    BigInt?   @map("operation_index")
  eventIndex        BigInt?   @map("event_index")
  eventAt           DateTime? @map("event_at")
  transactionHash   String    @map("transaction_hash")

  @@map("batch_mint_events")
  @@schema("minter")
}

view MinterMerkleClaimEvent {
  eventId           String    @map("event_id")
  deploymentId      String    @map("deployment_id")
  daoId             String    @map("dao_id")
  contractId        String    @map("contract_id")
  tokenId           String    @map("token_id")
  recipient         String
  amount            Decimal
  proofValid        Boolean   @map("proof_valid")
  ledgerSequence    BigInt    @map("ledger_sequence")
  transactionIndex  BigInt?   @map("transaction_index")
  operationIndex    BigInt?   @map("operation_index")
  eventIndex        BigInt?   @map("event_index")
  eventAt           DateTime? @map("event_at")
  transactionHash   String    @map("transaction_hash")

  @@map("merkle_claim_events")
  @@schema("minter")
}

view MinterAllowlistClaimEvent {
  eventId           String    @map("event_id")
  deploymentId      String    @map("deployment_id")
  daoId             String    @map("dao_id")
  contractId        String    @map("contract_id")
  tokenId           String    @map("token_id")
  recipient         String
  amount            Decimal
  ledgerSequence    BigInt    @map("ledger_sequence")
  transactionIndex  BigInt?   @map("transaction_index")
  operationIndex    BigInt?   @map("operation_index")
  eventIndex        BigInt?   @map("event_index")
  eventAt           DateTime? @map("event_at")
  transactionHash   String    @map("transaction_hash")

  @@map("allowlist_claim_events")
  @@schema("minter")
}
```

---

## Part 3: Goldsky Pipeline Configuration

### Update Pipeline Template

Add Minter contract detection to `packages/goldsky/templates/builder-stellar-events.yaml.mustache`:

```yaml
# After dao_marketplaces section, add:
  dao_minters:
    type: dynamic_table
    backend_type: Postgres
    backend_entity_name: dao_minters
    secret_name: {{POSTGRES_SECRET_NAME}}
    schema: streamling
    column: contract_id
    sql: |
      SELECT regexp_extract(data, '"key"\s*:\s*\{"symbol"\s*:\s*"minter"\}\s*,\s*"val"\s*:\s*\{"address"\s*:\s*"([^"]+)"', 1) AS contract_id
      FROM stellar_events
      WHERE contract_id = '{{MANAGER_CONTRACT_ID}}'
        AND type = 'contract'
        AND topics LIKE '%dao_created%'

# In dao_events SQL, add to CASE statement:
          WHEN dynamic_table_check('dao_minters', contract_id) THEN 'minter'

# In dao_events WHERE clause, add:
           OR dynamic_table_check('dao_minters', contract_id)
```

### Add Minter Event Types

Add to `packages/goldsky/src/activity-feed.script.js` kindMap:

```javascript
    // Minter events
    MintEvent: 'minter.mint',
    MintBatch: 'minter.batch_mint',
    MerkleRootSet: 'minter.merkle_root_set',
    AllowlistSet: 'minter.allowlist_set',
    MerkleClaimEvent: 'minter.merkle_claim',
    AllowlistClaimEvent: 'minter.allowlist_claim',
```

Add to titleMap:

```javascript
    // Minter events
    MintEvent: 'Tokens minted',
    MintBatch: 'Batch mint completed',
    MerkleRootSet: 'Merkle root configured',
    AllowlistSet: 'Allowlist configured',
    MerkleClaimEvent: 'Merkle claim successful',
    AllowlistClaimEvent: 'Allowlist claim successful',
```

Add to userFacing map:

```javascript
    MintEvent: true, MintBatch: true, MerkleRootSet: true, AllowlistSet: true,
    MerkleClaimEvent: true, AllowlistClaimEvent: true,
```

---

## Part 4: Activity Feed Integration

### Minter Events in Activity Feed

The `AppActivityFeed` view in the database already captures all Minter events. Here's how Minter events flow:

1. **Goldsky Pipeline** ingests Minter events
2. **Decoded Events Transform** normalizes the event data
3. **Activity Feed Transform** maps events to `AppActivityFeed` records
4. **Frontend Queries** fetch and display via `getGoldskyActivityFeed()`

### Example Activity Feed Entries

#### Mint Event
```json
{
  "activity_id": "minter.mint:0x...",
  "contract_id": "MINTER_CONTRACT_ID",
  "contract_role": "minter",
  "event_name": "MintEvent",
  "kind": "minter.mint",
  "title": "Tokens minted",
  "summary": "100 tokens minted to GBQ...",
  "actor": "GBQ...",
  "addresses": ["GBQ..."],
  "amount": "100",
  "ledger_sequence": 1234567,
  "timestamp": "2026-10-06T20:00:00Z",
  "transaction_hash": "0x..."
}
```

#### Batch Mint Event
```json
{
  "activity_id": "minter.batch_mint:0x...",
  "contract_id": "MINTER_CONTRACT_ID",
  "contract_role": "minter",
  "event_name": "MintBatch",
  "kind": "minter.batch_mint",
  "title": "Batch mint completed",
  "summary": "10 recipients received 1000 tokens",
  "addresses": ["ADMIN_ADDRESS"],
  "amount": "1000",
  "ledger_sequence": 1234568,
  "timestamp": "2026-10-06T20:01:00Z",
  "transaction_hash": "0x..."
}
```

#### Merkle Claim Event
```json
{
  "activity_id": "minter.merkle_claim:0x...",
  "contract_id": "MINTER_CONTRACT_ID",
  "contract_role": "minter",
  "event_name": "MerkleClaimEvent",
  "kind": "minter.merkle_claim",
  "title": "Merkle claim successful",
  "summary": "GBQ... claimed 500 tokens via merkle proof",
  "actor": "GBQ...",
  "addresses": ["GBQ..."],
  "amount": "500",
  "ledger_sequence": 1234569,
  "timestamp": "2026-10-06T20:02:00Z",
  "transaction_hash": "0x..."
}
```

---

## Part 5: API Queries for Minter Data

### Add to `apps/web/src/lib/goldsky.ts`

```typescript
/**
 * Minting History
 *
 * Returns all minting operations for a token
 */
export async function getGoldskyMintingHistory(
  daoId: string,
  params: {
    limit?: number;
    offset?: number;
    kind?: 'mint' | 'batch_mint' | 'merkle_claim' | 'allowlist_claim';
  } = {}
) {
  const { limit = 50, offset = 0, kind } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);
  const where = {
    deploymentId,
    daoId: daoIdFromUrl,
    contractRole: 'minter',
    ...(kind ? { kind: `minter.${kind}` } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.appActivityFeed.findMany({
      where,
      orderBy: { ledgerSequence: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.appActivityFeed.count({ where })
  ]);

  return {
    items: rows.map(row => ({
      activity_id: row.activityId,
      event_name: row.eventName,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      actor: row.actor,
      amount: row.amount,
      ledger_sequence: Number(row.ledgerSequence),
      timestamp: row.ledgerClosedAt,
      transaction_hash: row.transactionHash
    })),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Minter Claims
 *
 * Returns all successful claims (merkle and allowlist) for a token
 */
export async function getGoldskyMinterClaims(
  daoId: string,
  params: {
    limit?: number;
    offset?: number;
    recipient?: string;  // Filter by claiming address
  } = {}
) {
  const { limit = 100, offset = 0, recipient } = params;
  const deploymentId = getDeploymentId();
  const daoIdFromUrl = await getDaoIdFromUrl(daoId);

  const where = {
    deploymentId,
    daoId: daoIdFromUrl,
    contractRole: 'minter',
    kind: { in: ['minter.merkle_claim', 'minter.allowlist_claim'] },
    ...(recipient ? { actor: { equals: recipient, mode: 'insensitive' as const } } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.appActivityFeed.findMany({
      where,
      orderBy: { ledgerSequence: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.appActivityFeed.count({ where })
  ]);

  return {
    items: rows.map(row => ({
      claim_id: row.activityId,
      recipient: row.actor,
      amount: row.amount,
      claim_type: row.kind === 'minter.merkle_claim' ? 'merkle' : 'allowlist',
      transaction_hash: row.transactionHash,
      ledger_sequence: Number(row.ledgerSequence),
      timestamp: row.ledgerClosedAt
    })),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    generatedAt: new Date().toISOString()
  };
}
```

### Add to `apps/web/src/lib/goldsky-queries.ts`

```typescript
export function useGoldskyMintingHistory(daoId: string, kind?: string, limit = 50) {
  return useSWR<GoldskyActivityResponse>(
    `/api/dao/${encodeURIComponent(daoId)}/activity-feed?contractRole=minter${kind ? `&kind=minter.${kind}` : ''}&limit=${limit}`,
    fetchJson,
    { keepPreviousData: true }
  );
}

export function useGoldskyMinterClaims(daoId: string, recipient?: string, limit = 100) {
  const query = new URLSearchParams();
  query.append('contractRole', 'minter');
  query.append('kind', 'minter.merkle_claim,minter.allowlist_claim');
  if (recipient) query.append('actor', recipient);
  query.append('limit', String(limit));

  return useSWR<GoldskyActivityResponse>(
    `/api/dao/${encodeURIComponent(daoId)}/activity-feed?${query}`,
    fetchJson,
    { keepPreviousData: true }
  );
}
```

---

## Implementation Checklist

### Phase 1: Database Setup
- [ ] Create Minter schema in PostgreSQL
- [ ] Create all Minter tables (mint_events, batch_mint_events, merkle_claim_events, allowlist_claim_events, etc.)
- [ ] Add indexes for performance
- [ ] Create Prisma migration for database changes

### Phase 2: Prisma Schema
- [ ] Add Minter event views to `apps/web/prisma/schema.prisma`
- [ ] Update `datasource db` schemas array to include `minter`
- [ ] Run `prisma generate` to update Prisma client

### Phase 3: Goldsky Pipeline
- [ ] Add `dao_minters` dynamic table to pipeline template
- [ ] Update `dao_events` SQL to include minter contract detection
- [ ] Add Minter event types to activity feed script kindMap
- [ ] Add Minter event titles to titleMap
- [ ] Add Minter events to userFacing map
- [ ] Regenerate Goldsky pipeline YAML

### Phase 4: Goldsky Transforms
- [ ] Deploy updated Goldsky pipeline
- [ ] Verify Minter contract is detected in `dao_events`
- [ ] Test event ingestion with sample Minter transactions
- [ ] Verify activity feed entries are created

### Phase 5: Frontend Integration
- [ ] Add Minter query functions to `goldsky.ts`
- [ ] Add Minter hooks to `goldsky-queries.ts`
- [ ] Create Minter activity UI components
- [ ] Add minting history page to dashboard

### Phase 6: Testing & Validation
- [ ] Test activity feed retrieval for Minter events
- [ ] Test claims retrieval with filters
- [ ] Test search functionality
- [ ] Verify performance with large datasets

---

## Performance Considerations

### Indexes
- `token_id`: Fast filtering by token
- `recipient`: Fast filtering by claiming address
- `ledger_sequence DESC`: Fast pagination (newest first)
- `deployment_id, dao_id`: Multi-tenant isolation
- Full-text index on recipient: Fast search

### Partitioning (Optional, for future scaling)
```sql
ALTER TABLE minter.mint_events
PARTITION BY RANGE (ledger_sequence) (
    PARTITION p_2026_q1 VALUES LESS THAN (1000000),
    PARTITION p_2026_q2 VALUES LESS THAN (2000000),
    ...
);
```

---

## Next Steps

1. **Immediate**: Create database migration with Minter tables
2. **Short-term**: Update Goldsky pipeline template and regenerate
3. **Medium-term**: Deploy updated pipeline and test event ingestion
4. **Final**: Add frontend components for displaying Minter activity

---

**Document Version**: 1.0
**Last Updated**: October 6, 2026
**Status**: Ready for Implementation
