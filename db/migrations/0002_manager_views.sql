-- =============================================================================
-- MANAGER VIEWS
--
-- The Manager has no on-chain DAO registry we index from storage. The DAO
-- registry is a projection of DaoCreated / DaoLaunched events:
--
--   manager.dao_registry       one row per DAO, straight from DaoCreated
--   manager.dao_slugs          requested slug (DaoCreated / PendingSlugUpdated) and claimed slug (SlugClaimed)
--   manager.dao_modules        one row per DAO module contract
--   manager.event_identity     contract -> DAO lookup used by every domain view
--   manager.daos               registry + slug + token metadata + launch/auction state
--   manager.module_launches    one row per DAO module: has its `<module>_launched` event been seen
--   manager.dao_lifecycle      one row per DAO: launch flags + is_live per module
--   manager.module_admins      current admin of every DAO module (launch admin, then the Treasury)
--   manager.module_upgrades    per-module upgrade / version-sync / migration history
--   manager.module_versions    current wasm hash, version and storage version of every DAO module
--   manager.admin_history      AdminProposed / AdminProposalCancelled / AdminChanged / PlatformMinterSet
--   manager.settings           current admin, pending admin, platform minter
--   manager.implementations    registered WASM implementations (+ revocation)
--   manager.latest_implementations  admin-selected latest implementation per name
--   manager.current_implementations  latest default implementation set
--
-- A DAO is identified by its token contract address (dao_id). deployment_id
-- scopes everything to one Manager.
-- =============================================================================

-- DaoCreated: topics (token_address, deployer, launch_admin);
-- data { created_ledger, modules { token, metadata, auction, governor, treasury, marketplace },
--        wasm_hashes { token, metadata, auction, governor, treasury, marketplace }, slug }
--
-- DaoCreated.slug is only the slug *requested* at creation: several pending
-- DAOs may request the same one. A slug becomes the DAO's unique, permanent id
-- when launch_dao claims it (SlugClaimed); see manager.dao_slugs.
CREATE VIEW manager.dao_registry AS
SELECT DISTINCT ON (e.deployment_id, e.topic_0)
  e.deployment_id,
  e.topic_0                                   AS dao_id,
  e.topic_0                                   AS token_address,
  e.topic_1                                   AS deployer,
  e.topic_2                                   AS launch_admin,
  e.args::jsonb ->> 'slug'                    AS created_slug,
  e.contract_id                               AS manager_contract,
  e.args::jsonb #>> '{modules,token}'         AS token_contract,
  e.args::jsonb #>> '{modules,governor}'      AS governor_contract,
  e.args::jsonb #>> '{modules,auction}'       AS auction_contract,
  e.args::jsonb #>> '{modules,treasury}'      AS treasury_contract,
  e.args::jsonb #>> '{modules,metadata}'      AS metadata_contract,
  e.args::jsonb #>> '{modules,marketplace}'   AS marketplace_contract,
  e.args::jsonb #>> '{wasm_hashes,token}'       AS token_wasm_hash,
  e.args::jsonb #>> '{wasm_hashes,governor}'    AS governor_wasm_hash,
  e.args::jsonb #>> '{wasm_hashes,auction}'     AS auction_wasm_hash,
  e.args::jsonb #>> '{wasm_hashes,treasury}'    AS treasury_wasm_hash,
  e.args::jsonb #>> '{wasm_hashes,metadata}'    AS metadata_wasm_hash,
  e.args::jsonb #>> '{wasm_hashes,marketplace}' AS marketplace_wasm_hash,
  e.ledger_sequence                           AS created_ledger,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS created_at,
  e.transaction_hash                          AS created_tx_hash,
  e.ingested_at                               AS indexed_at
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'dao_created'
ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence, e.transaction_index,
  e.operation_index, e.event_index, e.event_id;

