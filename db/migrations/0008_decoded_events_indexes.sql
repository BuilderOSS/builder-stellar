-- Migration: Add composite index for decoded_events queries
--
-- Purpose:
-- Optimizes query performance for common filter patterns in views:
-- - manager.daos: filters on (deployment_id, contract_role='manager', ledger_sequence DESC)
-- - governance.proposals: filters on (deployment_id, contract_role='governor', event_name IN (...), ledger_sequence DESC)
-- - token.inventory: filters on (deployment_id, contract_role='token', event_name, ledger_sequence DESC)
-- - Similar patterns for auction, treasury, metadata
--
-- Index Strategy:
-- - deployment_id and contract_role as leading columns (most selective filter)
-- - event_name for specific event type filtering
-- - ledger_sequence DESC as trailing for ORDER BY optimization (DISTINCT ON uses max ledger)
-- - Partial index on relevant contract roles to reduce size
-- - CONCURRENTLY clause allows index creation without blocking table writes
-- - Note: This migration should NOT be wrapped in a transaction block by the migration runner

-- Main composite index for filtered event lookups with ordering
CREATE INDEX CONCURRENTLY idx_decoded_events_role_event_ledger
  ON chain.decoded_events(deployment_id, contract_role, event_name, ledger_sequence DESC)
  WHERE contract_role IN ('manager', 'governor', 'token', 'auction', 'treasury', 'metadata');

-- Additional index for raw event lookups (used by activity feed)
CREATE INDEX CONCURRENTLY idx_decoded_events_deployment_ledger
  ON chain.decoded_events(deployment_id, ledger_sequence DESC);

-- Index for event_name specific queries (useful for filtering all events of a type)
CREATE INDEX CONCURRENTLY idx_decoded_events_event_name
  ON chain.decoded_events(event_name, ledger_sequence DESC)
  WHERE contract_role IN ('manager', 'governor', 'token', 'auction', 'treasury', 'metadata');
