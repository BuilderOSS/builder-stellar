-- =============================================================================
-- TREASURY VIEWS MIGRATION
--
-- Creates views for:
-- - Treasury calls
-- =============================================================================

BEGIN;

-- Treasury: Calls
CREATE OR REPLACE VIEW treasury.calls AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'proposal_id' AS proposal_id,
  e.topics::jsonb ->> 'governor' AS governor,
  e.topics::jsonb ->> 'target' AS target,
  e.args::jsonb ->> 'function' AS function,
  e.args::jsonb -> 'args' AS args,
  e.args::jsonb ->> 'executor' AS executor,
  e.args::jsonb ->> 'action_index' AS action_index,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'treasury'
  AND e.event_name IN ('execute', 'treasury_call_indexed', 'proposal_call_indexed');

COMMIT;
