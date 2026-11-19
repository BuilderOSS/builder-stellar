# Walkthroughs runbook

The walkthrough suite drives the real app in a browser, against testnet, through every user flow
(plan: `docs/plans/walkthroughs-and-docs.md` §3). It lives in `apps/e2e`. This page is the runbook:
the exact commands to set it up, run it, read the results and look after the dev Manager.

Today (phase P1) it has the harness and one smoke flow, **W01**: connect a wallet, sign in with
SEP-53, sign out, refuse a signature, and fall back to SEP-10. Chain flows (W03 onwards) arrive in P2
and need the dev Manager below.

All commands run from the repository root unless a `cd` says otherwise.

## How it fits together

```
Playwright (Node, apps/e2e)                     Browser (Chromium)
  E2ESigner  holds the e2e keypairs   <──────   window.__e2eSign(request)
  (src/wallet/signer.ts)              binding   E2E Wallet module in the kit's modal
        │                                       (apps/web/src/lib/e2e-wallet)
        │ signs, testnet only                          │
        ▼                                              ▼
  Soroban RPC / Horizon (testnet)       next start of apps/web/.next-e2e on :4343
                                        (built with NEXT_PUBLIC_E2E_WALLET=1)
```

- **E2E Wallet.** A Stellar Wallets Kit module that shows up in the real connect modal. It forwards
  `getAddress`, `getNetwork`, `signTransaction`, `signMessage` (SEP-53) and `signAuthEntry` to a
  Playwright binding. Secrets stay in the test process (decision E2). It exists only in a build made
  with `NEXT_PUBLIC_E2E_WALLET=1`: every `pnpm build` runs `apps/web/scripts/assert-e2e-wallet.mjs`,
  which fails a production build that contains it (CI runs this on every PR).
- **Signer.** Signs for testnet only. A test can switch accounts (`wallet.use('e2e-member-a')`),
  refuse the next call (`wallet.rejectNext('signMessage')`), refuse everything (`wallet.rejectAll()`)
  or answer "unsupported" (`wallet.unsupportedNext('signMessage')`). Signing is locked per account: a
  transaction is signed only after the previous one from that account has landed, and a reused
  sequence fails at once with `SequenceCollisionError` instead of `tx_bad_seq` later.
- **One identity per concurrent timeline.** Two flows that run at the same time never share an
  account. `@chain` specs run in `*-chain` projects with one worker, one after another, because
  the signer's per-account lock and `IdentityClaims` (`src/identities.ts`) only see one worker
  process. `@matrix` specs run in parallel, so they may sign messages but never submit a
  transaction.
- **Waits are conditions.** `waitForLedgerTime`, `waitForIndexed` and `waitForUi` in `src/waits.ts`
  each take the governing duration (a 300s voting period, say) and fail with their own class:
  `[ledger-late]`, `[indexer-late]` or `[ui-timeout]`. An `indexer-late` failure means Goldsky is
  behind, not that the app is broken.
- **Coverage.** `@matrix` specs run at mobile 375×812, tablet 768×1024 and desktop 1440×900, each in
  light and dark (6 Playwright projects). `@chain` specs run at desktop in dark; `E2E_ROTATION=1` (the
  weekly run) adds mobile and tablet. The theme is set through the `builder.warm-ink.theme.v1`
  localStorage key before the page loads.

## One-time setup

Prerequisites: Node 23+, pnpm 10, the Stellar CLI 28 (`stellar --version`), and Playwright's
Chromium.

```bash
pnpm install
```

```bash
pnpm --dir apps/e2e exec playwright install chromium
```

On macOS, cargo needs the SDK path for `stellar contract build` (only the preflight's contract check
builds contracts):

```bash
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk
```

### Identities

The suite uses these `stellar keys` identities on the machine that runs it:

