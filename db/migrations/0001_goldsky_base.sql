BEGIN;

CREATE SCHEMA IF NOT EXISTS chain;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS token;
CREATE SCHEMA IF NOT EXISTS auction;
CREATE SCHEMA IF NOT EXISTS treasury;
CREATE SCHEMA IF NOT EXISTS manager;
CREATE SCHEMA IF NOT EXISTS metadata;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS chain.raw_events (
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

CREATE INDEX IF NOT EXISTS raw_events_deployment_contract_idx
  ON chain.raw_events (deployment_id, contract_id, ledger_sequence DESC, event_id DESC);

CREATE INDEX IF NOT EXISTS raw_events_deployment_role_idx
  ON chain.raw_events (deployment_id, contract_role, ledger_sequence DESC, event_id DESC);

CREATE TABLE IF NOT EXISTS chain.decoded_events (
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

CREATE INDEX IF NOT EXISTS decoded_events_deployment_event_idx
  ON chain.decoded_events (deployment_id, event_name, ledger_sequence DESC, event_id DESC);

CREATE INDEX IF NOT EXISTS decoded_events_deployment_contract_idx
  ON chain.decoded_events (deployment_id, contract_id, ledger_sequence DESC, event_id DESC);

CREATE INDEX IF NOT EXISTS decoded_events_topic_0_idx
  ON chain.decoded_events (deployment_id, event_name, topic_0, ledger_sequence DESC);

CREATE INDEX IF NOT EXISTS decoded_events_topics_gin_idx
  ON chain.decoded_events USING gin (topics);

CREATE INDEX IF NOT EXISTS decoded_events_args_gin_idx
  ON chain.decoded_events USING gin (args);

CREATE INDEX IF NOT EXISTS decoded_events_manager_events_idx
  ON chain.decoded_events (deployment_id, event_name, ledger_sequence DESC)
  WHERE LOWER(event_name) IN ('dao_created', 'daocreated', 'dao_registered', 'daoregistered');

CREATE OR REPLACE FUNCTION chain.reject_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS raw_events_immutable ON chain.raw_events;
CREATE TRIGGER raw_events_immutable
BEFORE UPDATE OR DELETE ON chain.raw_events
FOR EACH ROW EXECUTE FUNCTION chain.reject_event_mutation();

DROP TRIGGER IF EXISTS decoded_events_immutable ON chain.decoded_events;
CREATE TRIGGER decoded_events_immutable
BEFORE UPDATE OR DELETE ON chain.decoded_events
FOR EACH ROW EXECUTE FUNCTION chain.reject_event_mutation();

CREATE TABLE IF NOT EXISTS app.activity_feed_events (
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

CREATE INDEX IF NOT EXISTS activity_feed_events_order_idx
  ON app.activity_feed_events (deployment_id, ledger_sequence DESC, transaction_index DESC, operation_index DESC, event_index DESC, activity_id DESC);

COMMIT;
