# DAO Deployment Guide

> **Status**: Versioned redesign reference. Use `MANAGER_REDESIGN.md` and
> `MARKETPLACE_PLAN.md` for the new six-module deployment baseline, and
> `SECURITY_MODEL.md` for the setup-window rules.
>
> `scripts/deploy-dao.mjs` implements this flow (phases `create_dao`,
> `admin_checklist`, `launch_dao`). It validates the config against the contract
> bounds first (`--validate-only` runs just that), mints founders with
> `token.batch_mint`, adds artwork in batches of <= 30 items, and passes
> `launch_config` with `enable_minter` from the config's `launch` section. The
> governance proposal threshold key is `governance.proposalThreshold` (absolute
> votes).

This guide covers creating and deploying new DAOs using the multi-tenant system.

## Prerequisites

1. Manager contract deployed on target network
   - See [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md)

2. Environment configured
   - A current `deploys/*-manager.json` artifact; the web predev/prebuild hook generates the deployment ID
   - `NEXT_PUBLIC_NETWORK=testnet` in app .env
   - `APP_DATABASE_URL` for the web app's Prisma read-only queries
   - `DATABASE_URL` only where an admin or migration script explicitly requires it

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

  "marketplace": {
    "secondaryFeeBps": 250
  },

  "governance": {
    "votingDelay": 300,
    "votingPeriod": 604800,     // 7 days in seconds
    "quorumBps": 4000,          // 40%
    "proposalThresholdBps": 5000 // 50%
  },

  "launchAdmin": "GXXXXX..."
}
```

Contract-enforced bounds at `create_dao` (violations fail with the listed Manager error):

| Field | Bound | Error |
| --- | --- | --- |
| `votingDelay`, `votingPeriod`, `queueDelay` | each 300 to 2,592,000 seconds (30 days) | `InvalidGovernanceTiming` (1117) |
| `quorumBps` | 1 to 10,000 | `InvalidQuorumBps` (1105) |
| proposal threshold (`GovernanceConfig.proposal_threshold`, an absolute token count, not bps) | at least 1 | `InvalidProposalThreshold` (1120) |
| `auction.duration` | 300 seconds to 2,592,000 seconds (30 days) | `InvalidDuration` (1107) |
| `auction.reservePrice` | at least 1,000 stroops | `InvalidParamBounds` (1103) |
| `auction.timeBuffer` | 1 to 86,400 seconds | `InvalidTimeBuffer` (1108) |
| `marketplace.secondaryFeeBps` | at most 10,000 | `InvalidParamBounds` (1103) |

The auction and marketplace payment assets given here are recorded in
`PendingDao`. `launch_dao` fails if either was changed during setup.

### Step 2: Create, Configure, Launch

The flow has three on-chain phases.

**1. `create_dao`** (deployer AND launch admin auth; one signature if they are the same address. `scripts/deploy-dao.mjs` signs with a single stellar CLI identity, so it requires `deployer == launchAdmin` and fails validation otherwise. For different accounts, build with `stellar tx new invoke --build-only`, sign with both accounts using `stellar tx sign`, and submit manually). Deploys Token, Metadata, Treasury,
Governor, Auction and Marketplace at deterministic addresses. All wiring is
constructor-only: there are no setters for the Treasury, Governor, Token or
Manager addresses. Every module is in Setup, the launch admin owns it, and the
Auction and Marketplace are paused. Manager stores `PendingDao` (addresses,
launch admin, recorded payment assets).

**2. Setup window** (launch admin). Until `launch_dao` succeeds the launch admin can:

- mint founder tokens with `token.mint` / `token.batch_mint`; only the Token
  owner can mint before launch, and `set_mint_authority` and the Minter contract
  fail with `NotLive`. Founder amounts are not capped by the contracts, and at
  least one token must exist at launch;
- add artwork (`metadata.add_properties`, at most 30 items per call) and update
  Metadata settings;
- adjust Auction parameters while it is paused, and Marketplace fee, payment
  asset and pause state;
- use the owner-only Governor setters.

The launch admin cannot create proposals, vote, execute, create primary listings,
list or buy on the secondary market, or unpause the Auction in this window (`NotLive`).

Founder supply is unconstrained and the minimum governance timings allow a
majority founder to execute a proposal about 15 minutes after launch; see
SECURITY_MODEL.md "Known limitations" (founder supply, quorum lock) before choosing
founder distribution, timings and `quorumBps`.

**3. `launch_dao(token_address, LaunchConfig { launch_auction, launch_marketplace, enable_minter, expected_minter })`**
(launch admin auth). The Manager checks the launch admin still owns the Token,
supply is nonzero, and the payment assets match `PendingDao`. It then launches
every module: ownership moves to the Treasury, the Auction starts if
`launch_auction`, the Marketplace is left open if `launch_marketplace` (forced
paused otherwise), and `PendingDao` is deleted. Token mint authority is set to
Treasury and Marketplace, plus Auction if `launch_auction`, plus the platform
minter if `enable_minter`.

The platform minter is not chosen by the DAO. The Manager admin registers it
beforehand with `manager.set_platform_minter(minter)`; `enable_minter: true`
fails with `PlatformMinterNotSet` (1008) if none is registered. When
`enable_minter` is true, `LaunchConfig.expected_minter` must be set to the
minter returned by `manager.get_platform_minter()`, otherwise launch fails with
`PlatformMinterMismatch` (1010); `scripts/deploy-dao.mjs launch_dao` reads and
pins it automatically.

The script wrapper writes the artifact to
`deploys/testnet-my-dao-1.json`.

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
- All 6 contracts populated, including `marketplace_contract`
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
curl http://localhost:4242/api/dao/CB.../config
```

