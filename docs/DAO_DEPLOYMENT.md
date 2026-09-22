# DAO Deployment Guide

> **Status**: Complete - Ready to use

This guide covers creating and deploying new DAOs using the multi-tenant system.

## Prerequisites

1. Manager contract deployed on target network
   - See [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md)

2. Environment configured
   - `NEXT_PUBLIC_DEPLOYMENT_ID=manager:...` in app .env
   - `NEXT_PUBLIC_NETWORK=testnet` in app .env
   - `DATABASE_URL` for admin scripts
   - `APP_DATABASE_URL` for app queries

3. Required tools
   - Node.js 20+
   - Stellar CLI v22+
   - Funded account on target network

## DAO Creation Flow

### Step 1: Create DAO Configuration

Create a JSON file describing the DAO (e.g., `configs/my-dao.json`):

```json
{
  "deployer": "GXXXXX...",
  "nonce": 1,

  "token": {
    "name": "My DAO",
    "symbol": "MYDAO",
    "uri": "https://example.com/token"
  },

  "metadata": {
    "projectUri": "https://example.com",
    "description": "A great DAO",
    "contractImage": "https://example.com/logo.png",
    "rendererBase": "https://example.com/render",
    "artwork": {
      "properties": [
        {
          "name": "Background",
          "items": ["Blue", "Red", "Green"]
        },
        {
          "name": "Body",
          "items": ["Normal", "Rare"]
        }
      ],
      "ipfs": {
        "baseUri": "ipfs://QmXXX...",
        "extension": ".png"
      }
    }
  },

  "auction": {
    "duration": 86400,          // 24 hours
    "reservePrice": 1000000000, // 1 XLM in stroops
    "timeBuffer": 900,          // 15 minutes
    "paymentAsset": "native"    // or contract address
  },

  "governance": {
    "votingDelay": 1,
    "votingPeriod": 604800,     // 7 days in seconds
    "quorumBps": 4000,          // 40%
    "proposalThresholdBps": 5000 // 50%
  },

  "launchAdmin": "GXXXXX..."
}
```

### Step 2: Deploy DAO

```bash
node scripts/deploy-dao.mjs configs/my-dao.json configs/testnet-config.json
```

**What it does** (in order):
1. Creates all 5 contracts
2. Initializes contracts
3. Configures metadata properties
4. Accepts token ownership
5. Finalizes DAO
6. Writes deployment artifact to `deploys/`

**Artifact**: Saved to `deploys/testnet-my-dao-1.json`

### Step 3: Verify in Database

Check DAO was indexed:

```sql
SELECT
  dao_id,
  token_name,
  status,
  created_at
FROM manager.daos
WHERE deployment_id = 'manager:ABC...'
AND token_name = 'My DAO';
```

Should see:
- Status: 'operational'
- All 5 contracts populated
- token_name, token_symbol filled

### Step 4: Verify in Frontend

Query via frontend code:

```typescript
const dao = await getDaoConfigFromDatabase('CB...');
console.log(dao.token_name);  // "My DAO"
console.log(dao.status);      // "operational"
console.log(dao.governor_contract); // "CB..."
```

Or via API route:

```bash
curl http://localhost:3000/api/dao/CB.../config
```

## DAO Lifecycle States

### Pending

DAO has been created but not yet finalized.

**When**: Immediately after `create_dao()`

**Duration**: Setup phase (add properties, accept ownership)

**Operations Blocked**:
- No proposals can be created
- No votes can be cast
- Auction not launched

**Database**:
```sql
status = 'pending'
finalized_ledger = NULL
finalized_at = NULL
```

### Operational

DAO is fully configured and ready for operation.

**When**: After `finalize_dao()` completes

**Features Enabled**:
- Proposals can be created
- Voting is active
- Auctions run continuously
- Treasury controls funds

**Database**:
```sql
status = 'operational'
finalized_ledger = 4804657
finalized_at = 2026-09-22T03:16:46Z
```

## Customization

### Token Metadata

Customized per-DAO via config:

```json
{
  "token": {
    "name": "My DAO",
    "symbol": "MYDAO",
    "uri": "https://example.com/token-metadata"
  }
}
```

**Stored in**: `manager.daos.token_name`, `token_symbol`

### Governance Parameters

Customized per-DAO:

```json
{
  "governance": {
    "votingDelay": 1,           // Blocks before voting opens
    "votingPeriod": 604800,     // Duration of voting
    "quorumBps": 4000,          // % of tokens needed
    "proposalThresholdBps": 5000 // % needed to propose
  }
}
```

### Auction Settings

Customized per-DAO:

```json
{
  "auction": {
    "duration": 86400,          // 24 hours
    "reservePrice": 1000000000, // Minimum bid
    "timeBuffer": 900,          // Grace period on bids
    "paymentAsset": "native"    // XLM or SAC
  }
}
```

## Administration

### List All DAOs

```typescript
const allDaos = await getAllDaosFromDatabase();
```

