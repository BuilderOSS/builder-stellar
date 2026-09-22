# Goldsky Indexer Setup

PostgreSQL-backed event indexer for Nouns Builder Stellar using Goldsky Turbo Pipelines.

This guide covers setting up the Goldsky indexer to track on-chain events from Token, Governor, Treasury, and Auction contracts.

## Overview

The Goldsky pipeline indexes Stellar contract events into PostgreSQL, enabling efficient querying of:
- Activity feed (all DAO events)
- Proposal lifecycle and voting history
- Token mints, transfers, and delegation
- Auction bids and settlements
- Treasury executions

## Prerequisites

- Goldsky account and API key ([sign up](https://goldsky.com))
- Neon PostgreSQL database ([create free account](https://neon.tech))
- Deployed contracts on Stellar (testnet or mainnet)

## Quick Start

### 1. Setup Environment

From the project root:

```bash
cd packages/goldsky

# Interactive setup
./scripts/setup-env.sh

# Or manually create .env
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Goldsky
GOLDSKY_API_KEY=your_api_key_here

# Database (admin for migrations)
DATABASE_URL=postgres://admin:password@host.neon.tech/neondb?sslmode=require

# Database (app read-only)
APP_DATABASE_URL=postgres://app_server:password@host.neon.tech/neondb?sslmode=require

# Goldsky Secrets (database connection for pipeline)
GOLDSKY_SECRET_NEON_HOST=host.neon.tech
GOLDSKY_SECRET_NEON_PORT=5432
GOLDSKY_SECRET_NEON_DATABASE=neondb
GOLDSKY_SECRET_NEON_USER=goldsky_writer
GOLDSKY_SECRET_NEON_PASSWORD=writer_password

# Manager deployment (from deploys/<label>-<network>-manager.json)
# The artifact supplies the Manager contract ID and starting ledger.
NEXT_PUBLIC_DAO_NETWORK=testnet
NEXT_PUBLIC_DAO_LABEL=builder
```

### 2. Setup Database

#### Create Database Roles

```sql
-- Goldsky writer (for pipeline)
CREATE ROLE goldsky_writer WITH LOGIN PASSWORD 'secure_password';
GRANT CREATE ON DATABASE neondb TO goldsky_writer;

-- App reader (for Next.js)
CREATE ROLE app_server WITH LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE neondb TO app_server;
```

#### Run Migrations

From project root:

```bash
cd db
./migrate.sh "postgres://admin:password@host.neon.tech/neondb?sslmode=require"
```

This creates:
- Schema: `chain`, `manager`, `metadata`, `governance`, `token`, `auction`, `treasury`, `app`
- Tables: `raw_events`, `decoded_events`, `activity_feed`
- Views: `proposals`, `members`, proposal lifecycle views

#### Grant Permissions

```sql
-- Goldsky writer (read/write)
GRANT USAGE ON SCHEMA chain, manager, metadata, governance, token, auction, treasury, app TO goldsky_writer;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA chain, governance, token, auction, treasury, app TO goldsky_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO goldsky_writer;

-- App reader (read-only)
GRANT USAGE ON SCHEMA manager, metadata, app, governance, token, auction, treasury TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA manager, metadata, app, governance, token, auction, treasury TO app_server;
```

### 3. Generate Pipeline Configuration

```bash
cd packages/goldsky
pnpm generate
```

This reads `.env` and generates `goldsky.yaml` with your deployment IDs and database secrets.

### 4. Deploy to Goldsky

```bash
# Validate configuration
./scripts/deploy.sh validate

# Deploy pipeline
./scripts/deploy.sh deploy

# Check status
./scripts/deploy.sh status

# Monitor logs
./scripts/deploy.sh logs
```

### 5. Configure Web App

Add to `apps/web/.env`:

```bash
# Use app_server read-only credentials
APP_DATABASE_URL=postgres://app_server:password@host.neon.tech/neondb?sslmode=require
```

## Pipeline Architecture

```
Stellar Network (testnet/mainnet)
    ↓
Goldsky Indexer (stellar_events source)
    ↓
dao_events transform
    - Filter by deployment IDs
    - Route to contract-specific tables
    ↓
raw_events transform
    - Decode XDR-JSON to structured events
    ↓
decoded_events transform
    - Extract typed event data
    - Normalize timestamps
    ↓
activity_feed transform
    - Generate user-friendly summaries
    - Create activity feed entries
    ↓
PostgreSQL (Neon) destination
```

## Event Coverage

The pipeline starts from the Manager deployment and indexes **54 critical DAO
events** across Manager-discovered DAO modules:

### Token (9 events)
- `Initialize`, `Mint`, `Transfer`, `Burn`
- `DelegateChanged`, `DelegateVotesChanged`
- `AdminChanged`, `MintAuthorityChanged`, `ContractUpgraded`

### Governor (16 events)
- `Initialize`, `ProposalCreated`, `ProposalCanceled`, `ProposalQueued`, `ProposalExecuted`
- `VoteCast`, `VotingDelaySet`, `VotingPeriodSet`
- `ProposalThresholdBpsSet`, `QuorumThresholdBpsSet`
- `VetoerChanged`, `AdminChanged`, `TreasuryChanged`, `ContractUpgraded`

### Treasury (3 events)
- `Initialize`, `Execute`, `GovernorChanged`

### Auction (12 events)
- `Initialize`, `AuctionCreated`, `AuctionBid`, `AuctionSettled`, `AuctionExtended`
- `ReservePriceUpdated`, `MinBidIncrementPercentageUpdated`
- `TimeBufferUpdated`, `DurationUpdated`
- `TokenChanged`, `TreasuryChanged`, `ContractUpgraded`

Run validation:
```bash
cd packages/goldsky
pnpm validate
```

## Data Access

Query functions are in `apps/web/src/lib/goldsky.ts`:

### Activity Feed

```typescript
import { getGoldskyActivityFeed } from '@/lib/goldsky';

const activities = await getGoldskyActivityFeed({ limit: 25 });
// Returns: { id, timestamp, event_type, title, summary, actor, metadata }
```

### Proposals

```typescript
import {
  getGoldskyProposalList,
  getGoldskyProposalDetail,
  getGoldskyProposalVotes,
  getGoldskyProposalLifecycle
} from '@/lib/goldsky';

// List proposals
const proposals = await getGoldskyProposalList({ status: 'active' });

// Get proposal detail
const proposal = await getGoldskyProposalDetail('proposal_123');

// Get votes for proposal
const votes = await getGoldskyProposalVotes({ proposalId: 'proposal_123' });

// Get full lifecycle
const lifecycle = await getGoldskyProposalLifecycle('proposal_123');
```

### Token Data

```typescript
import {
  getGoldskyTokenInventory,
  getGoldskyMintAuthorities,
  getGoldskyGovernorAuthorities
} from '@/lib/goldsky';

// Token holders and balances
const members = await getGoldskyTokenInventory({ limit: 100 });

// Mint authorities
const mintAuth = await getGoldskyMintAuthorities();

// Governor authorities
const govAuth = await getGoldskyGovernorAuthorities();
```

### Health Check

```typescript
import { getGoldskyHealth } from '@/lib/goldsky';

const health = await getGoldskyHealth();
// Returns: { status: 'ok' | 'error', lastBlock, lastEventTime, eventCount }
```

## Development

### Project Structure

```
packages/goldsky/
├── src/
│   ├── decoded-events.script.js    # XDR-JSON decoder
│   ├── activity-feed.script.js     # Activity feed generator
│   └── goldsky-template.yaml       # Pipeline template
├── scripts/
│   ├── generate-pipeline.mjs       # Pipeline generator
│   ├── validate-events.mjs         # Event coverage validator
│   ├── deploy.sh                   # Deployment manager
│   └── setup-env.sh                # Environment setup
├── test/
│   ├── dao-events-transform.test.mjs
│   └── event-coverage.test.mjs
└── package.json
```

### Adding New Events

When adding new events to contracts:

1. Update `src/decoded-events.script.js` with decoder logic
2. Update `src/activity-feed.script.js` with summary template
3. Add database columns if needed (create migration in `db/migrations/`)
4. Add test in `test/dao-events-transform.test.mjs`
5. Run tests: `pnpm test && pnpm validate`
6. Redeploy: `pnpm generate && ./scripts/deploy.sh redeploy`

### Testing

```bash
cd packages/goldsky

# Run all tests
pnpm test

# Validate event coverage against bindings
pnpm validate
```

## Deployment Commands

```bash
cd packages/goldsky

# Validate pipeline configuration
./scripts/deploy.sh validate

# Deploy pipeline to Goldsky
./scripts/deploy.sh deploy

# Check pipeline status
./scripts/deploy.sh status

# Tail pipeline logs
./scripts/deploy.sh logs

# Delete pipeline
./scripts/deploy.sh delete

# Redeploy (delete + deploy)
./scripts/deploy.sh redeploy
```

## Troubleshooting

### Pipeline Deployment Fails

```bash
# Validate YAML syntax
./scripts/deploy.sh validate

# Verify API key
echo $GOLDSKY_API_KEY

# Check all secrets are set
cat .env | grep GOLDSKY_SECRET
```

### No Events in Database

```bash
# Check pipeline state
./scripts/deploy.sh status

# Check for errors
./scripts/deploy.sh logs

# Verify deployment IDs
pnpm generate
cat goldsky.yaml | grep -A 5 "deployment_ids"
```

### Transform Errors in Logs

```bash
# Run local tests
pnpm test

# Check event coverage
pnpm validate

# Review decoder logic
cat src/decoded-events.script.js
```

### Database Connection Issues

```bash
# Test admin connection
psql "$DATABASE_URL" -c "SELECT 1"

# Test app connection
psql "$APP_DATABASE_URL" -c "SELECT 1"

# Check role permissions
psql "$DATABASE_URL" -c "SELECT * FROM information_schema.role_table_grants WHERE grantee = 'goldsky_writer'"
```

## Migration from stellar-dao

If migrating from the previous stellar-dao repository:

1. Update deployment IDs in `.env` to match new contract deployments
2. Run database migrations to create schemas
3. Regenerate pipeline: `pnpm generate`
4. Redeploy: `./scripts/deploy.sh redeploy`
5. Events will start indexing from current block (no historical backfill by default)

## Resources

- [Goldsky Documentation](https://docs.goldsky.com)
- [Goldsky Turbo Pipelines](https://docs.goldsky.com/guides/turbo-pipelines)
- [Stellar Events Guide](https://developers.stellar.org/docs/smart-contracts/guides/events)
- [Neon PostgreSQL](https://neon.tech/docs)
- [Soroban Contract Events](https://developers.stellar.org/docs/smart-contracts/events)

## Next Steps

After successful indexing:

1. Verify events in database:
   ```sql
   SELECT COUNT(*) FROM chain.raw_events;
   SELECT COUNT(*) FROM chain.decoded_events;
   SELECT COUNT(*) FROM app.activity_feed;
   ```

2. Test query functions in web app
3. Monitor pipeline logs for errors
4. Set up alerting for pipeline failures
