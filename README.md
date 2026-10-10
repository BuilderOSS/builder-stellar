# Builder for Stellar

Builder for Stellar is a Soroban DAO framework. The redesign provides a Manager deployment module that deploys six independent DAO modules: Token, Metadata, Auction, Governor, Treasury, and Marketplace.

## Current Status

- Six Soroban DAO modules are deployed by Manager: Token, Metadata, Auction, Governor, Treasury, and Marketplace.
- Manager is the implementation registry and DAO factory, not a permanent DAO registry.
- Treasury owns every DAO module after finalization, including itself, and is the module-administration authority.
- Founder allocations are fixed token amounts and the total is capped at 10,000 tokens.
- Metadata uses mutable properties and items, with mint hooks that generate token attributes.
- 154 Rust tests pass (`pnpm contracts:test`).
- Goldsky and PostgreSQL provide durable DAO discovery and history. Manager stores only temporary pending creation state.

## Quick Start

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) and Cargo
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools) v22 or higher
- [Node.js](https://nodejs.org/) v20 or higher
- [pnpm](https://pnpm.io/) v10.12.4
- [Docker](https://www.docker.com/) for the local Stellar network

### Installation

```bash
git clone https://github.com/your-org/builder-stellar.git
cd builder-stellar
pnpm install
pnpm contracts:build
pnpm contracts:bindings
```

### Local Development

```bash
pnpm local:up
pnpm dev
pnpm local:down
```

The web app is available at `http://localhost:4242`. Before starting it, copy
`apps/web/.env.example` to `apps/web/.env` and set `APP_DATABASE_URL` to the
read-only PostgreSQL connection used by the Goldsky read model. The dev and
build hooks generate the Prisma client and select the deployment from the most
recent `deploys/*-manager.json` artifact; do not set `NEXT_PUBLIC_DEPLOYMENT_ID`
manually.

### Testing

```bash
pnpm contracts:test       # 154 Rust unit and e2e tests
pnpm indexer:test          # Goldsky package tests, not multi-DAO completeness
```

#### macOS SDK Override

On macOS, use the Command Line Tools 26.5 SDK when running the full contract
test command:

```bash
SDKROOT="/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk" pnpm contracts:test
```

The workspace `.envrc` exports this value automatically when entering
`~/code/nouns/stellar-builder` with direnv enabled.

## Project Structure

```text
contracts/token/       NFT voting token
contracts/metadata/    Mutable properties/items and mint hook
contracts/auction/     Auction membership module
contracts/governor/    Proposal and voting logic
contracts/treasury/    Asset custody, proposal execution, admin of every module after launch
contracts/manager/     Implementation registry, DAO factory and slug registry
contracts/marketplace/ Primary and secondary NFT marketplace
contracts/minter/      Platform minter shared by every DAO (merkle/allowlist claims)
contracts/common/      Shared library: admin model, lifecycle, upgrades/migrations, TTL, error codes
contracts/e2e/         Contract integration tests
apps/web/              Next.js frontend
packages/*-bindings/   Generated TypeScript clients
packages/goldsky/      Goldsky configuration and event tests
db/                    PostgreSQL migrations
scripts/               Build and deployment automation
configs/               Network and DAO configuration
```

## Documentation

- [Documentation Index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Multi-Tenant Architecture](docs/MULTITENANT_ARCHITECTURE.md)
- [Manager Deployment](docs/MANAGER_DEPLOYMENT.md)
- [Manager Redesign](docs/MANAGER_REDESIGN.md)
- [Marketplace Plan](docs/MARKETPLACE_PLAN.md)
- [Goldsky Setup](docs/GOLDSKY_SETUP.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [DAO Deployment](docs/DAO_DEPLOYMENT.md)
- [Monitoring](docs/MONITORING.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [TTL Economics](docs/TTL_ECONOMICS.md)
- [Contract Review Fix Plan](docs/CONTRACT_REVIEW_FIX_PLAN.md)
- [Frontend Handover](docs/FRONTEND_HANDOVER.md) (temporary: delete once the web app is updated)
- [Agent Workflow](docs/AGENT_WORKFLOW.md)

## Common Commands

- `pnpm contracts:build` - build all eight contract WASMs
- `pnpm contracts:bindings` - generate TypeScript bindings
- `pnpm deploy:local` - deploy direct contracts locally
- `pnpm deploy:testnet` - deploy direct contracts to testnet
- `pnpm indexer:generate` - generate the Goldsky pipeline
- `pnpm build` - build the web application
- `pnpm lint` - lint the web application
- `pnpm typecheck` - type-check the web application
- `pnpm --dir apps/web test` - run web application tests

## Wallet Authentication

The web app uses Stellar Wallets Kit SEP-53 message signing with a stateless `iron-session` cookie. Configure `APP_URL` and a private `IRON_PASSWORD` of at least 32 characters for deployed environments. Local development may use the request origin when `APP_URL` is omitted.

Authentication endpoints are `/api/auth/challenge`, `/api/auth/verify`, `/api/auth/session`, and `/api/auth/logout`. Existing discovery and indexed-data `GET` endpoints remain public. Future state-changing API routes must use the authenticated address from the server session, never an address supplied in a request body or query string. SameSite cookies provide the current baseline CSRF protection; mutation routes should add an explicit CSRF token check before shipping.

## Technology

Rust and Soroban power the contracts. The application uses Next.js, TypeScript, Panda CSS, Stellar Wallets Kit, Goldsky, Prisma, and PostgreSQL. Prisma is configured with read-only models over the indexed database views; schema changes and Goldsky ingestion remain outside the web app.

## License

MIT
