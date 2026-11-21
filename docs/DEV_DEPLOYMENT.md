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
(`GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO`).

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
implementations and writes `deploys/dev-testnet-manager.json` (commit it to `dev`). Redeploying
after contract changes: see [Manager deployment](MANAGER_DEPLOYMENT.md), including
`DEPLOY_SALT_SUFFIX` for a genuinely fresh Manager and the redeploy checklist (which also means
steps 2 and 3 again). Renew code TTLs with
`node scripts/renew-code-ttl.mjs deploys/dev-testnet-manager.json --days 170`.

## 2. Database (Neon branch `dev`)

Created from `production`, so it started with production's data and roles. It was then made
independent:

1. New passwords for `neondb_owner`, `goldsky_writer` and `app_server` on the `dev` branch only
   (Neon roles are per branch; production's passwords are unchanged).
2. `./db/reset-database.sh --yes`, then `DROP SCHEMA streamling CASCADE` as `goldsky_writer`
   (it owns the allowlists), then `./db/migrate.sh` and `./db/grant-permissions.sh`, all with the
   dev branch's owner `DATABASE_URL` (direct host, not the pooler).

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
| `IRON_PASSWORD` | its own 64-character secret (sensitive) |
| `GOLDSKY_PIPELINE_NAME` | `builder-stellar-testnet-dev` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_PINATA_GATEWAY`, `NEXT_PUBLIC_IMAGE_GENERATION_ENABLED` | as production |
| `PINATA_JWT`, `NEXT_PUBLIC_PINATA_UPLOADS_ENABLED` | as production (`true`); the JWT was added by hand, since a sensitive value can't be copied |

`builder-stellar-web` gains `MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json` on
Production (see above).
Its Ignored Build Step `[ "$VERCEL_GIT_COMMIT_REF" = "dev" ] && exit 0 || exit 1` skips `dev`,
which `builder-stellar-dev` builds; `main` and PR previews still build there.

## 5. Vercel: docs.tribes.build (`builder-stellar-docs`)

- Root directory `apps/docs`, framework Other, build `pnpm build` (codegen, `next build`,
  Pagefind), output `out`, production branch `dev`, the same dev-only Ignored Build Step.
- Domain `docs.tribes.build`. No environment variables; `NEXT_PUBLIC_DOCS_URL` only overrides
  the canonical origin.

## Verify

- `https://dev.tribes.build/api/health`: the chain head, the database, and the pipeline
  `builder-stellar-testnet-dev` near the head.
- Connect a wallet and sign in (SEP-53) on dev.tribes.build.
- Create a tribe on dev: it appears in Discover within the indexer's lag, and not on tribes.build.
- docs.tribes.build serves the home page, search and both themes.
