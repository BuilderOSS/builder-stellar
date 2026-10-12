-- =============================================================================
-- MARKETPLACE VIEWS
--
-- Primary sales are lazy and keyed by listing_id (u64); the token is minted to
-- the buyer on purchase. Secondary listings are keyed by token_id (u32); a token
-- has at most one open secondary listing. Events (contracts/marketplace/src/events.rs):
--   primary_listing_created    topic listing_id;         data { price, expires_at, payment_asset }
--   primary_listing_purchased  topics listing_id, buyer; data { token_id, price, payment_asset }
--   primary_listing_cancelled / primary_listing_expired   topic listing_id
--   primary_listing_commented  topics listing_id, author; data { body }
--   secondary_listing_created  topic token_id;           data { seller, price, expires_at, fee_bps, payment_asset }
--   listing_purchased          topics token_id, buyer;   data { seller, price, fee, payment_asset }
--   listing_cancelled / listing_expired   topic token_id; data { seller }
--   listing_commented          topics token_id, author;  data { body }
-- Not projected (configuration is read from chain; every listing carries its own
-- terms): marketplace_initialized, payment_asset_updated, secondary_fee_updated;
-- marketplace_paused / unpaused (manager.daos), marketplace_launched (manager.module_launches).
--
-- A listing is closed by the first purchase, cancellation or expiry event with
-- its key after it was created.
-- =============================================================================

CREATE VIEW marketplace.primary_listings AS
SELECT
  c.event_id,
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  (c.t ->> 'listing_id')::bigint AS listing_id,
  (c.a ->> 'price')::numeric(78, 0) AS price,
  (c.a ->> 'expires_at')::bigint AS expires_at,
  c.a ->> 'payment_asset' AS payment_asset,
  COALESCE(CASE x.event_name
    WHEN 'primary_listing_purchased' THEN 'purchased'
    WHEN 'primary_listing_cancelled' THEN 'cancelled'
    WHEN 'primary_listing_expired' THEN 'expired'
  END, 'open') AS status,
  (x.a ->> 'token_id')::bigint AS token_id,
  x.t ->> 'buyer' AS buyer,
  c.ledger_sequence AS created_ledger,
  c.closed_at AS created_at,
  c.transaction_hash AS created_transaction_hash,
  x.ledger_sequence AS closed_ledger,
  x.closed_at,
  x.transaction_hash AS closed_transaction_hash
FROM manager.module_events c
LEFT JOIN LATERAL (
  SELECT x.* FROM chain.events x
  WHERE x.deployment_id = c.deployment_id AND x.contract_id = c.contract_id
    AND x.event_name IN ('primary_listing_purchased', 'primary_listing_cancelled', 'primary_listing_expired')
    AND x.topic_0 = c.topic_0 AND x.pos > c.pos
  ORDER BY x.pos, x.event_id
  LIMIT 1
) x ON true
WHERE c.contract_role = 'marketplace'
  AND c.event_name = 'primary_listing_created';

CREATE VIEW marketplace.secondary_listings AS
SELECT
  c.event_id,
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  (c.t ->> 'token_id')::bigint AS token_id,
  c.a ->> 'seller' AS seller,
  (c.a ->> 'price')::numeric(78, 0) AS price,
  (c.a ->> 'expires_at')::bigint AS expires_at,
  (c.a ->> 'fee_bps')::integer AS fee_bps,
  c.a ->> 'payment_asset' AS payment_asset,
  COALESCE(CASE x.event_name
    WHEN 'listing_purchased' THEN 'purchased'
    WHEN 'listing_cancelled' THEN 'cancelled'
    WHEN 'listing_expired' THEN 'expired'
  END, 'open') AS status,
  x.t ->> 'buyer' AS buyer,
  c.ledger_sequence AS created_ledger,
  c.closed_at AS created_at,
  c.transaction_hash AS created_transaction_hash,
  x.ledger_sequence AS closed_ledger,
  x.closed_at,
  x.transaction_hash AS closed_transaction_hash
FROM manager.module_events c
LEFT JOIN LATERAL (
  SELECT x.* FROM chain.events x
  WHERE x.deployment_id = c.deployment_id AND x.contract_id = c.contract_id
    AND x.event_name IN ('listing_purchased', 'listing_cancelled', 'listing_expired')
    AND x.topic_0 = c.topic_0 AND x.pos > c.pos
  ORDER BY x.pos, x.event_id
  LIMIT 1
) x ON true
WHERE c.contract_role = 'marketplace'
  AND c.event_name = 'secondary_listing_created';

-- Sales history: primary purchases (no seller, no fee; listing_id set) and
-- secondary purchases (listing_id NULL).
CREATE VIEW marketplace.sales AS
SELECT
  e.event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  CASE e.event_name WHEN 'primary_listing_purchased' THEN 'primary' ELSE 'secondary' END AS sale_type,
  (e.t ->> 'listing_id')::bigint AS listing_id,
  COALESCE(e.a ->> 'token_id', e.t ->> 'token_id')::bigint AS token_id,
  e.t ->> 'buyer' AS buyer,
  e.a ->> 'seller' AS seller,
  (e.a ->> 'price')::numeric(78, 0) AS price,
  (e.a ->> 'fee')::numeric(78, 0) AS fee,
  e.a ->> 'payment_asset' AS payment_asset,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'marketplace'
  AND e.event_name IN ('primary_listing_purchased', 'listing_purchased');

-- Event-only comment threads: per primary listing (the listing may since have
-- closed) and per token (a token's thread carries over relistings).
CREATE VIEW marketplace.primary_listing_comments AS
SELECT
  e.event_id AS comment_event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  (e.t ->> 'listing_id')::bigint AS listing_id,
  e.t ->> 'author' AS author,
  e.a ->> 'body' AS body,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'marketplace'
  AND e.event_name = 'primary_listing_commented';

CREATE VIEW marketplace.listing_comments AS
SELECT
  e.event_id AS comment_event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  (e.t ->> 'token_id')::bigint AS token_id,
  e.t ->> 'author' AS author,
  e.a ->> 'body' AS body,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'marketplace'
  AND e.event_name = 'listing_commented';
