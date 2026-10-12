-- =============================================================================
-- LANDING TABLES
--
-- Goldsky writes exactly three tables: chain.raw_events, chain.decoded_events
-- and app.activity_feed_events. Everything else in this database is a view
-- derived from them, so a pipeline replay rebuilds the whole read model.
--
-- Column lists mirror the pipeline sink schemas in
-- packages/goldsky/templates/builder-stellar-events.yaml.mustache.
--
-- Baseline of 2026-10-13 (pre-mainnet: the database is reset on redeploy, so
-- the schema is kept as one clean set of files rather than a migration history).
-- =============================================================================

CREATE SCHEMA chain;
CREATE SCHEMA manager;
CREATE SCHEMA token;
CREATE SCHEMA governance;
CREATE SCHEMA auction;
CREATE SCHEMA metadata;
CREATE SCHEMA treasury;
CREATE SCHEMA marketplace;
CREATE SCHEMA app;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Goldsky writes ledger_closed_at as epoch milliseconds (for example "1791475282000"); accept epoch
-- seconds and ISO text too, and NULL for an empty value.
CREATE FUNCTION chain.ledger_closed_at_ts(raw text)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL OR raw = '' THEN NULL
    WHEN raw ~ '^[0-9]+$' AND length(raw) >= 13 THEN to_timestamp(raw::bigint / 1000.0)
    WHEN raw ~ '^[0-9]+$' THEN to_timestamp(raw::bigint)
    ELSE raw::timestamptz
  END
$$;