-- Slug state per DAO.
--   requested_slug  latest of DaoCreated.slug and PendingSlugUpdated.slug (not unique)
--   claimed_slug    SlugClaimed.slug, written by launch_dao; unique per deployment
--                   and permanent. NULL while the DAO is pending.
-- PendingSlugUpdated: topic token_address; data { slug }
-- SlugClaimed:        topics token_address, slug
CREATE VIEW manager.dao_slugs AS
WITH requested AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.args::jsonb ->> 'slug' AS requested_slug
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name IN ('dao_created', 'pending_slug_updated')
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST,
    e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
), claimed AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.topics::jsonb ->> 'slug' AS claimed_slug,
    e.ledger_sequence AS claimed_ledger,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS claimed_at
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name = 'slug_claimed'
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence, e.transaction_index NULLS LAST,
    e.operation_index NULLS LAST, e.event_index NULLS LAST, e.event_id
)
SELECT
  r.deployment_id,
  r.dao_id,
  q.requested_slug,
  c.claimed_slug,
  c.claimed_ledger,
  c.claimed_at
FROM manager.dao_registry r
LEFT JOIN requested q ON q.deployment_id = r.deployment_id AND q.dao_id = r.dao_id
LEFT JOIN claimed c ON c.deployment_id = r.deployment_id AND c.dao_id = r.dao_id;

CREATE VIEW manager.dao_modules AS
SELECT deployment_id, dao_id, 'token'::text AS module_role, token_contract AS module_contract
  FROM manager.dao_registry WHERE token_contract IS NOT NULL
UNION ALL
SELECT deployment_id, dao_id, 'metadata', metadata_contract
  FROM manager.dao_registry WHERE metadata_contract IS NOT NULL
UNION ALL
SELECT deployment_id, dao_id, 'auction', auction_contract
  FROM manager.dao_registry WHERE auction_contract IS NOT NULL
UNION ALL
SELECT deployment_id, dao_id, 'governor', governor_contract
  FROM manager.dao_registry WHERE governor_contract IS NOT NULL
UNION ALL
SELECT deployment_id, dao_id, 'treasury', treasury_contract
  FROM manager.dao_registry WHERE treasury_contract IS NOT NULL
UNION ALL
SELECT deployment_id, dao_id, 'marketplace', marketplace_contract
  FROM manager.dao_registry WHERE marketplace_contract IS NOT NULL;

-- Every module contract belongs to exactly one DAO. Domain views join this on
-- (deployment_id, contract_id) to resolve the tenant; the Manager itself and
-- the shared Minter are deliberately absent (they are not owned by one DAO).
CREATE VIEW manager.event_identity AS
SELECT deployment_id, module_contract AS contract_id, dao_id, module_role, module_contract
FROM manager.dao_modules;

