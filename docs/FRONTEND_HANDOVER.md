# Frontend Handover: contract, indexer and database changes

> **Temporary document. The frontend developer or agent who updates `apps/web` for these changes MUST delete this file (`docs/FRONTEND_HANDOVER.md`) once the frontend is updated, and remove the links to it from `README.md` and `docs/README.md` in the same change.**

The contract review fixes (see [CONTRACT_REVIEW_FIX_PLAN.md](./CONTRACT_REVIEW_FIX_PLAN.md)) changed contract interfaces, events, error codes and database views. Breaking changes were allowed because nothing is on mainnet; testnet will be redeployed fresh. The contracts, bindings (`packages/*-bindings`, regenerated), Goldsky pipeline, database migrations and deploy scripts are already updated and tested. **The web app has only had its error map updated** (`apps/web/src/lib/contract-errors.ts`). Everything below is still to do in `apps/web`.

Authoritative references: [SECURITY_MODEL.md](./SECURITY_MODEL.md), [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md), the per-contract READMEs under `contracts/*/README.md`, and the generated clients in `packages/*-bindings/src`.

## 1. Known breakages (fix first)

`pnpm typecheck` currently fails in two places, and one runtime path is broken:

| File | Problem | Fix |
| --- | --- | --- |
| `src/lib/admin-queries.ts:69` | calls `client.get_owner()`, which no longer exists on any module | call `client.admin()` (returns `Address`, not `Option`) |
| `src/lib/dao-creation-params.ts:70` | `InitialDaoConfigValues` requires `slug` | pass the DAO slug from the create form |
| `src/app/api/dao/[daoId]/proposals/[proposalId]/route.ts:32-51` | `proposal_proposer` used to panic for every proposal, so the whole `Promise.all` fell back to DB state. It now works, but one failing read should not drop authoritative state | use `Promise.allSettled` (or drop `proposal_proposer`; the DB has the proposer); use the indexed `vote_start_seconds` and `quorum_votes` instead of guessing `vote_start = deadline - voting_period` |

## 2. Contract interface changes

### All modules: admin instead of owner

- Every module (token, governor, treasury, auction, marketplace, metadata) exposes `admin()` (launch admin during setup, the Treasury after launch). `owner()`, `get_owner()`, `transfer_ownership`, `accept_ownership` and `renounce_ownership` are gone. There is no way to change a module's admin except the launch handoff.
- New on every module: `migrate()` (admin) and `storage_version()`.
- Any UI step that asks the launch admin to "accept token ownership" must be removed (also described in `docs/ARTWORK_PLAYGROUND_INTEGRATION.md`, step 3; update that doc when the flow changes). Authority checks should compare against `admin()`.

### Token

- `total_supply()` / `get_total_supply()` now return the **voting supply**: tokens held by the Treasury, Auction and Marketplace carry no votes and are excluded. Show minted supply and voting supply separately where it matters (indexed view `token.supply`).
- The Treasury, Auction and Marketplace never have votes or delegates. Member lists must not imply voting power from token counts (`token.members.voting_power` is 0 for them).
- A listed token's vote leaves its holder's delegate until the token returns or is bought. Consider telling sellers this when they list.
- Each `batch_mint` call must fit an **event budget** (`BatchTooLarge`, 7205; the 16 KiB per-transaction event limit): `300 × tokens + 450 × recipient entries ≤ 13,500`. That is up to **43 tokens to one recipient**, **18 recipients with one token each**, or mixes (e.g. 35 tokens over 5 recipients). Validate with the same formula and chunk larger mints into several calls (`scripts/deploy-dao.mjs` `planFounderBatches` is a reference packer):
  - `src/app/dao/[daoId]/admin/token/page.tsx:108` (`client.batch_mint`; the helper text at line 149 still says "up to 20 tokens")
  - `src/lib/proposal-actions/actions/batch-mint-governance-token/index.ts`, `validator.ts:51` and `component.tsx:71` ("1-20 tokens"), `src/components/proposal/proposal-action-editor.tsx:208`, `src/lib/proposal-call.ts:113`, `src/components/proposal/proposal-action-preview.tsx:64` (proposal actions: one action per fitting chunk, at most 20 actions per proposal)
- Minter `mint_batch` accepts at most 18 recipients and the whole batch must fit the same budget.
- **Artwork before minting.** The Metadata hook seeds a token's traits when it is minted and seeds nothing while no artwork properties exist; the contracts cannot block such a mint. The frontend must enforce the order:
  - Create flow (`src/lib/use-dao-deployment.ts`): keep "add artwork" before "mint founder allocations" and do not mint if adding artwork failed or `metadata.properties_count()` is 0.
  - Admin token page (`src/app/dao/[daoId]/admin/token/page.tsx`) and any setup checklist (`src/components/launch-checklist.tsx`): when `properties_count()` is 0, show a prominent warning ("Upload the artwork first: tokens minted now get no traits") and require explicit confirmation before minting; list the artwork step before the founder-mint step.
  - Recovery: tokens without traits (`metadata.get_attributes(id)` fails or is empty, or no `metadata.token_seeds` row) can be seeded with `metadata.regenerate(token_id)`. During setup the launch admin calls it directly; after launch it is a governance proposal action (Treasury is the metadata admin). Offer it from the admin page for unseeded tokens.

