-- =============================================================================
-- U64 FIELDS IN THE MARKETPLACE AND CLAIMS VIEWS
--
-- Some u64 event fields have no upper bound on chain: a value only has to be
-- later than now. Any member can list a token with expires_at up to u64::MAX
-- (18446744073709551615), and a vote or the launch admin can choose the same
-- for a pool's expires_at and period_secs, a claim list's expires_at and its
-- assurance deadline. A bigint holds at most 9223372036854775807, so 0008 and
-- 0010 cast such a value with an error, and the error stops every read of the
-- view, for every DAO of the deployment.
--
--   chain.u64_bigint               text to bigint; values past the bigint range
--                                  read as its maximum, NULL for anything else
--   marketplace.pools              expires_at, period_secs
--   marketplace.secondary_listings expires_at
--   claims.lists                   expires_at, assurance deadline
--
-- Reading the maximum keeps the meaning: the bigint maximum is still later than
-- any ledger time, so an expiry stays in the future and a period stays longer
-- than any real one. The exact value is on chain. Each view keeps its columns
-- and types, so CREATE OR REPLACE leaves dependants, grants and the Prisma
-- models in place.
--
-- The other u64 fields the views cast are bounded on chain: governance and
-- auction times are now plus a timing of at most 30 days, and a token, pool or
-- list id is a u32.
-- =============================================================================

-- A u64 (or any whole number) as text to bigint. Past the bigint range it reads
-- as 9223372036854775807; anything that is not a whole number is NULL. The CASE
-- fixes the order: the pattern first, then the length, so the cast only ever
-- sees at most 20 digits and no cast here can raise.
CREATE FUNCTION chain.u64_bigint(raw text)
RETURNS bigint
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN raw IS NULL OR raw !~ '^[0-9]+$' THEN NULL
    WHEN length(ltrim(raw, '0')) > 19 THEN 9223372036854775807
    ELSE LEAST(('0' || ltrim(raw, '0'))::numeric, 9223372036854775807)::bigint
  END
$$;

-- 0008's pools, with expires_at and period_secs read through chain.u64_bigint.
CREATE OR REPLACE VIEW marketplace.pools AS
SELECT
  o.event_id,
  o.deployment_id,
  o.dao_id,
  o.contract_id,
  (o.t ->> 'pool_id')::bigint AS pool_id,
  (o.a ->> 'price')::numeric(78, 0) AS price,
  o.a ->> 'asset' AS asset,
  chain.u64_bigint(o.a ->> 'expires_at') AS expires_at,
  (o.a ->> 'size')::bigint AS size,
  (o.a ->> 'max_per_buyer')::bigint AS max_per_buyer,
  (o.a ->> 'max_sold_per_period')::bigint AS max_sold_per_period,
  chain.u64_bigint(o.a ->> 'period_secs') AS period_secs,
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

-- 0008's secondary listings, with expires_at read through chain.u64_bigint.
CREATE OR REPLACE VIEW marketplace.secondary_listings AS
SELECT
  c.event_id,
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  (c.t ->> 'token_id')::bigint AS token_id,
  c.a ->> 'seller' AS seller,
  (c.a ->> 'price')::numeric(78, 0) AS price,
  chain.u64_bigint(c.a ->> 'expires_at') AS expires_at,
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

-- 0010's lists, with expires_at and the assurance deadline read through chain.u64_bigint.
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
  chain.u64_bigint(o.a ->> 'expires_at') AS expires_at,
  (o.a ->> 'total')::bigint AS total,
  o.a -> 'assurance' IS NOT NULL AND jsonb_typeof(o.a -> 'assurance') = 'object' AS is_assurance,
  (o.a #>> '{assurance,threshold_claimers}')::bigint AS threshold_claimers,
  chain.u64_bigint(o.a #>> '{assurance,deadline}') AS deadline,
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
