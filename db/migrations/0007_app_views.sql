-- =============================================================================
-- APP VIEWS MIGRATION
--
-- Creates app-facing views for:
-- - Decoded event activity feed
-- - Activity feed from activity_feed_events table
-- - Proposal list with vote counts
-- - Proposal detail with actions and votes
-- - Member list
-- - Manager implementations registry
-- - Current manager implementations
-- =============================================================================

BEGIN;

-- App: Activity from decoded events
CREATE OR REPLACE VIEW app.decoded_event_activity AS
SELECT
  e.event_id,
  e.deployment_id,
  e.contract_id,
  e.contract_role,
  e.event_name,
  CASE WHEN e.contract_role = 'manager' THEN NULL ELSE i.dao_id END AS dao_id,
  e.topics,
  e.args,
  e.ledger_sequence,
  e.transaction_hash
FROM chain.decoded_events e
LEFT JOIN manager.event_identity i USING (deployment_id, contract_id);

-- App: Activity feed
CREATE OR REPLACE VIEW app.activity_feed AS
SELECT
  e.activity_id,
  e.deployment_id,
  CASE WHEN e.contract_role = 'manager' THEN NULL ELSE i.dao_id END AS dao_id,
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
LEFT JOIN manager.event_identity i USING (deployment_id, contract_id);

-- App: Proposal list with vote counts
CREATE OR REPLACE VIEW app.proposal_list AS
SELECT
  row_number() OVER (PARTITION BY p.deployment_id, p.dao_id ORDER BY p.created_ledger, p.created_event_id)::integer AS proposal_number,
  p.*,
  (SELECT count(*) FROM governance.proposal_votes v
    WHERE v.deployment_id = p.deployment_id
      AND v.dao_id = p.dao_id
      AND v.proposal_id = p.proposal_id
      AND v.support = 1)::bigint AS for_votes,
  (SELECT count(*) FROM governance.proposal_votes v
    WHERE v.deployment_id = p.deployment_id
      AND v.dao_id = p.dao_id
      AND v.proposal_id = p.proposal_id
      AND v.support = 0)::bigint AS against_votes,
  (SELECT count(*) FROM governance.proposal_votes v
    WHERE v.deployment_id = p.deployment_id
      AND v.dao_id = p.dao_id
      AND v.proposal_id = p.proposal_id
      AND v.support = 2)::bigint AS abstain_votes
FROM governance.proposals p;

-- App: Proposal detail with actions and votes
CREATE OR REPLACE VIEW app.proposal_detail AS
SELECT
  p.*,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('action_index', a.action_index, 'target', a.target, 'function', a.function, 'args', a.args) ORDER BY a.action_index)
      FROM governance.proposal_actions a
      WHERE a.deployment_id = p.deployment_id
        AND a.dao_id = p.dao_id
        AND a.proposal_id = p.proposal_id),
    '[]'::jsonb
  ) AS actions,
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.event_ledger)
      FROM governance.proposal_votes v
      WHERE v.deployment_id = p.deployment_id
        AND v.dao_id = p.dao_id
        AND v.proposal_id = p.proposal_id),
    '[]'::jsonb
  ) AS votes
FROM app.proposal_list p;

-- App: Member list
CREATE OR REPLACE VIEW app.member_list AS
SELECT
  deployment_id,
  dao_id,
  contract_id,
  address,
  owned_token_count,
  delegated_to,
  voting_power,
  last_activity_ledger
FROM token.members;

-- Manager: Implementation registry
CREATE OR REPLACE VIEW manager.implementations AS
SELECT
  e.event_id,
  e.deployment_id,
  e.contract_id AS manager_contract,
  e.args ->> 'name' AS name,
  (e.args ->> 'version')::integer AS version,
  e.topic_0 AS wasm_hash,
  (e.args ->> 'published_at')::bigint AS published_at,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash,
  false AS revoked,
  NULL::bigint AS revoked_at
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'implementation_registered';

-- Manager: Current implementations
CREATE OR REPLACE VIEW manager.current_implementations AS
SELECT DISTINCT ON (e.deployment_id)
  e.deployment_id,
  e.args ->> 'token' AS token_impl,
  e.args ->> 'metadata' AS metadata_impl,
  e.args ->> 'auction' AS auction_impl,
  e.args ->> 'governor' AS governor_impl,
  e.args ->> 'treasury' AS treasury_impl,
  e.ledger_sequence AS updated_ledger,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS updated_at,
  e.transaction_hash
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'current_implementations_updated'
ORDER BY e.deployment_id, e.ledger_sequence DESC, e.event_id DESC;

COMMIT;
