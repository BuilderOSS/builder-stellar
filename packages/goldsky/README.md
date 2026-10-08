# Goldsky Indexer for Stellar DAO

PostgreSQL-backed event indexer for Stellar DAO using Goldsky Turbo Pipelines.

This package owns the Goldsky pipeline source, generator, tests, and deployment scripts.

## Quick Start

### 1. Setup Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 2. Run Database Migrations

```bash
# From project root (see db/README.md)
./db/migrate.sh
./db/grant-permissions.sh
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

### Manager Deployment

Set `MANAGER_DEPLOYMENT_FILE` to the Manager deployment artifact, for example:

```env
MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json
```

The artifact supplies the Manager and deployment-level Minter contract addresses and network. It should supply the starting ledger; if it does not, set `GOLDSKY_START_AT` explicitly. The Manager is the only configured contract input; `DaoCreated` and
`DaoRegistered` events discover each DAO's module addresses.

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
- everything else (`manager.daos`, `governance.proposals`, `token.members`, ...) is a PostgreSQL view over these tables; see `docs/DATABASE_SCHEMA.md`

## Event Coverage

The decoder names the topics of every event the contracts emit (Manager, Token,
Governor, Treasury, Auction, Metadata, Marketplace, Minter) plus the OpenZeppelin
library events they publish (NFT transfers/mints, votes, governor lifecycle,
pausable, ownable). Minter events: `MerkleClaimEvent`, `AllowlistClaimEvent`,
`MintBatchEvent`, `MerkleRootSetEvent`, `AllowlistSetEvent`.

`pnpm validate` (and `test/contract-alignment.test.mjs`) parse
`contracts/*/src/events.rs` and fail if the decoder's `topicNames` differ from the
real topic order, or if the decoder lists an event nothing emits.

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
│   ├── raw-events.script.js        # envelope normalizer
│   ├── decoded-events.script.js    # XDR-JSON decoder (topicNames)
│   ├── activity-feed.script.js     # activity feed generator
│   ├── contract-events.mjs         # event ground truth parsed from contracts/*/src/events.rs
│   └── pipeline-generator.mjs      # renders the pipeline YAML
├── templates/builder-stellar-events.yaml.mustache
├── pipelines/builder-stellar-events.yaml   # generated: pnpm generate
├── scripts/
│   ├── generate-pipeline.mjs
│   ├── validate-events.mjs         # decoder vs contract events
│   └── deploy.sh
├── test/                           # unit, contract-alignment and DB integration tests
├── .env                            # your configuration (gitignored)
└── package.json
```

### Adding New Events

1. Update `src/decoded-events.script.js` with new event handler
2. Add the event's topics to `topicNames` in `src/decoded-events.script.js` (checked against the contracts)
2. Update `src/activity-feed.script.js` with kind/title/summary
3. Add or update views if the read model needs it (new migration in `db/migrations/`)
4. Add test in `test/dao-events-transform.test.mjs`
5. Run `pnpm test && pnpm validate`
6. Regenerate and redeploy: `pnpm generate && ./scripts/deploy.sh redeploy`

## Database Setup

Roles, migrations, grants and the reset runbook live in [`db/README.md`](../../db/README.md):

```bash
./db/setup-roles.sh && ./db/migrate.sh && ./db/grant-permissions.sh
```

`goldsky_writer` may only write `chain.raw_events`, `chain.decoded_events` and
`app.activity_feed_events`; everything the app reads is a view.

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
