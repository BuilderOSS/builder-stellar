# Release plan: promote `dev` to `main` (release 1)

Status: **phase 1 done** (2026-11-21); the decisions below were taken as recommended. Nothing on chain has run. Every step marked **(approval)** is outward-facing
and waits for an explicit go-ahead at the time it runs; the `testnet-admin` key signs only those.

## What ships

`dev` is 159 commits ahead of `main` (frozen since 2026-11-11, #71) and `main` has nothing `dev` lacks,
so the promotion is a fast-forward-style merge with no conflicts.

| Piece | `main` today (www.tribes.build) | After the release |
|---|---|---|
| Web app | `builder-stellar-web`, `main` @ `8ffc2ca` | `dev` @ the release commit |
| Manager `CCLBJAC5…EK72ZD` | `f5b32ab1…` (deployed 2026-10-13) | the Manager on `dev` (vote sources) |
| Governor | `41ad48e8…` (0.4.0) | the Governor on `dev` (reads its vote source) |
| Metadata | `44a0c4b6…` (0.4.0) | the Metadata on `dev` (no behaviour change; rebuilt) |
| Token, Auction, Treasury, Marketplace, ClaimMinter | as deployed | **unchanged**: identical hashes on both Managers |
| Database (Neon `production` branch) | migrations to 0010 | + `0011_vote_sources.sql` |
| Goldsky `builder-stellar-testnet` | `main`'s pipeline | `dev`'s pipeline (adds `vote_source_approved`) |
| Docs (docs.tribes.build) | already from `dev` | unchanged |

Production holds 9 tribes. The Manager's upgrade notice is 720 ledgers (about one hour).

Contract changes since `main`: the governance vote-source adapter (`docs/designs/governance-adapter.md`):
Manager `approve_vote_source` and events, `GovernanceConfig.vote_source` in `create_dao`, and the Governor
reading votes through `VoteSourceApi`; plus a clippy-only change in Metadata. No storage layout changes,
so no `migrate()` step.

## Decisions needed before step 1

1. **Version numbers: decided, Manager, Governor and Metadata 0.5.0** (`releases/contracts.json`); the other
   five stay 0.4.0. A version is a registry label, not part of the build (`version()` reads the Manager's
   registry), so 0.5.0 is byte for byte the code dev runs today. The dev Manager keeps its own records,
   which label the same hashes 0.4.0; records are write-once and dev is a test environment, so that stays.
   **Metadata 0.5.0 changes nothing for members** (a refactor), so production registers it for new tribes
   but doesn't announce it as latest: existing tribes are never asked to vote on it.
2. **Migration 0011 on the production database.** It was held back on purpose. The release needs it:
   confirm it may now be applied (phase 4).
3. **Existing production tribes.** Each of the 9 tribes upgrades its Governor and Metadata by its own vote,
   whenever it chooses; nothing forces them. Recommended: leave them to opt in, and upgrade the three
   `builder-testnet-dao-*` tribes we run ourselves as the first proof.
4. **When `main` unfreezes.** The release ends with `dev` merged into `main`. Pick a window: the factory is
   paused for about 1.5 hours (the Manager notice plus the deploy).

## Phase 1: prepare on `dev` (a normal PR, docs in the same PR)

1. Done: Manager, Governor and Metadata are 0.5.0 in `releases/contracts.json`, with release notes for
   members in `apps/web/src/lib/release-notes.ts`.
2. Done: the build reproduces the dev Manager's hashes exactly. Release hashes: Manager `ab1d0d17…`,
   Governor `8bc3a922…`, Metadata `a378c228…`.
3. Done: `contracts/e2e/src/release_0_5_0.rs` runs the release against production's **deployed** code
   (fixtures fetched by hash, `contracts/e2e/fixtures/README.md`). It checks that the other five modules are
   byte-identical to production, then runs, in order: pause; the Manager upgrade, refused before its 720
   ledgers and done after; stored tribes and slugs still read; Governor and Metadata 0.5.0 registered,
   approved and made current; no creation while paused; unpause; a tribe left in setup launches on its
   0.4.0 Governor; a new tribe gets 0.5.0 and votes by token; a live tribe upgrades Governor and Metadata in
   one proposal through the Treasury (same art, stale `from` refused) and then passes a quorum change on
   the new code. Production already records its Manager as 0.4.0, so the upgrade script needs no
   `LEGACY_MANAGER_VERSION`.
4. Production pin: add `MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json` to the
   `builder-stellar-web` Production environment **(approval, Vercel)**. Without it, the promoted build
   picks the newer dev Manager artifact (`docs/DEV_DEPLOYMENT.md`).
5. Docs in the same PR: `docs/CONTRACT_UPGRADES.md` (this release as the worked example), the upgrades
   concept page and release notes on docs.tribes.build, `TODOS.md`.

## Phase 2: rehearse on a copy of production (no testnet-admin needed)

The dev Manager already runs the release code, so it can't rehearse the upgrade. Instead, deploy a
throwaway Manager on testnet **from production's own code** (the three fixtures plus the five unchanged
modules), with an e2e key as its admin and a 1-ledger notice, and run phases 5 and 6 against it with the
real scripts:

