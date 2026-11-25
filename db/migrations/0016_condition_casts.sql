-- =============================================================================
-- CASTS IN CONDITIONS READ ONLY THE VIEW'S OWN ROWS
--
-- PostgreSQL does not promise an order for the parts of a WHERE or JOIN
-- condition. What the planner does: a condition on one relation runs at that
-- relation's scan, before any join, and the conditions of one scan run
-- cheapest first. So a cast can only meet another contract's row when the
-- relation it reads has nothing of its own that excludes that row.
--
-- governance.proposals joined proposal_scheduled by contract and proposal
-- only, through the join. A reader that filtered on a column from that row
-- (vote_start_seconds, quorum_votes) turned the LEFT JOIN into an inner join,
-- and the planner moved the cast to the proposal_scheduled scan, where nothing
-- excluded other contracts. An outside module (role `module`) that emits a
-- `proposal_scheduled` with a word for `vote_start` then made that read raise,
-- for every DAO of the deployment, under a hash or merge join.
--
--   chain.try_numeric      text to numeric, NULL for anything that is not a
--                          whole number of at most 78 digits
--   governance.proposals   proposal_scheduled is read for role `governor` only,
--                          and its vote_start, vote_end and quorum_votes go
--                          through chain.u64_bigint and chain.try_numeric
--   claims.claimers        the refund lookup matches list_id through
--                          chain.u64_bigint, so the cast in its WHERE cannot
--                          raise whatever order the conditions run in
--
-- Both views keep their columns and types, so CREATE OR REPLACE leaves
-- app.proposal_list, app.proposal_detail, the grants and the Prisma models in
-- place. The other casts in view conditions are safe without a change: see
-- "Casts in conditions" in docs/DATABASE_SCHEMA.md.
-- =============================================================================

-- A whole number (an i128 or u128 amount) as text to numeric, or NULL. The CASE
-- fixes the order: the pattern first, so the cast only sees at most 78 digits,
-- and a numeric(78, 0) of the result cannot overflow either.
CREATE FUNCTION chain.try_numeric(raw text)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE WHEN raw ~ '^[+-]?[0-9]{1,78}$' THEN raw::numeric END
$$;

-- 0004's proposals. proposal_scheduled gains its own role condition, so a
-- filter a reader puts on its columns meets only Governor rows, and its casts
-- cannot raise. The Governor's own values are bounded (now plus at most 30
-- days, an i128 quorum), so they read as before.
CREATE OR REPLACE VIEW governance.proposals AS
WITH created AS (
  SELECT
    e.event_id AS created_event_id,
    e.deployment_id,
    e.dao_id,
    e.contract_id,
    e.topic_0 AS proposal_id,
    e.t ->> 'proposer' AS proposer,
    e.a ->> 'description' AS description,
    (e.a ->> 'vote_snapshot')::bigint AS snapshot_ledger,
    chain.u64_bigint(s.a ->> 'vote_start') AS vote_start_seconds,
    COALESCE(chain.u64_bigint(s.a ->> 'vote_end'), (e.a ->> 'vote_end')::bigint) AS vote_end_seconds,
    chain.try_numeric(s.a ->> 'quorum_votes')::numeric(78, 0) AS quorum_votes,
    jsonb_array_length(COALESCE(e.a -> 'targets', '[]'::jsonb)) AS action_count,
    e.ledger_sequence AS created_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    e.closed_at AS created_at,
    e.transaction_hash AS created_transaction_hash
  FROM manager.module_events e
  LEFT JOIN chain.events s
    ON s.deployment_id = e.deployment_id AND s.contract_id = e.contract_id
   AND s.contract_role = 'governor'
   AND s.event_name = 'proposal_scheduled' AND s.topic_0 = e.topic_0
  WHERE e.contract_role = 'governor'
    AND e.event_name = 'proposal_created'
)
SELECT
  c.*,
  CASE
    WHEN l.last_event = 'proposal_executed' THEN 'executed'
    WHEN l.last_event = 'proposal_cancelled' THEN 'canceled'
    WHEN l.last_event = 'proposal_queued' THEN
      CASE WHEN extract(epoch FROM now()) >= l.eta_seconds + 1209600 THEN 'expired' ELSE 'queued' END
    WHEN c.vote_start_seconds IS NOT NULL AND extract(epoch FROM now()) < c.vote_start_seconds THEN 'pending'
    WHEN extract(epoch FROM now()) < c.vote_end_seconds THEN 'active'
    WHEN COALESCE(t.for_votes, 0) + COALESCE(t.abstain_votes, 0) >= COALESCE(c.quorum_votes, 0)
      AND COALESCE(t.for_votes, 0) > COALESCE(t.against_votes, 0) THEN
      CASE WHEN extract(epoch FROM now()) >= c.vote_end_seconds + 1209600 THEN 'expired' ELSE 'succeeded' END
    ELSE 'defeated'
  END AS state,
  l.eta_seconds,
  l.updated_ledger,
  l.updated_at,
  COALESCE(t.for_votes, 0)::numeric(78, 0) AS for_votes,
  COALESCE(t.against_votes, 0)::numeric(78, 0) AS against_votes,
  COALESCE(t.abstain_votes, 0)::numeric(78, 0) AS abstain_votes
