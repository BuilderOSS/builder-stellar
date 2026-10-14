# Documentation

Tribes Builder ([tribes.build](https://tribes.build)): DAOs on Stellar, called tribes in the app. These pages describe the current repository source, including the frontend working-tree update. They do not certify a live deployment, production readiness, or a passing test run.

## Start here

- [Project setup and commands](../README.md)
- [Web setup, routes, local workspace, and marketplace](../apps/web/README.md)
- [Architecture](ARCHITECTURE.md)
- [Tenant and read-model boundaries](MULTITENANT_ARCHITECTURE.md)
- [Design system, brand and voice](../DESIGN.md)

## Brand and launch

- [Brand and frontend direction](BRAND_AND_FRONTEND_DIRECTION.md): voice, the tribe noun, the logo system and colours
- [Press kit](brand/README.md): marks, lockups, the Dusk tile and the 16px favicon
- [Launch checklist](LAUNCH_CHECKLIST.md): tribes.build DNS and hosting, redirects from the old host, handles, SCF, trademark, legal review and share cards

## How-to and operations

- [Deploy Manager](MANAGER_DEPLOYMENT.md)
- [Create, configure, and launch a DAO](DAO_DEPLOYMENT.md)
- [Upgrade DAO contracts (step-by-step runbook)](CONTRACT_UPGRADES.md)
- [Set up Goldsky](GOLDSKY_SETUP.md) and [package reference](../packages/goldsky/README.md)
- [Database migrations, roles, and reset](../db/README.md)
- [Bindings generation](../BINDINGS_GENERATION_ISSUE.md)
- [Monitor the application](MONITORING.md)
- [Who pays for storage, role by role](STORAGE_COSTS.md)
- [Storage, TTL and rent reference](TTL_ECONOMICS.md)
- [Configure artwork during Setup](ARTWORK_PLAYGROUND_INTEGRATION.md)

## Reference and explanation

- [Database view catalog](DATABASE_SCHEMA.md)
- [Security and authority model](SECURITY_MODEL.md): admin model, voting supply, batch budget, error codes
- [Storage diet (approved design)](STORAGE_DIET.md): what leaves contract storage for events, the on-chain-only guarantee, profile JSON; [its testnet-failure review](STORAGE_DIET_REVIEW.md)
- [Contract review fixes](CONTRACT_REVIEW_FIX_PLAN.md): review findings and how each was fixed
- [Membership models (design)](designs/membership-models.md): mint allowances, the module registry, ClaimMinter, the assurance launch and quick-buy pools; retires the shared Minter
- [Membership token settings (design)](designs/locked-tokens.md): locked transfers, members-only delegation, DAO recovery and transfer agents
- [Agent workflow and acceptance checks](AGENT_WORKFLOW.md)
- Contracts: [Manager](../contracts/manager/README.md), [Token](../contracts/token/README.md), [Metadata](../contracts/metadata/README.md), [Auction](../contracts/auction/README.md), [Governor](../contracts/governor/README.md), [Treasury](../contracts/treasury/README.md), [Marketplace](../contracts/marketplace/README.md), [ClaimMinter](../contracts/minter/README.md)
- Support: [common](../contracts/common/README.md), [in-memory integration tests](../contracts/e2e/README.md)
- Binding packages: [Token](../packages/token-bindings/README.md), [Metadata](../packages/metadata-bindings/README.md), [Auction](../packages/auction-bindings/README.md), [Governor](../packages/governor-bindings/README.md), [Treasury](../packages/treasury-bindings/README.md), [Manager](../packages/manager-bindings/README.md), [Marketplace](../packages/marketplace-bindings/README.md)

## Historical archive

These preserve decisions and old implementation plans, not current instructions:

- [Manager redesign](archive/MANAGER_REDESIGN.md)
- [Marketplace v0.1 design](archive/MARKETPLACE_PLAN.md)
- [Earlier dark/blue frontend direction](archive/BRAND_AND_FRONTEND_DIRECTION.md)
- [Removed artwork-playground integration](archive/ARTWORK_PLAYGROUND_INTEGRATION.md)

## Authority and maintenance

Contract behavior comes from Rust entrypoints/storage/events and pinned dependencies. Generated clients describe the build-time ABI. Pipeline templates/transforms define ingestion; SQL migrations/grants define the read model; route handlers and components define API/UX behavior. Package scripts define executable commands. Artifacts record deployment facts, not live state.

Plans and comments cannot override implementation. Link each changed interface to its source and tests. Domain owners provide a short handoff: changed behavior, source paths, checks actually run, configuration impact, and remaining limitations. Docs-steward owns prose; domain owners review facts. External network/protocol claims need official-source verification before being promoted to operational guarantees.
