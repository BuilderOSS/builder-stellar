-- Rollback: Metadata views
BEGIN;
DROP VIEW IF EXISTS metadata.configuration CASCADE;
DROP VIEW IF EXISTS metadata.token_seeds CASCADE;
DROP VIEW IF EXISTS metadata.properties CASCADE;
COMMIT;
