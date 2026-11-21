# Release plan: promote `dev` to `main` (release 1)

Status: **draft for review**. Nothing here has run. Every step marked **(approval)** is outward-facing
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

1. **Version numbers.** Both Managers register these three contracts as 0.4.0, but with different hashes,
   and registry records are write-once. The release needs new versions. Recommended: **Manager, Governor
   and Metadata 0.5.0** in `releases/contracts.json` and each `Cargo.toml`; the other five stay 0.4.0. A new
   version changes the build, so dev takes the same 0.5.0 hashes first (phase 2), which doubles as the
   rehearsal.
2. **Migration 0011 on the production database.** It was held back on purpose. The release needs it:
   confirm it may now be applied (phase 4).
3. **Existing production tribes.** Each of the 9 tribes upgrades its Governor and Metadata by its own vote,
   whenever it chooses; nothing forces them. Recommended: leave them to opt in, and upgrade the three
   `builder-testnet-dao-*` tribes we run ourselves as the first proof.
4. **When `main` unfreezes.** The release ends with `dev` merged into `main`. Pick a window: the factory is
   paused for about 1.5 hours (the Manager notice plus the deploy).

## Phase 1: prepare on `dev` (a normal PR, docs in the same PR)

1. Bump Manager, Governor and Metadata to 0.5.0 (`releases/contracts.json`, crate versions).
2. Build (`pnpm contracts:build`), record the three new hashes.
3. Upgrade tests against the **deployed production** code (`docs/CONTRACT_UPGRADES.md` §2): fetch
   `f5b32ab1…`, `41ad48e8…` and `44a0c4b6…` as fixtures and test, in `contracts/e2e`: Manager upgrade with the
   factory paused and resumed; a live tribe upgrading Governor and Metadata in one proposal through the
   Treasury, then proposing and voting on the new code; and the rejections (unapproved, stale, revoked).
4. Production pin: add `MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json` to the
   `builder-stellar-web` Production environment **(approval, Vercel)**. Without it, the promoted build
   picks the newer dev Manager artifact (`docs/DEV_DEPLOYMENT.md`).
5. Docs in the same PR: `docs/CONTRACT_UPGRADES.md` (this release as the worked example), the upgrades
   concept page and release notes on docs.tribes.build, `TODOS.md`.

## Phase 2: rehearse on the dev Manager (testnet-admin, **approval**)

The dev Manager runs the current `dev` hashes as 0.4.0. Run the production sequence against it with the
0.5.0 build, end to end:

1. `pause_factory`.
2. Manager: `upgrade-contract.mjs manager configs/testnet-dev-manager.json ab1d0d17…`, wait 720 ledgers, rerun.
3. Governor and Metadata: register 0.5.0, approve `from → 0.5.0`, `set_latest_implementation`,
   `set_current_implementations` (all seven hashes).
4. Merge the phase 1 PR so dev.tribes.build runs the matching web build; `unpause_factory`.
5. Verify: W16-style upgrade of one dev tribe by proposal; create a new tribe (W03 and W04); the full
   walkthrough suite on dev (W01 to W17), as on 2026-11-20.

Anything found here is fixed on `dev` and phase 2 repeats from the failed step.

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

1. `pause_factory`: new tribes wait; existing tribes work normally.
2. Manager 0.5.0: `upgrade-contract.mjs manager configs/testnet-manager.json f5b32ab1…` (registers the old
   hash as 0.4.0 if needed, approves, announces). Wait 720 ledgers, rerun to `upgrade_manager`.
3. Governor 0.5.0 and Metadata 0.5.0: upload, `register_implementation`, `approve_upgrade` from each hash a
   production tribe runs (`41ad48e8…`, `44a0c4b6…`, and any other found in phase 3),
   `set_latest_implementation`.
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
