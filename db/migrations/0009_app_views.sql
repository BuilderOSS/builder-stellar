-- =============================================================================
-- APP VIEWS: the read surface of apps/web (apps/web/prisma/schema.prisma)
--   app.activity_feed     tenant-resolved activity feed
--   app.proposal_list     proposals with state and tallies
--   app.proposal_detail   proposal_list plus the proposal's calls as JSON
--   app.indexer_status    ingestion progress, so the app never reads raw events
-- =============================================================================

-- dao_id resolution, one branch per source so a per-DAO filter pushes down:
--   module events      by contract address (manager.event_identity)
--   Minter claims      by the DAO token in the token_id column
--   per-DAO Manager    dao_created, dao_launched, slug_claimed, pending_slug_updated,
--   events             slug_changed, by their token_address topic
--   platform events    the upgrade notice, the Manager's and the shared Minter's own
--                      upgrades and migrations: one row for every DAO that existed
--                      when the event happened (the Minter mints for all of them,
--                      the Manager approves the Minter's upgrades); a revoked
--                      implementation: one row for every DAO running that hash
--   other Manager      no DAO (dao_id NULL): registry and admin bookkeeping
-- Minter claims for tokens that are not DAOs of this deployment are dropped.
-- Fanned-out rows suffix activity_id with the DAO so it stays unique.
CREATE VIEW app.activity_feed AS
WITH platform AS (
  SELECT e.*
  FROM app.activity_feed_events e
  WHERE (e.contract_role = 'manager' AND e.event_name IN ('upgrade_delay_changed', 'manager_upgraded'))
     OR (e.contract_role = 'minter' AND e.event_name IN ('upgraded', 'migrated', 'upgrade_delay_changed'))
)
SELECT
  e.activity_id, e.deployment_id, i.dao_id, e.contract_id, e.contract_role, e.event_name, e.topics, e.args,
  e.kind, e.title, e.summary, e.actor, e.addresses, e.proposal_id, e.token_id, e.amount, e.visibility,
  e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index, e.ledger_closed_at, e.transaction_hash
FROM app.activity_feed_events e
JOIN manager.event_identity i
  ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id AND i.module_role = e.contract_role
UNION ALL
SELECT
  e.activity_id, e.deployment_id, r.dao_id, e.contract_id, e.contract_role, e.event_name, e.topics, e.args,
  e.kind, e.title, e.summary, e.actor, e.addresses, e.proposal_id, e.token_id, e.amount, e.visibility,
  e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index, e.ledger_closed_at, e.transaction_hash
FROM app.activity_feed_events e
JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.token_id
WHERE e.contract_role = 'minter'
  AND e.event_name NOT IN ('upgraded', 'migrated', 'upgrade_delay_changed')
UNION ALL
SELECT
  e.activity_id, e.deployment_id, r.dao_id, e.contract_id, e.contract_role, e.event_name, e.topics, e.args,
  e.kind, e.title, e.summary, e.actor, e.addresses, e.proposal_id, e.token_id, e.amount, e.visibility,
  e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index, e.ledger_closed_at, e.transaction_hash
FROM app.activity_feed_events e
JOIN manager.dao_registry r
  ON r.deployment_id = e.deployment_id AND r.token_address = e.topics::jsonb ->> 'token_address'
WHERE e.contract_role = 'manager'
  AND e.event_name IN ('dao_created', 'dao_launched', 'slug_claimed', 'pending_slug_updated', 'slug_changed')
UNION ALL
SELECT
  e.activity_id, e.deployment_id, NULL::text, e.contract_id, e.contract_role, e.event_name, e.topics, e.args,
  e.kind, e.title, e.summary, e.actor, e.addresses, e.proposal_id, e.token_id, e.amount, e.visibility,
  e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index, e.ledger_closed_at, e.transaction_hash
FROM app.activity_feed_events e
WHERE e.contract_role = 'manager'
  AND e.event_name NOT IN ('dao_created', 'dao_launched', 'slug_claimed', 'pending_slug_updated', 'slug_changed',
    'upgrade_delay_changed', 'manager_upgraded', 'implementation_revoked')
UNION ALL
SELECT
  p.activity_id || ':' || d.dao_id, p.deployment_id, d.dao_id, p.contract_id, p.contract_role, p.event_name, p.topics, p.args,
  p.kind, p.title, p.summary, p.actor, p.addresses, p.proposal_id, p.token_id, p.amount, p.visibility,
  p.ledger_sequence, p.transaction_index, p.operation_index, p.event_index, p.ledger_closed_at, p.transaction_hash
FROM platform p
JOIN manager.dao_registry d
  ON d.deployment_id = p.deployment_id
 AND d.created_pos < chain.event_position(p.ledger_sequence, p.transaction_index, p.operation_index, p.event_index)
UNION ALL
SELECT
  e.activity_id || ':' || m.dao_id, e.deployment_id, m.dao_id, e.contract_id, e.contract_role, e.event_name, e.topics, e.args,
  e.kind, e.title, e.summary, e.actor, e.addresses, e.proposal_id, e.token_id, e.amount, e.visibility,
  e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index, e.ledger_closed_at, e.transaction_hash
FROM app.activity_feed_events e
JOIN (SELECT DISTINCT deployment_id, dao_id, current_hash FROM manager.module_versions) m
  ON m.deployment_id = e.deployment_id AND m.current_hash = e.topics::jsonb ->> 'wasm_hash'
WHERE e.contract_role = 'manager'
  AND e.event_name = 'implementation_revoked';

CREATE VIEW app.proposal_list AS
SELECT
  row_number() OVER (PARTITION BY p.deployment_id, p.dao_id
    ORDER BY p.created_ledger, p.transaction_index, p.operation_index, p.event_index, p.created_event_id)::integer AS proposal_number,
  p.*
FROM governance.proposals p;

-- The list row plus the proposal's calls: [{action_index, target, function, args}],
-- unrolled from the parallel arrays of proposal_created.
CREATE VIEW app.proposal_detail AS
SELECT
  p.*,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'action_index', t.ordinality - 1,
      'target', t.value,
      'function', c.a -> 'functions' ->> (t.ordinality - 1)::integer,
      'args', c.a -> 'args' -> (t.ordinality - 1)::integer) ORDER BY t.ordinality)
    FROM jsonb_array_elements_text(COALESCE(c.a -> 'targets', '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
  ), '[]'::jsonb) AS actions
FROM app.proposal_list p
JOIN chain.events c ON c.event_id = p.created_event_id;

-- Feed freshness for the health endpoint: the latest feed ledger and how many
-- rows landed in the last hour (720 ledgers of ~5 s), both from the index on
-- (deployment_id, ledger_sequence), never from the whole feed.
CREATE VIEW app.feed_status AS
SELECT
  l.deployment_id,
  l.latest_ledger,
  (SELECT count(*) FROM app.activity_feed_events e
   WHERE e.deployment_id = l.deployment_id AND e.ledger_sequence > l.latest_ledger - 720)::bigint AS last_hour_count
FROM (
  SELECT deployment_id, max(ledger_sequence) AS latest_ledger
  FROM app.activity_feed_events
  GROUP BY deployment_id
) l;

CREATE VIEW app.indexer_status AS
SELECT
  deployment_id,
  max(ledger_sequence) AS latest_ledger,
  count(*)::bigint AS event_count,
  max(ingested_at) AS last_ingested_at
FROM chain.raw_events
GROUP BY deployment_id;