-- Registry + slug + token metadata + lifecycle state.
--   slug             the claimed slug once launched, else the requested slug
--   slug_claimed     true once launch_dao claimed the slug (only then is it unique)
--   status           'pending' until DaoLaunched, then 'operational'
--   auction_enabled  launch_auction at launch, or true once the auction has been
--                    unpaused after launch (an initially disabled auction can be
--                    configured and enabled later)
--   auction_paused   latest Paused/Unpaused after launch; before any such event
--                    the auction is paused unless it was launched enabled
CREATE VIEW manager.daos AS
WITH launched AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.ledger_sequence AS launched_ledger,
    e.transaction_index AS launched_transaction_index,
    e.operation_index AS launched_operation_index,
    e.event_index AS launched_event_index,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS launched_at,
    e.transaction_hash AS launched_tx_hash,
    COALESCE((e.args::jsonb ->> 'launch_auction')::boolean, true) AS launch_auction,
    COALESCE((e.args::jsonb ->> 'launch_marketplace')::boolean, true) AS launch_marketplace
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name = 'dao_launched'
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.transaction_index DESC,
    e.operation_index DESC, e.event_index DESC, e.event_id DESC
), auction_state AS (
  SELECT
    r.deployment_id,
    r.dao_id,
    bool_or(e.event_name = 'unpaused') AS reactivated,
    (array_agg(e.event_name = 'paused' ORDER BY e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST,
      e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC))[1] AS paused
  FROM manager.dao_registry r
  JOIN launched l ON l.deployment_id = r.deployment_id AND l.dao_id = r.dao_id
  JOIN chain.decoded_events e
    ON e.deployment_id = r.deployment_id
   AND e.contract_id = r.auction_contract
  WHERE e.contract_role = 'auction'
    AND e.event_name IN ('paused', 'unpaused')
    AND chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)
      > chain.event_position(l.launched_ledger, l.launched_transaction_index, l.launched_operation_index, l.launched_event_index)
  GROUP BY r.deployment_id, r.dao_id
), token_init AS (
  -- TokenInitialized: topic admin (the launch admin); data { uri, name, symbol, version }
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id AS token_contract,
    e.topic_0 AS admin_address,
    e.args::jsonb ->> 'name' AS token_name,
    e.args::jsonb ->> 'symbol' AS token_symbol,
    e.args::jsonb ->> 'uri' AS token_uri
  FROM chain.decoded_events e
  WHERE e.contract_role = 'token'
    AND e.event_name = 'token_initialized'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC,
    e.operation_index DESC, e.event_index DESC, e.event_id DESC
), dao_description AS (
  -- The DAO description lives in the metadata contract: initial value, then updates.
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id AS metadata_contract,
    CASE e.event_name
      WHEN 'description_updated' THEN e.args::jsonb ->> 'new_description'
      ELSE e.args::jsonb ->> 'description'
    END AS description
  FROM chain.decoded_events e
  WHERE e.contract_role = 'metadata'
    AND e.event_name IN ('metadata_initialized', 'description_updated')
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC,
    e.operation_index DESC, e.event_index DESC, e.event_id DESC
)
SELECT
  r.deployment_id,
  r.dao_id,
  COALESCE(s.claimed_slug, s.requested_slug) AS slug,
  s.claimed_slug IS NOT NULL AS slug_claimed,
  s.requested_slug,
  s.claimed_slug,
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
  t.token_name,
  t.token_symbol,
  d.description AS token_description,
  t.token_uri,
  t.admin_address,
  CASE WHEN l.dao_id IS NULL THEN 'pending' ELSE 'operational' END AS status,
  CASE WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE l.launch_auction OR COALESCE(a.reactivated, false) END AS auction_enabled,
  CASE WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE l.launch_marketplace END AS marketplace_enabled,
  CASE WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE COALESCE(a.paused, NOT l.launch_auction) END AS auction_paused,
  r.created_ledger,
  r.created_at,
  r.created_tx_hash,
  l.launched_ledger,
  l.launched_at,
  l.launched_tx_hash,
  r.indexed_at
FROM manager.dao_registry r
LEFT JOIN manager.dao_slugs s ON s.deployment_id = r.deployment_id AND s.dao_id = r.dao_id
LEFT JOIN launched l ON l.deployment_id = r.deployment_id AND l.dao_id = r.dao_id
LEFT JOIN auction_state a ON a.deployment_id = r.deployment_id AND a.dao_id = r.dao_id
LEFT JOIN token_init t ON t.deployment_id = r.deployment_id AND t.token_contract = r.token_contract
LEFT JOIN dao_description d ON d.deployment_id = r.deployment_id AND d.metadata_contract = r.metadata_contract;

-- ImplementationRegistered: topic wasm_hash; data { name, version, published_ledger }
-- ImplementationRevoked:    topic wasm_hash; data { revoked_ledger }
CREATE VIEW manager.implementations AS
SELECT
  e.event_id,
  e.deployment_id,
  e.contract_id AS manager_contract,
  e.args::jsonb ->> 'name' AS name,
  e.args::jsonb ->> 'version' AS version,
  e.topic_0 AS wasm_hash,
  (e.args::jsonb ->> 'published_ledger')::bigint AS published_ledger,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash,
  r.event_id IS NOT NULL AS revoked,
  (r.args::jsonb ->> 'revoked_ledger')::bigint AS revoked_ledger
