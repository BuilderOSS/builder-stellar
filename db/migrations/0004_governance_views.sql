-- =============================================================================
-- GOVERNANCE VIEWS
--
-- Source events (governor contract):
--   proposal_created   topics proposal_id, proposer;
--                      data { targets[], functions[], args[][], vote_snapshot, vote_end, description }
--   vote_cast          topics voter, proposal_id; data { vote_type, weight, reason }
--   proposal_queued    topic proposal_id; data { eta }
--   proposal_executed  topic proposal_id   (emitted inside Governor.consume, same tx as the Treasury calls)
--   proposal_cancelled topic proposal_id
--
-- Source events (treasury contract):
--   execute            topics governor, target, proposal_id; data { function, index }
--                      one event per call of the proposal; Treasury.execute is
--                      permissionless and consumes the proposal on the Governor first.
--
-- The Governor has no authority role any more (GovernorAuthorityChanged is gone);
-- the Treasury owns the Governor from launch and parameter setters emit
-- *_changed events with the owner as `caller`.
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

-- One row per call the Treasury executed for a proposal (Treasury `execute`),
-- ordered by call_index. `args` comes from the matching proposal_actions row
-- (same index) so the UI can show what was executed. A proposal that was
-- consumed (executed) always has one row per action, all in the same tx.
CREATE VIEW governance.proposal_execution_calls AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id AS treasury_contract,
  e.topics::jsonb ->> 'proposal_id' AS proposal_id,
  (e.args::jsonb ->> 'index')::integer AS call_index,
  e.topics::jsonb ->> 'governor' AS governor,
  e.topics::jsonb ->> 'target' AS target,
  e.args::jsonb ->> 'function' AS function,
  a.args AS args,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM NULLIF(e.ledger_closed_at, '')::timestamptz)::bigint AS event_timestamp_seconds,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
LEFT JOIN governance.proposal_actions a
  ON a.deployment_id = e.deployment_id
 AND a.dao_id = i.dao_id
 AND a.proposal_id = e.topics::jsonb ->> 'proposal_id'
 AND a.action_index = (e.args::jsonb ->> 'index')::integer
WHERE e.contract_role = 'treasury'
  AND e.event_name = 'execute';

-- Proposal with its latest lifecycle state.
--   'pending'   no lifecycle event yet (covers Pending/Active/Succeeded/Defeated on chain)
--   'queued' / 'executed' / 'canceled'   latest ProposalQueued / ProposalExecuted / ProposalCancelled
--   'expired'   computed from the clock (the chain reports Expired lazily, with no event):
--               * queued and now >= eta + 14 days (the Treasury can no longer execute it), or
--               * never queued, now >= vote_end + 14 days, and for_votes > against_votes.
--                 Quorum is not derivable from events, so a never-queued proposal that
--                 won the vote but missed quorum is reported 'expired' here although the
--                 chain says Defeated; both are terminal.
-- 14 days = PROPOSAL_EXPIRATION_PERIOD (1_209_600 s) in the Governor contract.
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
), tally AS (
  SELECT
    deployment_id, dao_id, proposal_id,
    COALESCE(sum(weight) FILTER (WHERE support = 1), 0) AS for_votes,
    COALESCE(sum(weight) FILTER (WHERE support = 0), 0) AS against_votes
  FROM governance.proposal_votes
  GROUP BY deployment_id, dao_id, proposal_id
)
SELECT
  c.*,
  CASE
    WHEN l.state = 'queued'
      AND extract(epoch FROM now()) >= l.eta_seconds + 1209600 THEN 'expired'
    WHEN l.state IS NULL
      AND c.vote_end_seconds IS NOT NULL
      AND extract(epoch FROM now()) >= c.vote_end_seconds + 1209600
      AND COALESCE(t.for_votes, 0) > COALESCE(t.against_votes, 0) THEN 'expired'
    ELSE COALESCE(l.state, 'pending')
  END AS state,
  l.eta_seconds,
  l.updated_ledger,
  l.updated_at
FROM created c
LEFT JOIN lifecycle l
  ON l.deployment_id = c.deployment_id AND l.dao_id = c.dao_id AND l.proposal_id = c.proposal_id
LEFT JOIN tally t
  ON t.deployment_id = c.deployment_id AND t.dao_id = c.dao_id AND t.proposal_id = c.proposal_id;