FROM created c
-- Both laterals key on the indexed topic columns of the proposal's own events
-- (proposal_id is topic_0 of the lifecycle events and topic_1 of vote_cast),
-- so a per-DAO or per-proposal filter never sorts another DAO's votes.
-- The latest lifecycle event wins; the eta recorded when the proposal was
-- queued is kept after it is executed or canceled.
LEFT JOIN LATERAL (
  SELECT
    (array_agg(x.event_name ORDER BY x.pos DESC, x.event_id DESC))[1] AS last_event,
    (array_agg((x.a ->> 'eta')::bigint ORDER BY x.pos DESC, x.event_id DESC) FILTER (WHERE x.event_name = 'proposal_queued'))[1] AS eta_seconds,
    max(x.ledger_sequence) AS updated_ledger,
    (array_agg(x.closed_at ORDER BY x.pos DESC, x.event_id DESC))[1] AS updated_at
  FROM chain.events x
  WHERE x.deployment_id = c.deployment_id AND x.contract_id = c.contract_id
    AND x.event_name IN ('proposal_queued', 'proposal_executed', 'proposal_cancelled')
    AND x.topic_0 = c.proposal_id
) l ON true
LEFT JOIN LATERAL (
  SELECT
    COALESCE(sum((v.a ->> 'weight')::numeric) FILTER (WHERE (v.a ->> 'vote_type')::integer = 1), 0)::numeric(78, 0) AS for_votes,
    COALESCE(sum((v.a ->> 'weight')::numeric) FILTER (WHERE (v.a ->> 'vote_type')::integer = 0), 0)::numeric(78, 0) AS against_votes,
    COALESCE(sum((v.a ->> 'weight')::numeric) FILTER (WHERE (v.a ->> 'vote_type')::integer = 2), 0)::numeric(78, 0) AS abstain_votes
  FROM chain.events v
  WHERE v.deployment_id = c.deployment_id AND v.contract_id = c.contract_id
    AND v.event_name = 'vote_cast' AND v.topic_1 = c.proposal_id
) t ON true;

-- 0010's claimers, with the refund lookup's list_id read through
-- chain.u64_bigint (a list id is a u32, so the match is unchanged).
CREATE OR REPLACE VIEW claims.claimers AS
SELECT
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  c.list_id,
  c.claimer,
  max(c.claimer_total)::bigint AS claimed,
  sum(c.paid)::numeric(78, 0) AS paid,
  COALESCE(sum(c.paid) FILTER (WHERE c.escrowed), 0)::numeric(78, 0) AS escrowed,
  COALESCE((
    SELECT sum((r.a ->> 'amount')::numeric) FROM manager.module_events r
    WHERE r.deployment_id = c.deployment_id AND r.contract_id = c.contract_id
      AND r.contract_role = 'claims' AND r.event_name = 'refunded'
      AND chain.u64_bigint(r.t ->> 'list_id') = c.list_id AND r.t ->> 'claimer' = c.claimer
  ), 0)::numeric(78, 0) AS refunded
FROM claims.claims c
GROUP BY c.deployment_id, c.dao_id, c.contract_id, c.list_id, c.claimer;
