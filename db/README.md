# Database Migrations

This repo owns the Postgres schema for the Goldsky-backed read model.

Order:
- `0001_goldsky_base.sql`
- `0002_goldsky_views.sql`

The base migration creates the raw Goldsky landing tables. The second migration
creates the domain and app-facing views over those tables.

View naming conventions:
- Ledger positions end in `_ledger`.
- Unix timestamps and durations end in `_seconds`; source millisecond values
  retain a `_milliseconds` suffix.
- `timestamptz` presentation fields end in `_at`; event projections expose
  `event_timestamp_seconds` and `event_at`.
- `manager.founder_allocations.end_date` is preserved, but its unit remains
  unresolved because the founder payload does not define it.

DAO-owned projections are always identified by the composite key
`(deployment_id, dao_id, ...)`. `dao_id` is the token contract address from
the manager's DAO registry, and `contract_id` identifies the originating DAO
module. Manager-wide views intentionally remain deployment-scoped and may
have a null `dao_id` for manager events.
