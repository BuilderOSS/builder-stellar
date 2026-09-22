-- Rollback: Governance views
BEGIN;
DROP VIEW IF EXISTS governance.proposals CASCADE;
DROP VIEW IF EXISTS governance.governor_authorities CASCADE;
DROP VIEW IF EXISTS governance.governor_authority_history CASCADE;
DROP VIEW IF EXISTS governance.proposal_actions CASCADE;
DROP VIEW IF EXISTS governance.proposal_votes CASCADE;
DROP VIEW IF EXISTS governance.proposal_lifecycle CASCADE;
COMMIT;
