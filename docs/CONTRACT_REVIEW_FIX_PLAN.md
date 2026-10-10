# Contract Review Fix Plan

Source: contract-reviewer pass on `main` @ `009fce5` (2026-10-10). Every finding was
re-verified against the code (evidence in §6).

**Ground rules (decided 2026-10-10):**
- Breaking changes are allowed: storage layouts, contract interfaces, event shapes and error codes may all change.
- Testnet DAOs and the Manager are redeployed fresh. Nothing below carries migration shims or compatibility fallbacks.
- Deployment waits until every fix lands and all unit and e2e tests pass.
- Every finding is fixed before mainnet, including the items the first draft deferred.

## Status (2026-10-10, branch `fix/contract-review`)

| PR | Status | Notes |
|---|---|---|
| 1 `common` | Done | `admin`, `ttl` (instance + persistent policy), `upgrade` (`StorageVersion`, `migrate`), shared bounds, `error::codes` |
| 2 Token | Done | Voting-supply exclusion, batch event budget (`common::batch_mint_fits`; batch-level `MintBatchWithMinter` / `SeedsGenerated` replace per-token events, so a call mints up to 43 tokens to one recipient or 18 recipients × 1, measured against the 16 KiB event limit; was 20 with per-token events), persistent mint authorities |
| 3 Governor | Done | `proposal_proposer`, `ProposalScheduled`, `ZeroVotingWeight` / `ProposalNotReady`, proposal TTL 120 days (threshold 30) |
| 4 Treasury | Done | Nested authorization implemented as `authorize` actions (see §2.6 note), `check_authorization`, `migrate` self call |
| 5 Auction | Done | `end_time` check on both settle paths; `Launched` flag replaced by deriving from auction state |
| 6 Marketplace | Done | Seller/buyer bounds, 25% fee cap, listing TTL 30 days (threshold 7) |
| 7 Metadata, Minter | Done | 256-char settings cap, own admin; Minter instance TTL, token errors propagate |
| 8 Manager | Done | Slug claimed at launch, `update_pending_slug`, pause blocks launch, `set_latest_implementation`, `_ledger` fields |
| 9 Events | Done | `<Module>Launched`; `changed_by` everywhere; module `AdminChanged` shares the Manager's shape (`old_admin`, `new_admin`) |
| 10 Downstream | Done except the web app | Bindings regenerated; Goldsky decoder/activity feed; database views (migrations edited in place); deploy scripts. Web: only `contract-errors.ts`, the rest is in [FRONTEND_HANDOVER.md](./FRONTEND_HANDOVER.md) |
| 11 Docs and tests | Done | All docs and READMEs updated; 440 contract tests, 75 indexer tests, database suite (migrate, rollback, read model, Prisma alignment) pass |

Not done: web app changes (handover doc) and the testnet redeploy (deferred until the frontend is updated).

Deviations from the plan below:
- §2.6: the authorization trees are carried by ordinary `authorize` actions aimed at the Treasury, not a new proposal field, so the Governor and the proposal id hashing are unchanged while voters still approve the trees.
- §3: blocks were assigned as planned; the Token, Auction and Marketplace error enums are now re-exported for integrators.
- `metadata.configuration.owner` keeps its column name (holding the current admin) until the web's Prisma model is updated; see the handover.

## 1. Decisions

| # | Decision | Outcome |
|---|---|---|
| D1 | Quorum drift (H1) | **Exclude system holders from voting supply inside the token** (§2.1). The governor needs no change, and NFTs don't have to be burned. |
| D2 | Slug lifecycle (M2) | **Store the requested slug in `PendingDao`; claim it only at `launch_dao`** (§2.4). |
| D3 | Seller fee/asset pin (L3) | Add seller bounds to `list`, and lower `MAX_FEE_BPS` from 10,000 to 2,500 (25%). |
| D4 | `launch_dao` while paused | Blocked. |
| D5 | Error codes | One collision-free numbering across all contracts, outside every OpenZeppelin range (§3). |

## 2. Design notes for the non-trivial fixes

### 2.1 D1: voting supply excludes Treasury, Auction and Marketplace

