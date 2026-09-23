-- =============================================================================
-- GOVERNANCE VIEWS MIGRATION
--
-- Creates views for:
-- - Proposal lifecycle tracking
-- - Proposal votes
-- - Proposal actions
-- - Complete proposals with vote aggregation
-- - Governor authority history and current state
-- =============================================================================


-- Governance: Proposal lifecycle events
CREATE OR REPLACE VIEW governance.proposal_lifecycle AS
SELECT
  e.event_id AS lifecycle_event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'proposal_id' AS proposal_id,
  CASE e.event_name
    WHEN 'proposal_queued' THEN 'queued'
    WHEN 'proposal_executed' THEN 'executed'
    WHEN 'proposal_canceled' THEN 'canceled'
    ELSE e.event_name
  END AS state,
  (e.args::jsonb ->> 'eta')::bigint AS eta_seconds,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'governor'
  AND e.event_name IN ('proposal_queued', 'proposal_executed', 'proposal_canceled');

-- Governance: Proposal votes
CREATE OR REPLACE VIEW governance.proposal_votes AS
SELECT
  e.event_id AS vote_event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'proposal_id' AS proposal_id,
  e.topics::jsonb ->> 'voter' AS voter,
  (e.args::jsonb ->> 'vote_type')::integer AS support,
  (e.args::jsonb ->> 'weight')::numeric(78,0) AS weight,
  e.args::jsonb ->> 'reason' AS reason,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'governor'
  AND e.event_name = 'vote_cast';

-- Governance: Proposal actions
CREATE OR REPLACE VIEW governance.proposal_actions AS
SELECT
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'proposal_id' AS proposal_id,
  t.ordinality - 1 AS action_index,
  t.value AS target,
  f.value AS function,
  a.value AS args,
  jsonb_array_length(COALESCE(e.args::jsonb -> 'targets', '[]'::jsonb)) AS action_count,
  NULL::boolean AS executed,
  NULL::text AS executor,
  NULL::bigint AS executed_ledger,
  NULL::timestamptz AS executed_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(e.args::jsonb -> 'targets', '[]'::jsonb)) WITH ORDINALITY t(value, ordinality) ON true
LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(e.args::jsonb -> 'functions', '[]'::jsonb)) WITH ORDINALITY f(value, ordinality) ON f.ordinality = t.ordinality
LEFT JOIN LATERAL jsonb_array_elements(COALESCE(e.args::jsonb -> 'args', '[]'::jsonb)) WITH ORDINALITY a(value, ordinality) ON a.ordinality = t.ordinality
WHERE e.contract_role = 'governor'
  AND e.event_name = 'proposal_created';

-- Governance: Governor authority history
CREATE OR REPLACE VIEW governance.governor_authority_history AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'authority' AS authority,
  (e.args::jsonb ->> 'enabled')::boolean AS enabled,
  e.args::jsonb ->> 'changed_by' AS changed_by,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'governor'
  AND e.event_name = 'governor_authority_changed';

-- Governance: Current enabled governor authorities
CREATE OR REPLACE VIEW governance.governor_authorities AS
WITH latest_events AS (
  SELECT DISTINCT ON (deployment_id, dao_id, authority)
    deployment_id,
    dao_id,
    contract_id,
    authority,
    enabled,
    event_ledger,
    transaction_index,
    operation_index,
    event_index,
    event_at,
    transaction_hash
  FROM governance.governor_authority_history
  ORDER BY deployment_id, dao_id, authority, event_ledger DESC, transaction_index DESC, operation_index DESC, event_index DESC
), explicit_authorities AS (
  SELECT
    e.deployment_id,
    e.dao_id,
    e.contract_id,
    e.authority,
    e.enabled,
    e.event_ledger,
    e.event_at,
    e.transaction_hash,
    'event'::text AS source
  FROM latest_events e
  LEFT JOIN manager.daos d USING (deployment_id, dao_id)
  WHERE e.enabled
    AND e.authority IS DISTINCT FROM d.treasury_contract
), owner_authorities AS (
  SELECT
    d.deployment_id,
    d.dao_id,
    d.governor_contract AS contract_id,
    d.treasury_contract AS authority,
    true AS enabled,
    d.finalized_ledger AS event_ledger,
    d.finalized_at AS event_at,
    d.finalized_tx_hash AS transaction_hash,
    'owner'::text AS source
  FROM manager.daos d
  WHERE d.finalized_ledger IS NOT NULL
)
SELECT * FROM explicit_authorities
UNION ALL
SELECT * FROM owner_authorities;

-- Governance: Complete proposals with lifecycle state and vote counts
CREATE OR REPLACE VIEW governance.proposals AS
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
    (e.args::jsonb ->> 'vote_start')::bigint AS vote_start_seconds,
    (e.args::jsonb ->> 'vote_end')::bigint AS vote_end_seconds,
    jsonb_array_length(COALESCE(e.args::jsonb -> 'targets', '[]'::jsonb)) AS action_count,
    e.ledger_sequence AS created_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS created_at,
    e.transaction_hash AS created_transaction_hash
  FROM chain.decoded_events e
  JOIN manager.event_identity i USING (deployment_id, contract_id)
  WHERE e.contract_role = 'governor'
    AND e.event_name = 'proposal_created'
),
lifecycle AS (
  SELECT DISTINCT ON (deployment_id, dao_id, proposal_id)
    deployment_id,
    dao_id,
    proposal_id,
    state,
    eta_seconds,
    event_ledger AS updated_ledger,
    event_at AS updated_at
  FROM governance.proposal_lifecycle
  ORDER BY deployment_id, dao_id, proposal_id, event_ledger DESC, transaction_index DESC, operation_index DESC, event_index DESC
)
SELECT
  c.*,
  COALESCE(l.state, 'pending') AS state,
  l.eta_seconds,
  l.updated_ledger,
  l.updated_at
FROM created c
LEFT JOIN lifecycle l USING (deployment_id, dao_id, proposal_id);
