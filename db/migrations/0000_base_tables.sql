-- =============================================================================
-- GOLDSKY MULTI-TENANT DAO DATABASE - BASE TABLES AND CORE VIEWS
-- =============================================================================


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
  topics text NOT NULL DEFAULT '',
  args text NOT NULL DEFAULT '',
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
  topics text NOT NULL DEFAULT '',
  args text NOT NULL DEFAULT '',
  kind text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  visibility text NOT NULL,
  proposal_id text,
  token_id text,
  amount text,
  actor text,
  addresses text NOT NULL DEFAULT '[]',
  ledger_sequence bigint NOT NULL,
  transaction_index bigint,
  operation_index bigint,
  event_index bigint,
  ledger_closed_at text,
  transaction_hash text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_feed_order ON app.activity_feed_events (deployment_id, ledger_sequence DESC, transaction_index DESC, operation_index DESC, event_index DESC, activity_id DESC);