FROM chain.decoded_events e
LEFT JOIN LATERAL (
  SELECT x.event_id, x.args
  FROM chain.decoded_events x
  WHERE x.deployment_id = e.deployment_id
    AND x.contract_role = 'manager'
    AND x.event_name = 'implementation_revoked'
    AND x.topic_0 = e.topic_0
    AND chain.event_position(x.ledger_sequence, x.transaction_index, x.operation_index, x.event_index)
      > chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)
  ORDER BY x.ledger_sequence DESC, x.transaction_index DESC NULLS LAST,
    x.operation_index DESC NULLS LAST, x.event_index DESC NULLS LAST, x.event_id DESC
  LIMIT 1
) r ON true
WHERE e.contract_role = 'manager'
  AND e.event_name = 'implementation_registered';

-- Admin-selected latest implementation per name (registration no longer moves it).
-- LatestImplementationSet: topics name, wasm_hash; data { version }
CREATE VIEW manager.latest_implementations AS
SELECT DISTINCT ON (e.deployment_id, e.topics::jsonb ->> 'name')
  e.deployment_id,
  e.topics::jsonb ->> 'name' AS name,
  e.topics::jsonb ->> 'wasm_hash' AS wasm_hash,
  e.args::jsonb ->> 'version' AS version,
  e.ledger_sequence AS set_ledger,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS set_at,
  e.transaction_hash
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'latest_implementation_set'
ORDER BY e.deployment_id, e.topics::jsonb ->> 'name', e.ledger_sequence DESC, e.transaction_index DESC,
  e.operation_index DESC, e.event_index DESC, e.event_id DESC;

-- CurrentImplementationsUpdated: data { token, metadata, auction, governor, treasury, marketplace } (wasm hashes)
CREATE VIEW manager.current_implementations AS
SELECT DISTINCT ON (e.deployment_id)
  e.deployment_id,
  e.args::jsonb ->> 'token' AS token_impl,
  e.args::jsonb ->> 'metadata' AS metadata_impl,
  e.args::jsonb ->> 'auction' AS auction_impl,
  e.args::jsonb ->> 'governor' AS governor_impl,
  e.args::jsonb ->> 'treasury' AS treasury_impl,
  e.args::jsonb ->> 'marketplace' AS marketplace_impl,
  e.ledger_sequence AS updated_ledger,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS updated_at,
  e.transaction_hash
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'current_implementations_updated'
ORDER BY e.deployment_id, e.ledger_sequence DESC, e.transaction_index DESC,
  e.operation_index DESC, e.event_index DESC, e.event_id DESC;

-- Every module emits its own launch event when the Manager launches it
-- (Setup -> Live), named after the module and keyed by the emitting contract:
--   token_launched        topic treasury; data { minters[] }
--   auction_launched      topic treasury; data { started }
--   marketplace_launched  topic treasury; data { opened }
--   governor_launched / treasury_launched / metadata_launched  topic treasury; no data
-- A module without its launch row is simply is_live = false.
CREATE VIEW manager.module_launches AS
SELECT
  m.deployment_id,
  m.dao_id,
  m.module_role,
  m.module_contract,
  l.event_id IS NOT NULL AS is_live,
  l.topics::jsonb ->> 'treasury' AS treasury,
  (l.args::jsonb ->> 'started')::boolean AS started,
  (l.args::jsonb ->> 'opened')::boolean AS opened,
  l.args::jsonb -> 'minters' AS minters,
  l.ledger_sequence AS launched_ledger,
  chain.ledger_closed_at_ts(l.ledger_closed_at) AS launched_at,
  l.transaction_hash AS launched_tx_hash
FROM manager.dao_modules m
LEFT JOIN LATERAL (
  SELECT x.*
  FROM chain.decoded_events x
  WHERE x.deployment_id = m.deployment_id
    AND x.contract_id = m.module_contract
    AND x.event_name = m.module_role || '_launched'
    AND x.contract_role = m.module_role
  ORDER BY x.ledger_sequence, x.transaction_index NULLS LAST, x.operation_index NULLS LAST,
    x.event_index NULLS LAST, x.event_id
  LIMIT 1
) l ON true;

