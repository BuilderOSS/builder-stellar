# Database Schema

PostgreSQL read model for the Goldsky-indexed DAO deployment. Operational
guide, migrations and scripts: [`db/README.md`](../db/README.md). The Prisma
models in `apps/web/prisma/schema.prisma` map onto the views marked **Prisma**.

## Layers

1. **Landing tables** (written by Goldsky, append-only): `chain.raw_events`,
   `chain.decoded_events`, `app.activity_feed_events`.
2. **Views** (everything else): derive all state from `chain.decoded_events`.

All rows are scoped by `deployment_id` (`manager:<MANAGER_CONTRACT>`); DAO rows
by `dao_id` (the DAO token contract address).

## Event conventions

- `event_name` is the on-chain topic 0 symbol in snake_case (`dao_created`,
  `vote_cast`, `merkle_claim_event`).
- `topics` is a JSON object of the named topics after the name, e.g.
  `proposal_created` → `{"proposal_id": "<hex>", "proposer": "G…"}`.
- `args` is a JSON object of the event data fields.
- The decoder's topic names are tested against the Rust sources
  (`packages/goldsky/test/contract-alignment.test.mjs`).
- Tenant resolution: module contracts via `manager.event_identity`; the shared
  Minter via its `token_id` topic.

## Views

### manager

| View | Reads | Notes |
| --- | --- | --- |
| `dao_registry` | `dao_created` | one row per DAO: deployer, launch admin, six module contracts, the six `<module>_wasm_hash` columns from `dao_created.wasm_hashes`, and `created_slug` (the slug requested at creation, not unique) |
| `dao_slugs` **Prisma** | `dao_created`, `pending_slug_updated`, `slug_claimed` | per DAO: `requested_slug` (latest request, not unique), `claimed_slug` (unique and permanent, set by `launch_dao`; NULL while pending), `claimed_ledger`, `claimed_at` |
| `dao_modules` | registry | one row per module contract |
| `event_identity` | modules | contract → DAO lookup used by every domain view |
| `daos` **Prisma** | registry + `dao_slugs`, `dao_launched`, `token_initialized`, metadata, auction `paused`/`unpaused` | `status` pending/operational; `slug` (claimed slug once launched, else the requested one), `slug_claimed`, `requested_slug`, `claimed_slug`; `auction_enabled`, `auction_paused`, `token_description`; `admin_address` is the DAO's current admin: the token's latest `admin_changed` (the Treasury after launch), else the launch admin |
| `module_launches` **Prisma** | each module's `<module>_launched` event (`token_launched`, `governor_launched`, …) | one row per DAO module: `is_live`, `treasury`, `started` (auction), `opened` (marketplace), `minters` (token) |
| `module_admins` **Prisma** | module `admin_changed` + `dao_registry` | one row per DAO module: current `admin` (the launch admin, then the Treasury), `handed_to_treasury`, `changed_*` |
| `dao_lifecycle` | `dao_launched` + `module_launches` | per DAO: `is_live` (all six modules launched), `<module>_live`, `launch_auction`, `launch_marketplace`, `minter_enabled`, `auction_started`, `marketplace_opened` |
| `module_upgrades` | `upgraded`, `version_synced`, `migrated` (every module) | per DAO module: `event_type`, `module_role`, `contract_id`, `from_hash`/`to_hash` (upgraded only), `version`, `from_storage_version`/`to_storage_version` (migrated only), `event_seq`, ledger/tx/time |
| `module_versions` | `module_upgrades` + `dao_registry` | one row per DAO module: `current_hash` (latest `to_hash`, else the `dao_created` hash), `current_version` (latest `upgraded`/`version_synced`, NULL if none), `storage_version` (latest `migrated`, else 1), `upgrade_count`, `last_upgraded_*` |
| `admin_history` | Manager `admin_proposed`, `admin_proposal_cancelled`, `admin_changed`, `platform_minter_set` | deployment-wide; `event_type`, `previous_admin`, `new_admin`, `platform_minter` (module `admin_changed` events are in `module_admins`) |
| `settings` | `manager_initialized` + admin events | current `admin`, `pending_admin` (NULL after an accept or a cancel), `platform_minter` per deployment |
| `implementations` | `implementation_registered`, `implementation_revoked` | `published_ledger`, `revoked`, `revoked_ledger` |
| `latest_implementations` | `latest_implementation_set` | admin-selected latest `wasm_hash` and `version` per `name` (registration does not move it) |
| `current_implementations` | `current_implementations_updated` | latest default implementation hashes |