**Returns**: Array of all DAOs in deployment

### List Pending DAOs

```typescript
const pendingDaos = await getAllDaosFromDatabase('pending');
```

**Use Cases**:
- Check which DAOs need finalization
- Monitor setup progress
- Alert on stalled setups

### List Operational DAOs

```typescript
const operationalDaos = await getAllDaosFromDatabase('operational');
```

**Use Cases**:
- Directory listing
- Dashboard display
- Public visibility

### Get DAO Details

```typescript
const dao = await getDaoConfigFromDatabase(daoId);

console.log({
  name: dao.token_name,
  status: dao.status,
  created: dao.created_at,
  finalized: dao.finalized_at,
  governor: dao.governor_contract,
  treasury: dao.treasury_contract
});
```

## Troubleshooting

### DAO creation failed

Check the artifact:

```bash
cat deploys/testnet-my-dao-1.json
```

Look for `"error"` field with error message.

**Common issues**:
- Deployer account not funded
- Manager contract not found
- Invalid parameters in config

### DAO not appearing in database

1. Check Goldsky pipeline is running:
   ```bash
   ./scripts/deploy.sh status
   ```

2. Check for DaoCreated events:
   ```sql
   SELECT COUNT(*) FROM chain.decoded_events
   WHERE contract_role = 'manager'
   AND lower(event_name) LIKE '%dao%';
   ```

3. Check pipeline logs:
   ```bash
   ./scripts/deploy.sh logs
   ```

### DAO stuck in pending

If `finalize_dao()` didn't complete:

1. Check if it was called:
   ```bash
   # Look in deploy artifact
   cat deploys/testnet-my-dao-1.json | grep finalize
   ```

2. Call finalize directly:
   ```bash
   stellar contract invoke \
     --id MANAGER_ADDRESS \
     --source-account IDENTITY \
     --network testnet \
     -- finalize_dao \
     --token_address DAO_TOKEN_ADDRESS
   ```

3. Check status updated:
   ```sql
   SELECT status, finalized_at
   FROM manager.daos
   WHERE dao_id = 'CB...';
   ```

## Example: Full DAO Lifecycle

### Create Configuration

```bash
cat > configs/example-dao.json << 'EOF'
{
  "deployer": "GXXXXX...",
  "nonce": 1,
  "token": {
    "name": "Example DAO",
    "symbol": "EXAMPLE",
    "uri": "https://example.com/token"
  },
  "metadata": {
    "projectUri": "https://example.com",
    "description": "Example DAO for testing",
    "contractImage": "https://example.com/logo.png",
    "rendererBase": "https://example.com/render",
    "artwork": {
      "properties": [
        {"name": "Color", "items": ["Blue", "Red"]}
      ],
      "ipfs": {
        "baseUri": "ipfs://Qm...",
        "extension": ".png"
      }
    }
  },
  "auction": {
    "duration": 86400,
    "reservePrice": 1000000000,
    "timeBuffer": 900,
    "paymentAsset": "native"
  },
  "governance": {
    "votingDelay": 1,
    "votingPeriod": 604800,
    "quorumBps": 4000,
    "proposalThresholdBps": 5000
  },
  "launchAdmin": "GXXXXX..."
}
EOF
```

### Deploy

```bash
node scripts/deploy-dao.mjs configs/example-dao.json configs/testnet-config.json
```

Output:
```
=== Creating DAO ===
# Creates contracts

=== Adding Metadata Properties ===
# Configures properties

=== Accepting Token Ownership ===
# Ownership transfer

=== Finalizing DAO ===
# Final setup
```

Artifact written to: `deploys/testnet-example-dao-1.json`

### Verify

```bash
# Wait for Goldsky to index (typically <30s)
sleep 30

# Check database
psql $DATABASE_URL << 'SQL'
SELECT
  dao_id,
  token_name,
  status,
  created_at
FROM manager.daos
WHERE token_name = 'Example DAO';
SQL
```

Output:
```
              dao_id              | token_name  |   status    |         created_at
----------------------------------+-------------+-------------+----------------------------
 CBGLIC3VWMWVBX3JCDHQQMVJQCQ2B7Y | Example DAO | operational | 2026-09-22 03:16:46+00
(1 row)
```

### Use in App

```typescript
// In React component
const dao = await getDaoConfigFromDatabase('CBGLIC3V...');

return (
  <div>
    <h1>{dao.token_name}</h1>
    <p>Status: {dao.status}</p>
    <p>Governor: {dao.governor_contract}</p>
  </div>
);
```

## Related Documentation

- [MULTITENANT_ARCHITECTURE.md](./MULTITENANT_ARCHITECTURE.md) - Architecture overview
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Database details
- [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md) - Manager deployment
- [GOLDSKY_MULTITENANT_INTEGRATION.md](./GOLDSKY_MULTITENANT_INTEGRATION.md) - Pipeline
- [scripts/deploy-dao.mjs](../scripts/deploy-dao.mjs) - Deployment script
