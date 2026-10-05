---
name: contract-interface-change
description: Coordinates method, binding, event, and response compatibility across contracts, indexers, APIs, and documentation. Use when changing a contract-facing interface.
---

# Contract Interface Change

Treat every public contract method, event, event field, error, spec type, and deployment
artifact as an interface. Before merging, enumerate affected consumers:

1. Rust contract and tests.
2. Generated TypeScript bindings and deployment scripts.
3. Goldsky decoders, transforms, generated pipeline, and tests.
4. PostgreSQL migrations/views and Prisma read models.
5. API routes, client query hooks, and UI states.
6. Documentation and deployment instructions.

Do not make a consumer silently tolerate a breaking change. Either update it in the same
change, retain a documented compatibility path, or explicitly stage the migration with
owners and rollback behavior.

Run the narrow relevant validations and record which owners still need to accept a
handoff.
