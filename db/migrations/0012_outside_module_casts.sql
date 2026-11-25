-- =============================================================================
-- OUTSIDE MODULES IN THE SHARED VIEWS
--
-- A contract a DAO registers by proposal that the Manager did not deploy is
-- role `module` (0002). Its code is not the platform's, so its events can carry
-- any name and any value: a `migrated` whose to_storage_version is text or out
-- of the integer range, an `upgraded` naming a registry hash it does not run,
-- or a `module_launched` with a flag that is not a boolean. Landing rows are
-- append-only, so the views must read such rows without raising, and the views
-- that summarise every contract of the deployment must not let one contract's
-- events decide another DAO's rows.
--
--   chain.try_int            text to integer, NULL for anything else
--   manager.module_versions  upgrades and storage migrations of the contracts
--                            the Manager deployed only; storage versions read
--                            through chain.try_int
--   manager.module_launches  no launch event for a role `module` contract
--                            (is_live false, as 0002 documents)
--
-- Every other view that casts an event field reads only a role the Manager
-- deployed (token, governor, auction, ...), or a contract of that role by its
-- address. Both views keep their columns, so CREATE OR REPLACE leaves their
-- dependants (app.activity_feed reads module_versions) and grants in place.
-- =============================================================================

-- Text to integer, or NULL when it is not a whole number in the integer range.
-- A view reads a field that a contract outside the platform may write through
-- this, so a malformed value is ignored instead of failing the read. The CASE
-- fixes the order: the pattern first, then the range (1 to 18 digits always fit
-- a bigint), so no cast here can raise.
CREATE FUNCTION chain.try_int(raw text)
RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE WHEN raw ~ '^[+-]?[0-9]{1,18}$' THEN
    CASE WHEN raw::bigint BETWEEN -2147483648 AND 2147483647 THEN raw::integer END
  END
$$;

-- The code every DAO module runs, mirroring on-chain version():
--   current_hash     the latest upgraded.to_hash, else the hash it was created from
--                    (NULL for a module deployed outside the Manager: its own
--                    upgraded events are not the platform's record of its code)
--   current_version  the registry version of current_hash (what version() returns)
--   storage_version  the latest migrated.to_storage_version, else 1
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
    (array_agg(chain.try_int(a ->> 'to_storage_version') ORDER BY pos DESC, event_id DESC) FILTER (WHERE event_name = 'migrated'))[1] AS storage_version,
    count(*) FILTER (WHERE event_name = 'upgraded') AS upgrade_count
  FROM manager.module_events
  WHERE event_name IN ('upgraded', 'migrated')
    AND contract_role <> 'module'
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
-- Registration is unique per hash (ImplementationAlreadyRegistered on chain).
LEFT JOIN manager.implementations i
  ON i.deployment_id = m.deployment_id AND i.wasm_hash = COALESCE(up.to_hash, m.created_wasm_hash);

-- Each module's own launch event: is_live, the Treasury it was handed to,
-- and the launch flags (auction `started`, marketplace `opened`, token `grants`:
-- the initial mint allowances, [{module, allowance}]). An external module has
-- no launch event the platform knows (is_live false here; read it on chain),
-- so its own `module_launched` is not read.
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
  WHERE m.module_role <> 'module'
    AND x.deployment_id = m.deployment_id
    AND x.contract_id = m.module_contract
    AND x.contract_role = m.module_role
    AND x.event_name = CASE m.module_role WHEN 'claims' THEN 'claim_minter_launched' ELSE m.module_role || '_launched' END
  ORDER BY x.pos, x.event_id
  LIMIT 1
) l ON true;
