-- =============================================================================
-- 0014: storage diet (docs/STORAGE_DIET.md § 8)
--
-- Contracts 0.3.0 (fresh redeploy, no migration of old events):
-- * Metadata stores only a hash and seq of the DAO profile; the profile JSON is
--   event-only: ProfileUpdated { topic seq; data hash, profile }. Construction
--   emits seq 0. project_uri / description / contract_image and their update
--   events are gone. MetadataInitialized carries { renderer_base, admin }.
-- * Token events carry no URI (token_uri is built on chain): TokenInitialized
--   { name, symbol }, MetadataUpdated { name, symbol }.
-- * No module stores or emits its version: VersionSynced is gone, and the
--   *Initialized events carry no version. A module's version is the registry
--   version of its running hash (ImplementationRegistered).
-- * DaoLaunched.minter (the pinned shared Minter) replaces enable_minter.
-- * The Minter is merkle-only: MerkleRootSetEvent { root, round, tree_uri };
--   the allowlist events are gone.
--
-- Views whose columns change are dropped and recreated (CREATE OR REPLACE
-- cannot drop columns); none has dependents outside this file.
-- =============================================================================

DROP VIEW manager.daos;
DROP VIEW metadata.configuration;
DROP VIEW manager.dao_lifecycle;
DROP VIEW manager.module_versions;
DROP VIEW manager.module_upgrades;
DROP VIEW minter.allocation_updates;
DROP VIEW minter.allowlist_claim_events;

-- -----------------------------------------------------------------------------
-- metadata.profiles: the current profile of every Metadata contract.
--   ProfileUpdated  topic seq; data { hash, profile }
-- The highest seq wins (seq increases by one per accepted update, CAS-checked on
-- chain). `profile` is the JSON string byte-for-byte as emitted; the app hashes
-- it and compares with metadata.profile_hash() before showing it.
-- -----------------------------------------------------------------------------
CREATE VIEW metadata.profiles AS
SELECT DISTINCT ON (e.deployment_id, e.contract_id)
  e.deployment_id,
  i.dao_id,
  e.contract_id AS metadata_contract,
  (e.topics::jsonb ->> 'seq')::bigint AS profile_seq,
  e.args::jsonb ->> 'hash' AS profile_hash,
  e.args::jsonb ->> 'profile' AS profile,
  e.ledger_sequence AS updated_ledger,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS updated_at,
  e.transaction_hash AS updated_tx_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'metadata'
  AND e.event_name = 'profile_updated'
ORDER BY e.deployment_id, e.contract_id, (e.topics::jsonb ->> 'seq')::bigint DESC,
  e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST,
  e.event_index DESC NULLS LAST, e.event_id DESC;

-- -----------------------------------------------------------------------------
-- metadata.configuration: renderer base (initial, then latest update) and the
-- module's current admin. The profile lives in metadata.profiles.
-- -----------------------------------------------------------------------------
CREATE VIEW metadata.configuration AS
WITH initialized AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    i.dao_id,
    e.contract_id AS metadata_contract,
    e.topic_0 AS token_contract,
    e.args::jsonb ->> 'renderer_base' AS renderer_base,
    e.args::jsonb ->> 'admin' AS initial_admin,
    e.ledger_sequence AS init_ledger,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS init_at,
    e.transaction_hash AS init_transaction_hash
  FROM chain.decoded_events e
  JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'metadata'
    AND e.event_name = 'metadata_initialized'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST,
    e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
), renderer AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id, e.contract_id, e.args::jsonb ->> 'new_base' AS renderer_base
  FROM chain.decoded_events e
  WHERE e.contract_role = 'metadata'
    AND e.event_name = 'renderer_base_updated'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC,
    e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST,
    e.event_index DESC NULLS LAST, e.event_id DESC
)
SELECT
  i.deployment_id,
  i.dao_id,
  i.metadata_contract,
  i.token_contract,
  COALESCE(r.renderer_base, i.renderer_base) AS renderer_base,
  COALESCE(a.admin, i.initial_admin) AS admin,
  i.init_ledger,
  i.init_at,
  i.init_transaction_hash
FROM initialized i
LEFT JOIN renderer r ON r.deployment_id = i.deployment_id AND r.contract_id = i.metadata_contract
LEFT JOIN manager.module_admins a
  ON a.deployment_id = i.deployment_id AND a.module_contract = i.metadata_contract AND a.module_role = 'metadata';

