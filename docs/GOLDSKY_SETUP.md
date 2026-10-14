# How to configure Goldsky indexing

The pipeline discovers DAO modules from Manager events and projects their history
into PostgreSQL. Manager retains persistent slug mappings but no enumeration API;
indexed events remain the durable directory/history layer.

## Inputs

- A Manager artifact with network, Manager, and deployment/transaction ledger.
- A PostgreSQL database with the [migrations/roles/grants](../db/README.md) applied by its administrator.
- A named Goldsky Postgres secret whose database credentials can write the three landing tables and maintain the pipeline's `streamling` dynamic allowlists.
- A configured Goldsky CLI/session. The package does not declare a Goldsky CLI dependency.

## Configure and generate

From `packages/goldsky`:

```bash
cp .env.example .env
# Set MANAGER_DEPLOYMENT_FILE and GOLDSKY_POSTGRES_SECRET in the copied file.
pnpm generate
pnpm validate
pnpm test
```

The artifact path is resolved from the repository root, even when generation runs in the package. `GOLDSKY_START_AT` overrides the artifact ledger; otherwise generation takes `deploymentLedger` or the earliest transaction ledger. The example's fixed start ledger is deployment-specific, not a default for every Manager. The generator loads `.env` then `.env.local`, with process environment taking precedence.

Output is `pipelines/builder-stellar-events.yaml`, authored from `templates/builder-stellar-events.yaml.mustache` and transform scripts. No `setup-env.sh` or `goldsky.yaml` is used. Credentials are held by the named backend secret; the generator does not interpolate `GOLDSKY_SECRET_NEON_*` values into YAML.

## Database and web

From the repository root, an administrator runs `db/setup-roles.sh`, `db/migrate.sh`, and `db/grant-permissions.sh` using `DATABASE_URL`. These mutate the database. The web uses separate read-only `APP_DATABASE_URL`. See [DB operations](../db/README.md) for the exact scripts and reset boundaries.

Align the web's newest-artifact deployment selection with the pipeline's explicit artifact and `NEXT_PUBLIC_NETWORK`. The Manager is the only configured contract. DAO addresses enter the allowlists from events: the core four (token, metadata, governor, treasury) from `DaoCreated`; modules the Manager deployed from `DaoCreated` and `ModuleCreated`, each into its kind's table (`dao_auctions`, `dao_marketplaces`, `dao_claims`, `dao_circles`); and any other contract a known Token registers (`ModuleRegistered`) into the catch-all `dao_modules`, as role `module` whatever kind it was registered under. A module registered by proposal is followed without a regenerate, and a known role always means Manager-deployed code. Details: [package reference](../packages/goldsky/README.md#allowlists).

Why allowlists when `manager.daos` already lists every module: `manager.daos` is a view over `chain.decoded_events`, the pipeline's own output, and a Goldsky SQL transform cannot read our tables or views. Its only lookup outside the stream is `dynamic_table_check(table, value)`, a membership test on one key column, so the role of an address has to be encoded by which table holds it. The tables (`streamling.dao_<kind>`) are append-only and survive redeploys; after a database reset they are rebuilt from the replayed events on top of what is there, which is harmless (an obsolete address only lets its events through the filter, and the read model windows module events by registration). A Manager change needs `DROP SCHEMA streamling CASCADE` with the pipeline stopped ([DB operations](../db/README.md)).

**Query cost of module identity.** `manager.module_registrations` and the windowed `event_identity` / `module_events` views compare each module event's position (`ledger, tx, op, evt`) with the registration windows of its address. Per-DAO reads push the DAO filter down, but an unfiltered scan (a backfill check, an ad hoc count) joins every module event to its windows; filter by DAO or by `contract_id` when querying by hand.

## Validation and deployment boundary

`pnpm validate` checks contract-event alignment locally. `pnpm turbo:validate` and `packages/goldsky/scripts/deploy.sh` use the Turbo CLI (`goldsky turbo validate|apply|list|logs|delete`, global `goldsky`, `goldsky login`); the legacy `goldsky pipeline ...` commands do not see Turbo pipelines. The script reads the pipeline name from the generated YAML.

The pipeline name is `builder-stellar-<network>` from the Manager artifact (`GOLDSKY_PIPELINE_NAME` overrides it), so the generated `pipelines/builder-stellar-events.yaml` is applied as is; the testnet pipeline is `builder-stellar-testnet`. A replay after a DB reset needs `goldsky turbo delete <name>` (clears state) and a fresh `apply`; the checklist is in `packages/goldsky/README.md`. The template requests `stellar_<network>.events` version `1.2.0`, resource size `s`, streaming mode, and an explicit start ledger. These are configured values, not a claim that every network alias is available from the vendor.

## Event identity notes

- Every contract emits its own launch event at `launch_dao` / `launch_when_ready` (`TokenLaunched`, `GovernorLaunched`, `TreasuryLaunched`, `AuctionLaunched`, `MarketplaceLaunched`, `ClaimMinterLaunched`, `MetadataLaunched`) and an `AdminChanged` (launch admin -> Treasury; at `open_assurance` for a drive). `AdminChanged` shares its name and shape with the Manager's own admin event; identify events by (contract address, event name).
- Governor `propose` emits `ProposalScheduled` (vote window, snapshot, quorum) next to `ProposalCreated`; proposal state in the read model is computed from it.
- Manager `launch_dao` claims the slug (`SlugClaimed`); `DaoCreated.slug` and `PendingSlugUpdated` are only requests. `open_assurance` claims it early, and `SlugReleased` frees a failed drive's slug.
- An event the decoder doesn't know (from a module registered outside the Manager) is decoded positionally (`topic_N`, `arg_N`) and lands as an admin `module.<event>` row.
- `batch_mint` emits one `MintBatchWithMinter` and the Metadata hook one `SeedsGenerated` per batch (views expand them per token); single mints keep `MintWithMinter` / `SeedGenerated`.
- Contract error codes are unique across contracts (7000-7899, one block of 100 per crate), so a code identifies its contract.

## Verify/troubleshoot

Check generated addresses/start ledger, configured CLI processing status, transform errors, and scoped `manager.daos`/`app.indexer_status` views. Replaying starts at the configured ledger; there is no promise of current-block-only ingestion or <30-second indexing.

Changes to event shape require Rust-to-decoder alignment, activity mapping, relevant SQL views/Prisma, tests, and regenerated YAML. Incompatible replay/reset needs explicit operator approval, not an automatic redeploy. See [package reference](../packages/goldsky/README.md), [view catalog](DATABASE_SCHEMA.md), and [monitoring](MONITORING.md).
