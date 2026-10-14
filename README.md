# Tribes Builder

**Build a tribe.** Gather your people, pool what you put in, and decide together.

Tribes Builder ([tribes.build](https://tribes.build)) is a Soroban DAO framework and web application for creating and operating independent DAOs on Stellar. In the app a DAO is a tribe: a group with a shared onchain treasury, NFT membership (one token, one vote) and proposals any wallet can execute once they pass and their safety delay ends. It is built on Nouns Builder.

## Brand

- **Voice:** a warm host. Plain words first, the DAO term one line beneath: "Members", then "Each membership is an NFT with one vote."
- **Noun:** a group is a tribe everywhere in the app (Your tribes, Find a tribe, Build a tribe). Savings circles stay circles.
- **Logo, "the lens is the table":** three people around a single Nouns lens, with an empty seat saved for you that turns brass when you join. Flat blue is the master; the Dusk tile is the app icon.
- **Colour:** one blue for actions, brass for what's yours, warm neutrals, dark as the hero theme.

[DESIGN.md](DESIGN.md) has the full system: brand and logo rules, tokens, type, layout, motion and voice. The press kit (marks, lockups, the Dusk tile and the favicon) is in [docs/brand](docs/brand/README.md).

## Community and support

Questions, ideas and problems: join the [Tribes Builder Discord](https://discord.gg/bTygNksyRb).

## System

- Manager deploys four core contracts per DAO (Token, Metadata, Governor, Treasury) and the modules it chooses: Auction, Marketplace (quick-buy pools and resales) and ClaimMinter (claim lists and launch drives). A DAO can add its own modules by vote; each mints only within an allowance the DAO sets.
- Manager is a factory and implementation registry. `create_dao` only requests a slug; `launch_dao` claims it (unique per Manager); a launched DAO can move to a new slug by vote. Manager deletes pending setup state at launch, keeps the claimed slug-to-DAO mappings, and has no DAO enumeration API.
- Every module has one admin: the launch admin during Setup, the Treasury after launch (`admin()`; no ownership transfer or renounce). Launch requires a nonzero **voting** supply (tokens held by the Treasury, Auction and Marketplace carry no votes) and hands every module's admin, including the Treasury's, to the Treasury.
- Proposals are created, voted on, and queued through Governor. Anyone can execute a ready proposal through **Treasury**, which consumes it on Governor and dispatches the actions in order.
- Together with the Manager that makes eight deployable contracts; there is no shared platform minter. `common` and `dao-e2e` are support/test crates.
- Goldsky writes events to PostgreSQL landing tables. Views provide discovery and history; the web app reads them through Prisma and the read-only app role.

## Web application

The current frontend includes DAO discovery, auction history/settlement, governance and ordered execution receipts, Treasury funding/history, paginated members and token-holder controls, claim lists (free or priced, launch drives with refunds), quick-buy pools and resales, membership switches (locked tokens, members-only delegation, DAO recovery) and one-click storage renewal. Creation uses a compact Identity → Membership → Governance → Review form, followed by separate Setup → Launch.

The Warm Ink · Dusk design system ([DESIGN.md](DESIGN.md)) provides light, dark, and system appearance with one blue for actions and brass for what's yours, Bricolage Grotesque display type, Figtree interface type, and JetBrains Mono for figures. Brand files are in [docs/brand](docs/brand). Multiple creation drafts, home-DAO preferences, marketplace favorites, and private labels are stored in this browser only. They are not shared collaboration or public tags.

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

`contracts:bindings` builds WASMs, regenerates eight client packages, and runs `pnpm install`. Dev/build hooks generate deployment selection, Prisma, binding builds, and Panda CSS. The development server uses port **4242**. A configured indexed database is needed for DAO data; local drafts do not create on-chain DAOs.

## Commands

Run from the repository root unless noted. Deployment and generation commands have side effects.

| Command | Purpose |
| --- | --- |
| `pnpm contracts:build` | Build contract WASMs with `stellar contract build` |
| `pnpm contracts:bindings` | Regenerate eight TypeScript binding packages |
| `pnpm contracts:test` | Run Cargo workspace tests, including in-memory integration tests |
| `pnpm indexer:test` | Run Goldsky package tests; DB assertions need a test database |
| `pnpm db:test` | Migration static checks; also DB tests if `TEST_DATABASE_URL` is set |
| `pnpm --dir apps/web test` | Run web Vitest tests |
| `pnpm --dir apps/web codegen` | Generate web deployment/Prisma/styles and build bindings |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Web checks/build |
| `pnpm deploy:manager configs/testnet-manager.json` | Deploy/resume the Manager and register the contract implementations |
| `pnpm deploy:dao --validate-only configs/testnet-builder-dao.json` | Validate the CLI DAO configuration without deployment |
| `pnpm indexer:generate` | Generate the pipeline from its selected Manager artifact |

For the three DAO deployment phases, see [DAO deployment](docs/DAO_DEPLOYMENT.md). Local network helper scripts exist but have no `local:*` package aliases.

## Documentation

- [Documentation index](docs/README.md)
- [Contract review fixes](docs/CONTRACT_REVIEW_FIX_PLAN.md)
- [Architecture](docs/ARCHITECTURE.md) and [tenant/read-model boundaries](docs/MULTITENANT_ARCHITECTURE.md)
- [Manager deployment](docs/MANAGER_DEPLOYMENT.md) and [DAO deployment](docs/DAO_DEPLOYMENT.md)
- [Security model](docs/SECURITY_MODEL.md), [who pays for storage](docs/STORAGE_COSTS.md), [storage and TTL reference](docs/TTL_ECONOMICS.md), and [monitoring](docs/MONITORING.md)
- [Database catalog](docs/DATABASE_SCHEMA.md), [database operations](db/README.md), and [Goldsky setup](docs/GOLDSKY_SETUP.md)
- [Bindings regeneration](BINDINGS_GENERATION_ISSUE.md)
- [Brand and frontend direction](docs/BRAND_AND_FRONTEND_DIRECTION.md), [press kit](docs/brand/README.md) and [agent ownership](docs/AGENT_WORKFLOW.md)

## Technology and license

Rust/Soroban contracts; Next.js, React, TypeScript, Panda CSS, Stellar Wallets Kit, Goldsky, Prisma, and PostgreSQL. MIT. The share-image fonts (Bricolage Grotesque and Figtree) are under the SIL Open Font License; see [apps/web/src/assets/fonts/OFL.txt](apps/web/src/assets/fonts/OFL.txt).