-- -----------------------------------------------------------------------------
-- manager.daos: as in 0011, with the profile (metadata.profiles) in place of
-- token_description, no token_uri (built on chain), and the pinned Minter.
-- -----------------------------------------------------------------------------
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
    COALESCE((e.args::jsonb ->> 'launch_marketplace')::boolean, true) AS launch_marketplace,
    e.args::jsonb ->> 'minter' AS minter
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
), marketplace_state AS (
  -- Latest pause/unpause after launch: a market reopened (or closed) by vote.
  SELECT
    r.deployment_id,
    r.dao_id,
    (array_agg(e.event_name = 'marketplace_paused' ORDER BY e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST,
      e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC))[1] AS paused
  FROM manager.dao_registry r
  JOIN launched l ON l.deployment_id = r.deployment_id AND l.dao_id = r.dao_id
  JOIN chain.decoded_events e
    ON e.deployment_id = r.deployment_id
   AND e.contract_id = r.marketplace_contract
  WHERE e.contract_role = 'marketplace'
    AND e.event_name IN ('marketplace_paused', 'marketplace_unpaused')
    AND chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)
      > chain.event_position(l.launched_ledger, l.launched_transaction_index, l.launched_operation_index, l.launched_event_index)
  GROUP BY r.deployment_id, r.dao_id
), token_meta AS (
  -- Name and symbol: the constructor's values, then the latest rename (MetadataUpdated).
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id AS token_contract,
    e.args::jsonb ->> 'name' AS token_name,
    e.args::jsonb ->> 'symbol' AS token_symbol
  FROM chain.decoded_events e
  WHERE e.contract_role = 'token'
    AND e.event_name IN ('token_initialized', 'metadata_updated')
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC,
    e.operation_index DESC, e.event_index DESC, e.event_id DESC
), token_init AS (
  -- TokenInitialized: topic admin (the launch admin); data { name, symbol }
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id AS token_contract,
    e.topic_0 AS admin_address
  FROM chain.decoded_events e
  WHERE e.contract_role = 'token'
    AND e.event_name = 'token_initialized'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC,
    e.operation_index DESC, e.event_index DESC, e.event_id DESC
), token_admin AS (
  -- Current token admin: the latest module admin_changed (the launch handoff to
  -- the Treasury), else the constructor admin from token_initialized.
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id AS token_contract,
    e.topics::jsonb ->> 'new_admin' AS admin
  FROM chain.decoded_events e
  WHERE e.contract_role = 'token'
    AND e.event_name = 'admin_changed'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST,
    e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
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
  l.minter AS minter_contract,
  tm.token_name,
  tm.token_symbol,
  p.profile,
  p.profile_hash,
  p.profile_seq,
  -- The DAO's current admin (launch admin during setup, the Treasury after launch).
  COALESCE(ta.admin, t.admin_address, r.launch_admin) AS admin_address,
  CASE WHEN l.dao_id IS NULL THEN 'pending' ELSE 'operational' END AS status,
  CASE WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE l.launch_auction OR COALESCE(a.reactivated, false) END AS auction_enabled,
  CASE WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE COALESCE(NOT ms.paused, l.launch_marketplace) END AS marketplace_enabled,
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
LEFT JOIN marketplace_state ms ON ms.deployment_id = r.deployment_id AND ms.dao_id = r.dao_id
LEFT JOIN token_init t ON t.deployment_id = r.deployment_id AND t.token_contract = r.token_contract
LEFT JOIN token_meta tm ON tm.deployment_id = r.deployment_id AND tm.token_contract = r.token_contract
LEFT JOIN token_admin ta ON ta.deployment_id = r.deployment_id AND ta.token_contract = r.token_contract
LEFT JOIN metadata.profiles p ON p.deployment_id = r.deployment_id AND p.metadata_contract = r.metadata_contract;

-- -----------------------------------------------------------------------------
-- manager.dao_lifecycle: as in 0002, with the pinned Minter (DaoLaunched.minter)
-- in place of the enable_minter flag. Every DAO launches with the shared Minter.
-- -----------------------------------------------------------------------------
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
    e.args::jsonb ->> 'minter' AS minter
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
  l.minter,
  m.auction_started,
  m.marketplace_opened,
  l.launched_ledger,
  l.launched_at,
  l.launched_tx_hash
FROM manager.dao_registry r
LEFT JOIN launched l ON l.deployment_id = r.deployment_id AND l.dao_id = r.dao_id
LEFT JOIN modules m ON m.deployment_id = r.deployment_id AND m.dao_id = r.dao_id;

-- -----------------------------------------------------------------------------
-- Module upgrade history (every module, from contracts/common):
--   upgraded  topics from_hash, to_hash; data { version }
--   migrated  data { from_storage_version, to_storage_version }
-- -----------------------------------------------------------------------------
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
  AND e.event_name IN ('upgraded', 'migrated');

-- -----------------------------------------------------------------------------
-- Current implementation of every DAO module, mirroring on-chain version():
--   current_hash     latest Upgraded.to_hash, else the hash from DaoCreated.wasm_hashes
--   current_version  the registry version of current_hash (ImplementationRegistered,
--                    manager.implementations); what the module's version() returns
-- -----------------------------------------------------------------------------
CREATE VIEW manager.module_versions AS
WITH modules AS (
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
    COALESCE(u.event_at, r.created_at) AS version_updated_at,
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
      AND x.contract_id = m.module_contract AND x.event_type = 'migrated'
    ORDER BY x.event_seq DESC, x.event_id DESC LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS upgrade_count FROM manager.module_upgrades x
    WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id
      AND x.contract_id = m.module_contract AND x.event_type = 'upgraded'
  ) c ON true
)
SELECT
  mo.deployment_id,
  mo.dao_id,
  mo.module_role,
  mo.module_contract,
  mo.current_hash,
  impl.version AS current_version,
  mo.version_updated_at,
  mo.storage_version,
  mo.upgrade_count,
  mo.last_upgraded_from_hash,
  mo.last_upgraded_ledger,
  mo.last_upgraded_at,
  mo.last_upgraded_tx_hash
