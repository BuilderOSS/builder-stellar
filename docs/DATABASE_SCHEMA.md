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
| `dao_registry` | `dao_created` | one row per DAO: deployer, launch admin, six module contracts |
| `dao_modules` | registry | one row per module contract |
| `event_identity` | modules | contract → DAO lookup used by every domain view |
| `daos` **Prisma** | registry + `dao_launched`, `token_initialized`, metadata, auction `paused`/`unpaused` | `status` pending/operational; `auction_enabled`, `auction_paused`, `token_description` |
| `implementations` | `implementation_registered`, `implementation_revoked` | `revoked`, `revoked_at` |
| `current_implementations` | `current_implementations_updated` | latest default implementation hashes |

### token

| View | Reads | Notes |
| --- | --- | --- |
| `transfers` | `mint`, `transfer` | `transfer_type`, `from_address` NULL for mints |
| `mints` | `mint_with_minter` | who performed each mint |
| `inventory` **Prisma** | transfers | current owner per token |
| `members` **Prisma** | inventory, `delegate_changed`, `delegate_votes_changed` | owned count, delegate, voting power |
| `delegations`, `mint_authority_history` | token events | history |
| `mint_authorities` **Prisma** | history | currently enabled authorities |

### governance

| View | Reads | Notes |
| --- | --- | --- |
| `proposals` | `proposal_created` + lifecycle | `state`: pending, queued, executed, canceled; `eta_seconds` kept after execution |
| `proposal_votes` **Prisma** | `vote_cast` | `support` 0 against, 1 for, 2 abstain |
| `proposal_lifecycle` **Prisma** | queued / executed / cancelled | |
| `proposal_actions` | `proposal_created` | one row per call (parallel arrays unnested) |
| `governor_authority_history`, `governor_authorities` **Prisma** | `governor_authority_changed` | plus the Treasury as implicit owner authority |

`snapshot_ledger` is the vote snapshot ledger; `vote_end_seconds` is the voting
deadline as a unix timestamp. The governor emits no vote start.

### auction, metadata, treasury, marketplace

| View | Reads |
| --- | --- |
| `auction.auctions` **Prisma** | `auction_created` + settlements/cancellations + config at creation time |
| `auction.bids` **Prisma**, `bid_refunds`, `settlements`, `cancellations` | auction events (`winner` is NULL when no bids) |
| `metadata.configuration` **Prisma** | `metadata_initialized` overlaid with the latest `*_updated` events |
| `metadata.properties` | `property_added` since the latest `properties_reset` |
| `metadata.token_seeds` | `seed_generated` |
| `treasury.calls`, `treasury.governor_changes` | `execute`, `governor_changed` |
| `marketplace.listings` | listing events; `status` open/purchased/cancelled/expired |
| `marketplace.purchases` | `listing_purchased` |

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
