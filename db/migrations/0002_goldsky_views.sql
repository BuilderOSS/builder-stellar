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

-- Manager Views

CREATE OR REPLACE VIEW manager.daos AS
WITH created AS (
  SELECT
    event_id,
    deployment_id,
    contract_id AS manager_contract,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'token_address', token_address) AS token_address,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'creator', creator, actor) AS creator,
    NULLIF(payload, '')::jsonb -> 'modules' AS modules,
    NULLIF(payload, '')::jsonb -> 'founders' AS founders,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'created_ledger', ledger_sequence::text)::bigint AS created_ledger,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS created_timestamp,
    transaction_hash
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('dao_created', 'daocreated')
), registered AS (
  SELECT DISTINCT ON (deployment_id, token_address)
    event_id,
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'token_address', token_address) AS token_address,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'creator', creator, actor) AS creator,
    NULLIF(payload, '')::jsonb -> 'modules' AS modules,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS registered_timestamp,
    transaction_hash
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('dao_registered', 'daoregistered')
  ORDER BY deployment_id, token_address, ledger_sequence DESC, event_id DESC
)
SELECT
  c.deployment_id,
  c.token_address,
  c.creator,
  c.manager_contract,
  COALESCE(r.modules, c.modules) ->> 'auction' AS auction_contract,
  COALESCE(r.modules, c.modules) ->> 'metadata' AS metadata_contract,
  COALESCE(r.modules, c.modules) ->> 'governor' AS governor_contract,
  COALESCE(r.modules, c.modules) ->> 'treasury' AS treasury_contract,
  c.founders,
  c.created_ledger,
  c.created_timestamp,
  r.registered_timestamp,
  c.transaction_hash AS created_transaction_hash,
  r.transaction_hash AS registered_transaction_hash
FROM created c
LEFT JOIN registered r
  ON r.deployment_id = c.deployment_id
 AND r.token_address = c.token_address;

CREATE OR REPLACE VIEW manager.dao_modules AS
SELECT
  deployment_id,
  token_address,
  'auction' AS module_role,
  auction_contract AS module_contract
FROM manager.daos
WHERE auction_contract IS NOT NULL
UNION ALL
SELECT
  deployment_id,
  token_address,
  'metadata' AS module_role,
  metadata_contract AS module_contract
FROM manager.daos
WHERE metadata_contract IS NOT NULL
UNION ALL
SELECT
  deployment_id,
  token_address,
  'governor' AS module_role,
  governor_contract AS module_contract
FROM manager.daos
WHERE governor_contract IS NOT NULL
UNION ALL
SELECT
  deployment_id,
  token_address,
  'treasury' AS module_role,
  treasury_contract AS module_contract
FROM manager.daos
WHERE treasury_contract IS NOT NULL;

CREATE OR REPLACE VIEW manager.founder_allocations AS
WITH created AS (
  SELECT
    deployment_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'token_address', token_address) AS token_address,
    NULLIF(payload, '')::jsonb -> 'founders' AS founders,
    ledger_sequence,
    transaction_hash
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('dao_created', 'daocreated')
), founders_expanded AS (
  SELECT
    c.deployment_id,
    c.token_address,
    f.ordinality - 1 AS founder_index,
    f.value ->> 'wallet' AS wallet,
    (f.value ->> 'allocation')::integer AS allocation,
    (f.value ->> 'end_date')::bigint AS end_date,
    c.ledger_sequence,
    c.transaction_hash
  FROM created c
  JOIN LATERAL jsonb_array_elements(COALESCE(c.founders, '[]'::jsonb)) WITH ORDINALITY AS f(value, ordinality) ON true
  WHERE c.founders IS NOT NULL AND jsonb_array_length(c.founders) > 0
)
SELECT
  deployment_id,
  token_address,
  founder_index,
  wallet,
  allocation,
  end_date,
  ledger_sequence,
  transaction_hash
FROM founders_expanded;

CREATE OR REPLACE VIEW manager.implementations AS
WITH registered AS (
  SELECT
    event_id,
    deployment_id,
    contract_id AS manager_contract,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'name', implementation_name) AS name,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'version', implementation_version::text)::integer AS version,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'wasm_hash', wasm_hash) AS wasm_hash,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'published_at', ledger_sequence::text)::bigint AS published_at,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
    transaction_hash,
    false AS revoked,
    NULL::bigint AS revoked_at
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('implementation_registered', 'implementationregistered')

  UNION ALL

  SELECT
    event_id,
    deployment_id,
    contract_id AS manager_contract,
    NULL AS name,
    NULL AS version,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'wasm_hash', wasm_hash) AS wasm_hash,
    NULL AS published_at,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
    transaction_hash,
    true AS revoked,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'revoked_at', ledger_sequence::text)::bigint AS revoked_at
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('implementation_revoked', 'implementationrevoked')
), latest_status AS (
  SELECT DISTINCT ON (deployment_id, wasm_hash)
    deployment_id,
    wasm_hash,
    revoked,
    revoked_at,
    ledger_sequence
  FROM registered
  ORDER BY deployment_id, wasm_hash, ledger_sequence DESC, event_id DESC
)
SELECT
  r.deployment_id,
  r.manager_contract,
  r.name,
  r.version,
  r.wasm_hash,
  r.published_at,
  COALESCE(s.revoked, false) AS revoked,
  s.revoked_at,
  r.ledger_sequence AS registered_ledger,
  r.timestamp AS registered_timestamp,
  r.transaction_hash
FROM registered r
LEFT JOIN latest_status s
  ON s.deployment_id = r.deployment_id
 AND s.wasm_hash = r.wasm_hash
