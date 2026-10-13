# Goldsky Indexer for Stellar DAO

PostgreSQL-backed event indexer for Stellar DAO using Goldsky Turbo Pipelines.

This package owns the Goldsky pipeline source, generator, tests, and deployment scripts. The
deployed pipeline is a Goldsky **Turbo** pipeline named `builder-stellar-<network>`
(`builder-stellar-testnet` today); `pnpm generate` writes that name into the YAML, so the file is
applied as is (`goldsky turbo apply`). The legacy `goldsky pipeline ...` commands do not see it.

## Quick Start

### 1. Setup Environment

```bash
cp .env.example .env
# Point MANAGER_DEPLOYMENT_FILE at the Manager artifact; install and log in to the Goldsky CLI:
# curl https://goldsky.com | sh && goldsky login
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

Read by `pnpm generate` and `scripts/deploy.sh` from `.env` / `.env.local` (or the shell):

- `MANAGER_DEPLOYMENT_FILE` (required) - the Manager deployment artifact, relative to the repo root
- `GOLDSKY_POSTGRES_SECRET` - name of the Goldsky secret holding the `goldsky_writer` Postgres
  credentials (default `DAO_POSTGRES`). The secret is created once in Goldsky
  (`goldsky secret create`); no database credential is written into the YAML or read here.
- `GOLDSKY_START_AT` - start ledger, only when the artifact has no `deploymentLedger`
  (it overrides the artifact when set)
- `GOLDSKY_PIPELINE_NAME` - pipeline name override (default `builder-stellar-<network>`)

The Goldsky CLI authenticates with `goldsky login`; no API key variable is used. Database
migrations use `DATABASE_URL` from `db/README.md`, not this package.

### Manager Deployment

Set `MANAGER_DEPLOYMENT_FILE` to the Manager deployment artifact, for example:

```env
MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json
```

The artifact supplies the Manager address, the network and the starting ledger; if it has no starting ledger, set `GOLDSKY_START_AT` explicitly. The Manager is the only configured contract: every DAO contract enters the `streamling.dao_*` allowlists from events (see [Allowlists](#allowlists)), so a new DAO or module never needs a regenerate.

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
# Validate pipeline configuration (goldsky turbo validate)
./scripts/deploy.sh validate

# Apply the pipeline (goldsky turbo apply; creates or updates in place)
./scripts/deploy.sh deploy

# List the deployed Turbo pipelines
./scripts/deploy.sh status

# Tail pipeline logs
./scripts/deploy.sh logs

# Delete pipeline
./scripts/deploy.sh delete

# Redeploy (delete + apply; see the checklist below first)
./scripts/deploy.sh redeploy
```

### Redeploy checklist

The landing tables are immutable and the `streamling.dao_*` allowlists persist across pipelines, so
any change to a transform's output (kinds, summaries, actors, addresses) or a new Manager is a full
replay (details in [`db/README.md`](../../db/README.md)):

1. `./scripts/deploy.sh delete` (the pipeline must be stopped before the schema drop)
2. `DROP SCHEMA streamling CASCADE;` then `db/reset-database.sh --yes && db/migrate.sh && db/grant-permissions.sh`
3. `pnpm generate && ./scripts/deploy.sh deploy`
4. Verify as an admin role once the replay has caught up:
   - `SELECT count(*) FROM chain.decoded_events WHERE contract_role = 'unknown'` → 0
   - `SELECT count(*) FROM chain.decoded_events WHERE topics = '{}' AND topic_0 <> ''` → 0
     (host system events such as `executable_update` are dropped by `type = 'contract'`; the
     testnet tables held 13 of them from before that filter)
   - `SELECT count(*) FROM app.activity_feed_events WHERE kind LIKE 'contract.%'` → 0. `module.%` rows
     are expected only for modules registered under a kind the decoder doesn't know (`custom_<name>`); they
     carry positional `topic_N` / `arg_N` fields
   - raw, decoded and feed row counts are equal
   - module roles resolve: `SELECT kind, address FROM manager.dao_modules` lists each DAO's registry, and
     events from those addresses decode with that role (`SELECT contract_role, count(*) FROM
     chain.decoded_events GROUP BY 1`)

