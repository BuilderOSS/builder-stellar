# Multi-DAO Migration Notes

This document summarizes key insights from the Phase 1 (single-DAO) MVP to inform Phase 2 (multi-DAO platform) development.

## Documentation Reference

The following documents have been imported from the stellar-dao prototype to provide complete context for Phase 2:

### Multi-DAO Architecture (Critical)
- **GOLDSKY_MULTI_DAO_DATA_ARCHITECTURE.md** - Complete multi-DAO indexing design with PostgreSQL schema, deployment-scoped identity, and factory integration patterns
- **GOLDSKY_SINGLE_DAO_MIGRATION.md** - Migration strategy from single-DAO to multi-DAO indexing architecture
- **STELLAR_INDEXER_COMPARISON.md** - Comprehensive evaluation of all Stellar indexing solutions (validates Goldsky choice)

### Planning & Historical Context
- **mvp-dao-technical-plan.md** - Original MVP technical specification (Phase 1 baseline)
- **mvp-technical-plan.md** - Earlier planning document with Nouns Builder context
- **MERCURY_BUG_REPORT.md** - Why Mercury was abandoned (critical data integrity issues)
- **MERCURY.md** - Historical reference for previous Mercury-based architecture

### Contract Documentation
- **contracts/*/README.md** - Module-specific API documentation for Token, Governor, Treasury, Auction, and E2E tests

## Key Insights for Phase 2

### 1. Goldsky is the Validated Choice

The STELLAR_INDEXER_COMPARISON.md provides comprehensive analysis confirming Goldsky as the only production-ready solution:
- Real-time event indexing with Turbo Pipelines
- PostgreSQL destination with full SQL access
- Event transformation with JavaScript
- Production uptime and support

**Critical**: Mercury was abandoned due to data integrity bugs (see MERCURY_BUG_REPORT.md) - it indexes failed transactions.

### 2. Multi-DAO Schema is Fully Designed

GOLDSKY_MULTI_DAO_DATA_ARCHITECTURE.md contains the complete PostgreSQL schema with:
- **Deployment-scoped identity**: All tables have `deployment_id` columns
- **Registry pattern**: `chain.dao_registry` tracks all DAOs with metadata
- **Auto-onboarding**: Factory events automatically populate registry
- **Role-based permissions**: `goldsky_writer` for pipeline, `app_server` for read-only queries

Key tables:
```sql
-- Registry
chain.dao_registry (deployment_id, label, factory_deployment_id, created_at, metadata)

-- Per-DAO data (all scoped by deployment_id)
governance.proposals
governance.votes
token.balances
token.delegation
auction.bids
auction.settlements
treasury.executions
```

### 3. Factory Pattern is Specified

From mvp-technical-plan.md, the factory approach includes:
- **Atomic deployment**: All 4 contracts deployed together (Token, Governor, Treasury, Auction)
- **Founder allocation**: Modulo-100 vesting system (e.g., 10% = every 10th token)
- **Registry integration**: Factory emits events that Goldsky indexes to populate `dao_registry`
- **Metadata storage**: DAO name, founder info, configuration stored on-chain

### 4. Phase 1 Baseline (What Works Today)

The MVP has proven these patterns work on Soroban:
- ✅ NFT-based governance tokens with delegation
- ✅ Proposal creation, voting, and execution
- ✅ Treasury as governance execution boundary
- ✅ Continuous auction mechanics (optional membership)
- ✅ Goldsky event indexing with PostgreSQL
- ✅ Next.js web app with wallet integration

### 5. Phase 2 Additions (What's New)

To enable multi-DAO platform:

**Contracts**
- Manager: Factory for atomic DAO deployment
- DAOFactory: DAO creation with founder allocation
- DAORegistry: On-chain DAO discovery
- MetadataRenderer: Generative artwork (optional)

**Indexing**
- Multi-DAO Goldsky pipeline with deployment_id scoping
- Auto-onboarding controller watches Factory events
- Registry UI for DAO discovery

**Frontend**
- Multi-DAO routing: `/:network/:label` URL pattern
- DAO switcher component
- Factory creation flow

### 6. Critical Design Decisions

**Deployment Identity**
- Each DAO has a unique `deployment_id` (contract address of Factory or Token)
- All events and data scoped by `deployment_id`
- No shared state between DAOs

**Membership Flexibility**
- Auction is ONE membership mechanism (Nouns-style)
- Platform supports: allowlists, direct minting, other custom mechanisms
- MetadataRenderer is optional (not all DAOs need generative art)

**Indexing Strategy**
- Single Goldsky pipeline handles all DAOs
- JavaScript transforms route events by `deployment_id`
- PostgreSQL schema uses partitioning for scalability

**Factory vs Registry**
- Factory: Deployer contract (creates DAOs)
- Registry: Discovery contract (lists DAOs)
- Separation allows multiple factories, single registry

## Migration Checklist

Phase 2 implementation requires:

- [ ] Implement Manager/Factory/Registry contracts
- [ ] Update Token/Governor/Treasury/Auction for factory deployment
- [ ] Implement MetadataRenderer (optional artwork)
- [ ] Migrate Goldsky pipeline to multi-DAO schema (see GOLDSKY_MULTI_DAO_DATA_ARCHITECTURE.md)
- [ ] Implement auto-onboarding controller
- [ ] Add DAO discovery UI (registry explorer)
- [ ] Add DAO creation flow (factory UI)
- [ ] Update routing for multi-DAO (/:network/:label)
- [ ] Database migrations for multi-DAO schema
- [ ] Update deployment scripts for factory pattern

## References

See imported documentation in `docs/` for complete technical specifications and design rationale.
