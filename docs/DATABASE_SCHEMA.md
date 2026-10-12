# Database Schema

PostgreSQL read model for the Goldsky-indexed DAO deployment. Operational
guide, migrations and scripts: [`db/README.md`](../db/README.md). The Prisma
models in `apps/web/prisma/schema.prisma` map onto the views marked **Prisma**.

## Layers

1. **Landing tables** (written by Goldsky, append-only): `chain.raw_events`,
   `chain.decoded_events`, `app.activity_feed_events`.
2. **Views** (everything else): derive all state from `chain.decoded_events`
   through `chain.events`, which casts the text `topics`/`args` to jsonb with
   `chain.jsonb_safe` (a `\u0000` escape, which jsonb refuses, becomes
   U+FFFD; the decoder already replaces NUL in free text before the sink).

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

Every domain view reads `chain.events` (the decoded events with `t` = topics and
`a` = data as jsonb, `pos` = `chain.event_position(...)`, `closed_at`) or
`manager.module_events` (the same rows joined to their DAO through
`manager.event_identity`). "Latest" and "first" lookups order by `pos`, then
`event_id`. Views exist only for what the app reads or what a replay must be
able to answer; configuration the app reads from chain (auction and marketplace
settings, artwork definitions, the renderer, platform registry pointers) has no view.

### manager

