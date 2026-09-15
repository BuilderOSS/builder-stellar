BEGIN;

CREATE OR REPLACE VIEW governance.proposal_lifecycle AS
WITH lifecycle_events AS (
  SELECT
    event_id AS lifecycle_event_id,
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'proposal_id', proposal_id) AS proposal_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'proposer', proposer, actor) AS proposer,
    CASE LOWER(event_name)
      WHEN 'proposal_queued' THEN 'queued'
      WHEN 'proposal_canceled' THEN 'canceled'
      WHEN 'proposal_cancelled' THEN 'canceled'
      WHEN 'proposal_executed' THEN 'executed'
      WHEN 'proposal_expired' THEN 'expired'
      ELSE lower(event_name)
    END AS state,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'eta', eta, '0')::bigint AS eta,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
    transaction_hash
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('proposal_queued', 'proposal_canceled', 'proposal_cancelled', 'proposal_executed', 'proposal_expired')
)
SELECT * FROM lifecycle_events;

CREATE OR REPLACE VIEW governance.proposal_votes AS
SELECT
  event_id AS vote_event_id,
  deployment_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'proposal_id', proposal_id) AS proposal_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'voter', actor, owner) AS voter,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'support', NULLIF(payload, '')::jsonb ->> 'vote_type', support, '0')::integer AS support,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'weight', amount, '0')::numeric(78, 0) AS weight,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'reason', reason, '') AS reason,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('vote_cast', 'proposal_vote', 'proposal_vote_cast', 'proposal_vote_indexed');

CREATE OR REPLACE VIEW governance.proposal_actions AS
WITH created AS (
  SELECT
    event_id,
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'proposal_id', proposal_id) AS proposal_id,
    NULLIF(payload, '')::jsonb AS payload,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS created_timestamp,
    transaction_hash
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('proposal_created', 'proposal_created_indexed')
),
targets AS (
  SELECT
    c.deployment_id,
    c.proposal_id,
    t.ordinality - 1 AS action_index,
    t.value AS target,
    c.payload,
    c.ledger_sequence,
    c.created_timestamp,
    c.transaction_hash,
    c.event_id
  FROM created c
  JOIN LATERAL jsonb_array_elements_text(COALESCE(c.payload -> 'targets', '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality) ON true
),
functions AS (
  SELECT
    c.deployment_id,
    c.proposal_id,
    f.ordinality - 1 AS action_index,
    f.value AS function,
    c.event_id
  FROM created c
  JOIN LATERAL jsonb_array_elements_text(COALESCE(c.payload -> 'functions', '[]'::jsonb)) WITH ORDINALITY AS f(value, ordinality) ON true
),
args AS (
  SELECT
    c.deployment_id,
    c.proposal_id,
    a.ordinality - 1 AS action_index,
    a.value AS args,
    c.event_id
  FROM created c
  JOIN LATERAL jsonb_array_elements(COALESCE(c.payload -> 'args', '[]'::jsonb)) WITH ORDINALITY AS a(value, ordinality) ON true
)
SELECT
  t.deployment_id,
  t.proposal_id,
  t.action_index,
  t.target,
  f.function,
  a.args,
  COALESCE(jsonb_array_length(COALESCE(t.payload -> 'targets', '[]'::jsonb)), 0) AS action_count,
  NULL::boolean AS executed,
  NULL::text AS executor,
  NULL::bigint AS executed_ledger,
  NULL::timestamptz AS executed_timestamp,
  t.transaction_hash
FROM targets t
LEFT JOIN functions f
  ON f.deployment_id = t.deployment_id
 AND f.proposal_id = t.proposal_id
 AND f.action_index = t.action_index
LEFT JOIN args a
  ON a.deployment_id = t.deployment_id
 AND a.proposal_id = t.proposal_id
 AND a.action_index = t.action_index;

CREATE OR REPLACE VIEW governance.proposals AS
WITH created AS (
  SELECT
    event_id AS created_event_id,
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'proposal_id', proposal_id) AS proposal_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'proposer', proposer, actor) AS proposer,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'description', description, '') AS description,
     NULLIF(COALESCE(NULLIF(payload, '')::jsonb ->> 'snapshot', snapshot_ledger), '')::bigint AS snapshot_ledger,
     NULLIF(COALESCE(NULLIF(payload, '')::jsonb ->> 'vote_start', vote_start_timestamp), '')::bigint AS vote_start_timestamp,
     NULLIF(COALESCE(NULLIF(payload, '')::jsonb ->> 'deadline', deadline_ledger), '')::bigint AS deadline_ledger,
     NULLIF(COALESCE(NULLIF(payload, '')::jsonb ->> 'action_count', action_count), '')::integer AS action_count,
    ledger_sequence AS created_ledger,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS created_timestamp,
    transaction_hash AS created_transaction_hash,
    transaction_index AS created_transaction_index,
    event_index AS created_event_index
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('proposal_created', 'proposal_created_indexed')
), latest_lifecycle AS (
  SELECT DISTINCT ON (deployment_id, proposal_id)
    deployment_id,
    proposal_id,
    state,
    eta,
    ledger_sequence AS updated_ledger,
    timestamp AS updated_timestamp
  FROM governance.proposal_lifecycle
  ORDER BY deployment_id, proposal_id, ledger_sequence DESC, timestamp DESC, lifecycle_event_id DESC
)
SELECT
  c.deployment_id,
  c.proposal_id,
  c.proposer,
  c.description,
  c.snapshot_ledger,
  c.vote_start_timestamp,
  c.deadline_ledger,
  c.action_count,
  COALESCE(l.state, 'pending') AS state,
  l.eta,
  c.created_event_id,
  c.created_ledger,
  c.created_timestamp,
  c.created_transaction_hash,
  l.updated_ledger,
  l.updated_timestamp
