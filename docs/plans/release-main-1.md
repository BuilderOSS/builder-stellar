# Release plan: promote `dev` to `main` (release 1)

Status: **released 2026-11-21.** www.tribes.build runs `dev` @ `f1b07fb` on the upgraded production Manager.
Records: `deploys/release-1/pre-release-state.json` and `post-release-state.json`. Every step marked **(approval)** is outward-facing
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
   **Metadata 0.5.0 changes nothing for members** (a refactor). The plan was to register it for new tribes
   without announcing it. In production that made every tribe on 0.5.0 (new tribes, and `builder-auctions`)
   read "Newer release not approved", because the app compares a tribe's version with the announced
   latest. So Metadata 0.5.0 was announced too (`53f4e0c3…`). Tribes still on 0.4.0 see it as an optional
   upgrade, with its "Maintenance only" note, in the same vote as the Governor.
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
4. Done (2026-11-21): `MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json` is set on
   `builder-stellar-web` (team Nouns Builder), Production only. It's a sensitive variable, so it can't
   be read back; check it after promotion: the build log says "Web deployment set to manager:CCLBJAC5… (builder-testnet-manager.json)". Without it, the
   promoted build would pick the newer dev Manager artifact (`docs/DEV_DEPLOYMENT.md`).
   `builder-stellar-dev` pins `deploys/dev-testnet-manager.json`.
5. Docs in the same PR: `docs/CONTRACT_UPGRADES.md` (this release as the worked example), the upgrades
   concept page and release notes on docs.tribes.build, `TODOS.md`.

## Phase 2: rehearse on a copy of production (done 2026-11-21, e2e keys only)

The dev Manager already runs the release code, so the rehearsal ran on a throwaway copy of production:

1. **Production's build reproduces.** A worktree at production's source commit (`c20c822`), built with
   rustc 1.95.0 and stellar-cli 28.0.0, gives all eight hashes production runs.
2. **A rehearsal Manager from that commit.** `deploy-manager.mjs` from `c20c822`, with
   `configs/rehearsal/testnet-rehearsal-manager.json` (admin `e2e-rehearsal-admin`, a 60-ledger notice instead of
   720), deployed `CBOGG6KM…BQJX4` (`deploys/rehearsal/rehearsal-testnet-manager.json`). On it, that commit's
   `deploy-dao.mjs` created `rehearsal-live` (launched, with auction and market) and `rehearsal-pending`
   (left in setup).
3. **Phase 5 exactly as written below,** from `dev`, with `DEPLOY_IDENTITY=e2e-rehearsal-admin`:
   - while paused, `create_dao` was refused with `FactoryPaused` (7111);
   - the Manager moved to 0.5.0 after its notice, and its tribes and slugs still resolved;
   - Governor and Metadata 0.5.0 were registered and approved, Governor announced, current hashes set.
4. **Phase 6's chain steps.**
   - After `unpause_factory`, `rehearsal-pending` launched on its 0.4.0 Governor.
   - `rehearsal-new` was created and launched with `dev`'s `deploy-dao.mjs` and runs Governor and
     Metadata 0.5.0.
   - `rehearsal-live` upgraded Governor and Metadata in **one proposal**, voted by its founder and executed
     through the Treasury (proposal `94a7f852…`, 11:12 to 11:27 UTC). After it, both read 0.5.0 at
     `8bc3a922…` and `a378c228…`. The token's traits were unchanged, and the Governor still votes with
     the tribe's own token.
   - A second proposal on the new Governor raised the quorum from 1,000 to 1,500 bps (`4e6fbcfe…`, executed
     11:43 UTC): the upgraded tribe governs as before.

**What it changed in the plan.** All of these are folded into phase 5 below:
- the Manager script needs `LEGACY_MANAGER_VERSION=0.4.0` (it skips registering when the record exists);
- the module script must get a **launched** tribe's config (it upgrades a tribe in setup directly), and
  one whose nonce has a deploy artifact (`configs/testnet-builder-dao-1.json`);
- the script doesn't move latest or current pointers;
- the Manager has no paused getter, so a refused `create_dao` simulation is the check.