## DAO Lifecycle States

### Pending

DAO has been created but not yet launched. Every module is in Setup.

**When**: Immediately after `create_dao()`

**Duration**: Setup window (founder mints, artwork, parameters)

**Operations Blocked** (`NotLive`, 9001):
- No proposals can be created, voted on, queued or executed
- `treasury.execute`, the Minter and `token.set_mint_authority` fail
- The Auction cannot be unpaused and primary listings cannot be created

**Database**:
```sql
status = 'pending'
finalized_ledger = NULL
finalized_at = NULL
```

### Operational

DAO is fully configured and ready for operation.

**When**: After `launch_dao()` completes

**Features Enabled**:
- Proposals can be created
- Voting is active
- Auctions run continuously when started
- Primary sales are created by Governor proposals (`create_primary_listing` through `treasury.execute`)
- Treasury owns every module and controls funds
- Anyone can call `treasury.execute` for a queued proposal

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
    "votingDelay": 300,         // Seconds before voting opens (300 to 2,592,000)
    "votingPeriod": 604800,     // Seconds voting is open (300 to 2,592,000)
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
    "timeBuffer": 900,          // Grace period on bids (1 to 86,400 seconds)
    "paymentAsset": "native"    // XLM or SAC; fixed at create_dao and checked at launch
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
- Check which DAOs need launch
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

If `launch_dao()` didn't complete:

1. Check if it was called:
   ```bash
   # Look in deploy artifact
   cat deploys/testnet-my-dao-1.json | grep finalize
   ```

2. Call launch_dao directly with LaunchConfig (the source account must be the launch admin):
   ```bash
   stellar contract invoke \
     --id MANAGER_ADDRESS \
     --source-account IDENTITY \
     --network testnet \
     -- launch_dao \
     --token_address DAO_TOKEN_ADDRESS \
     --launch_config '{"launch_auction": true, "launch_marketplace": true, "enable_minter": false, "expected_minter": null}'
   ```

   The LaunchConfig controls:
   - `launch_auction`: start the Auction (false leaves it paused until governance starts it)
   - `launch_marketplace`: leave the Marketplace open (false forces it paused)
   - `enable_minter`: grant mint authority to the Manager-registered platform minter
   - `expected_minter`: required (the registered minter's address) when `enable_minter` is true; `null` otherwise

   Common failures: `LaunchSupplyZero` (1121, mint a founder token first),
   `Unauthorized` (1000, the launch admin no longer owns the Token),
   `PaymentTokenMismatch` / `PaymentAssetMismatch` (a payment asset changed
   during setup), `PlatformMinterNotSet` (1008). A failed launch changes nothing;
   retry after fixing the cause.

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
    "votingDelay": 300,
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

=== Launching DAO ===
# launch_dao
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
- [GOLDSKY_SETUP.md](./GOLDSKY_SETUP.md) - Pipeline
- [scripts/deploy-dao.mjs](../scripts/deploy-dao.mjs) - Deployment script

## Testnet rehearsal (e2e)

`scripts/e2e-testnet.mjs` drives a complete lifecycle on **testnet only** (it refuses any other network): Manager deploy, `create_dao`, founder setup, `launch_dao`, a two-bidder auction with refund and settlement, a multi-action governance round (`set_quorum_bps` + `create_primary_listing`, executed through `Treasury.execute`) and a primary-sale purchase. It uses the template `configs/e2e-testnet-dao.json` (300s governance/auction minimums, 1 XLM reserve, native SAC); the driver copies it to `.e2e/dao-<nonce>.json` with a per-run timestamp nonce and the resolved identity addresses.

```bash
stellar contract build                      # WASMs must exist
node --test scripts/e2e-testnet.test.mjs    # offline helper tests (hash vector, argument encoding)
node scripts/e2e-testnet.mjs all            # or one phase: preflight|deploy-manager|create-dao|setup|launch|auction|governance|marketplace|report
node scripts/e2e-testnet.mjs governance --keep-going --state .e2e/state.json
```

Identities (local `stellar keys` names, override with `E2E_MANAGER_ADMIN`, `E2E_DAO_OWNER`, `E2E_BIDDER_A`, `E2E_BIDDER_B`): `testnet-admin` (Manager admin, second bidder), `testnet-dev` (deployer and launch admin, founder 1), `alice` (founder 2, first bidder, buyer). Keys must already exist and hold > 100 XLM; the driver only reads public addresses.

State and results: `.e2e/state.json` (addresses, tx hashes, proposal id, timestamps; gitignored) makes the run resumable, a finished phase is skipped unless `--redo` is given, and `.e2e/report.json` plus a console table (stellar.expert links) is produced by the `report` phase. A full run takes roughly 35-45 minutes of waiting (voting delay, voting period and queue delay are 300s each, plus the 300s auction). Any FAIL makes the process exit nonzero; `--keep-going` continues with later phases. Not covered: the deferred-refund path (needs a recipient whose token transfer fails, impossible with native XLM) and a second `Manager.launch` (not callable).
