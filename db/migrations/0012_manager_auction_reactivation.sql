-- =============================================================================
-- MANAGER AUCTION REACTIVATION
--
-- `dao_finalized.launch_auction` records the initial auction choice. A DAO that
-- started with auctions disabled can later be enabled by unpausing its auction
-- contract, so manager.daos must also account for a later Unpaused event.
--
-- auction_enabled: was auction ever enabled? (launch_auction=true OR unpaused occurred)
-- auction_paused: is auction currently paused? (disabled DAOs are treated as paused)
-- =============================================================================

CREATE OR REPLACE VIEW manager.daos AS
WITH created AS (
  SELECT DISTINCT ON (e.deployment_id, e.topic_0)
    e.deployment_id,
    e.topic_0 AS dao_id,
    e.topic_0 AS token_address,
    e.topic_1 AS creator,
    e.contract_id AS manager_contract,
    e.args::jsonb #>> '{modules,token}' AS token_contract,
    e.args::jsonb #>> '{modules,governor}' AS governor_contract,
    e.args::jsonb #>> '{modules,auction}' AS auction_contract,
    e.args::jsonb #>> '{modules,treasury}' AS treasury_contract,
    e.args::jsonb #>> '{modules,metadata}' AS metadata_contract,
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
    e.transaction_hash AS finalized_tx_hash,
    (e.args::jsonb ->> 'launch_auction')::boolean AS auction_enabled
  FROM chain.decoded_events e
  WHERE e.contract_role = 'manager'
    AND e.event_name = 'dao_finalized'
  ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.event_id DESC
), auction_reactivated AS (
  SELECT DISTINCT
    c.deployment_id,
    c.dao_id
  FROM created c
  JOIN finalized f USING (deployment_id, dao_id)
  JOIN chain.decoded_events e
    ON e.deployment_id = c.deployment_id
    AND e.contract_id = c.auction_contract
  WHERE e.contract_role = 'auction'
    AND e.event_name = 'unpaused'
    AND e.ledger_sequence > f.finalized_ledger
), auction_current_pause_state AS (
  SELECT DISTINCT ON (c.deployment_id, c.dao_id)
    c.deployment_id,
    c.dao_id,
    e.event_name = 'paused' AS currently_paused
  FROM created c
  JOIN finalized f USING (deployment_id, dao_id)
  JOIN chain.decoded_events e
    ON e.deployment_id = c.deployment_id
    AND e.contract_id = c.auction_contract
  WHERE e.contract_role = 'auction'
    AND e.event_name IN ('paused', 'unpaused')
    AND e.ledger_sequence > f.finalized_ledger
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
  CASE
    WHEN f.dao_id IS NULL THEN NULL::boolean
    ELSE COALESCE(f.auction_enabled, true) OR ar.dao_id IS NOT NULL
  END AS auction_enabled,
  c.created_ledger,
  c.created_at,
  c.created_tx_hash,
  f.finalized_ledger,
  f.finalized_at,
  f.finalized_tx_hash,
  NULL::timestamptz AS indexed_at,
  CASE
    WHEN f.dao_id IS NULL THEN NULL::boolean
    WHEN (COALESCE(f.auction_enabled, true) OR ar.dao_id IS NOT NULL) = false THEN true
    ELSE COALESCE(acps.currently_paused, false)
  END AS auction_paused
FROM created c
LEFT JOIN finalized f USING (deployment_id, dao_id)
LEFT JOIN auction_reactivated ar USING (deployment_id, dao_id)
LEFT JOIN auction_current_pause_state acps USING (deployment_id, dao_id)
LEFT JOIN token_metadata tm USING (deployment_id, token_contract);
