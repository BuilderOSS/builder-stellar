# dev.tribes.build: the `dev` deployment

`dev` gets its own deployment: its own Manager, database, pipeline and hostname. Production
(tribes.build) runs `main`, which moves only by a release promotion (`docs/AGENT_WORKFLOW.md`),
against the original testnet Manager, and nothing here touches it.

| Piece | Production (tribes.build) | Dev (dev.tribes.build) |
|---|---|---|
| Git branch | `main` (release promotions only) | `dev` |
| Manager config | `configs/testnet-manager.json` (label `builder`) | `configs/testnet-dev-manager.json` (label `dev`) |
| Manager artifact | `deploys/builder-testnet-manager.json` | `deploys/dev-testnet-manager.json` |
| Database | Neon `stellar-builder-testnet`, branch `production` | same project, branch `dev` |
| Goldsky secret | `BUILDER_POSTGRES_SECRET` | `BUILDER_DEV_POSTGRES_SECRET` |
| Pipeline | `builder-stellar-testnet` (`packages/goldsky/prod.env`) | `builder-stellar-testnet-dev` (`packages/goldsky/dev.env`) |
| Vercel project | `builder-stellar-web` (production branch `main`) | `builder-stellar-dev` (production branch `dev`) |
| Docs | `builder-stellar-docs` (production branch `dev`), docs.tribes.build, one site for both | |