FROM created c
LEFT JOIN latest_lifecycle l
  ON l.deployment_id = c.deployment_id
 AND l.proposal_id = c.proposal_id;

CREATE OR REPLACE VIEW token.inventory AS
WITH ownership_events AS (
  SELECT
    event_id,
    deployment_id,
    COALESCE(
      NULLIF(payload, '')::jsonb ->> 'token_id',
      NULLIF(payload, '')::jsonb ->> 'tokenId',
      NULLIF(payload, '')::jsonb ->> 'id',
      token_id
    )::bigint AS token_id,
    COALESCE(
      NULLIF(payload, '')::jsonb ->> 'to',
      NULLIF(payload, '')::jsonb ->> 'owner',
      to_address,
      owner
    ) AS owner,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
    transaction_hash,
    transaction_index,
    event_index
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('mint', 'transfer', 'mint_with_minter', 'token_mint_indexed', 'token_transfer_indexed')
), latest_ownership AS (
  SELECT DISTINCT ON (deployment_id, token_id)
    *
  FROM ownership_events
  WHERE token_id IS NOT NULL AND owner IS NOT NULL
  ORDER BY deployment_id, token_id, ledger_sequence DESC, transaction_index DESC, event_index DESC, event_id DESC
)
SELECT
  event_id,
  deployment_id,
  token_id,
  owner,
  ledger_sequence,
  timestamp,
  transaction_hash
FROM latest_ownership;

CREATE OR REPLACE VIEW token.transfers AS
SELECT
  event_id,
  deployment_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'token_id', NULLIF(payload, '')::jsonb ->> 'tokenId', NULLIF(payload, '')::jsonb ->> 'id', token_id)::bigint AS token_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'operator', actor) AS operator,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'from', from_address) AS from_address,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'to', to_address, owner) AS to_address,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('transfer', 'token_transfer_indexed');

CREATE OR REPLACE VIEW token.delegations AS
SELECT
  event_id,
  deployment_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'delegator', actor) AS delegator,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'from_delegate', from_address) AS from_delegate,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'to_delegate', to_address) AS to_delegate,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('delegate_changed', 'delegate_changed_indexed');

CREATE OR REPLACE VIEW token.mint_authority_history AS
SELECT
  event_id,
  deployment_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'authority', actor) AS authority,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'enabled', 'false')::boolean AS enabled,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'changed_by', changed_by) AS changed_by,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('mint_authority_changed', 'mint_authority_changed_indexed');