OZ `transfer_voting_units(from: Option, to: Option, n)` treats `None → Some` as a mint, which raises the `TotalSupply` checkpoint, and `Some → None` as a burn. The fix is to map the three system addresses to `None`:
- an NFT entering a system contract burns its voting units;
- an NFT leaving one mints them again.

The `TotalSupply` checkpoint the governor already reads becomes the voting-capable supply, so `quorum()`, `set_proposal_threshold`'s supply check and every snapshot stay correct without touching the governor.

**Implementation:**
- **Inputs:** the token constructor takes `auction` and `marketplace` alongside the existing `treasury`. The Manager already precomputes all six addresses before any `deploy_v2` (`manager/src/contract.rs:603-618`). They are stored in instance storage and are **immutable**: no setter, so balances and voting units can never drift apart.
- **Helper:** `fn voting_holder<'a>(e, a: &'a Address) -> Option<&'a Address>` returns `None` for the three system addresses.
- **Call sites:** replace `NonFungibleVotes::{transfer, transfer_from, sequential_mint}` with `Base::*` plus `transfer_voting_units(voting_holder(from), voting_holder(to), 1)`. Skip the call when both sides are `None`; otherwise it pushes an Add and a Sub checkpoint for nothing. `batch_mint` does the same per recipient.
- **Delegation:** `ensure_self_delegate` is skipped for system addresses.

**Effects to document:**
- Treasury-held NFTs can never vote. Today a proposal could, in theory, delegate them.
- A listed NFT stops voting while it is escrowed. This is already true in practice today.
- A user who delegates to the Treasury forfeits their votes, the same as delegating to any address that never votes.

**Tests:**
- Invariant: `get_total_supply()` equals the sum of balances outside the three system addresses, across mint, `batch_mint`, transfer, list, buy, cancel, settle with bids, settle without bids, and a Treasury transfer out by proposal.
- Regression: after N no-bid auctions, quorum stays reachable by the circulating holders.

### 2.2 H2 and proposal events
- Override `proposal_proposer`.
- Emit `ProposalScheduled { proposal_id, vote_start, vote_end, snapshot_ledger, quorum_votes }` from `propose`. Quorum is final at `propose` because the snapshot is `ledger − 1`, and with §2.1 it reflects voting supply.
- **Downstream:** the database stores real `vote_start` and `quorum_votes`, and the governance views can tell `defeated` (quorum missed or lost) apart from `expired` (queued and unexecuted for 14 days) without guessing from the clock.

### 2.3 M1: settlement timing
`settle_auction_internal` requires `now >= end_time` (`AuctionActive`), so both `settle_and_create_new` and the paused `settle_auction` enforce it. `cancel_auction` (owner, paused) remains the emergency exit.

### 2.4 D2: slug claimed at launch
- `create_dao` validates the slug format and rejects a slug already claimed by a launched DAO (fail fast). It stores `slug` in `PendingDao` and does **not** write `SlugToDao` or `DaoSlug`.
- `launch_dao` checks `SlugToDao` again, writes both keys, and emits `SlugClaimed`. It fails with `SlugTaken` if another DAO launched first.
- New `update_pending_slug(token, slug)` (launch admin auth) lets a creator recover from `SlugTaken`, or rename, before launch.
- An abandoned pending DAO holds nothing, so no release path or expiry is needed.
- `get_dao_by_slug` only resolves launched DAOs. The read model indexes requested slugs from `DaoCreated` for the "pending" UI and treats them as non-unique.
- **Trade-off to note:** a pending DAO's slug is public. Someone can create and launch their own DAO with that slug first. That costs the create fee plus rent for six contracts and produces a real, launched DAO, so it is much costlier than today's free squat, but it is not impossible. If this matters later, the slug-pricing TODO (`manager/src/contract.rs:1225`) is the right lever. A time-limited reservation at create is the alternative design.

### 2.5 L3: seller-side bounds (D3)
`list(token_id, seller, price, expires_at, max_fee_bps, payment_asset)` rejects the listing (`InvalidFee` / `PaymentAssetMismatch`) when the current config is worse than the seller signed for. `buy` also takes `max_price` as an explicit buyer bound, even though Soroban's recorded auth tree already pins the transfer amount.