-- One row per DAO: the launch choices recorded by DaoLaunched plus the live
-- flag of every module. `is_live` is true once all six modules have launched.
-- `minter_enabled` is DaoLaunched.enable_minter: the admin-registered platform
-- minter was granted mint authority at launch (see token.mint_authority_history).
CREATE VIEW manager.dao_lifecycle AS
WITH launched AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.ledger_sequence AS launched_ledger,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS launched_at,
    e.transaction_hash AS launched_tx_hash,
    COALESCE((e.args::jsonb ->> 'launch_auction')::boolean, true) AS launch_auction,
    COALESCE((e.args::jsonb ->> 'launch_marketplace')::boolean, true) AS launch_marketplace,
    COALESCE((e.args::jsonb ->> 'enable_minter')::boolean, false) AS enable_minter
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name = 'dao_launched'
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.transaction_index DESC,
    e.operation_index DESC, e.event_index DESC, e.event_id DESC
), modules AS (
  SELECT
    deployment_id, dao_id,
    bool_or(is_live) FILTER (WHERE module_role = 'token') AS token_live,
    bool_or(is_live) FILTER (WHERE module_role = 'governor') AS governor_live,
    bool_or(is_live) FILTER (WHERE module_role = 'treasury') AS treasury_live,
    bool_or(is_live) FILTER (WHERE module_role = 'auction') AS auction_live,
    bool_or(is_live) FILTER (WHERE module_role = 'marketplace') AS marketplace_live,
    bool_or(is_live) FILTER (WHERE module_role = 'metadata') AS metadata_live,
    bool_and(is_live) AS all_live,
    bool_or(started) FILTER (WHERE module_role = 'auction') AS auction_started,
    bool_or(opened) FILTER (WHERE module_role = 'marketplace') AS marketplace_opened
  FROM manager.module_launches
  GROUP BY deployment_id, dao_id
)
SELECT
  r.deployment_id,
  r.dao_id,
  CASE WHEN l.dao_id IS NULL THEN 'pending' ELSE 'operational' END AS status,
  COALESCE(m.all_live, false) AS is_live,
  COALESCE(m.token_live, false) AS token_live,
  COALESCE(m.governor_live, false) AS governor_live,
  COALESCE(m.treasury_live, false) AS treasury_live,
  COALESCE(m.auction_live, false) AS auction_live,
  COALESCE(m.marketplace_live, false) AS marketplace_live,
  COALESCE(m.metadata_live, false) AS metadata_live,
  l.launch_auction,
  l.launch_marketplace,
  l.enable_minter AS minter_enabled,
  m.auction_started,
  m.marketplace_opened,
  l.launched_ledger,
  l.launched_at,
  l.launched_tx_hash
FROM manager.dao_registry r
LEFT JOIN launched l ON l.deployment_id = r.deployment_id AND l.dao_id = r.dao_id
LEFT JOIN modules m ON m.deployment_id = r.deployment_id AND m.dao_id = r.dao_id;

-- Current admin of every DAO module. Each module starts with the DAO's launch
-- admin (TokenInitialized etc. carry it; DaoCreated names it) and hands its
-- admin to the Treasury at launch (contracts/common/src/admin.rs):
--   admin_changed  topics old_admin, new_admin   (emitted by the module itself)
-- There is no other admin change: no transfer, two-step handover or renounce.
CREATE VIEW manager.module_admins AS
SELECT
  m.deployment_id,
  m.dao_id,
  m.module_role,
  m.module_contract,
  COALESCE(a.topics::jsonb ->> 'new_admin', r.launch_admin) AS admin,
  a.event_id IS NOT NULL AS handed_to_treasury,
  a.ledger_sequence AS changed_ledger,
  chain.ledger_closed_at_ts(a.ledger_closed_at) AS changed_at,
  a.transaction_hash AS changed_tx_hash
FROM manager.dao_modules m
JOIN manager.dao_registry r ON r.deployment_id = m.deployment_id AND r.dao_id = m.dao_id
LEFT JOIN LATERAL (
  SELECT x.*
  FROM chain.decoded_events x
  WHERE x.deployment_id = m.deployment_id
    AND x.contract_id = m.module_contract
    AND x.contract_role = m.module_role
    AND x.event_name = 'admin_changed'
  ORDER BY x.ledger_sequence DESC, x.transaction_index DESC NULLS LAST, x.operation_index DESC NULLS LAST,
    x.event_index DESC NULLS LAST, x.event_id DESC
  LIMIT 1
) a ON true;

