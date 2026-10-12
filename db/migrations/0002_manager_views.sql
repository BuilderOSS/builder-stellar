-- =============================================================================
-- MANAGER VIEWS: the DAO registry, tenant resolution, launch state, slugs,
-- the implementation registry and the Manager's own settings.
--
-- Manager events (contracts/manager/src/events.rs):
--   dao_created                 topics token_address, deployer, launch_admin;
--                               data { created_ledger, modules {6 addresses}, wasm_hashes {6 hashes}, slug }
--   dao_launched                topic token_address; data { launched_ledger, modules, launch_auction,
--                               launch_marketplace, minter }
--   pending_slug_updated        topic token_address; data { slug }
--   slug_claimed                topics token_address, slug          (launch_dao)
--   slug_changed                topics token_address, new_slug; data { old_slug }
--   implementation_registered   topic wasm_hash; data { name, version, published_ledger }
--   implementation_revoked      topic wasm_hash; data { revoked_ledger }
--   manager_initialized         topic admin; data { version, deployed_ledger }
--   admin_proposed / admin_proposal_cancelled / admin_changed   topics (current|old)_admin, (proposed|cancelled|new)_admin
--   platform_minter_set         topic minter
--   factory_paused / factory_unpaused   no fields
-- Not projected (read from chain, or only a feed row): latest_implementation_set,
-- current_implementations_updated, upgrade_approved, manager_upgraded, upgrade_delay_changed.
--
-- Module events read here (contracts/common): <role>_launched (topic treasury),
-- admin_changed (topics old_admin, new_admin), upgraded (topics from_hash, to_hash;
-- data version), migrated (data from_storage_version, to_storage_version).
-- =============================================================================

-- One row per DAO. DaoCreated.slug is only the slug *requested* at creation.
CREATE VIEW manager.dao_registry AS
SELECT DISTINCT ON (e.deployment_id, e.topic_0)
  e.deployment_id,
  e.topic_0                        AS dao_id,
  e.topic_0                        AS token_address,
  e.topic_1                        AS deployer,
  e.topic_2                        AS launch_admin,
  e.a ->> 'slug'                   AS created_slug,
  e.contract_id                    AS manager_contract,
  e.a #>> '{modules,token}'        AS token_contract,
  e.a #>> '{modules,governor}'     AS governor_contract,
  e.a #>> '{modules,auction}'      AS auction_contract,
  e.a #>> '{modules,treasury}'     AS treasury_contract,
  e.a #>> '{modules,metadata}'     AS metadata_contract,
  e.a #>> '{modules,marketplace}'  AS marketplace_contract,
  e.a #>> '{wasm_hashes,token}'       AS token_wasm_hash,
  e.a #>> '{wasm_hashes,governor}'    AS governor_wasm_hash,
  e.a #>> '{wasm_hashes,auction}'     AS auction_wasm_hash,
  e.a #>> '{wasm_hashes,treasury}'    AS treasury_wasm_hash,
  e.a #>> '{wasm_hashes,metadata}'    AS metadata_wasm_hash,
  e.a #>> '{wasm_hashes,marketplace}' AS marketplace_wasm_hash,
  e.ledger_sequence                AS created_ledger,
  e.closed_at                      AS created_at,
  e.transaction_hash               AS created_tx_hash,
  e.ingested_at                    AS indexed_at
FROM chain.events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'dao_created'
ORDER BY e.deployment_id, e.topic_0, e.pos, e.event_id;

-- One row per DAO module, with the hash it was deployed from.
CREATE VIEW manager.dao_modules AS
SELECT r.deployment_id, r.dao_id, m.module_role, m.module_contract, m.created_wasm_hash
FROM manager.dao_registry r
CROSS JOIN LATERAL (VALUES
  ('token',       r.token_contract,       r.token_wasm_hash),
  ('metadata',    r.metadata_contract,    r.metadata_wasm_hash),
  ('auction',     r.auction_contract,     r.auction_wasm_hash),
  ('governor',    r.governor_contract,    r.governor_wasm_hash),
  ('treasury',    r.treasury_contract,    r.treasury_wasm_hash),
  ('marketplace', r.marketplace_contract, r.marketplace_wasm_hash)
) AS m(module_role, module_contract, created_wasm_hash)
WHERE m.module_contract IS NOT NULL;

