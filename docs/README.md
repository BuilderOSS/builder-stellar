# Documentation

These pages describe the current repository source, including the frontend working-tree update. They do not certify a live deployment, production readiness, or a passing test run.

## Start here

- [Project setup and commands](../README.md)
- [Web setup, routes, local workspace, and marketplace](../apps/web/README.md)
- [Architecture](ARCHITECTURE.md)
- [Tenant and read-model boundaries](MULTITENANT_ARCHITECTURE.md)

## How-to and operations

- [Deploy Manager](MANAGER_DEPLOYMENT.md)
- [Create, configure, and launch a DAO](DAO_DEPLOYMENT.md)
- [Set up Goldsky](GOLDSKY_SETUP.md) and [package reference](../packages/goldsky/README.md)
- [Database migrations, roles, and reset](../db/README.md)
- [Bindings generation](../BINDINGS_GENERATION_ISSUE.md)
- [Monitor the application](MONITORING.md)
- [Maintain TTLs](TTL_ECONOMICS.md)
- [Configure artwork during Setup](ARTWORK_PLAYGROUND_INTEGRATION.md)

## Reference and explanation

- [Database view catalog](DATABASE_SCHEMA.md)
- [Security and authority model](SECURITY_MODEL.md): admin model, voting supply, batch budget, error codes
- [Contract review fixes](CONTRACT_REVIEW_FIX_PLAN.md): review findings and how each was fixed
- [Frontend handover](FRONTEND_HANDOVER.md): **temporary**; web changes required by the contract, indexer and database changes, deleted once the frontend is updated
- [Warm Ink and frontend direction](BRAND_AND_FRONTEND_DIRECTION.md)
- [Agent workflow and acceptance checks](AGENT_WORKFLOW.md)
- Contracts: [Manager](../contracts/manager/README.md), [Token](../contracts/token/README.md), [Metadata](../contracts/metadata/README.md), [Auction](../contracts/auction/README.md), [Governor](../contracts/governor/README.md), [Treasury](../contracts/treasury/README.md), [Marketplace](../contracts/marketplace/README.md), [Minter](../contracts/minter/README.md)
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