## Pipeline Architecture

The generator reads deployment configuration and transform scripts, then writes
`pipelines/builder-stellar-events.yaml`:

```
Stellar Network
    ↓
Goldsky Indexer (stellar_events source)
    ↓
allowlists (dynamic tables: dao_tokens, dao_metadata, dao_governors, dao_treasuries,
            dao_auctions, dao_marketplaces, dao_claims, dao_circles, dao_modules)
    ↓
dao_events transform (the Manager and every allowlisted address; contract_role)
    ↓
raw_events transform (normalize the envelope)
    ↓
decoded_events transform (decode XDR-JSON topics and data)
    ↓
activity_feed transform (user-friendly summaries)
    ↓
PostgreSQL (Neon) destination
```

### Allowlists

A Goldsky SQL transform can look outside the stream only through `dynamic_table_check(table, value)`, a
membership test on one key column. So a contract's role is the table that holds its address, filled in two
stages (docs/designs/membership-models.md § 7):

1. **The core four** come from the Manager's `DaoCreated`: `dao_tokens`, `dao_metadata`, `dao_governors`,
   `dao_treasuries`, one table each.
2. **Modules the Manager deployed** come from its `DaoCreated` (`modules.<kind>`) and `ModuleCreated`
   (`create_module`), each into its kind's table: `dao_auctions`, `dao_marketplaces`, `dao_claims`,
   `dao_circles` (empty until the Manager can build a Circle). A known role therefore means the Manager
   deployed the code.