### token

| View | Reads | Notes |
| --- | --- | --- |
| `transfers` | `mint`, `transfer` | `transfer_type`, `from_address` NULL for mints |
| `mints` | `mint_with_minter` (single mint) and `mint_batch_with_minter` (one per `batch_mint`, expanded over its id range and joined to each token's `mint` for the recipient and event id) | who performed each mint, one row per token |
| `inventory` **Prisma** | transfers | current owner per token |
| `members` **Prisma** | inventory, `delegate_changed`, `delegate_votes_changed` | owned count, delegate, voting power |
| `delegations`, `mint_authority_history` | token events | history; `launch_grant` marks grants made by the Manager at launch (`changed_by` = manager); later changes are governance |
| `mint_authorities` **Prisma** | history | currently enabled authorities (set at launch, then only via governance) |
| `supply` **Prisma** | inventory + registry | per DAO: `minted_supply`, `system_held_supply` (held by the Treasury, Auction or Marketplace), `voting_supply` (the supply quorum is computed from) |

Tokens held by the Treasury, Auction and Marketplace carry no votes: they appear
in `inventory` and `members` (with `voting_power` 0) but never emit
`delegate_votes_changed` for the system holder.

### governance

| View | Reads | Notes |
| --- | --- | --- |
| `proposals` | `proposal_created` + `proposal_scheduled` + lifecycle + votes | `vote_start_seconds`, `vote_end_seconds`, `quorum_votes`; `state` mirrors `Governor.proposal_state`: pending, active, succeeded, defeated, queued, executed, canceled, expired (computed from the clock; see below); `eta_seconds` kept after execution |
| `proposal_votes` **Prisma** | `vote_cast` | `support` 0 against, 1 for, 2 abstain |
| `proposal_lifecycle` **Prisma** | queued / executed / cancelled | |
| `proposal_actions` | `proposal_created` | one row per call (parallel arrays unnested) |
| `settings` **Prisma** | `governor_initialized` + `voting_delay_changed` / `voting_period_changed` / `queue_delay_changed` / `proposal_threshold_changed` / `quorum_bps_changed` + `admin_changed` | current Governor configuration per DAO: `admin`, `voting_delay_seconds`, `voting_period_seconds`, `queue_delay_seconds`, `proposal_threshold` (absolute votes), `quorum_bps` (of the voting supply at each snapshot), `version`, `updated_ledger` |
| `proposal_execution_calls` | Treasury `execute` + `proposal_actions` | one row per executed call, ordered by `call_index`, keyed by `proposal_id`; carries `target`, `function`, `args`, tx |

Execution: `Treasury.execute` is permissionless; it consumes the proposal on the
Governor (`proposal_executed`, same tx) and emits one `execute` per call
(topics governor, target, proposal_id; data function, index). The Governor
authority role and its views (`governor_authority_*`) were removed together with
`governor_authority_changed`, `treasury_changed`, `token_contract_changed`
(Governor) and `governor_changed` (Treasury).

`snapshot_ledger` is the vote snapshot ledger; `vote_start_seconds` /
`vote_end_seconds` are unix timestamps and `quorum_votes` the For + Abstain total
needed, all from `proposal_scheduled` (quorum is fixed at proposal time). State:
executed/canceled from events; queued until `eta + 14d`, then expired; otherwise
pending before `vote_start`, active until `vote_end`, then succeeded (quorum met
and for > against) until `vote_end + 14d` and expired after, or defeated.

### auction, metadata, treasury, marketplace

| View | Reads |
| --- | --- |
| `auction.auctions` **Prisma** | `auction_created` + settlements/cancellations + config at creation time |
| `auction.bids` **Prisma**, `settlements`, `cancellations` | auction events (`winner` is NULL when no bids; `cancel_auction` also sends the unsold NFT to the treasury, visible in `token.transfers`) |
| `auction.bid_refunds` | `bid_refunded` (`refund_status` refunded) and `refund_deferred` (`deferred`, amount is the increment) |
| `auction.refund_withdrawals` | `refund_withdrawn` (topic `bidder`, no token) |
| `auction.pending_refunds` | per bidder: `deferred_amount`, `withdrawn_amount`, `pending_amount` = sum(deferred) - sum(withdrawn), rows with a positive balance only |
| `metadata.configuration` **Prisma** | `metadata_initialized` overlaid with the latest `*_updated` events; `admin` is the metadata module's current admin (launch admin, then the Treasury) |
| `metadata.properties` | `property_added` since the latest `properties_reset` |
| `metadata.token_seeds` | `seed_generated` (single mint and `regenerate`) and `seeds_generated` (one per batch, `selections[i]` is token `first_token_id + i`; batch rows share the event id); `is_current` marks the latest seed per token across both |
| `treasury.calls` | `execute`: one row per action with `proposal_id`, `call_index` (`authorize` actions appear with function `authorize`) |
| `marketplace.primary_listings` **Prisma** | `primary_listing_created` closed by `primary_listing_purchased/cancelled/expired`; keyed by `listing_id`; `token_id` and `buyer` only once purchased; `payment_asset` |
| `marketplace.secondary_listings` **Prisma** | `secondary_listing_created` closed by `listing_purchased/cancelled/expired`; keyed by `token_id`; `seller`, `fee_bps`, `payment_asset` |
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
| `activity_feed` **Prisma** | activity rows with `dao_id` resolved (per-DAO Manager events such as `dao_launched` via their `token_address` topic, other Manager events none; Minter via token) |
| `proposal_list` **Prisma**, `proposal_detail` **Prisma** | proposals with vote tallies; detail adds `actions` and `votes` JSON |
| `indexer_status` **Prisma** | latest ledger / event count / last ingestion, so the app never reads raw events |

## Activity kinds

`kind` is `<area>.<event>` (`governance.vote_cast`, `minter.merkle_claim`,
`marketplace.listing_purchased`, …), defined in
`packages/goldsky/src/activity-feed.script.js`. Events without a mapping get
`contract.<event_name>` and `system` visibility.

`visibility` curates the feed. **public/governance** rows are what a member acts
on: launches, proposals (created, queued, executed, cancelled), votes, real
delegation, auctions (started, bid, settled, cancelled), marketplace listings and
sales, allocations (`mint_batch_with_minter`, Minter claims and batches), and
upgrades. Their side effects are **admin/system**: per-token `mint` /
`mint_with_minter`, transfers, `delegate_votes_changed`, seeds, slug claims,
setup and launch internals, refunds, listing cancellations, and the automatic
self-delegation on a holder's first token. Public feeds read only public and
governance rows (the web formats them into sentences, see `apps/web/src/lib/activity-feed.ts`).

## Application boundaries

SQL lifecycle columns are `launched_*`; the DAO DTO maps them to `finalized_*`.
DAO `indexed_at` is first registry ingestion, not a per-mutation watermark.
The Marketplace API scopes listings by deployment/DAO/module/event identity and
reads live configuration before preparing trades. Past-expiry open listings may
display `awaiting-expiry`; terminal state still comes from contract events.

Indexed proposal state mirrors `Governor.proposal_state`, with `vote_start_seconds`
and `quorum_votes` from `proposal_scheduled`; proposal detail still rechecks live
chain state before enabling submission (indexed data cannot establish eligibility). Ordered execution
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
