# Tribe Builder

**Build a tribe.** Gather your people, pool what you put in, and decide together.

Tribe Builder ([tribes.build](https://tribes.build)) is a Soroban DAO framework and web application for creating and operating independent DAOs on Stellar. In the app a DAO is a tribe: a group with a shared onchain treasury, NFT membership (one token, one vote) and proposals any wallet can execute once they pass and their safety delay ends. It is built on Nouns Builder.

## Brand

- **Voice:** a warm host. Plain words first, the DAO term one line beneath: "Members", then "Each membership is an NFT with one vote."
- **Noun:** a group is a tribe everywhere in the app (Your tribes, Find a tribe, Build a tribe). Savings circles stay circles.
- **Logo, "the lens is the table":** three people around a single Nouns lens, with an empty seat saved for you that turns brass when you join. Flat blue is the master; the Dusk tile is the app icon.
- **Colour:** one blue for actions, brass for what's yours, warm neutrals, dark as the hero theme.

[DESIGN.md](DESIGN.md) has the full system: brand and logo rules, tokens, type, layout, motion and voice. The press kit (marks, lockups, the Dusk tile and the favicon) is in [docs/brand](docs/brand/README.md).

## Community and support

Questions, ideas and problems: join the [Tribe Builder Discord](https://discord.gg/bTygNksyRb).

## System

- Manager deploys four core contracts per DAO (Token, Metadata, Governor, Treasury) and the modules it chooses: Auction, Marketplace (quick-buy pools and resales) and ClaimMinter (claim lists and launch drives). A DAO can add its own modules by vote; each mints only within an allowance the DAO sets.
- Manager is a factory and implementation registry. `create_dao` only requests a slug; `launch_dao` claims it (unique per Manager); a launched DAO can move to a new slug by vote. Manager deletes pending setup state at launch, keeps the claimed slug-to-DAO mappings, and has no DAO enumeration API.
- Every module has one admin: the launch admin during Setup, the Treasury after launch (`admin()`; no ownership transfer or renounce). Launch requires a nonzero **voting** supply (tokens held by the Treasury, Auction and Marketplace carry no votes) and hands every module's admin, including the Treasury's, to the Treasury.
- Proposals are created, voted on, and queued through Governor. Anyone can execute a ready proposal through **Treasury**, which consumes it on Governor and dispatches the actions in order.
- Together with the Manager that makes eight deployable contracts; there is no shared platform minter. `common` and `dao-e2e` are support/test crates.
- Goldsky writes events to PostgreSQL landing tables. Views provide discovery and history; the web app reads them through Prisma and the read-only app role.

## Web application

The current frontend includes DAO discovery, auction history/settlement, governance and ordered execution receipts, Treasury funding/history, paginated members and token-holder controls, claim lists (free or priced, launch drives with refunds), quick-buy pools and resales, membership switches (locked tokens, members-only delegation, DAO recovery) and one-click storage renewal. Creation uses a compact Identity → Membership → Governance → Review form, followed by separate Setup → Launch.

The Warm Ink · Dusk design system ([DESIGN.md](DESIGN.md)) provides light, dark, and system appearance with one blue for actions and brass for what's yours, Bricolage Grotesque display type, Figtree interface type, and JetBrains Mono for figures. Brand files are in [docs/brand](docs/brand). Multiple creation drafts, marketplace favorites, and private labels are stored in this browser only. They are not shared collaboration or public tags.

See [the web README](apps/web/README.md) for setup, routes, recovery behavior, and limitations. Feature descriptions reflect source, not a live deployment check.

## Development

You need:

- **Node.js 24 LTS** (the version in [`.nvmrc`](.nvmrc)) and **pnpm 10.12.4** (`packageManager` in `package.json`).
- **Rust 1.95.0** through rustup. [`rust-toolchain.toml`](rust-toolchain.toml) pins the version and the `wasm32v1-none` target, and rustup installs them on first use.
- **Stellar CLI 28.0.0**, the version CI and the release build use. Install the release archive for your platform and check its sha256 (GitHub lists it with each archive), or build it with `cargo install --locked stellar-cli --version 28.0.0`. On a Mac with Apple silicon:

  ```bash
  curl -fsSLO https://github.com/stellar/stellar-cli/releases/download/v28.0.0/stellar-cli-28.0.0-aarch64-apple-darwin.tar.gz
  echo "416483409db89d9bf58163023d2c9d67cda24a5645042a98c0b8c1378cfc659d  stellar-cli-28.0.0-aarch64-apple-darwin.tar.gz" | shasum -a 256 -c
  mkdir -p ~/.local/bin && tar -xzf stellar-cli-28.0.0-aarch64-apple-darwin.tar.gz -C ~/.local/bin stellar
  stellar --version
  ```

- **Docker**, only for release builds and for verifying a release ([reproducible builds](docs/REPRODUCIBLE_BUILDS.md)).
- **gitleaks**, optional: the pre-commit hook uses it to scan staged changes for secrets when it is installed (`brew install gitleaks`). CI scans every push.

`.env` and `.env.*` files are ignored by git; only the `.env.example` templates are tracked.

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
| `pnpm contracts:build` | Build contract WASMs with `stellar contract build --locked`, for development and tests |
| `pnpm contracts:build:release` | Build the checked-out commit in the pinned container; `-- --write-hashes` records `releases/hashes.json` |
| `pnpm contracts:verify <tag>` | Rebuild a release tag and compare it with the hashes it publishes |
| `pnpm contracts:bindings` | Regenerate eight TypeScript binding packages |
| `pnpm contracts:test` | Run Cargo workspace tests, including in-memory integration tests |
| `pnpm contracts:coverage` | Contract test coverage with `cargo llvm-cov` ([coverage](docs/COVERAGE.md)) |
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
- [Architecture](docs/ARCHITECTURE.md) and [tenant/read-model boundaries](docs/MULTITENANT_ARCHITECTURE.md)
- [Manager deployment](docs/MANAGER_DEPLOYMENT.md) and [DAO deployment](docs/DAO_DEPLOYMENT.md)
- [Security model](docs/SECURITY_MODEL.md), [who pays for storage](docs/STORAGE_COSTS.md), [storage and TTL reference](docs/TTL_ECONOMICS.md), and [monitoring](docs/MONITORING.md)
- [Database catalog](docs/DATABASE_SCHEMA.md), [database operations](db/README.md), and [Goldsky setup](docs/GOLDSKY_SETUP.md)
- [Bindings regeneration](docs/BINDINGS_GENERATION.md)
- [Reproducible contract builds](docs/REPRODUCIBLE_BUILDS.md), [dependencies and advisories](docs/DEPENDENCIES.md) and the [OpenZeppelin pin](docs/OPENZEPPELIN_PIN.md)
- [Brand and frontend direction](docs/BRAND_AND_FRONTEND_DIRECTION.md), [press kit](docs/brand/README.md) and [agent ownership](docs/AGENT_WORKFLOW.md)

## Technology and license

Rust/Soroban contracts; Next.js, React, TypeScript, Panda CSS, Stellar Wallets Kit, Goldsky, Prisma, and PostgreSQL. MIT. The share-image fonts (Bricolage Grotesque and Figtree) are under the SIL Open Font License; see [apps/web/src/assets/fonts/OFL.txt](apps/web/src/assets/fonts/OFL.txt).
