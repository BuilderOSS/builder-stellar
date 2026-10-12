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
  b.bidder AS highest_bidder,
  b.amount AS highest_bid,
  COALESCE(b.new_end_seconds, (c.a ->> 'end_time')::bigint) AS current_end_seconds,
  COALESCE(b.extension_count, 0)::integer AS extension_count,
  x.event_name = 'auction_settled' AS settled,
  x.event_name = 'auction_cancelled' AS cancelled,
  x.a ->> 'winner' AS winner,
  (x.a ->> 'amount')::numeric(78, 0) AS settled_amount,
  x.closed_at AS closed_at,
  x.transaction_hash AS closed_transaction_hash,
  c.ledger_sequence AS created_ledger,
  c.transaction_hash
FROM manager.module_events c
-- The first settlement or cancellation after the auction was created.
LEFT JOIN LATERAL (
  SELECT x.event_name, x.a, x.pos, x.closed_at, x.transaction_hash
  FROM chain.events x
  WHERE x.deployment_id = c.deployment_id AND x.contract_id = c.contract_id
    AND x.event_name IN ('auction_settled', 'auction_cancelled')
    AND x.topic_0 = c.topic_0 AND x.pos > c.pos
  ORDER BY x.pos, x.event_id
  LIMIT 1
) x ON true
-- The latest bid (highest, and carrying the current end), and how many bids extended the end.
LEFT JOIN LATERAL (
  SELECT b.bidder, b.amount, b.new_end_seconds,
    (SELECT count(*) FROM auction.bids y
     WHERE y.deployment_id = c.deployment_id AND y.contract_id = c.contract_id
       AND y.token_id = b.token_id AND y.extended AND y.pos > c.pos) AS extension_count
  FROM auction.bids b
  WHERE b.deployment_id = c.deployment_id AND b.contract_id = c.contract_id
    AND b.token_id = (c.t ->> 'token_id')::bigint AND b.pos > c.pos
    AND (x.pos IS NULL OR b.pos < x.pos)
  ORDER BY b.pos DESC, b.event_id DESC
  LIMIT 1
) b ON true
WHERE c.contract_role = 'auction'
  AND c.event_name = 'auction_created';
