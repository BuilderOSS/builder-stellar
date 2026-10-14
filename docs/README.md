# Documentation

Tribe Builder ([tribes.build](https://tribes.build)): DAOs on Stellar, called tribes in the app. These pages describe the current repository source. They do not certify a live deployment, production readiness, or a passing test run.

## Start here

- [Project setup and commands](../README.md)
- [Web setup, routes, local workspace, and marketplace](../apps/web/README.md)
- [Architecture](ARCHITECTURE.md)
- [Tenant and read-model boundaries](MULTITENANT_ARCHITECTURE.md)
- [Design system, brand and voice](../DESIGN.md)

## Brand

- [Brand and frontend direction](BRAND_AND_FRONTEND_DIRECTION.md): voice, the tribe noun, the logo system and colours
- [Press kit](brand/README.md): marks, lockups, the Dusk tile and the 16px favicon

## How-to and operations

- [Deploy Manager](MANAGER_DEPLOYMENT.md)
- [Create, configure, and launch a DAO](DAO_DEPLOYMENT.md)
- [Upgrade DAO contracts (step-by-step runbook)](CONTRACT_UPGRADES.md)
- [Set up Goldsky](GOLDSKY_SETUP.md) and [package reference](../packages/goldsky/README.md)
- [Database migrations, roles, and reset](../db/README.md)
- [Bindings generation](BINDINGS_GENERATION.md)
- [Monitor the application](MONITORING.md)
- [Who pays for storage, role by role](STORAGE_COSTS.md)
- [Storage, TTL and rent reference](TTL_ECONOMICS.md)
- [Configure artwork during Setup](ARTWORK_SETUP.md)

## Reference and explanation

- [Database view catalog](DATABASE_SCHEMA.md)
- [Security and authority model](SECURITY_MODEL.md): admin model, voting supply, batch budget, error codes
- [Storage design and decisions](STORAGE_DIET.md): the chain-only rule, what lives in events, the profile JSON, one-sweep renewal, and the decision log (D1–D43) the code cites
- [Membership models (design)](designs/membership-models.md): mint allowances, the module registry, ClaimMinter, the assurance launch and quick-buy pools; retires the shared Minter
- [Membership token settings (design)](designs/locked-tokens.md): locked transfers, members-only delegation, DAO recovery and transfer agents
- [Add and remove modules (design)](designs/module-attach-ui.md): the Modules card in Manage, as built and proven on testnet
- [Agent workflow and acceptance checks](AGENT_WORKFLOW.md)
- Contracts: [Manager](../contracts/manager/README.md), [Token](../contracts/token/README.md), [Metadata](../contracts/metadata/README.md), [Auction](../contracts/auction/README.md), [Governor](../contracts/governor/README.md), [Treasury](../contracts/treasury/README.md), [Marketplace](../contracts/marketplace/README.md), [ClaimMinter](../contracts/minter/README.md)
- Support: [common](../contracts/common/README.md), [in-memory integration tests](../contracts/e2e/README.md)
- Binding packages: [Token](../packages/token-bindings/README.md), [Metadata](../packages/metadata-bindings/README.md), [Auction](../packages/auction-bindings/README.md), [Governor](../packages/governor-bindings/README.md), [Treasury](../packages/treasury-bindings/README.md), [Manager](../packages/manager-bindings/README.md), [Marketplace](../packages/marketplace-bindings/README.md), [ClaimMinter](../packages/claim-minter-bindings/README.md)

## Authority and maintenance

Retired plans, reviews and previews are not kept here; find them in git history. Contract behavior comes from Rust entrypoints/storage/events and pinned dependencies. Generated clients describe the build-time ABI. Pipeline templates/transforms define ingestion; SQL migrations/grants define the read model; route handlers and components define API/UX behavior. Package scripts define executable commands. Artifacts record deployment facts, not live state.

Plans and comments cannot override implementation. Link each changed interface to its source and tests. Domain owners provide a short handoff: changed behavior, source paths, checks actually run, configuration impact, and remaining limitations. Docs-steward owns prose; domain owners review facts. External network/protocol claims need official-source verification before being promoted to operational guarantees.