## Production checks (done 2026-11-21, read-only)

Production runs its own deployment, separate from dev.tribes.build, so each piece was checked on its own:

| Piece | Production today | Release impact |
|---|---|---|
| Contracts | All 8 hashes rebuild from `c20c822` | Only Manager, Governor and Metadata change |
| Tribes | 9; all on Governor `41ad48e8…` and Metadata `44a0c4b6…` (`manager.module_versions`) | The two approvals in phase 5 cover every tribe |
| Vercel `builder-stellar-web` (team Nouns Builder) | Builds `main` from `apps/web` | The only new variables `dev` reads: `MANAGER_DEPLOYMENT_FILE` (now set), `NEXT_PUBLIC_DOCS_URL` (defaults to docs.tribes.build), and two walkthrough-only ones that must stay unset there. `NEXT_PUBLIC_SITE_URL` falls back to `https://tribes.build`, as today |
| Database (Neon `production`) | Migrations 0001 to 0010 | The ten files on `dev` match production's recorded checksums byte for byte, so `migrate.sh` applies 0011 only |
| Goldsky `builder-stellar-testnet` | Settings existed only in a local `.env.local` | Now `packages/goldsky/prod.env`. Generated from `dev`, the pipeline equals `dev`'s committed `builder-stellar-events.yaml` and differs from `main`'s only by the `VoteSourceApproved` event: no replay |

## Phase 3: freeze window opens

1. Announce the window. Merge nothing else into `dev` until phase 6 ends.
2. Snapshot the production database (Neon branch from `production`) **(approval)**.
3. Record the production Manager's state: `current_implementations`, latest pointers, `upgrade_delay`, and
   every tribe's module hashes (`manager.module_versions`). This is the rollback reference.

Done 2026-11-21: Neon branch `pre-release-1-2026-11-21` (`br-falling-shadow-b5zt02o1`, no compute) holds
production as it was. `deploys/release-1/pre-release-state.json` records the Manager: 0.4.0, notice 720,
admin `GCLGEIQB…`, and every latest pointer and current hash.

## Phase 4: indexer and database (indexer first, so the first new event is decoded)

1. Apply 0011 and refresh grants on the production branch **(approval)**:
   `./db/migrate.sh "$ADMIN_DATABASE_URL"`, then `./db/grant-permissions.sh "$ADMIN_DATABASE_URL"`.
2. Apply the pipeline in place **(approval)**, from `packages/goldsky`:
   `GOLDSKY_ENV_FILE=prod.env ./scripts/deploy.sh deploy`. It only adds an event, so no replay.
3. Check `/api/health` on www.tribes.build stays healthy (the current `main` app ignores the new column).

Done 2026-11-21:
- **Database.** 0011 was applied through Neon's SQL tool in one transaction: both views, the read grant on
  `manager.vote_sources`, and the ledger row with the file's checksum, exactly as `migrate.sh` records it.
  `app_server` reads both views; all 9 tribes read as token-weighted.
- **Pipeline.** `builder-stellar-testnet` was applied from `prod.env`. It runs and fetches current ledgers.
- **App.** www.tribes.build stayed healthy, and its pages answered 200.

## Phase 5: contracts on the production Manager (testnet-admin, each **approval**)

0. Build on the release machine with **rustc 1.95.0 and stellar-cli 28.0.0** (`pnpm contracts:build`),
   then `cargo test -p dao-e2e release_0_5_0 -- --include-ignored`. The ignored test checks that the three
   released contracts are exactly the hashes dev has run, and the other five exactly production's. Another
   compiler gives other bytes (CI uses the latest stable Rust), so never upload a build that fails it.
1. Pause: `stellar contract invoke --id $MGR --network testnet --source-account testnet-admin -- pause_factory`.
   Check: simulating `create_dao` (`deploy-dao.mjs create_dao` with any new config) fails with 7111.
   Existing tribes keep working.
2. Manager 0.5.0, run twice, the second time after 720 ledgers (the first run prints the ledger):
   `LEGACY_MANAGER_VERSION=0.4.0 DEPLOY_IDENTITY=testnet-admin node scripts/upgrade-contract.mjs manager configs/testnet-manager.json f5b32ab19f0817a563606c9a88ab290da05871a8bf21e006fb408406659e69c1`.
   Check: the Manager's `version` is `0.5.0` and `wasm_hash` is `ab1d0d17…`.
