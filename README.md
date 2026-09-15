# Builder for Stellar

A flexible DAO builder framework on Soroban, enabling communities to create and govern DAOs with modular membership mechanisms, on-chain voting, and treasury management.

## Current Status

✅ **Phase 1: Core DAO Infrastructure** (Complete)
- Token: NFT with delegation and voting power
- Governor: Proposal creation, voting, and execution
- Treasury: Governance-controlled asset management
- Auction: Continuous auction-based membership (optional)
- Goldsky indexing and PostgreSQL database
- Next.js web application

🚧 **Phase 2: Platform Layer** (Planned)
- Factory: Atomic DAO deployment
- Registry: DAO discovery and directory
- MetadataRenderer: Generative artwork (optional)
- Membership modules: Auctions, allowlists, direct minting, and more

See [docs/PHASE_2_PLAN.md](docs/PHASE_2_PLAN.md) for roadmap.

## Quick Start

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) and Cargo
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools) v22 or higher
- [Node.js](https://nodejs.org/) v20 or higher
- [pnpm](https://pnpm.io/) v10.12.4
- [Docker](https://www.docker.com/) (for local Stellar network)
- [PostgreSQL](https://www.postgresql.org/) (for Goldsky indexing)

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/builder-stellar.git
cd builder-stellar

# Install dependencies
pnpm install

# Build contracts
pnpm contracts:build

# Generate TypeScript bindings
pnpm contracts:bindings
```

### Local Development

```bash
# Start local Stellar network and deploy contracts
pnpm local:up

# In another terminal, start web app
pnpm dev

# Stop local network when done
pnpm local:down
```

### Testing

```bash
# Run contract unit tests
pnpm contracts:test:unit

# Run E2E tests
pnpm contracts:test:e2e

# Run all contract tests
pnpm contracts:test:all

# Test Goldsky pipeline
pnpm indexer:test
```

## Project Structure

```
builder-stellar/
├── contracts/          # Soroban smart contracts (Rust)
│   ├── token/         # NFT voting token
│   ├── governor/      # Proposal and voting logic
│   ├── treasury/      # Treasury management
│   ├── auction/       # Continuous auction (optional membership)
│   └── e2e/           # Integration tests
├── apps/
│   └── web/           # Next.js governance UI
├── packages/
│   ├── *-bindings/    # Generated TypeScript clients
│   └── goldsky/       # Goldsky indexer configuration
├── db/                # PostgreSQL migrations
├── scripts/           # Deployment automation
└── configs/           # Deployment configurations
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and patterns
- [Phase 2 Plan](docs/PHASE_2_PLAN.md) - Factory/Registry/MetadataRenderer roadmap
- [Deployment Guide](docs/DEPLOYMENT.md) - How to deploy to testnet
- [Goldsky Setup](docs/GOLDSKY_SETUP.md) - Indexer configuration

## Available Commands

### Contract Development
- `pnpm contracts:build` - Compile all contracts
- `pnpm contracts:bindings` - Generate TypeScript bindings
- `pnpm contracts:test:unit` - Run unit tests
- `pnpm contracts:test:e2e` - Run integration tests
- `pnpm contracts:clean` - Clean build artifacts

### Deployment
- `pnpm local:up` - Start local network and deploy
- `pnpm local:down` - Stop local network
- `pnpm deploy:local` - Deploy to local network
- `pnpm deploy:testnet` - Deploy to testnet

### Web Application
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm lint` - Run linter
- `pnpm typecheck` - Type check TypeScript

### Indexer
- `pnpm indexer:generate` - Generate Goldsky pipeline
- `pnpm indexer:test` - Test event decoders

## Technology Stack

- **Smart Contracts**: Rust + [Soroban SDK](https://github.com/stellar/rs-soroban-sdk)
- **Frontend**: [Next.js 15](https://nextjs.org/) + TypeScript + [Panda CSS](https://panda-css.com/)
- **Indexing**: [Goldsky](https://goldsky.com/) + PostgreSQL
- **Wallet**: [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit)
- **Build Tools**: [Cargo](https://doc.rust-lang.org/cargo/), [pnpm](https://pnpm.io/)

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## License

MIT

## Acknowledgments

- Inspired by [Nouns Builder](https://nouns.build/)
- Built with [OpenZeppelin Contracts for Stellar](https://github.com/OpenZeppelin/stellar-contracts)
- Powered by [Stellar](https://stellar.org/) and [Soroban](https://soroban.stellar.org/)