### 2.6 L2: Treasury nested authorization
Today the Treasury authorizes exactly one call level, so a proposal can't buy on the marketplace (that needs a nested SAC transfer), use an AMM, or drive any contract that calls back for Treasury auth.

**Design:**
- Each proposal action gains an optional authorization tree: a `Vec<Vec<AuthNode>>` parallel to `args`, where `AuthNode { contract, fn_name, args, sub: Vec<AuthNode> }` maps onto `InvokerContractAuthEntry`.
- The tree is part of the proposal, so voters approve it. The Governor's `get_proposal_id` and `propose` override (already custom) hash it along with targets, functions, args and description.
- `consume` and `execute` take it.
- The Treasury converts each tree to `SubContractInvocation` entries in place of today's `sub_invocations: vec![e]`.
- Depth and node count are bounded (for example depth 3, 16 nodes).
- **Proof test (e2e):** a proposal that buys a marketplace listing from the Treasury.
- **Downstream:** the proposal builder UI and the API action encoding.

### 2.7 Upgrade migrations (none exist today)
Add a common convention now, before mainnet:
- a `StorageVersion` instance key written at construction;
- `common::upgrade::apply` stays as it is;
- each module exposes an owner-gated `migrate()` that runs only when `StorageVersion < CODE_STORAGE_VERSION`, then bumps it.

The first release ships `migrate()` as a no-op that only records the version, so every later layout change has a path.

### 2.8 One admin model
- **Today:** OZ `Ownable` in token, governor, auction and treasury; a `launch_admin`/`treasury` switch in the marketplace config; and Metadata's own `Owner` key plus the token owner for artwork.
- **Target:** `common::admin`, holding the owner (launch admin during setup, Treasury after launch), the handoff, a `require_admin`, and no renounce.
- Every module uses it. Metadata's artwork permission becomes "the token's admin", read cross-contract as today.
- This also removes the `renounce_ownership` foot-gun (L1) structurally. Until the migration lands, L1 is fixed by overriding `renounce_ownership` to panic.

## 3. Error code allocation (D5)

OZ already occupies: 0-414 (tokens), 1000-1001 (pausable), 1300-1302 (merkle), 1400-1403 (crypto), 1500-1502 (math), 2000-2203 (access), 3000-3603 (accounts, confidential), 4000-4104 (timelock, votes), 5000-5023 (governor, fee abstraction), 6000-6001.

Current project codes collide with those ranges: treasury 1400s = crypto, governor 1500s = math, marketplace 1300s = merkle, Manager 1000/1001 = pausable. They also collide with each other: Manager 1101-1122 vs token, Manager 1201/1202 vs auction, metadata vs minter.

New ranges, one 100-block per crate, with no gaps reused:

| Range | Crate |
|---|---|
| 7000-7099 | common |
| 7100-7199 | manager |
| 7200-7299 | token |
| 7300-7399 | metadata |
| 7400-7499 | auction |
| 7500-7599 | governor (custom only; OZ `GovernorError` stays 5000s) |
| 7600-7699 | treasury |
| 7700-7799 | marketplace |
| 7800-7899 | minter |

Rules:
- Codes are sequential inside a block.
- Misleading variants get replaced while renumbering:
  - governor `ZeroVotingWeight` and `ProposalNotReady`;
  - Manager `LaunchAdminNotOwner` instead of `Unauthorized`;
  - Minter passes the token's error through instead of `TokenContractError`.
- Dead variants are removed, e.g. governor `OwnerNotSet`.
- A unit test in `common` asserts that the block constants don't overlap.
- `docs/` gets one error table generated from the enums.

## 4. Work breakdown

Owners follow `docs/AGENT_WORKFLOW.md`. Every contract PR goes through `contract-writer`, then `contract-reviewer`, and must pass `pnpm contracts:test` and `cargo fmt --all --check`.

### PR 1: `common` foundations
- §3 error ranges and the overlap test.
- `common::ttl` policy:
  - instance: 60d threshold, 170d extend-to (existing);
  - persistent: 30d threshold, 365d extend-to, via `extend_persistent()`;
  - short-lived: helper with explicit values.
- Shared constants: `DAY_IN_LEDGERS`, `MIN_RESERVE_PRICE`, `MIN_AUCTION_DURATION`, `MAX_GOVERNANCE_DELAY`, `MAX_STRING_LENGTH`. Delete the per-crate copies.
- `common::admin` (§2.8) and the `StorageVersion` / `migrate` convention (§2.7).