-- Tenant resolution: module contract -> DAO. The Manager and the shared Minter
-- are not modules (Minter events carry the DAO token as their token_id topic).
CREATE VIEW manager.event_identity AS
SELECT deployment_id, dao_id, module_role, module_contract AS contract_id
FROM manager.dao_modules;

-- Every event a DAO module emitted, with its DAO. The base of every domain view.
CREATE VIEW manager.module_events AS
SELECT e.*, i.dao_id
FROM chain.events e
JOIN manager.event_identity i
  ON i.deployment_id = e.deployment_id
 AND i.contract_id = e.contract_id
 AND i.module_role = e.contract_role;

-- One row per launched DAO (DaoLaunched).
CREATE VIEW manager.dao_launches AS
SELECT DISTINCT ON (e.deployment_id, e.topic_0)
  e.deployment_id,
  e.topic_0 AS dao_id,
  e.pos AS launched_pos,
  e.ledger_sequence AS launched_ledger,
  e.closed_at AS launched_at,
  e.transaction_hash AS launched_tx_hash,
  (e.a ->> 'launch_auction')::boolean AS launch_auction,
  (e.a ->> 'launch_marketplace')::boolean AS launch_marketplace,
  e.a ->> 'minter' AS minter
FROM chain.events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'dao_launched'
ORDER BY e.deployment_id, e.topic_0, e.pos DESC, e.event_id DESC;

-- Slugs a DAO moved away from (one row per change). Not reserved: another DAO
-- may hold the same slug now, and the app prefers the current holder.
CREATE VIEW manager.dao_previous_slugs AS
SELECT
  e.deployment_id,
  e.topic_0 AS dao_id,
  e.a ->> 'old_slug' AS slug,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS changed_at
FROM chain.events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'slug_changed';

-- Each module's own launch event: is_live, the Treasury it was handed to,
-- and the launch flags (auction `started`, marketplace `opened`, token `minters`).
CREATE VIEW manager.module_launches AS
SELECT
  m.deployment_id,
  m.dao_id,
  m.module_role,
  m.module_contract,
  l.event_id IS NOT NULL AS is_live,
  l.t ->> 'treasury' AS treasury,
  (l.a ->> 'started')::boolean AS started,
  (l.a ->> 'opened')::boolean AS opened,
  l.a -> 'minters' AS minters,
  l.ledger_sequence AS launched_ledger,
  l.closed_at AS launched_at,
  l.transaction_hash AS launched_tx_hash
FROM manager.dao_modules m
LEFT JOIN LATERAL (
  SELECT x.* FROM chain.events x
  WHERE x.deployment_id = m.deployment_id
    AND x.contract_id = m.module_contract
    AND x.contract_role = m.module_role
    AND x.event_name = m.module_role || '_launched'
  ORDER BY x.pos, x.event_id
  LIMIT 1
) l ON true;

-- The DAO as the app lists it: registry, slug, launch state, token name and
-- symbol (constructor, then the latest rename), the current profile JSON
-- (highest ProfileUpdated seq; the app hashes it against the chain before
-- showing it), the current admin (launch admin, then the Treasury), and the
-- auction/marketplace state after launch.
CREATE VIEW manager.daos AS
SELECT
  r.deployment_id,
  r.dao_id,
  COALESCE(cs.topic_1, rq.a ->> 'slug') AS slug,
  cs.topic_1 IS NOT NULL AS slug_claimed,
  rq.a ->> 'slug' AS requested_slug,
  cs.topic_1 AS claimed_slug,
  r.token_address,
  r.deployer,
  r.launch_admin,
  r.manager_contract,
  r.token_contract,
  r.governor_contract,
  r.auction_contract,
  r.treasury_contract,
  r.metadata_contract,
  r.marketplace_contract,
  l.minter AS minter_contract,
  tm.a ->> 'name' AS token_name,
  tm.a ->> 'symbol' AS token_symbol,
  pf.a ->> 'profile' AS profile,
  pf.a ->> 'hash' AS profile_hash,
  (pf.t ->> 'seq')::bigint AS profile_seq,
  COALESCE(ta.t ->> 'new_admin', r.launch_admin) AS admin_address,
  CASE WHEN l.dao_id IS NULL THEN 'pending' ELSE 'operational' END AS status,
  CASE WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE l.launch_auction OR COALESCE(st.auction_reactivated, false) END AS auction_enabled,
  CASE WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE COALESCE(NOT st.marketplace_paused, l.launch_marketplace) END AS marketplace_enabled,
  CASE WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE COALESCE(st.auction_paused, NOT l.launch_auction) END AS auction_paused,
  r.created_ledger,
  r.created_at,
  r.created_tx_hash,
  l.launched_ledger,
  l.launched_at,
  l.launched_tx_hash,
  r.indexed_at
