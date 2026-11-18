DROP VIEW IF EXISTS manager.vote_sources;

-- Restore governance.settings without vote_source (0004's definition).
DROP VIEW IF EXISTS governance.settings;
CREATE VIEW governance.settings AS
WITH latest AS (
  SELECT DISTINCT ON (deployment_id, contract_id, event_name)
    deployment_id, contract_id, event_name,
    COALESCE(a ->> 'new_value', t ->> 'new_admin') AS value,
    ledger_sequence
  FROM chain.events
  WHERE contract_role = 'governor'
    AND event_name IN ('voting_delay_changed', 'voting_period_changed', 'queue_delay_changed',
      'proposal_threshold_changed', 'quorum_bps_changed', 'admin_changed')
  ORDER BY deployment_id, contract_id, event_name, pos DESC, event_id DESC
), overlay AS (
  SELECT
    deployment_id,
    contract_id,
    max(value) FILTER (WHERE event_name = 'voting_delay_changed') AS voting_delay,
    max(value) FILTER (WHERE event_name = 'voting_period_changed') AS voting_period,
    max(value) FILTER (WHERE event_name = 'queue_delay_changed') AS queue_delay,
    max(value) FILTER (WHERE event_name = 'proposal_threshold_changed') AS proposal_threshold,
    max(value) FILTER (WHERE event_name = 'quorum_bps_changed') AS quorum_bps,
    max(value) FILTER (WHERE event_name = 'admin_changed') AS admin,
    max(ledger_sequence) FILTER (WHERE event_name <> 'admin_changed') AS updated_ledger
  FROM latest
  GROUP BY deployment_id, contract_id
)
SELECT
  i.deployment_id,
  i.dao_id,
  i.contract_id AS governor_contract,
  COALESCE(o.admin, i.topic_0) AS admin,
  COALESCE(o.voting_delay::bigint, (i.a ->> 'voting_delay')::bigint) AS voting_delay_seconds,
  COALESCE(o.voting_period::bigint, (i.a ->> 'voting_period')::bigint) AS voting_period_seconds,
  COALESCE(o.queue_delay::bigint, (i.a ->> 'queue_delay')::bigint) AS queue_delay_seconds,
  COALESCE(o.proposal_threshold::numeric, (i.a ->> 'proposal_threshold')::numeric) AS proposal_threshold,
  COALESCE(o.quorum_bps::integer, (i.a ->> 'quorum_bps')::integer) AS quorum_bps,
  i.ledger_sequence AS init_ledger,
  i.closed_at AS init_at,
  o.updated_ledger
FROM (
  SELECT DISTINCT ON (deployment_id, contract_id) *
  FROM manager.module_events
  WHERE contract_role = 'governor' AND event_name = 'governor_initialized'
  ORDER BY deployment_id, contract_id, pos DESC, event_id DESC
) i
LEFT JOIN overlay o ON o.deployment_id = i.deployment_id AND o.contract_id = i.contract_id;
