-- Restore app.activity_feed as defined in 0012 (no platform fan-out).
CREATE OR REPLACE VIEW app.activity_feed AS
SELECT
  e.activity_id,
  e.deployment_id,
  CASE e.contract_role
    WHEN 'manager' THEN m.dao_id
    WHEN 'minter' THEN r.dao_id
    ELSE i.dao_id
  END AS dao_id,
  e.contract_id,
  e.contract_role,
  e.event_name,
  e.topics,
  e.args,
  e.kind,
  e.title,
  e.summary,
  e.actor,
  e.addresses,
  e.proposal_id,
  e.token_id,
  e.amount,
  e.visibility,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.ledger_closed_at,
  e.transaction_hash
FROM app.activity_feed_events e
LEFT JOIN manager.event_identity i
  ON i.deployment_id = e.deployment_id
 AND i.contract_id = e.contract_id
 AND e.contract_role NOT IN ('manager', 'minter')
LEFT JOIN manager.dao_registry r
  ON r.deployment_id = e.deployment_id
 AND r.token_address = e.token_id
 AND e.contract_role = 'minter'
LEFT JOIN manager.dao_registry m
  ON m.deployment_id = e.deployment_id
 AND e.contract_role = 'manager'
 AND e.event_name IN ('dao_created', 'dao_launched', 'slug_claimed', 'pending_slug_updated', 'slug_changed')
 AND m.token_address = e.topics::jsonb ->> 'token_address'
WHERE e.contract_role <> 'minter' OR r.dao_id IS NOT NULL;
