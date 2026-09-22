-- =============================================================================
-- AUCTION VIEWS MIGRATION
--
-- Creates views for:
-- - Auction bids
-- - Auction bid refunds
-- - Auction settlements
-- - Complete auction information
-- =============================================================================


-- Auction: Bids
CREATE OR REPLACE VIEW auction.bids AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'bidder' AS bidder,
  (e.args::jsonb ->> 'amount')::numeric(78,0) AS amount,
  (e.args::jsonb ->> 'extended')::boolean AS extended,
  (e.args::jsonb ->> 'new_end_time')::bigint AS new_end_seconds,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'auction'
  AND e.event_name = 'bid_placed';

-- Auction: Bid refunds
CREATE OR REPLACE VIEW auction.bid_refunds AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'bidder' AS bidder,
  (e.args::jsonb ->> 'amount')::numeric(78,0) AS amount,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'auction'
  AND e.event_name = 'bid_refunded';

-- Auction: Settlements
CREATE OR REPLACE VIEW auction.settlements AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  e.args::jsonb ->> 'winner' AS winner,
  (e.args::jsonb ->> 'amount')::numeric(78,0) AS amount,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'auction'
  AND e.event_name = 'auction_settled';

-- Auction: Complete auction information
CREATE OR REPLACE VIEW auction.auctions AS
WITH config AS (
  SELECT DISTINCT ON (deployment_id, contract_id)
    deployment_id,
    contract_id,
    (e.args::jsonb ->> 'duration')::bigint AS duration_seconds,
    (e.args::jsonb ->> 'time_buffer')::bigint AS time_buffer_seconds
  FROM chain.decoded_events e
  WHERE e.contract_role = 'auction'
    AND e.event_name = 'auction_initialized'
  ORDER BY deployment_id, contract_id, e.ledger_sequence DESC, e.event_id DESC
)
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  (e.args::jsonb ->> 'start_time')::bigint AS start_seconds,
  (e.args::jsonb ->> 'end_time')::bigint AS end_seconds,
  c.duration_seconds,
  c.time_buffer_seconds,
  (e.args::jsonb ->> 'reserve_price')::numeric(78,0) AS reserve_price,
  e.args::jsonb ->> 'payment_token' AS payment_token,
  EXISTS (
    SELECT 1 FROM auction.settlements s
    WHERE s.deployment_id = e.deployment_id
      AND s.dao_id = i.dao_id
      AND s.contract_id = e.contract_id
      AND s.token_id = (e.topics::jsonb ->> 'token_id')::bigint
      AND s.event_ledger >= e.ledger_sequence
  ) AS settled,
  EXISTS (
    SELECT 1 FROM chain.decoded_events x
    WHERE x.deployment_id = e.deployment_id
      AND x.contract_role = 'auction'
      AND x.contract_id = e.contract_id
      AND x.topics ->> 'token_id' = e.topics::jsonb ->> 'token_id'
      AND x.event_name = 'auction_cancelled'
      AND x.ledger_sequence >= e.ledger_sequence
  ) AS cancelled,
  e.ledger_sequence AS created_ledger,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
LEFT JOIN config c ON c.deployment_id = e.deployment_id AND c.contract_id = e.contract_id
WHERE e.contract_role = 'auction'
  AND e.event_name = 'auction_created';

