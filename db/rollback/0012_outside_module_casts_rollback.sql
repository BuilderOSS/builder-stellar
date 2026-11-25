-- Restore 0002's manager.module_versions and manager.module_launches (same
-- columns, so CREATE OR REPLACE keeps app.activity_feed and the grants), then
-- drop the helper they no longer use.
CREATE OR REPLACE VIEW manager.module_versions AS
WITH up AS (
  SELECT
    deployment_id,
    contract_id,
    (array_agg(t ->> 'to_hash' ORDER BY pos DESC, event_id DESC) FILTER (WHERE event_name = 'upgraded'))[1] AS to_hash,
    (array_agg(t ->> 'from_hash' ORDER BY pos DESC, event_id DESC) FILTER (WHERE event_name = 'upgraded'))[1] AS from_hash,
    (array_agg(ledger_sequence ORDER BY pos DESC, event_id DESC) FILTER (WHERE event_name = 'upgraded'))[1] AS upgraded_ledger,
    (array_agg(closed_at ORDER BY pos DESC, event_id DESC) FILTER (WHERE event_name = 'upgraded'))[1] AS upgraded_at,
    (array_agg(transaction_hash ORDER BY pos DESC, event_id DESC) FILTER (WHERE event_name = 'upgraded'))[1] AS upgraded_tx_hash,
    (array_agg((a ->> 'to_storage_version')::integer ORDER BY pos DESC, event_id DESC) FILTER (WHERE event_name = 'migrated'))[1] AS storage_version,
    count(*) FILTER (WHERE event_name = 'upgraded') AS upgrade_count
  FROM manager.module_events
  WHERE event_name IN ('upgraded', 'migrated')
  GROUP BY deployment_id, contract_id
)
SELECT
  m.deployment_id,
  m.dao_id,
  m.module_role,
  m.kind,
  m.module_contract,
  m.registered,
  COALESCE(up.to_hash, m.created_wasm_hash) AS current_hash,
  i.version AS current_version,
  COALESCE(up.storage_version, 1) AS storage_version,
  COALESCE(up.upgrade_count, 0)::bigint AS upgrade_count,
  up.from_hash AS last_upgraded_from_hash,
  up.upgraded_ledger AS last_upgraded_ledger,
  up.upgraded_at AS last_upgraded_at,
  up.upgraded_tx_hash AS last_upgraded_tx_hash
FROM manager.dao_modules m
LEFT JOIN up ON up.deployment_id = m.deployment_id AND up.contract_id = m.module_contract
LEFT JOIN manager.implementations i
  ON i.deployment_id = m.deployment_id AND i.wasm_hash = COALESCE(up.to_hash, m.created_wasm_hash);

CREATE OR REPLACE VIEW manager.module_launches AS
SELECT
  m.deployment_id,
  m.dao_id,
  m.module_role,
  m.module_contract,
  l.event_id IS NOT NULL AS is_live,
  l.t ->> 'treasury' AS treasury,
  (l.a ->> 'started')::boolean AS started,
  (l.a ->> 'opened')::boolean AS opened,
  l.a -> 'grants' AS grants,
  l.ledger_sequence AS launched_ledger,
  l.closed_at AS launched_at,
  l.transaction_hash AS launched_tx_hash
FROM manager.dao_modules m
LEFT JOIN LATERAL (
  SELECT x.* FROM chain.events x
  WHERE x.deployment_id = m.deployment_id
    AND x.contract_id = m.module_contract
    AND x.contract_role = m.module_role
    AND x.event_name = CASE m.module_role WHEN 'claims' THEN 'claim_minter_launched' ELSE m.module_role || '_launched' END
  ORDER BY x.pos, x.event_id
  LIMIT 1
) l ON true;

DROP FUNCTION IF EXISTS chain.try_int(text);