Both run on Stellar testnet. The Manager admin for both is `testnet-admin`
(`GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO`): one key for both Managers, so a leak of it gives
the holder both. [Key custody](KEY_CUSTODY.md#separate-dev-and-production-admins) has the steps to give dev
its own admin.

## Which Manager a build indexes

`scripts/generate-web-deployment.mjs` picks the newest `deploys/*-manager.json` by `deployedAt`
unless `MANAGER_DEPLOYMENT_FILE` pins one. `dev` holds both artifacts, and the dev one is
newer, so:

- the `dev` Vercel environment pins `MANAGER_DEPLOYMENT_FILE=deploys/dev-testnet-manager.json`
  (explicit, rather than relying on dates);
- **production must pin `MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json` before
  `dev` is ever promoted to `main`**, or tribes.build would silently switch to the dev Manager
  and a database that doesn't hold it. The variable is harmless on today's `main`, which
  doesn't read it.

## 1. Manager

```bash
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk \
  pnpm deploy:manager configs/testnet-dev-manager.json
```

This builds the contracts from the checkout, uploads and registers all eight, sets the current
implementations and writes `deploys/dev-testnet-manager.json` (commit it to `dev`). It builds natively
with the pinned compiler (`rust-toolchain.toml`) and whichever `stellar` is on the `PATH` (install
28.0.0, as the README describes), so the hashes it registers are this machine's build: on macOS they differ from the published release hashes, which come from the
container build ([reproducible builds](REPRODUCIBLE_BUILDS.md)). It does not yet check them against
`releases/hashes.json`; `scripts/upgrade-contract.mjs` does. Redeploying
after contract changes: see [Manager deployment](MANAGER_DEPLOYMENT.md), including
`DEPLOY_SALT_SUFFIX` for a genuinely fresh Manager and the redeploy checklist (which also means
steps 2 and 3 again). Renew code TTLs with
`node scripts/renew-code-ttl.mjs deploys/dev-testnet-manager.json --days 170`, paid by the renewal payer
`testnet-renewer` ([key custody](KEY_CUSTODY.md#renewal-payer)).

## 2. Database (Neon branch `dev`)

Created from `production`, so it started with production's data and roles. It was then made
independent:

1. New passwords for `neondb_owner`, `goldsky_writer` and `app_server` on the `dev` branch only
   (Neon roles are per branch; production's passwords are unchanged).
2. `./db/reset-database.sh` (it asks for the database name, typed in full), then
   `DROP SCHEMA streamling CASCADE` as `goldsky_writer` (it owns the allowlists), then `./db/migrate.sh`
   and `./db/grant-permissions.sh`, all with the dev branch's owner URL in `DATABASE_URL` (direct host, not
   the pooler). The scripts read the URL from the environment only.

The dev branch's credentials live only in Neon, Goldsky (the secret) and Vercel (the env var).
Get them from the Neon console (branch `dev`); never commit them.

## 3. Pipeline

```bash
cd packages/goldsky
GOLDSKY_ENV_FILE=dev.env pnpm generate
GOLDSKY_ENV_FILE=dev.env ./scripts/deploy.sh deploy
```

The generated `pipelines/builder-stellar-dev-events.yaml` indexes only the dev Manager from its
deployment ledger, into `BUILDER_DEV_POSTGRES_SECRET`. A replay after a dev database reset:
stop and `goldsky turbo delete builder-stellar-testnet-dev`, reset as in step 2, then apply again.

## 4. Vercel: dev.tribes.build (`builder-stellar-dev`)

A project of its own in the `nouns-builder` team, so dev.tribes.build is a **production**
domain and public. A branch domain on `builder-stellar-web` would sit behind Vercel's Standard
Protection (team login), and lifting that would make every PR preview public too.

- Root directory `apps/web`, framework Next.js, production branch `dev` (set in the dashboard:
  Settings, Environments, Production, Branch Tracking; the API can't change it).
- Ignored Build Step `[ "$VERCEL_GIT_COMMIT_REF" = "dev" ] && exit 1 || exit 0`: it builds
  `dev` only, so PR branches don't build twice (they already preview on `builder-stellar-web`).
- Domain `dev.tribes.build` (moved from `builder-stellar-web`).
- Environment variables (Production and Preview):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_NETWORK` | `testnet` |
| `MANAGER_DEPLOYMENT_FILE` | `deploys/dev-testnet-manager.json` |
| `APP_DATABASE_URL` | dev branch `app_server`, pooled host, `sslmode=require` (sensitive) |
| `NEXT_PUBLIC_SITE_URL`, `APP_URL` | `https://dev.tribes.build` |
| `STELLAR_HOME_DOMAIN`, `STELLAR_WEB_AUTH_DOMAIN` | `dev.tribes.build` |
| `STELLAR_WEB_AUTH_SECRET` | the funded testnet key `dev-web-auth` (`GCN2L6VK…TZ2VN`), sensitive |
| `IRON_PASSWORD` | its own 64-character secret (sensitive); a JSON map of numbered secrets while rotating, see below |
| `UPLOAD_TOKEN_SECRET` | optional: its own 64-character secret (sensitive). Unset, upload tokens use a key derived from `IRON_PASSWORD` |
| `GOLDSKY_PIPELINE_NAME` | `builder-stellar-testnet-dev` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_PINATA_GATEWAY`, `NEXT_PUBLIC_IMAGE_GENERATION_ENABLED` | as production |
| `PINATA_JWT` | dev's own Pinata key, never production's (see [Pinata keys](#pinata-keys)), sensitive |
| `NEXT_PUBLIC_PINATA_UPLOADS_ENABLED` | as production (`true`) |

Sign-in secrets (both projects):

- **Rotating `IRON_PASSWORD`.** Set it to a JSON map that keeps the old secret under `1` and adds
  the new one under `2`, `{"2":"<new>","1":"<old>"}`, and redeploy. New cookies are sealed with `2`,
  and a session in use is re-sealed with `2` the next time the app checks it. After 24 hours (the
  idle limit), no live cookie uses `1`, so set the value to `{"2":"<new>"}`. Removing a number
  early signs out every session sealed with it. To end all sessions at once, set only a new secret
  under a new number, such as `{"3":"<newer>"}`. Without `UPLOAD_TOKEN_SECRET`, any change of the
  current secret also ends upload tokens issued in the hour before it.
- **Client addresses.** The sign-in rate limits read the client's address from
  `x-vercel-forwarded-for`, which Vercel sets, so `TRUSTED_CLIENT_IP_HEADER` stays unset here.
  The limits and challenge replay checks are per server instance; there is no shared store.

`CSP_MODE` is left unset on both projects, so the page Content-Security-Policy is report-only
(see "Response headers" in [SECURITY_MODEL.md](SECURITY_MODEL.md#response-headers)). Set it to
`enforce` and redeploy once the `[csp-report]` lines in the function logs show no unexpected
violations. `next.config.mjs` reads it at build time and the middleware on each request, so
change it only with a new deployment.

`builder-stellar-web` gains `MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json` on
Production (see above).
Its Ignored Build Step `[ "$VERCEL_GIT_COMMIT_REF" = "dev" ] && exit 0 || exit 1` skips `dev`,
which `builder-stellar-dev` builds; `main` and PR previews still build there.

### Pinata keys

Production and dev each have their own Pinata API key, so a leak of one deployment's variables, or a burst of
uploads on dev, doesn't reach the other. When this page was written, `builder-stellar-dev` still held
production's key; replace it as follows.

1. In the Pinata dashboard, create a key named for the deployment (for example `tribes-dev`) with the same
   scopes as production's key: the upload routes sign uploads, look files up by CID, and create, list and
   revoke one-use upload keys (`apps/web/src/lib/pinata-service.ts`), so it needs key management (an admin
   key). Without the list and revoke scopes, uploads still work but used keys are not revoked
   (`[pinata-upload-keys]` errors in the log). A separate Pinata account for dev also separates storage and
   billing.
2. Set it as `PINATA_JWT` on `builder-stellar-dev` (Production and Preview), and redeploy.
3. Upload one image on dev.tribes.build to check it.
4. On `builder-stellar-web`, keep production's key on the Production environment only. Preview deployments
   get dev's key, so a pull request preview never holds production's.

Replacing a key later is the same, then revoke the old key in Pinata ([key custody](KEY_CUSTODY.md#web-app-secrets)).

Folder upload keys are named `tribes-folder-upload-<deadline>`, and the app revokes them itself. Before this
naming, the app made keys named `Single Use Upload JWT` and never revoked them. The sweep doesn't touch other
names, so revoke those once in the Pinata dashboard (API Keys, filter by name).

## 5. Vercel: docs.tribes.build (`builder-stellar-docs`)

- Root directory `apps/docs`, framework Other, build `pnpm build` (codegen, `next build`,
  Pagefind), output `out`, production branch `dev`, the same dev-only Ignored Build Step.
- Domain `docs.tribes.build`. No environment variables; `NEXT_PUBLIC_DOCS_URL` only overrides
  the canonical origin.

## Verify

- `https://dev.tribes.build/api/health`: the chain head, the database, and the pipeline
  `builder-stellar-testnet-dev` near the head.
- `curl -sI https://dev.tribes.build/` shows `content-security-policy-report-only` with a
  `'nonce-…'` source, `content-security-policy: frame-ancestors 'none'; …`,
  `x-frame-options: DENY`, and `x-content-type-options: nosniff`.
- Connect a wallet and sign in (SEP-53) on dev.tribes.build.
- Create a tribe on dev: it appears in Discover within the indexer's lag, and not on tribes.build.
- docs.tribes.build serves the home page, search and both themes.
