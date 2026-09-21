# Builder for Stellar

Builder for Stellar is a Soroban DAO framework. The current implementation provides a Manager contract that deploys and records DAOs composed of five modules: Token, Metadata, Auction, Governor, and Treasury.

## Current Status

- Five Soroban DAO modules are implemented and covered by Rust tests.
- Manager combines the implementation registry, DAO factory, and DAO registry.
- Treasury owns the DAO modules in production and is the module-administration authority.
- Founder allocations are fixed token amounts and the total is capped at 10,000 tokens.
- Metadata uses mutable properties and items, with mint hooks that generate token attributes.
- 153 Rust tests pass (`pnpm contracts:test:unit`).
- Multi-DAO database, indexer, and frontend layers are not complete. The contract registry exists, but the surrounding application infrastructure remains future work.

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

### Testing

```bash
pnpm contracts:test:unit  # 153 Rust unit tests
pnpm contracts:test:e2e
pnpm contracts:test:all
pnpm indexer:test          # Goldsky package tests, not multi-DAO completeness
```

## Project Structure

```text
contracts/token/       NFT voting token
contracts/metadata/    Mutable properties/items and mint hook
contracts/auction/     Auction membership module
contracts/governor/    Proposal and voting logic
contracts/treasury/    Asset custody and module ownership
contracts/manager/     Implementation registry, factory, and DAO registry
contracts/e2e/         Contract integration tests
apps/web/              Next.js frontend
packages/*-bindings/   Generated TypeScript clients
packages/goldsky/      Goldsky configuration and event tests
db/                    PostgreSQL migrations
scripts/               Build and deployment automation
configs/               Network and DAO configuration
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Manager Deployment](docs/MANAGER_DEPLOYMENT.md)
- [Goldsky Setup](docs/GOLDSKY_SETUP.md)
- [Mercury notes](docs/MERCURY.md) (historical)
- [Migration and indexer notes](docs/MULTI_DAO_MIGRATION_NOTES.md) (historical/future)

## Common Commands

- `pnpm contracts:build` - build all six contract crates
- `pnpm contracts:bindings` - generate TypeScript bindings
- `pnpm deploy:local` - deploy direct contracts locally
- `pnpm deploy:testnet` - deploy direct contracts to testnet
- `pnpm indexer:generate` - generate the Goldsky pipeline
- `pnpm build` - build the web application
- `pnpm lint` - lint the web application
- `pnpm typecheck` - type-check the web application

## Technology

Rust and Soroban power the contracts. The application uses Next.js, TypeScript, Panda CSS, Stellar Wallets Kit, Goldsky, and PostgreSQL.

## License

MIT
