# Goldsky event indexer

This package owns the pipeline template/generator, raw/decoded/activity transforms, contract-event alignment, and read-model tests. [Provisioning guide](../../docs/GOLDSKY_SETUP.md); [database operations](../../db/README.md).

## Commands and configuration

Run inside this package:

```bash
pnpm generate       # writes pipelines/builder-stellar-events.yaml
pnpm validate       # local event/decoder alignment
pnpm test           # node --test test/*.test.mjs
pnpm turbo:validate # requires Goldsky CLI; not the same as local event validation
```

`test:db` requires `TEST_DATABASE_URL` pointing to a migrated empty test database. DB integration assertions are skipped without it. Do not use production credentials for these tests.

The generator loads `.env`, `.env.local`, then process overrides. Required `MANAGER_DEPLOYMENT_FILE` resolves from repo root. The artifact must identify Manager and Minter; start is `GOLDSKY_START_AT` or deployment/earliest transaction ledger. `GOLDSKY_POSTGRES_SECRET` (legacy `DAO_POSTGRES` alias, default `DAO_POSTGRES`) selects a named backend secret, not embedded credentials. See [.env.example](.env.example).

The package has no declared Goldsky CLI dependency. `scripts/deploy.sh` invokes `pnpm goldsky pipeline validate/apply/status/logs/delete`, whereas `turbo:validate` uses `goldsky turbo validate`. Do not infer CLI compatibility, API-key requirements, or a verified remote deployment from these wrappers. Remote apply/delete commands are operational mutations and require a configured compatible CLI/session.

## Data flow

```text
stellar_<network>.events (configured dataset version 1.2.0)
  → six dynamic DAO-module allowlists from Manager DaoCreated
  → dao_events: deployment filter and contract role (Manager/shared Minter included)
  → raw_events → decoded_events → activity_feed
  → chain.raw_events / chain.decoded_events / app.activity_feed_events
  → SQL views → web services
```

Dynamic allowlists use the `streamling` schema. The three event sinks are append-only landing tables; **`app.activity_feed` is a view**, not a pipeline sink. Discovery uses `DaoCreated` (including its slug), not removed `DaoRegistered` or Manager storage enumeration. Persistent Manager slug lookup is separate from indexed discovery.

## Events and identity

`contract-events.mjs` parses module event definitions and common-crate events, keyed by role/name. Decoder `topicNames` maps topic order; `args` contains named data fields. Large integers remain strings. The decoder retains the incoming event symbol as `event_name`; current SQL expects emitted snake_case names. PascalCase support in topic lookup does not mean SQL normalizes all names.

Six `Launched` events share a name but have different emitters/payloads. Token carries minters; Auction started; Marketplace opened. Treasury Execute carries Governor/target/proposal topics and function/index data, one per action; Governor ProposalExecuted is in the same transaction. RefundDeferred and RefundWithdrawn differ from successful BidRefunded. Primary listings use listing IDs; secondary listings use NFT IDs. Shared Upgraded/VersionSynced replace MarketplaceUpgraded. Manager DaoCreated includes creation hashes, and admin cancellation is indexed.

Activity mapping includes kind/title/summary/visibility. Unmapped events use a fallback system item. Database DAO identity for modules resolves from `manager.event_identity`; shared Minter uses Token-address topics. [View catalog](../../docs/DATABASE_SCHEMA.md) owns the projection reference.

## Changes and checks

1. Align Rust event topics/data with decoder and role mapping.
2. Update activity labels/visibility and coverage/removed-event tests.
3. Coordinate affected migrations, rollback, grants, Prisma views, and API consumers with their owners.
4. Run local tests/alignment and authorized scratch DB tests, then regenerate YAML.
5. Review deployment/start ledger and replay impact before remote changes.

Tests include contract alignment, event coverage, transforms, activity mappings, fixture shape, sink-column/Prisma agreement, timestamp parsing, and tenant-scoped read models. Generated pipeline tests check embedded scripts; do not manually edit generated YAML. Tests alone do not certify same-transaction module discovery on a live pipeline.

Data-access helpers in `apps/web/src/lib/goldsky.ts` require DAO IDs for DAO reads. The removed Governor-authorities helper is not available. Routes and current marketplace/receipt services are described in [web README](../../apps/web/README.md).
