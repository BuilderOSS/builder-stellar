# Walkthroughs runbook

The walkthrough suite drives the real app in a browser, against testnet, through every user flow
(plan: `docs/plans/walkthroughs-and-docs.md` §3). It lives in `apps/e2e`. This page is the runbook:
the exact commands to set it up, run it, read the results and look after the dev Manager.

Today (phase P1) it has the harness and one smoke flow, **W01**: connect a wallet, sign in with
SEP-53, sign out, refuse a signature, and fall back to SEP-10. Chain flows (W03 onwards) arrive in P2
and need the dev Manager below. W10 (marketplace) is described in "Run W10" below.

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

## Run W10 (marketplace)

W10 walks the marketplace on chain: a member lists a token from the token page with the guided List
for sale (Allow, then List), lists again while the permission is live (Allow skipped, one
signature), changes a price (cancel, allow, relist), another member comments and buys (the seller
is paid the price less the 2.5% resale fee, checked on Horizon and in the indexed sale), the seller
cancels, and a listing with a custom end of two or three minutes ends and comes back with Return my
token. Restock and pools need a governance proposal and are covered by W11. Its `@matrix` cases check
the Market and token pages (Sell entry, form defaults and presets, the signed-out Connect state, no
horizontal scroll) without signing a transaction.

It runs on the dev deployment (dev.tribes.build's Manager, pipeline and database) until the e2e
Manager exists, so point every step at the dev Manager artifact:

```bash
export E2E_MANAGER_ARTIFACT=deploys/dev-testnet-manager.json
```

```bash
pnpm --dir apps/e2e build:app && pnpm --dir apps/e2e preflight --require-manager
```

```bash
pnpm --dir apps/e2e exec playwright test tests/w10-marketplace.spec.ts
```

The chain cases run in order (one serial group) and take about six minutes at one viewport, most of
it the listing end and the indexer. `E2E_ROTATION=1` runs them again at tablet and mobile, one
viewport after another. Run one chain project at a time with `--no-deps`: several chain projects with
`--no-deps` start together and sign from the same identities at once. Before they start, `resetMarketFixture` (`apps/e2e/src/market-fixture.ts`) puts
the seller's tokens back: it cancels a listing an earlier run left open and sends back a token the
buyer bought, signing with the `stellar keys` identities, then waits for the indexer to agree.

### The W10 market fixture

"E2E Market" (slug `e2e-market`) is a marketplace-only tribe on the dev Manager, priced in native XLM
(its SAC) with a 2.5% resale fee. `e2e-founder` holds tokens 0-2 and `e2e-member-a` (the seller)
holds 3 and 4; `e2e-member-b` buys. Its config is `configs/e2e-walk-market-dao.json` and its deploy
artifact `deploys/dev-testnet-dao-1.json` (`E2E_MARKET_DAO_ARTIFACT` picks another one, for example after
a redeploy). To recreate it, for example on a new Manager, run the three phases as `e2e-founder`
(bump `nonce` in the config first if that deployer already used it on this Manager; the artifact is
named `deploys/<label>-testnet-dao-<nonce>.json`):

```bash
DEPLOY_IDENTITY=e2e-founder node scripts/deploy-dao.mjs create_dao configs/e2e-walk-market-dao.json configs/testnet-dev-manager.json
```

```bash
DEPLOY_IDENTITY=e2e-founder node scripts/deploy-dao.mjs admin_checklist configs/e2e-walk-market-dao.json configs/testnet-dev-manager.json
```

```bash
DEPLOY_IDENTITY=e2e-founder node scripts/deploy-dao.mjs launch_dao configs/e2e-walk-market-dao.json configs/testnet-dev-manager.json
```

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