| Identity | Used for |
|---|---|
| `e2e-founder` | The default wallet account; deploys and launches tribes |
| `e2e-member-a`, `e2e-member-b` | Second and third voters, bidders and buyers |
| `e2e-operator` | Reads the Manager's views in the preflight |
| `e2e-web-auth` | The app server's SEP-53/SEP-10 signing key (`STELLAR_WEB_AUTH_SECRET`), not a wallet |

The preflight creates any that are missing (`stellar keys generate`, stored locally) and funds them
through Friendbot. It prints names and public addresses only.

```bash
pnpm --dir apps/e2e preflight --skip-build
```

`--skip-build` skips `stellar contract build`; leave it off once the dev Manager exists, so the
contract check compares against a fresh build.

### Database (optional for W01)

The app reads its read model from Postgres. W01 doesn't need it: the home page shows "Tribes didn't
load" without one, and sign-in still works. Chain flows need the dev read model (see the dev Manager
below). Put its read-only URL in `apps/e2e/.env.local` (gitignored):

```bash
echo 'APP_DATABASE_URL=postgres://app_server:…@…/builder_e2e?sslmode=require' > apps/e2e/.env.local
```

## Run W01

1. Build the walkthrough app (testnet, the E2E Wallet on, into `apps/web/.next-e2e`). Rebuild after
   any change to `apps/web`.

   ```bash
   pnpm --dir apps/e2e build:app
   ```

   The build ends with `✓ E2E Wallet present (walkthrough build, …)`.

2. Run the smoke flow. Playwright starts `next start` on port 4343 with a fresh session password and
   the `e2e-web-auth` key, runs the preflight, then W01 at all six viewport × theme projects.

   ```bash
   pnpm --dir apps/e2e smoke
   ```

   Skip the preflight on a quick re-run with `E2E_SKIP_PREFLIGHT=1`:

   ```bash
   E2E_SKIP_PREFLIGHT=1 pnpm --dir apps/e2e smoke
   ```

   One project only:

   ```bash
   pnpm --dir apps/e2e smoke --project=mobile-dark
   ```

3. Read the results. Each run writes `apps/e2e/reports/<run-id>/` (gitignored):

   | File | What |
   |---|---|
   | `summary.json` | One row per test: flow id, project (viewport × theme), status, and for a failure its class (`ledger-late`, `indexer-late`, `ui-timeout` or `assertion`) |
   | `results.json` | Playwright's full JSON report |
   | `preflight.json` | Identities (public addresses) and the Manager check |
   | `html/` | The HTML report |
   | `artifacts/` | Trace, video and screenshot for each failed test |

   Open the newest HTML report, or a given run's:

   ```bash
   pnpm --dir apps/e2e report
   ```

   ```bash
   pnpm --dir apps/e2e exec playwright show-trace apps/e2e/reports/<run-id>/artifacts/<test>/trace.zip
   ```

### Against a preview deployment

A Vercel preview built with `NEXT_PUBLIC_E2E_WALLET=1` can stand in for the local server. No server is
started then. The suite refuses `tribes.build` and the legacy production host.

```bash
E2E_BASE_URL=https://<preview>.vercel.app pnpm --dir apps/e2e smoke
```

### The harness's own tests

The signer, waits, preflight and summary logic have unit tests, which CI runs on every PR:

```bash
pnpm --dir apps/e2e test
```

```bash
pnpm --dir apps/e2e typecheck
```

```bash
pnpm --dir apps/web exec vitest run src/lib/e2e-wallet scripts
```

## Running walkthroughs in parallel

Chain flows in one run go one at a time (the `*-chain` projects have one worker), because two
flows signing from one account at once collide on sequence numbers. To run several walkthroughs at
the same time, start each run in its own worktree with its own timeline and port:

```bash
E2E_TIMELINE=w07 E2E_APP_PORT=4357 pnpm --dir apps/e2e test:e2e tests/w07-*.spec.ts
```

