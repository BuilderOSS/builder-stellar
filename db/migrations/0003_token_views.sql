-- =============================================================================
-- TOKEN VIEWS
--
-- Source events (token contract):
--   mint                  OpenZeppelin  topic to;                    data { token_id }
--   transfer              OpenZeppelin  topics from, to;             data { token_id }
--   mint_with_minter      custom        topics minter, to;           data { token_id }
--   delegate_changed      OpenZeppelin  topic delegator;             data { from_delegate, to_delegate }
--   delegate_votes_changed OpenZeppelin topic delegate;              data { previous_votes, new_votes }
--   mint_authority_changed custom       topic authority;             data { old_enabled, enabled, changed_by }
--                         Emitted once per minter at launch (changed_by = the Manager) and
--                         afterwards only by the token owner (the Treasury, i.e. governance).
--   launched               custom       topic treasury;              data { minters[] } (see manager.module_launches)
--
-- A mint emits BOTH mint and mint_with_minter. Ownership comes from mint and
-- transfer; mint_with_minter only attributes who performed the mint.
-- =============================================================================

-- Ownership changes: every mint (from_address NULL) and transfer.
CREATE VIEW token.transfers AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.args::jsonb ->> 'token_id')::bigint AS token_id,
  CASE e.event_name WHEN 'mint' THEN 'mint' ELSE 'transfer' END AS transfer_type,
  e.topics::jsonb ->> 'from' AS from_address,
  e.topics::jsonb ->> 'to' AS to_address,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'token'
  AND e.event_name IN ('mint', 'transfer');

-- Who performed each mint (owner, auction, minter contract, ...).
CREATE VIEW token.mints AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.args::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'minter' AS minter,
  e.topics::jsonb ->> 'to' AS recipient,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'token'
  AND e.event_name = 'mint_with_minter';

-- Current owner of each token.
CREATE VIEW token.inventory AS
SELECT DISTINCT ON (t.deployment_id, t.dao_id, t.contract_id, t.token_id)
  t.event_id,
  t.deployment_id,
  t.dao_id,
  t.contract_id,
  t.token_id,
  t.to_address AS owner,
  t.event_ledger,
  t.event_timestamp_seconds,
  t.event_at,
  t.transaction_hash
FROM token.transfers t
ORDER BY t.deployment_id, t.dao_id, t.contract_id, t.token_id, t.event_ledger DESC,
  t.transaction_index DESC NULLS LAST, t.operation_index DESC NULLS LAST,
  t.event_index DESC NULLS LAST, t.event_id DESC;

CREATE VIEW token.delegations AS
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
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'token'
  AND e.event_name = 'delegate_changed';

-- launch_grant marks the rows emitted by the Manager while launching the DAO
-- (platform minter / Minter contract); later rows are governance decisions.
CREATE VIEW token.mint_authority_history AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'authority' AS authority,
  (e.args::jsonb ->> 'old_enabled')::boolean AS old_enabled,
  (e.args::jsonb ->> 'enabled')::boolean AS enabled,
  e.args::jsonb ->> 'changed_by' AS changed_by,
  (e.args::jsonb ->> 'changed_by') = r.manager_contract AS launch_grant,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
JOIN manager.dao_registry r ON r.deployment_id = i.deployment_id AND r.dao_id = i.dao_id
WHERE e.contract_role = 'token'
  AND e.event_name = 'mint_authority_changed';

-- Addresses currently allowed to mint (the owner has implicit authority and is
-- not listed here). Mint authority is granted at launch (by the Manager) and
-- afterwards only through governance; token.set_mint_authority fails before launch.
CREATE VIEW token.mint_authorities AS
SELECT
  h.deployment_id,
  h.dao_id,
  h.contract_id,
  h.authority,
  h.enabled,
  h.event_ledger,
  h.event_at,
  h.transaction_hash,
  'event'::text AS source
FROM (
  SELECT DISTINCT ON (deployment_id, dao_id, contract_id, authority) *
  FROM token.mint_authority_history
  ORDER BY deployment_id, dao_id, contract_id, authority, event_ledger DESC,
    transaction_index DESC NULLS LAST, operation_index DESC NULLS LAST,
    event_index DESC NULLS LAST, event_id DESC
) h
WHERE h.enabled;

-- Holders and delegates with token counts, current delegation and voting power.
CREATE VIEW token.members AS
WITH current_delegations AS (
  SELECT DISTINCT ON (deployment_id, dao_id, contract_id, delegator)
    deployment_id, dao_id, contract_id, delegator, to_delegate
  FROM token.delegations
  ORDER BY deployment_id, dao_id, contract_id, delegator, event_ledger DESC,
    transaction_index DESC NULLS LAST, operation_index DESC NULLS LAST,
    event_index DESC NULLS LAST, event_id DESC
), current_votes AS (
  SELECT DISTINCT ON (e.deployment_id, i.dao_id, e.contract_id, e.topics::jsonb ->> 'delegate')
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'delegate' AS delegate,
    (e.args::jsonb ->> 'new_votes')::bigint AS voting_power
  FROM chain.decoded_events e
  JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'token'
    AND e.event_name = 'delegate_votes_changed'
  ORDER BY e.deployment_id, i.dao_id, e.contract_id, e.topics::jsonb ->> 'delegate',
    e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST,
    e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
), ownership AS (
  SELECT
    deployment_id, dao_id, contract_id,
    owner AS address,
    count(*)::bigint AS owned_token_count,
    min(event_ledger)::bigint AS first_seen_ledger,
    max(event_ledger)::bigint AS last_activity_ledger
  FROM token.inventory
  GROUP BY deployment_id, dao_id, contract_id, owner
), addresses AS (
  SELECT deployment_id, dao_id, contract_id, address FROM ownership
  UNION
  SELECT deployment_id, dao_id, contract_id, delegate FROM current_votes WHERE voting_power <> 0
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
  ON o.deployment_id = a.deployment_id AND o.dao_id = a.dao_id
 AND o.contract_id = a.contract_id AND o.address = a.address
LEFT JOIN current_delegations d
  ON d.deployment_id = a.deployment_id AND d.dao_id = a.dao_id
 AND d.contract_id = a.contract_id AND d.delegator = a.address
LEFT JOIN current_votes v
  ON v.deployment_id = a.deployment_id AND v.dao_id = a.dao_id
 AND v.contract_id = a.contract_id AND v.delegate = a.address;
