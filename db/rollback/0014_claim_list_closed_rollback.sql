-- Restore 0013's claims.lists. CREATE OR REPLACE cannot drop columns, so the
-- view is dropped and created again: nothing depends on it, and
-- grant-permissions.sh gives app_server its read access back.
DROP VIEW IF EXISTS claims.lists;
-- 0010's lists, with expires_at and the assurance deadline read through chain.u64_bigint.
CREATE VIEW claims.lists AS
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
