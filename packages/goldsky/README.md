# Goldsky Indexer for Stellar DAO

PostgreSQL-backed event indexer for Stellar DAO using Goldsky Turbo Pipelines.

This package owns the Goldsky pipeline source, generator, tests, and deployment scripts.

## Quick Start

### 1. Setup Environment

```bash
# Interactive setup
./scripts/setup-env.sh

# Or manually create .env
cp .env.example .env
# Edit .env with your credentials
```

### 2. Run Database Migrations

```bash
# From project root
cd db
./migrate.sh
```

### 3. Generate Pipeline Configuration

```bash
pnpm generate
```

### 4. Deploy to Goldsky

```bash
# Validate
./scripts/deploy.sh validate

# Deploy
./scripts/deploy.sh deploy

# Monitor
./scripts/deploy.sh status
./scripts/deploy.sh logs
```

## Environment Variables

### Required

- `GOLDSKY_API_KEY` - Goldsky API key
- `DATABASE_URL` - PostgreSQL admin connection (for migrations)
- `APP_DATABASE_URL` - PostgreSQL read-only connection (for app queries)

### Goldsky Secrets

Injected into the pipeline:

- `GOLDSKY_SECRET_NEON_HOST` - Database host
- `GOLDSKY_SECRET_NEON_PORT` - Database port (usually 5432)
- `GOLDSKY_SECRET_NEON_DATABASE` - Database name
- `GOLDSKY_SECRET_NEON_USER` - Database user (goldsky_writer role)
- `GOLDSKY_SECRET_NEON_PASSWORD` - Database password

### Contract Deployment IDs

- `DEPLOYMENT_TOKEN` - Token contract deployment ID
- `DEPLOYMENT_GOVERNOR` - Governor contract deployment ID
- `DEPLOYMENT_TREASURY` - Treasury contract deployment ID
- `DEPLOYMENT_AUCTION` - Auction contract deployment ID

The generator also reads `packages/goldsky/.env` and `packages/goldsky/.env.local` when present.

## Commands

### Pipeline Management

```bash
# Generate pipeline from .env
pnpm generate

# Run tests
pnpm test

# Validate event coverage
pnpm validate
```

### Deployment

```bash
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

## Pipeline Architecture

The generator reads deployment configuration and transform scripts, then writes `goldsky.yaml`:

```
Stellar Network
    ↓
Goldsky Indexer (stellar_events source)
    ↓
dao_events transform (filter by deployment IDs)
    ↓
raw_events transform (decode XDR-JSON)
    ↓
decoded_events transform (extract event data)
    ↓
activity_feed transform (user-friendly summaries)
    ↓
PostgreSQL (Neon) destination
```

### Pipeline Outputs

- `chain.raw_events` - Raw Goldsky events with XDR-JSON
- `chain.decoded_events` - Decoded events with structured fields
- `app.activity_feed` - User-friendly activity feed
- `governance.proposals` - Proposal data (via views)
- `token.members` - Token holder data (via views)

## Event Coverage

The decoder handles **40 critical DAO events** across 4 contracts:

- **Token**: 9 events (Mint, Transfer, Delegate, etc.)
- **Governor**: 16 events (ProposalCreated, VoteCast, parameter changes, etc.)
- **Treasury**: 3 events (Initialize, Execute, GovernorChanged)
- **Auction**: 12 events (AuctionCreated, BidPlaced, parameter changes, etc.)

Run `pnpm validate` to verify 100% coverage against TypeScript bindings.

## Data Access Layer

Query functions in `apps/web/src/lib/goldsky.ts`:

```typescript
// Activity feed
await getGoldskyActivityFeed({ limit: 25 })

// Proposals
await getGoldskyProposalList({ status: 'active' })
await getGoldskyProposalDetail('proposal_id')
await getGoldskyProposalVotes({ proposalId: 'id' })
await getGoldskyProposalLifecycle('proposal_id')

// Token inventory
await getGoldskyTokenInventory({ limit: 100 })
await getGoldskyMintAuthorities()
await getGoldskyGovernorAuthorities()

// Health check
await getGoldskyHealth()
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
│   ├── dao-events-transform.test.mjs     # Event decoder tests
│   └── event-coverage.test.mjs           # Coverage tests
├── .env                            # Your configuration (gitignored)
├── goldsky.yaml                    # Generated pipeline (gitignored)
└── package.json
```

### Adding New Events

1. Update `src/decoded-events.script.js` with new event handler
2. Update `src/activity-feed.script.js` with title/summary
3. Add database column if needed (create migration)
4. Add test in `test/dao-events-transform.test.mjs`
5. Run `pnpm test && pnpm validate`
6. Regenerate and redeploy: `pnpm generate && ./scripts/deploy.sh redeploy`

## Database Setup

### Create Roles

```sql
-- Goldsky writer (for pipeline)
CREATE ROLE goldsky_writer WITH LOGIN PASSWORD 'secure_password';
GRANT CREATE ON DATABASE neondb TO goldsky_writer;

-- App reader (for Next.js)
CREATE ROLE app_server WITH LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE neondb TO app_server;
```

### Run Migrations

```bash
cd db
./migrate.sh "postgres://admin:password@host.neon.tech/neondb"
```

### Grant Permissions

```sql
-- Goldsky writer
GRANT USAGE ON SCHEMA chain, governance, token, auction, treasury, app TO goldsky_writer;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA chain, governance, token, auction, treasury, app TO goldsky_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO goldsky_writer;

-- App reader (read-only)
GRANT USAGE ON SCHEMA app, governance, token, auction, treasury TO app_server;
GRANT SELECT ON ALL TABLES IN SCHEMA app, governance, token, auction, treasury TO app_server;
```

## Troubleshooting

### Pipeline deployment fails

```bash
./scripts/deploy.sh validate  # Check YAML syntax
echo $GOLDSKY_API_KEY          # Verify API key
cat .env | grep GOLDSKY_SECRET # Check secrets
```

### No events in database

```bash
./scripts/deploy.sh status     # Check pipeline state
./scripts/deploy.sh logs       # Check for errors
pnpm generate                  # Verify deployment IDs
```

### Transform errors

```bash
pnpm test                      # Run local tests
pnpm validate                  # Check event coverage
```

## Resources

- [Goldsky Documentation](https://docs.goldsky.com)
- [Stellar Documentation](https://developers.stellar.org)
- [Neon PostgreSQL](https://neon.tech/docs)
- [Soroban Events](https://developers.stellar.org/docs/smart-contracts/guides/events)