`E2E_TIMELINE` maps every wallet role (`e2e-founder`, `e2e-member-a`, `e2e-member-b`,
`e2e-operator`) to that timeline's own key (`e2e-w07-founder`, ...). The preflight creates and
funds them on first use. Specs keep using the role names. The app server's sign-in key stays
shared: it only signs challenges, never transactions. Build the walkthrough app once per worktree
with the same `E2E_APP_PORT`.

## The dev Manager

Chain flows run against **the dev deployment**: the testnet Manager behind dev.tribes.build, its
pipeline `builder-stellar-testnet-dev` and the Neon branch `dev` (`docs/DEV_DEPLOYMENT.md`). This
replaced a separate e2e Manager and pipeline on 2026-11-19: one deployment to keep current, and no
second pipeline to pay for. Walkthrough tribes are real tribes on dev.tribes.build; every one is
named with an `E2E ` prefix so they're easy to tell apart.

| Piece | Where |
|---|---|
| Manager artifact (committed) | `deploys/dev-testnet-manager.json` |
| Pipeline and database | `docs/DEV_DEPLOYMENT.md` |
| Override for another Manager | `E2E_MANAGER_ARTIFACT=<path>` |

`pnpm --dir apps/e2e build:app` pins the dev Manager through `MANAGER_DEPLOYMENT_FILE`. The app
server reads the dev read model through `APP_DATABASE_URL` in `apps/e2e/.env.local` (gitignored):
the dev branch's `app_server` URL, from the Neon console.

### When contracts change on `dev`

The preflight refuses to run when the dev Manager's `wasm_hash` or its `current_implementations`
differ from `stellar contract build` output, because a walkthrough against older contracts tests the
wrong code. That also means dev.tribes.build is behind `dev`: upgrade the dev deployment
(`docs/DEV_DEPLOYMENT.md`, step 1), then check:

```bash
pnpm --dir apps/e2e preflight --require-manager
```

## W16: contract upgrades

