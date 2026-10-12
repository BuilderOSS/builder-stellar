-- Restore the views 0014 replaced, exactly as 0002/0006/0009/0011 left them (dumped with pg_get_viewdef).
-- governance.settings first: it depends on manager.module_versions until restored (0004 text).
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
    e.args::jsonb ->> 'version' AS version,
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
  i.version,
  i.init_ledger,
  i.init_at,
  o.updated_ledger
FROM initialized i
JOIN manager.event_identity ident ON ident.deployment_id = i.deployment_id AND ident.contract_id = i.contract_id
LEFT JOIN overlay o ON o.deployment_id = i.deployment_id AND o.contract_id = i.contract_id;

DROP VIEW IF EXISTS manager.daos;
DROP VIEW IF EXISTS metadata.profiles;
DROP VIEW IF EXISTS minter.allocation_updates;
DROP VIEW IF EXISTS manager.module_versions;
DROP VIEW IF EXISTS manager.module_upgrades;
DROP VIEW IF EXISTS manager.dao_lifecycle;
DROP VIEW IF EXISTS metadata.configuration;

CREATE VIEW manager.daos AS
 WITH launched AS (
         SELECT DISTINCT ON (e.deployment_id, e.topic_0) e.deployment_id,
            e.topic_0 AS dao_id,
            e.ledger_sequence AS launched_ledger,
            e.transaction_index AS launched_transaction_index,
            e.operation_index AS launched_operation_index,
            e.event_index AS launched_event_index,
            chain.ledger_closed_at_ts(e.ledger_closed_at) AS launched_at,
            e.transaction_hash AS launched_tx_hash,
            COALESCE((e.args::jsonb ->> 'launch_auction'::text)::boolean, true) AS launch_auction,
            COALESCE((e.args::jsonb ->> 'launch_marketplace'::text)::boolean, true) AS launch_marketplace
           FROM chain.decoded_events e
          WHERE e.contract_role = 'manager'::text AND e.event_name = 'dao_launched'::text
          ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC, e.event_id DESC
        ), auction_state AS (
         SELECT r_1.deployment_id,
            r_1.dao_id,
            bool_or(e.event_name = 'unpaused'::text) AS reactivated,
            (array_agg(e.event_name = 'paused'::text ORDER BY e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC))[1] AS paused
           FROM manager.dao_registry r_1
             JOIN launched l_1 ON l_1.deployment_id = r_1.deployment_id AND l_1.dao_id = r_1.dao_id
             JOIN chain.decoded_events e ON e.deployment_id = r_1.deployment_id AND e.contract_id = r_1.auction_contract
          WHERE e.contract_role = 'auction'::text AND (e.event_name = ANY (ARRAY['paused'::text, 'unpaused'::text])) AND chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index) > chain.event_position(l_1.launched_ledger, l_1.launched_transaction_index, l_1.launched_operation_index, l_1.launched_event_index)
          GROUP BY r_1.deployment_id, r_1.dao_id
        ), marketplace_state AS (
         SELECT r_1.deployment_id,
            r_1.dao_id,
            (array_agg(e.event_name = 'marketplace_paused'::text ORDER BY e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC))[1] AS paused
           FROM manager.dao_registry r_1
             JOIN launched l_1 ON l_1.deployment_id = r_1.deployment_id AND l_1.dao_id = r_1.dao_id
             JOIN chain.decoded_events e ON e.deployment_id = r_1.deployment_id AND e.contract_id = r_1.marketplace_contract
          WHERE e.contract_role = 'marketplace'::text AND (e.event_name = ANY (ARRAY['marketplace_paused'::text, 'marketplace_unpaused'::text])) AND chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index) > chain.event_position(l_1.launched_ledger, l_1.launched_transaction_index, l_1.launched_operation_index, l_1.launched_event_index)
          GROUP BY r_1.deployment_id, r_1.dao_id
        ), token_meta AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id) e.deployment_id,
            e.contract_id AS token_contract,
            e.args::jsonb ->> 'name'::text AS token_name,
            e.args::jsonb ->> 'symbol'::text AS token_symbol,
            e.args::jsonb ->> 'uri'::text AS token_uri
           FROM chain.decoded_events e
          WHERE e.contract_role = 'token'::text AND (e.event_name = ANY (ARRAY['token_initialized'::text, 'metadata_updated'::text]))
          ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC, e.event_id DESC
        ), token_init AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id) e.deployment_id,
            e.contract_id AS token_contract,
            e.topic_0 AS admin_address,
            e.args::jsonb ->> 'name'::text AS token_name,
            e.args::jsonb ->> 'symbol'::text AS token_symbol,
            e.args::jsonb ->> 'uri'::text AS token_uri
           FROM chain.decoded_events e
          WHERE e.contract_role = 'token'::text AND e.event_name = 'token_initialized'::text
          ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC, e.event_id DESC
        ), token_admin AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id) e.deployment_id,
            e.contract_id AS token_contract,
            e.topics::jsonb ->> 'new_admin'::text AS admin
           FROM chain.decoded_events e
          WHERE e.contract_role = 'token'::text AND e.event_name = 'admin_changed'::text
          ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
        ), dao_description AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id) e.deployment_id,
            e.contract_id AS metadata_contract,
                CASE e.event_name
                    WHEN 'description_updated'::text THEN e.args::jsonb ->> 'new_description'::text
                    ELSE e.args::jsonb ->> 'description'::text
                END AS description
           FROM chain.decoded_events e
          WHERE e.contract_role = 'metadata'::text AND (e.event_name = ANY (ARRAY['metadata_initialized'::text, 'description_updated'::text]))
          ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC, e.event_id DESC
        )
 SELECT r.deployment_id,
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
    tm.token_name,
    tm.token_symbol,
    d.description AS token_description,
    tm.token_uri,
    COALESCE(ta.admin, t.admin_address, r.launch_admin) AS admin_address,
        CASE
            WHEN l.dao_id IS NULL THEN 'pending'::text
            ELSE 'operational'::text
        END AS status,
        CASE
            WHEN l.dao_id IS NULL THEN NULL::boolean
            ELSE l.launch_auction OR COALESCE(a.reactivated, false)
        END AS auction_enabled,
        CASE
            WHEN l.dao_id IS NULL THEN NULL::boolean
            ELSE COALESCE(NOT ms.paused, l.launch_marketplace)
        END AS marketplace_enabled,
        CASE
            WHEN l.dao_id IS NULL THEN NULL::boolean
            ELSE COALESCE(a.paused, NOT l.launch_auction)
        END AS auction_paused,
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
     LEFT JOIN dao_description d ON d.deployment_id = r.deployment_id AND d.metadata_contract = r.metadata_contract;

