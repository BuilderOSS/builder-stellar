-- =============================================================================
-- TREASURY VIEWS
--
-- Treasury events (contracts/treasury/src/events.rs):
--   execute   topics governor, target, proposal_id; data { function, index }
--             one per call of an executed proposal, all in one transaction;
--             Treasury.execute is permissionless and consumes the proposal on the
--             Governor first (proposal_executed, same tx)
-- Not projected: treasury_initialized (the governor is in DaoCreated),
-- treasury_launched (manager.module_launches).
-- =============================================================================

-- One row per executed call. The call's arguments are in the proposal's
-- proposal_created event (app.proposal_detail.actions), matched by call_index.
CREATE VIEW treasury.calls AS
SELECT
  e.event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  e.t ->> 'governor' AS governor,
  e.t ->> 'target' AS target,
  e.t ->> 'proposal_id' AS proposal_id,
  e.a ->> 'function' AS function,
  (e.a ->> 'index')::integer AS call_index,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'treasury'
  AND e.event_name = 'execute';
