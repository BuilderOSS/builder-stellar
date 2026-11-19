# dev.tribes.build: the `dev` deployment

`main` is frozen, so `dev` gets its own deployment: its own Manager, database, pipeline and
hostname. Production (tribes.build) keeps running from `main` against the original testnet
Manager and is not touched by anything here.

| Piece | Production (tribes.build) | Dev (dev.tribes.build) |
|---|---|---|
| Git branch | `main` (frozen) | `dev` |
| Manager config | `configs/testnet-manager.json` (label `builder`) | `configs/testnet-dev-manager.json` (label `dev`) |
| Manager artifact | `deploys/builder-testnet-manager.json` | `deploys/dev-testnet-manager.json` |
| Database | Neon `stellar-builder-testnet`, branch `production` | same project, branch `dev` |
| Goldsky secret | `BUILDER_POSTGRES_SECRET` | `BUILDER_DEV_POSTGRES_SECRET` |
| Pipeline | `builder-stellar-testnet` | `builder-stellar-testnet-dev` (`packages/goldsky/dev.env`) |
| Vercel | production deployment of `main` | the `dev` branch, domain dev.tribes.build |
| Docs | docs.tribes.build: its own Vercel project, `apps/docs` | (one docs site) |

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

## 4. Vercel: dev.tribes.build

In the existing tribes.build project:

1. Domains: add `dev.tribes.build`, assigned to the git branch `dev`.
2. Environment variables scoped to **Preview, branch `dev`**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_NETWORK` | `testnet` |
| `MANAGER_DEPLOYMENT_FILE` | `deploys/dev-testnet-manager.json` |
| `APP_DATABASE_URL` | dev branch `app_server`, pooled host, `sslmode=require` |
| `NEXT_PUBLIC_SITE_URL`, `APP_URL` | `https://dev.tribes.build` |
| `STELLAR_HOME_DOMAIN`, `STELLAR_WEB_AUTH_DOMAIN` | `dev.tribes.build` |
| `STELLAR_WEB_AUTH_SECRET` | a funded testnet key of its own (`stellar keys generate dev-web-auth`) |
| `IRON_PASSWORD` | a new 32+ character secret |
| `GOLDSKY_PIPELINE_NAME` | `builder-stellar-testnet-dev` |
| `GOLDSKY_API_TOKEN`, `PINATA_JWT`, `NEXT_PUBLIC_PINATA_*`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | as production |

3. Production gains `MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json` (see above).

## 5. Vercel: docs.tribes.build

A second Vercel project for the static docs site:

- Root directory `apps/docs`, production branch `dev` (while `main` is frozen).
- Install `pnpm install --frozen-lockfile` (run from the repository root, as Vercel does for a
  pnpm workspace), build `pnpm build` (codegen, `next build`, Pagefind), output `out`.
- Domain `docs.tribes.build`. No environment variables are needed;
  `NEXT_PUBLIC_DOCS_URL` only overrides the canonical origin for previews.

## Verify

- `https://dev.tribes.build/api/health`: the chain head, the database, and the pipeline
  `builder-stellar-testnet-dev` near the head.
- Connect a wallet and sign in (SEP-53) on dev.tribes.build.
- Create a tribe on dev: it appears in Discover within the indexer's lag, and not on tribes.build.
- docs.tribes.build serves the home page, search and both themes.
