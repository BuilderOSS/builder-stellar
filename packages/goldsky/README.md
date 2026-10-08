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
pausable, ownable).

`pnpm validate` (and `test/contract-alignment.test.mjs`) parse
`contracts/*/src/events.rs` and fail if the decoder's `topicNames` differ from the
real topic order, or if the decoder lists an event nothing emits.
`test/event-coverage.test.mjs` also pins the per-contract event list
(`REQUIRED_EVENTS`) and the removed-event list (`test/removed-events.mjs`), and checks
that the checked-in pipeline embeds the current scripts.

### Decoded shape

`chain.decoded_events` stores `event_name`, `topic_0..3`, `topics` (JSON object keyed by
topic name) and `args` (JSON object of the data fields). Token identifiers can live in
`topics` while `args` is `{}`, so consumers (and `activity-feed.script.js`) must search
topics and args independently. `event_name` is whatever Goldsky emits (snake_case such as
`launched`, or PascalCase); the decoder normalizes for the topic lookup but stores the raw
name, so views should compare case/underscore-insensitively.

### Same-named events: `Launched`

Six structs are named `Launched` (token, governor, treasury, auction, marketplace,
metadata). They share one topic (`treasury`) but differ in data: token `minters`
(Vec<Address>), auction `started`, marketplace `opened`; governor, treasury and metadata
have no data. The decoder keys on the name; the emitting module is identified by
`contract_id` / `contract_role`, so the unique key is (contract, event name). The
contract-event parser exposes `contractEventList()` and `contractEventsByContract()`
(`token:Launched`, ...) for this.

### Event changes from the hardened contracts

| Event | Contract | Topics | Data | Change |
|---|---|---|---|---|
| `Launched` | every module | `treasury` | token `minters`; auction `started`; marketplace `opened`; others none | new |
| `MintAuthorityChanged` | token | `authority` | `old_enabled`, `enabled`, `changed_by` | also emitted per minter at launch |
| `DaoLaunched` | manager | `token_address` | `launched_ledger`, `modules`, `launch_auction`, `launch_marketplace`, `enable_minter` | `enable_minter` added |
| `AdminProposed` | manager | `current_admin`, `proposed_admin` | none | new |
| `AdminChanged` | manager | `old_admin`, `new_admin` | none | new |
| `PlatformMinterSet` | manager | `minter` | none | new |
| `Execute` | treasury | `governor`, `target`, `proposal_id` | `function`, `index` | `proposal_id` topic and `index` added; one event per call |
| `ProposalExecuted` | governor | `proposal_id` | none | now emitted inside `consume` (same tx as `Execute`s) |
| `RefundDeferred` | auction | `token_id`, `bidder` | `amount` (increment) | new |
| `RefundWithdrawn` | auction | `bidder` | `amount` | new |
| `PrimaryListingCreated` | marketplace | `listing_id` | `price`, `expires_at`, `payment_asset` | keyed by listing id, no token/seller |
| `PrimaryListingPurchased` | marketplace | `listing_id`, `buyer` | `token_id`, `price`, `payment_asset` | new (the only place a primary sale's token_id appears) |
| `PrimaryListingCancelled` / `PrimaryListingExpired` | marketplace | `listing_id` | none | new |
| `SecondaryListingCreated` | marketplace | `token_id` | `seller`, `price`, `expires_at`, `fee_bps`, `payment_asset` | `payment_asset` added |
| `ListingPurchased` / `ListingCancelled` / `ListingExpired` | marketplace | `token_id` (+`buyer`) | unchanged | secondary only |
| `MarketplacePaused` | marketplace | none | none | may be emitted at launch |
| `Upgraded` | token, governor, treasury, auction, marketplace, metadata (defined once in `contracts/common/src/upgrade.rs`) | `from_hash`, `to_hash` | `version` | new; replaces marketplace-only `MarketplaceUpgraded`; public activity row `<role>.upgraded` ("Contract upgraded to version V (from -> to)", hashes shortened to 8 chars) |
| `VersionSynced` | same six modules | none | `version` | new; admin activity row `<role>.version_synced` |
| `AdminProposalCancelled` | manager | `current_admin`, `cancelled_admin` | none | new; admin activity row `manager.admin_proposal_cancelled` |
| `DaoCreated` | manager | `token_address`, `deployer`, `launch_admin` | `created_ledger`, `modules`, `wasm_hashes` | `wasm_hashes` (struct of six BytesN<32>: token, metadata, auction, governor, treasury, marketplace) decodes to a nested object in `args` |
| `PropertiesReset` | metadata | none | `old_num_properties` | renamed from `num_properties` |
| removed | marketplace `MarketplaceUpgraded`; governor `TreasuryChanged`, `TokenContractChanged`, `GovernorAuthorityChanged`; treasury `GovernorChanged`; auction `TreasuryUpdated` | | | no longer emitted or decoded |

### Common-crate events

The contract-event parser also scans `contracts/common/src/*.rs`. Events defined there are
emitted by every module, so `contractEventList()` lists each once per emitting role (token,
governor, treasury, auction, marketplace, metadata; `source: 'common'`). The decoder keys on
name only: the emitting module is `contract_id` / `contract_role`.

### Activity feed labels

New user-visible (`public`) items: `marketplace.primary_listing_purchased` ("Primary sale:
token N bought for P (listing L)"), `marketplace.primary_listing_cancelled`,
`auction.refund_deferred`, `auction.refund_withdrawn`, plus the existing `manager.dao_launched`.
`Execute` rows are `admin` and read "Executed fn on target (call i of proposal id)".
Per-module `Launched` rows are `admin` with kind `<role>.launched`; admin changes
(`manager.admin_proposed`, `manager.admin_changed`, `manager.platform_minter_set`),
`primary_listing_expired` and `marketplace.paused` are `admin`. `activity_feed_events`
columns are unchanged; `listing_id` and `index` are only in `topics`/`args`.

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
│   ├── contract-events.mjs         # event ground truth parsed from contracts/*/src/events.rs (keyed by contract + name)
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

1. Add the event's topics to `topicNames` in `src/decoded-events.script.js` (checked against the contracts) and update the role fallback if needed
2. Update `src/activity-feed.script.js` with kind/title/summary/visibility
3. Add or update views if the read model needs it (new migration in `db/migrations/`)
4. Add a test in `test/dao-events-transform.test.mjs` and update `REQUIRED_EVENTS` in `test/event-coverage.test.mjs` (add removed names to `test/removed-events.mjs`)
5. Run `pnpm test && pnpm validate`
6. Regenerate (`GOLDSKY_START_AT=<ledger> pnpm generate` when the artifact has no ledger) and redeploy: `./scripts/deploy.sh redeploy`. The checked-in pipeline test fails if it is stale.

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
