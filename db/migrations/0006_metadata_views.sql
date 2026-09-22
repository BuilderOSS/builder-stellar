-- =============================================================================
-- METADATA VIEWS MIGRATION
--
-- Creates views for:
-- - Metadata properties
-- - Metadata token seeds
-- - Metadata configuration
-- =============================================================================


-- Metadata: Properties
CREATE OR REPLACE VIEW metadata.properties AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id AS metadata_contract,
  (e.topic_0)::integer AS property_id,
  e.args::jsonb ->> 'name' AS name,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'metadata'
  AND e.event_name = 'property_added';

-- Metadata: Token seeds
CREATE OR REPLACE VIEW metadata.token_seeds AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id AS metadata_contract,
  (e.topic_0)::bigint AS token_id,
  (e.args::jsonb ->> 'num_properties')::integer AS num_properties,
  e.args::jsonb -> 'selections' AS selections,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'metadata'
  AND e.event_name = 'seed_generated';

-- Metadata: Configuration
CREATE OR REPLACE VIEW metadata.configuration AS
WITH initialized AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    i.dao_id,
    e.contract_id AS metadata_contract,
    e.topic_0 AS token_contract,
    e.args::jsonb ->> 'renderer_base' AS renderer_base,
    e.ledger_sequence AS init_ledger,
    to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS init_at,
    e.transaction_hash AS init_transaction_hash
  FROM chain.decoded_events e
  JOIN manager.event_identity i USING (deployment_id, contract_id)
  WHERE e.contract_role = 'metadata'
    AND e.event_name = 'metadata_initialized'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.event_id DESC
),
latest_updates AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id, e.event_name)
    e.deployment_id,
    e.contract_id,
    e.event_name,
    e.args,
    e.ledger_sequence,
    e.event_id
  FROM chain.decoded_events e
  WHERE e.contract_role = 'metadata'
    AND e.event_name IN (
      'project_uri_updated',
      'description_updated',
      'contract_image_updated',
      'renderer_base_updated'
    )
  ORDER BY e.deployment_id, e.contract_id, e.event_name, e.ledger_sequence DESC, e.event_id DESC
),
updates AS (
  SELECT
    deployment_id,
    contract_id,
    max(args ->> 'new_uri') FILTER (WHERE event_name = 'project_uri_updated') AS project_uri,
    max(args ->> 'new_description') FILTER (WHERE event_name = 'description_updated') AS description,
    max(args ->> 'new_image') FILTER (WHERE event_name = 'contract_image_updated') AS contract_image,
    max(args ->> 'new_base') FILTER (WHERE event_name = 'renderer_base_updated') AS updated_renderer_base
  FROM latest_updates
  GROUP BY deployment_id, contract_id
)
SELECT
  i.deployment_id,
  i.dao_id,
  i.metadata_contract,
  i.token_contract,
  COALESCE(u.updated_renderer_base, i.renderer_base) AS renderer_base,
  u.project_uri,
  u.description,
  u.contract_image,
  i.init_ledger,
  i.init_at,
  i.init_transaction_hash
FROM initialized i
LEFT JOIN updates u ON u.deployment_id = i.deployment_id AND u.contract_id = i.metadata_contract;