CREATE OR REPLACE VIEW token.mint_authorities AS
WITH seeded AS (
  SELECT
    event_id,
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'owner', owner, actor) AS authority,
    true AS enabled,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
    transaction_hash,
    'owner'::text AS source
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('token_initialized', 'token_initialized_indexed')

  UNION ALL

  SELECT
    event_id,
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'authority', actor) AS authority,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'enabled', 'false')::boolean AS enabled,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
    transaction_hash,
    'event'::text AS source
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('mint_authority_changed', 'mint_authority_changed_indexed')
), latest AS (
  SELECT DISTINCT ON (deployment_id, authority)
    *
  FROM seeded
  ORDER BY deployment_id, authority, ledger_sequence DESC, timestamp DESC, event_id DESC
)
SELECT
  deployment_id,
  authority,
  enabled,
  ledger_sequence,
  timestamp,
  transaction_hash,
  source
FROM latest
WHERE enabled IS TRUE;

CREATE OR REPLACE VIEW governance.governor_authority_history AS
SELECT
  event_id,
  deployment_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'authority', actor) AS authority,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'enabled', 'false')::boolean AS enabled,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'changed_by', changed_by) AS changed_by,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('governor_authority_changed', 'governor_authority_changed_indexed');

CREATE OR REPLACE VIEW governance.governor_authorities AS
WITH seeded AS (
  SELECT
    event_id,
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'owner', owner, actor) AS authority,
    true AS enabled,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
    transaction_hash,
    'owner'::text AS source
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('governor_initialized', 'governor_initialized_indexed')

  UNION ALL

  SELECT
    event_id,
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'authority', actor) AS authority,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'enabled', 'false')::boolean AS enabled,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
    transaction_hash,
    'event'::text AS source
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('governor_authority_changed', 'governor_authority_changed_indexed')
), latest AS (
  SELECT DISTINCT ON (deployment_id, authority)
    *
  FROM seeded
  ORDER BY deployment_id, authority, ledger_sequence DESC, timestamp DESC, event_id DESC
)
SELECT
  deployment_id,
  authority,
  enabled,
  ledger_sequence,
  timestamp,
  transaction_hash,
  source
FROM latest
WHERE enabled IS TRUE;

CREATE OR REPLACE VIEW token.members AS
WITH owned_tokens AS (
  SELECT
    deployment_id,
    token_id,
    owner,
    ledger_sequence
  FROM token.inventory
  WHERE owner IS NOT NULL
), latest_delegation AS (
  SELECT DISTINCT ON (deployment_id, delegator)
    deployment_id,
    delegator,
    to_delegate,
    ledger_sequence
  FROM token.delegations
  WHERE delegator IS NOT NULL
  ORDER BY deployment_id, delegator, ledger_sequence DESC, timestamp DESC, event_id DESC
), latest_votes AS (
  SELECT DISTINCT ON (deployment_id, delegate)
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'delegate', actor) AS delegate,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'new_votes', '0')::numeric AS voting_power
  FROM chain.decoded_events
  WHERE LOWER(event_name) = 'delegate_votes_changed'
  ORDER BY deployment_id, delegate, ledger_sequence DESC, transaction_index DESC, event_index DESC, event_id DESC
)
SELECT
  o.deployment_id,
  o.owner AS address,
  COUNT(*)::bigint AS owned_token_count,
  d.to_delegate AS delegated_to,
  COALESCE(v.voting_power, 0)::bigint AS voting_power,
  MIN(o.ledger_sequence)::bigint AS first_seen_ledger,
  MAX(o.ledger_sequence)::bigint AS last_activity_ledger
FROM owned_tokens o
LEFT JOIN latest_delegation d
 ON d.deployment_id = o.deployment_id
 AND d.delegator = o.owner
 LEFT JOIN latest_votes v
   ON v.deployment_id = o.deployment_id
  AND v.delegate = COALESCE(d.to_delegate, o.owner)
GROUP BY o.deployment_id, o.owner, d.to_delegate, v.voting_power;

