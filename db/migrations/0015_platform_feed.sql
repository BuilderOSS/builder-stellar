-- =============================================================================
-- 0015: platform events reach every DAO's feed
--
-- The Manager's upgrade notice (upgrade_delay_changed) and its own upgrade
-- (manager_upgraded), and the shared Minter's upgraded / migrated /
-- upgrade_delay_changed, concern every DAO: the Minter mints for all of them
-- and the Manager approves the Minter's upgrades. They carry no DAO of their
-- own, so app.activity_feed gave them dao_id NULL (Manager) or dropped them
-- (Minter rows need a token_id), and the app, which always reads one DAO's
-- feed, never showed them. They are now fanned out: one row per DAO in the
-- registry, activity_id suffixed with the DAO so it stays unique.
--
-- Same columns as 0012 (CREATE OR REPLACE); the Prisma view is unchanged.
-- =============================================================================

CREATE OR REPLACE VIEW app.activity_feed AS
WITH platform AS (
  SELECT e.*
  FROM app.activity_feed_events e
  WHERE (e.contract_role = 'manager' AND e.event_name IN ('upgrade_delay_changed', 'manager_upgraded'))
     OR (e.contract_role = 'minter' AND e.event_name IN ('upgraded', 'migrated', 'upgrade_delay_changed'))
)
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
WHERE (e.contract_role <> 'minter' OR r.dao_id IS NOT NULL)
  AND NOT (e.contract_role = 'manager' AND e.event_name IN ('upgrade_delay_changed', 'manager_upgraded'))
UNION ALL
SELECT
  p.activity_id || ':' || d.dao_id AS activity_id,
  p.deployment_id,
  d.dao_id,
  p.contract_id,
  p.contract_role,
  p.event_name,
  p.topics,
  p.args,
  p.kind,
  p.title,
  p.summary,
  p.actor,
  p.addresses,
  p.proposal_id,
  p.token_id,
  p.amount,
  p.visibility,
  p.ledger_sequence,
  p.transaction_index,
  p.operation_index,
  p.event_index,
  p.ledger_closed_at,
  p.transaction_hash
FROM platform p
JOIN manager.dao_registry d ON d.deployment_id = p.deployment_id;