3. **Any other registered contract** comes from the Token's `ModuleRegistered`, admitted only when the
   emitting Token is already in `dao_tokens` (`dynamic_table_check('dao_tokens', contract_id)` inside the
   table's own SQL), into the catch-all `dao_modules` only, whatever kind it was registered under. The role
   CASE tries the kind tables first, so such a contract is role `module`: indexed for its DAO, admin rows
   only, and outside the domain views.

Every module table repeats its extraction in a `<> ''` filter: a `DaoCreated` without a module kind has
`"val":"void"` there, which the pattern doesn't match, and the guard drops the row whether `regexp_extract`
returns `''` or `NULL`. Goldsky's validator refuses a dynamic table that reads an intermediate SQL transform,
so every table reads `stellar_events` directly.

Tables are append-only: an unregistered module stays allowlisted, and the read model drops its later events by
registration window (`manager.module_events`). Allowlisting is per registration, so any contract a DAO
registers by vote gets its events indexed under that DAO as admin rows (an accepted risk; the remedy is
unregistering it by vote, or deleting its row from `streamling.dao_modules` and re-applying the pipeline,
SECURITY_MODEL). A shared or dual-kind module (one address
registered by two DAOs, or under two kinds) is indexed once; its role is the first matching table in the
`dao_events` CASE, and the windowed views attribute its events to each DAO for the time it was registered there.

### Pipeline Outputs

- `chain.raw_events` - Raw Goldsky events with XDR-JSON
- `chain.decoded_events` - Decoded events with structured fields
- `app.activity_feed_events` - User-friendly activity feed rows
- everything else (`app.activity_feed`, `manager.daos`, `governance.proposals`, `token.members`, ...) is a PostgreSQL view over these tables; see `docs/DATABASE_SCHEMA.md`

## Event Coverage

The decoder names the topics of every event the contracts emit (Manager, Token,
Governor, Treasury, Auction, Metadata, Marketplace, ClaimMinter) plus the OpenZeppelin
library events they publish (NFT transfers/mints, votes, governor lifecycle,
pausable; the admin handoff is the common `AdminChanged` event). An event it doesn't
know, from a module registered outside the Manager, is still decoded: its topics and
data land positionally as `topic_N` / `arg_N` (`decoder_version` `v3`), and the feed
row is `module.<event>` (admin).

`pnpm validate` (and `test/contract-alignment.test.mjs`) parse
`contracts/*/src/events.rs` and fail if the decoder's `topicNames` differ from the
real topic order, or if the decoder lists an event nothing emits.
`test/event-coverage.test.mjs` pins the removed-event list (`test/removed-events.mjs`)
and checks that the checked-in pipeline embeds the current scripts; the contract
sources are the only inventory of live events (there is no hand-kept list to update).

### Decoded shape

`chain.decoded_events` stores `event_name`, `topic_0..3`, `topics` (JSON object keyed by
topic name) and `args` (JSON object of the data fields). Token identifiers can live in
`topics` while `args` is `{}`, so consumers (and `activity-feed.script.js`) must search
topics and args independently. `event_name` is the on-chain topic-0 symbol, the snake_case
struct name `#[contractevent]` emits (`token_launched`); the decoder normalizes it only for the
topic lookup, and the views match it exactly.

### Same-named events: `AdminChanged`

`AdminChanged { old_admin, new_admin }` is emitted by the Manager (its own admin
handover) and, defined once in `contracts/common/src/admin.rs` with the same shape, by
every DAO module at launch (launch admin -> Treasury). The decoder keys on the name; the
emitting module is identified by `contract_id` / `contract_role`, so the unique key is
(contract, event name). `contractEventList()` and `contractEventsByContract()`
(`token:AdminChanged`, `manager:AdminChanged`, ...) expose this, and same-named events must
share topics (enforced by `contractEvents()`). Each module's launch event has its own name
(`TokenLaunched`, `GovernorLaunched`, `TreasuryLaunched`, `AuctionLaunched`,
`MarketplaceLaunched`, `MetadataLaunched`).

### Event changes from the hardened contracts

| Event | Contract | Topics | Data | Change |
|---|---|---|---|---|
| `<Module>Launched` | every module | `treasury` | token `grants` (`[{module, allowance}]`); auction `started`; marketplace `opened`; others none | replaces the shared `Launched` |
| `AdminChanged` | every module (common) and manager | `old_admin`, `new_admin` | none | module launch handoff to the Treasury; replaces OpenZeppelin `Ownership*` events |
| `Migrated` | every module (common) | none | `from_storage_version`, `to_storage_version` | new (storage-layout migration) |
| `ProposalScheduled` | governor | `proposal_id` | `vote_start`, `vote_end`, `snapshot_ledger`, `quorum_votes` | new; same tx as `ProposalCreated` |
| `PendingSlugUpdated` | manager | `token_address` | `slug` | new |
| `SlugClaimed` | manager | `token_address`, `slug` | none | new; emitted by `launch_dao` (`DaoCreated.slug` is only the request) |
| `LatestImplementationSet` | manager | `name`, `wasm_hash` | `version` | new |
| `UpgradeDelayChanged` | manager | none | `from_ledgers`, `to_ledgers`, `effective_ledger` | new; public row, a reduction is in force from `effective_ledger` |
| `TokenInitialized` / `GovernorInitialized` / `TreasuryInitialized` / `AuctionInitialized` | modules | `admin` | unchanged | topic renamed from `owner` |
| `MarketplaceInitialized` | marketplace | `token`, `admin` | unchanged | `admin` topic added |
| `*Changed` (governor setters) | governor | `changed_by` | `old_value`, `new_value` | topic renamed from `caller` |
| `PaymentAssetUpdated` / `SecondaryFeeUpdated` / `MarketplacePaused` / `MarketplaceUnpaused` | marketplace | `changed_by` | unchanged | `changed_by` topic added |
| `ManagerInitialized` / `ImplementationRegistered` / `UpgradeApproved` / `ImplementationRevoked` / `ManagerUpgraded` | manager | unchanged | `*_ledger` replaces `*_at` | fields hold ledger numbers |
| `MintAllowanceChanged` | token | `module` | `old_allowance`, `allowance`, `changed_by` | per grant at launch; `4294967295` is unlimited; replaces `MintAuthorityChanged` |
| `ModuleRegistered` | token | `kind` | `address`, `non_voting` | public; drives the module allowlists |
| `ModuleUnregistered` | token | `kind` | `address` | public; closes the module's registration window |
| `DaoLaunched` | manager | `token_address` | `launched_ledger`, `modules`, `launch_auction`, `launch_marketplace`, `registry` | `registry` (the Token's module entries at launch) replaces `minter` (0.4.0) |
| `AdminProposed` | manager | `current_admin`, `proposed_admin` | none | new |
| `Execute` | treasury | `governor`, `target`, `proposal_id` | `function`, `index` | `proposal_id` topic and `index` added; one event per call |
| `ProposalExecuted` | governor | `proposal_id` | none | now emitted inside `consume` (same tx as `Execute`s) |
| `RefundDeferred` | auction | `token_id`, `bidder` | `amount` (increment) | new |
| `RefundWithdrawn` | auction | `bidder` | `amount` | new |
| `MintBatchWithMinter` | token | `minter` | `first_token_id`, `count` | new; one per `batch_mint` instead of `MintWithMinter` per token (single `mint` still emits `MintWithMinter`) |
| `SeedsGenerated` | metadata | `first_token_id` | `count`, `num_properties`, `selections` (one `[num_properties, idx...]` per token) | new; one per batch instead of `SeedGenerated` per token (`on_minted` / `regenerate` still emit `SeedGenerated`) |
| `SecondaryListingCreated` | marketplace | `token_id` | `seller`, `price`, `expires_at`, `fee_bps`, `payment_asset` | `payment_asset` added |
| `ListingPurchased` / `ListingCancelled` / `ListingExpired` | marketplace | `token_id` (+`buyer`) | unchanged | secondary only |
| `Upgraded` | token, governor, treasury, metadata and every module (defined once in `contracts/common/src/upgrade.rs`) | `from_hash`, `to_hash` | `version` | new; replaces marketplace-only `MarketplaceUpgraded`; public activity row `<role>.upgraded` (`governance.upgraded` for the governor; "Contract upgraded to version V (from -> to)", hashes shortened to 8 chars) |
| `ProfileUpdated` | metadata | `seq` | `hash`, `profile` | new (0.3.0); the profile JSON lives only here. Public activity row except seq 0 (the initial profile, admin) |
| `MetadataInitialized` | metadata | `token` | `renderer_base`, `admin` | description, project URI and contract image removed (0.3.0) |
| `AdminProposalCancelled` | manager | `current_admin`, `cancelled_admin` | none | new; admin activity row `manager.admin_proposal_cancelled` |
| `DaoCreated` | manager | `token_address`, `deployer`, `launch_admin` | `created_ledger`, `modules`, `wasm_hashes`, `slug` | `modules` and `wasm_hashes` decode to nested objects in `args`; since 0.4.0 `auction`, `marketplace` and `claims` are optional (null when the DAO has no such module) |
| `PropertiesReset` | metadata | none | `old_num_properties` | renamed from `num_properties` |
| removed (0.3.0) | `VersionSynced` (versions follow the registry); metadata `DescriptionUpdated`, `ProjectURIUpdated`, `ContractImageUpdated`; Minter `AllowlistSetEvent`, `AllowlistClaimEvent` | | | no longer emitted or decoded |
| removed (0.4.0) | `MintAuthorityChanged`, `PlatformMinterSet`; the shared Minter's `MerkleClaimEvent`, `MintBatchEvent`, `MerkleRootSetEvent`; marketplace `PrimaryListingCreated`, `PrimaryListingPurchased`, `PrimaryListingCancelled`, `PrimaryListingExpired`, `PrimaryListingCommented` | | | no longer emitted or decoded (`test/removed-events.mjs`) |
| removed | shared `Launched`; OpenZeppelin `OwnershipTransfer`, `OwnershipTransferCompleted`, `OwnershipRenounced`; marketplace `MarketplaceUpgraded`; governor `TreasuryChanged`, `TokenContractChanged`, `GovernorAuthorityChanged`; treasury `GovernorChanged`; auction `TreasuryUpdated` | | | no longer emitted or decoded |

### Event changes for membership models (0.4.0)

| Event | Contract | Topics | Data | Feed |
|---|---|---|---|---|
| `TokenInitialized` | token | `admin` | `name`, `symbol`, `settings` | `settings` holds the three switches at creation |
| `TransfersLockChanged` / `MembersOnlyDelegationChanged` / `DaoRecoveryChanged` | token | none | `locked` / `enabled`, `changed_by` | public |
| `TransferAgentChanged` | token | `module` | `enabled`, `changed_by` | public |
| `AgentTransfer` | token | `agent` | `from`, `to`, `token_id` | admin, beside the OpenZeppelin `Transfer` |
| `DaoTransfer` | token | `from`, `to` | `token_id`, `changed_by` | public: a membership moved by vote |
| `ModuleCreated` | manager | `token_address`, `kind` | `n`, `address` | admin (the Token's `ModuleRegistered` is the public row); drives the module allowlists |
| `AssuranceOpened` | manager | `token_address` | `claim_minter`, `list_id`, `deadline`, `launch_auction`, `launch_marketplace` | public |
| `SlugReleased` | manager | `token_address`, `slug` | none | public; frees a failed drive's slug |
| `CurrentImplementationsUpdated` | manager | none | the seven hashes, `claims` included | admin |
| `PoolOpened` | marketplace | `pool_id` | `price`, `asset`, `expires_at`, `size`, `max_per_buyer`, `max_sold_per_period`, `period_secs` | public |
| `PoolRestocked` | marketplace | `pool_id` | `first_token_id`, `count`, `stocked` | admin |
| `PoolPurchased` | marketplace | `pool_id`, `buyer` | `token_id`, `price`, `asset` | public |
| `PoolClosed` / `PoolSwept` | marketplace | `pool_id` | `released` / `count`, `pages_left` | public / admin |
| `ListOpened` | claims | `list_id` | `root`, `tree_uri`, `asset`, `price`, `expires_at`, `total`, `assurance` | public |
| `Claimed` | claims | `list_id`, `claimer` | `amount`, `first_token_id`, `paid`, `escrowed` (bool), `claimed` | public |
| `EscrowReleased` / `Refunded` | claims | `list_id` (+`claimer`) | `treasury`, `amount` / `amount` | public / admin (a refund is a per-claimer side effect) |
| `ClaimMinterLaunched` | claims | `treasury` | none | admin, like every `<role>.launched` |

The ClaimMinter's role is `claims` (crate `contracts/minter`, `CRATE_ROLES` in `src/contract-events.mjs`), so
its kinds are `claims.<event>`.

### Common-crate events

The contract-event parser also scans `contracts/common/src/*.rs` and lists each event there once
per emitting role (`source: 'common'`), from `COMMON_EVENT_EMITTERS` in `src/contract-events.mjs`:
`AdminChanged`, `Upgraded` and `Migrated` for every DAO contract and module role (`claims` included);
`UpgradeDelayChanged` for the Manager only. The decoder keys on
name only: the emitting contract is `contract_id` / `contract_role`.

### Activity feed labels

User-visible (`public`) items include `marketplace.pool_purchased` ("Token N bought from pool P
for X"), `claims.claimed` and the membership switches, beside the existing `manager.dao_launched`; refunds (`auction.refund_*`) and `manager.slug_claimed` are `admin`.
`Execute` rows are `admin` and read "Executed fn on target (call i of proposal id)".
Per-module launch rows are `admin` with kind `<role>.launched`; module `AdminChanged` rows are
`<role>.admin_changed` ("Token admin handed to the Treasury"), `Migrated` rows
`<role>.migrated`, `ProposalScheduled` `governance.proposal_scheduled` (admin, it accompanies
`ProposalCreated`); OpenZeppelin `QuorumChanged` is `governance.quorum_changed` (admin; it
duplicates the constructor quorum and every `QuorumBpsChanged`); OpenZeppelin `Paused` / `Unpaused`
from the Auction are `auction.paused` / `auction.unpaused`; a batch mint is one admin `token.batch_mint` row ("Minted 5 tokens (30-34) by
minter") plus one admin `metadata.seeds_generated` row, not one row per token, and the module's own
row in the same call (`claims.claimed`, `marketplace.pool_restocked`) tells the story; Manager admin changes
(`manager.admin_proposed`, `manager.admin_changed`) and `marketplace.paused` are `admin`; listing cancellations
and expiries (`marketplace.listing_cancelled`, `marketplace.listing_expired`) and `marketplace.pool_closed` are
`public`, like the listing itself. A module's `Upgraded` / `Migrated` are `<role>.upgraded` /
`<role>.migrated`. Visibility also follows the module: every event from a module under the catch-all `module`
role or the reserved `circle` role is `admin`, since the platform didn't write its code, and an event name no
known contract owns there is shown under the module's own kind rather than another contract's (`unvouched`,
`foreignModule` in `src/activity-feed.script.js`). The governor's
role-based kinds use the `governance.` prefix like its other kinds. `activity_feed_events`
columns are unchanged; `listing_id` and `index` are only in `topics`/`args`. `addresses` holds every
address field the event carries (accounts, then module, token and payment-asset contracts, the
emitting contract last). `actor` is the account that acted: the caller (`changed_by`, `admin`)
before the subject (`authority`) or a module contract, and empty for `DaoLaunched`.

**Public feed curation.** Only story events are `public`/`governance`: launches,
proposals and votes, real delegation, auctions (started, bid, settled, cancelled),
marketplace listings, pools and sales, claim lists and claims, membership switches and DAO transfers, and
upgrades. Per-token
`Mint`/`MintWithMinter`/`MintBatchWithMinter`, transfers, vote-weight changes, seeds, slug claims,
setup/launch internals, refunds and the automatic
self-delegation on a first token (`from_delegate` empty, `to_delegate` =
delegator) are `admin`/`system`. See `userFacing` in `src/activity-feed.script.js`.

## Data Access Layer

The app reads the views through `apps/web/src/lib/goldsky.ts`. Every query is scoped to one DAO
(`daoId` first), for example:

```typescript
await getGoldskyActivityFeed(daoId, { limit: 25 })
await getGoldskyProposalList(daoId, { limit: 24 })
await getGoldskyProposalDetail(daoId, proposalId)
await getGoldskyProposalVotes(daoId, proposalId)
await getGoldskyProposalComments(daoId, proposalId)
await getGoldskyAuctionHistory(daoId)
await getGoldskyAuctionBids(daoId, tokenId)
await getGoldskyClaims(daoId, { limit: 20, offset: 0 })
await getDashboardData(address)
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
│   └── deploy.sh                   # goldsky turbo validate/apply/list/logs/delete
├── test/                           # unit, contract-alignment and DB integration tests
├── .env / .env.local               # your configuration (gitignored)
└── package.json
```

### Adding New Events

1. Add the event's topics to `topicNames` in `src/decoded-events.script.js` (checked against the contracts) and update the role fallback if needed
2. Update `src/activity-feed.script.js` with kind/title/summary/visibility
3. Add or update views if the read model needs it (new migration in `db/migrations/`)
4. Add a test in `test/dao-events-transform.test.mjs` (add removed names to `test/removed-events.mjs`). `test/every-event.test.mjs` already runs every `#[contractevent]` through the decoder and the activity transform and fails on a missing kind, title or topic name, or a summary with a hole; a library event needs its emitting role in `LIBRARY_ROLES` there.
5. Run `pnpm test && pnpm validate`
6. Regenerate (`GOLDSKY_START_AT=<ledger> pnpm generate` when the artifact has no ledger) and replay (Redeploy checklist above). The checked-in pipeline test fails if it is stale.

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
./scripts/deploy.sh validate  # goldsky turbo validate
goldsky login                  # CLI session
goldsky secret list            # the Postgres secret named in the YAML must exist
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
