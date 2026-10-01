-- =============================================================================
-- MANAGER AUCTION REACTIVATION
--
-- `dao_launched.launch_auction` records the initial auction choice. A DAO can
-- transition from disabled to enabled by configuring and unpausing the auction
-- contract at any time after creation.
--
-- auction_enabled: was auction EVER enabled? (launch_auction=true OR unpaused occurred at any point)
-- auction_paused: is auction currently paused? (null if pending, true if paused/disabled, false if active)
--
-- Reactivation Logic:
-- - If initially disabled (launch_auction=false) but later unpaused, auction_enabled becomes true
-- - This allows DAOs to transition from disabled → configured → active at any time post-launch
-- =============================================================================

CREATE OR REPLACE VIEW manager.daos AS
WITH created AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.topic_0 AS token_address,
    e.topic_1 AS deployer,
    e.topic_2 AS launch_admin,
    e.contract_id AS manager_contract,
    e.args::jsonb #>> '{modules,token}' AS token_contract,
    e.args::jsonb #>> '{modules,governor}' AS governor_contract,
    e.args::jsonb #>> '{modules,auction}' AS auction_contract,
    e.args::jsonb #>> '{modules,treasury}' AS treasury_contract,
    e.args::jsonb #>> '{modules,metadata}' AS metadata_contract,
    e.args::jsonb #>> '{modules,marketplace}' AS marketplace_contract,
    e.ledger_sequence AS created_ledger,
    to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS created_at,
    e.transaction_hash AS created_tx_hash
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name IN ('dao_created', 'dao_registered')
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence, e.event_id
), launched AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.ledger_sequence AS launched_ledger,
    to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS launched_at,
    e.transaction_hash AS launched_tx_hash,
    (e.args::jsonb ->> 'launch_auction')::boolean AS auction_enabled,
    (e.args::jsonb ->> 'launch_marketplace')::boolean AS marketplace_enabled
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name = 'dao_launched'
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.event_id DESC
), auction_reactivated AS (
  SELECT DISTINCT
    c.deployment_id,
    c.dao_id
  FROM created c
  JOIN launched l USING (deployment_id, dao_id)
  JOIN chain.decoded_events e
    ON e.deployment_id = c.deployment_id
    AND e.contract_id = c.auction_contract
  WHERE e.contract_role = 'auction'
    AND e.event_name = 'unpaused'
    AND e.ledger_sequence > l.launched_ledger
), auction_current_pause_state AS (
  SELECT DISTINCT ON (c.deployment_id, c.dao_id)
    c.deployment_id,
    c.dao_id,
    e.event_name = 'paused' AS currently_paused
  FROM created c
  JOIN launched l USING (deployment_id, dao_id)
  JOIN chain.decoded_events e
    ON e.deployment_id = c.deployment_id
    AND e.contract_id = c.auction_contract
  WHERE e.contract_role = 'auction'
    AND e.event_name IN ('paused', 'unpaused')
    AND e.ledger_sequence > l.launched_ledger
  ORDER BY c.deployment_id, c.dao_id, e.ledger_sequence DESC, e.event_id DESC
), token_metadata AS (
  SELECT DISTINCT ON (e.deployment_id, e.contract_id)
    e.deployment_id,
    e.contract_id AS token_contract,
    e.args::jsonb ->> 'name' AS token_name,
    e.args::jsonb ->> 'symbol' AS token_symbol,
    e.args::jsonb ->> 'uri' AS token_uri,
    e.args::jsonb ->> 'description' AS token_description,
    e.args::jsonb ->> 'owner' AS admin_address
  FROM chain.decoded_events e
  WHERE e.contract_role = 'token'
    AND e.event_name = 'token_initialized'
  ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.event_id DESC
)
SELECT
  c.deployment_id,
  c.dao_id,
  c.token_address,
  c.deployer,
  c.launch_admin,
  c.manager_contract,
  c.token_contract,
  c.governor_contract,
  c.auction_contract,
  c.treasury_contract,
  c.metadata_contract,
  c.marketplace_contract,
  tm.token_name,
  tm.token_symbol,
  tm.token_description,
  tm.token_uri,
  tm.admin_address,
  CASE WHEN l.dao_id IS NULL THEN 'pending' ELSE 'operational' END AS status,
  CASE
    WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE COALESCE(l.auction_enabled, true) OR ar.dao_id IS NOT NULL
  END AS auction_enabled,
  CASE
    WHEN l.dao_id IS NULL THEN NULL::boolean
    ELSE COALESCE(l.marketplace_enabled, true)
  END AS marketplace_enabled,
  c.created_ledger,
  c.created_at,
  c.created_tx_hash,
  l.launched_ledger,
  l.launched_at,
  l.launched_tx_hash,
  NULL::timestamptz AS indexed_at,
  CASE
    WHEN l.dao_id IS NULL THEN NULL::boolean
    -- If auction has never been unpaused (no reactivation), it's paused (can't be active without unpause)
    WHEN ar.dao_id IS NULL AND COALESCE(l.auction_enabled, true) = false THEN true
    -- If auction was enabled at launch or has been unpaused, use current pause state
    WHEN ar.dao_id IS NOT NULL OR COALESCE(l.auction_enabled, true) = true THEN COALESCE(acps.currently_paused, false)
    ELSE true
  END AS auction_paused
FROM created c
LEFT JOIN launched l USING (deployment_id, dao_id)
LEFT JOIN auction_reactivated ar USING (deployment_id, dao_id)
LEFT JOIN auction_current_pause_state acps USING (deployment_id, dao_id)
LEFT JOIN token_metadata tm USING (deployment_id, token_contract);
