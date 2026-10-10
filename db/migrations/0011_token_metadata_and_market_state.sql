-- =============================================================================
-- 0011: token renames and market reopen/close reach manager.daos
--
-- * token 0.2.0 emits MetadataUpdated { name, symbol, uri } from set_metadata;
--   token_name / token_symbol / token_uri now follow the latest of
--   token_initialized and metadata_updated (previously creation-time only).
-- * marketplace_enabled follows the latest marketplace_paused / _unpaused
--   after launch (previously the launch choice only), like auction_enabled.
--
-- Same columns, same order: CREATE OR REPLACE keeps dependent views intact.
-- =============================================================================

CREATE OR REPLACE VIEW manager.daos AS
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
  -- Name, symbol and URI: the constructor's values, then the latest rename
  -- (MetadataUpdated, token 0.2.0+).
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id AS token_contract,
    e.args::jsonb ->> 'name' AS token_name,
    e.args::jsonb ->> 'symbol' AS token_symbol,
    e.args::jsonb ->> 'uri' AS token_uri
  FROM chain.decoded_events e
  WHERE e.contract_role = 'token'
    AND e.event_name IN ('token_initialized', 'metadata_updated')
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC,
    e.operation_index DESC, e.event_index DESC, e.event_id DESC
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
  tm.token_name,
  tm.token_symbol,
  d.description AS token_description,
  tm.token_uri,
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
LEFT JOIN dao_description d ON d.deployment_id = r.deployment_id AND d.metadata_contract = r.metadata_contract;
