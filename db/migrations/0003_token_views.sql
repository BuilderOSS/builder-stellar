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
ORDER BY e.deployment_id, i.dao_id, e.contract_id, e.args::jsonb ->> 'token_id', e.ledger_sequence DESC, e.event_id DESC;

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
  extract(epoch FROM to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000))::bigint AS event_timestamp_seconds,
  to_timestamp(NULLIF(e.ledger_closed_at, '')::numeric / 1000) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i USING (deployment_id, contract_id)
WHERE e.contract_role = 'token'
  AND e.event_name = 'mint_authority_changed';

-- Token: Current enabled mint authorities
CREATE OR REPLACE VIEW token.mint_authorities AS
SELECT DISTINCT ON (deployment_id, dao_id, authority)
  deployment_id,
  dao_id,
  contract_id,
  authority,
  enabled,
  event_ledger,
  event_at,
  transaction_hash,
  'event'::text AS source
FROM token.mint_authority_history
WHERE enabled
ORDER BY deployment_id, dao_id, authority, event_ledger DESC;

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
  ORDER BY deployment_id, dao_id, contract_id, delegator, event_ledger DESC, event_id DESC
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
    NULLIF(split_part(e.event_id, '-event-', 2), '')::bigint DESC
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
)
SELECT
  o.deployment_id,
  o.dao_id,
  o.contract_id,
  o.address,
  o.owned_token_count,
  d.to_delegate AS delegated_to,
  COALESCE(v.voting_power, 0)::bigint AS voting_power,
  o.first_seen_ledger,
  o.last_activity_ledger
FROM ownership o
LEFT JOIN current_delegations d
  ON d.deployment_id = o.deployment_id
 AND d.dao_id = o.dao_id
 AND d.contract_id = o.contract_id
 AND d.delegator = o.address
LEFT JOIN current_votes v
  ON v.deployment_id = o.deployment_id
 AND v.dao_id = o.dao_id
 AND v.contract_id = o.contract_id
 AND v.delegate = o.address;
