# Tenant and read-model boundaries

One application build selects a Manager deployment. Each DAO is identified by its Token contract address. The identity pair is:

```text
deployment_id = manager:<Manager contract address>
dao_id        = <DAO Token contract address>
```

## Deployment selection

[generate-web-deployment.mjs](../scripts/generate-web-deployment.mjs) selects the newest `deploys/*-manager.json` by `deployedAt` and generates `DEPLOYMENT_ID`. This is a build/dev selection, not a user-supplied query parameter. `NEXT_PUBLIC_NETWORK` independently selects network settings; it must match the artifact. The generator does not filter artifacts by that environment variable.

The Goldsky generator instead uses its explicit `MANAGER_DEPLOYMENT_FILE`. Keep web selection, pipeline artifact, network, and database deployment rows consistent. Do not set a manual `NEXT_PUBLIC_DEPLOYMENT_ID` override.

## Database layers

Goldsky writes `chain.raw_events`, `chain.decoded_events`, and `app.activity_feed_events`. SQL views project state and history. **`manager.daos` is a view**, not a mutable DAO table.

`DaoCreated` supplies deployer, launch admin, six module addresses, and creation WASM hashes. Token/Metadata events provide descriptive values. `DaoLaunched` derives `pending` versus `operational`; `manager.module_launches` tracks each module's `launched` event by emitting contract. Module upgrades and version syncs overlay creation hashes.

Module events resolve through `manager.event_identity`. Shared Minter events resolve through their DAO-token `token_id` topic; foreign token events are excluded from DAO views. Details: [database catalog](DATABASE_SCHEMA.md).

Manager also retains permanent slug mappings. `manager.daos.slug` is projected
from `DaoCreated`; layout resolution filters by deployment and maps to canonical
Token ID. Direct service/API validation still requires its actual documented ID
format rather than accepting arbitrary aliases.

## Query isolation

DAO-scoped queries filter both keys:

```sql
SELECT dao_id, token_name, status, launched_at
FROM manager.daos
WHERE deployment_id = $1 AND dao_id = $2;
```

Deployment-wide discovery intentionally filters only the deployment. Marketplace listing reads also bind the Marketplace contract and listing event identity. Execution receipts additionally bind Treasury, Governor, proposal ID, and ordered action identities.

These are query/service isolation rules, not a claim of per-DAO PostgreSQL row-level security. The `app_server` role can read view schemas; keys alone do not prevent an incorrectly scoped query. `goldsky_writer` owns ingestion privileges, not application query authorization. See [grants](../db/README.md).

## SQL, Prisma, DTO, and RPC are different interfaces

- SQL uses `launched_ledger`, `launched_at`, `launched_tx_hash`. The DAO DTO maps these to legacy `finalized_*` fields.
- `marketplace_enabled` records the launch preference; live Marketplace `get_config().paused` is current pause state.
- `auction_enabled` reflects launch or later unpause; `auction_paused` is current indexed pause state.
- `indexed_at` on a DAO is its registry ingestion timestamp, not proof that every recent vote/listing has projected.
- `DaoConfig` is defined in [dao-db.ts](../apps/web/src/lib/dao-db.ts); network/client configuration is adapted in [dao-config.ts](../apps/web/src/lib/dao-config.ts).

Member/token list responses now expose bounded pagination, counts, and scoped
identities. Holder detail labels live versus indexed ownership; mutations recheck
live ownership. Treasury history reads existing `treasury.calls`, and claim
history reads indexed Minter events, separate from RPC claim eligibility. These
new consumers add no writable offchain application tables.

The lookup endpoint is `GET /api/dao/<daoId>` and returns `daoId`, `status`, `indexedAt`, not a full configuration response. Proposal detail and marketplace services combine scoped indexed rows with live contract reads. An unavailable read does not justify broadening the tenant query.

## Local workspaces

Creation drafts, artwork plans, and launch/home preferences use network, Manager, and wallet scope, with guest drafts supported. Proposal drafts use wallet/DAO scope. Marketplace favorites/private labels are browser-local and deployment-scoped, not wallet-private encrypted records. None are shared database rows, on-chain tags, or collaboration permissions. Clearing browser storage removes local data, not contracts or indexed events.
