-- =============================================================================
-- TOKEN VIEWS
--
-- Token events (OpenZeppelin non-fungible + votes, and contracts/token/src/events.rs):
--   mint                    topic to;                 data { token_id }           every minted token
--   transfer                topics from, to;          data { token_id }
--   approve                 topics approver, token_id; data { approved, live_until_ledger }
--   approve_for_all         topic owner;              data { operator, live_until_ledger }
--   delegate_changed        topic delegator;          data { from_delegate, to_delegate }
--   delegate_votes_changed  topic delegate;           data { previous_votes, new_votes }
--   mint_authority_changed  topic authority;          data { old_enabled, enabled, changed_by }
--                           once per minter at launch (changed_by = the Manager), then by governance
-- Not projected: mint_with_minter / mint_batch_with_minter (who performed a mint;
-- ownership comes from mint and transfer), token_initialized / metadata_updated
-- (manager.daos), token_launched (manager.module_launches).
--
-- Voting supply: tokens held by the DAO's Treasury, Auction and Marketplace carry
-- no votes (no delegate_votes_changed for the receiver). token.supply splits the
-- minted supply accordingly.
-- =============================================================================

-- Ownership changes: every mint (from_address NULL) and transfer.
CREATE VIEW token.transfers AS
SELECT
  e.event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  (e.a ->> 'token_id')::bigint AS token_id,
  CASE e.event_name WHEN 'mint' THEN 'mint' ELSE 'transfer' END AS transfer_type,
  e.t ->> 'from' AS from_address,
  e.t ->> 'to' AS to_address,
  e.pos,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'token'
  AND e.event_name IN ('mint', 'transfer');

-- Current owner of each token.
CREATE VIEW token.inventory AS
SELECT DISTINCT ON (t.deployment_id, t.contract_id, t.token_id)
  t.event_id,
  t.deployment_id,
  t.dao_id,
  t.contract_id,
  t.token_id,
  t.to_address AS owner,
  t.pos,
  t.event_ledger,
  t.event_at,
  t.transaction_hash
FROM token.transfers t
ORDER BY t.deployment_id, t.contract_id, t.token_id, t.pos DESC, t.event_id DESC;

-- Holders and delegates: owned count, current delegation and voting power.
-- Both delegation events key on topic_0 (delegator / delegate), so one scan
-- gives the latest of each per address.
CREATE VIEW token.members AS
WITH latest AS (
  SELECT DISTINCT ON (deployment_id, contract_id, event_name, topic_0)
    deployment_id, dao_id, contract_id, event_name, topic_0 AS address, a
  FROM manager.module_events
  WHERE contract_role = 'token' AND event_name IN ('delegate_changed', 'delegate_votes_changed')
  ORDER BY deployment_id, contract_id, event_name, topic_0, pos DESC, event_id DESC
), votes AS (
  SELECT
    deployment_id, dao_id, contract_id, address,
    max(a ->> 'to_delegate') FILTER (WHERE event_name = 'delegate_changed') AS delegated_to,
    COALESCE(max((a ->> 'new_votes')::bigint) FILTER (WHERE event_name = 'delegate_votes_changed'), 0) AS voting_power
  FROM latest
  GROUP BY deployment_id, dao_id, contract_id, address
), owned AS (
  SELECT deployment_id, dao_id, contract_id, owner AS address,
    count(*)::bigint AS owned_token_count,
    max(event_ledger)::bigint AS last_activity_ledger
  FROM token.inventory
  GROUP BY deployment_id, dao_id, contract_id, owner
)
SELECT
  COALESCE(o.deployment_id, v.deployment_id) AS deployment_id,
  COALESCE(o.dao_id, v.dao_id) AS dao_id,
  COALESCE(o.contract_id, v.contract_id) AS contract_id,
  COALESCE(o.address, v.address) AS address,
  COALESCE(o.owned_token_count, 0)::bigint AS owned_token_count,
  v.delegated_to,
  COALESCE(v.voting_power, 0)::bigint AS voting_power,
  o.last_activity_ledger
FROM owned o
FULL JOIN votes v
  ON v.deployment_id = o.deployment_id AND v.contract_id = o.contract_id AND v.address = o.address
WHERE o.address IS NOT NULL OR v.voting_power <> 0;

