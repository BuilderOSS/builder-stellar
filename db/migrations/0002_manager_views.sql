-- =============================================================================
-- MANAGER VIEWS
--
-- The Manager has no on-chain DAO registry we index from storage. The DAO
-- registry is a projection of DaoCreated / DaoLaunched events:
--
--   manager.dao_registry       one row per DAO, straight from DaoCreated
--   manager.dao_modules        one row per DAO module contract
--   manager.event_identity     contract -> DAO lookup used by every domain view
--   manager.daos               registry + token metadata + launch/auction state
--   manager.implementations    registered WASM implementations (+ revocation)
--   manager.current_implementations  latest default implementation set
--
-- A DAO is identified by its token contract address (dao_id). deployment_id
-- scopes everything to one Manager.
-- =============================================================================

-- DaoCreated: topics (token_address, deployer, launch_admin);
-- data { created_ledger, modules { token, metadata, auction, governor, treasury, marketplace } }
CREATE VIEW manager.dao_registry AS
SELECT DISTINCT ON (e.deployment_id, e.topic_0)
  e.deployment_id,
  e.topic_0                                   AS dao_id,
  e.topic_0                                   AS token_address,
  e.topic_1                                   AS deployer,
  e.topic_2                                   AS launch_admin,
  e.contract_id                               AS manager_contract,
  e.args::jsonb #>> '{modules,token}'         AS token_contract,
  e.args::jsonb #>> '{modules,governor}'      AS governor_contract,
  e.args::jsonb #>> '{modules,auction}'       AS auction_contract,
  e.args::jsonb #>> '{modules,treasury}'      AS treasury_contract,
  e.args::jsonb #>> '{modules,metadata}'      AS metadata_contract,
  e.args::jsonb #>> '{modules,marketplace}'   AS marketplace_contract,
  e.ledger_sequence                           AS created_ledger,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS created_at,
  e.transaction_hash                          AS created_tx_hash,
  e.ingested_at                               AS indexed_at
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'dao_created'
ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence, e.transaction_index,
  e.operation_index, e.event_index, e.event_id;

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

-- Registry + token metadata + lifecycle state.
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
    NULLIF(e.ledger_closed_at, '')::timestamptz AS launched_at,
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
  -- TokenInitialized: topic owner; data { uri, name, symbol, version }
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
LEFT JOIN launched l ON l.deployment_id = r.deployment_id AND l.dao_id = r.dao_id
LEFT JOIN auction_state a ON a.deployment_id = r.deployment_id AND a.dao_id = r.dao_id
LEFT JOIN token_init t ON t.deployment_id = r.deployment_id AND t.token_contract = r.token_contract
LEFT JOIN dao_description d ON d.deployment_id = r.deployment_id AND d.metadata_contract = r.metadata_contract;

-- ImplementationRegistered: topic wasm_hash; data { name, version, published_at }
-- ImplementationRevoked:    topic wasm_hash; data { revoked_at }
CREATE VIEW manager.implementations AS
SELECT
  e.event_id,
  e.deployment_id,
  e.contract_id AS manager_contract,
  e.args::jsonb ->> 'name' AS name,
  e.args::jsonb ->> 'version' AS version,
  e.topic_0 AS wasm_hash,
  (e.args::jsonb ->> 'published_at')::bigint AS published_at,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM NULLIF(e.ledger_closed_at, '')::timestamptz)::bigint AS event_timestamp_seconds,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash,
  r.event_id IS NOT NULL AS revoked,
  (r.args::jsonb ->> 'revoked_at')::bigint AS revoked_at
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
  NULLIF(e.ledger_closed_at, '')::timestamptz AS updated_at,
  e.transaction_hash
FROM chain.decoded_events e
WHERE e.contract_role = 'manager'
  AND e.event_name = 'current_implementations_updated'
ORDER BY e.deployment_id, e.ledger_sequence DESC, e.transaction_index DESC,
  e.operation_index DESC, e.event_index DESC, e.event_id DESC;
