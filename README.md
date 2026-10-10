# Builder for Stellar

Builder is a Soroban DAO framework and web application for creating and operating independent DAOs on Stellar.

## System

- Manager deploys six modules per DAO: Token, Metadata, Auction, Governor, Treasury, and Marketplace.
- Manager is a factory and implementation registry. It deletes pending setup state at launch but retains persistent slug-to-DAO mappings; it has no DAO enumeration API.
- The launch admin owns the modules during Setup. Launch requires nonzero token supply and transfers ownership of every module, including Treasury itself, to Treasury.
- Proposals are created, voted on, and queued through Governor. Anyone can execute a ready proposal through **Treasury**, which consumes it on Governor and dispatches the actions in order.
- A shared platform Minter is deployed separately. Together with Manager and the six DAO modules, this makes eight deployable contracts. `common` and `dao-e2e` are support/test crates.
- Goldsky writes events to PostgreSQL landing tables. Views provide discovery and history; the web app reads them through Prisma and the read-only app role.

## Web application

The current frontend includes DAO discovery, auction history/settlement, governance and ordered execution receipts, Treasury funding/history, paginated members and token-holder controls, Minter claims and governance allocation proposals, and primary/secondary marketplace flows. Creation uses a compact Identity → Membership → Governance → Review form, followed by separate Setup → Launch.

Warm Ink provides light, dark, and system appearance with green accents, Instrument Serif display type, and Inter interface/body type. Multiple creation drafts, home-DAO preferences, marketplace favorites, and private labels are stored in this browser only. They are not shared collaboration or public tags.

See [the web README](apps/web/README.md) for setup, routes, recovery behavior, and limitations. Feature descriptions reflect source, not a live deployment check.

## Development

Use pnpm **10.12.4**, Node.js **22+**, Rust/Cargo, and a Stellar CLI compatible with the workspace's `soroban-sdk` **27.0.6**. CI currently uses Node 23; the repository does not establish a tested minimum CLI version.

```bash
git clone https://github.com/BuilderOSS/builder-stellar.git
cd builder-stellar
pnpm install
pnpm contracts:bindings
cp apps/web/.env.example apps/web/.env
# Configure the app environment as described in apps/web/README.md.
pnpm dev
```

`contracts:bindings` builds WASMs, regenerates seven client packages, and runs `pnpm install`. Dev/build hooks generate deployment selection, Prisma, binding builds, and Panda CSS. The development server uses port **4242**. A configured indexed database is needed for DAO data; local drafts do not create on-chain DAOs.

## Commands

Run from the repository root unless noted. Deployment and generation commands have side effects.

| Command | Purpose |
| --- | --- |
| `pnpm contracts:build` | Build contract WASMs with `stellar contract build` |
| `pnpm contracts:bindings` | Regenerate seven TypeScript binding packages |
| `pnpm contracts:test` | Run Cargo workspace tests, including in-memory integration tests |
| `pnpm indexer:test` | Run Goldsky package tests; DB assertions need a test database |
| `pnpm db:test` | Migration static checks; also DB tests if `TEST_DATABASE_URL` is set |
| `pnpm --dir apps/web test` | Run web Vitest tests |
| `pnpm --dir apps/web codegen` | Generate web deployment/Prisma/styles and build bindings |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Web checks/build |
| `pnpm deploy:manager configs/testnet-manager.json` | Deploy/resume Manager and shared Minter setup |
| `pnpm deploy:dao --validate-only configs/testnet-builder-dao.json` | Validate the CLI DAO configuration without deployment |
| `pnpm indexer:generate` | Generate the pipeline from its selected Manager artifact |

For the three DAO deployment phases, see [DAO deployment](docs/DAO_DEPLOYMENT.md). Local network helper scripts exist but have no `local:*` package aliases.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md) and [tenant/read-model boundaries](docs/MULTITENANT_ARCHITECTURE.md)
- [Manager deployment](docs/MANAGER_DEPLOYMENT.md) and [DAO deployment](docs/DAO_DEPLOYMENT.md)
- [Security model](docs/SECURITY_MODEL.md), [TTL maintenance](docs/TTL_ECONOMICS.md), and [monitoring](docs/MONITORING.md)
- [Database catalog](docs/DATABASE_SCHEMA.md), [database operations](db/README.md), and [Goldsky setup](docs/GOLDSKY_SETUP.md)
- [Bindings regeneration](BINDINGS_GENERATION_ISSUE.md)
- [Frontend direction](docs/BRAND_AND_FRONTEND_DIRECTION.md) and [agent ownership](docs/AGENT_WORKFLOW.md)

## Technology and license

Rust/Soroban contracts; Next.js, React, TypeScript, Panda CSS, Stellar Wallets Kit, Goldsky, Prisma, and PostgreSQL. MIT.