-- Module upgrade history. Every module (token, governor, treasury, auction,
-- marketplace, metadata) emits, from the shared upgrade flow:
--   upgraded        topics from_hash, to_hash; data { version }
--   version_synced  data { version }   (version re-read from the registry; hash unchanged)
--   migrated        data { from_storage_version, to_storage_version }   (storage layout migrated)
-- Rows are keyed by the emitting contract, resolved to a DAO through
-- manager.event_identity. `event_type` is the event name; columns that do not
-- apply to an event are NULL. Order by `event_seq`.
CREATE VIEW manager.module_upgrades AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  i.module_role,
  e.contract_id,
  e.event_name AS event_type,
  e.topics::jsonb ->> 'from_hash' AS from_hash,
  e.topics::jsonb ->> 'to_hash' AS to_hash,
  e.args::jsonb ->> 'version' AS version,
  (e.args::jsonb ->> 'from_storage_version')::integer AS from_storage_version,
  (e.args::jsonb ->> 'to_storage_version')::integer AS to_storage_version,
  chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index) AS event_seq,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = i.module_role
  AND e.event_name IN ('upgraded', 'version_synced', 'migrated');

-- Current implementation of every DAO module (one row per module contract).
--   current_hash     latest Upgraded.to_hash, else the hash from DaoCreated.wasm_hashes
--   current_version  version of the latest Upgraded / VersionSynced; NULL if none seen
--   storage_version  to_storage_version of the latest Migrated; 1 (every module's
--                    initial layout) if the module never migrated
--   upgrade_count    number of Upgraded events
--   last_upgraded_*  the latest Upgraded event (NULL if never upgraded)
CREATE VIEW manager.module_versions AS
SELECT
  m.deployment_id,
  m.dao_id,
  m.module_role,
  m.module_contract,
  COALESCE(u.to_hash,
    CASE m.module_role
      WHEN 'token' THEN r.token_wasm_hash
      WHEN 'governor' THEN r.governor_wasm_hash
      WHEN 'auction' THEN r.auction_wasm_hash
      WHEN 'treasury' THEN r.treasury_wasm_hash
      WHEN 'metadata' THEN r.metadata_wasm_hash
      WHEN 'marketplace' THEN r.marketplace_wasm_hash
    END) AS current_hash,
  v.version AS current_version,
  v.event_at AS version_updated_at,
  COALESCE(s.to_storage_version, 1) AS storage_version,
  COALESCE(c.upgrade_count, 0) AS upgrade_count,
  u.from_hash AS last_upgraded_from_hash,
  u.event_ledger AS last_upgraded_ledger,
  u.event_at AS last_upgraded_at,
  u.transaction_hash AS last_upgraded_tx_hash
FROM manager.dao_modules m
JOIN manager.dao_registry r ON r.deployment_id = m.deployment_id AND r.dao_id = m.dao_id
LEFT JOIN LATERAL (
  SELECT x.* FROM manager.module_upgrades x
  WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id
    AND x.contract_id = m.module_contract AND x.event_type = 'upgraded'
  ORDER BY x.event_seq DESC, x.event_id DESC LIMIT 1
) u ON true
LEFT JOIN LATERAL (
  SELECT x.* FROM manager.module_upgrades x
  WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id
    AND x.contract_id = m.module_contract AND x.event_type IN ('upgraded', 'version_synced')
  ORDER BY x.event_seq DESC, x.event_id DESC LIMIT 1
) v ON true
LEFT JOIN LATERAL (
  SELECT x.* FROM manager.module_upgrades x
  WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id
    AND x.contract_id = m.module_contract AND x.event_type = 'migrated'
  ORDER BY x.event_seq DESC, x.event_id DESC LIMIT 1
) s ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS upgrade_count FROM manager.module_upgrades x
  WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id
    AND x.contract_id = m.module_contract AND x.event_type = 'upgraded'
) c ON true;