### Manager

- `create_dao` only **requests** the slug. `launch_dao` claims it and can now fail with:
  - `SlugTaken` (7123): another DAO launched with the slug first. Offer a rename with the new `update_pending_slug(token_address, slug)` (launch admin auth), then retry.
  - `FactoryPaused` (7111): the factory pause now blocks launch too.
  - `LaunchAdminNotOwner` (7126): replaces the old generic `Unauthorized`.
  - `LaunchSupplyZero` (7120): now means "no voting tokens": founders minted only to the Treasury do not count.
- `get_dao_by_slug` / `get_slug` resolve **launched** DAOs only. A pending DAO's requested slug is in `get_pending_dao(token).slug` (or the DB, see below). Slug availability checks in the create form should treat a slug as taken only if a launched DAO holds it, and warn that pending requests are not reservations.
- `register_implementation` no longer moves "latest"; the admin calls `set_latest_implementation(name, hash)`.
- Event ledger fields renamed `*_at` → `*_ledger` (`published_ledger`, `approved_ledger`, `revoked_ledger`, `deployed_ledger`, `upgraded_ledger`).
- Affected web code: `src/lib/use-dao-deployment.ts` (create/launch), `src/components/launch-checklist.tsx`, `src/lib/dao-creation-params.ts`, the create flow.

### Governor

- `proposal_proposer(id)` works (it always panicked before).
- `propose` emits `ProposalScheduled { vote_start, vote_end, snapshot_ledger, quorum_votes }`. Quorum is computed from the voting supply at the snapshot; display `quorum_votes` (indexed) or `quorum(snapshot)`, never a percentage of minted supply.
- New errors: `ZeroVotingWeight` (7512, the voter had no votes at the snapshot), `ProposalNotReady` (7513, queued but before its ETA). Hide or disable the vote button for accounts with zero snapshot weight and the execute button before the ETA.
- Setter events use `changed_by` instead of `caller`.

### Treasury

- Proposal actions may include `authorize` actions (target = Treasury, function `authorize`, one `Vec<AuthNode>` argument) that attach nested authorization trees to the **next** action. Needed for actions like `marketplace.buy(token, treasury, max_price)` from the Treasury or router swaps. `AuthNode { contract, fn_name, args, sub }` is exported by `@builder-stellar/treasury-bindings`.
- `check_authorization(nodes)` is a read-only validator: simulate it in the proposal builder before submitting.
- Allowed self calls are now `upgrade`, `migrate`, `sync_version` (plus `authorize`).
- Voters must be able to read `authorize` trees in the proposal detail view (they are ordinary actions).

### Auction

- `settle_and_create_new` and `settle_auction` (paused) both require `now >= end_time` (`AuctionActive`, 7404). Never show a settle button before the end time, even while paused. `cancel_auction` (admin) is the only way to end a running auction.
- `pause` / `unpause` still take a `caller`, which must equal `admin()`.

### Marketplace

- `list(token_id, seller, price, expires_at, max_fee_bps, payment_asset)`: pass the fee and asset the seller saw. The call fails with `FeeAboveMax` (7714) or `PaymentAssetMismatch` (7712) if the config changed; re-read the config and ask the seller to confirm.
- `buy(token_id, buyer, max_price)` and `buy_primary(listing_id, buyer, max_price)`: pass the displayed price (`PriceAboveMax`, 7715).
- Secondary fee capped at **2,500 bps (25%)** (`InvalidFee`). Validate the create-flow and admin fee inputs (`src/lib/dao-creation-params.ts`, `src/lib/dao-config.ts`); `create_dao` rejects a higher fee with `InvalidFee` (7125).
- Config events now carry `changed_by`.

### Metadata