WHERE r.name IS NOT NULL
  AND r.version IS NOT NULL;

CREATE OR REPLACE VIEW manager.current_implementations AS
WITH latest AS (
  SELECT DISTINCT ON (deployment_id)
    event_id,
    deployment_id,
    NULLIF(payload, '')::jsonb ->> 'token' AS token_impl,
    NULLIF(payload, '')::jsonb ->> 'metadata' AS metadata_impl,
    NULLIF(payload, '')::jsonb ->> 'auction' AS auction_impl,
    NULLIF(payload, '')::jsonb ->> 'governor' AS governor_impl,
    NULLIF(payload, '')::jsonb ->> 'treasury' AS treasury_impl,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS updated_timestamp,
    transaction_hash
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('current_implementations_updated', 'currentimplementationsupdated')
  ORDER BY deployment_id, ledger_sequence DESC, event_id DESC
)
SELECT
  deployment_id,
  token_impl,
  metadata_impl,
  auction_impl,
  governor_impl,
  treasury_impl,
  ledger_sequence,
  updated_timestamp,
  transaction_hash
FROM latest;

-- Metadata Views

CREATE OR REPLACE VIEW metadata.properties AS
SELECT
  event_id,
  deployment_id,
  contract_id AS metadata_contract,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'property_id', property_id::text)::integer AS property_id,
  COALESCE(NULLIF(payload, '')::jsonb ->> 'name', property_name) AS name,
  ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
  transaction_hash
FROM chain.decoded_events
WHERE LOWER(event_name) IN ('property_added', 'propertyadded')
  AND (property_id IS NOT NULL OR (NULLIF(payload, '')::jsonb ->> 'property_id') IS NOT NULL)
ORDER BY deployment_id, property_id;

CREATE OR REPLACE VIEW metadata.token_seeds AS
WITH seeds AS (
  SELECT
    event_id,
    deployment_id,
    contract_id AS metadata_contract,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'token_id', token_id)::bigint AS token_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'num_properties', num_properties::text)::integer AS num_properties,
    CASE
      WHEN NULLIF(payload, '')::jsonb -> 'selections' IS NOT NULL
        THEN NULLIF(payload, '')::jsonb -> 'selections'
      WHEN selections IS NOT NULL
        THEN selections::jsonb
      ELSE NULL
    END AS selections,
    ledger_sequence,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS timestamp,
    transaction_hash
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('seed_generated', 'seedgenerated')
    AND (token_id IS NOT NULL OR (NULLIF(payload, '')::jsonb ->> 'token_id') IS NOT NULL)
)
SELECT
  event_id,
  deployment_id,
  metadata_contract,
  token_id,
  num_properties,
  selections,
  ledger_sequence,
  timestamp,
  transaction_hash
FROM seeds;

CREATE OR REPLACE VIEW metadata.configuration AS
WITH init AS (
  SELECT DISTINCT ON (deployment_id, contract_id)
    deployment_id,
    contract_id AS metadata_contract,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'token', token_contract) AS token_contract,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'renderer_base', renderer_base) AS renderer_base,
    ledger_sequence AS init_ledger,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000.0) AS init_timestamp,
    transaction_hash AS init_transaction_hash
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('metadata_initialized', 'metadatainitialized')
  ORDER BY deployment_id, contract_id, ledger_sequence, event_id
), latest_uri AS (
  SELECT DISTINCT ON (deployment_id, contract_id)
    deployment_id,
    contract_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'new_uri', new_uri, project_uri) AS project_uri
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('project_uri_updated', 'projecturiupdated', 'projecturiupdated')
    OR project_uri IS NOT NULL
  ORDER BY deployment_id, contract_id, ledger_sequence DESC, event_id DESC
), latest_desc AS (
  SELECT DISTINCT ON (deployment_id, contract_id)
    deployment_id,
    contract_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'new_description', new_description) AS description
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('description_updated', 'descriptionupdated')
  ORDER BY deployment_id, contract_id, ledger_sequence DESC, event_id DESC
), latest_base AS (
  SELECT DISTINCT ON (deployment_id, contract_id)
    deployment_id,
    contract_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'new_base', new_base, renderer_base) AS renderer_base
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('renderer_base_updated', 'rendererbaseupdated', 'metadata_initialized', 'metadatainitialized')
  ORDER BY deployment_id, contract_id, ledger_sequence DESC, event_id DESC
), latest_image AS (
  SELECT DISTINCT ON (deployment_id, contract_id)
    deployment_id,
    contract_id,
    COALESCE(NULLIF(payload, '')::jsonb ->> 'new_image', new_image, contract_image) AS contract_image
  FROM chain.decoded_events
  WHERE LOWER(event_name) IN ('contract_image_updated', 'contractimageupdated')
  ORDER BY deployment_id, contract_id, ledger_sequence DESC, event_id DESC
)
SELECT
  i.deployment_id,
  i.metadata_contract,
  i.token_contract,
  COALESCE(b.renderer_base, i.renderer_base) AS renderer_base,
  u.project_uri,
  d.description,
  img.contract_image,
  i.init_ledger,
  i.init_timestamp,
  i.init_transaction_hash
FROM init i
LEFT JOIN latest_uri u
  ON u.deployment_id = i.deployment_id
 AND u.contract_id = i.metadata_contract
LEFT JOIN latest_desc d
  ON d.deployment_id = i.deployment_id
 AND d.contract_id = i.metadata_contract
LEFT JOIN latest_base b
  ON b.deployment_id = i.deployment_id
 AND b.contract_id = i.metadata_contract
LEFT JOIN latest_image img
  ON img.deployment_id = i.deployment_id
 AND img.contract_id = i.metadata_contract;

COMMIT;
