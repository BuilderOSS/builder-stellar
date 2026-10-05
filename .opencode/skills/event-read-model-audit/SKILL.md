---
name: event-read-model-audit
description: Audits contract event completeness through Goldsky, PostgreSQL, API, and UI. Use when an event or indexed field is added, removed, renamed, or changed.
---

# Event Read-Model Audit

Create or update a coverage matrix with one row per event field:

`contract and event | topic or payload field | decoder | Goldsky transform | table or view | Prisma/API type | client query/UI | test | owner`

For each row, choose one result: indexed and exposed, indexed but intentionally internal,
or intentionally not indexed. A missing decision is a blocker.

Verify event name and topic ordering, decoding types, nullable handling, idempotent sink
keys, replay/backfill behavior, and filtering by both `deployment_id` and DAO identity.
Regenerate the pipeline after template edits and run the relevant indexer tests.

Report exact missing links and send handoff notes to `database-engineer`,
`frontend-services`, and `docs-steward`.
