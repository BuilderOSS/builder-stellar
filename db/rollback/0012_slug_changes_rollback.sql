-- Restore manager.dao_slugs as defined in 0002 (launch claim only) and drop previous slugs.
DROP VIEW IF EXISTS manager.dao_previous_slugs;

CREATE OR REPLACE VIEW manager.dao_slugs AS
WITH requested AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.args::jsonb ->> 'slug' AS requested_slug
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name IN ('dao_created', 'pending_slug_updated')
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST,
    e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
), claimed AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.topics::jsonb ->> 'slug' AS claimed_slug,
    e.ledger_sequence AS claimed_ledger,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS claimed_at
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name = 'slug_claimed'
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence, e.transaction_index NULLS LAST,
    e.operation_index NULLS LAST, e.event_index NULLS LAST, e.event_id
)
SELECT
  r.deployment_id,
  r.dao_id,
  q.requested_slug,
  c.claimed_slug,
  c.claimed_ledger,
  c.claimed_at
FROM manager.dao_registry r
LEFT JOIN requested q ON q.deployment_id = r.deployment_id AND q.dao_id = r.dao_id
LEFT JOIN claimed c ON c.deployment_id = r.deployment_id AND c.dao_id = r.dao_id;

-- Restore app.activity_feed as defined in 0010.
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
 AND e.event_name IN ('dao_created', 'dao_launched', 'slug_claimed', 'pending_slug_updated')
 AND m.token_address = e.topics::jsonb ->> 'token_address'
WHERE e.contract_role <> 'minter' OR r.dao_id IS NOT NULL;
