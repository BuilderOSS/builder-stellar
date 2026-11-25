# Documentation

Tribe Builder ([tribes.build](https://tribes.build)): DAOs on Stellar, called tribes in the app. These pages describe the current repository source. They do not certify a live deployment, production readiness, or a passing test run. User guides are on the docs site, [docs.tribes.build](https://docs.tribes.build).

## Start here

- [Project setup and commands](../README.md)
- [Web setup, routes, local workspace, and marketplace](../apps/web/README.md)
- [Architecture](ARCHITECTURE.md)
- [Tenant and read-model boundaries](MULTITENANT_ARCHITECTURE.md)
- [Design system, brand and voice](../DESIGN.md)
- [Audit package](audit/README.md): for auditors, the contracts audit scope and file list, state machines, invariants and their tests, known issues, the app and indexer threat model, and a scope letter template

## Brand

- [Brand and frontend direction](BRAND_AND_FRONTEND_DIRECTION.md): voice, the tribe noun, the logo system and colours
- [Press kit](brand/README.md): marks, lockups, the Dusk tile and the 16px favicon

## How-to and operations

- [Deploy Manager](MANAGER_DEPLOYMENT.md)
- [dev.tribes.build: the `dev` deployment](DEV_DEPLOYMENT.md) (its own Manager, database, pipeline and hostname, and the docs site's Vercel project)
- [Create, configure, and launch a DAO](DAO_DEPLOYMENT.md)
- [Upgrade DAO contracts (step-by-step runbook)](CONTRACT_UPGRADES.md)
- [Reproducible contract builds](REPRODUCIBLE_BUILDS.md): the pinned toolchain, release hashes, and how to verify a tag
- [Dependencies and advisories](DEPENDENCIES.md) and the [OpenZeppelin pin](OPENZEPPELIN_PIN.md)
- [Contract test coverage](COVERAGE.md)
- [Set up Goldsky](GOLDSKY_SETUP.md) and [package reference](../packages/goldsky/README.md)
- [Database migrations, roles, and reset](../db/README.md)
- [Bindings generation](BINDINGS_GENERATION.md): regenerating the eight TypeScript client packages
- [The docs site](DOCS_SITE.md): how `apps/docs` (docs.tribes.build) is built, checked, themed and deployed, and how screenshots get into it
- [Monitor the application](MONITORING.md), with the alerting plan
- [Key custody and rotation](KEY_CUSTODY.md): every secret, where it is stored and how to replace it
- [Incident runbook](INCIDENT_RUNBOOK.md): a leaked key or secret, a hostile module, a malformed event, pausing the factory
- [Who pays for storage, role by role](STORAGE_COSTS.md)
- [Storage, TTL and rent reference](TTL_ECONOMICS.md)
- [Revenue: paying for the platform (proposed)](REVENUE.md)
- [Configure artwork during Setup](ARTWORK_SETUP.md)
- [Legal entity export](LEGAL_EXPORT.md): what Manage → Legal entity export collects for a DAO registrar, and the two files it downloads

## Reference and explanation

- [Database view catalogue](DATABASE_SCHEMA.md)
- [Security and authority model](SECURITY_MODEL.md): admin model, voting supply, batch budget, error codes
- [Proposal actions](PROPOSAL_ACTIONS.md): each composer action's contract call, who authorises it, its prerequisites, failure codes and tests
- [Storage design and decisions](STORAGE_DIET.md): the chain-only rule, what lives in events, the profile JSON, one-sweep renewal, and the decision log (D1 to D43) the code cites
- [Membership models (design)](designs/membership-models.md): mint allowances, the module registry, ClaimMinter, the assurance launch and quick-buy pools; retires the shared Minter
- [Membership token settings (design)](designs/locked-tokens.md): locked transfers, members-only delegation, DAO recovery and transfer agents
- [Add and remove modules (design)](designs/module-attach-ui.md): the Modules card in Manage, as built and proven on testnet
- [Governance adapter (design)](designs/governance-adapter.md): the Governor's vote source interface, the Manager's approved sources, and how to write an adapter
- [Neural Quorum Governance compatibility (design)](designs/nqg-compatibility.md): what NQG exposes on chain and how a Governor can take its votes through an adapter
- [Circle, a savings-and-loan module (design, draft)](designs/savings-circle.md): dues, stamps, loans, periods and share-out inside a Circle; not built
- [Saccos as tribes (design, draft)](designs/sacco-tribes.md): a no-money Sacco Ledger tribe first, then the Circle with M-Pesa ramps, then a Sacco module
- [Fundraisers in tribes (design, draft)](designs/fundraiser.md): a Fundraiser template on the general tribe, indexed gifts, M-Pesa giving without a wallet, and closing a tribe
- [Agent workflow and acceptance checks](AGENT_WORKFLOW.md)
- Contracts: [Manager](../contracts/manager/README.md), [Token](../contracts/token/README.md), [Metadata](../contracts/metadata/README.md), [Auction](../contracts/auction/README.md), [Governor](../contracts/governor/README.md), [Treasury](../contracts/treasury/README.md), [Marketplace](../contracts/marketplace/README.md), [ClaimMinter](../contracts/minter/README.md)
- Support: [common](../contracts/common/README.md), [in-memory integration tests](../contracts/e2e/README.md), [mock vote adapter](../contracts/vote-adapter-mock/README.md) (tests and testnet only)
- Binding packages: [Token](../packages/token-bindings/README.md), [Metadata](../packages/metadata-bindings/README.md), [Auction](../packages/auction-bindings/README.md), [Governor](../packages/governor-bindings/README.md), [Treasury](../packages/treasury-bindings/README.md), [Manager](../packages/manager-bindings/README.md), [Marketplace](../packages/marketplace-bindings/README.md), [ClaimMinter](../packages/claim-minter-bindings/README.md)
- Shared packages: [design tokens](../packages/design-tokens/README.md) (the Warm Ink · Dusk Panda preset used by `apps/web` and `apps/docs`)

## Plans and QA records

- [Release 1 plan](plans/release-main-1.md): the first `dev` to `main` promotion (released 21 November 2026), and the worked example for later releases
- [Walkthroughs and docs plan](plans/walkthroughs-and-docs.md): the real-app walkthrough suite, docs.tribes.build and both themes
- [Walkthroughs runbook](qa/WALKTHROUGHS.md): set up, run and read the walkthrough suite in `apps/e2e`
- [Showcase tribe](qa/SHOWCASE_TRIBE.md): the example tribe, Lamplight, behind every docs screenshot, and how to capture them
- [Bug ledger](qa/BUG_LEDGER.md): defects found by the walkthrough suite or while building it

## Authority and maintenance

Retired plans, reviews and previews are not kept here; find them in git history. The plans above are kept because they are current or are the record of a release. Contract behaviour comes from Rust entrypoints, storage, events and pinned dependencies. Generated clients describe the build-time ABI. Pipeline templates and transforms define ingestion; SQL migrations and grants define the read model; route handlers and components define API and UX behaviour. Package scripts define executable commands. Artifacts record deployment facts, not live state.

Plans and comments cannot override implementation. Link each changed interface to its source and tests. Domain owners provide a short handoff: changed behaviour, source paths, checks actually run, configuration impact, and remaining limitations. Docs-steward owns prose; domain owners review facts. External network and protocol claims need verification against an official source before they are promoted to operational guarantees.
