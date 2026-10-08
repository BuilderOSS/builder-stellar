-- =============================================================================
-- AUCTION VIEWS
--
-- Source events (auction contract); token_id is the NFT id (u128 topic):
--   auction_created   topic token_id;         data { start_time, end_time, reserve_price, payment_token }
--   bid_placed        topics token_id, bidder; data { amount, extended, new_end_time }
--   bid_refunded      topics token_id, bidder; data { amount }        (refund pushed to the bidder)
--   refund_deferred   topics token_id, bidder; data { amount }        (push failed; amount = this increment, credited)
--   refund_withdrawn  topic bidder;            data { amount }        (bidder pulled their credit, no token_id)
--   auction_settled   topic token_id;         data { winner (nullable), amount }
--   auction_cancelled topic token_id;         data { reason, cancelled_by }
--                     cancel_auction (owner, paused) also sends the unsold NFT to the treasury; the
--                     token `transfer` event shows up in token.transfers / token.inventory.
--   launched          topic treasury;         data { started }  (see manager.module_launches)
--   The auction TreasuryUpdated event no longer exists (the treasury is fixed at launch).
--   auction_initialized / duration_updated / time_buffer_updated: configuration
-- =============================================================================

CREATE VIEW auction.bids AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'bidder' AS bidder,
  (e.args::jsonb ->> 'amount')::numeric(78, 0) AS amount,
  (e.args::jsonb ->> 'extended')::boolean AS extended,
  (e.args::jsonb ->> 'new_end_time')::bigint AS new_end_seconds,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'auction'
  AND e.event_name = 'bid_placed';

-- Refunds to outbid bidders. refund_status 'refunded' = BidRefunded (pushed),
-- 'deferred' = RefundDeferred (push failed; the bidder must withdraw it, see
-- auction.pending_refunds). Deferred amounts are increments, not running totals.
CREATE VIEW auction.bid_refunds AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'bidder' AS bidder,
  (e.args::jsonb ->> 'amount')::numeric(78, 0) AS amount,
  CASE e.event_name WHEN 'refund_deferred' THEN 'deferred' ELSE 'refunded' END AS refund_status,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'auction'
  AND e.event_name IN ('bid_refunded', 'refund_deferred');

-- Deferred refunds the bidder pulled via withdraw_refund (all of a bidder's credit at once).
CREATE VIEW auction.refund_withdrawals AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'bidder' AS bidder,
  (e.args::jsonb ->> 'amount')::numeric(78, 0) AS amount,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'auction'
  AND e.event_name = 'refund_withdrawn';

-- Outstanding refund per bidder = sum(RefundDeferred) - sum(RefundWithdrawn),
-- one row per (auction contract, bidder) with a positive balance. This mirrors
-- the contract's pending_refund(bidder); the live value is authoritative.
CREATE VIEW auction.pending_refunds AS
WITH deferred AS (
  SELECT deployment_id, dao_id, contract_id, bidder,
    sum(amount) AS deferred_amount,
    max(event_ledger) AS last_deferred_ledger
  FROM auction.bid_refunds
  WHERE refund_status = 'deferred'
  GROUP BY deployment_id, dao_id, contract_id, bidder
), withdrawn AS (
  SELECT deployment_id, dao_id, contract_id, bidder, sum(amount) AS withdrawn_amount
  FROM auction.refund_withdrawals
  GROUP BY deployment_id, dao_id, contract_id, bidder
)
SELECT
  d.deployment_id,
  d.dao_id,
  d.contract_id,
  d.bidder,
  d.deferred_amount::numeric(78, 0) AS deferred_amount,
  COALESCE(w.withdrawn_amount, 0)::numeric(78, 0) AS withdrawn_amount,
  (d.deferred_amount - COALESCE(w.withdrawn_amount, 0))::numeric(78, 0) AS pending_amount,
  d.last_deferred_ledger
FROM deferred d
LEFT JOIN withdrawn w
  ON w.deployment_id = d.deployment_id AND w.dao_id = d.dao_id
 AND w.contract_id = d.contract_id AND w.bidder = d.bidder
WHERE d.deferred_amount - COALESCE(w.withdrawn_amount, 0) > 0;

-- winner is NULL when the auction ended without a bid.
CREATE VIEW auction.settlements AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  e.args::jsonb ->> 'winner' AS winner,
  (e.args::jsonb ->> 'amount')::numeric(78, 0) AS amount,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'auction'
  AND e.event_name = 'auction_settled';

CREATE VIEW auction.cancellations AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  (e.args::jsonb ->> 'reason')::integer AS reason,
  e.args::jsonb ->> 'cancelled_by' AS cancelled_by,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'auction'
  AND e.event_name = 'auction_cancelled';

-- One row per auction. duration and time buffer are the values in force when
-- the auction was created (initial config, then later updates).
CREATE VIEW auction.auctions AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  (e.args::jsonb ->> 'start_time')::bigint AS start_seconds,
  (e.args::jsonb ->> 'end_time')::bigint AS end_seconds,
  cfg.duration::bigint AS duration_seconds,
  cfg.time_buffer::bigint AS time_buffer_seconds,
  (e.args::jsonb ->> 'reserve_price')::numeric(78, 0) AS reserve_price,
  e.args::jsonb ->> 'payment_token' AS payment_token,
  EXISTS (
    SELECT 1 FROM auction.settlements s
    WHERE s.deployment_id = e.deployment_id
      AND s.contract_id = e.contract_id
      AND s.token_id = (e.topics::jsonb ->> 'token_id')::bigint
      AND chain.event_position(s.event_ledger, s.transaction_index, s.operation_index, s.event_index)
        >= chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)
  ) AS settled,
  EXISTS (
    SELECT 1 FROM auction.cancellations c
    WHERE c.deployment_id = e.deployment_id
      AND c.contract_id = e.contract_id
      AND c.token_id = (e.topics::jsonb ->> 'token_id')::bigint
      AND chain.event_position(c.event_ledger, c.transaction_index, c.operation_index, c.event_index)
        >= chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)
  ) AS cancelled,
  e.ledger_sequence AS created_ledger,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
LEFT JOIN LATERAL (
  SELECT
    (SELECT x.args::jsonb ->> 'duration'
     FROM chain.decoded_events x
     WHERE x.deployment_id = e.deployment_id AND x.contract_id = e.contract_id
       AND x.contract_role = 'auction' AND x.event_name IN ('auction_initialized', 'duration_updated')
       AND chain.event_position(x.ledger_sequence, x.transaction_index, x.operation_index, x.event_index)
         <= chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)
     ORDER BY x.ledger_sequence DESC, x.transaction_index DESC NULLS LAST,
       x.operation_index DESC NULLS LAST, x.event_index DESC NULLS LAST, x.event_id DESC
     LIMIT 1) AS duration,
    (SELECT x.args::jsonb ->> 'time_buffer'
     FROM chain.decoded_events x
     WHERE x.deployment_id = e.deployment_id AND x.contract_id = e.contract_id
       AND x.contract_role = 'auction' AND x.event_name IN ('auction_initialized', 'time_buffer_updated')
       AND chain.event_position(x.ledger_sequence, x.transaction_index, x.operation_index, x.event_index)
         <= chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)
     ORDER BY x.ledger_sequence DESC, x.transaction_index DESC NULLS LAST,
       x.operation_index DESC NULLS LAST, x.event_index DESC NULLS LAST, x.event_id DESC
     LIMIT 1) AS time_buffer
) cfg ON true
WHERE e.contract_role = 'auction'
  AND e.event_name = 'auction_created';
