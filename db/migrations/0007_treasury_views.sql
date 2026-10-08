-- =============================================================================
-- TREASURY VIEWS
--
-- Source events (treasury contract):
--   execute  topics governor, target; data { function }
--            One event per call the Governor executed through the Treasury.
--   governor_changed  topics old_governor, new_governor
-- =============================================================================

CREATE VIEW treasury.calls AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'governor' AS governor,
  e.topics::jsonb ->> 'target' AS target,
  e.args::jsonb ->> 'function' AS function,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM NULLIF(e.ledger_closed_at, '')::timestamptz)::bigint AS event_timestamp_seconds,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'treasury'
  AND e.event_name = 'execute';

CREATE VIEW treasury.governor_changes AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'old_governor' AS old_governor,
  e.topics::jsonb ->> 'new_governor' AS new_governor,
  e.ledger_sequence AS event_ledger,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'treasury'
  AND e.event_name = 'governor_changed';
