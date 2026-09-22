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

- [GOLDSKY_MULTITENANT_INTEGRATION.md](./GOLDSKY_MULTITENANT_INTEGRATION.md) - Pipeline integration
  - What needs updating in Goldsky
  - Event decoding
  - Table population
  - Testing checklist

**Deployment:**
- [MANAGER_DEPLOYMENT.md](./MANAGER_DEPLOYMENT.md) - Manager setup
- [DAO_DEPLOYMENT.md](./DAO_DEPLOYMENT.md) - DAO creation
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Direct contract deployment (legacy)

### Architecture & Design

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Smart contracts overview
- [MULTITENANT_ARCHITECTURE.md](./MULTITENANT_ARCHITECTURE.md) - Multi-tenant model
- [MULTI_DAO_MIGRATION_NOTES.md](./MULTI_DAO_MIGRATION_NOTES.md) - Migration insights

### Support & Reference

- [GOLDSKY_SETUP.md](./GOLDSKY_SETUP.md) - Goldsky configuration
- [GOLDSKY_MULTI_DAO_DATA_ARCHITECTURE.md](./GOLDSKY_MULTI_DAO_DATA_ARCHITECTURE.md) - Original design docs
- [mvp-technical-plan.md](./mvp-technical-plan.md) - Technical specification
- [STELLAR_INDEXER_COMPARISON.md](./STELLAR_INDEXER_COMPARISON.md) - Indexer evaluation

### Troubleshooting

- [MERCURY_BUG_REPORT.md](./MERCURY_BUG_REPORT.md) - Why Mercury was abandoned
- [MERCURY.md](./MERCURY.md) - Historical reference

---

## Key Concepts

### Deployment

A "deployment" is one instance of the application managing one manager contract.

**Identified by**: `deployment_id = "manager:CONTRACT_ADDRESS"`

**Environment**: `NEXT_PUBLIC_DEPLOYMENT_ID=manager:ABC...`

**Properties**:
- One per application instance
- Constant throughout app lifetime
- Filters all database queries

### DAO

A "DAO" is one organization governed by the manager.

**Identified by**: `dao_id = token_contract_address` (e.g., `CBGLIC3V...`)

**Properties**:
- Multiple per deployment
- Immutable after creation
- Independently configured
- Own governance, treasury, auctions

### Lifecycle

```
create_dao()           Pending  →  Operational
    ↓                    ↓
DaoCreated           configure        finalize_dao()
    ↓                    ↓                 ↓
Database         properties, metadata  DaoFinalized
insert           ownership transfer    update status
```

---

## Related Resources

### Code

- `apps/web/src/lib/dao-db.ts` - Database query helpers
- `apps/web/src/config/networks.ts` - Network configuration
- `scripts/deploy-dao.mjs` - DAO deployment script
- `db/migrations/0001_goldsky_base.sql` - Database schema

### Contracts

- `contracts/manager/` - Manager contract
- `contracts/token/` - Token contract
- `contracts/governor/` - Governance contract
- `contracts/treasury/` - Treasury contract
- `contracts/auction/` - Auction contract
- `contracts/metadata/` - Metadata contract

### Scripts

- `scripts/deploy-manager.mjs` - Deploy manager contract
- `scripts/deploy-dao.mjs` - Deploy DAO (creates 5 contracts)
- `scripts/deploy-dao.mjs` - Also configures and finalizes

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
| GOLDSKY_MULTITENANT_INTEGRATION.md | ✅ Current | Sept 2026 |
| DAO_DEPLOYMENT.md | ✅ Current | Sept 2026 |
| MANAGER_DEPLOYMENT.md | ✅ Current | Sept 2026 |
| GOLDSKY_SETUP.md | ✅ Current | Sept 2026 |
| ARCHITECTURE.md | ✅ Current | Sept 2026 |
| MULTI_DAO_MIGRATION_NOTES.md | ℹ️ Reference | Sept 2026 |
| mvp-technical-plan.md | ℹ️ Reference | Sept 2026 |
| STELLAR_INDEXER_COMPARISON.md | ℹ️ Reference | Sept 2026 |
| DEPLOYMENT.md | ⚠️ Legacy | Sept 2026 |
| MERCURY.md | ⚠️ Legacy | Sept 2026 |
| MERCURY_BUG_REPORT.md | ⚠️ Legacy | Sept 2026 |

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
→ Check [GOLDSKY_MULTITENANT_INTEGRATION.md](./GOLDSKY_MULTITENANT_INTEGRATION.md)

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

## Archive

Old or experimental documentation:
- `GOLDSKY_SINGLE_DAO_MIGRATION.md` - Migration from single-DAO
- `GOLDSKY_MULTI_DAO_DATA_ARCHITECTURE.md` - Original design (now implemented)

These are preserved for historical reference but the current docs are the source of truth.

---

**Last Updated**: September 22, 2026