| View | Reads | Notes |
| --- | --- | --- |
| `dao_registry` | `dao_created` | one row per DAO: deployer, launch admin, six module contracts, the six `<module>_wasm_hash` columns, `created_slug` (the slug requested at creation, not unique) |
| `dao_modules`, `event_identity`, `module_events` | registry | one row per module contract with its creation hash; contract → DAO lookup; every module event with its DAO |
| `dao_launches` | `dao_launched` | per launched DAO: `launch_auction`, `launch_marketplace`, `minter` (the shared Minter pinned at launch), `launched_*` |
| `dao_previous_slugs` **Prisma** | `slug_changed` | one row per slug a DAO moved away from, with its event position. Not reserved: the app redirects an old link only while no DAO holds it |
| `daos` **Prisma** | registry, `dao_launches`, `dao_created`/`pending_slug_updated` (request), `slug_claimed`/`slug_changed` (claimed), `token_initialized`/`metadata_updated`, token `admin_changed`, `profile_updated`, auction `paused`/`unpaused`, `marketplace_paused`/`unpaused` | `status` pending/operational; `slug` (claimed once launched, else requested; `slug_claimed`, `requested_slug`, `claimed_slug` disambiguate); `token_name`/`token_symbol`; `profile`, `profile_hash`, `profile_seq` (highest `seq` per Metadata contract, computed inline; the app shows `profile` only after hashing it and matching Metadata's on-chain `profile_hash()`); `admin_address` (launch admin, then the Treasury); `minter_contract`; `auction_enabled`, `auction_paused`, `marketplace_enabled` from the pause events after launch |
| `module_launches` **Prisma** | each module's `<module>_launched` | per DAO module: `is_live`, `treasury`, `started` (auction), `opened` (marketplace), `minters` (token) |
| `implementations` | `implementation_registered`, `implementation_revoked` | `name`, `version`, `published_ledger`, `revoked`, `revoked_ledger` |
| `module_versions` | `upgraded`, `migrated` (every module) + registry | per DAO module: `current_hash` (latest `to_hash`, else the creation hash), `current_version` (the registry version of `current_hash`, as the module's `version()` reads it), `storage_version`, `upgrade_count`, `last_upgraded_*`. `scripts/renew-code-ttl.mjs` reads `current_hash` |
| `settings` | `manager_initialized`, `admin_proposed`, `admin_proposal_cancelled`, `admin_changed`, `platform_minter_set`, `factory_paused`/`factory_unpaused` | one row per deployment: `admin`, `pending_admin` (NULL after an accept or a cancel), `platform_minter`, `factory_paused` (the contract has no getter; a pause blocks `create_dao`, `launch_dao` and `change_slug`) |

Not projected: `latest_implementation_set`, `current_implementations_updated`,
`upgrade_approved`, `manager_upgraded`, `upgrade_delay_changed` (the app reads
the registry pointers and the upgrade notice from chain; the last two are feed rows).

### token

| View | Reads | Notes |
| --- | --- | --- |
| `transfers` | `mint`, `transfer` | `transfer_type`, `from_address` NULL for mints |
| `inventory` **Prisma** | transfers | current owner per token |
| `delegate_state` | `delegate_changed`, `delegate_votes_changed` | latest delegate and voting power per address (the half of `members` that does not need the inventory) |
| `members` **Prisma** | inventory, `delegate_state` | owned count, delegate, voting power, `last_activity_ledger` (latest ledger of a held token); holders plus addresses that hold nothing but have a delegation |
| `mint_authorities` **Prisma** | `mint_authority_changed` | currently enabled authorities with `changed_by` (the Manager at launch, governance after) |
| `supply` **Prisma** | inventory + registry | per DAO: `minted_supply`, `system_held_supply` (held by the Treasury, Auction or Marketplace), `voting_supply` |
| `approvals`, `operator_approvals` | `approve`, `approve_for_all` | single-token approvals still in force (latest per token, not cleared, token not moved since) and collection-wide operator approvals (latest per owner and operator, not cleared); expiry against the current ledger is the reader's call |

Tokens held by the Treasury, Auction and Marketplace carry no votes: they appear
in `inventory` and `members` (with `voting_power` 0) but never emit
`delegate_votes_changed` for the system holder. `mint_with_minter` /
`mint_batch_with_minter` (who performed a mint) are feed rows only.

### governance

| View | Reads | Notes |
| --- | --- | --- |
| `proposal_votes` **Prisma** | `vote_cast` | `support` 0 against, 1 for, 2 abstain |
| `proposals` | `proposal_created` + `proposal_scheduled` + `proposal_queued`/`executed`/`cancelled` + votes | `vote_start_seconds`, `vote_end_seconds`, `quorum_votes`, `eta_seconds` (kept after execution), `state` (mirrors `Governor.proposal_state` from the clock, see below), `for_votes`/`against_votes`/`abstain_votes` |
| `settings` **Prisma** | `governor_initialized` + the five `*_changed` setters + `admin_changed` | current Governor configuration per DAO: `admin`, `voting_delay_seconds`, `voting_period_seconds`, `queue_delay_seconds`, `proposal_threshold`, `quorum_bps`, `updated_ledger` |
| `proposal_comments` **Prisma** | `proposal_commented` | event-only threads |

Execution: `Treasury.execute` is permissionless; it consumes the proposal on the
Governor (`proposal_executed`, same tx) and emits one `execute` per call
(`treasury.calls`). The call arguments live in the proposal's `proposal_created`
event (`app.proposal_detail.actions`), matched by `call_index`. OpenZeppelin's
`quorum_changed` is basis points and duplicates `quorum_bps_changed`; it is not read.

`snapshot_ledger` is the vote snapshot ledger; `vote_start_seconds` /
`vote_end_seconds` are unix timestamps and `quorum_votes` the For + Abstain total
needed, all from `proposal_scheduled` (quorum is fixed at proposal time). State:
executed/canceled from events; queued until `eta + 14d`, then expired; otherwise
pending before `vote_start`, active until `vote_end`, then succeeded (quorum met
and for > against) until `vote_end + 14d` and expired after, or defeated.

### auction, metadata, treasury, marketplace

| View | Reads |
| --- | --- |
| `auction.auctions` **Prisma** | `auction_created` + `auction.auction_state(...)`, a SQL function that finds the first `auction_settled`/`auction_cancelled` after the creation and the bids in between: `duration_seconds` (end - start), `highest_bidder`/`highest_bid`/`current_end_seconds`/`extension_count` (the latest bid is the highest and carries the end), `settled`/`cancelled` (booleans, never NULL: an open auction is false/false), `winner` (NULL when unsold), `settled_amount`, `closed_at`, `closed_transaction_hash` |
| `auction.current_auctions` **Prisma** | the newest `auction_created` per Auction contract with the same columns as `auctions`: one row per DAO, so the directory's "live auction" check never scans the history |
| `auction.bids` **Prisma** | `bid_placed` with its `comment` |
| `metadata.token_seeds` | `seed_generated` (single mint) and `seeds_generated` (one per batch, `selections[i]` is token `first_token_id + i`; batch rows share the event id); a token is seeded once |
| `treasury.calls` | `execute`: one row per action with `proposal_id`, `call_index` |
| `marketplace.primary_listings` **Prisma** | `primary_listing_created` closed by `primary_listing_purchased/cancelled/expired`; keyed by `listing_id`; `token_id` and `buyer` only once purchased |
| `marketplace.secondary_listings` **Prisma** | `secondary_listing_created` closed by `listing_purchased/cancelled/expired`; keyed by `token_id`; `seller`, `fee_bps`, `payment_asset`, `buyer` and `closed_*` once closed |
| `marketplace.sales` **Prisma** | primary and secondary purchases; `sale_type`, `listing_id` NULL for secondary, `seller`/`fee` NULL for primary |
| `marketplace.primary_listing_comments` **Prisma**, `marketplace.listing_comments` **Prisma** | event-only threads per primary listing and per token |

Auction refunds (`bid_refunded`, `refund_deferred`, `refund_withdrawn`) and the
auction/marketplace configuration setters are feed rows only; the app reads
`pending_refund` and `get_config` from chain.

### minter

The shared Minter has no view: its claims and batches are feed rows
(`minter.merkle_claim`, `minter.batch_mint`, `minter.merkle_root_set`) and the
claims page reads the round, root and tree URI from the Minter's ledger entries.

### app

| View | Notes |
| --- | --- |
| `activity_feed` **Prisma** | activity rows with `dao_id` resolved, one `UNION ALL` branch per source so a per-DAO filter pushes down: module events by contract; Minter claims by the DAO token in `token_id`; per-DAO Manager events (`dao_created`, `dao_launched`, `slug_claimed`, `pending_slug_updated`, `slug_changed`) by their `token_address` topic; platform events (`upgrade_delay_changed`, `manager_upgraded`, the Minter's `upgraded`/`migrated`/`upgrade_delay_changed`) fanned out to every DAO that existed at the time, and `implementation_revoked` to every DAO running that hash, with `activity_id` suffixed by the DAO; other Manager events with no DAO |
| `proposal_list` **Prisma** | `governance.proposals` with `proposal_number` |
| `proposal_detail` **Prisma** | `proposal_list` plus `actions` (`[{action_index, target, function, args}]` from `proposal_created`); votes come from `governance.proposal_votes` |
| `feed_status` **Prisma** | per deployment: `latest_ledger` of the feed and `last_hour_count` (feed rows in the last 720 ledgers), from the `(deployment_id, ledger_sequence)` index; the health endpoint reads this instead of the whole feed |
| `indexer_status` **Prisma** | latest ledger / event count / last ingestion, so the app never reads raw events |

## Activity kinds

`kind` is `<area>.<event>` (`governance.vote_cast`, `minter.merkle_claim`,
`marketplace.listing_purchased`, …), defined in
`packages/goldsky/src/activity-feed.script.js`. Events without a mapping get
`contract.<event_name>` and `system` visibility.

`visibility` curates the feed. **public/governance** rows are what a member acts
on: launches, proposals (created, queued, executed, cancelled), votes and comments,
real delegation, a rename or a new link, auctions (started, bid, settled,
cancelled), marketplace listings (opened, sold, cancelled, expired) and comments,
the Minter's claims, batches and claim rounds, profile updates (seq > 0), and
upgrades (module, Manager and Minter, the upgrade notice, a revoked
implementation). Their side effects are **admin/system**: per-token `mint` /
`mint_with_minter` / `mint_batch_with_minter` (the Minter's own row is the public
one), transfers, `delegate_votes_changed`, seeds, slug claims, setup and launch
internals, refunds, migrations, and the automatic self-delegation on a holder's
first token. Public feeds read only public and governance rows (the web formats
them into sentences, see `apps/web/src/lib/activity-feed.ts`); `userFacing` in
`packages/goldsky/src/activity-feed.script.js` is the source.

## Application boundaries

SQL lifecycle columns are `launched_*`; the DAO DTO maps them to `finalized_*`.
DAO `indexed_at` is first registry ingestion, not a per-mutation watermark.
The Marketplace API scopes listings by deployment/DAO/module/event identity and
reads live configuration before preparing trades. Past-expiry open listings may
display `awaiting-expiry`; terminal state still comes from contract events.

Indexed proposal state mirrors `Governor.proposal_state`, with `vote_start_seconds`
and `quorum_votes` from `proposal_scheduled`; proposal detail still rechecks live
chain state before enabling submission (indexed data cannot establish eligibility). Ordered execution
receipts read `treasury.calls` through a parameterized query
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
