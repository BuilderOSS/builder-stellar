# Tribe Builder

**Build a tribe.** Bring your community together, share a treasury, and make decisions as members.

Tribe Builder ([tribes.build](https://tribes.build)) is a Soroban DAO framework and web application for creating and running independent DAOs on Stellar. In the app a DAO is a tribe: a group with a shared onchain treasury and NFT membership (one token, one vote). Members vote on proposals. Once a proposal passes, any wallet can queue it, and after its safety delay any wallet can execute it; the wallet that submits pays the fee. Tribe Builder is built on Nouns Builder.

User guides are at [docs.tribes.build](https://docs.tribes.build) (source in `apps/docs`, described in [the docs site guide](docs/DOCS_SITE.md)).

## Brand

- **Voice:** clear, calm and inclusive. Plain words first, the DAO term one line beneath: "Members", then "Each membership is an NFT with one vote."
- **Noun:** a group is a tribe everywhere in the app (Your tribes, Find a tribe, Build a tribe). Savings circles stay circles.
- **Logo, "the lens is the table":** three people around a single Nouns lens, with an empty seat saved for you that turns brass when you join. Flat blue is the master; the Dusk tile is the app icon.
- **Colour:** one blue for actions, brass for what's yours, warm neutrals, and dark as the hero theme.

[DESIGN.md](DESIGN.md) has the full system: brand and logo rules, tokens, type, layout, motion and voice. The press kit (marks, lockups, the Dusk tile and the favicon) is in [docs/brand](docs/brand/README.md).

## Community and support

Questions, ideas and problems: join the [Tribe Builder Discord](https://discord.gg/bTygNksyRb).

## System

- Manager deploys four core contracts per DAO (Token, Metadata, Governor, Treasury) and the modules the DAO chooses: Auction, Marketplace (quick-buy pools and resales) and ClaimMinter (claim lists and launch drives). A DAO can add its own modules by vote; each mints only within an allowance the DAO sets.
- Manager is a factory and implementation registry. `create_dao` only requests a slug; `launch_dao` claims it (unique per Manager); a launched DAO can move to a new slug by vote. Manager deletes pending setup state at launch, keeps the claimed slug-to-DAO mappings, and has no DAO enumeration API.
- Every DAO contract has one admin: the launch admin during Setup and the Treasury after launch (`admin()`; no ownership transfer or renounce). Launch requires a nonzero **voting** supply (tokens held by the Treasury, Auction and Marketplace carry no votes) and hands every contract's admin, including the Treasury's, to the Treasury.
- Proposals are created, voted on and queued through Governor. Any wallet can execute a ready proposal through **Treasury**, which consumes it on Governor and dispatches the actions in order.
- With the Manager, that makes eight deployable contracts; there is no shared platform minter. `common` and `dao-e2e` are support and test crates, and `vote-adapter-mock` is a Governor vote source for tests and testnet only.
- Goldsky writes events to PostgreSQL landing tables. Views provide discovery and history; the web app reads them through Prisma and the read-only app role.

[Architecture](docs/ARCHITECTURE.md) explains how these parts fit together.

## Web application

The frontend covers tribe discovery, auction history and settlement, governance with ordered execution receipts, Treasury funding and history, paginated members and token-holder controls, claim lists (free or priced, and launch drives with refunds), quick-buy pools and resales, membership switches (locked tokens, members-only delegation and DAO recovery) and one-click storage renewal. Creation is one form (Identity → Membership → Governance → Review), followed by separate Setup and Launch steps.

The Warm Ink · Dusk design system ([DESIGN.md](DESIGN.md)) offers Light, Dark and System appearance, with Bricolage Grotesque for display type, Figtree for the interface and JetBrains Mono for figures. Creation drafts (several at once) and marketplace favourites are stored in the browser only. They are not shared collaboration or public tags.

See [the web README](apps/web/README.md) for setup, routes, recovery behaviour and limitations. Feature descriptions reflect the source, not a check of a live deployment.

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
- **gitleaks** 8.25 or later, optional: when it is installed, the pre-commit hook uses it to scan staged changes for secrets (`brew install gitleaks`). CI scans every push.

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

`contracts:bindings` builds the WASMs, regenerates the eight client packages and runs `pnpm install`. The web app's `predev` and `prebuild` hooks (`pnpm --dir apps/web codegen`) generate the deployment selection and the Prisma client, build the bindings, and generate Panda CSS. The development server uses port **4242**. Tribe data needs a configured, indexed database. A local draft does not create an on-chain DAO.

## Commands

Run from the repository root unless noted. Deployment and generation commands have side effects.

| Command | Purpose |
| --- | --- |
| `pnpm contracts:build` | Build contract WASMs with `stellar contract build --locked`, for development and tests |
| `pnpm contracts:build:release` | Build a commit (default `HEAD`) in the pinned container; `--write-hashes` records `releases/hashes.json` |
| `pnpm contracts:verify <tag>` | Rebuild a release tag and compare it with the hashes it publishes |
| `pnpm contracts:bindings` | Regenerate the eight TypeScript binding packages ([bindings](docs/BINDINGS_GENERATION.md)) |
| `pnpm contracts:test` | Run Cargo workspace tests, including in-memory integration tests |
| `pnpm contracts:coverage` | Contract test coverage with `cargo llvm-cov` ([coverage](docs/COVERAGE.md)) |
| `pnpm contracts:clean` | Remove Cargo build output (`cargo clean`) |
| `pnpm indexer:test` | Run Goldsky package tests; DB assertions need a test database |
| `pnpm db:test` | Migration static checks; also DB tests if `TEST_DATABASE_URL` is set |
| `pnpm --dir apps/web test` | Run web Vitest tests |
| `pnpm --dir apps/web codegen` | Generate the web deployment selection, Prisma client and styles, and build the bindings |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Web lint, type check and production build |
| `pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:check` | Run, build and check the docs site ([docs site](docs/DOCS_SITE.md)) |
| `pnpm docs:capture` | Run the screenshot capture story on testnet, after `pnpm --dir apps/e2e build:capture` ([showcase tribe](docs/qa/SHOWCASE_TRIBE.md)) |
| `pnpm deploy:manager configs/testnet-manager.json` | Deploy or resume the Manager and register the contract implementations ([Manager deployment](docs/MANAGER_DEPLOYMENT.md)) |
| `pnpm deploy:dao --validate-only configs/testnet-builder-dao.json` | Validate the CLI DAO configuration without deployment |
| `pnpm deploy:upgrade <module> …` | Upgrade one contract ([contract upgrades](docs/CONTRACT_UPGRADES.md)) |
| `pnpm indexer:generate` | Generate the pipeline from the Manager artifact that `MANAGER_DEPLOYMENT_FILE` names ([Goldsky setup](docs/GOLDSKY_SETUP.md)) |

For the three DAO deployment phases, see [DAO deployment](docs/DAO_DEPLOYMENT.md). Local network helper scripts (`scripts/local-up.mjs`, `scripts/local-down.mjs`) exist but have no `local:*` package aliases.

## Documentation

The [documentation index](docs/README.md) lists every guide. The main entry points:

- **Audit:** the [audit package](docs/audit/README.md) (scope, state machines, invariants, known issues and threat model), the [security model](docs/SECURITY_MODEL.md) and [proposal actions](docs/PROPOSAL_ACTIONS.md)
- **How it works:** [architecture](docs/ARCHITECTURE.md), [tenant and read-model boundaries](docs/MULTITENANT_ARCHITECTURE.md), [storage design](docs/STORAGE_DIET.md), [who pays for storage](docs/STORAGE_COSTS.md) and the [storage and TTL reference](docs/TTL_ECONOMICS.md)
- **Runbooks:** [Manager deployment](docs/MANAGER_DEPLOYMENT.md), [DAO deployment](docs/DAO_DEPLOYMENT.md), [contract upgrades](docs/CONTRACT_UPGRADES.md), [the dev deployment](docs/DEV_DEPLOYMENT.md), [monitoring](docs/MONITORING.md), [key custody](docs/KEY_CUSTODY.md) and the [incident runbook](docs/INCIDENT_RUNBOOK.md)
- **Builds and dependencies:** [reproducible contract builds](docs/REPRODUCIBLE_BUILDS.md), [dependencies and advisories](docs/DEPENDENCIES.md), the [OpenZeppelin pin](docs/OPENZEPPELIN_PIN.md) and [bindings regeneration](docs/BINDINGS_GENERATION.md)
- **Data:** the [database catalogue](docs/DATABASE_SCHEMA.md), [database operations](db/README.md) and [Goldsky setup](docs/GOLDSKY_SETUP.md)
- **Brand and workflow:** [brand and frontend direction](docs/BRAND_AND_FRONTEND_DIRECTION.md), the [press kit](docs/brand/README.md) and the [agent workflow](docs/AGENT_WORKFLOW.md)

## Technology and licence

Rust and Soroban contracts; Next.js, React, TypeScript, Panda CSS, Stellar Wallets Kit, Goldsky, Prisma and PostgreSQL. The code is under the MIT licence. The share-image fonts (Bricolage Grotesque and Figtree) are under the SIL Open Font License; see [apps/web/src/assets/fonts/OFL.txt](apps/web/src/assets/fonts/OFL.txt).
