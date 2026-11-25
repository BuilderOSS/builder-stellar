-- Restore 0002's manager.module_registrations and manager.manager_modules (same
-- columns, so CREATE OR REPLACE keeps their dependants and the grants), then
-- drop manager.created_modules, which nothing reads any more.
CREATE OR REPLACE VIEW manager.manager_modules AS
SELECT r.deployment_id, m.kind, m.contract_id, m.wasm_hash, r.created_pos AS created_pos
FROM manager.dao_registry r
CROSS JOIN LATERAL (VALUES
  ('auction',     r.auction_contract,     r.auction_wasm_hash),
  ('marketplace', r.marketplace_contract, r.marketplace_wasm_hash),
  ('claims',      r.claims_contract,      r.claims_wasm_hash)
) AS m(kind, contract_id, wasm_hash)
WHERE m.contract_id IS NOT NULL
UNION ALL
SELECT mc.deployment_id, mc.t ->> 'kind', mc.a ->> 'address', cu.a ->> (mc.t ->> 'kind'), mc.pos
FROM chain.events mc
LEFT JOIN LATERAL (
  SELECT u.a FROM chain.events u
  WHERE u.deployment_id = mc.deployment_id AND u.contract_role = 'manager'
    AND u.event_name = 'current_implementations_updated' AND u.pos < mc.pos
  ORDER BY u.pos DESC, u.event_id DESC LIMIT 1
) cu ON true
WHERE mc.contract_role = 'manager' AND mc.event_name = 'module_created';

CREATE OR REPLACE VIEW manager.module_registrations AS
SELECT
  rg.deployment_id,
  r.dao_id,
  rg.t ->> 'kind' AS kind,
  COALESCE(manager.module_role(mm.kind), 'module') AS module_role,
  rg.a ->> 'address' AS module_contract,
  COALESCE((rg.a ->> 'non_voting')::boolean, false) AS non_voting,
  ARRAY[rg.ledger_sequence, COALESCE(rg.transaction_index, -1), -1, -1]::bigint[] AS from_pos,
  ur.pos AS until_pos,
  rg.pos AS registered_pos,
  rg.ledger_sequence AS registered_ledger,
  rg.closed_at AS registered_at,
  rg.transaction_hash AS registered_tx_hash,
  ur.ledger_sequence AS unregistered_ledger,
  ur.closed_at AS unregistered_at,
  mm.wasm_hash AS created_wasm_hash
FROM chain.events rg
JOIN manager.dao_registry r
  ON r.deployment_id = rg.deployment_id AND r.token_contract = rg.contract_id
LEFT JOIN LATERAL (
  SELECT x.pos, x.ledger_sequence, x.closed_at FROM chain.events x
  WHERE x.deployment_id = rg.deployment_id AND x.contract_id = rg.contract_id
    AND x.contract_role = 'token' AND x.event_name = 'module_unregistered'
    AND x.a ->> 'address' = rg.a ->> 'address' AND x.pos > rg.pos
  ORDER BY x.pos, x.event_id LIMIT 1
) ur ON true
LEFT JOIN LATERAL (
  SELECT x.kind, x.wasm_hash FROM manager.manager_modules x
  WHERE x.deployment_id = rg.deployment_id AND x.contract_id = rg.a ->> 'address'
  ORDER BY x.created_pos LIMIT 1
) mm ON true
WHERE rg.contract_role = 'token'
  AND rg.event_name = 'module_registered';

DROP VIEW manager.created_modules;
