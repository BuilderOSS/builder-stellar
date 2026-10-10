-- =============================================================================
-- METADATA VIEWS
--
-- Source events (metadata contract):
--   metadata_initialized topic token;  data { renderer_base, version, admin, project_uri, description, contract_image }
--   property_added       topic property_id (u32); data { name }
--   properties_reset     data { old_num_properties }   invalidates earlier property_added events
--   seed_generated       topic token_id (u32);     data { num_properties, selections[] }
--                        emitted at mint and again by regenerate(token_id): several rows per token,
--                        the latest is the current seed (is_current)
--   metadata_launched    topic treasury (see manager.module_launches)
--   admin_changed        topics old_admin, new_admin (launch handoff; see manager.module_admins)
--   project_uri_updated / description_updated / contract_image_updated / renderer_base_updated
--                        data { old_*, new_* }
-- =============================================================================

-- Properties currently defined (those added after the latest reset).
CREATE VIEW metadata.properties AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id AS metadata_contract,
  (e.topics::jsonb ->> 'property_id')::integer AS property_id,
  e.args::jsonb ->> 'name' AS name,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'metadata'
  AND e.event_name = 'property_added'
  AND NOT EXISTS (
    SELECT 1
    FROM chain.decoded_events r
    WHERE r.deployment_id = e.deployment_id
      AND r.contract_id = e.contract_id
      AND r.contract_role = 'metadata'
      AND r.event_name = 'properties_reset'
      AND chain.event_position(r.ledger_sequence, r.transaction_index, r.operation_index, r.event_index)
        > chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)
  );

-- Artwork seed per token: seed_generated (single mint and regenerate) and
-- seeds_generated (one per batch_mint, selections[i] belongs to token
-- first_token_id + i). Batch rows share their source event_id. is_current
-- marks the latest seed per token across both.
CREATE VIEW metadata.token_seeds AS
WITH seeds AS (
  SELECT
    e.event_id,
    e.deployment_id,
    e.contract_id,
    (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
    (e.args::jsonb ->> 'num_properties')::integer AS num_properties,
    e.args::jsonb -> 'selections' AS selections,
    e.ledger_sequence,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    e.ledger_closed_at,
    e.transaction_hash
  FROM chain.decoded_events e
  WHERE e.contract_role = 'metadata'
    AND e.event_name = 'seed_generated'
  UNION ALL
  SELECT
    e.event_id,
    e.deployment_id,
    e.contract_id,
    (e.topics::jsonb ->> 'first_token_id')::bigint + s.ord - 1 AS token_id,
    (e.args::jsonb ->> 'num_properties')::integer AS num_properties,
    s.selection AS selections,
    e.ledger_sequence,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    e.ledger_closed_at,
    e.transaction_hash
  FROM chain.decoded_events e
  CROSS JOIN LATERAL jsonb_array_elements(e.args::jsonb -> 'selections') WITH ORDINALITY AS s(selection, ord)
  WHERE e.contract_role = 'metadata'
    AND e.event_name = 'seeds_generated'
)
SELECT
  s.event_id,
  s.deployment_id,
  i.dao_id,
  s.contract_id AS metadata_contract,
  s.token_id,
  s.num_properties,
  s.selections,
  row_number() OVER (
    PARTITION BY s.deployment_id, s.contract_id, s.token_id
    ORDER BY s.ledger_sequence DESC, s.transaction_index DESC NULLS LAST,
      s.operation_index DESC NULLS LAST, s.event_index DESC NULLS LAST, s.event_id DESC
  ) = 1 AS is_current,
  s.ledger_sequence AS event_ledger,
  extract(epoch FROM chain.ledger_closed_at_ts(s.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(s.ledger_closed_at) AS event_at,
  s.transaction_hash
FROM seeds s
JOIN manager.event_identity i ON i.deployment_id = s.deployment_id AND i.contract_id = s.contract_id;

-- Current configuration: the initial values overlaid with the latest update of
-- each field. `admin` is the metadata module's current admin (the launch admin,
-- then the Treasury).
CREATE VIEW metadata.configuration AS
WITH initialized AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    i.dao_id,
    e.contract_id AS metadata_contract,
    e.topic_0 AS token_contract,
    e.args::jsonb ->> 'renderer_base' AS renderer_base,
    e.args::jsonb ->> 'version' AS version,
    e.args::jsonb ->> 'admin' AS initial_admin,
    e.args::jsonb ->> 'project_uri' AS project_uri,
    e.args::jsonb ->> 'description' AS description,
    e.args::jsonb ->> 'contract_image' AS contract_image,
    e.ledger_sequence AS init_ledger,
    chain.ledger_closed_at_ts(e.ledger_closed_at) AS init_at,
    e.transaction_hash AS init_transaction_hash
  FROM chain.decoded_events e
  JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'metadata'
    AND e.event_name = 'metadata_initialized'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST,
    e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
), latest_update AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id, e.event_name)
    e.deployment_id, e.contract_id, e.event_name, e.args
  FROM chain.decoded_events e
  WHERE e.contract_role = 'metadata'
    AND e.event_name IN ('project_uri_updated', 'description_updated', 'contract_image_updated', 'renderer_base_updated')
  ORDER BY e.deployment_id, e.contract_id, e.event_name, e.ledger_sequence DESC,
    e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST,
    e.event_index DESC NULLS LAST, e.event_id DESC
), updates AS (
  SELECT
    deployment_id,
    contract_id,
    max(args::jsonb ->> 'new_uri') FILTER (WHERE event_name = 'project_uri_updated') AS project_uri,
    max(args::jsonb ->> 'new_description') FILTER (WHERE event_name = 'description_updated') AS description,
    max(args::jsonb ->> 'new_image') FILTER (WHERE event_name = 'contract_image_updated') AS contract_image,
    max(args::jsonb ->> 'new_base') FILTER (WHERE event_name = 'renderer_base_updated') AS renderer_base
  FROM latest_update
  GROUP BY deployment_id, contract_id
)
SELECT
  i.deployment_id,
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
LEFT JOIN manager.module_admins a
  ON a.deployment_id = i.deployment_id AND a.module_contract = i.metadata_contract AND a.module_role = 'metadata';
