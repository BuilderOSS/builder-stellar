-- =============================================================================
-- CLOSED CLAIM LISTS AND SETUP LISTS
--
-- ClaimMinter `close_list(list_id)` (the admin: the launch admin in Setup, the
-- Treasury by proposal once Live) ends a list early. It moves the list's
-- `expires_at` to the ledger time and emits:
--
--   list_closed   topic list_id;   data { minted, total }
--
-- `list_opened` still carries the expiry the list was opened with, so
-- claims.lists reads the close as well. It keeps 0013's columns, in order and
-- with their types, and adds at the end:
--
--   closed                 the list was closed early
--   closed_ledger          the ledger of the close, NULL while not closed
--   closed_at              the ledger time of the close, NULL while not closed
--   effective_expires_at   when claims stop: the close time for a closed list,
--                          otherwise expires_at (past the bigint range it reads
--                          as its maximum, as in 0013)
--   opened_in_setup        the list was opened before its ClaimMinter launched
--                          (no claim_minter_launched before it). A free list the
--                          launch admin opened in Setup stays claimable after
--                          launch, so the app shows what is left of such lists
--                          as founder supply that can still be minted.
--
-- A ClaimMinter added after launch is launched in the transaction that creates
-- it, so its lists all read opened_in_setup false. The launch is read from
-- chain.events, as 0012's manager.module_launches does: a module registered in
-- a later transaction than the one that created it has its launch before its
-- registration window, so manager.module_events does not hold it.
-- =============================================================================

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
  o.transaction_hash AS opened_transaction_hash,
  k.closed_ledger IS NOT NULL AS closed,
  k.closed_ledger,
  k.closed_at,
  -- The contract sets expires_at to the ledger time of the close. LEAST skips a
  -- NULL close time, so a close without one keeps the opened expiry.
  CASE
    WHEN k.closed_ledger IS NULL THEN chain.u64_bigint(o.a ->> 'expires_at')
    ELSE LEAST(chain.u64_bigint(o.a ->> 'expires_at'), floor(extract(epoch FROM k.closed_at))::bigint)
  END AS effective_expires_at,
  NOT EXISTS (
    SELECT 1 FROM chain.events l
    WHERE l.deployment_id = o.deployment_id AND l.contract_id = o.contract_id
      AND l.contract_role = 'claims'
      AND l.event_name = 'claim_minter_launched'
      AND l.pos < o.pos
  ) AS opened_in_setup
FROM manager.module_events o
LEFT JOIN LATERAL (
  SELECT
    sum((x.a ->> 'amount')::bigint) FILTER (WHERE x.event_name = 'claimed') AS claimed,
    count(DISTINCT x.t ->> 'claimer') FILTER (WHERE x.event_name = 'claimed') AS claimers,
    sum((x.a ->> 'paid')::numeric) FILTER (WHERE x.event_name = 'claimed') AS paid,
    sum((x.a ->> 'paid')::numeric) FILTER (WHERE x.event_name = 'claimed' AND (x.a ->> 'escrowed')::boolean) AS escrowed,
    max((x.a ->> 'amount')::numeric) FILTER (WHERE x.event_name = 'escrow_released') AS released,
    sum((x.a ->> 'amount')::numeric) FILTER (WHERE x.event_name = 'refunded') AS refunded,
    -- A list closes at most once: a second close_list fails with ListExpired.
    min(x.ledger_sequence) FILTER (WHERE x.event_name = 'list_closed') AS closed_ledger,
    min(x.closed_at) FILTER (WHERE x.event_name = 'list_closed') AS closed_at
  FROM manager.module_events x
  WHERE x.deployment_id = o.deployment_id AND x.contract_id = o.contract_id
    AND x.contract_role = 'claims'
    AND x.event_name IN ('claimed', 'escrow_released', 'refunded', 'list_closed')
    AND x.topic_0 = o.topic_0 AND x.pos > o.pos
) k ON true
WHERE o.contract_role = 'claims'
  AND o.event_name = 'list_opened';
