# Database Schema

PostgreSQL read model for the Goldsky-indexed DAO deployment. Operational
guide, migrations and scripts: [`db/README.md`](../db/README.md). The Prisma
models in `apps/web/prisma/schema.prisma` map onto the views marked **Prisma**.

## Layers

1. **Landing tables** (written by Goldsky, append-only): `chain.raw_events`,
   `chain.decoded_events`, `app.activity_feed_events`.
2. **Domain/app views**: derive state/history from decoded events and activity rows.
   Migration bookkeeping and pipeline dynamic tables are separate.

All rows are scoped by `deployment_id` (`manager:<MANAGER_CONTRACT>`); DAO rows
by `dao_id` (the DAO token contract address).

## Event conventions

- `event_name` retains the incoming on-chain topic 0 symbol. Current SQL compares
  emitted snake_case names (`dao_created`, `vote_cast`, `merkle_claim_event`);
  decoder topic-lookup aliases do not normalize SQL event names.
- `topics` is a JSON object of the named topics after the name, e.g.
  `proposal_created` → `{"proposal_id": "<hex>", "proposer": "G…"}`.
- `args` is a JSON object of the event data fields.
- The decoder's topic names are tested against the Rust sources
  (`packages/goldsky/test/contract-alignment.test.mjs`).
- Tenant resolution: module contracts via `manager.event_identity`; the shared
  Minter via its `token_id` topic.
- `topics`/`args` are JSON objects stored as text and cast to JSONB in views.
- `chain.ledger_closed_at_ts` handles epoch milliseconds (current source format),
  epoch seconds, ISO text, and empty/NULL. Governance deadlines/ETA use seconds;
  snapshot values are ledger sequences, not timestamps.

## Views

### manager

| View | Reads | Notes |
| --- | --- | --- |
| `dao_registry` | `dao_created` | one row per DAO: `slug` (unique per Manager, enforced on-chain; NULL for pre-slug DAOs), deployer, launch admin, six module contracts, and the six `<module>_wasm_hash` columns from `dao_created.wasm_hashes` |
| `dao_modules` | registry | one row per module contract |
| `event_identity` | modules | contract → DAO lookup used by every domain view |
| `daos` **Prisma** | registry + `dao_launched`, `token_initialized`, metadata, auction `paused`/`unpaused` | `status` pending/operational; `auction_enabled`, `auction_paused`, `marketplace_enabled` (launch preference, not current pause), `token_description` |
| `module_launches` **Prisma** | each module's `launched` event | one row per DAO module (keyed by emitting contract, since six structs share the name `launched`): `is_live`, `treasury`, `started` (auction), `opened` (marketplace), `minters` (token) |
| `dao_lifecycle` | `dao_launched` + `module_launches` | per DAO: `is_live` (all six modules launched), `<module>_live`, `launch_auction`, `launch_marketplace`, `minter_enabled`, `auction_started`, `marketplace_opened` |
| `module_upgrades` | `upgraded`, `version_synced` (every module) | per DAO module: `event_type` (`upgraded`/`version_synced`), `module_role`, `contract_id`, `from_hash`/`to_hash` (NULL for `version_synced`), `version`, `event_seq`, ledger/tx/time |
| `module_versions` | `module_upgrades` + `dao_registry` | one row per DAO module: `current_hash` (latest `to_hash`, else the `dao_created` hash), `current_version` (latest `upgraded`/`version_synced`, NULL if none), `upgrade_count`, `last_upgraded_*` |
| `admin_history` | `admin_proposed`, `admin_proposal_cancelled`, `admin_changed`, `platform_minter_set` | deployment-wide; `event_type`, `previous_admin`, `new_admin`, `platform_minter` |
| `settings` | `manager_initialized` + admin events | current `admin`, `pending_admin` (NULL after an accept or a cancel), `platform_minter` per deployment |
| `implementations` | `implementation_registered`, `implementation_revoked` | `revoked`, `revoked_at` |
| `current_implementations` | `current_implementations_updated` | latest default implementation hashes |

### token

| View | Reads | Notes |
| --- | --- | --- |
| `transfers` | `mint`, `transfer` | `transfer_type`, `from_address` NULL for mints |
| `mints` | `mint_with_minter` | who performed each mint |
| `inventory` **Prisma** | transfers | current owner per token |
| `members` **Prisma** | inventory, `delegate_changed`, `delegate_votes_changed` | owned count, delegate, voting power |
| `delegations`, `mint_authority_history` | token events | history; `launch_grant` marks grants made by the Manager at launch (`changed_by` = manager); later changes are governance |
| `mint_authorities` **Prisma** | history | currently enabled authorities (set at launch, then only via governance) |

### governance

| View | Reads | Notes |
| --- | --- | --- |
| `proposals` | `proposal_created` + lifecycle + votes | `state`: pending, queued, executed, canceled, expired; `eta_seconds` kept after execution. `expired` is computed from the clock: queued and `now >= eta + 14d`, or never queued, `now >= vote_end + 14d` and for > against (quorum is not derivable, so a won-but-quorum-missed proposal also shows expired) |
| `proposal_votes` **Prisma** | `vote_cast` | `support` 0 against, 1 for, 2 abstain |
| `proposal_lifecycle` **Prisma** | queued / executed / cancelled | |
| `proposal_actions` | `proposal_created` | one row per call (parallel arrays unnested) |
| `proposal_execution_calls` | Treasury `execute` + `proposal_actions` | one row per executed call, scoped by deployment/DAO/module/proposal and ordered by `call_index`; carries `target`, `function`, `args`, tx |