1. `deploy-manager.mjs` with a rehearsal config (`configs/testnet-rehearsal-manager.json`, label
   `rehearsal`) pointing at the fixture WASMs; create, set up and launch one tribe on it, and leave one
   in setup.
2. Run phase 5 exactly as written, with `DEPLOY_IDENTITY` set to the rehearsal admin.
3. Point a local walkthrough build at it (`E2E_MANAGER_ARTIFACT=deploys/rehearsal-testnet-manager.json`)
   and run W16 (the live tribe upgrades by proposal), W03 and W04 (a new tribe) and W07 (proposals on the
   new Governor).

The rehearsal Manager is never indexed by a shared pipeline; the walkthroughs read chain state directly
where the read model would be needed, or a scratch Neon branch holds its read model. Anything found is
fixed on `dev` and phase 2 repeats.

## Phase 3: freeze window opens

1. Announce the window. Merge nothing else into `dev` until phase 6 ends.
2. Snapshot the production database (Neon branch from `production`) **(approval)**.
3. Record the production Manager's state: `current_implementations`, latest pointers, `upgrade_delay`, and
   every tribe's module hashes (`manager.module_versions`). This is the rollback reference.

## Phase 4: indexer and database (indexer first, so the first new event is decoded)

1. Apply 0011 and refresh grants on the production branch **(approval)**:
   `./db/migrate.sh "$ADMIN_DATABASE_URL"`, then `./db/grant-permissions.sh "$ADMIN_DATABASE_URL"`.
2. Apply `dev`'s pipeline to `builder-stellar-testnet` in place (`./scripts/deploy.sh deploy`, prod env)
   **(approval)**. It only adds an event, so no replay.
3. Check `/api/health` on www.tribes.build stays healthy (the current `main` app ignores the new column).

## Phase 5: contracts on the production Manager (testnet-admin, each **approval**)

0. Build on the release machine with **rustc 1.95.0 and stellar-cli 28.0.0** (`pnpm contracts:build`),
   then `cargo test -p dao-e2e release_0_5_0 -- --include-ignored`. The ignored test checks that the three
   released contracts are exactly the hashes dev has run, and the other five exactly production's. Another
   compiler gives other bytes (CI uses the latest stable Rust), so never upload a build that fails it.
1. `pause_factory`: new tribes wait; existing tribes work normally.
2. Manager 0.5.0: `upgrade-contract.mjs manager configs/testnet-manager.json f5b32ab1…` (registers the old
   hash as 0.4.0 if needed, approves, announces). Wait 720 ledgers, rerun to `upgrade_manager`.
3. Governor 0.5.0 and Metadata 0.5.0: upload, `register_implementation`, `approve_upgrade` from each hash a
   production tribe runs (`41ad48e8…`, `44a0c4b6…`, and any other found in phase 3). Then
   `set_latest_implementation` for **Governor only**: Metadata stays unannounced (decision 1).
4. `set_current_implementations` with the two new hashes and the five unchanged ones.
5. Verify read-only: `version`, `wasm_hash` on the Manager; the registry rows; `current_implementations`.

## Phase 6: promote the web app, then reopen

1. Open the `dev` → `main` PR (the only PR ever opened into `main`) **(approval to merge)**. Vercel deploys
   www.tribes.build from `main`.
2. Smoke test on www.tribes.build: sign in, a tribe page, a proposal page, Market, Manage → Contract upgrades
   showing "Governor and Metadata 0.5.0 available" on a production tribe.
3. `unpause_factory`, then create one tribe on production to prove the new `create_dao`.
4. Release check (`docs/qa/WALKTHROUGHS.md`): Freighter on a real device, sign in, vote, sign out.
5. Upgrade one of our own `builder-testnet-dao-*` tribes by proposal, the first production proof of the
   module upgrade.

## Rollback

| Failure | Response |
|---|---|
| Phase 4 breaks the current app | `./db/rollback.sh --steps 1`; reapply `main`'s pipeline |
| Manager upgrade fails before `upgrade_manager` | Nothing changed on chain; keep the factory paused, fix, retry |
| Manager misbehaves after upgrade | Approve the reverse path to `f5b32ab1…` and upgrade back (no storage change), keep the factory paused |
| Bad Governor or Metadata release | `set_latest_implementation` back to the 0.4.0 hashes and `revoke_implementation` the 0.5.0 hash; tribes already on it upgrade back by proposal |
| Web build broken | Revert the merge on `main` (Vercel redeploys); the pinned artifact keeps the Manager right |

## Not in this release

- W16 needs the admin's three registry steps on dev each time it runs. Its fixture tribe `e2e-w16` was
  upgraded to Metadata 0.4.1 by proposal on 2026-11-19 (read on chain: version 0.4.1, storage version 2).
  The phase 2 rehearsal covers it again with a fresh fixture.
- Mainnet. This release stays on Stellar testnet.
