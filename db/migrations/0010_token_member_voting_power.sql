-- =============================================================================
-- TOKEN MEMBER VOTING POWER
--
-- Derive current delegation and voting power from the latest token events.
-- =============================================================================

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
  ORDER BY e.deployment_id, i.dao_id, e.contract_id, e.topics::jsonb ->> 'delegate', e.ledger_sequence DESC, e.event_id DESC
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