-- Manager admin history, deployment-wide (no DAO). Module admin handoffs share
-- the admin_changed name but are emitted by modules (see manager.module_admins).
--   admin_proposed     topics current_admin, proposed_admin
--   admin_proposal_cancelled  topics current_admin, cancelled_admin
--   admin_changed      topics old_admin, new_admin
--   platform_minter_set  topic minter
-- previous_admin / new_admin are filled for the two admin events (a proposal
-- reports current -> proposed; a cancellation reports current -> cancelled);
-- platform_minter only for platform_minter_set.
CREATE VIEW manager.admin_history AS
SELECT
  e.event_id,
  e.deployment_id,
  e.contract_id AS manager_contract,
  e.event_name AS event_type,
  COALESCE(e.topics::jsonb ->> 'current_admin', e.topics::jsonb ->> 'old_admin') AS previous_admin,
  COALESCE(e.topics::jsonb ->> 'proposed_admin', e.topics::jsonb ->> 'cancelled_admin',
    e.topics::jsonb ->> 'new_admin') AS new_admin,
  e.topics::jsonb ->> 'minter' AS platform_minter,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND e.event_name IN ('admin_proposed', 'admin_proposal_cancelled', 'admin_changed', 'platform_minter_set');

-- Current Manager settings: admin (ManagerInitialized, then AdminChanged),
-- pending admin (an AdminProposed newer than both the last AdminChanged and the
-- last AdminProposalCancelled; NULL after an accept or a cancel) and the
-- platform minter. One row per deployment.
CREATE VIEW manager.settings AS
WITH ordered AS (
  SELECT e.*, chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index) AS pos
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name IN ('manager_initialized', 'admin_proposed', 'admin_proposal_cancelled', 'admin_changed', 'platform_minter_set')
), admin AS (
  SELECT DISTINCT ON (deployment_id)
    deployment_id,
    CASE event_name WHEN 'admin_changed' THEN topics::jsonb ->> 'new_admin' ELSE topics::jsonb ->> 'admin' END AS admin,
    pos AS admin_pos
  FROM ordered
  WHERE event_name IN ('manager_initialized', 'admin_changed')
  ORDER BY deployment_id, ledger_sequence DESC, transaction_index DESC NULLS LAST,
    operation_index DESC NULLS LAST, event_index DESC NULLS LAST, event_id DESC
), proposal AS (
  SELECT DISTINCT ON (deployment_id)
    deployment_id, topics::jsonb ->> 'proposed_admin' AS pending_admin, pos AS proposal_pos
  FROM ordered
  WHERE event_name = 'admin_proposed'
  ORDER BY deployment_id, ledger_sequence DESC, transaction_index DESC NULLS LAST,
    operation_index DESC NULLS LAST, event_index DESC NULLS LAST, event_id DESC
), cancel AS (
  SELECT DISTINCT ON (deployment_id) deployment_id, pos AS cancel_pos
  FROM ordered
  WHERE event_name = 'admin_proposal_cancelled'
  ORDER BY deployment_id, ledger_sequence DESC, transaction_index DESC NULLS LAST,
    operation_index DESC NULLS LAST, event_index DESC NULLS LAST, event_id DESC
), minter AS (
  SELECT DISTINCT ON (deployment_id)
    deployment_id, topics::jsonb ->> 'minter' AS platform_minter
  FROM ordered
  WHERE event_name = 'platform_minter_set'
  ORDER BY deployment_id, ledger_sequence DESC, transaction_index DESC NULLS LAST,
    operation_index DESC NULLS LAST, event_index DESC NULLS LAST, event_id DESC
)
SELECT
  a.deployment_id,
  a.admin,
  CASE WHEN p.proposal_pos > a.admin_pos
        AND (c.cancel_pos IS NULL OR p.proposal_pos > c.cancel_pos)
    THEN p.pending_admin END AS pending_admin,
  m.platform_minter
FROM admin a
LEFT JOIN proposal p ON p.deployment_id = a.deployment_id
LEFT JOIN cancel c ON c.deployment_id = a.deployment_id
LEFT JOIN minter m ON m.deployment_id = a.deployment_id;
