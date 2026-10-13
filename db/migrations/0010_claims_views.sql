-- =============================================================================
-- CLAIMS VIEWS: each DAO's ClaimMinter (registry kind `claims`,
-- docs/designs/membership-models.md § 3): merkle claim lists, paid or free,
-- optionally an assurance drive whose payments wait in escrow until launch.
--
-- ClaimMinter events (contracts/minter/src/events.rs; pipeline role `claims`):
--   list_opened       topic list_id;           data { root, tree_uri, asset, price, expires_at, total,
--                                              assurance {threshold_claimers, deadline} | null }
--   claimed           topics list_id, claimer; data { amount, first_token_id, paid, escrowed, claimed }
--                     `claimed` is the claimer's total on the list after this claim
--   escrow_released   topic list_id;           data { treasury, amount }   (at launch)
--   refunded          topic list_id, claimer;  data { amount }             (a failed drive)
-- Not projected: claim_minter_launched (manager.module_launches).
-- Whether an assurance list's threshold is met or its drive failed is chain
-- state (claim_minter.assurance_state); manager.assurance_drives has the outcome.
-- =============================================================================

-- One row per list: its terms and running totals.
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

-- Every claim, newest last: who claimed how many tokens (ids first_token_id ..
-- first_token_id + amount - 1) for what, and whether the payment went to escrow.
CREATE VIEW claims.claims AS
SELECT
  e.event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  (e.t ->> 'list_id')::bigint AS list_id,
  e.t ->> 'claimer' AS claimer,
  (e.a ->> 'amount')::bigint AS amount,
  (e.a ->> 'first_token_id')::bigint AS first_token_id,
  (e.a ->> 'paid')::numeric(78, 0) AS paid,
  (e.a ->> 'escrowed')::boolean AS escrowed,
  (e.a ->> 'claimed')::bigint AS claimer_total,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'claims'
  AND e.event_name = 'claimed';

-- Each claimer's position on each list: tokens claimed, paid, and refunded
-- (a failed drive refunds the escrowed payments one claimer at a time).
CREATE VIEW claims.claimers AS
SELECT
  c.deployment_id,
  c.dao_id,
  c.contract_id,
  c.list_id,
  c.claimer,
  max(c.claimer_total)::bigint AS claimed,
  sum(c.paid)::numeric(78, 0) AS paid,
  COALESCE(sum(c.paid) FILTER (WHERE c.escrowed), 0)::numeric(78, 0) AS escrowed,
  COALESCE((
    SELECT sum((r.a ->> 'amount')::numeric) FROM manager.module_events r
    WHERE r.deployment_id = c.deployment_id AND r.contract_id = c.contract_id
      AND r.contract_role = 'claims' AND r.event_name = 'refunded'
      AND (r.t ->> 'list_id')::bigint = c.list_id AND r.t ->> 'claimer' = c.claimer
  ), 0)::numeric(78, 0) AS refunded
FROM claims.claims c
GROUP BY c.deployment_id, c.dao_id, c.contract_id, c.list_id, c.claimer;
