# Goldsky Multi-Tenant Integration

> **Status**: Pending - Database ready, pipeline needs updates

This document describes what needs to be done in the Goldsky pipeline to support the multi-tenant DAO system.

## Overview

The Goldsky pipeline needs to:
1. Decode `DaoCreated` events from manager contract
2. Extract token metadata from DaoCreationParams
3. Insert/update `manager.daos` table
4. Handle `DaoFinalized` events to update status

**Location**: `packages/goldsky/src/`

## What's Done ✅

- ✅ Database table created with correct schema
- ✅ Indexes optimized for queries
- ✅ Permissions configured (goldsky_writer, app_server)
- ✅ Frontend code ready to consume data

## What Needs To Be Done ⏳

### 1. Decode DaoCreated Events

**File**: `packages/goldsky/src/decoded-events.script.js`

**Task**: Add handler for DaoCreated event

```javascript
// When you see DaoCreated event from manager contract:
if (eventName === 'dao_created' || eventName === 'daocreated') {
  const decoded = {
    event_type: 'dao_created',

    // From event topics
    dao_id: topics[0],            // token_address
    creator: topics[1],           // creator address

    // From event args (DaoCreationParams)
    token_name: args.params?.token_name,
    token_symbol: args.params?.token_symbol,
    token_description: args.params?.description,
    token_uri: args.params?.token_uri,

    // Contract addresses from args
    token_contract: topics[0],  // Same as dao_id
    governor_contract: args.params?.modules?.governor,
    auction_contract: args.params?.modules?.auction,
    treasury_contract: args.params?.modules?.treasury,
    metadata_contract: args.params?.modules?.metadata,

    // Admin account
    admin_address: args.params?.launch_admin
  };
  return decoded;
}
```

**Challenge**: The exact args structure depends on Soroban encoding. May need to adjust field names based on actual event data.

**Testing**:
1. Deploy test DAO with `scripts/deploy-dao.mjs`
2. Check `chain.decoded_events` table for the DaoCreated event
3. Examine actual args structure
4. Adjust decoder based on reality

### 2. Insert into manager.daos

**File**: `packages/goldsky/goldsky.yaml` or pipeline configuration

**Task**: Add SQL transform to populate manager.daos table

```sql
INSERT INTO manager.daos (
  deployment_id,
  dao_id,
  token_address,
  creator,
  manager_contract,
  token_contract,
  governor_contract,
  auction_contract,
  treasury_contract,
  metadata_contract,
  token_name,
  token_symbol,
  token_description,
  token_uri,
  admin_address,
  status,
  created_ledger,
  created_at,
  created_tx_hash
) SELECT
  e.deployment_id,
  e.topic_0 as dao_id,
  e.topic_0 as token_address,
  e.topic_1 as creator,
  e.contract_id as manager_contract,
  (e.decoded_args ->> 'token_contract') as token_contract,
  (e.decoded_args ->> 'governor_contract') as governor_contract,
  (e.decoded_args ->> 'auction_contract') as auction_contract,
  (e.decoded_args ->> 'treasury_contract') as treasury_contract,
  (e.decoded_args ->> 'metadata_contract') as metadata_contract,
  (e.decoded_args ->> 'token_name') as token_name,
  (e.decoded_args ->> 'token_symbol') as token_symbol,
  (e.decoded_args ->> 'token_description') as token_description,
  (e.decoded_args ->> 'token_uri') as token_uri,
  (e.decoded_args ->> 'admin_address') as admin_address,
  'pending'::text as status,
  e.ledger_sequence as created_ledger,
  to_timestamp(nullif(e.ledger_closed_at, '')::numeric / 1000) as created_at,
  e.transaction_hash as created_tx_hash
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND lower(e.event_name) IN ('dao_created', 'daocreated')
  AND NOT EXISTS (
    SELECT 1 FROM manager.daos
    WHERE deployment_id = e.deployment_id
      AND dao_id = e.topic_0
  )
ON CONFLICT (deployment_id, dao_id) DO NOTHING;
```

**Testing**:
1. Deploy test DAO
2. Check `manager.daos` table for the new row
3. Verify all fields are populated correctly
4. Verify token_name, token_symbol, token_description are not NULL

### 3. Handle DaoFinalized Events (Optional but Recommended)

**Task A**: Add DaoFinalized event to manager contract

The manager contract may not currently emit DaoFinalized. If not, add:

```rust
// In contracts/manager/src/contract.rs:finalize_dao()
// After successful finalization:
env.events().publish((
    Symbol::new(&env, "dao_finalized"),
    (&token_address, &launch_admin),
));
```

**Task B**: Decode DaoFinalized event

```javascript
// In decoded-events.script.js:
if (eventName === 'dao_finalized' || eventName === 'daofinalized') {
  const decoded = {
    event_type: 'dao_finalized',
    dao_id: topics[0],     // token_address
    finalized_by: topics[1] // who called finalize_dao
  };
  return decoded;
}
```

**Task C**: Update manager.daos status

