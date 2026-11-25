-- =============================================================================
-- A KNOWN ROLE BELONGS TO THE DAO THE MANAGER CREATED THE MODULE FOR
--
-- 0002 gives a registration the kind the Manager deployed the contract as,
-- whichever DAO registers it. A Treasury can register any contract by
-- proposal, so a DAO could register a module the Manager created for another
-- DAO (its Marketplace, say) and the views would list it as the first DAO's
-- own vouched module: manager.daos would name it as that DAO's marketplace and
-- the domain views would show the other DAO's pools, with payments going to the
-- other DAO's Treasury.
--
--   manager.created_modules      every module the Manager created, with the DAO
--                                it created it for (DaoCreated's token, or
--                                ModuleCreated's token_address)
--   manager.manager_modules      the same rows without the DAO, as before
--   manager.module_registrations a known role (auction, marketplace, claims,
--                                circle) only when the registering DAO is the
--                                one the Manager created the module for; any
--                                other registration is role `module`
--
-- created_wasm_hash still names the Manager's creation hash for a module the
-- Manager created, whichever DAO registers it: it describes the code, not the
-- DAO. A role `module` registration of another DAO's module gets none of that
-- module's events, since its events keep the role the pipeline gave them and
-- manager.module_events matches roles exactly.
--
-- manager_modules and module_registrations keep their columns, so CREATE OR
-- REPLACE leaves their dependants and grants in place.
-- =============================================================================

-- Every module this deployment's Manager deployed, with the DAO it deployed it
-- for: create_dao's (DaoCreated modules, with their creation hashes) and
-- create_module's (ModuleCreated, with the current implementation for the kind
-- when it ran). The only contracts a known role vouches for, and only for dao_id.
CREATE VIEW manager.created_modules AS
SELECT r.deployment_id, r.dao_id, m.kind, m.contract_id, m.wasm_hash, r.created_pos AS created_pos
FROM manager.dao_registry r
CROSS JOIN LATERAL (VALUES
  ('auction',     r.auction_contract,     r.auction_wasm_hash),
  ('marketplace', r.marketplace_contract, r.marketplace_wasm_hash),
  ('claims',      r.claims_contract,      r.claims_wasm_hash)
) AS m(kind, contract_id, wasm_hash)
WHERE m.contract_id IS NOT NULL
UNION ALL
SELECT mc.deployment_id, mc.t ->> 'token_address', mc.t ->> 'kind', mc.a ->> 'address', cu.a ->> (mc.t ->> 'kind'), mc.pos
FROM chain.events mc
LEFT JOIN LATERAL (
  SELECT u.a FROM chain.events u
  WHERE u.deployment_id = mc.deployment_id AND u.contract_role = 'manager'
    AND u.event_name = 'current_implementations_updated' AND u.pos < mc.pos
  ORDER BY u.pos DESC, u.event_id DESC LIMIT 1
) cu ON true
WHERE mc.contract_role = 'manager' AND mc.event_name = 'module_created';

-- Every module this deployment's Manager deployed (manager.created_modules
-- without the DAO it was created for).
CREATE OR REPLACE VIEW manager.manager_modules AS
SELECT c.deployment_id, c.kind, c.contract_id, c.wasm_hash, c.created_pos
FROM manager.created_modules c;

-- One row per registration window of a module in a DAO's Token registry:
-- ModuleRegistered opens it, the next ModuleUnregistered of the same address
-- closes it. The window starts at the registering transaction, so the module's
-- constructor events (emitted before its registration in that call) are in it.
-- module_role: the kind the Manager deployed it as, when the Manager deployed
-- it for this DAO (manager.created_modules); else `module` (deployed outside
-- the Manager, or for another DAO, whatever kind it was registered under).
-- created_wasm_hash: the Manager's creation hash, else NULL.
CREATE OR REPLACE VIEW manager.module_registrations AS
SELECT
  rg.deployment_id,
  r.dao_id,
  rg.t ->> 'kind' AS kind,
  -- The DAO check is what stops a DAO from presenting another DAO's module as
  -- its own vouched auction, marketplace or claims module.
  COALESCE(CASE WHEN mm.dao_id = r.dao_id THEN manager.module_role(mm.kind) END, 'module') AS module_role,
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
  -- A contract address is created once, so at most one row matches; the order
  -- still prefers this DAO's row, so no other row can hide it.
  SELECT x.dao_id, x.kind, x.wasm_hash FROM manager.created_modules x
  WHERE x.deployment_id = rg.deployment_id AND x.contract_id = rg.a ->> 'address'
  ORDER BY (x.dao_id = r.dao_id) DESC NULLS LAST, x.created_pos LIMIT 1
) mm ON true
WHERE rg.contract_role = 'token'
  AND rg.event_name = 'module_registered';
