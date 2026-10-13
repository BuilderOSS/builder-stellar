-- =============================================================================
-- MARKETPLACE VIEWS
--
-- Primary sales are quick-buy pools keyed by pool_id (u32): governance opens a
-- pool against the Marketplace's mint allowance, anyone restocks it (the tokens
-- are minted into Marketplace custody, non-voting) and buyers take a stocked
-- token at the pool price. Secondary listings are keyed by token_id (u32); a
-- token has at most one open secondary listing. Events (contracts/marketplace/src/events.rs):
--   pool_opened                topic pool_id;            data { price, asset, expires_at, size, max_per_buyer,
--                                                        max_sold_per_period, period_secs }
--   pool_restocked             topic pool_id;            data { first_token_id, count, stocked }
--   pool_purchased             topics pool_id, buyer;    data { token_id, price, asset }
--   pool_closed                topic pool_id;            data { released }
--   pool_swept                 topic pool_id;            data { count, pages_left }
--   secondary_listing_created  topic token_id;           data { seller, price, expires_at, fee_bps, payment_asset }
--   listing_purchased          topics token_id, buyer;   data { seller, price, fee, payment_asset }
--   listing_cancelled / listing_expired   topic token_id; data { seller }
--   listing_commented          topics token_id, author;  data { body }
-- Not projected (configuration is read from chain; every listing carries its own
-- terms): marketplace_initialized, payment_asset_updated, secondary_fee_updated;
-- marketplace_paused / unpaused (manager.daos), marketplace_launched (manager.module_launches).
--
-- A listing is closed by the first purchase, cancellation or expiry event with
-- its key after it was created; a pool by its pool_closed (an expired pool sells
-- nothing more but stays `open` here until someone closes it: compare expires_at).
-- =============================================================================

-- One row per pool: its terms and running totals.
CREATE VIEW marketplace.pools AS
SELECT
  o.event_id,
  o.deployment_id,
  o.dao_id,
  o.contract_id,
  (o.t ->> 'pool_id')::bigint AS pool_id,
  (o.a ->> 'price')::numeric(78, 0) AS price,
  o.a ->> 'asset' AS asset,
  (o.a ->> 'expires_at')::bigint AS expires_at,
  (o.a ->> 'size')::bigint AS size,
  (o.a ->> 'max_per_buyer')::bigint AS max_per_buyer,
  (o.a ->> 'max_sold_per_period')::bigint AS max_sold_per_period,
  (o.a ->> 'period_secs')::bigint AS period_secs,
  COALESCE(k.stocked, 0)::bigint AS stocked,
  COALESCE(k.sold, 0)::bigint AS sold,
  COALESCE(k.swept, 0)::bigint AS swept,
  (COALESCE(k.stocked, 0) - COALESCE(k.sold, 0) - COALESCE(k.swept, 0))::bigint AS in_stock,
  CASE WHEN k.closed_ledger IS NULL THEN 'open' ELSE 'closed' END AS status,
  k.released,
  o.ledger_sequence AS opened_ledger,
  o.closed_at AS opened_at,
  o.transaction_hash AS opened_transaction_hash,
  k.closed_ledger,
  k.closed_at
FROM manager.module_events o
LEFT JOIN LATERAL (
  SELECT
    max((x.a ->> 'stocked')::bigint) FILTER (WHERE x.event_name = 'pool_restocked') AS stocked,
    count(*) FILTER (WHERE x.event_name = 'pool_purchased') AS sold,
    sum((x.a ->> 'count')::bigint) FILTER (WHERE x.event_name = 'pool_swept') AS swept,
    max((x.a ->> 'released')::bigint) FILTER (WHERE x.event_name = 'pool_closed') AS released,
    max(x.ledger_sequence) FILTER (WHERE x.event_name = 'pool_closed') AS closed_ledger,
    max(x.closed_at) FILTER (WHERE x.event_name = 'pool_closed') AS closed_at
  FROM manager.module_events x
  WHERE x.deployment_id = o.deployment_id AND x.contract_id = o.contract_id
    AND x.contract_role = 'marketplace'
    AND x.event_name IN ('pool_restocked', 'pool_purchased', 'pool_closed', 'pool_swept')
    AND x.topic_0 = o.topic_0 AND x.pos > o.pos
) k ON true
WHERE o.contract_role = 'marketplace'
  AND o.event_name = 'pool_opened';

-- The tokens a pool has in stock: every id its restocks minted that the
-- Marketplace still holds (a sale sends it to the buyer, a sweep to the
-- Treasury). Which stock page holds an id depends on sales between restocks:
-- read it on chain (marketplace.pool_stock(pool_id, page)) before buying.
CREATE VIEW marketplace.pool_stock AS
SELECT
  r.deployment_id,
  r.dao_id,
  r.contract_id,
  (r.t ->> 'pool_id')::bigint AS pool_id,
  ids.token_id,
  r.ledger_sequence AS restocked_ledger
FROM manager.module_events r
CROSS JOIN LATERAL generate_series(
  (r.a ->> 'first_token_id')::bigint,
  (r.a ->> 'first_token_id')::bigint + (r.a ->> 'count')::bigint - 1
) AS ids(token_id)
JOIN manager.dao_registry d ON d.deployment_id = r.deployment_id AND d.dao_id = r.dao_id
JOIN token.inventory inv
  ON inv.deployment_id = r.deployment_id AND inv.contract_id = d.token_contract
 AND inv.token_id = ids.token_id AND inv.owner = r.contract_id
WHERE r.contract_role = 'marketplace'
  AND r.event_name = 'pool_restocked';

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

-- Sales history: pool sales (pool_id set; no seller, no fee: the price goes to
-- the Treasury) and secondary purchases (pool_id NULL).
CREATE VIEW marketplace.sales AS
SELECT
  e.event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  CASE e.event_name WHEN 'pool_purchased' THEN 'pool' ELSE 'secondary' END AS sale_type,
  CASE e.event_name WHEN 'pool_purchased' THEN (e.t ->> 'pool_id')::bigint END AS pool_id,
  COALESCE(e.a ->> 'token_id', e.t ->> 'token_id')::bigint AS token_id,
  e.t ->> 'buyer' AS buyer,
  e.a ->> 'seller' AS seller,
  (e.a ->> 'price')::numeric(78, 0) AS price,
  (e.a ->> 'fee')::numeric(78, 0) AS fee,
  COALESCE(e.a ->> 'payment_asset', e.a ->> 'asset') AS payment_asset,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'marketplace'
  AND e.event_name IN ('pool_purchased', 'listing_purchased');

-- Event-only comment threads per token (a token's thread carries over relistings).
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