FROM modules mo
LEFT JOIN LATERAL (
  SELECT x.version FROM manager.implementations x
  WHERE x.deployment_id = mo.deployment_id AND x.wasm_hash = mo.current_hash
  LIMIT 1
) impl ON true;

-- -----------------------------------------------------------------------------
-- Minter claim rounds (merkle-only):
--   merkle_root_set_event  topic token_id; data { root, round, tree_uri }
-- tree_uri points to the full tree (builder-stellar-merkle-v1); consumers
-- recompute the root from it before offering a claim.
-- -----------------------------------------------------------------------------
CREATE VIEW minter.allocation_updates AS
SELECT
  e.event_id,
  e.deployment_id,
  r.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'token_id' AS token_id,
  'merkle'::text AS allocation_type,
  e.args::jsonb ->> 'root' AS merkle_root,
  (e.args::jsonb ->> 'round')::integer AS round,
  e.args::jsonb ->> 'tree_uri' AS tree_uri,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
WHERE e.contract_role = 'minter'
  AND e.event_name = 'merkle_root_set_event';

-- -----------------------------------------------------------------------------
-- governance.settings: same columns as 0004; `version` is now the registry
-- version of the governor's running hash (GovernorInitialized has none).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW governance.settings AS
WITH initialized AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id,
    e.topic_0 AS initial_admin,
    (e.args::jsonb ->> 'voting_delay')::bigint AS voting_delay,
    (e.args::jsonb ->> 'voting_period')::bigint AS voting_period,
    (e.args::jsonb ->> 'queue_delay')::bigint AS queue_delay,
    (e.args::jsonb ->> 'proposal_threshold')::numeric AS proposal_threshold,
    (e.args::jsonb ->> 'quorum_bps')::integer AS quorum_bps,
    e.ledger_sequence AS init_ledger,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS init_at
  FROM chain.decoded_events e
  WHERE e.contract_role = 'governor'
    AND e.event_name = 'governor_initialized'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.event_id DESC
), latest AS (
  -- Latest value per (governor, event): new_value for the setters, new_admin
  -- for the launch handoff.
  SELECT DISTINCT ON (e.deployment_id, e.contract_id, e.event_name)
    e.deployment_id,
    e.contract_id,
    e.event_name,
    COALESCE(e.args::jsonb ->> 'new_value', e.topics::jsonb ->> 'new_admin') AS value,
    e.ledger_sequence
  FROM chain.decoded_events e
  WHERE e.contract_role = 'governor'
    AND e.event_name IN ('voting_delay_changed', 'voting_period_changed', 'queue_delay_changed',
      'proposal_threshold_changed', 'quorum_bps_changed', 'admin_changed')
  ORDER BY e.deployment_id, e.contract_id, e.event_name, e.ledger_sequence DESC,
    e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST,
    e.event_index DESC NULLS LAST, e.event_id DESC
), overlay AS (
  SELECT
    deployment_id,
    contract_id,
    max(value) FILTER (WHERE event_name = 'voting_delay_changed') AS voting_delay,
    max(value) FILTER (WHERE event_name = 'voting_period_changed') AS voting_period,
    max(value) FILTER (WHERE event_name = 'queue_delay_changed') AS queue_delay,
    max(value) FILTER (WHERE event_name = 'proposal_threshold_changed') AS proposal_threshold,
    max(value) FILTER (WHERE event_name = 'quorum_bps_changed') AS quorum_bps,
    max(value) FILTER (WHERE event_name = 'admin_changed') AS admin,
    max(ledger_sequence) FILTER (WHERE event_name <> 'admin_changed') AS updated_ledger
  FROM latest
  GROUP BY deployment_id, contract_id
)
SELECT
  i.deployment_id,
  ident.dao_id,
  i.contract_id AS governor_contract,
  COALESCE(o.admin, i.initial_admin) AS admin,
  COALESCE(o.voting_delay::bigint, i.voting_delay) AS voting_delay_seconds,
  COALESCE(o.voting_period::bigint, i.voting_period) AS voting_period_seconds,
  COALESCE(o.queue_delay::bigint, i.queue_delay) AS queue_delay_seconds,
  COALESCE(o.proposal_threshold::numeric, i.proposal_threshold) AS proposal_threshold,
  COALESCE(o.quorum_bps::integer, i.quorum_bps) AS quorum_bps,
  mv.current_version AS version,
  i.init_ledger,
  i.init_at,
  o.updated_ledger
FROM initialized i
JOIN manager.event_identity ident ON ident.deployment_id = i.deployment_id AND ident.contract_id = i.contract_id
LEFT JOIN overlay o ON o.deployment_id = i.deployment_id AND o.contract_id = i.contract_id
LEFT JOIN manager.module_versions mv ON mv.deployment_id = i.deployment_id AND mv.module_contract = i.contract_id;
