-- =============================================================================
-- GOVERNANCE VIEWS
--
-- Source events (governor contract):
--   proposal_created   topics proposal_id, proposer;
--                      data { targets[], functions[], args[][], vote_snapshot, vote_end, description }
--   proposal_scheduled topic proposal_id;
--                      data { vote_start, vote_end, snapshot_ledger, quorum_votes }
--                      (same transaction as proposal_created; quorum is fixed at proposal
--                      time because the snapshot precedes the proposal)
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
-- Governor configuration (governance.settings):
--   governor_initialized topic admin; data { token_contract, treasury_contract, voting_delay,
--                        voting_period, queue_delay, proposal_threshold, quorum_bps, version }
--   quorum_changed       OpenZeppelin; data { old_quorum, new_quorum }: duplicates the
--                        constructor quorum and every quorum_bps_changed (not read here)
--   voting_delay_changed / voting_period_changed / queue_delay_changed /
--   proposal_threshold_changed / quorum_bps_changed
--                        topic changed_by; data { old_value, new_value }
--   admin_changed        topics old_admin, new_admin (launch handoff to the Treasury)
--
-- The Treasury is the Governor's admin from launch; parameter setters emit
-- *_changed events with the admin as `changed_by`.
--
-- vote_snapshot is a ledger sequence; vote_start / vote_end are unix timestamps in seconds.
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
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
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
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
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
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
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

-- Proposal with its state, mirroring Governor.proposal_state exactly:
--   'executed' / 'canceled'   ProposalExecuted / ProposalCancelled
--   'queued'    ProposalQueued and now < eta + 14 days; 'expired' after that
--   otherwise, from ProposalScheduled and the vote tallies at the current time:
--   'pending'   now < vote_start
--   'active'    vote_start <= now < vote_end
--   'succeeded' vote ended, for + abstain >= quorum_votes and for > against,
--               and now < vote_end + 14 days; 'expired' after that
--   'defeated'  vote ended without quorum or without a majority
-- The chain reports these lazily (no event), so they are computed from the clock.
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
    (s.args::jsonb ->> 'vote_start')::bigint AS vote_start_seconds,
    COALESCE((s.args::jsonb ->> 'vote_end')::bigint, (e.args::jsonb ->> 'vote_end')::bigint) AS vote_end_seconds,
    (s.args::jsonb ->> 'quorum_votes')::numeric(78, 0) AS quorum_votes,
    jsonb_array_length(COALESCE(e.args::jsonb -> 'targets', '[]'::jsonb)) AS action_count,
    e.ledger_sequence AS created_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS created_at,
    e.transaction_hash AS created_transaction_hash
  FROM chain.decoded_events e
  JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  LEFT JOIN chain.decoded_events s
    ON s.deployment_id = e.deployment_id
   AND s.contract_id = e.contract_id
   AND s.contract_role = 'governor'
   AND s.event_name = 'proposal_scheduled'
   AND s.topic_0 = e.topic_0
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
    COALESCE(sum(weight) FILTER (WHERE support = 0), 0) AS against_votes,
    COALESCE(sum(weight) FILTER (WHERE support = 2), 0) AS abstain_votes
  FROM governance.proposal_votes
  GROUP BY deployment_id, dao_id, proposal_id
)
SELECT
  c.*,
  CASE
    WHEN l.state IN ('executed', 'canceled') THEN l.state
    WHEN l.state = 'queued' THEN
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
  l.updated_at
FROM created c
LEFT JOIN lifecycle l
  ON l.deployment_id = c.deployment_id AND l.dao_id = c.dao_id AND l.proposal_id = c.proposal_id
LEFT JOIN tally t
  ON t.deployment_id = c.deployment_id AND t.dao_id = c.dao_id AND t.proposal_id = c.proposal_id;

-- Current Governor configuration per DAO: the constructor values overlaid with
-- the latest *_changed event of each parameter. Durations are seconds;
-- proposal_threshold is an absolute vote count; quorum_bps is basis points of
-- the voting supply at each proposal's snapshot.
CREATE VIEW governance.settings AS
WITH initialized AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id,
    e.topic_0 AS initial_admin,
    (e.args::jsonb ->> 'voting_delay')::bigint AS voting_delay,
    (e.args::jsonb ->> 'voting_period')::bigint AS voting_period,
    (e.args::jsonb ->> 'queue_delay')::bigint AS queue_delay,
    (e.args::jsonb ->> 'proposal_threshold')::numeric AS proposal_threshold,
    (e.args::jsonb ->> 'quorum_bps')::integer AS quorum_bps,
    e.args::jsonb ->> 'version' AS version,
    e.ledger_sequence AS init_ledger,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS init_at
  FROM chain.decoded_events e
  WHERE e.contract_role = 'governor'
    AND e.event_name = 'governor_initialized'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.event_id DESC
), latest AS (
  -- Latest value per (governor, event): new_value for the setters, new_admin
  -- for the launch handoff.
  SELECT DISTINCT ON (e.deployment_id, e.contract_id, e.event_name)
    e.deployment_id,
    e.contract_id,
    e.event_name,
    COALESCE(e.args::jsonb ->> 'new_value', e.topics::jsonb ->> 'new_admin') AS value,
    e.ledger_sequence
  FROM chain.decoded_events e
  WHERE e.contract_role = 'governor'
    AND e.event_name IN ('voting_delay_changed', 'voting_period_changed', 'queue_delay_changed',
      'proposal_threshold_changed', 'quorum_bps_changed', 'admin_changed')
  ORDER BY e.deployment_id, e.contract_id, e.event_name, e.ledger_sequence DESC,
    e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST,
    e.event_index DESC NULLS LAST, e.event_id DESC
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
  ident.dao_id,
  i.contract_id AS governor_contract,
  COALESCE(o.admin, i.initial_admin) AS admin,
  COALESCE(o.voting_delay::bigint, i.voting_delay) AS voting_delay_seconds,
  COALESCE(o.voting_period::bigint, i.voting_period) AS voting_period_seconds,
  COALESCE(o.queue_delay::bigint, i.queue_delay) AS queue_delay_seconds,
  COALESCE(o.proposal_threshold::numeric, i.proposal_threshold) AS proposal_threshold,
  COALESCE(o.quorum_bps::integer, i.quorum_bps) AS quorum_bps,
  i.version,
  i.init_ledger,
  i.init_at,
  o.updated_ledger
FROM initialized i
JOIN manager.event_identity ident ON ident.deployment_id = i.deployment_id AND ident.contract_id = i.contract_id
LEFT JOIN overlay o ON o.deployment_id = i.deployment_id AND o.contract_id = i.contract_id;