Execution: `Treasury.execute` is permissionless; it consumes the proposal on the
Governor (`proposal_executed`, same tx) and emits one `execute` per call
(topics governor, target, proposal_id; data function, index). The Governor
authority role and its views (`governor_authority_*`) were removed together with
`governor_authority_changed`, `treasury_changed`, `token_contract_changed`
(Governor) and `governor_changed` (Treasury).

`snapshot_ledger` is the vote snapshot ledger; `vote_end_seconds` is the voting
deadline as a unix timestamp. The governor emits no vote start.

### auction, metadata, treasury, marketplace

| View | Reads |
| --- | --- |
| `auction.auctions` **Prisma** | `auction_created` + settlements/cancellations + config at creation time |
| `auction.bids` **Prisma**, `settlements`, `cancellations` | auction events (`winner` is NULL when no bids; `cancel_auction` also sends the unsold NFT to the treasury, visible in `token.transfers`) |
| `auction.bid_refunds` | `bid_refunded` (`refund_status` refunded) and `refund_deferred` (`deferred`, amount is the increment) |
| `auction.refund_withdrawals` | `refund_withdrawn` (topic `bidder`, no token) |
| `auction.pending_refunds` | per bidder: `deferred_amount`, `withdrawn_amount`, `pending_amount` = sum(deferred) - sum(withdrawn), rows with a positive balance only |
| `metadata.configuration` **Prisma** | `metadata_initialized` overlaid with the latest `*_updated` events |
| `metadata.properties` | `property_added` since the latest `properties_reset` |
| `metadata.token_seeds` | `seed_generated` (again on `regenerate`); `is_current` marks the latest seed per token |
| `treasury.calls` | `execute`: one row per call with `proposal_id`, `call_index` |
| `marketplace.primary_listings` **Prisma** | `primary_listing_created` closed by `primary_listing_purchased/cancelled/expired`; `listing_id`; `token_id` and `buyer` only once purchased; `payment_asset` |
| `marketplace.secondary_listings` **Prisma** | `secondary_listing_created` closed by `listing_purchased/cancelled/expired`; `token_id`; `seller`, `fee_bps`, `payment_asset` |
| `marketplace.purchases` | `listing_purchased` (secondary only) |
| `marketplace.sales` **Prisma** | primary purchases (`token_id` only exists in `primary_listing_purchased`) plus secondary purchases; `sale_type`, `listing_id` NULL for secondary |

`marketplace.listings` and its `kind` were replaced by the two listing views.

### minter

Shared contract; each view resolves `dao_id` from the `token_id` topic and drops
other tokens.

| View | Reads |
| --- | --- |
| `merkle_claim_events` **Prisma** | `merkle_claim_event` |
| `allowlist_claim_events` **Prisma** | `allowlist_claim_event` |
| `batch_mint_events` **Prisma** | `mint_batch_event` |
| `allocation_updates` | `merkle_root_set_event`, `allowlist_set_event` |

### app

| View | Notes |
| --- | --- |
| `activity_feed` **Prisma** | activity rows with `dao_id` resolved (manager events: none; Minter: via token) |
| `proposal_list` **Prisma**, `proposal_detail` **Prisma** | proposals with vote tallies; detail adds `actions` and `votes` JSON |
| `indexer_status` **Prisma** | latest ledger / event count / last ingestion, so the app never reads raw events |

## Activity kinds

`kind` is `<area>.<event>` (`governance.vote_cast`, `minter.merkle_claim`,
`marketplace.listing_purchased`, …), defined in
`packages/goldsky/src/activity-feed.script.js`. Events without a mapping get
`contract.<event_name>` and `system` visibility.

## Application boundaries

SQL lifecycle columns are `launched_*`; the DAO DTO maps them to `finalized_*`.
DAO `indexed_at` is first registry ingestion, not a per-mutation watermark.
The Marketplace API scopes listings by deployment/DAO/module/event identity and
reads live configuration before preparing trades. Past-expiry open listings may
display `awaiting-expiry`; terminal state still comes from contract events.

Proposal detail supplements indexed state/tallies with chain state, timing, and
quorum; indexed fallback cannot establish submission eligibility. Ordered execution
receipts read `governance.proposal_execution_calls` through a parameterized query
binding deployment, DAO, Treasury, Governor, and proposal ID. Complete matching
actions must share one transaction/ledger. Receipt absence is separate from failed
execution. See [web reference](../apps/web/README.md).

Browser-local drafts, home DAO, and private labels do not add writable application
tables. [Migrations](../db/migrations) define the full schema; Prisma is the app's
view subset, not a schema-migration owner.

Treasury history paginates execution calls (12/page) with deployment, DAO, Treasury
and Governor filters; it is not a funding/deposit ledger. Member/owner inventory
pages include total/hasMore and preserve counts/amounts as decimal strings where
specified. Auction history joins terminal auctions to scoped settlements and
distinguishes sold/unsold/canceled. Claim history does not establish current-round
eligibility; RPC allocation state and simulation do. New preparation endpoints
return unsigned transactions and do not mutate these views.
