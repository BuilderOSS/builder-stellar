-- =============================================================================
-- APP VIEWS
--
-- The read surface used by apps/web (see apps/web/prisma/schema.prisma):
--   app.activity_feed     tenant-resolved activity feed
--   app.proposal_list     proposals with vote tallies (state may be computed 'expired', see governance.proposals)
--   app.proposal_detail   proposals with actions and votes as JSON
--   app.indexer_status    ingestion progress, so the app never reads raw events
-- =============================================================================

-- dao_id resolution:
--   manager events        no DAO (deployment-wide)
--   minter events         shared contract, resolved through the token_id topic
--   every other module    resolved by contract address
-- Minter events for tokens that are not DAOs of this deployment are dropped.
CREATE VIEW app.activity_feed AS
SELECT
  e.activity_id,
  e.deployment_id,
  CASE e.contract_role
    WHEN 'manager' THEN NULL
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
WHERE e.contract_role <> 'minter' OR r.dao_id IS NOT NULL;

CREATE VIEW app.proposal_list AS
WITH tally AS (
  SELECT
    deployment_id, dao_id, proposal_id,
    COALESCE(sum(weight) FILTER (WHERE support = 1), 0)::numeric(78, 0) AS for_votes,
    COALESCE(sum(weight) FILTER (WHERE support = 0), 0)::numeric(78, 0) AS against_votes,
    COALESCE(sum(weight) FILTER (WHERE support = 2), 0)::numeric(78, 0) AS abstain_votes
  FROM governance.proposal_votes
  GROUP BY deployment_id, dao_id, proposal_id
)
SELECT
  row_number() OVER (PARTITION BY p.deployment_id, p.dao_id
    ORDER BY p.created_ledger, p.transaction_index, p.operation_index, p.event_index, p.created_event_id)::integer AS proposal_number,
  p.*,
  COALESCE(t.for_votes, 0)::numeric(78, 0) AS for_votes,
  COALESCE(t.against_votes, 0)::numeric(78, 0) AS against_votes,
  COALESCE(t.abstain_votes, 0)::numeric(78, 0) AS abstain_votes
FROM governance.proposals p
LEFT JOIN tally t
  ON t.deployment_id = p.deployment_id AND t.dao_id = p.dao_id AND t.proposal_id = p.proposal_id;

CREATE VIEW app.proposal_detail AS
SELECT
  p.*,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('action_index', a.action_index, 'target', a.target, 'function', a.function, 'args', a.args)
      ORDER BY a.action_index)
    FROM governance.proposal_actions a
    WHERE a.deployment_id = p.deployment_id AND a.dao_id = p.dao_id AND a.proposal_id = p.proposal_id
  ), '[]'::jsonb) AS actions,
  COALESCE((
    SELECT jsonb_agg(to_jsonb(v) ORDER BY v.event_ledger, v.transaction_index, v.operation_index, v.event_index, v.vote_event_id)
    FROM governance.proposal_votes v
    WHERE v.deployment_id = p.deployment_id AND v.dao_id = p.dao_id AND v.proposal_id = p.proposal_id
  ), '[]'::jsonb) AS votes
FROM app.proposal_list p;

CREATE VIEW app.indexer_status AS
SELECT
  deployment_id,
  max(ledger_sequence) AS latest_ledger,
  count(*)::bigint AS event_count,
  max(ingested_at) AS last_ingested_at
FROM chain.raw_events
GROUP BY deployment_id;