-- Addresses currently allowed to mint (the admin has implicit authority and is
-- not listed). Granted at launch by the Manager, afterwards only by governance.
CREATE VIEW token.mint_authorities AS
SELECT
  h.deployment_id,
  h.dao_id,
  h.contract_id,
  h.topic_0 AS authority,
  (h.a ->> 'enabled')::boolean AS enabled,
  h.a ->> 'changed_by' AS changed_by,
  h.ledger_sequence AS event_ledger,
  h.closed_at AS event_at,
  h.transaction_hash
FROM (
  SELECT DISTINCT ON (deployment_id, contract_id, topic_0) *
  FROM manager.module_events
  WHERE contract_role = 'token' AND event_name = 'mint_authority_changed'
  ORDER BY deployment_id, contract_id, topic_0, pos DESC, event_id DESC
) h
WHERE (h.a ->> 'enabled')::boolean;

-- Supply per DAO token. Tokens are never burned.
--   minted_supply       every minted token
--   system_held_supply  held by the DAO's Treasury, Auction or Marketplace
--   voting_supply       minted_supply - system_held_supply
CREATE VIEW token.supply AS
SELECT
  r.deployment_id,
  r.dao_id,
  r.token_contract AS contract_id,
  count(inv.token_id)::bigint AS minted_supply,
  (count(inv.token_id) FILTER (
    WHERE inv.owner IN (r.treasury_contract, r.auction_contract, r.marketplace_contract)))::bigint AS system_held_supply,
  (count(inv.token_id) - count(inv.token_id) FILTER (
    WHERE inv.owner IN (r.treasury_contract, r.auction_contract, r.marketplace_contract)))::bigint AS voting_supply
FROM manager.dao_registry r
LEFT JOIN token.inventory inv
  ON inv.deployment_id = r.deployment_id AND inv.contract_id = r.token_contract
GROUP BY r.deployment_id, r.dao_id, r.token_contract;

-- Single-token approvals still in force: the latest approve per token, unless
-- the token moved since (a transfer clears the approval on chain) or the
-- approval was cleared (live_until_ledger 0). Expiry against the current
-- ledger is the reader's call.
CREATE VIEW token.approvals AS
SELECT
  ap.deployment_id,
  ap.dao_id,
  ap.contract_id,
  (ap.t ->> 'token_id')::bigint AS token_id,
  ap.t ->> 'approver' AS owner,
  ap.a ->> 'approved' AS approved,
  (ap.a ->> 'live_until_ledger')::bigint AS live_until_ledger,
  ap.ledger_sequence AS event_ledger,
  ap.closed_at AS event_at,
  ap.transaction_hash
FROM (
  SELECT DISTINCT ON (deployment_id, contract_id, t ->> 'token_id') *
  FROM manager.module_events
  WHERE contract_role = 'token' AND event_name = 'approve'
  ORDER BY deployment_id, contract_id, t ->> 'token_id', pos DESC, event_id DESC
) ap
WHERE (ap.a ->> 'live_until_ledger')::bigint > 0
  AND NOT EXISTS (
    SELECT 1 FROM token.transfers x
    WHERE x.deployment_id = ap.deployment_id AND x.contract_id = ap.contract_id
      AND x.token_id = (ap.t ->> 'token_id')::bigint AND x.pos > ap.pos
  );

-- Collection-wide operator approvals in force (latest per owner and operator,
-- not cleared).
CREATE VIEW token.operator_approvals AS
SELECT
  ap.deployment_id,
  ap.dao_id,
  ap.contract_id,
  ap.topic_0 AS owner,
  ap.a ->> 'operator' AS operator,
  (ap.a ->> 'live_until_ledger')::bigint AS live_until_ledger,
  ap.ledger_sequence AS event_ledger,
  ap.closed_at AS event_at,
  ap.transaction_hash
FROM (
  SELECT DISTINCT ON (deployment_id, contract_id, topic_0, a ->> 'operator') *
  FROM manager.module_events
  WHERE contract_role = 'token' AND event_name = 'approve_for_all'
  ORDER BY deployment_id, contract_id, topic_0, a ->> 'operator', pos DESC, event_id DESC
) ap
WHERE (ap.a ->> 'live_until_ledger')::bigint > 0;
