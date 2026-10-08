-- Canonical Minter read models.
-- Minter is shared by DAOs, so tenant identity is resolved through the
-- event's token_id and never through contract_id alone.

CREATE SCHEMA IF NOT EXISTS minter;

-- Replace the generic contract-identity join for shared Minter events. A Minter
-- contract may serve many DAOs; token_id is the only safe tenant discriminator.
CREATE OR REPLACE VIEW app.activity_feed AS
SELECT
  e.activity_id,
  e.deployment_id,
  CASE
    WHEN e.contract_role = 'manager' THEN NULL
    WHEN e.contract_role = 'minter' THEN md.dao_id
    ELSE i.dao_id
  END AS dao_id,
  e.contract_id,
  e.contract_role,
  e.event_name,
  e.topics,
  e.args,
  e.kind,
  e.title,
  e.summary,
  e.actor,
  e.addresses,
  e.proposal_id,
  e.token_id,
  e.amount,
  e.visibility,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  e.ledger_closed_at,
  e.transaction_hash
FROM app.activity_feed_events e
LEFT JOIN manager.event_identity i
  ON i.deployment_id = e.deployment_id
 AND i.contract_id = e.contract_id
LEFT JOIN manager.daos md
  ON md.deployment_id = e.deployment_id
 AND md.token_address = e.token_id
WHERE e.contract_role <> 'minter' OR md.dao_id IS NOT NULL;

CREATE OR REPLACE VIEW minter.mint_events AS
SELECT
  a.activity_id AS event_id,
  a.deployment_id,
  d.dao_id,
  a.contract_id,
  a.token_id,
  a.actor AS recipient,
  NULLIF(a.amount, '')::numeric(78, 0) AS amount,
  a.event_name AS event_type,
  a.ledger_sequence,
  a.transaction_index,
  a.operation_index,
  a.event_index,
  NULLIF(a.ledger_closed_at, '')::timestamptz AS event_at,
  a.transaction_hash
FROM app.activity_feed_events a
JOIN manager.daos d
  ON d.deployment_id = a.deployment_id
 AND d.token_address = a.token_id
WHERE a.contract_role = 'minter'
  AND a.kind = 'minter.mint';

CREATE OR REPLACE VIEW minter.batch_mint_events AS
SELECT
  a.activity_id AS event_id,
  a.deployment_id,
  d.dao_id,
  a.contract_id,
  a.token_id,
  NULLIF(a.args::jsonb ->> 'recipient_count', '')::integer AS recipient_count,
  NULLIF(a.args::jsonb ->> 'total_amount', '')::numeric(78, 0) AS total_amount,
  a.ledger_sequence,
  a.transaction_index,
  a.operation_index,
  a.event_index,
  NULLIF(a.ledger_closed_at, '')::timestamptz AS event_at,
  a.transaction_hash
FROM app.activity_feed_events a
JOIN manager.daos d
  ON d.deployment_id = a.deployment_id
 AND d.token_address = a.token_id
WHERE a.contract_role = 'minter'
  AND a.kind = 'minter.batch_mint';

CREATE OR REPLACE VIEW minter.merkle_claim_events AS
SELECT
  a.activity_id AS event_id,
  a.deployment_id,
  d.dao_id,
  a.contract_id,
  a.token_id,
  a.actor AS recipient,
  NULLIF(a.amount, '')::numeric(78, 0) AS amount,
  true AS proof_valid,
  a.ledger_sequence,
  a.transaction_index,
  a.operation_index,
  a.event_index,
  NULLIF(a.ledger_closed_at, '')::timestamptz AS event_at,
  a.transaction_hash
FROM app.activity_feed_events a
JOIN manager.daos d
  ON d.deployment_id = a.deployment_id
 AND d.token_address = a.token_id
WHERE a.contract_role = 'minter'
  AND a.kind = 'minter.merkle_claim';

CREATE OR REPLACE VIEW minter.allowlist_claim_events AS
SELECT
  a.activity_id AS event_id,
  a.deployment_id,
  d.dao_id,
  a.contract_id,
  a.token_id,
  a.actor AS recipient,
  NULLIF(a.amount, '')::numeric(78, 0) AS amount,
  a.ledger_sequence,
  a.transaction_index,
  a.operation_index,
  a.event_index,
  NULLIF(a.ledger_closed_at, '')::timestamptz AS event_at,
  a.transaction_hash
FROM app.activity_feed_events a
JOIN manager.daos d
  ON d.deployment_id = a.deployment_id
 AND d.token_address = a.token_id
WHERE a.contract_role = 'minter'
  AND a.kind = 'minter.allowlist_claim';

CREATE INDEX IF NOT EXISTS idx_activity_minter_tenant_order
  ON app.activity_feed_events
    (deployment_id, token_id, kind, ledger_sequence DESC, activity_id DESC)
  WHERE contract_role = 'minter';
