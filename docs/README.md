# Documentation Index

## Multi-Tenant DAO System

The Stellar Builder platform is a multi-tenant DAO system where one application instance manages multiple independent DAOs. This section documents the architecture, database, and deployment procedures.

### Quick Start

1. **[MULTITENANT_ARCHITECTURE.md](./MULTITENANT_ARCHITECTURE.md)** - Start here
   - Overall architecture and concepts
   - How multi-tenancy works
   - Key components and relationships

2. **[DAO_DEPLOYMENT.md](./DAO_DEPLOYMENT.md)** - Create your first DAO
   - Step-by-step DAO creation
   - Configuration examples
   - Troubleshooting

3. **[MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md)** - Deploy manager contract
   - Initial setup
   - Network configuration
   - Prerequisites

### Deep Dive

**Database & Indexing:**
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Complete schema reference
  - Table definitions
  - Indexes and performance
  - Query examples
  - Permissions
- The web app accesses these views through Prisma using the read-only `app_server` role.

- [GOLDSKY_SETUP.md](./GOLDSKY_SETUP.md) - Pipeline configuration and event coverage

**Deployment:**
- [SECURITY_MODEL.md](./SECURITY_MODEL.md) - Trust boundaries, admin model, voting supply, setup-window rules, error codes, known limitations
- [TTL_ECONOMICS.md](./TTL_ECONOMICS.md) - TTL policy, rent and operator renewal tasks
- [CONTRACT_REVIEW_FIX_PLAN.md](./CONTRACT_REVIEW_FIX_PLAN.md) - Contract review findings and how each was fixed
- [FRONTEND_HANDOVER.md](./FRONTEND_HANDOVER.md) - **Temporary.** Web-app changes required by the contract, indexer and database changes; delete it once the frontend is updated
- [MANAGER_REDESIGN.md](./MANAGER_REDESIGN.md) - Approved Manager storage, upgrade, versioning, and testnet-reset design
- [MARKETPLACE_PLAN.md](./MARKETPLACE_PLAN.md) - Per-DAO fixed-price primary and secondary marketplace plan
- [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md) - Manager setup
- [DAO_DEPLOYMENT.md](./DAO_DEPLOYMENT.md) - DAO creation

### Architecture & Design

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Smart contracts overview
- [MULTITENANT_ARCHITECTURE.md](./MULTITENANT_ARCHITECTURE.md) - Multi-tenant model

### Support & Reference

- [GOLDSKY_SETUP.md](./GOLDSKY_SETUP.md) - Goldsky configuration
- [MONITORING.md](./MONITORING.md) - Production monitoring and troubleshooting
- [AGENT_WORKFLOW.md](./AGENT_WORKFLOW.md) - Repository workflow and ownership
- [BRAND_AND_FRONTEND_DIRECTION.md](./BRAND_AND_FRONTEND_DIRECTION.md) - Product and frontend direction
- [ARTWORK_PLAYGROUND_INTEGRATION.md](./ARTWORK_PLAYGROUND_INTEGRATION.md) - Artwork integration notes

---

## Key Concepts

### Deployment

A "deployment" is one instance of the application managing one manager contract.

**Identified by**: `deployment_id = "manager:CONTRACT_ADDRESS"`

**Generated from**: the most recent `deploys/*-manager.json` artifact by
`scripts/generate-web-deployment.mjs`

**Properties**:
- One per application instance
- Constant throughout app lifetime
- Filters all database queries

### DAO

A "DAO" is one organization created by Manager and governed by its own Governor/Treasury pair.

**Identified by**: `dao_id = token_contract_address` (e.g., `CBGLIC3V...`)

**Properties**:
- Multiple per deployment
- Immutable after creation
- Independently configured
- Own governance, treasury, auctions, and marketplace

### Lifecycle

```
create_dao()           Pending  →  Operational
    ↓                    ↓
DaoCreated        setup window         launch_dao()
    ↓             (mint, artwork,           ↓
Database          parameters)          DaoLaunched + SlugClaimed + <Module>Launched
insert                                 + AdminChanged per module (admin -> Treasury)
```

---

## Related Resources

### Code

- `apps/web/src/lib/dao-db.ts` - Database query helpers
- `apps/web/src/lib/prisma.ts` - Prisma client singleton
- `apps/web/prisma/schema.prisma` - Read-only models for indexed database views
- `apps/web/src/config/networks.ts` - Network configuration
- `scripts/deploy-dao.mjs` - DAO deployment script
- `db/README.md` - Database migrations, scripts and reset runbook
- `docs/DATABASE_SCHEMA.md` - View catalog

### Contracts

- `contracts/manager/` - Manager contract
- `contracts/token/` - Token contract
- `contracts/governor/` - Governance contract
- `contracts/treasury/` - Treasury contract
- `contracts/auction/` - Auction contract
- `contracts/metadata/` - Metadata contract
- `contracts/marketplace/` - Marketplace contract

### Scripts

- `scripts/deploy-manager.mjs` - Deploy manager contract
- `scripts/deploy-dao.mjs` - Deploy DAO (creates 6 contracts)
- `scripts/deploy-dao.mjs` - Also configures and launches (pending update for the hardened launch flow, see DAO_DEPLOYMENT.md)

### Configuration

- `configs/` - Network and DAO configuration files
- `deploys/` - Deployment artifacts (auto-generated)
- `.env.example` - Environment template

---

## Document Status

| Document | Status | Last Updated |
|----------|--------|--------------|
| MULTITENANT_ARCHITECTURE.md | ✅ Current | Sept 2026 |
| DATABASE_SCHEMA.md | ✅ Current | Sept 2026 |
| DAO_DEPLOYMENT.md | ✅ Current | Sept 2026 |
| MANAGER_DEPLOYMENT.md | ✅ Current | Sept 2026 |
| GOLDSKY_SETUP.md | ✅ Current | Sept 2026 |
| ARCHITECTURE.md | ✅ Current | Sept 2026 |

---

## Getting Help

### I want to...

**Understand the system**
→ Start with [MULTITENANT_ARCHITECTURE.md](./MULTITENANT_ARCHITECTURE.md)

**Deploy a manager contract**
→ See [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md)

**Create a new DAO**
→ Follow [DAO_DEPLOYMENT.md](./DAO_DEPLOYMENT.md)

**Understand the database**
→ Read [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

**Update the Goldsky pipeline**
→ Check [GOLDSKY_SETUP.md](./GOLDSKY_SETUP.md)

**Debug an issue**
→ See troubleshooting section in relevant document

**Learn about architecture**
→ Read [ARCHITECTURE.md](./ARCHITECTURE.md) for contracts

**View contract APIs**
→ See `contracts/*/README.md` in each contract directory

---

## Contributing

When updating documentation:

1. Keep this README index current
2. Update document status table
3. Link related documents
4. Add examples where helpful
5. Include troubleshooting sections

---
---

**Last Updated**: October 6, 2026