CREATE VIEW metadata.configuration AS
 WITH initialized AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id) e.deployment_id,
            i_1.dao_id,
            e.contract_id AS metadata_contract,
            e.topic_0 AS token_contract,
            e.args::jsonb ->> 'renderer_base'::text AS renderer_base,
            e.args::jsonb ->> 'version'::text AS version,
            e.args::jsonb ->> 'admin'::text AS initial_admin,
            e.args::jsonb ->> 'project_uri'::text AS project_uri,
            e.args::jsonb ->> 'description'::text AS description,
            e.args::jsonb ->> 'contract_image'::text AS contract_image,
            e.ledger_sequence AS init_ledger,
            chain.ledger_closed_at_ts(e.ledger_closed_at) AS init_at,
            e.transaction_hash AS init_transaction_hash
           FROM chain.decoded_events e
             JOIN manager.event_identity i_1 ON i_1.deployment_id = e.deployment_id AND i_1.contract_id = e.contract_id
          WHERE e.contract_role = 'metadata'::text AND e.event_name = 'metadata_initialized'::text
          ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
        ), latest_update AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id, e.event_name) e.deployment_id,
            e.contract_id,
            e.event_name,
            e.args
           FROM chain.decoded_events e
          WHERE e.contract_role = 'metadata'::text AND (e.event_name = ANY (ARRAY['project_uri_updated'::text, 'description_updated'::text, 'contract_image_updated'::text, 'renderer_base_updated'::text]))
          ORDER BY e.deployment_id, e.contract_id, e.event_name, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
        ), updates AS (
         SELECT latest_update.deployment_id,
            latest_update.contract_id,
            max(latest_update.args::jsonb ->> 'new_uri'::text) FILTER (WHERE latest_update.event_name = 'project_uri_updated'::text) AS project_uri,
            max(latest_update.args::jsonb ->> 'new_description'::text) FILTER (WHERE latest_update.event_name = 'description_updated'::text) AS description,
            max(latest_update.args::jsonb ->> 'new_image'::text) FILTER (WHERE latest_update.event_name = 'contract_image_updated'::text) AS contract_image,
            max(latest_update.args::jsonb ->> 'new_base'::text) FILTER (WHERE latest_update.event_name = 'renderer_base_updated'::text) AS renderer_base
           FROM latest_update
          GROUP BY latest_update.deployment_id, latest_update.contract_id
        )
 SELECT i.deployment_id,
    i.dao_id,
    i.metadata_contract,
    i.token_contract,
    COALESCE(u.renderer_base, i.renderer_base) AS renderer_base,
    i.version,
    COALESCE(a.admin, i.initial_admin) AS admin,
    COALESCE(u.project_uri, i.project_uri) AS project_uri,
    COALESCE(u.description, i.description) AS description,
    COALESCE(u.contract_image, i.contract_image) AS contract_image,
    i.init_ledger,
    i.init_at,
    i.init_transaction_hash
   FROM initialized i
     LEFT JOIN updates u ON u.deployment_id = i.deployment_id AND u.contract_id = i.metadata_contract
     LEFT JOIN manager.module_admins a ON a.deployment_id = i.deployment_id AND a.module_contract = i.metadata_contract AND a.module_role = 'metadata'::text;

