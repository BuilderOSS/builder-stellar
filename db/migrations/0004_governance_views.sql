-- =============================================================================
-- GOVERNANCE VIEWS
--
-- Governor events (OpenZeppelin governor + contracts/governor/src/events.rs):
--   proposal_created     topics proposal_id, proposer;
--                        data { targets[], functions[], args[][], vote_snapshot, vote_end, description }
--   proposal_scheduled   topic proposal_id; data { vote_start, vote_end, snapshot_ledger, quorum_votes }
--                        (same transaction; the quorum is fixed at proposal time)
--   vote_cast            topics voter, proposal_id; data { vote_type (0 against, 1 for, 2 abstain), weight, reason }
--   proposal_queued      topic proposal_id; data { eta }
--   proposal_executed    topic proposal_id   (inside Governor.consume, same tx as the Treasury calls)
--   proposal_cancelled   topic proposal_id
--   proposal_commented   topics proposal_id, author; data { body }
--   governor_initialized topic admin; data { token_contract, treasury_contract, voting_delay,
--                        voting_period, queue_delay, proposal_threshold, quorum_bps }
--   *_changed setters    topic changed_by; data { old_value, new_value }
--   admin_changed        topics old_admin, new_admin (launch handoff to the Treasury)
-- Not projected: quorum_changed (OpenZeppelin; basis points, duplicates the
-- setter), the setters' old_value and changed_by (feed only).
--
-- vote_snapshot is a ledger; vote_start / vote_end / eta are unix seconds.
-- Proposal state and quorum are read from chain by the app when it can; the
-- indexed state mirrors Governor.proposal_state from the clock.
-- =============================================================================

CREATE VIEW governance.proposal_votes AS
SELECT
  e.event_id AS vote_event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  e.t ->> 'proposal_id' AS proposal_id,
  e.t ->> 'voter' AS voter,
  (e.a ->> 'vote_type')::integer AS support,
  (e.a ->> 'weight')::numeric(78, 0) AS weight,
  e.a ->> 'reason' AS reason,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'governor'
  AND e.event_name = 'vote_cast';

-- Proposal with its state, mirroring Governor.proposal_state:
--   'executed' / 'canceled'   ProposalExecuted / ProposalCancelled
--   'queued'    ProposalQueued and now < eta + 14 days; 'expired' after that
--   otherwise, from ProposalScheduled and the tallies at the current time:
--   'pending'   now < vote_start
--   'active'    vote_start <= now < vote_end
--   'succeeded' vote ended, for + abstain >= quorum_votes and for > against,
--               and now < vote_end + 14 days; 'expired' after that
--   'defeated'  vote ended without quorum or without a majority
-- 14 days = PROPOSAL_EXPIRATION_PERIOD (1_209_600 s) in the Governor contract.
-- The tally columns come last so app.proposal_list is `proposal_number, p.*`.
CREATE VIEW governance.proposals AS
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
    (s.a ->> 'vote_start')::bigint AS vote_start_seconds,
    COALESCE((s.a ->> 'vote_end')::bigint, (e.a ->> 'vote_end')::bigint) AS vote_end_seconds,
    (s.a ->> 'quorum_votes')::numeric(78, 0) AS quorum_votes,
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
   AND s.event_name = 'proposal_scheduled' AND s.topic_0 = e.topic_0
  WHERE e.contract_role = 'governor'
    AND e.event_name = 'proposal_created'
), lifecycle AS (
  -- The latest lifecycle event wins; the eta recorded when the proposal was
  -- queued is kept after it is executed or canceled.
  SELECT
    deployment_id, contract_id, topic_0 AS proposal_id,
    (array_agg(event_name ORDER BY pos DESC, event_id DESC))[1] AS last_event,
    (array_agg((a ->> 'eta')::bigint ORDER BY pos DESC, event_id DESC) FILTER (WHERE event_name = 'proposal_queued'))[1] AS eta_seconds,
    max(ledger_sequence) AS updated_ledger,
    (array_agg(closed_at ORDER BY pos DESC, event_id DESC))[1] AS updated_at
  FROM chain.events
  WHERE contract_role = 'governor'
    AND event_name IN ('proposal_queued', 'proposal_executed', 'proposal_cancelled')
  GROUP BY deployment_id, contract_id, topic_0
), tally AS (
  SELECT
    deployment_id, contract_id, proposal_id,
    COALESCE(sum(weight) FILTER (WHERE support = 1), 0)::numeric(78, 0) AS for_votes,
    COALESCE(sum(weight) FILTER (WHERE support = 0), 0)::numeric(78, 0) AS against_votes,
    COALESCE(sum(weight) FILTER (WHERE support = 2), 0)::numeric(78, 0) AS abstain_votes
  FROM governance.proposal_votes
  GROUP BY deployment_id, contract_id, proposal_id
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
LEFT JOIN lifecycle l
  ON l.deployment_id = c.deployment_id AND l.contract_id = c.contract_id AND l.proposal_id = c.proposal_id
LEFT JOIN tally t
  ON t.deployment_id = c.deployment_id AND t.contract_id = c.contract_id AND t.proposal_id = c.proposal_id;

-- Current Governor configuration per DAO: the constructor values overlaid with
-- the latest *_changed event of each parameter, and the current admin.
-- Durations are seconds; proposal_threshold is an absolute vote count;
-- quorum_bps is basis points of the voting supply at each proposal's snapshot.
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

-- Event-only comment threads per proposal.
CREATE VIEW governance.proposal_comments AS
SELECT
  e.event_id AS comment_event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  e.t ->> 'proposal_id' AS proposal_id,
  e.t ->> 'author' AS author,
  e.a ->> 'body' AS body,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'governor'
  AND e.event_name = 'proposal_commented';
