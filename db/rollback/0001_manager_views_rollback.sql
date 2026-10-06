-- =============================================================================
-- ROLLBACK: MANAGER VIEWS (0001_manager_views.sql)
--
-- Removes all manager domain views created for DAO state derivation.
-- =============================================================================


DROP VIEW IF EXISTS manager.event_identity CASCADE;
DROP VIEW IF EXISTS manager.dao_modules CASCADE;
DROP VIEW IF EXISTS manager.founder_allocations CASCADE;
DROP VIEW IF EXISTS manager.daos CASCADE;