3. Governor and Metadata 0.5.0, each with a **launched** tribe's config: `configs/testnet-builder-dao-1.json`
   (`builder-auctions`, extracted from its deploy artifact; the older `configs/testnet-builder-dao.json` has
   nonce 0, which no artifact matches, so the script would stop with "DAO artifact not found").
   The script uploads, registers, approves, and writes a proposal payload, but sends nothing to the tribe:
   `DEPLOY_IDENTITY=testnet-admin node scripts/upgrade-contract.mjs governor configs/testnet-builder-dao-1.json configs/testnet-manager.json 41ad48e8fdbe4a4229ce7821fd207c1c7d06033a24e6bfa09efeb74a02b054dd`,
   and the same for `metadata` from `44a0c4b673638b70ce8d8e9554db7903c208d00047c5e732db015b9942e62efb`.
   Approve any other `from` hash found in phase 3 with `approve_upgrade`.
4. Announce Governor only: `set_latest_implementation --name Governor --wasm_hash 8bc3a922…` (Metadata
   stays unannounced, decision 1).
5. New tribes: `set_current_implementations` with Governor `8bc3a922…`, Metadata `a378c228…` and the five
   unchanged hashes (Token `3f36abc9…`, Auction `8130c851…`, Treasury `597a9e04…`, Marketplace
   `f28ebc99…`, ClaimMinter `e1c18db9…`).
6. Verify read-only: the Manager's `version` and `wasm_hash`; `latest_pointer --name Governor`;
   `current_implementations`; `get_dao_by_slug` for a few production tribes.

## Phase 6: promote the web app, then reopen

1. Open the `dev` → `main` PR (the only PR ever opened into `main`) **(approval to merge)**. Vercel deploys
   www.tribes.build from `main`.
2. Smoke test on www.tribes.build: sign in, a tribe page, a proposal page, Market, Manage → Contract upgrades
   showing "Governor 0.5.0 available" on a production tribe (Metadata isn't announced).
3. `unpause_factory`, then create one tribe on production to prove the new `create_dao`.
4. Release check (`docs/qa/WALKTHROUGHS.md`): Freighter on a real device, sign in, vote, sign out.
5. Upgrade one of our own `builder-testnet-dao-*` tribes by proposal, the first production proof of the
   module upgrade.

## Release record (2026-11-21)

| Step | Result |
|---|---|
| 5.0 | The release-toolchain check passed (3 tests) |
| 5.1 | Factory paused, `39c25e30…` |
| 5.2 | Manager 0.5.0 (`ab1d0d17…`) after its 720-ledger notice; tribes and slugs resolved |
| 5.3 to 5.5 | Governor and Metadata 0.5.0 registered and approved from `41ad48e8…` and `44a0c4b6…`; Governor announced; current hashes set |
| 6.1 | `dev` → `main` (#114) merged by an admin, as `main` requires one review; Vercel `dpl_5er9v1Jv…` logged "Web deployment set to manager:CCLBJAC5… (builder-testnet-manager.json)", with the test wallet absent |
| 6.2 | Smoke test: health, every tribe page and Manage → Contract upgrades answer; the indexer had each event within about 2 seconds |
| 6.3 | Factory unpaused, `12ea377d…`. `create_dao` was proven by **simulation** with `dev`'s parameters (`DaoCreated`), so no permanent test tribe sits on production |
| 6.4 | Freighter release check on a real device: **to do by hand** |
| 6.5 | `builder-auctions` upgraded Governor and Metadata by proposal `2967c11f…`, executed 13:27 UTC through its Treasury (same art, same vote source) |
| Follow-up | Metadata 0.5.0 announced, `53f4e0c3…` (see decision 1) |

Not reversed or cleaned up: the Neon snapshot branch `pre-release-1-2026-11-21` (no compute, kept as the
rollback point) and the rehearsal Manager on testnet (kept for reference).

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