CREATE VIEW manager.dao_lifecycle AS
 WITH launched AS (
         SELECT DISTINCT ON (e.deployment_id, e.topic_0) e.deployment_id,
            e.topic_0 AS dao_id,
            e.ledger_sequence AS launched_ledger,
            chain.ledger_closed_at_ts(e.ledger_closed_at) AS launched_at,
            e.transaction_hash AS launched_tx_hash,
            COALESCE((e.args::jsonb ->> 'launch_auction'::text)::boolean, true) AS launch_auction,
            COALESCE((e.args::jsonb ->> 'launch_marketplace'::text)::boolean, true) AS launch_marketplace,
            COALESCE((e.args::jsonb ->> 'enable_minter'::text)::boolean, false) AS enable_minter
           FROM chain.decoded_events e
          WHERE e.contract_role = 'manager'::text AND e.event_name = 'dao_launched'::text
          ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC, e.event_id DESC
        ), modules AS (
         SELECT module_launches.deployment_id,
            module_launches.dao_id,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'token'::text) AS token_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'governor'::text) AS governor_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'treasury'::text) AS treasury_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'auction'::text) AS auction_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'marketplace'::text) AS marketplace_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'metadata'::text) AS metadata_live,
            bool_and(module_launches.is_live) AS all_live,
            bool_or(module_launches.started) FILTER (WHERE module_launches.module_role = 'auction'::text) AS auction_started,
            bool_or(module_launches.opened) FILTER (WHERE module_launches.module_role = 'marketplace'::text) AS marketplace_opened
           FROM manager.module_launches
          GROUP BY module_launches.deployment_id, module_launches.dao_id
        )
 SELECT r.deployment_id,
    r.dao_id,
        CASE
            WHEN l.dao_id IS NULL THEN 'pending'::text
            ELSE 'operational'::text
        END AS status,
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

CREATE VIEW manager.module_upgrades AS
 SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    i.module_role,
    e.contract_id,
    e.event_name AS event_type,
    e.topics::jsonb ->> 'from_hash'::text AS from_hash,
    e.topics::jsonb ->> 'to_hash'::text AS to_hash,
    e.args::jsonb ->> 'version'::text AS version,
    (e.args::jsonb ->> 'from_storage_version'::text)::integer AS from_storage_version,
    (e.args::jsonb ->> 'to_storage_version'::text)::integer AS to_storage_version,
    chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index) AS event_seq,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = i.module_role AND (e.event_name = ANY (ARRAY['upgraded'::text, 'version_synced'::text, 'migrated'::text]));

