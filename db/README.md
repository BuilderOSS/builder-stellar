# Database

PostgreSQL read model for the Goldsky-indexed Stellar DAO deployment. This
directory owns the schema, the migration runner and the operational scripts.

## Architecture

```
Soroban events ─▶ Goldsky pipeline ─▶ 3 landing tables ─▶ views ─▶ Prisma (apps/web)
                  (raw ▶ decoded ▶ activity transforms)    (all derived state)
```

Goldsky writes exactly three tables; **everything else is a view**, so replaying
the pipeline rebuilds the whole read model and no migration ever has to move data.

| Table | Written by | Purpose |
| --- | --- | --- |
| `chain.raw_events` | pipeline `raw_events` | source events with XDR-JSON topics/data |
| `chain.decoded_events` | pipeline `decoded_events` | event name, named topics (`topics`), named data (`args`) |
| `app.activity_feed_events` | pipeline `activity_feed` | title/summary/kind per event |

Landing rows are append-only (triggers reject updates and deletes; an identical
re-delivery is accepted so pipeline restarts are safe). A `BEFORE INSERT`
trigger recovers `operation_index` / `event_index` from the dataset event id
(`…-op-<n>-event-<m>`), because the pipeline source does not expose them and
view ordering inside one transaction (e.g. a 30-token batch mint) depends on them.

See [`docs/DATABASE_SCHEMA.md`](../docs/DATABASE_SCHEMA.md) for the view catalog
and the contract event each view reads.

## Multi-tenancy

- `deployment_id` = `manager:<MANAGER_CONTRACT>`; one pipeline per Manager.
- `dao_id` = the DAO's token contract address.
- Module contracts (token, metadata, auction, governor, treasury, marketplace)
  resolve to a DAO through `manager.event_identity`, built from `DaoCreated`.
- The **Minter** is one contract shared by every DAO. Its events carry the DAO
  token as the `token_id` topic, which `manager.dao_registry` resolves to a DAO.
  Minter events for tokens outside the deployment are dropped.

## Migrations

`migrations/NNNN_name.sql`, applied in order by `migrate.sh`, each in a single
transaction together with its row in `public.schema_migrations` (name + SHA-256).

| Migration | Contents |
| --- | --- |
| `0001_landing_tables` | schemas, helper functions, the 3 landing tables, indexes, triggers |
| `0002_manager_views` | DAO registry, modules, identity, `manager.daos`, per-module launch status and `dao_lifecycle`, module upgrade history and current module versions, admin history/settings (incl. cancelled proposals), implementations |
| `0003_token_views` | transfers, mints, inventory, delegations, mint authorities, members |
| `0004_governance_views` | proposals (with computed `expired`), votes, actions, lifecycle, per-proposal execution calls |
| `0005_auction_views` | auctions, bids, refunds (pushed and deferred), withdrawals, pending refunds, settlements, cancellations |
| `0006_metadata_views` | properties, token seeds, configuration |
| `0007_treasury_views` | treasury calls (one per executed proposal call) |
| `0008_marketplace_views` | primary listings (by `listing_id`), secondary listings (by `token_id`), purchases, sales |
| `0009_minter_views` | merkle/allowlist claims, batch mints, allocation updates |
| `0010_app_views` | activity feed, proposal list/detail, indexer status |

Launch model: every module emits its own `launched` event (six different
structs share the name), so launch state is keyed by the emitting contract
(`manager.module_launches`), never by event name alone.

Rules:

- Migrations are **append-only once deployed**. `migrate.sh` aborts if an applied
  file's checksum changed. Add `0011_…` instead of editing.
- Pre-release exception: until the first production deploy the migrations are
  edited in place (reset the database with `reset-database.sh` and redeploy).
- No `CONCURRENTLY`, no grants. Roles and privileges live in `grant-permissions.sh`.
- Every migration has a matching `rollback/NNNN_name_rollback.sql`.
- Views never reference roles or deployment ids; they work for any deployment.

## Scripts

| Script | Purpose |
| --- | --- |
| `setup-roles.sh` | one-time: create `goldsky_writer` and `app_server` |
| `migrate.sh` | apply pending migrations (idempotent) |
| `grant-permissions.sh` | (re)apply role privileges; run after every migrate |
| `rollback.sh [--steps N] [--yes]` | roll back newest N (default all) migrations |
| `reset-database.sh [--yes]` | drop every schema and the ledger: empty database |
| `test-migrations.sh` | static checks; with `TEST_DATABASE_URL` also migrate → rollback → migrate and the read-model integration test |
| `debug-database.sh` | inspect roles, schemas, ledger and privileges |

Privileges: `goldsky_writer` can only `SELECT/INSERT/UPDATE` the three landing
tables. `app_server` is read-only on the view schemas and has **no** access to
`chain.*` or the landing tables; views read them with their owner's privileges,
which is why the web health check uses `app.indexer_status`, not raw events.

## Fresh database

```bash
export DATABASE_URL=postgres://admin:...@host/neondb     # admin role
./db/setup-roles.sh        # once per database
./db/migrate.sh
./db/grant-permissions.sh
```

## Resetting a deployed database (clean start)

Reset when the Manager is redeployed, the decoder/schema changes incompatibly,
or you want to replay from the start ledger. Order matters: stop the writer
first so it cannot repopulate half-reset tables.

```bash
# 1. Stop the pipeline
cd packages/goldsky && ./scripts/deploy.sh delete && cd ../..

# 2. Reset and rebuild the schema
./db/reset-database.sh          # type 'yes'
./db/migrate.sh
./db/grant-permissions.sh

# 3. Regenerate and redeploy the pipeline (replays from its start ledger)
cd packages/goldsky && pnpm generate && ./scripts/deploy.sh deploy
```

Goldsky's dynamic tables (the DAO module allowlists) live in the `streamling`
schema of the same database and are not touched by the reset; they are rebuilt
from `DaoCreated` events on replay. If the Manager address changed, drop that
schema too (`DROP SCHEMA streamling CASCADE`) while the pipeline is stopped.

## Verifying changes

```bash
./db/test-migrations.sh                                   # static
TEST_DATABASE_URL=postgres://admin@localhost:5432/postgres ./db/test-migrations.sh   # full
```

The integration test replays a full DAO lifecycle through the real pipeline
transforms into a scratch database and asserts on the views, that every pipeline
sink column exists with the right type, and that `apps/web/prisma/schema.prisma`
matches the views column-for-column and type-for-type.
