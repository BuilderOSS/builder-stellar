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
  `vote_cast`, `pool_purchased`).
- `topics` is a JSON object of the named topics after the name, e.g.
  `proposal_created` → `{"proposal_id": "<hex>", "proposer": "G…"}`.
- `args` is a JSON object of the event data fields.
- The decoder's topic names are tested against the Rust sources
  (`packages/goldsky/test/contract-alignment.test.mjs`).
- Tenant resolution: every DAO contract via `manager.event_identity`, the core
  four from `dao_created` on and each module inside its registration window
  (`manager.module_registrations`). Positions compare as `pos` =
  `[ledger, tx, op, evt]`; a window opens at `[ledger, tx, -1, -1]`, so the
  registering transaction's own events (a module's constructor) count.
- An event the decoder doesn't know (a module deployed outside the Manager) has
  positional `topic_N` / `arg_N` keys.

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
| `dao_registry` | `dao_created` | one row per DAO: deployer, launch admin, the core four contracts and what `create_dao` deployed for `auction`, `marketplace`, `claims` (NULL for a kind it didn't), each `<kind>_wasm_hash`, `created_slug` (the slug requested at creation, not unique). `manager.module_role()` maps a registry kind to its role |
| `manager_modules` | registry, `module_created`, `current_implementations_updated` | every module this deployment's Manager deployed: `kind`, `contract_id`, `wasm_hash` (from `dao_created`, else the current implementation when `create_module` ran) |
| `module_registrations` | `module_registered`, `module_unregistered`, `manager_modules` | one row per registration window of a module on a DAO's Token: `kind` (as registered), `module_role` (the kind the Manager deployed it as, else `module`, matching the pipeline's allowlists), `module_contract`, `non_voting`, the window (`from_pos`, `until_pos`, `registered_*`, `unregistered_*`), `created_wasm_hash` (NULL: deployed outside the Manager) |
| `dao_modules` **Prisma** | registry, `module_registrations` | one row per DAO contract: the core four (live for good) and every module ever registered, at its latest registration (`registered` false once unregistered) |
| `event_identity`, `module_events` | registry, `module_registrations` | contract → DAO with the window its events belong to (a module registered by two DAOs belongs to both); every DAO contract event inside its window, with its DAO: the base of every domain view, and where an unregistered module's later events are dropped |
| `dao_launches` | `dao_launched` | per launched DAO: `launch_auction`, `launch_marketplace`, `registry` (the module entries at launch), `launched_*` |
| `assurance_drives` **Prisma** | `assurance_opened`, `dao_launched`, `slug_released` | per drive: `claim_minter`, `list_id`, `deadline`, launch flags, `opened_*`, and `outcome` (`open`, `launched`, `released`). Whether the threshold is met is chain state (`claims.lists` has the counts) |
| `dao_previous_slugs` **Prisma** | `slug_changed` | one row per slug a DAO moved away from, with its event position. Not reserved: the app redirects an old link only while no DAO holds it |
| `daos` **Prisma** | registry, `dao_modules`, `dao_launches`, `assurance_drives`, `dao_created`/`pending_slug_updated` (request), `slug_claimed`/`slug_changed`/`slug_released` (claimed), `token_initialized`/`metadata_updated`, token `admin_changed`, `profile_updated`, auction `paused`/`unpaused`, `marketplace_paused`/`unpaused` | `status` pending/operational; `slug` (claimed once launched or reserved by a drive, else requested; `slug_claimed`, `requested_slug`, `claimed_slug` disambiguate; `slug_released` frees a failed drive's); `token_name`/`token_symbol`; `profile`, `profile_hash`, `profile_seq` (highest `seq` per Metadata contract, computed inline; the app shows `profile` only after hashing it and matching Metadata's on-chain `profile_hash()`); `admin_address` (launch admin, then the Treasury); `auction_contract`, `marketplace_contract`, `claims_contract` (the registered module of each kind now, NULL without one); `assurance_outcome`; `auction_enabled`, `auction_paused`, `marketplace_enabled` from the launch flags and pause events (false/NULL without the module) |
| `module_launches` **Prisma** | each contract's `<role>_launched` | per DAO contract: `is_live`, `treasury`, `started` (auction), `opened` (marketplace), `grants` (token: `[{module, allowance}]`) |
| `implementations` | `implementation_registered`, `implementation_revoked` | `name`, `version`, `published_ledger`, `revoked`, `revoked_ledger` |
| `module_versions` | `upgraded`, `migrated` (every DAO contract) + `dao_modules` | per DAO contract: `current_hash` (latest `to_hash`, else the creation hash), `current_version` (the registry version of `current_hash`, as the contract's `version()` reads it), `storage_version`, `upgrade_count`, `last_upgraded_*`. `scripts/renew-code-ttl.mjs` reads `current_hash` |
| `settings` | `manager_initialized`, `admin_proposed`, `admin_proposal_cancelled`, `admin_changed`, `factory_paused`/`factory_unpaused` | one row per deployment: `admin`, `pending_admin` (NULL after an accept or a cancel), `factory_paused` (the contract has no getter; a pause blocks `create_dao`, `create_module`, `open_assurance`, `launch_dao`, `launch_when_ready` and `change_slug`) |

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
| `delegates` **Prisma** | `delegate_state`, inventory, `modules` | the delegate picker's list: everyone who holds votes or is delegated to: `voting_power`, `owned_token_count`, `delegator_count`, `custody`, and `is_member` by the Token's members-only rule (holds a token and is not custody; a member whose tokens are all escrowed on the Marketplace is not one while listed) |
| `mint_allowances` | `mint_allowance_changed` | the last allowance set per module, with `changed_by` (mints spend silently, so this is an upper bound; the live amount is `mint_allowance()` on chain; `4294967295` is unlimited). The admin mints without an allowance and is never listed |
| `modules` | `module_registered`, `module_unregistered` | registered modules per Token: `kind`, `module`, `non_voting` |
| `settings` **Prisma** | `token_initialized`, `transfers_lock_changed`, `members_only_delegation_changed`, `dao_recovery_changed` | the membership switches in force: the creation settings, each overridden by its latest change |
| `transfer_agents` **Prisma** | `transfer_agent_changed` | modules whose latest change enabled them (unregistering an agent's module emits the disabling event) |
| `managed_transfers` **Prisma** | `dao_transfer`, `agent_transfer` | moves the holder didn't make alone: a DAO transfer (a proposal; recovery or recall) or an agent transfer; the ordinary transfer of the same move is in `transfers` |
| `supply` **Prisma** | inventory + `modules` | per DAO: `minted_supply`, `system_held_supply` (held by the Treasury or a registered non-voting module), `voting_supply` |
| `approvals`, `operator_approvals` | `approve`, `approve_for_all` | single-token approvals still in force (latest per token, not cleared, token not moved since) and collection-wide operator approvals (latest per owner and operator, not cleared); expiry against the current ledger is the reader's call |

Tokens held by the Treasury and non-voting modules carry no votes: they appear
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
| `marketplace.pools` **Prisma** | `pool_opened` with running totals from `pool_restocked`, `pool_purchased`, `pool_swept`, closed by `pool_closed`; keyed by `pool_id`: terms (`price`, `asset`, `expires_at`, `size`, `max_per_buyer`, `max_sold_per_period`, `period_secs`), `stocked`, `sold`, `swept`, `in_stock`, `released`, `status`. An expired pool stays `open` until someone closes it: compare `expires_at` |
| `marketplace.pool_stock` **Prisma** | `pool_restocked`, `transfers` | the tokens a pool has in stock: every id a restock minted into the Marketplace that hasn't moved since (a sale sends it to the buyer, a sweep to the Treasury; a resold token escrowed again is a secondary listing, not stock). Which stock page holds an id is chain state: read `pool_stock(pool_id, page)` before buying |
| `marketplace.secondary_listings` **Prisma** | `secondary_listing_created` closed by `listing_purchased/cancelled/expired`; keyed by `token_id`; `seller`, `fee_bps`, `payment_asset`, `buyer` and `closed_*` once closed |
| `marketplace.sales` **Prisma** | pool sales (`pool_id` set; no seller or fee, the price goes to the Treasury) and secondary purchases (`pool_id` NULL) |
| `marketplace.listing_comments` **Prisma** | event-only threads per token (a token's thread carries over relistings); pools carry no comments |

Auction refunds (`bid_refunded`, `refund_deferred`, `refund_withdrawn`) and the
auction/marketplace configuration setters are feed rows only; the app reads
`pending_refund` and `get_config` from chain.

### claims

The ClaimMinter's views (role `claims`, migration `0010_claims_views`). The claims
page reads list terms, the claimer's progress and the assurance state from chain;
these views are history and discovery.

| View | Reads | Notes |
| --- | --- | --- |
| `claims.lists` **Prisma** | `list_opened` with running totals from `claimed`, `escrow_released`, `refunded` | one row per list: `root`, `tree_uri`, `asset`, `price`, `expires_at`, `total`, `is_assurance`, `threshold_claimers`, `deadline`, `claimed`, `claimers`, `paid`, `escrowed`, `released`, `refunded` |
| `claims.claims` **Prisma** | `claimed` | every claim: claimer, `amount` (ids `first_token_id` .. + `amount` - 1), `paid`, `escrowed` (bool), the claimer's running `claimed` |
| `claims.claimers` **Prisma** | `claimed`, `refunded` | each claimer's position per list: `claimed`, `paid`, `escrowed`, `refunded` |

Not projected: `claim_minter_launched` (`manager.module_launches`).

### app

| View | Notes |
| --- | --- |
| `activity_feed` **Prisma** | activity rows with `dao_id` resolved, one `UNION ALL` branch per source so a per-DAO filter pushes down: DAO contract events by contract inside its window (`manager.event_identity`: the core four and every registered module, external ones included); per-DAO Manager events (`dao_created`, `dao_launched`, `slug_claimed`, `pending_slug_updated`, `slug_changed`, `slug_released`, `module_created`, `assurance_opened`) by their `token_address` topic; platform events (`upgrade_delay_changed`, `manager_upgraded`) fanned out to every DAO that existed at the time, and `implementation_revoked` to every DAO with a registered contract running that hash, with `activity_id` suffixed by the DAO; other Manager events with no DAO |
| `proposal_list` **Prisma** | `governance.proposals` with `proposal_number` |
| `proposal_detail` **Prisma** | `proposal_list` plus `actions` (`[{action_index, target, function, args}]` from `proposal_created`); votes come from `governance.proposal_votes` |
| `feed_status` **Prisma** | per deployment: `latest_ledger` of the feed and `last_hour_count` (feed rows in the last 720 ledgers), from the `(deployment_id, ledger_sequence)` index; the health endpoint reads this instead of the whole feed |
| `indexer_status` **Prisma** | latest ledger / event count / last ingestion, so the app never reads raw events |

## Activity kinds

`kind` is `<area>.<event>` (`governance.vote_cast`, `claims.claimed`,
`marketplace.pool_purchased`, …), defined in
`packages/goldsky/src/activity-feed.script.js`. Events without a mapping get
`contract.<event_name>` and `system` visibility; events from a module under the
catch-all `module` role are `module.<event_name>` and `admin`.

`visibility` curates the feed. **public/governance** rows are what a member acts
on: launches, proposals (created, queued, executed, cancelled), votes and comments,
real delegation, a rename or a new link, auctions (started, bid, settled,
cancelled), marketplace listings (opened, sold, cancelled, expired) and comments,
quick-buy pools (opened, each sale, closed), claim lists and claims, launch
drives, modules joining or leaving, the membership switches and DAO transfers,
profile updates (seq > 0), and upgrades (DAO contracts and the Manager, the
upgrade notice, a revoked implementation). Their side effects are
**admin/system**: per-token `mint` / `mint_with_minter` / `mint_batch_with_minter`
(the module's own row is the public one), restocks, sweeps, claim refunds, transfers, `delegate_votes_changed`, seeds, slug claims, setup and launch
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
