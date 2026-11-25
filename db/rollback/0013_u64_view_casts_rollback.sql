-- Restore 0008's marketplace.pools and marketplace.secondary_listings and 0010's
-- claims.lists (same columns, so CREATE OR REPLACE keeps dependants and grants),
-- then drop the helper they no longer use.
CREATE OR REPLACE VIEW marketplace.pools AS
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

CREATE OR REPLACE VIEW marketplace.secondary_listings AS
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

CREATE OR REPLACE VIEW claims.lists AS
SELECT
  o.event_id,
  o.deployment_id,
  o.dao_id,
  o.contract_id,
  (o.t ->> 'list_id')::bigint AS list_id,
  o.a ->> 'root' AS root,
  o.a ->> 'tree_uri' AS tree_uri,
  o.a ->> 'asset' AS asset,
  (o.a ->> 'price')::numeric(78, 0) AS price,
  (o.a ->> 'expires_at')::bigint AS expires_at,
  (o.a ->> 'total')::bigint AS total,
  o.a -> 'assurance' IS NOT NULL AND jsonb_typeof(o.a -> 'assurance') = 'object' AS is_assurance,
  (o.a #>> '{assurance,threshold_claimers}')::bigint AS threshold_claimers,
  (o.a #>> '{assurance,deadline}')::bigint AS deadline,
  COALESCE(k.claimed, 0)::bigint AS claimed,
  COALESCE(k.claimers, 0)::bigint AS claimers,
  COALESCE(k.paid, 0)::numeric(78, 0) AS paid,
  COALESCE(k.escrowed, 0)::numeric(78, 0) AS escrowed,
  k.released,
  COALESCE(k.refunded, 0)::numeric(78, 0) AS refunded,
  o.ledger_sequence AS opened_ledger,
  o.closed_at AS opened_at,
  o.transaction_hash AS opened_transaction_hash
FROM manager.module_events o
LEFT JOIN LATERAL (
  SELECT
    sum((x.a ->> 'amount')::bigint) FILTER (WHERE x.event_name = 'claimed') AS claimed,
    count(DISTINCT x.t ->> 'claimer') FILTER (WHERE x.event_name = 'claimed') AS claimers,
    sum((x.a ->> 'paid')::numeric) FILTER (WHERE x.event_name = 'claimed') AS paid,
    sum((x.a ->> 'paid')::numeric) FILTER (WHERE x.event_name = 'claimed' AND (x.a ->> 'escrowed')::boolean) AS escrowed,
    max((x.a ->> 'amount')::numeric) FILTER (WHERE x.event_name = 'escrow_released') AS released,
    sum((x.a ->> 'amount')::numeric) FILTER (WHERE x.event_name = 'refunded') AS refunded
  FROM manager.module_events x
  WHERE x.deployment_id = o.deployment_id AND x.contract_id = o.contract_id
    AND x.contract_role = 'claims'
    AND x.event_name IN ('claimed', 'escrow_released', 'refunded')
    AND x.topic_0 = o.topic_0 AND x.pos > o.pos
) k ON true
WHERE o.contract_role = 'claims'
  AND o.event_name = 'list_opened';

DROP FUNCTION IF EXISTS chain.u64_bigint(text);
