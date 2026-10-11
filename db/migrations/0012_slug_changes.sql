-- =============================================================================
-- 0012: launched DAOs can change their slug by vote (Manager 0.2.0 change_slug)
--
-- * SlugChanged: topics token_address, new_slug; data { old_slug }. The old slug
--   is released on-chain at once and any DAO may claim it.
-- * manager.dao_slugs.claimed_slug is now the latest of slug_claimed and
--   slug_changed (previously the launch claim only). claimed_ledger / claimed_at
--   keep meaning the original launch claim. Same columns, same order.
-- * app.activity_feed resolves slug_changed to its DAO, like the other per-DAO
--   Manager events.
-- * manager.dao_previous_slugs: every slug a DAO moved away from, with its event
--   position, so the app can redirect an old link while no other DAO holds it.
-- =============================================================================

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
  -- The launch claim: when the DAO first took a unique slug.
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.ledger_sequence AS claimed_ledger,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS claimed_at
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name = 'slug_claimed'
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence, e.transaction_index NULLS LAST,
    e.operation_index NULLS LAST, e.event_index NULLS LAST, e.event_id
), current_slug AS (
  -- The slug the DAO holds now: the latest claim or change (several changes can
  -- share a transaction, so order by full event position).
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    CASE e.event_name
      WHEN 'slug_changed' THEN e.topics::jsonb ->> 'new_slug'
      ELSE e.topics::jsonb ->> 'slug'
    END AS slug
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name IN ('slug_claimed', 'slug_changed')
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST,
    e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
)
SELECT
  r.deployment_id,
  r.dao_id,
  q.requested_slug,
  cs.slug AS claimed_slug,
  c.claimed_ledger,
  c.claimed_at
FROM manager.dao_registry r
LEFT JOIN requested q ON q.deployment_id = r.deployment_id AND q.dao_id = r.dao_id
LEFT JOIN claimed c ON c.deployment_id = r.deployment_id AND c.dao_id = r.dao_id
LEFT JOIN current_slug cs ON cs.deployment_id = r.deployment_id AND cs.dao_id = r.dao_id;

-- Slugs a DAO moved away from (one row per change). Not reserved: another DAO
-- may hold the same slug now, and the app prefers the current holder.
CREATE VIEW manager.dao_previous_slugs AS
SELECT
  e.deployment_id,
  e.topic_0 AS dao_id,
  e.args::jsonb ->> 'old_slug' AS slug,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS changed_at
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'slug_changed';

-- Same as 0010, with slug_changed among the per-DAO Manager events.
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
