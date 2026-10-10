# How to configure Goldsky indexing

The pipeline discovers DAO modules from Manager events and projects their history
into PostgreSQL. Manager retains persistent slug mappings but no enumeration API;
indexed events remain the durable directory/history layer.

## Inputs

- A Manager artifact with network, Manager, shared Minter, and deployment/transaction ledger.
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

Align the web's newest-artifact deployment selection with the pipeline's explicit artifact and `NEXT_PUBLIC_NETWORK`. New DAO addresses enter six dynamic allowlists from `DaoCreated`. Minter is a configured shared contract, not a seventh DAO child.

## Validation and deployment boundary

`pnpm validate` checks contract-event alignment locally. `pnpm turbo:validate` invokes `goldsky turbo validate` and requires a usable CLI. `scripts/deploy.sh` still invokes `pnpm goldsky pipeline ...` commands and loads `.env`; its CLI compatibility is not established by local transform tests. Confirm the installed CLI command family before using it to validate/apply/delete a remote pipeline. This page does not claim remote deployment was verified.

Pipeline name is `builder-stellar-events`; the current testnet pipeline was applied with `goldsky turbo apply` from a copy renamed `builder-stellar-testnet` (`goldsky turbo list|delete|apply`). A replay after a DB reset needs `goldsky turbo delete <name>` (clears state) and a fresh `apply`. The template requests `stellar_<network>.events` version `1.2.0`, resource size `s`, streaming mode, and an explicit start ledger. These are configured values, not a claim that every network alias is available from the vendor.

## Event identity notes

- Every module emits its own launch event at `launch_dao` (`TokenLaunched`, `GovernorLaunched`, `TreasuryLaunched`, `AuctionLaunched`, `MarketplaceLaunched`, `MetadataLaunched`) and an `AdminChanged` (launch admin -> Treasury). `AdminChanged` shares its name and shape with the Manager's own admin event; identify events by (contract address, event name).
- Governor `propose` emits `ProposalScheduled` (vote window, snapshot, quorum) next to `ProposalCreated`; proposal state in the read model is computed from it.
- Manager `launch_dao` claims the slug (`SlugClaimed`); `DaoCreated.slug` and `PendingSlugUpdated` are only requests.
- `batch_mint` emits one `MintBatchWithMinter` and the Metadata hook one `SeedsGenerated` per batch (views expand them per token); single mints keep `MintWithMinter` / `SeedGenerated`.
- Contract error codes are unique across contracts (7000-7899, one block of 100 per crate), so a code identifies its contract.

## Verify/troubleshoot

Check generated addresses/start ledger, configured CLI processing status, transform errors, and scoped `manager.daos`/`app.indexer_status` views. Replaying starts at the configured ledger; there is no promise of current-block-only ingestion or <30-second indexing.

Changes to event shape require Rust-to-decoder alignment, activity mapping, relevant SQL views/Prisma, tests, and regenerated YAML. Incompatible replay/reset needs explicit operator approval, not an automatic redeploy. See [package reference](../packages/goldsky/README.md), [view catalog](DATABASE_SCHEMA.md), and [monitoring](MONITORING.md).
