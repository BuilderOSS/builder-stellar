-- Rollback: Treasury views
BEGIN;
DROP VIEW IF EXISTS treasury.calls CASCADE;
COMMIT;