FROM manager.dao_registry r
LEFT JOIN manager.dao_launches l ON l.deployment_id = r.deployment_id AND l.dao_id = r.dao_id
-- The latest slug request (DaoCreated, then PendingSlugUpdated).
LEFT JOIN LATERAL (
  SELECT x.a FROM chain.events x
  WHERE x.deployment_id = r.deployment_id AND x.contract_role = 'manager'
    AND x.event_name IN ('dao_created', 'pending_slug_updated') AND x.topic_0 = r.dao_id
  ORDER BY x.pos DESC, x.event_id DESC LIMIT 1
) rq ON true
-- The slug held now: the launch claim, then the latest change (topic_1 in both).
LEFT JOIN LATERAL (
  SELECT x.topic_1 FROM chain.events x
  WHERE x.deployment_id = r.deployment_id AND x.contract_role = 'manager'
    AND x.event_name IN ('slug_claimed', 'slug_changed') AND x.topic_0 = r.dao_id
  ORDER BY x.pos DESC, x.event_id DESC LIMIT 1
) cs ON true
-- Name and symbol: TokenInitialized, then the latest MetadataUpdated.
LEFT JOIN LATERAL (
  SELECT x.a FROM chain.events x
  WHERE x.deployment_id = r.deployment_id AND x.contract_id = r.token_contract
    AND x.contract_role = 'token' AND x.event_name IN ('token_initialized', 'metadata_updated')
  ORDER BY x.pos DESC, x.event_id DESC LIMIT 1
) tm ON true
-- The token's latest admin handoff (the Treasury after launch).
LEFT JOIN LATERAL (
  SELECT x.t FROM chain.events x
  WHERE x.deployment_id = r.deployment_id AND x.contract_id = r.token_contract
    AND x.contract_role = 'token' AND x.event_name = 'admin_changed'
  ORDER BY x.pos DESC, x.event_id DESC LIMIT 1
) ta ON true
-- The current profile: the highest ProfileUpdated seq (CAS on chain, so unique).
LEFT JOIN LATERAL (
  SELECT x.t, x.a FROM chain.events x
  WHERE x.deployment_id = r.deployment_id AND x.contract_id = r.metadata_contract
    AND x.contract_role = 'metadata' AND x.event_name = 'profile_updated'
  ORDER BY (x.t ->> 'seq')::bigint DESC, x.pos DESC LIMIT 1
) pf ON true
-- Pause state after launch: the auction's OpenZeppelin paused/unpaused and the
-- marketplace's own marketplace_paused/unpaused, latest wins.
LEFT JOIN LATERAL (
  SELECT
    bool_or(x.event_name = 'unpaused') FILTER (WHERE x.contract_id = r.auction_contract) AS auction_reactivated,
    (array_agg(x.event_name = 'paused' ORDER BY x.pos DESC, x.event_id DESC)
      FILTER (WHERE x.contract_id = r.auction_contract))[1] AS auction_paused,
    (array_agg(x.event_name = 'marketplace_paused' ORDER BY x.pos DESC, x.event_id DESC)
      FILTER (WHERE x.contract_id = r.marketplace_contract))[1] AS marketplace_paused
  FROM chain.events x
  WHERE x.deployment_id = r.deployment_id
    AND x.contract_id IN (r.auction_contract, r.marketplace_contract)
    AND x.event_name IN ('paused', 'unpaused', 'marketplace_paused', 'marketplace_unpaused')
    AND x.pos > l.launched_pos
) st ON l.dao_id IS NOT NULL;