W16 (`apps/e2e/tests/w16-upgrades.spec.ts`) upgrades a live tribe's module by proposal on the dev
Manager. It needs a release the Manager has approved, and only the platform admin
(`testnet-admin`, the dev Manager's admin) can register and approve one. Walkthroughs never sign with
that key: the admin runs the three steps below by hand.

| Piece | Value |
|---|---|
| Fixture tribe | `e2e-w16` ("E2E Upgrades"), token `CDZAHLZEVT7UIFVYUG7QZRCSU5I55F47AD4L2ACIJUQHJF4ELDT54NKE`, artifact `deploys/dev-testnet-dao-16.json` |
| Module | Metadata (`CBSPRAKJ2OPRKLLDTRTKY62PD6DDLWE26TAZ5B6DYD2WOQEGNGNRCQVA`), the app's "Artwork and profile" |
| From | 0.4.0 `a378c2282e883327a3a919e70280033cc87e0279b6be5c924ccbd035a57370da`, storage version 1 |
| To (test-only) | 0.4.1 `d243d7922b1a7e4d26c9e835b39175689978edc9df6fd484503dccb1b4d78e29`, storage version 2 |

### The candidate

The 0.4.1 candidate is this checkout's Metadata with a test-only cargo feature,
`e2e-upgrade-candidate`, which sets `STORAGE_VERSION` to 2 (no data rewrite: the two layouts are the
same) and adds a contract-meta marker (`stellar contract info meta` shows `e2e_upgrade_candidate`). The
storage version bump is the only change members could observe, and it is there on purpose: the
release then needs `migrate()`, so W16 covers the upgrade and the migration in one proposal. It lives
on the local throwaway branch `test-only/w16-metadata-0.4.1-candidate` and as
[`w16-metadata-candidate.patch`](w16-metadata-candidate.patch); it is never merged. Rebuild it on a
throwaway worktree of the commit the dev Manager runs (the build is reproducible):

```bash
git worktree add -b test-only/w16-candidate ../w16-candidate HEAD
```

```bash
cd ../w16-candidate && git apply docs/qa/w16-metadata-candidate.patch
```

```bash
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk stellar contract build --package metadata --features e2e-upgrade-candidate
```

The build prints `Wasm Hash: d243d792…4d78e29`. Any funded account can upload code; W16's operator
did (transaction `33df77ec…198825b`, code TTL extended to ledger 6,326,328, about 30 days):

```bash
stellar contract upload --wasm target/wasm32v1-none/release/metadata.wasm --source-account e2e-w16-operator --network testnet
```

```bash
stellar contract extend --wasm-hash d243d7922b1a7e4d26c9e835b39175689978edc9df6fd484503dccb1b4d78e29 --ledgers-to-extend 518400 --source-account e2e-w16-operator --network testnet
```

### The fixture tribe

Core contracts only, the founder holds both tokens (so the founder alone passes proposals), 300s
voting delay, voting period and queue delay. `DEPLOY_IDENTITY` must be set: without it the script
signs with `testnet-admin`.

```bash
E2E_TIMELINE=w16 E2E_APP_PORT=4366 E2E_MANAGER_ARTIFACT=deploys/dev-testnet-manager.json pnpm --dir apps/e2e preflight
```

```bash
for phase in create_dao admin_checklist launch_dao; do DEPLOY_IDENTITY=e2e-w16-founder node scripts/deploy-dao.mjs $phase configs/e2e-walk-e2e-w16-dao.json configs/testnet-dev-manager.json; done
```

The fixture is single-use: once its proposal has run, Metadata is on 0.4.1 and the chain test stops
with "already on the candidate". For another run, copy the config with the next nonce and slug
(`e2e-w16b`, nonce 17) and update `W16` in `apps/e2e/src/upgrades.ts`.

### Platform admin steps (the admin approves each one)

Run in this order, from the repository root, as the dev Manager's admin. Each is one transaction,
about 0.1 to 0.15 testnet XLM in fees (step 1 simulates at 0.133 XLM). Records are write-once.

```bash
MGR=CDZOPJBWJXTISKCLWRARXM4BOXRCVRMMJMPLDYRV4OUAXQPHGQ26RTYY
```

1. Register the candidate as Metadata 0.4.1. Adds a registry record and nothing else: no tribe sees it
   or can use it yet.

   ```bash
   stellar contract invoke --id $MGR --network testnet --source-account testnet-admin -- register_implementation --name Metadata --version 0.4.1 --wasm_hash d243d7922b1a7e4d26c9e835b39175689978edc9df6fd484503dccb1b4d78e29
   ```

2. Approve the path 0.4.0 → 0.4.1. From now on **every** dev tribe running Metadata `a378c228…` (every
   tribe made since the dev Manager was deployed) *may* take the upgrade by its own vote; none is forced.
   An approval can't be deleted, only made useless by revoking the target (undo step 2).

   ```bash
   stellar contract invoke --id $MGR --network testnet --source-account testnet-admin -- approve_upgrade --from_hash a378c2282e883327a3a919e70280033cc87e0279b6be5c924ccbd035a57370da --to_hash d243d7922b1a7e4d26c9e835b39175689978edc9df6fd484503dccb1b4d78e29
   ```

3. Announce 0.4.1 as Metadata's latest. The app only offers an upgrade (Manage → Contract upgrades, the
   notice on the Manage overview and, for members, on the tribe home) for the latest release, so W16's
   notice checks need this. It shows "Artwork and profile 0.4.0 → 0.4.1" on **every** dev tribe on
   `a378c228…`, including other walkthrough tribes; run W16 when no other walkthrough checks those
   screens, and undo it afterwards. It does **not** change what new tribes get: `create_dao` deploys
   `current_implementations`, which stays on 0.4.0 (do not run `set_current_implementations`).

   ```bash
   stellar contract invoke --id $MGR --network testnet --source-account testnet-admin -- set_latest_implementation --name Metadata --wasm_hash d243d7922b1a7e4d26c9e835b39175689978edc9df6fd484503dccb1b4d78e29
   ```