CREATE VIEW manager.module_versions AS
 SELECT m.deployment_id,
    m.dao_id,
    m.module_role,
    m.module_contract,
    COALESCE(u.to_hash,
        CASE m.module_role
            WHEN 'token'::text THEN r.token_wasm_hash
            WHEN 'governor'::text THEN r.governor_wasm_hash
            WHEN 'auction'::text THEN r.auction_wasm_hash
            WHEN 'treasury'::text THEN r.treasury_wasm_hash
            WHEN 'metadata'::text THEN r.metadata_wasm_hash
            WHEN 'marketplace'::text THEN r.marketplace_wasm_hash
            ELSE NULL::text
        END) AS current_hash,
    v.version AS current_version,
    v.event_at AS version_updated_at,
    COALESCE(s.to_storage_version, 1) AS storage_version,
    COALESCE(c.upgrade_count, 0::bigint) AS upgrade_count,
    u.from_hash AS last_upgraded_from_hash,
    u.event_ledger AS last_upgraded_ledger,
    u.event_at AS last_upgraded_at,
    u.transaction_hash AS last_upgraded_tx_hash
   FROM manager.dao_modules m
     JOIN manager.dao_registry r ON r.deployment_id = m.deployment_id AND r.dao_id = m.dao_id
     LEFT JOIN LATERAL ( SELECT x.event_id,
            x.deployment_id,
            x.dao_id,
            x.module_role,
            x.contract_id,
            x.event_type,
            x.from_hash,
            x.to_hash,
            x.version,
            x.from_storage_version,
            x.to_storage_version,
            x.event_seq,
            x.event_ledger,
            x.transaction_index,
            x.operation_index,
            x.event_index,
            x.event_at,
            x.transaction_hash
           FROM manager.module_upgrades x
          WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id AND x.contract_id = m.module_contract AND x.event_type = 'upgraded'::text
          ORDER BY x.event_seq DESC, x.event_id DESC
         LIMIT 1) u ON true
     LEFT JOIN LATERAL ( SELECT x.event_id,
            x.deployment_id,
            x.dao_id,
            x.module_role,
            x.contract_id,
            x.event_type,
            x.from_hash,
            x.to_hash,
            x.version,
            x.from_storage_version,
            x.to_storage_version,
            x.event_seq,
            x.event_ledger,
            x.transaction_index,
            x.operation_index,
            x.event_index,
            x.event_at,
            x.transaction_hash
           FROM manager.module_upgrades x
          WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id AND x.contract_id = m.module_contract AND (x.event_type = ANY (ARRAY['upgraded'::text, 'version_synced'::text]))
          ORDER BY x.event_seq DESC, x.event_id DESC
         LIMIT 1) v ON true
     LEFT JOIN LATERAL ( SELECT x.event_id,
            x.deployment_id,
            x.dao_id,
            x.module_role,
            x.contract_id,
            x.event_type,
            x.from_hash,
            x.to_hash,
            x.version,
            x.from_storage_version,
            x.to_storage_version,
            x.event_seq,
            x.event_ledger,
            x.transaction_index,
            x.operation_index,
            x.event_index,
            x.event_at,
            x.transaction_hash
           FROM manager.module_upgrades x
          WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id AND x.contract_id = m.module_contract AND x.event_type = 'migrated'::text
          ORDER BY x.event_seq DESC, x.event_id DESC
         LIMIT 1) s ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS upgrade_count
           FROM manager.module_upgrades x
          WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id AND x.contract_id = m.module_contract AND x.event_type = 'upgraded'::text) c ON true;

CREATE VIEW minter.allowlist_claim_events AS
 SELECT e.event_id,
    e.deployment_id,
    r.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'token_id'::text AS token_id,
    e.topics::jsonb ->> 'recipient'::text AS recipient,
    ((e.args::jsonb ->> 'amount'::text))::numeric(78,0) AS amount,
    e.ledger_sequence,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
  WHERE e.contract_role = 'minter'::text AND e.event_name = 'allowlist_claim_event'::text;

CREATE VIEW minter.allocation_updates AS
 SELECT e.event_id,
    e.deployment_id,
    r.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'token_id'::text AS token_id,
        CASE e.event_name
            WHEN 'merkle_root_set_event'::text THEN 'merkle'::text
            ELSE 'allowlist'::text
        END AS allocation_type,
    (e.args::jsonb ->> 'member_count'::text)::integer AS member_count,
    e.ledger_sequence,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
  WHERE e.contract_role = 'minter'::text AND (e.event_name = ANY (ARRAY['merkle_root_set_event'::text, 'allowlist_set_event'::text]));