### PR 2: Token
- §2.1 voting-supply exclusion (constructor takes `auction`, `marketplace`).
- `batch_mint` capped by an event budget (`common::batch_mint_fits`: 43 tokens to one recipient, 18 recipients × 1), with one batch-level minter event and one batch-level seed event. This also bounds the metadata hook's budget (L4).
- Each `NFTStorageKey::Owner` write gets a TTL extension.
- `MintAuthority(Address)` moves from instance to persistent storage, with a TTL extension on read.
- Move to `common::admin`. No renounce.
- Fix the misattached docs (`contract.rs:222-253, 526-541`) and `lib.rs:14`.

### PR 3: Governor
- H2 `proposal_proposer`.
- `ProposalScheduled` event.
- New error variants.
- Proposal TTL: 30d threshold, 60d extend-to (instead of 59/60).
- Move to `common::admin`.
- Fix the `storage.rs:63` docs (Succeeded proposals expire).
- §2.6 governor side: the authorization tree is hashed into the proposal id and passed through `propose`, `consume` and the events.

### PR 4: Treasury
- §2.6 executor side: build `SubContractInvocation` trees from the consumed proposal, with bounds.
- Move to `common::admin`.
- Fix the `storage.rs:17-18` docs.

### PR 5: Auction
- §2.3 settlement timing.
- `common::admin`, which replaces the 8 raw `get_owner().unwrap()`.
- `DataKey::Launched` is replaced by deriving "first auction created" from auction state. If it can't be derived, rename it to `FirstAuctionCreated`.
- TTLs move to the common policy. `PendingRefund` gets 30d threshold, 365d extend-to.
- Remove `create_bid`'s duplicated validation.
- Fix the `storage.rs:10-21, 129-131` docs.

### PR 6: Marketplace
- §2.5 seller and buyer bounds, plus the D3 cap.
- Listing TTL: 7d threshold, 30d extend-to.
- `changed_by` on the config events.
- `common::admin` replaces the config `launch_admin`/`treasury` switch.

### PR 7: Metadata and Minter
- **Metadata:**
  - `update_*` setters capped at `MAX_STRING_LENGTH`;
  - replace the unwrap at `:555`;
  - TTL moves to the common policy;
  - artwork permission goes through `common::admin`.
- **Minter:** `extend_instance` on every entry point; TTL moves to the common policy; pass token errors through.

### PR 8: Manager
- §2.4 slug at launch, plus `update_pending_slug`.
- `launch_dao` honours `FactoryPaused`.
- `register_implementation` no longer moves "latest". A new admin `set_latest_implementation(name, hash)` requires a registered, non-revoked hash whose name matches.
- Pass `auction` and `marketplace` to the token constructor.
- New error range, with `LaunchAdminNotOwner`.
- Replace the 14-field clone tuple in `create_dao` with borrows.
- Fix the `lib.rs:20-38`, `contract.rs:381-383` and `:1195` docs.
- Update `scripts/deploy-manager.mjs`, `deploy-dao.mjs` and `upgrade-contract.mjs` for the new interfaces.

### PR 9: Events cleanup (all crates, can be folded into PRs 2-8)
- Module-specific launch events (`TokenLaunched`, `AuctionLaunched`, …) instead of a shared `Launched`.
- `_ledger` suffix for ledger-number fields; `_time` stays for timestamps.
- Consistent `changed_by` on every config-change event.
- Each PR records its event changes in its handoff note for the indexer.

### PR 10: Downstream (indexer → DB → API → UI)
1. **`contract-writer` / `frontend-services`:** regenerate every binding package (`scripts/generate-bindings.mjs`).
2. **`indexer-events`:** in `packages/goldsky`, ingest:
   - `ProposalScheduled`, `SlugClaimed` and the renamed launch events;
   - the new marketplace config fields and proposal authorization trees;
   - the requested slug from `DaoCreated`.
3. **`database-engineer`:** because the testnet is being redeployed, edit migrations 0001-0009 in place (the earlier closed-at fix did the same):
   - `vote_start`, `quorum_votes` and `snapshot_ledger` columns;
   - the `defeated` state;
   - pending and claimed slug tables, with requested slugs non-unique.
