# Database Migrations

This repo owns the Postgres schema for the Goldsky-backed read model.

Order:
- `0001_goldsky_base.sql`
- `0002_goldsky_views.sql`

The base migration creates the raw Goldsky landing tables. The second migration
creates the domain and app-facing views over those tables.