```sql
UPDATE manager.daos
SET
  status = 'operational',
  finalized_ledger = e.ledger_sequence,
  finalized_at = to_timestamp(nullif(e.ledger_closed_at, '')::numeric / 1000),
  finalized_tx_hash = e.transaction_hash
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND lower(e.event_name) IN ('dao_finalized', 'daofinalized')
  AND manager.daos.deployment_id = e.deployment_id
  AND manager.daos.dao_id = e.topic_0
  AND manager.daos.status = 'pending';
```

## Testing Checklist

### Local Testing

- [ ] Run database migration: `./db/migrate.sh $DATABASE_URL`
- [ ] Deploy test DAO: `node scripts/deploy-dao.mjs test-dao.json testnet-config.json`
- [ ] Check pipeline logs: `./scripts/deploy.sh logs`
- [ ] Verify DaoCreated event in `chain.decoded_events`
- [ ] Verify DAO in `manager.daos` table
- [ ] Verify all fields populated (contracts, metadata, creator)
- [ ] Finalize DAO via script or direct contract call
- [ ] Verify status changed to 'operational'
- [ ] Verify `finalized_ledger` and `finalized_at` populated

### SQL Verification

```sql
-- Check DAO was created
SELECT dao_id, token_name, token_symbol, status
FROM manager.daos
WHERE deployment_id = 'manager:...'
AND dao_id = 'CB...';

-- Check all contracts present
SELECT
  dao_id,
  token_contract,
  governor_contract,
  auction_contract,
  treasury_contract,
  metadata_contract
FROM manager.daos
WHERE deployment_id = 'manager:...'
AND dao_id = 'CB...';

-- Check metadata
SELECT
  token_name,
  token_symbol,
  token_description,
  token_uri,
  admin_address
FROM manager.daos
WHERE deployment_id = 'manager:...'
AND dao_id = 'CB...';

-- Check status after finalization
SELECT status, finalized_ledger, finalized_at
FROM manager.daos
WHERE deployment_id = 'manager:...'
AND dao_id = 'CB...';
```

## Deployment Order

1. **Update Manager Contract** (if DaoFinalized event needed)
   - Add event emission in finalize_dao()
   - Rebuild and redeploy

2. **Update Goldsky Pipeline** (in order)
   - Add DaoCreated decoder
   - Add manager.daos insert transform
   - Test locally with test DAO
   - Deploy to Goldsky

3. **Verify End-to-End**
   - Deploy test DAO
   - Check database populated
   - Finalize DAO
   - Check status updated

## Troubleshooting

### No data in manager.daos

1. Check goldsky_writer role exists and has permissions:
   ```sql
   \dp manager.daos
   ```

2. Check pipeline configured with manager.daos as destination

3. Check DaoCreated events are being decoded:
   ```sql
   SELECT COUNT(*) FROM chain.decoded_events
   WHERE contract_role = 'manager'
   AND lower(event_name) IN ('dao_created', 'daocreated');
   ```

4. Check pipeline logs:
   ```bash
   ./scripts/deploy.sh logs
   ```

### Token metadata is NULL

1. Verify actual args structure in decoded event:
   ```sql
   SELECT args FROM chain.decoded_events
   WHERE contract_role = 'manager'
   AND lower(event_name) IN ('dao_created', 'daocreated')
   LIMIT 1;
   ```

2. Compare with what the decoder expects

3. Adjust decoder to match actual field names

### Status not updating to operational

1. Check DaoFinalized event is being emitted:
   ```sql
   SELECT COUNT(*) FROM chain.decoded_events
   WHERE contract_role = 'manager'
   AND lower(event_name) IN ('dao_finalized', 'daofinalized');
   ```

2. If no events, add DaoFinalized to manager contract

3. Check UPDATE query correctly maps topic_0 to dao_id

4. Check WHERE clause finds the pending DAO

## Questions to Answer

Before implementing, clarify:

1. **DaoCreationParams Structure** - How does Soroban encode the struct in events?
   - Are args named or positional?
   - What's the exact field structure?
   - How are nested objects (modules) encoded?

2. **Modules Field Structure** - How are the 5 contract addresses encoded?
   - Is it `modules.token`, `modules.governor`, etc.?
   - Or flattened as `token_contract`, `governor_contract`?

3. **Current Events** - Does manager contract already emit DaoFinalized?
   - If yes, what's the event structure?
   - If no, do we need to add it?

4. **Legacy Events** - What events were emitted before?
   - Are there DaoCreated events in testnet that need to backfill?

**Answer by examining:**
- Existing Goldsky transforms for similar events
- Manager contract deployment artifacts (show actual emitted events)
- Test DAO deployment output
- Chain analysis of recent DaoCreated events

## Implementation Strategy

### Incremental Approach

1. **Phase 1**: Decode DaoCreated, insert into manager.daos
   - Get basic DAO discovery working
   - All DAOs start in 'pending' state
   - Test end-to-end

2. **Phase 2**: Add DaoFinalized event and status updates
   - Update status when finalization happens
   - Complete lifecycle tracking

3. **Phase 3**: Backfill historical data (if needed)
   - Query existing DaoCreated events
   - Populate any missing DAOs

## Related Documentation

- [MULTITENANT_ARCHITECTURE.md](./MULTITENANT_ARCHITECTURE.md) - Overall architecture
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Schema details
- [packages/goldsky/README.md](../packages/goldsky/README.md) - Pipeline documentation
- [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md) - Manager contract deployment
