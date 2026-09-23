-- =============================================================================
-- TOKEN VIEWS MIGRATION
--
-- Creates views for:
-- - Token transfers
-- - Token inventory (current ownership)
-- - Token delegations
-- - Mint authority history and current state
-- - Token members with ownership counts
-- =============================================================================


-- Token: Transfers
CREATE OR REPLACE VIEW token.transfers AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.args::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'operator' AS operator,
  e.topics::jsonb ->> 'from' AS from_address,
  e.topics::jsonb ->> 'to' AS to_address,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'token'
  AND e.event_name IN ('transfer', 'mint', 'mint_with_minter');

-- Token: Inventory (current owner of each token)
CREATE OR REPLACE VIEW token.inventory AS
SELECT DISTINCT ON (e.deployment_id, i.dao_id, e.contract_id, e.args::jsonb ->> 'token_id')
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.args::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'to' AS owner,
  e.ledger_sequence AS event_ledger,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'token'
  AND e.event_name IN ('transfer', 'mint', 'mint_with_minter')
 ORDER BY e.deployment_id, i.dao_id, e.contract_id, e.args::jsonb ->> 'token_id', e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC;

-- Token: Delegations
CREATE OR REPLACE VIEW token.delegations AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'delegator' AS delegator,
  e.args::jsonb ->> 'from_delegate' AS from_delegate,
  e.args::jsonb ->> 'to_delegate' AS to_delegate,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'token'
  AND e.event_name = 'delegate_changed';

-- Token: Mint authority history
CREATE OR REPLACE VIEW token.mint_authority_history AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'authority' AS authority,
  (e.args::jsonb ->> 'enabled')::boolean AS enabled,
  e.args::jsonb ->> 'changed_by' AS changed_by,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'token'
  AND e.event_name = 'mint_authority_changed';

-- Token: Current enabled mint authorities
CREATE OR REPLACE VIEW token.mint_authorities AS
WITH latest_events AS (
  SELECT DISTINCT ON (deployment_id, dao_id, authority)
    deployment_id,
    dao_id,
    contract_id,
    authority,
    enabled,
    event_ledger,
    transaction_index,
    operation_index,
    event_index,
    event_at,
    transaction_hash
  FROM token.mint_authority_history
   ORDER BY deployment_id, dao_id, authority, event_ledger DESC, transaction_index DESC, operation_index DESC, event_index DESC
)
SELECT
  deployment_id,
  dao_id,
  contract_id,
  authority,
  enabled,
  event_ledger,
  event_at,
  transaction_hash,
  'event'::text AS source
FROM latest_events
WHERE enabled;

-- Token: Members with ownership counts, delegation, and voting power
CREATE OR REPLACE VIEW token.members AS
WITH current_delegations AS (
  SELECT DISTINCT ON (deployment_id, dao_id, contract_id, delegator)
    deployment_id,
    dao_id,
    contract_id,
    delegator,
    to_delegate
  FROM token.delegations
   ORDER BY deployment_id, dao_id, contract_id, delegator, event_ledger DESC, transaction_index DESC, operation_index DESC, event_index DESC
), current_votes AS (
  SELECT DISTINCT ON (e.deployment_id, i.dao_id, e.contract_id, e.topics::jsonb ->> 'delegate')
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'delegate' AS delegate,
    (e.args::jsonb ->> 'new_votes')::bigint AS voting_power
  FROM chain.decoded_events e
  JOIN manager.event_identity i USING (deployment_id, contract_id)
  WHERE e.contract_role = 'token'
    AND e.event_name = 'delegate_votes_changed'
  ORDER BY
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'delegate',
     e.ledger_sequence DESC,
     e.transaction_index DESC,
     e.operation_index DESC,
     e.event_index DESC
), ownership AS (
  SELECT
    e.deployment_id,
    e.dao_id,
    e.contract_id,
    e.owner AS address,
    count(*)::bigint AS owned_token_count,
    min(e.event_ledger)::bigint AS first_seen_ledger,
    max(e.event_ledger)::bigint AS last_activity_ledger
  FROM token.inventory e
  GROUP BY e.deployment_id, e.dao_id, e.contract_id, e.owner
), addresses AS (
  SELECT deployment_id, dao_id, contract_id, address
  FROM ownership
  UNION
  SELECT deployment_id, dao_id, contract_id, delegate AS address
  FROM current_votes
  WHERE voting_power <> 0
)
SELECT
  a.deployment_id,
  a.dao_id,
  a.contract_id,
  a.address,
  COALESCE(o.owned_token_count, 0)::bigint AS owned_token_count,
  d.to_delegate AS delegated_to,
  COALESCE(v.voting_power, 0)::bigint AS voting_power,
  o.first_seen_ledger,
  o.last_activity_ledger
FROM addresses a
LEFT JOIN ownership o
  ON o.deployment_id = a.deployment_id
 AND o.dao_id = a.dao_id
 AND o.contract_id = a.contract_id
 AND o.address = a.address
LEFT JOIN current_delegations d
  ON d.deployment_id = a.deployment_id
 AND d.dao_id = a.dao_id
 AND d.contract_id = a.contract_id
 AND d.delegator = a.address
LEFT JOIN current_votes v
  ON v.deployment_id = a.deployment_id
 AND v.dao_id = a.dao_id
 AND v.contract_id = a.contract_id
 AND v.delegate = a.address;