CREATE OR REPLACE VIEW auction.bids AS
SELECT
  event_id,
  deployment_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'token_id', token_id)::bigint AS token_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'bidder', bidder, actor) AS bidder,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'amount', amount, '0')::numeric(78, 0) AS amount,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'payment_type', '') AS payment_type,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'extended', 'false')::boolean AS extended,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'new_end_time', '0')::bigint AS new_end_time,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('bid_placed', 'bid_placed_indexed');

CREATE OR REPLACE VIEW auction.bid_refunds AS
SELECT
  event_id,
  deployment_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'token_id', token_id)::bigint AS token_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'bidder', bidder, actor) AS bidder,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'amount', amount, '0')::numeric(78, 0) AS amount,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'payment_type', '') AS payment_type,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('bid_refunded', 'bid_refunded_indexed');

CREATE OR REPLACE VIEW auction.settlements AS
SELECT
  event_id,
  deployment_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'token_id', token_id)::bigint AS token_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'winner', to_address, owner) AS winner,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'amount', amount, '0')::numeric(78, 0) AS amount,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'payment_type', '') AS payment_type,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('auction_settled', 'auction_settled_indexed');

CREATE OR REPLACE VIEW auction.auctions AS
WITH created AS (
  SELECT
    event_id,
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'token_id', token_id)::bigint AS token_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'start_time', '0')::bigint AS start_time,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'end_time', '0')::bigint AS end_time,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'reserve_price', '0')::numeric(78, 0) AS reserve_price,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'payment_type', '') AS payment_type,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'payment_token', token_contract_id) AS payment_token,
    ledger_sequence AS created_ledger,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS created_timestamp,
    transaction_hash
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('auction_created', 'auction_created_indexed')
), latest_bid AS (
  SELECT DISTINCT ON (deployment_id, token_id)
    deployment_id,
    token_id,
    amount AS highest_bid_amount,
    bidder AS highest_bidder,
    payment_type,
    ledger_sequence AS updated_ledger,
    timestamp AS updated_timestamp
  FROM auction.bids
  ORDER BY deployment_id, token_id, ledger_sequence DESC, timestamp DESC, event_id DESC
), latest_settlement AS (
  SELECT DISTINCT ON (deployment_id, token_id)
    deployment_id,
    token_id,
    winner,
    ledger_sequence AS settled_ledger
  FROM auction.settlements
  ORDER BY deployment_id, token_id, ledger_sequence DESC, timestamp DESC, event_id DESC
)
SELECT
  c.deployment_id,
  c.token_id,
  c.start_time,
  c.end_time,
  c.reserve_price,
  COALESCE(b.highest_bid_amount, 0) AS highest_bid_amount,
  b.highest_bidder,
  COALESCE(b.payment_type, c.payment_type) AS payment_type,
  c.payment_token,
  s.winner,
  (s.winner IS NOT NULL) AS settled,
  false AS cancelled,
  NULL::text AS cancel_reason,
  c.created_ledger,
  b.updated_ledger,
  s.settled_ledger
FROM created c
LEFT JOIN latest_bid b
  ON b.deployment_id = c.deployment_id
 AND b.token_id = c.token_id
LEFT JOIN latest_settlement s
  ON s.deployment_id = c.deployment_id
 AND s.token_id = c.token_id;

CREATE OR REPLACE VIEW treasury.calls AS
SELECT
  event_id,
  deployment_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'proposal_id', proposal_id) AS proposal_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'governor', governor) AS governor,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'target', target) AS target,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'function', function) AS function,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'args', '[]') AS args,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'executor', executor, actor) AS executor,
  NULLIF(payload, '')::jsonb ->> 'action_index' AS action_index,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('execute', 'treasury_call_indexed', 'proposal_call_indexed');

