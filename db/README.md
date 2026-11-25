# Database

PostgreSQL read model for the Goldsky-indexed Stellar DAO deployment. This
directory owns the schema, the migration runner and the operational scripts.

## Architecture

```
Soroban events ─▶ Goldsky pipeline ─▶ 3 landing tables ─▶ views ─▶ Prisma (apps/web)
                  (raw ▶ decoded ▶ activity transforms)    (all derived state)
```

Goldsky writes exactly three landing tables; domain/app state is projected through
views. Replay rebuilds the event-derived read model. Migration bookkeeping and
Goldsky dynamic allowlists are separate objects, and incompatible decoder changes
can still require a deliberate reset/replay.

| Table | Written by | Purpose |
| --- | --- | --- |
| `chain.raw_events` | pipeline `raw_events` | source events with XDR-JSON topics/data |
| `chain.decoded_events` | pipeline `decoded_events` | event name, named topics (`topics`), named data (`args`) |
| `app.activity_feed_events` | pipeline `activity_feed` | title/summary/kind per event |

Landing rows are append-only (triggers reject updates and deletes; an identical
re-delivery is accepted so pipeline restarts are safe). A `BEFORE INSERT`
trigger recovers `operation_index` / `event_index` from the dataset event id
(`…-op-<n>-event-<m>`), because the pipeline source does not expose them and
view ordering inside one transaction (e.g. a 20-token batch mint) depends on them.

See [`docs/DATABASE_SCHEMA.md`](../docs/DATABASE_SCHEMA.md) for the view catalog
and the contract event each view reads.

## Multi-tenancy

- `deployment_id` = `manager:<MANAGER_CONTRACT>`; one pipeline per Manager.
- `dao_id` = the DAO's token contract address.
- The core contracts (token, metadata, governor, treasury) resolve to a DAO
  through `manager.event_identity`, built from `DaoCreated`.
