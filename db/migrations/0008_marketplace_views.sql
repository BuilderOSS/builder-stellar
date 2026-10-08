-- =============================================================================
-- MARKETPLACE VIEWS
--
-- Source events (marketplace contract); token_id is the NFT id (u32 topic):
--   primary_listing_created / secondary_listing_created
--       topic token_id; data { seller, price, expires_at, fee_bps }
--   listing_purchased  topics token_id, buyer; data { seller, price, fee, payment_asset }
--   listing_cancelled / listing_expired  topic token_id; data { seller }
-- A token has at most one open listing, so a listing is closed by the first
-- purchase / cancel / expiry event for its token after it was created.
-- =============================================================================

CREATE VIEW marketplace.listings AS
WITH created AS (
  SELECT
    e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
    CASE e.event_name WHEN 'primary_listing_created' THEN 'primary' ELSE 'secondary' END AS listing_type,
    e.args::jsonb ->> 'seller' AS seller,
    (e.args::jsonb ->> 'price')::numeric(78, 0) AS price,
    (e.args::jsonb ->> 'expires_at')::bigint AS expires_at,
    (e.args::jsonb ->> 'fee_bps')::integer AS fee_bps,
    e.ledger_sequence AS created_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, '')::timestamptz AS created_at,
    e.transaction_hash AS created_transaction_hash
  FROM chain.decoded_events e
  JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'marketplace'
    AND e.event_name IN ('primary_listing_created', 'secondary_listing_created')
)
SELECT
  c.event_id,
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  c.token_id,
  c.listing_type,
  c.seller,
  c.price,
  c.expires_at,
  c.fee_bps,
  COALESCE(
    CASE x.event_name
      WHEN 'listing_purchased' THEN 'purchased'
      WHEN 'listing_cancelled' THEN 'cancelled'
      WHEN 'listing_expired' THEN 'expired'
    END, 'open') AS status,
  c.created_ledger,
  c.created_at,
  c.created_transaction_hash,
  x.ledger_sequence AS closed_ledger,
  NULLIF(x.ledger_closed_at, '')::timestamptz AS closed_at,
  NULLIF(x.topic_1, '') AS buyer
FROM created c
LEFT JOIN LATERAL (
  SELECT x.event_name, x.ledger_sequence, x.ledger_closed_at, x.topic_1
  FROM chain.decoded_events x
  WHERE x.deployment_id = c.deployment_id
    AND x.contract_id = c.contract_id
    AND x.contract_role = 'marketplace'
    AND x.event_name IN ('listing_purchased', 'listing_cancelled', 'listing_expired')
    AND (x.topics::jsonb ->> 'token_id')::bigint = c.token_id
    AND chain.event_position(x.ledger_sequence, x.transaction_index, x.operation_index, x.event_index)
      > chain.event_position(c.created_ledger, c.transaction_index, c.operation_index, c.event_index)
  ORDER BY x.ledger_sequence, x.transaction_index NULLS LAST, x.operation_index NULLS LAST,
    x.event_index NULLS LAST, x.event_id
  LIMIT 1
) x ON true;

CREATE VIEW marketplace.purchases AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'buyer' AS buyer,
  e.args::jsonb ->> 'seller' AS seller,
  (e.args::jsonb ->> 'price')::numeric(78, 0) AS price,
  (e.args::jsonb ->> 'fee')::numeric(78, 0) AS fee,
  e.args::jsonb ->> 'payment_asset' AS payment_asset,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'marketplace'
  AND e.event_name = 'listing_purchased';
