-- =============================================================================
-- MINTER VIEWS
--
-- One Minter contract serves many DAOs, so contract_id can never identify a
-- tenant. Every Minter event carries the DAO token contract as its first topic
-- (token_id); it is resolved to a DAO through manager.dao_registry. Events for
-- tokens that are not DAOs of this deployment are dropped.
--
-- Source events (minter contract):
--   merkle_claim_event     topics token_id, recipient; data { amount }
--   allowlist_claim_event  topics token_id, recipient; data { amount }
--   mint_batch_event       topic token_id;             data { recipient_count, total_amount, first_token_id }
--                          mints token ids [first_token_id, first_token_id + total_amount)
--   merkle_root_set_event  topic token_id
--   allowlist_set_event    topic token_id;             data { member_count }
--
-- Claims are tracked per method and per round on chain (a new merkle root or
-- allowlist opens a new round and earlier claimers may claim again). The events
-- carry no round number, so these views list every claim event; a recipient may
-- legitimately appear more than once.
-- =============================================================================

CREATE VIEW minter.merkle_claim_events AS
SELECT
  e.event_id,
  e.deployment_id,
  r.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'token_id' AS token_id,
  e.topics::jsonb ->> 'recipient' AS recipient,
  (e.args::jsonb ->> 'amount')::numeric(78, 0) AS amount,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
WHERE e.contract_role = 'minter'
  AND e.event_name = 'merkle_claim_event';

CREATE VIEW minter.allowlist_claim_events AS
SELECT
  e.event_id,
  e.deployment_id,
  r.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'token_id' AS token_id,
  e.topics::jsonb ->> 'recipient' AS recipient,
  (e.args::jsonb ->> 'amount')::numeric(78, 0) AS amount,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
WHERE e.contract_role = 'minter'
  AND e.event_name = 'allowlist_claim_event';

CREATE VIEW minter.batch_mint_events AS
SELECT
  e.event_id,
  e.deployment_id,
  r.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'token_id' AS token_id,
  (e.args::jsonb ->> 'recipient_count')::integer AS recipient_count,
  (e.args::jsonb ->> 'total_amount')::numeric(78, 0) AS total_amount,
  (e.args::jsonb ->> 'first_token_id')::bigint AS first_token_id,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
WHERE e.contract_role = 'minter'
  AND e.event_name = 'mint_batch_event';

-- Allocation configuration history (merkle root / allowlist changes).
CREATE VIEW minter.allocation_updates AS
SELECT
  e.event_id,
  e.deployment_id,
  r.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'token_id' AS token_id,
  CASE e.event_name WHEN 'merkle_root_set_event' THEN 'merkle' ELSE 'allowlist' END AS allocation_type,
  (e.args::jsonb ->> 'member_count')::integer AS member_count,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  NULLIF(e.ledger_closed_at, '')::timestamptz AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
WHERE e.contract_role = 'minter'
  AND e.event_name IN ('merkle_root_set_event', 'allowlist_set_event');
