-- =============================================================================
-- ROLLBACK: BASE TABLES (0000_base_tables.sql)
--
-- This rollback script removes all base tables and schemas created during
-- initial database setup. Use ONLY in emergency recovery scenarios.
--
-- WARNING: This will delete all data!
-- =============================================================================

BEGIN;

-- Drop all schemas in reverse dependency order
-- App schema first (depends on others)
DROP SCHEMA IF EXISTS app CASCADE;

-- Domain schemas
DROP SCHEMA IF EXISTS metadata CASCADE;
DROP SCHEMA IF EXISTS treasury CASCADE;
DROP SCHEMA IF EXISTS auction CASCADE;
DROP SCHEMA IF EXISTS token CASCADE;
DROP SCHEMA IF EXISTS governance CASCADE;

-- Manager schema (depends on chain)
DROP SCHEMA IF EXISTS manager CASCADE;

-- Core event schemas (last)
DROP SCHEMA IF EXISTS chain CASCADE;

-- Verify all schemas removed
DO $$
DECLARE
  schema_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO schema_count
  FROM information_schema.schemata
  WHERE schema_name IN ('chain', 'governance', 'token', 'auction', 'treasury', 'manager', 'metadata', 'app');

  IF schema_count > 0 THEN
    RAISE EXCEPTION 'Rollback failed: % schemas still exist', schema_count;
  END IF;

  RAISE NOTICE 'All schemas dropped successfully';
END $$;

COMMIT;