Module upgrades don't wait for the Manager's `upgradeDelayLedgers` (720 ledgers on dev): that notice
gates `upgrade_manager` only. W16 can start as soon as step 3 lands. Check (read-only, any key):

```bash
stellar contract invoke --id $MGR --network testnet --source-account e2e-w16-operator --send no -- is_upgrade_approved --from_hash a378c2282e883327a3a919e70280033cc87e0279b6be5c924ccbd035a57370da --to_hash d243d7922b1a7e4d26c9e835b39175689978edc9df6fd484503dccb1b4d78e29
```

```bash
stellar contract invoke --id $MGR --network testnet --source-account e2e-w16-operator --send no -- latest_pointer --name Metadata
```

### Run W16

About 20 to 25 minutes: voting delay, voting period and queue delay of 300s each.

```bash
E2E_TIMELINE=w16 E2E_APP_PORT=4366 pnpm --dir apps/e2e build:app
```

```bash
E2E_TIMELINE=w16 E2E_APP_PORT=4366 pnpm --dir apps/e2e test:e2e tests/w16-upgrades.spec.ts
```

The `@matrix` test reads the registry and the module first and checks the screens for that state
(before the admin steps: up to date on 0.4.0; after: the notice and "1 upgrade available"; after the
proposal: up to date on 0.4.1, storage version 2). The `@chain` test fails at once, naming the missing
step, until all three admin steps have run. It then adds the upgrade (confirming the high-risk prompt)
and the storage migration to one proposal, submits it, votes For, queues, executes, and checks
`version()`, `wasm_hash()` and `storage_version()` on chain, the app's Contract upgrades page, and the
`Upgraded` and `Migrated` events in the activity feed.

### Undo afterwards (optional, the admin approves each)

1. Stop offering 0.4.1 to every other tribe: point Metadata's latest back at 0.4.0. Other tribes are
   back to "up to date". `e2e-w16`, already on 0.4.1, shows "Newer release not approved", which is
   true and harmless.

   ```bash
   stellar contract invoke --id $MGR --network testnet --source-account testnet-admin -- set_latest_implementation --name Metadata --wasm_hash a378c2282e883327a3a919e70280033cc87e0279b6be5c924ccbd035a57370da
   ```

2. Only if no tribe should ever take 0.4.1 again: revoke it. **Irreversible** (no un-revoke). It closes
   the approved path for every tribe; `e2e-w16` keeps running 0.4.1 and the app shows it as
   "Version withdrawn".

   ```bash
   stellar contract invoke --id $MGR --network testnet --source-account testnet-admin -- revoke_implementation --wasm_hash d243d7922b1a7e4d26c9e835b39175689978edc9df6fd484503dccb1b4d78e29
   ```

The registry record and the approval stay either way: records are write-once.

## When something fails

| Failure | Meaning | What to do |
|---|---|---|
| `[indexer-late] …` | The chain has the write but the read model doesn't yet | Check `GET /api/health` and the pipeline (`deploy.sh status`); re-run once it catches up |
| `[ledger-late] …` | Ledger time didn't reach the target in time | Testnet is slow or RPC is down; re-run |
| `[ui-timeout] …` | The page didn't reach the expected state | A real defect until shown otherwise: open the trace, then file it |
| `SequenceCollisionError` | Two timelines signed from one account | Give the timeline its own identity |
| Preflight: "does not run this checkout's contracts" | The dev Manager is behind `dev` | "When contracts change on `dev`" above |
| `E2E Wallet is in a build made without NEXT_PUBLIC_E2E_WALLET=1` | The test wallet leaked into a production build | Fix the guard in `apps/web/src/lib/wallet-kit.ts`; never ship it |

Every defect goes in `docs/qa/BUG_LEDGER.md` with a regression test at the lowest level that catches
it (plan §3.6). No `test.skip` without a ledger id.

## Release check

The E2E Wallet proves our code, not every wallet's. Once per release, sign in, vote and sign out with
Freighter on a real device against the release's preview deployment.
