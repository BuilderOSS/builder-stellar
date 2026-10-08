-- =============================================================================
-- TREASURY VIEWS
--
-- Source events (treasury contract):
--   execute  topics governor, target, proposal_id; data { function, index }
--            One event per call executed for a proposal. Treasury.execute is
--            permissionless: it consumes the proposal on the Governor, then
--            dispatches the calls in order (index 0..n-1, same transaction).
--   launched topic treasury (see manager.module_launches)
--
-- The Treasury no longer has a governor setter (GovernorChanged is gone): the
-- Governor is fixed at launch. Per-proposal execution detail with call
-- arguments lives in governance.proposal_execution_calls.
-- =============================================================================

CREATE VIEW treasury.calls AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'governor' AS governor,
  e.topics::jsonb ->> 'target' AS target,
  e.topics::jsonb ->> 'proposal_id' AS proposal_id,
  e.args::jsonb ->> 'function' AS function,
  (e.args::jsonb ->> 'index')::integer AS call_index,
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
