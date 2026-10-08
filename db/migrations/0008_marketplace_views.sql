-- =============================================================================
-- MARKETPLACE VIEWS
--
-- Primary sales are lazy and keyed by listing_id (u64); the token is only
-- minted when the listing is bought. Secondary listings are keyed by token_id
-- (u32). Source events (marketplace contract):
--
--   primary_listing_created    topic listing_id;  data { price, expires_at, payment_asset }
--   primary_listing_purchased  topics listing_id, buyer; data { token_id, price, payment_asset }
--   primary_listing_cancelled  topic listing_id
--   primary_listing_expired    topic listing_id
--
--   secondary_listing_created  topic token_id;    data { seller, price, expires_at, fee_bps, payment_asset }
--   listing_purchased          topics token_id, buyer; data { seller, price, fee, payment_asset }  (secondary only)
--   listing_cancelled / listing_expired  topic token_id; data { seller }                          (secondary only)
--
--   launched                   topic treasury; data { opened } (see manager.module_launches)
--
-- A primary listing is closed by the first purchase/cancel/expiry event with
-- its listing_id. A token has at most one open secondary listing, so a
-- secondary listing is closed by the first purchase/cancel/expiry event for its
-- token after it was created. There is no listing `kind`: the two views
-- replace the old single listings view.
-- =============================================================================

CREATE VIEW marketplace.primary_listings AS
WITH created AS (
  SELECT
    e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.topics::jsonb ->> 'listing_id')::bigint AS listing_id,
    (e.args::jsonb ->> 'price')::numeric(78, 0) AS price,
    (e.args::jsonb ->> 'expires_at')::bigint AS expires_at,
    e.args::jsonb ->> 'payment_asset' AS payment_asset,
    e.ledger_sequence AS created_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, '')::timestamptz AS created_at,
    e.transaction_hash AS created_transaction_hash
  FROM chain.decoded_events e
  JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'marketplace'
    AND e.event_name = 'primary_listing_created'
)
SELECT
  c.event_id,
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  c.listing_id,
  c.price,
  c.expires_at,
  c.payment_asset,
  COALESCE(
    CASE x.event_name
      WHEN 'primary_listing_purchased' THEN 'purchased'
      WHEN 'primary_listing_cancelled' THEN 'cancelled'
      WHEN 'primary_listing_expired' THEN 'expired'
    END, 'open') AS status,
  (x.args::jsonb ->> 'token_id')::bigint AS token_id,
  x.topics::jsonb ->> 'buyer' AS buyer,
  c.created_ledger,
  c.created_at,
  c.created_transaction_hash,
  x.ledger_sequence AS closed_ledger,
  NULLIF(x.ledger_closed_at, '')::timestamptz AS closed_at,
  x.transaction_hash AS closed_transaction_hash
FROM created c
LEFT JOIN LATERAL (
  SELECT x.*
  FROM chain.decoded_events x
  WHERE x.deployment_id = c.deployment_id
    AND x.contract_id = c.contract_id
    AND x.contract_role = 'marketplace'
    AND x.event_name IN ('primary_listing_purchased', 'primary_listing_cancelled', 'primary_listing_expired')
    AND (x.topics::jsonb ->> 'listing_id')::bigint = c.listing_id
    AND chain.event_position(x.ledger_sequence, x.transaction_index, x.operation_index, x.event_index)
      > chain.event_position(c.created_ledger, c.transaction_index, c.operation_index, c.event_index)
  ORDER BY x.ledger_sequence, x.transaction_index NULLS LAST, x.operation_index NULLS LAST,
    x.event_index NULLS LAST, x.event_id
  LIMIT 1
) x ON true;

CREATE VIEW marketplace.secondary_listings AS
WITH created AS (
  SELECT
    e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
    e.args::jsonb ->> 'seller' AS seller,
    (e.args::jsonb ->> 'price')::numeric(78, 0) AS price,
    (e.args::jsonb ->> 'expires_at')::bigint AS expires_at,
    (e.args::jsonb ->> 'fee_bps')::integer AS fee_bps,
    e.args::jsonb ->> 'payment_asset' AS payment_asset,
    e.ledger_sequence AS created_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, '')::timestamptz AS created_at,
    e.transaction_hash AS created_transaction_hash
  FROM chain.decoded_events e
  JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'marketplace'
    AND e.event_name = 'secondary_listing_created'
)
SELECT
  c.event_id,
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  c.token_id,
  c.seller,
  c.price,
  c.expires_at,
  c.fee_bps,
  c.payment_asset,
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

-- Secondary purchases only (ListingPurchased); see marketplace.sales for the
-- combined history.
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

-- Sales history: primary purchases (mint to the buyer; the token id only exists
-- in PrimaryListingPurchased; no seller, no fee) and secondary purchases.
-- listing_id is NULL for secondary sales.
CREATE VIEW marketplace.sales AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  'primary'::text AS sale_type,
  (e.topics::jsonb ->> 'listing_id')::bigint AS listing_id,
  (e.args::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'buyer' AS buyer,
  NULL::text AS seller,
  (e.args::jsonb ->> 'price')::numeric(78, 0) AS price,
  NULL::numeric(78, 0) AS fee,
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
  AND e.event_name = 'primary_listing_purchased'
UNION ALL
SELECT
  p.event_id, p.deployment_id, p.dao_id, p.contract_id,
  'secondary'::text, NULL::bigint, p.token_id, p.buyer, p.seller, p.price, p.fee, p.payment_asset,
  p.event_ledger, p.transaction_index, p.operation_index, p.event_index, p.event_at, p.transaction_hash
FROM marketplace.purchases p;
