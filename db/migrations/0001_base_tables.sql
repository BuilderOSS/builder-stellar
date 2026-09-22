-- =============================================================================
-- GOLDSKY MULTI-TENANT DAO DATABASE - BASE TABLES AND CORE VIEWS
-- =============================================================================

BEGIN;

-- SCHEMAS
CREATE SCHEMA chain;
CREATE SCHEMA governance;
CREATE SCHEMA token;
CREATE SCHEMA auction;
CREATE SCHEMA treasury;
CREATE SCHEMA manager;
CREATE SCHEMA metadata;
CREATE SCHEMA app;

-- =============================================================================
-- BASE TABLES
-- =============================================================================

CREATE TABLE chain.raw_events (
  event_id text PRIMARY KEY,
  deployment_id text NOT NULL,
  contract_id text NOT NULL,
  contract_role text NOT NULL,
  topics text,
  data text,
  transaction_hash text NOT NULL,
  transaction_successful boolean,
  ledger_sequence bigint NOT NULL,
  ledger_hash text,
  ledger_closed_at text,
  transaction_index bigint,
  operation_index bigint,
  event_index bigint,
  operation_type text,
  _gs_op text,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_raw_events_deployment_contract ON chain.raw_events (deployment_id, contract_id, ledger_sequence DESC, event_id DESC);
CREATE INDEX idx_raw_events_deployment_role ON chain.raw_events (deployment_id, contract_role, ledger_sequence DESC, event_id DESC);

CREATE TABLE chain.decoded_events (
  event_id text PRIMARY KEY,
  deployment_id text NOT NULL,
  contract_id text NOT NULL,
  contract_role text NOT NULL,
  event_name text NOT NULL,
  topic_0 text,
  topic_1 text,
  topic_2 text,
  topic_3 text,
  topics jsonb NOT NULL DEFAULT '{}'::jsonb,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  transaction_hash text NOT NULL,
  transaction_successful boolean,
  ledger_sequence bigint NOT NULL,
  ledger_hash text,
  ledger_closed_at text,
  transaction_index bigint,
  operation_index bigint,
  event_index bigint,
  operation_type text,
  _gs_op text,
  decoder_version text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_decoded_events_deployment_event ON chain.decoded_events (deployment_id, event_name, ledger_sequence DESC, event_id DESC);
CREATE INDEX idx_decoded_events_deployment_contract ON chain.decoded_events (deployment_id, contract_id, ledger_sequence DESC, event_id DESC);
CREATE INDEX idx_decoded_events_topic_0 ON chain.decoded_events (deployment_id, event_name, topic_0, ledger_sequence DESC);
CREATE INDEX idx_decoded_events_topics_gin ON chain.decoded_events USING gin (topics);
CREATE INDEX idx_decoded_events_args_gin ON chain.decoded_events USING gin (args);
CREATE INDEX idx_decoded_events_manager_events ON chain.decoded_events (deployment_id, event_name, ledger_sequence DESC) WHERE LOWER(event_name) IN ('dao_created', 'daocreated', 'dao_registered', 'daoregistered');

CREATE OR REPLACE FUNCTION chain.reject_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF; RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME; END;$$;
CREATE TRIGGER raw_events_immutable BEFORE UPDATE OR DELETE ON chain.raw_events FOR EACH ROW EXECUTE FUNCTION chain.reject_event_mutation();
CREATE TRIGGER decoded_events_immutable BEFORE UPDATE OR DELETE ON chain.decoded_events FOR EACH ROW EXECUTE FUNCTION chain.reject_event_mutation();

CREATE TABLE app.activity_feed_events (
  activity_id text PRIMARY KEY,
  deployment_id text NOT NULL,
  contract_id text NOT NULL,
  contract_role text NOT NULL,
  event_name text NOT NULL,
  topics jsonb NOT NULL DEFAULT '{}'::jsonb,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  kind text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  visibility text NOT NULL,
  proposal_id text,
  token_id text,
  amount text,
  actor text,
  addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ledger_sequence bigint NOT NULL,
  transaction_index bigint,
  operation_index bigint,
  event_index bigint,
  ledger_closed_at text,
  transaction_hash text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_feed_order ON app.activity_feed_events (deployment_id, ledger_sequence DESC, transaction_index DESC, operation_index DESC, event_index DESC, activity_id DESC);

-- MANAGER.DAOS TABLE
CREATE TABLE manager.daos (
  deployment_id TEXT NOT NULL,
  dao_id TEXT NOT NULL,
  token_address TEXT NOT NULL,
  creator VARCHAR(56),
  manager_contract TEXT NOT NULL,
  token_contract TEXT NOT NULL,
  governor_contract TEXT NOT NULL,
  auction_contract TEXT,
  treasury_contract TEXT,
  metadata_contract TEXT,
  token_name VARCHAR(255),
  token_symbol VARCHAR(16),
  token_description TEXT,
  token_uri TEXT,
  admin_address VARCHAR(56),
  status TEXT NOT NULL DEFAULT 'pending',
  created_ledger BIGINT NOT NULL,
  created_at TIMESTAMPTZ,
  created_tx_hash TEXT,
  finalized_ledger BIGINT,
  finalized_at TIMESTAMPTZ,
  finalized_tx_hash TEXT,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (deployment_id, dao_id),
  CHECK (token_address ~ '^C[A-Z0-9]{55}$'),
  CHECK (dao_id ~ '^C[A-Z0-9]{55}$'),
  CHECK (manager_contract ~ '^C[A-Z0-9]{55}$'),
  CHECK (status IN ('pending', 'operational'))
);

CREATE INDEX idx_manager_daos_deployment ON manager.daos(deployment_id);
CREATE INDEX idx_manager_daos_deployment_status ON manager.daos(deployment_id, status);
CREATE INDEX idx_manager_daos_deployment_created_ledger ON manager.daos(deployment_id, created_ledger DESC);
CREATE INDEX idx_manager_daos_token_address ON manager.daos(deployment_id, token_address);
CREATE INDEX idx_manager_daos_governor_contract ON manager.daos(deployment_id, governor_contract);

-- =============================================================================
-- CORE VIEWS (Level 1 - no dependencies except tables)
-- =============================================================================

CREATE OR REPLACE VIEW manager.dao_modules AS
SELECT deployment_id, dao_id, 'token'::text AS module_role, token_address AS module_contract FROM manager.daos
UNION ALL SELECT deployment_id, dao_id, 'auction', auction_contract FROM manager.daos WHERE auction_contract IS NOT NULL
UNION ALL SELECT deployment_id, dao_id, 'metadata', metadata_contract FROM manager.daos WHERE metadata_contract IS NOT NULL
UNION ALL SELECT deployment_id, dao_id, 'governor', governor_contract FROM manager.daos WHERE governor_contract IS NOT NULL
UNION ALL SELECT deployment_id, dao_id, 'treasury', treasury_contract FROM manager.daos WHERE treasury_contract IS NOT NULL;

CREATE OR REPLACE VIEW manager.event_identity AS
SELECT e.deployment_id, e.contract_id,
  CASE WHEN e.contract_role = 'manager' THEN NULL ELSE m.dao_id END AS dao_id,
  m.module_role, m.module_contract
FROM chain.decoded_events e
LEFT JOIN manager.dao_modules m ON m.deployment_id = e.deployment_id AND m.module_contract = e.contract_id;

COMMIT;