-- The implementation registry: every registered hash and whether it was revoked.
CREATE VIEW manager.implementations AS
SELECT
  e.event_id,
  e.deployment_id,
  e.contract_id AS manager_contract,
  e.a ->> 'name' AS name,
  e.a ->> 'version' AS version,
  e.topic_0 AS wasm_hash,
  (e.a ->> 'published_ledger')::bigint AS published_ledger,
  e.ledger_sequence AS event_ledger,
  e.closed_at AS event_at,
  e.transaction_hash,
  rv.event_id IS NOT NULL AS revoked,
  (rv.a ->> 'revoked_ledger')::bigint AS revoked_ledger
FROM chain.events e
LEFT JOIN LATERAL (
  SELECT x.event_id, x.a FROM chain.events x
  WHERE x.deployment_id = e.deployment_id AND x.contract_role = 'manager'
    AND x.event_name = 'implementation_revoked' AND x.topic_0 = e.topic_0 AND x.pos > e.pos
  ORDER BY x.pos DESC, x.event_id DESC LIMIT 1
) rv ON true
WHERE e.contract_role = 'manager'
  AND e.event_name = 'implementation_registered';

-- The code every DAO module runs, mirroring on-chain version():
--   current_hash     the latest upgraded.to_hash, else the hash from DaoCreated
--   current_version  the registry version of current_hash (what version() returns)
--   storage_version  the latest migrated.to_storage_version, else 1
CREATE VIEW manager.module_versions AS
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
  m.module_contract,
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

-- The Manager's own settings, one row per deployment: admin (ManagerInitialized,
-- then AdminChanged), the pending admin (an AdminProposed newer than the last
-- AdminChanged and the last AdminProposalCancelled), the platform Minter and
-- whether the factory is paused (the contract has no getter for it; a pause
-- blocks create_dao, launch_dao and change_slug for every DAO).
CREATE VIEW manager.settings AS
WITH latest AS (
  SELECT DISTINCT ON (deployment_id, kind)
    deployment_id, kind, event_name, t, pos, event_id
  FROM (
    SELECT e.*,
      CASE e.event_name
        WHEN 'manager_initialized' THEN 'admin'
        WHEN 'admin_changed' THEN 'admin'
        WHEN 'admin_proposed' THEN 'proposal'
        WHEN 'admin_proposal_cancelled' THEN 'cancel'
        WHEN 'platform_minter_set' THEN 'minter'
        ELSE 'factory'
      END AS kind
    FROM chain.events e
    WHERE e.contract_role = 'manager'
      AND e.event_name IN ('manager_initialized', 'admin_changed', 'admin_proposed', 'admin_proposal_cancelled',
        'platform_minter_set', 'factory_paused', 'factory_unpaused')
  ) k
  ORDER BY deployment_id, kind, pos DESC, event_id DESC
)
SELECT
  a.deployment_id,
  COALESCE(a.t ->> 'new_admin', a.t ->> 'admin') AS admin,
  CASE WHEN p.pos > a.pos AND (c.pos IS NULL OR p.pos > c.pos) THEN p.t ->> 'proposed_admin' END AS pending_admin,
  m.t ->> 'minter' AS platform_minter,
  COALESCE(f.event_name = 'factory_paused', false) AS factory_paused
FROM latest a
LEFT JOIN latest p ON p.deployment_id = a.deployment_id AND p.kind = 'proposal'
LEFT JOIN latest c ON c.deployment_id = a.deployment_id AND c.kind = 'cancel'
LEFT JOIN latest m ON m.deployment_id = a.deployment_id AND m.kind = 'minter'
LEFT JOIN latest f ON f.deployment_id = a.deployment_id AND f.kind = 'factory'
WHERE a.kind = 'admin';
