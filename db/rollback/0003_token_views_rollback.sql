-- Rollback: Token views
BEGIN;
DROP VIEW IF EXISTS token.members CASCADE;
DROP VIEW IF EXISTS token.mint_authorities CASCADE;
DROP VIEW IF EXISTS token.mint_authority_history CASCADE;
DROP VIEW IF EXISTS token.delegations CASCADE;
DROP VIEW IF EXISTS token.inventory CASCADE;
DROP VIEW IF EXISTS token.transfers CASCADE;
COMMIT;