- Modules (auction, marketplace, claims, and any kind a DAO registers by vote)
  resolve through registration windows: `manager.module_registrations` pairs each
  Token's `ModuleRegistered` with its `ModuleUnregistered`, and an event counts
  for a DAO only between them (position `[ledger, tx, op, evt]`; a window opens at
  `[ledger, tx, -1, -1]` so the registering transaction's own events count).
  A known role means the Manager deployed the module for this DAO
  (`manager.created_modules`, migration 0015); any other registered contract,
  another DAO's Manager-built module included, is role `module` whatever kind it
  was registered under. The same address registered by two DAOs is attributed per
  window, and only the DAO it was created for gets its events: they keep the role
  the pipeline gave them, and `manager.module_events` matches roles exactly.
- The pipeline's allowlists (`streamling.dao_*`) only decide what is indexed; the
  views decide whose it is.

## Migrations

`migrations/NNNN_name.sql`, applied in order by `migrate.sh`, each in a single
transaction together with its row in `public.schema_migrations` (name + SHA-256).

| Migration | Contents |
| --- | --- |
| `0001_landing_tables` | schemas, helper functions (`chain.ledger_closed_at_ts` for the pipeline's epoch-millisecond closed-at values, `chain.event_position`, `chain.jsonb_safe` for a stray `\u0000`), the 3 landing tables, indexes, triggers, and `chain.events` (decoded events with jsonb topics/data and a total position: the base of every view) |
| `0002_manager_views` | `manager.module_role()`, DAO registry (with the claims column), module registrations and windowed identity, `manager.module_events`, launches (with the launch registry), assurance drives, `manager.daos` (with `claims_contract`, `assurance_outcome`), per-module launch status, implementations, module versions, Manager settings (admin, pending admin, factory pause) |
| `0003_token_views` | transfers, inventory, delegate state (custody-aware), members, mint allowances, registered modules, supply (voting vs system-held; non-voting modules count as system), approvals, the membership switches (`token.settings`), transfer agents, managed transfers (DAO and agent), delegates |
| `0004_governance_views` | votes, proposals (state from `proposal_scheduled` and the clock, tallies), settings, comments |
| `0005_auction_views` | bids, `auction.auction_state()` (outcome and current bid state per auction), auctions, current auctions (newest per contract) |
| `0006_metadata_views` | token seeds (the profile is a column of `manager.daos`) |
| `0007_treasury_views` | treasury calls (one per executed proposal action) |
| `0008_marketplace_views` | quick-buy pools and their stock (a token is in stock only if it never moved after its mint into the pool), secondary listings (by `token_id`), sales (with `pool_id`), comments |
| `0009_app_views` | activity feed (per-DAO by registration window, with platform events fanned out and revocations sent only to registered modules running the hash), proposal list/detail, feed status (health), indexer status |
| `0010_claims_views` | claim lists, claims (with paid and escrowed amounts), claimers per list |
| `0011_vote_sources` | vote sources (`manager.vote_sources`), `governance.settings.vote_source` |
| `0012_outside_module_casts` | `chain.try_int` (text to integer, NULL for anything else); `manager.module_versions` and `manager.module_launches` take upgrades, storage migrations and launch events only from the contracts the Manager deployed, so the views ignore malformed values from outside modules |
| `0013_u64_view_casts` | `chain.u64_bigint` (text to bigint, values past the bigint range read as its maximum); `marketplace.pools` (`expires_at`, `period_secs`), `marketplace.secondary_listings` (`expires_at`) and `claims.lists` (`expires_at`, `deadline`) read through it, so a far expiry chosen on chain no longer stops the views |
| `0015_known_role_owner` | `manager.created_modules` (every module the Manager created, with the DAO it created it for); `manager.manager_modules` reads it; `manager.module_registrations` gives a known role only when the registering DAO is the one the module was created for, so a DAO that registers another DAO's module sees it as role `module` |

Launch model: every module emits its own launch event (`token_launched`,
`governor_launched`, ...) and hands its admin to the Treasury (`admin_changed`,
the same name and shape as the Manager's own admin event), so launch state is
keyed by the emitting contract (`manager.module_launches`). Slugs are requested
at `dao_created` and claimed at launch (`manager.daos`).

Rules:

- These files are the 2026-10-13 baseline (pre-mainnet): the database is reset
  on every redeploy, so the schema is kept as one clean set of files and edited
  in place (`reset-database.sh`, then `migrate.sh`). Once a database must be
  preserved, migrations become **append-only**: `migrate.sh` aborts if an
  applied file's checksum changed, so add `0010_…` instead of editing.
- No `CONCURRENTLY`, no grants. Roles and privileges live in `grant-permissions.sh`.
- Every migration has a matching `rollback/NNNN_name_rollback.sql`.
- Views never reference roles or deployment ids; they work for any deployment.

## Scripts

| Script | Purpose |
| --- | --- |
| `setup-roles.sh [--rotate <role>]` | once per database: create `goldsky_writer` and `app_server`; `--rotate` sets a new password for one of them |
| `migrate.sh` | apply pending migrations (idempotent) |
| `grant-permissions.sh` | (re)apply role privileges and the writer's DDL guard; run after every migrate |
| `rollback.sh [--steps N] [--confirm-database NAME]` | roll back newest N (default all) migrations |
| `reset-database.sh [--confirm-database NAME]` | drop every schema and the ledger: empty database |
| `test-migrations.sh` | static checks; with `TEST_DATABASE_URL` also migrate → rollback → migrate, the destructive scripts' refusals, the grants and the writer's guard, and the read-model integration tests |
| `debug-database.sh` | inspect roles, schemas, ledger and privileges |

**The database URL.** Every script reads it from `DATABASE_URL` only, and refuses
one given as an argument: arguments are visible to every local user through `ps`,
password included. `lib.sh` writes the URL's settings to a libpq service file and
its password to a password file, both mode 0600 in a private temporary directory
that is removed on exit, and psql reads those. The service file's settings take
precedence over `PGHOST` and the other libpq variables, so a stray variable can't
point a script at another database.

**Destructive scripts.** `rollback.sh` and `reset-database.sh` show the target
host, the database and the deployments it indexes, then ask for the database name,
typed in full. `--yes` is refused. `--confirm-database NAME` is the
non-interactive form for scratch databases and must name the database the URL
connects to; without a terminal and without it, the scripts refuse.

**Role passwords.** `setup-roles.sh` creates each role without LOGIN, then runs
psql's `\password`: psql asks for the password twice on the terminal and sends
only its SCRAM-SHA-256 hash, so the plain password is never in a shell variable,
a command line, SQL text the server could log, or the script's output. The role
gets LOGIN after that. A run interrupted in between finishes on the next run.
Where to store each password: [key custody](../docs/KEY_CUSTODY.md).

Privileges: `goldsky_writer` receives `SELECT/INSERT/UPDATE` on the three landing
tables and `USAGE/CREATE` on `chain`/`app` for sink startup. Append-only triggers
reject changed updates/deletes. Goldsky's dynamic-table backend also needs its
separate `streamling` setup; the landing grants do not prove that setup is complete.

The writer keeps `CREATE` on the database (`setup-roles.sh`): the Goldsky sink and
dynamic tables issue `CREATE SCHEMA IF NOT EXISTS`, which PostgreSQL authorises
against the database before it checks whether the schema exists. That privilege
alone would let the writer create any schema, extension or publication, so
`grant-permissions.sh` installs an event trigger, `goldsky_writer_ddl_guard`, that
refuses each of those the writer runs except the `streamling` schema. A no-op
`IF NOT EXISTS` passes, and renaming `streamling` is refused. Creating an event
trigger needs a superuser, or `neon_superuser` on Neon, so run `grant-permissions.sh`
as the database owner; the trigger is created last, so the other grants stand if it
fails. The guard is tested against PostgreSQL 16, not yet against Neon or a running
Goldsky sink: after the first apply on a branch, check that the pipeline starts and
its position moves (`goldsky turbo state list <pipeline>`).
`app_server` is read-only on the view schemas and has **no** access to
`chain.*` or the landing tables; views read them with their owner's privileges,
which is why application checks use `app.indexer_status` or `app.activity_feed`,
not raw events. These grants are role boundaries, not per-DAO row-level security.

## Fresh database

```bash
export DATABASE_URL=postgres://admin:...@host/neondb     # admin role; set it in the shell, not on a command line
./db/setup-roles.sh        # once per database; asks for each role's password
./db/migrate.sh
./db/grant-permissions.sh
```

## Resetting a deployed database (clean start)

Reset is a destructive clean-start operation for a disposable deployment or an
approved incompatible replay. A new Manager address alone does not require deleting
other deployments' history. Confirm the intended database before proceeding.
Order matters: stop the writer
first so it cannot repopulate half-reset tables.

```bash
# 1. Stop the pipeline
cd packages/goldsky && ./scripts/deploy.sh delete && cd ../..

# 2. Reset and rebuild the schema
./db/reset-database.sh          # type the database name
./db/migrate.sh
./db/grant-permissions.sh

# 3. Regenerate and redeploy the pipeline (replays from its start ledger)
cd packages/goldsky && pnpm generate && ./scripts/deploy.sh deploy
```

Goldsky's dynamic tables (the DAO module allowlists) live in the `streamling`
schema of the same database and are not touched by the reset; they are append-only
and are refilled from `DaoCreated` events on replay, so rows from an earlier run stay
(harmless: an obsolete address only lets its events through the filter; nothing
downstream reads these tables). If the Manager address changed, drop that schema too
(`DROP SCHEMA streamling CASCADE`) while the pipeline is stopped, or the old DAOs'
events keep flowing in under the new deployment id.

That command is destructive and applies only to a confirmed obsolete dynamic-table
schema. A shared database may have other pipelines using it. The deployment wrapper's
CLI prerequisite/compatibility caveat is in [the Goldsky README](../packages/goldsky/README.md).

## Verifying changes

```bash
./db/test-migrations.sh                                   # static
TEST_DATABASE_URL=postgres://admin@localhost:5432/postgres ./db/test-migrations.sh   # full
```

The full run needs a superuser on a throwaway server (it creates a scratch
database, roles and the writer's event trigger), for example
`docker run -d --name pg16-scratch -e POSTGRES_PASSWORD=<password> -p 127.0.0.1:55432:5432 postgres:16`.

The integration test replays a full DAO lifecycle through the real pipeline
transforms into a scratch database and asserts on the views, that every pipeline
sink column exists with the right type, and that `apps/web/prisma/schema.prisma`
matches the views column-for-column and type-for-type.

These tests do not prove remote pipeline health or runtime role grants. Validate
permissions separately with the role scripts and an approved test database.
The web uses additional read-only Marketplace views and a parameterized execution
receipt query; local drafts/preferences do not add writable app tables. See
[web reference](../apps/web/README.md).