4. **`frontend-services`:**
   - drop `proposal_proposer` from `route.ts`'s `Promise.all` (use `allSettled`);
   - use the stored `vote_start` and quorum;
   - one error-message map keyed by the §3 table;
   - DAO lookup handles pending versus claimed slugs.
5. **`frontend-builder`:**
   - marketplace list and buy send the bounds;
   - the proposal builder supports authorization trees for actions that need them;
   - the create flow surfaces `SlugTaken` at launch with the rename path.

### PR 11: Docs and tests
- `SECURITY_MODEL.md`:
  - replace the quorum-lock section with the §2.1 semantics;
  - correct the `regenerate` line;
  - slug claimed at launch and its front-run trade-off;
  - Treasury authorization trees;
  - the admin model;
  - the migrate convention.
- `TTL_ECONOMICS.md`: the unified policy.
- `ARCHITECTURE.md` and the per-contract READMEs: interface changes.
- Generated error table.
- **Tests not covered above:**
  - every `common/src/clients.rs` method exercised in e2e (catches signature drift);
  - cross-contract error decoding through the Manager;
  - one suite run with a mainnet-like `max_entry_ttl`;
  - `scripts/e2e-testnet.mjs` updated for the new flows.

**Order:** PR 1 → PRs 2-8 (Manager last, because it wires every new constructor and launch signature) → PR 10 → PR 11. Gate: `cargo test` (unit and Rust e2e, with release WASMs built), indexer tests, and web lint, typecheck and tests all pass. Testnet redeploy and `e2e-testnet` come after that, as a separate step.

## 5. Out of scope (documented limitations, unchanged)
These are already documented in `SECURITY_MODEL.md:104-121` and none came up as a new finding:
- no veto;
- proposal ids exclude the proposer;
- founder supply is unbounded during setup;
- metadata seeds can be ground.

Revisit them as product decisions, separately from this plan.

## 6. Verification evidence (main @ 009fce5)

| Finding | Evidence |
|---|---|
| H1 | No-bid NFT → Treasury `auction/src/helpers.rs:235-264`; auto-self-delegate on receive `token/src/contract.rs:447-452,564-581`; quorum denominator = total supply `governor/src/contract.rs:475-495`; marketplace escrows via `transfer_from`. Partly acknowledged at `SECURITY_MODEL.md:113-115`. |
| H2 | No `proposal_proposer` override; OZ default reads `GovernorStorageKey::Proposal` (`stellar-contracts@fbfde38 governance/src/governor/storage.rs:272`); `route.ts:32-38` `Promise.all`. |
| M1 | `#[when_paused] settle_auction` without auth `auction/src/contract.rs:352-355`; no `end_time` check `helpers.rs:153-168`. |
| M2 | `SlugToDao` written at create, never removed, `manager/src/contract.rs:753-755`. |
| L1 | Default `Ownable` on token `:651`, governor `:463`, auction `:127`; `OwnerNotSet` path `token:597-600`; 8 raw owner unwraps in auction. |
| L2 | `sub_invocations: vec![e]` `treasury/src/contract.rs:184`. |
| L3 | Fee and asset snapshotted from config `marketplace/src/contract.rs:236-237`; `MAX_FEE_BPS = 10_000`. |
| L4 | Uncapped `batch_mint` total; per-token metadata loop `metadata/src/contract.rs:295-297`; budget exhaustion is not caught by `try_`. |
| Errors | See §3. |
| Storage | Unbounded metadata setters `metadata/src/contract.rs:449-510`; `MintAuthority` in instance `token:149-151`; Minter never extends its instance; threshold ≈ extend-to in auction, marketplace, metadata, `PendingRefund`, governor; `batch_mint` Owner writes without TTL `token:369-373`. |
| Architecture | Proposal events lack `vote_start` and quorum `governor:625-635`; latest regression `manager:131-136`; `launch_dao` skips the pause; `DAY_IN_LEDGERS` defined in 6 crates; two auction lifecycle flags; no migrate path `common/src/upgrade.rs:93-111`; stale docs at the locations listed in the PRs. |
