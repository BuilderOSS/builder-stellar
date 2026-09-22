-- Rollback: App views
BEGIN;
DROP VIEW IF EXISTS app.member_list CASCADE;
DROP VIEW IF EXISTS app.proposal_detail CASCADE;
DROP VIEW IF EXISTS app.proposal_list CASCADE;
DROP VIEW IF EXISTS app.activity_feed CASCADE;
DROP VIEW IF EXISTS app.decoded_event_activity CASCADE;
DROP VIEW IF EXISTS manager.current_implementations CASCADE;
DROP VIEW IF EXISTS manager.implementations CASCADE;
COMMIT;
