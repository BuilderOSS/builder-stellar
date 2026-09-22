-- =============================================================================
-- MANAGER DERIVED VIEWS
--
-- DAO state is derived in PostgreSQL from immutable decoded events. Goldsky only
-- ingests chain.raw_events and chain.decoded_events.
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW manager.daos AS
WITH created AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.topic_0 AS token_address,
    e.topic_1 AS creator,
    e.contract_id AS manager_contract,
    e.args #>> '{modules,token}' AS token_contract,
    e.args #>> '{modules,governor}' AS governor_contract,
    e.args #>> '{modules,auction}' AS auction_contract,
    e.args #>> '{modules,treasury}' AS treasury_contract,
    e.args #>> '{modules,metadata}' AS metadata_contract,
    e.ledger_sequence AS created_ledger,
    to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS created_at,
    e.transaction_hash AS created_tx_hash
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name IN ('dao_created', 'dao_registered')
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence, e.event_id
), finalized AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.ledger_sequence AS finalized_ledger,
    to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS finalized_at,
    e.transaction_hash AS finalized_tx_hash
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name = 'dao_finalized'
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.event_id DESC
), token_metadata AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id AS token_contract,
    e.args ->> 'name' AS token_name,
    e.args ->> 'symbol' AS token_symbol,
    e.args ->> 'uri' AS token_uri,
    e.args ->> 'description' AS token_description,
    e.args ->> 'owner' AS admin_address
  FROM chain.decoded_events e
  WHERE e.contract_role = 'token'
    AND e.event_name = 'token_initialized'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.event_id DESC
)
SELECT
  c.deployment_id,
  c.dao_id,
  c.token_address,
  c.creator,
  c.manager_contract,
  c.token_contract,
  c.governor_contract,
  c.auction_contract,
  c.treasury_contract,
  c.metadata_contract,
  tm.token_name,
  tm.token_symbol,
  tm.token_description,
  tm.token_uri,
  tm.admin_address,
  CASE WHEN f.dao_id IS NULL THEN 'pending' ELSE 'operational' END AS status,
  c.created_ledger,
  c.created_at,
  c.created_tx_hash,
  f.finalized_ledger,
  f.finalized_at,
  f.finalized_tx_hash,
  NULL::timestamptz AS indexed_at
FROM created c
LEFT JOIN finalized f USING (deployment_id, dao_id)
LEFT JOIN token_metadata tm USING (deployment_id, token_contract);

CREATE OR REPLACE VIEW manager.dao_modules AS
SELECT deployment_id, dao_id, 'token'::text AS module_role, token_address AS module_contract FROM manager.daos
UNION ALL SELECT deployment_id, dao_id, 'auction', auction_contract FROM manager.daos WHERE auction_contract IS NOT NULL
UNION ALL SELECT deployment_id, dao_id, 'metadata', metadata_contract FROM manager.daos WHERE metadata_contract IS NOT NULL
UNION ALL SELECT deployment_id, dao_id, 'governor', governor_contract FROM manager.daos WHERE governor_contract IS NOT NULL
UNION ALL SELECT deployment_id, dao_id, 'treasury', treasury_contract FROM manager.daos WHERE treasury_contract IS NOT NULL;

CREATE OR REPLACE VIEW manager.event_identity AS
SELECT e.deployment_id, e.contract_id,
  CASE WHEN e.contract_role = 'manager' THEN NULL ELSE m.dao_id END AS dao_id,
  m.module_role, m.module_contract
FROM chain.decoded_events e
LEFT JOIN manager.dao_modules m ON m.deployment_id = e.deployment_id AND m.module_contract = e.contract_id;

COMMIT;
