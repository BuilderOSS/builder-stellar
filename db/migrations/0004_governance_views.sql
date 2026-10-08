-- =============================================================================
-- GOVERNANCE VIEWS
--
-- Source events (governor contract):
--   proposal_created   topics proposal_id, proposer;
--                      data { targets[], functions[], args[][], vote_snapshot, vote_end, description }
--   vote_cast          topics voter, proposal_id; data { vote_type, weight, reason }
--   proposal_queued    topic proposal_id; data { eta }
--   proposal_executed  topic proposal_id
--   proposal_cancelled topic proposal_id
--   governor_authority_changed topic authority; data { old_enabled, enabled }
--
-- vote_snapshot is a ledger sequence; vote_end is a unix timestamp in seconds.
-- vote_type: 0 against, 1 for, 2 abstain.
-- =============================================================================

CREATE VIEW governance.proposal_lifecycle AS
SELECT
  e.event_id AS lifecycle_event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topic_0 AS proposal_id,
  CASE e.event_name
    WHEN 'proposal_queued' THEN 'queued'
    WHEN 'proposal_executed' THEN 'executed'
    WHEN 'proposal_cancelled' THEN 'canceled'
  END AS state,
  (e.args::jsonb ->> 'eta')::bigint AS eta_seconds,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM NULLIF(e.ledger_closed_at, '')::timestamptz)::bigint AS event_timestamp_seconds,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'governor'
  AND e.event_name IN ('proposal_queued', 'proposal_executed', 'proposal_cancelled');

CREATE VIEW governance.proposal_votes AS
SELECT
  e.event_id AS vote_event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'proposal_id' AS proposal_id,
  e.topics::jsonb ->> 'voter' AS voter,
  (e.args::jsonb ->> 'vote_type')::integer AS support,
  (e.args::jsonb ->> 'weight')::numeric(78, 0) AS weight,
  e.args::jsonb ->> 'reason' AS reason,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM NULLIF(e.ledger_closed_at, '')::timestamptz)::bigint AS event_timestamp_seconds,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'governor'
  AND e.event_name = 'vote_cast';

-- One row per call in a proposal; targets, functions and args are parallel arrays.
CREATE VIEW governance.proposal_actions AS
SELECT
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'proposal_id' AS proposal_id,
  (t.ordinality - 1)::integer AS action_index,
  t.value AS target,
  f.value AS function,
  a.value AS args,
  jsonb_array_length(e.args::jsonb -> 'targets') AS action_count,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(e.args::jsonb -> 'targets', '[]'::jsonb))
  WITH ORDINALITY AS t(value, ordinality)
LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(e.args::jsonb -> 'functions', '[]'::jsonb))
  WITH ORDINALITY AS f(value, ordinality) ON f.ordinality = t.ordinality
LEFT JOIN LATERAL jsonb_array_elements(COALESCE(e.args::jsonb -> 'args', '[]'::jsonb))
  WITH ORDINALITY AS a(value, ordinality) ON a.ordinality = t.ordinality
WHERE e.contract_role = 'governor'
  AND e.event_name = 'proposal_created';

CREATE VIEW governance.governor_authority_history AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'authority' AS authority,
  (e.args::jsonb ->> 'old_enabled')::boolean AS old_enabled,
  (e.args::jsonb ->> 'enabled')::boolean AS enabled,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM NULLIF(e.ledger_closed_at, '')::timestamptz)::bigint AS event_timestamp_seconds,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'governor'
  AND e.event_name = 'governor_authority_changed';

-- Addresses that may act as governor authority: explicitly enabled ones, plus
-- the Treasury, which owns the Governor from launch onwards.
CREATE VIEW governance.governor_authorities AS
WITH latest AS (
  SELECT DISTINCT ON (h.deployment_id, h.dao_id, h.contract_id, h.authority)
    h.deployment_id, h.dao_id, h.contract_id, h.authority, h.enabled,
    h.event_ledger, h.event_at, h.transaction_hash
  FROM governance.governor_authority_history h
  ORDER BY h.deployment_id, h.dao_id, h.contract_id, h.authority, h.event_ledger DESC,
    h.transaction_index DESC NULLS LAST, h.operation_index DESC NULLS LAST,
    h.event_index DESC NULLS LAST, h.event_id DESC
)
SELECT
  l.deployment_id, l.dao_id, l.contract_id, l.authority, l.enabled,
  l.event_ledger, l.event_at, l.transaction_hash,
  'event'::text AS source
FROM latest l
JOIN manager.dao_registry r ON r.deployment_id = l.deployment_id AND r.dao_id = l.dao_id
WHERE l.enabled
  AND l.authority IS DISTINCT FROM r.treasury_contract
UNION ALL
SELECT
  d.deployment_id, d.dao_id, d.governor_contract, d.treasury_contract, true,
  d.launched_ledger, d.launched_at, d.launched_tx_hash,
  'owner'::text
FROM manager.daos d
WHERE d.launched_ledger IS NOT NULL
  AND d.treasury_contract IS NOT NULL;

-- Proposal with its latest lifecycle state ('pending' until queued/executed/canceled).
CREATE VIEW governance.proposals AS
WITH created AS (
  SELECT
    e.event_id AS created_event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'proposal_id' AS proposal_id,
    e.topics::jsonb ->> 'proposer' AS proposer,
    e.args::jsonb ->> 'description' AS description,
    (e.args::jsonb ->> 'vote_snapshot')::bigint AS snapshot_ledger,
    (e.args::jsonb ->> 'vote_end')::bigint AS vote_end_seconds,
    jsonb_array_length(COALESCE(e.args::jsonb -> 'targets', '[]'::jsonb)) AS action_count,
    e.ledger_sequence AS created_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, '')::timestamptz AS created_at,
    e.transaction_hash AS created_transaction_hash
  FROM chain.decoded_events e
  JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'governor'
    AND e.event_name = 'proposal_created'
), lifecycle AS (
  -- Latest state wins, but the eta recorded when the proposal was queued is
  -- kept after it is executed or canceled.
  SELECT
    deployment_id, dao_id, proposal_id,
    (array_agg(state ORDER BY event_ledger DESC, transaction_index DESC NULLS LAST,
      operation_index DESC NULLS LAST, event_index DESC NULLS LAST, lifecycle_event_id DESC))[1] AS state,
    (array_agg(eta_seconds ORDER BY event_ledger DESC, transaction_index DESC NULLS LAST,
      operation_index DESC NULLS LAST, event_index DESC NULLS LAST, lifecycle_event_id DESC)
      FILTER (WHERE eta_seconds IS NOT NULL))[1] AS eta_seconds,
    max(event_ledger) AS updated_ledger,
    (array_agg(event_at ORDER BY event_ledger DESC, transaction_index DESC NULLS LAST,
      operation_index DESC NULLS LAST, event_index DESC NULLS LAST, lifecycle_event_id DESC))[1] AS updated_at
  FROM governance.proposal_lifecycle
  GROUP BY deployment_id, dao_id, proposal_id
)
SELECT
  c.*,
  COALESCE(l.state, 'pending') AS state,
  l.eta_seconds,
  l.updated_ledger,
  l.updated_at
FROM created c
LEFT JOIN lifecycle l
  ON l.deployment_id = c.deployment_id AND l.dao_id = c.dao_id AND l.proposal_id = c.proposal_id;