-- jsonb refuses the \u0000 escape, and the decoder stores free text (profile
-- JSON, comments, descriptions) as it was emitted. One NUL in one DAO's text
-- must not make every view that casts the column raise, so the views cast
-- through this: the escape becomes U+FFFD.
CREATE FUNCTION chain.jsonb_safe(raw text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT replace(raw, '\u0000', '\ufffd')::jsonb $$;

-- Total ordering key for an event inside the chain. A missing index sorts first.
-- Every "latest" or "first" lookup in the views orders by this, then event_id.
CREATE FUNCTION chain.event_position(ledger bigint, tx bigint, op bigint, evt bigint)
RETURNS bigint[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT ARRAY[ledger, COALESCE(tx, -1), COALESCE(op, -1), COALESCE(evt, -1)] $$;

-- The pipeline cannot read operation/event positions from the source dataset,
-- but the dataset id ends in "-op-<n>-event-<m>". Recover them on insert so
-- events inside one transaction (e.g. a 30-token batch mint) order correctly.
-- TG_ARGV[0] names the column that holds the event id.
CREATE FUNCTION chain.fill_event_positions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parts text[];
BEGIN
  IF NEW.operation_index IS NULL OR NEW.event_index IS NULL THEN
    parts := regexp_match(to_jsonb(NEW) ->> TG_ARGV[0], '-op-([0-9]+)-event-([0-9]+)$');
    IF parts IS NOT NULL THEN
      NEW.operation_index := COALESCE(NEW.operation_index, parts[1]::bigint);
      NEW.event_index := COALESCE(NEW.event_index, parts[2]::bigint);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Landing rows are append-only. Re-delivering an identical row (pipeline
-- replay) is allowed; changing or deleting one is not.
CREATE FUNCTION chain.reject_event_mutation()
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

-- -----------------------------------------------------------------------------
-- chain.raw_events: source events with their XDR-JSON topics and data
-- -----------------------------------------------------------------------------

CREATE TABLE chain.raw_events (
  event_id               text PRIMARY KEY,
  deployment_id          text    NOT NULL,
  contract_id            text    NOT NULL,
  contract_role          text    NOT NULL,
  topics                 text    NOT NULL DEFAULT '[]',
  data                   text    NOT NULL DEFAULT '{}',
  transaction_hash       text    NOT NULL,
  transaction_successful boolean,
  ledger_sequence        bigint  NOT NULL,
  ledger_hash            text,
  ledger_closed_at       text,
  transaction_index      bigint,
  operation_index        bigint,
  event_index            bigint,
  operation_type         text,
  _gs_op                 text,
  ingested_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_raw_events_deployment_ledger
  ON chain.raw_events (deployment_id, ledger_sequence DESC);

-- -----------------------------------------------------------------------------
-- chain.decoded_events: decoded event name, named topics and named data fields
--
-- event_name is the on-chain topic-0 symbol (snake_case struct name). topics
-- and args are JSON objects stored as text (the pipeline sinks strings); u32
-- values are JSON numbers, u64/u128/i128 strings, bytes hex, addresses strings,
-- nested contract types objects, Option::None null. topic_0..3 hold the raw
-- topic values after the name ('' when absent).
-- -----------------------------------------------------------------------------

CREATE TABLE chain.decoded_events (
  event_id               text PRIMARY KEY,
  deployment_id          text    NOT NULL,
  contract_id            text    NOT NULL,
  contract_role          text    NOT NULL,
  event_name             text    NOT NULL,
  topic_0                text,
  topic_1                text,
  topic_2                text,
  topic_3                text,
  topics                 text    NOT NULL DEFAULT '{}',
  args                   text    NOT NULL DEFAULT '{}',
  transaction_hash       text    NOT NULL,
  transaction_successful boolean,
  ledger_sequence        bigint  NOT NULL,
  ledger_hash            text,
  ledger_closed_at       text,
  transaction_index      bigint,
  operation_index        bigint,
  event_index            bigint,
  operation_type         text,
  _gs_op                 text,
  decoder_version        text    NOT NULL,
  ingested_at            timestamptz NOT NULL DEFAULT now()
);

-- View access paths: by role + event name (state views), by contract
-- (identity joins), and by topic_0 (per-entity lookups: a DAO, a proposal, a token).
CREATE INDEX idx_decoded_events_role_event
  ON chain.decoded_events (deployment_id, contract_role, event_name, ledger_sequence DESC,
    transaction_index DESC, operation_index DESC, event_index DESC, event_id DESC);
CREATE INDEX idx_decoded_events_contract
  ON chain.decoded_events (deployment_id, contract_id, ledger_sequence DESC,
    transaction_index DESC, operation_index DESC, event_index DESC, event_id DESC);
CREATE INDEX idx_decoded_events_topic_0
  ON chain.decoded_events (deployment_id, event_name, topic_0);

-- Every decoded event with its topics (t) and data (a) as jsonb, its total
-- position in the chain (pos) and its close time. Every domain view reads
-- this instead of chain.decoded_events; the planner inlines it, so the
-- filters still reach the indexes above.
CREATE VIEW chain.events AS
SELECT
  e.event_id,
  e.deployment_id,
  e.contract_id,
  e.contract_role,
  e.event_name,
  e.topic_0,
  e.topic_1,
  e.topic_2,
  chain.jsonb_safe(e.topics) AS t,
  chain.jsonb_safe(e.args) AS a,
  chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index) AS pos,
  e.ledger_sequence,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS closed_at,
  e.transaction_hash,
  e.ingested_at
FROM chain.decoded_events e;

-- -----------------------------------------------------------------------------
-- app.activity_feed_events: user-facing summary of each decoded event
-- -----------------------------------------------------------------------------

CREATE TABLE app.activity_feed_events (
  activity_id       text PRIMARY KEY,
  deployment_id     text    NOT NULL,
  contract_id       text    NOT NULL,
  contract_role     text    NOT NULL,
  event_name        text    NOT NULL,
  topics            text    NOT NULL DEFAULT '{}',
  args              text    NOT NULL DEFAULT '{}',
  kind              text    NOT NULL,
  title             text    NOT NULL,
  summary           text    NOT NULL,
  visibility        text    NOT NULL,
  proposal_id       text,
  token_id          text,
  amount            text,
  actor             text,
  addresses         text    NOT NULL DEFAULT '[]',
  ledger_sequence   bigint  NOT NULL,
  transaction_index bigint,
  operation_index   bigint,
  event_index       bigint,
  ledger_closed_at  text,
  transaction_hash  text    NOT NULL,
  ingested_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_feed_order
  ON app.activity_feed_events (deployment_id, ledger_sequence DESC, transaction_index DESC,
    operation_index DESC, event_index DESC, activity_id DESC);
CREATE INDEX idx_activity_feed_contract_order
  ON app.activity_feed_events (deployment_id, contract_id, ledger_sequence DESC,
    transaction_index DESC, operation_index DESC, event_index DESC, activity_id DESC);
CREATE INDEX idx_activity_feed_role_kind
  ON app.activity_feed_events (deployment_id, contract_role, kind, ledger_sequence DESC, activity_id DESC);
-- Minter events are shared by every DAO; token_id is the only tenant key.
CREATE INDEX idx_activity_feed_minter_tenant
  ON app.activity_feed_events (deployment_id, token_id, kind, ledger_sequence DESC, activity_id DESC)
  WHERE contract_role = 'minter';

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

CREATE TRIGGER raw_events_fill_positions
  BEFORE INSERT ON chain.raw_events
  FOR EACH ROW EXECUTE FUNCTION chain.fill_event_positions('event_id');
CREATE TRIGGER decoded_events_fill_positions
  BEFORE INSERT ON chain.decoded_events
  FOR EACH ROW EXECUTE FUNCTION chain.fill_event_positions('event_id');
CREATE TRIGGER activity_feed_events_fill_positions
  BEFORE INSERT ON app.activity_feed_events
  FOR EACH ROW EXECUTE FUNCTION chain.fill_event_positions('activity_id');

CREATE TRIGGER raw_events_immutable
  BEFORE UPDATE OR DELETE ON chain.raw_events
  FOR EACH ROW EXECUTE FUNCTION chain.reject_event_mutation();
CREATE TRIGGER decoded_events_immutable
  BEFORE UPDATE OR DELETE ON chain.decoded_events
  FOR EACH ROW EXECUTE FUNCTION chain.reject_event_mutation();
CREATE TRIGGER activity_feed_events_immutable
  BEFORE UPDATE OR DELETE ON app.activity_feed_events
  FOR EACH ROW EXECUTE FUNCTION chain.reject_event_mutation();
