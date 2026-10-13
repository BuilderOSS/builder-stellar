-- =============================================================================
-- AUCTION VIEWS
--
-- Auction events (contracts/auction/src/events.rs); token_id is the NFT id (u128 topic):
--   auction_created   topic token_id;          data { start_time, end_time, reserve_price, payment_token }
--   bid_placed        topics token_id, bidder; data { amount, extended, new_end_time, comment }
--   auction_settled   topic token_id;          data { winner (null when unsold), amount }
--   auction_cancelled topic token_id;          data { reason, cancelled_by }
-- Not projected (the app reads refunds and the configuration from chain):
--   bid_refunded / refund_deferred / refund_withdrawn, auction_initialized,
--   duration_updated / reserve_price_updated / min_bid_increment_updated /
--   time_buffer_updated / payment_token_updated, paused / unpaused (manager.daos),
--   auction_launched (manager.module_launches).
--
-- Bids strictly increase and new_end_time never decreases, so the latest bid is
-- both the highest bid and the current end of the auction.
-- =============================================================================

CREATE VIEW auction.bids AS
SELECT
  e.event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  (e.t ->> 'token_id')::bigint AS token_id,
  e.t ->> 'bidder' AS bidder,
  (e.a ->> 'amount')::numeric(78, 0) AS amount,
  (e.a ->> 'extended')::boolean AS extended,
  (e.a ->> 'new_end_time')::bigint AS new_end_seconds,
  NULLIF(e.a ->> 'comment', '') AS comment,
  e.pos,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'auction'
  AND e.event_name = 'bid_placed';

-- The outcome and bid state of one auction, keyed on the indexed topic column
-- (the token id as emitted) and bounded by the auction's own position: the
-- first settlement or cancellation after it, and the latest bid before that.
-- A SQL function runs with its caller's privileges, and app_server has no
-- access to chain.*: it reads manager.module_events (a view, read with its
-- owner's privileges), which also keeps the contract's registration window.
CREATE FUNCTION auction.auction_state(dep text, dao text, contract text, token text, created bigint[])
RETURNS TABLE (
  closing_event text, winner text, settled_amount numeric(78, 0), closed_at timestamptz,
  closed_transaction_hash text, highest_bidder text, highest_bid numeric(78, 0),
  new_end_seconds bigint, extension_count integer
)
LANGUAGE sql STABLE
AS $$
  SELECT
    x.event_name, x.a ->> 'winner', (x.a ->> 'amount')::numeric(78, 0), x.closed_at, x.transaction_hash,
    b.bidder, b.amount, b.new_end_seconds, b.extension_count
  FROM (SELECT 1) one
  LEFT JOIN LATERAL (
    SELECT x.event_name, x.a, x.pos, x.closed_at, x.transaction_hash
    FROM manager.module_events x
    WHERE x.deployment_id = dep AND x.dao_id = dao AND x.contract_id = contract
      AND x.event_name IN ('auction_settled', 'auction_cancelled')
      AND x.topic_0 = token AND x.pos > created
    ORDER BY x.pos, x.event_id
    LIMIT 1
  ) x ON true
  LEFT JOIN LATERAL (
    SELECT
      (array_agg(y.t ->> 'bidder' ORDER BY y.pos DESC, y.event_id DESC))[1] AS bidder,
      (array_agg((y.a ->> 'amount')::numeric(78, 0) ORDER BY y.pos DESC, y.event_id DESC))[1] AS amount,
      (array_agg((y.a ->> 'new_end_time')::bigint ORDER BY y.pos DESC, y.event_id DESC))[1] AS new_end_seconds,
      (count(*) FILTER (WHERE (y.a ->> 'extended')::boolean))::integer AS extension_count
    FROM manager.module_events y
    WHERE y.deployment_id = dep AND y.dao_id = dao AND y.contract_id = contract
      AND y.event_name = 'bid_placed' AND y.topic_0 = token
      AND y.pos > created AND (x.pos IS NULL OR y.pos < x.pos)
  ) b ON true
$$;

-- One row per auction with its outcome and its current bid state.
CREATE VIEW auction.auctions AS
SELECT
  c.event_id,
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  (c.t ->> 'token_id')::bigint AS token_id,
  (c.a ->> 'start_time')::bigint AS start_seconds,
  (c.a ->> 'end_time')::bigint AS end_seconds,
  (c.a ->> 'end_time')::bigint - (c.a ->> 'start_time')::bigint AS duration_seconds,
  (c.a ->> 'reserve_price')::numeric(78, 0) AS reserve_price,
  c.a ->> 'payment_token' AS payment_token,
  s.highest_bidder,
  s.highest_bid,
  COALESCE(s.new_end_seconds, (c.a ->> 'end_time')::bigint) AS current_end_seconds,
  COALESCE(s.extension_count, 0) AS extension_count,
  COALESCE(s.closing_event = 'auction_settled', false) AS settled,
  COALESCE(s.closing_event = 'auction_cancelled', false) AS cancelled,
  s.winner,
  s.settled_amount,
  s.closed_at,
  s.closed_transaction_hash,
  c.ledger_sequence AS created_ledger,
  c.transaction_hash
FROM manager.module_events c
CROSS JOIN LATERAL auction.auction_state(c.deployment_id, c.dao_id, c.contract_id, c.topic_0, c.pos) s
WHERE c.contract_role = 'auction'
  AND c.event_name = 'auction_created';

-- The newest auction of every auction contract (the one that can be live),
-- found before the state is computed so a directory page costs one lookup
-- per community, not one per auction ever created.
CREATE VIEW auction.current_auctions AS
SELECT
  c.event_id,
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  (c.t ->> 'token_id')::bigint AS token_id,
  (c.a ->> 'start_time')::bigint AS start_seconds,
  (c.a ->> 'end_time')::bigint AS end_seconds,
  (c.a ->> 'end_time')::bigint - (c.a ->> 'start_time')::bigint AS duration_seconds,
  (c.a ->> 'reserve_price')::numeric(78, 0) AS reserve_price,
  c.a ->> 'payment_token' AS payment_token,
  s.highest_bidder,
  s.highest_bid,
  COALESCE(s.new_end_seconds, (c.a ->> 'end_time')::bigint) AS current_end_seconds,
  COALESCE(s.extension_count, 0) AS extension_count,
  COALESCE(s.closing_event = 'auction_settled', false) AS settled,
  COALESCE(s.closing_event = 'auction_cancelled', false) AS cancelled,
  s.winner,
  s.settled_amount,
  s.closed_at,
  s.closed_transaction_hash,
  c.ledger_sequence AS created_ledger,
  c.transaction_hash
FROM (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id) e.*
  FROM manager.module_events e
  WHERE e.contract_role = 'auction' AND e.event_name = 'auction_created'
  ORDER BY e.deployment_id, e.contract_id, e.pos DESC, e.event_id DESC
) c
CROSS JOIN LATERAL auction.auction_state(c.deployment_id, c.dao_id, c.contract_id, c.topic_0, c.pos) s;
