---
name: indexed-data-tenant-safety
description: Protects multi-DAO and multi-deployment isolation in indexed queries. Use when changing Goldsky transforms, SQL views, Prisma models, APIs, or client query hooks.
---

# Indexed Data Tenant Safety

Every indexed read must establish both the deployment and DAO scope before returning
data. Verify the exact source of each identity, its type, and how it is applied through
Goldsky, SQL views, Prisma, APIs, and client query keys.

Reject joins, caches, pagination cursors, aggregates, and fallback queries that can mix
deployments or DAOs. Null or missing identity must fail closed, not broaden the query.

Test at least two deployment or DAO identities whenever practical. Check the web app
uses its read-only database role and that pipeline credentials remain writer-only.

Finish with the applied filters, cache keys, and isolation test evidence.
