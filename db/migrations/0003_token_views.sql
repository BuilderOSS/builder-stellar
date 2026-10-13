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
--   mint_allowance_changed  topic module;             data { old_allowance, allowance, changed_by }
--                           per grant at launch (changed_by = the Manager), then by governance,
--                           an unregistration (to 0) or the module releasing its own; a mint
--                           spends allowance silently (the remaining amount is token.mint_allowance())
--   module_registered       topic kind;               data { address, non_voting }
--   module_unregistered     topic kind;               data { address }
--   token_initialized       topic admin;              data { name, symbol, settings {transfers_locked,
--                                                     members_only_delegation, dao_recovery} }
--   transfers_lock_changed  no topics;                data { locked, changed_by }
--   members_only_delegation_changed / dao_recovery_changed   data { enabled, changed_by }
--   transfer_agent_changed  topic module;             data { enabled, changed_by }
--                           (also emitted, disabled, when an agent's module is unregistered)
--   agent_transfer          topic agent;              data { from, to, token_id }
--   dao_transfer            topics from, to;          data { token_id, changed_by }
--                           both next to the ordinary transfer event of the same move
-- Not projected: mint_with_minter / mint_batch_with_minter (who performed a mint;
-- ownership comes from mint and transfer), metadata_updated (manager.daos),
-- token_launched (manager.module_launches).
--
-- Voting supply: tokens held by the DAO's Treasury and by registered non-voting
-- modules (the Auction, the Marketplace, any custody module) carry no votes (no
-- delegate_votes_changed for the receiver). token.supply splits the minted
-- supply accordingly.
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

-- The latest delegation and vote count per address (both events key on
-- topic_0: delegator / delegate), one scan.
CREATE VIEW token.delegate_state AS
SELECT
  deployment_id, dao_id, contract_id, address,
  max(a ->> 'to_delegate') FILTER (WHERE event_name = 'delegate_changed') AS delegated_to,
  COALESCE(max((a ->> 'new_votes')::bigint) FILTER (WHERE event_name = 'delegate_votes_changed'), 0)::bigint AS voting_power
FROM (
  SELECT DISTINCT ON (deployment_id, contract_id, event_name, topic_0)
    deployment_id, dao_id, contract_id, event_name, topic_0 AS address, a
  FROM manager.module_events
  WHERE contract_role = 'token' AND event_name IN ('delegate_changed', 'delegate_votes_changed')
  ORDER BY deployment_id, contract_id, event_name, topic_0, pos DESC, event_id DESC
) latest
GROUP BY deployment_id, dao_id, contract_id, address;

-- Holders and delegates: owned count, current delegation and voting power.
-- Holders first, then delegates who hold nothing; the tenant keys stay plain
-- columns on both sides so a per-DAO filter pushes into each.
CREATE VIEW token.members AS
WITH owned AS (
  SELECT deployment_id, dao_id, contract_id, owner AS address,
    count(*)::bigint AS owned_token_count,
    max(event_ledger)::bigint AS last_activity_ledger
  FROM token.inventory
  GROUP BY deployment_id, dao_id, contract_id, owner
)
SELECT
  o.deployment_id, o.dao_id, o.contract_id, o.address,
  o.owned_token_count,
  v.delegated_to,
  COALESCE(v.voting_power, 0)::bigint AS voting_power,
  o.last_activity_ledger
FROM owned o
LEFT JOIN token.delegate_state v
  ON v.deployment_id = o.deployment_id AND v.contract_id = o.contract_id AND v.address = o.address
UNION ALL
SELECT
  v.deployment_id, v.dao_id, v.contract_id, v.address,
  0::bigint AS owned_token_count,
  v.delegated_to,
  v.voting_power,
  NULL::bigint AS last_activity_ledger
FROM token.delegate_state v
WHERE v.voting_power <> 0
  AND NOT EXISTS (
    SELECT 1 FROM token.inventory i
    WHERE i.deployment_id = v.deployment_id AND i.contract_id = v.contract_id AND i.owner = v.address
  );

-- The last allowance each module was set to (docs/designs/membership-models.md
-- §1). Mints spend allowance without an event, so this is an upper bound; the
-- live amount is token.mint_allowance(). 4294967295 is unlimited (the Auction).
CREATE VIEW token.mint_allowances AS
SELECT
  h.deployment_id,
  h.dao_id,
  h.contract_id,
  h.topic_0 AS module,
  (h.a ->> 'allowance')::bigint AS allowance,
  h.a ->> 'changed_by' AS changed_by,
  h.ledger_sequence AS event_ledger,
  h.closed_at AS event_at,
  h.transaction_hash
FROM (
  SELECT DISTINCT ON (deployment_id, contract_id, topic_0) *
  FROM manager.module_events
  WHERE contract_role = 'token' AND event_name = 'mint_allowance_changed'
  ORDER BY deployment_id, contract_id, topic_0, pos DESC, event_id DESC
) h;

-- Compatibility for the web until it reads token.mint_allowances: modules whose
-- last set allowance is above zero (the admin mints without one and is not listed).
CREATE VIEW token.mint_authorities AS
SELECT
  a.deployment_id,
  a.dao_id,
  a.contract_id,
  a.module AS authority,
  true AS enabled,
  a.changed_by,
  a.event_ledger,
  a.event_at,
  a.transaction_hash
FROM token.mint_allowances a
WHERE a.allowance > 0;

-- Registered modules: the latest registration of each address on each Token,
-- unless a later unregistration removed it.
CREATE VIEW token.modules AS
SELECT
  r.deployment_id,
  r.dao_id,
  r.contract_id,
  r.t ->> 'kind' AS kind,
  r.a ->> 'address' AS module,
  (r.a ->> 'non_voting')::boolean AS non_voting,
  r.ledger_sequence AS registered_ledger,
  r.closed_at AS registered_at
FROM (
  SELECT DISTINCT ON (deployment_id, contract_id, a ->> 'address') *
  FROM manager.module_events
  WHERE contract_role = 'token' AND event_name = 'module_registered'
  ORDER BY deployment_id, contract_id, a ->> 'address', pos DESC, event_id DESC
) r
WHERE NOT EXISTS (
  SELECT 1 FROM manager.module_events u
  WHERE u.deployment_id = r.deployment_id
    AND u.contract_id = r.contract_id
    AND u.contract_role = 'token'
    AND u.event_name = 'module_unregistered'
    AND u.a ->> 'address' = r.a ->> 'address'
    AND u.pos > r.pos
);

-- Supply per DAO token. Tokens are never burned.
--   minted_supply       every minted token
--   system_held_supply  held by the DAO's Treasury or a registered non-voting module
--   voting_supply       minted_supply - system_held_supply
CREATE VIEW token.supply AS
SELECT
  r.deployment_id,
  r.dao_id,
  r.token_contract AS contract_id,
  s.minted_supply,
  s.system_held_supply,
  (s.minted_supply - s.system_held_supply)::bigint AS voting_supply
FROM manager.dao_registry r
CROSS JOIN LATERAL (
  SELECT
    count(*)::bigint AS minted_supply,
    (count(*) FILTER (WHERE inv.owner = r.treasury_contract OR EXISTS (
      SELECT 1 FROM manager.dao_modules m
      WHERE m.deployment_id = r.deployment_id AND m.dao_id = r.dao_id
        AND m.module_contract = inv.owner AND m.registered AND m.non_voting
    )))::bigint AS system_held_supply
  FROM token.inventory inv
  WHERE inv.deployment_id = r.deployment_id AND inv.contract_id = r.token_contract
) s;

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

-- The membership switches in force (docs/designs/locked-tokens.md): the
-- creation settings (TokenInitialized), each overridden by its latest change.
CREATE VIEW token.settings AS
SELECT
  r.deployment_id,
  r.dao_id,
  r.token_contract AS contract_id,
  COALESCE((lk.a ->> 'locked')::boolean, (ti.a #>> '{settings,transfers_locked}')::boolean, false) AS transfers_locked,
  COALESCE((md.a ->> 'enabled')::boolean, (ti.a #>> '{settings,members_only_delegation}')::boolean, false) AS members_only_delegation,
  COALESCE((rc.a ->> 'enabled')::boolean, (ti.a #>> '{settings,dao_recovery}')::boolean, false) AS dao_recovery,
  GREATEST(lk.ledger_sequence, md.ledger_sequence, rc.ledger_sequence) AS last_changed_ledger
FROM manager.dao_registry r
LEFT JOIN LATERAL (
  SELECT x.a FROM manager.module_events x
  WHERE x.deployment_id = r.deployment_id AND x.contract_id = r.token_contract
    AND x.contract_role = 'token' AND x.event_name = 'token_initialized'
  ORDER BY x.pos, x.event_id LIMIT 1
) ti ON true
LEFT JOIN LATERAL (
  SELECT x.a, x.ledger_sequence FROM manager.module_events x
  WHERE x.deployment_id = r.deployment_id AND x.contract_id = r.token_contract
    AND x.contract_role = 'token' AND x.event_name = 'transfers_lock_changed'
  ORDER BY x.pos DESC, x.event_id DESC LIMIT 1
) lk ON true
LEFT JOIN LATERAL (
  SELECT x.a, x.ledger_sequence FROM manager.module_events x
  WHERE x.deployment_id = r.deployment_id AND x.contract_id = r.token_contract
    AND x.contract_role = 'token' AND x.event_name = 'members_only_delegation_changed'
  ORDER BY x.pos DESC, x.event_id DESC LIMIT 1
) md ON true
LEFT JOIN LATERAL (
  SELECT x.a, x.ledger_sequence FROM manager.module_events x
  WHERE x.deployment_id = r.deployment_id AND x.contract_id = r.token_contract
    AND x.contract_role = 'token' AND x.event_name = 'dao_recovery_changed'
  ORDER BY x.pos DESC, x.event_id DESC LIMIT 1
) rc ON true;

-- Transfer agents in force: modules whose latest transfer_agent_changed enabled
-- them (unregistering an agent's module emits the disabling event).
CREATE VIEW token.transfer_agents AS
SELECT
  h.deployment_id,
  h.dao_id,
  h.contract_id,
  h.topic_0 AS module,
  h.a ->> 'changed_by' AS changed_by,
  h.ledger_sequence AS event_ledger,
  h.closed_at AS event_at,
  h.transaction_hash
FROM (
  SELECT DISTINCT ON (deployment_id, contract_id, topic_0) *
  FROM manager.module_events
  WHERE contract_role = 'token' AND event_name = 'transfer_agent_changed'
  ORDER BY deployment_id, contract_id, topic_0, pos DESC, event_id DESC
) h
WHERE (h.a ->> 'enabled')::boolean;

-- Moves the holder did not make alone: a DAO transfer (a proposal moved the
-- token, recovery) or an agent transfer (a transfer agent moved it with the
-- holder's signature). The ordinary transfer of the same move is in token.transfers.
CREATE VIEW token.managed_transfers AS
SELECT
  e.event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id,
  CASE e.event_name WHEN 'dao_transfer' THEN 'dao' ELSE 'agent' END AS transfer_kind,
  (e.a ->> 'token_id')::bigint AS token_id,
  COALESCE(e.t ->> 'from', e.a ->> 'from') AS from_address,
  COALESCE(e.t ->> 'to', e.a ->> 'to') AS to_address,
  CASE e.event_name WHEN 'dao_transfer' THEN e.a ->> 'changed_by' ELSE e.t ->> 'agent' END AS moved_by,
  e.ledger_sequence AS event_ledger,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
WHERE e.contract_role = 'token'
  AND e.event_name IN ('dao_transfer', 'agent_transfer');

-- Delegates as the delegate picker lists them: everyone who holds votes or is
-- delegated to, how many holders delegate to them, and whether they count as a
-- member for members-only delegation (the Token's check_delegate: holds a token
-- and is not custody, i.e. neither the Treasury nor a non-voting module; a
-- member whose tokens are all escrowed on the Marketplace is not one while listed).
CREATE VIEW token.delegates AS
WITH delegators AS (
  SELECT deployment_id, dao_id, contract_id, delegated_to AS address,
    count(*) FILTER (WHERE address <> delegated_to)::bigint AS delegator_count
  FROM token.delegate_state
  WHERE delegated_to IS NOT NULL
  GROUP BY deployment_id, dao_id, contract_id, delegated_to
)
SELECT
  m.deployment_id,
  m.dao_id,
  m.contract_id,
  m.address,
  m.voting_power,
  COALESCE(d.delegator_count, 0)::bigint AS delegator_count,
  m.owned_token_count,
  c.custody,
  m.owned_token_count > 0 AND NOT c.custody AS is_member
FROM token.members m
LEFT JOIN delegators d
  ON d.deployment_id = m.deployment_id AND d.contract_id = m.contract_id AND d.address = m.address
CROSS JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1 FROM manager.dao_registry r
    WHERE r.deployment_id = m.deployment_id AND r.dao_id = m.dao_id AND r.treasury_contract = m.address
  ) OR EXISTS (
    SELECT 1 FROM manager.dao_modules x
    WHERE x.deployment_id = m.deployment_id AND x.dao_id = m.dao_id
      AND x.module_contract = m.address AND x.registered AND x.non_voting
  ) AS custody
) c
WHERE m.voting_power > 0 OR d.delegator_count > 0 OR m.owned_token_count > 0;