- Settings strings (`update_description`, `update_project_uri`, `update_contract_image`, `update_renderer_base`, and the create-time values) are capped at **256 characters** (`StringTooLong`, 7312). Validate in the forms.
- The metadata admin is its own `admin()` (no longer read from the token's owner).
- `regenerate(token_id)` only seeds tokens with no attributes (`AlreadySeeded`).

### Errors

All project error codes moved to unique blocks (7000-7899, one per contract). `src/lib/contract-errors.ts` is already updated, so use `describeContractError(err)`; a code identifies its contract on its own, so `contract` is optional.

## 3. Database / Prisma changes

The Prisma schema still matches the database (the integration test enforces it), but some columns changed meaning and new columns/views exist. Update `apps/web/prisma/schema.prisma` and the queries in `src/lib/goldsky.ts` / `src/lib/dao-db.ts` together:

| View | Change | Frontend action |
| --- | --- | --- |
| `metadata.configuration` | `owner` now holds the metadata module's **current admin** (launch admin, then Treasury). The column name was kept only so Prisma keeps working | rename to `admin` in the view (`db/migrations/0006_metadata_views.sql`) and in the `MetadataConfiguration` Prisma model in one change, then run `TEST_DATABASE_URL=… ./db/test-migrations.sh` |
| `manager.daos` | new columns `slug` (claimed slug once launched, else the latest requested slug), `slug_claimed`, `requested_slug`, `claimed_slug`. `ManagerDao` has no slug field today | add the fields; resolve DAO pages by `slug` only where `slug_claimed` is true, or handle duplicate requested slugs among pending DAOs |
| `manager.dao_slugs` (new) | requested vs claimed slug per DAO | use for slug availability and pending-DAO UI |
| `app.proposal_list`, `app.proposal_detail`, `governance.proposals` | new columns `vote_start_seconds`, `quorum_votes`; `state` now has `active`, `succeeded` and `defeated` in addition to `pending`, `queued`, `executed`, `canceled`, `expired`. `expired` no longer covers "won but missed quorum" (that is `defeated`) | add the fields to `AppProposalList` / `AppProposalDetail`; update state labels, filters and badges |
| `manager.daos.admin_address` | now the DAO's **current** admin (the Treasury after launch, the launch admin before); it was the creation-time admin | use `manager.module_admins` for per-module admins |
| `governance.settings` (new) | current Governor configuration: `voting_delay_seconds`, `voting_period_seconds`, `queue_delay_seconds`, `proposal_threshold`, `quorum_bps`, `admin` | show governance parameters from the DB instead of RPC reads |
| `token.supply` (new) | `minted_supply`, `system_held_supply`, `voting_supply` per DAO | show voting supply / quorum context |
| `manager.module_admins` (new) | current admin per module, `handed_to_treasury` | authority UI |
| `manager.module_versions` | new `storage_version` | admin/upgrade dashboard |
| `manager.module_upgrades` | includes `migrated` rows with `from_storage_version` / `to_storage_version` | upgrade history |
| `manager.latest_implementations` (new) | admin-selected latest implementation per name | upgrade tooling |
| `manager.implementations` | `published_at` → `published_ledger`, `revoked_at` → `revoked_ledger` | update any query that used them |

## 4. Events and activity feed

If the web parses events or activity kinds directly:

- The shared `Launched` event is replaced by `TokenLaunched`, `GovernorLaunched`, `TreasuryLaunched`, `AuctionLaunched`, `MarketplaceLaunched`, `MetadataLaunched` (activity kinds `<module>.launched` are unchanged).
- Batch mints emit one `MintBatchWithMinter { minter, first_token_id, count }` (activity kind `token.batch_mint`, public: "Minted 5 tokens (30-34) by …") and one metadata `SeedsGenerated` (`metadata.seeds_generated`, admin) instead of per-token `MintWithMinter` / `SeedGenerated` rows. Single mints and `regenerate` still emit the per-token events. `token.mints` and `metadata.token_seeds` still have one row per token (columns unchanged); batch seed rows share their source `event_id`.
- OpenZeppelin `QuorumChanged` is `governance.quorum_changed` (admin) and the Auction's `Paused` / `Unpaused` are `auction.paused` / `auction.unpaused` (they were `contract.*`). No event falls back to `contract.*` any more.
- New activity kinds: `<module>.admin_changed` (launch handoff), `<module>.migrated`, `governance.proposal_scheduled` (admin visibility; it accompanies `proposal_created`), `manager.slug_claimed` (public), `manager.pending_slug_updated`, `manager.latest_implementation_set`.
- OpenZeppelin `OwnershipTransfer*` events are gone.

## 5. Done when

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm --dir apps/web test` and `pnpm build` pass.
- [ ] `TEST_DATABASE_URL=… ./db/test-migrations.sh` passes (it checks the Prisma schema against the views).
- [ ] Admin pages warn before minting while no artwork is configured, and unseeded tokens can be regenerated.
- [ ] Create → setup → launch works against a fresh local or testnet deployment, including a `SlugTaken` rename and founder allocations that need several batch calls.
- [ ] Marketplace list/buy pass the seller and buyer bounds; settle buttons respect the auction end time.
- [ ] Proposal pages show the new states, quorum from `quorum_votes`, and readable `authorize` actions.
- [ ] **This file (`docs/FRONTEND_HANDOVER.md`) is deleted, and its links are removed from `README.md` and `docs/README.md`.**
