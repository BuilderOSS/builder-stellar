-- Rollback: Drop decoded_events indexes
BEGIN;
DROP INDEX IF EXISTS idx_decoded_events_role_event_ledger;
DROP INDEX IF EXISTS idx_decoded_events_deployment_ledger;
DROP INDEX IF EXISTS idx_decoded_events_event_name;
COMMIT;