CREATE OR REPLACE VIEW app.proposal_list AS
SELECT
  row_number() OVER (
    PARTITION BY deployment_id
    ORDER BY created_ledger, created_transaction_hash, created_event_id
  )::integer AS proposal_number,
  deployment_id,
  proposal_id,
  proposer,
  description,
  state,
  snapshot_ledger,
  created_timestamp,
  vote_start_timestamp,
  deadline_ledger,
  eta,
  COALESCE((SELECT SUM(CASE WHEN support = 1 THEN 1 ELSE 0 END) FROM governance.proposal_votes v WHERE v.deployment_id = p.deployment_id AND v.proposal_id = p.proposal_id), 0)::bigint AS for_votes,
  COALESCE((SELECT SUM(CASE WHEN support = 0 THEN 1 ELSE 0 END) FROM governance.proposal_votes v WHERE v.deployment_id = p.deployment_id AND v.proposal_id = p.proposal_id), 0)::bigint AS against_votes,
  COALESCE((SELECT SUM(CASE WHEN support = 2 THEN 1 ELSE 0 END) FROM governance.proposal_votes v WHERE v.deployment_id = p.deployment_id AND v.proposal_id = p.proposal_id), 0)::bigint AS abstain_votes,
  action_count,
  created_ledger,
  updated_ledger,
  updated_timestamp
FROM governance.proposals p;

CREATE OR REPLACE VIEW app.proposal_detail AS
WITH action_rows AS (
  SELECT
    deployment_id,
    proposal_id,
    jsonb_agg(
      jsonb_build_object(
        'action_index', action_index,
        'target', target,
        'function', function,
        'args', args,
        'executed', executed,
        'executor', executor,
        'executed_ledger', executed_ledger,
        'executed_timestamp', executed_timestamp
      ) ORDER BY action_index
    ) AS actions
  FROM governance.proposal_actions
  GROUP BY deployment_id, proposal_id
), vote_rows AS (
  SELECT
    deployment_id,
    proposal_id,
    SUM(CASE WHEN support = 1 THEN 1 ELSE 0 END)::bigint AS for_votes,
    SUM(CASE WHEN support = 0 THEN 1 ELSE 0 END)::bigint AS against_votes,
    SUM(CASE WHEN support = 2 THEN 1 ELSE 0 END)::bigint AS abstain_votes,
    jsonb_build_object(
      'for', COALESCE(SUM(CASE WHEN support = 1 THEN weight ELSE 0 END), 0),
      'against', COALESCE(SUM(CASE WHEN support = 0 THEN weight ELSE 0 END), 0),
      'abstain', COALESCE(SUM(CASE WHEN support = 2 THEN weight ELSE 0 END), 0)
    ) AS vote_summary,
    jsonb_agg(
      jsonb_build_object(
        'vote_event_id', vote_event_id,
        'voter', voter,
        'support', support,
        'weight', weight,
        'reason', reason,
        'ledger_sequence', ledger_sequence,
        'timestamp', timestamp,
        'transaction_hash', transaction_hash
      ) ORDER BY ledger_sequence, timestamp, vote_event_id
    ) AS votes
  FROM governance.proposal_votes
  GROUP BY deployment_id, proposal_id
)
SELECT
  p.deployment_id,
  pl.proposal_number,
  p.proposal_id,
  p.proposer,
  p.description,
  p.state,
  p.snapshot_ledger,
  p.vote_start_timestamp,
  p.deadline_ledger,
  p.eta,
  pl.created_timestamp,
  pl.created_ledger,
  pl.updated_ledger,
  pl.updated_timestamp,
  pl.action_count,
  COALESCE(a.actions, '[]'::jsonb) AS actions,
  COALESCE(v.vote_summary, '{"for": 0, "against": 0, "abstain": 0}'::jsonb) AS vote_summary,
  COALESCE(v.votes, '[]'::jsonb) AS votes
FROM governance.proposals p
JOIN app.proposal_list pl
  ON pl.deployment_id = p.deployment_id
 AND pl.proposal_id = p.proposal_id
LEFT JOIN action_rows a
  ON a.deployment_id = p.deployment_id
 AND a.proposal_id = p.proposal_id
LEFT JOIN vote_rows v
  ON v.deployment_id = p.deployment_id
 AND v.proposal_id = p.proposal_id;

CREATE OR REPLACE VIEW app.member_list AS
SELECT
  deployment_id,
  address,
  owned_token_count,
  delegated_to,
  voting_power,
  last_activity_ledger
FROM token.members;

COMMIT;
