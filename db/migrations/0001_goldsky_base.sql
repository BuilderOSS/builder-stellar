BEGIN;

CREATE SCHEMA IF NOT EXISTS chain;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS token;
CREATE SCHEMA IF NOT EXISTS auction;
CREATE SCHEMA IF NOT EXISTS treasury;
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
  event_type text,
  payload text,
  proposal_id text,
  proposal_number text,
  proposer text,
  actor text,
  amount text,
  token_id text,
  bidder text,
  minter text,
  owner text,
  from_address text,
  to_address text,
  changed_by text,
  cancelled_by text,
  executor text,
  governor text,
  treasury text,
  new_treasury text,
  new_governor text,
  old_treasury text,
  old_governor text,
  token_contract text,
  token_contract_id text,
  old_token_contract text,
  new_token_contract text,
  authority text,
  caller text,
  spender text,
  target text,
  function text,
  support text,
  reason text,
  state text,
  eta text,
  description text,
  snapshot_ledger text,
  vote_start_timestamp text,
  deadline_ledger text,
  action_count text,
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

CREATE INDEX IF NOT EXISTS decoded_events_deployment_event_idx
  ON chain.decoded_events (deployment_id, event_name, ledger_sequence DESC, event_id DESC);

CREATE INDEX IF NOT EXISTS decoded_events_deployment_contract_idx
  ON chain.decoded_events (deployment_id, contract_id, ledger_sequence DESC, event_id DESC);

CREATE TABLE IF NOT EXISTS app.activity_feed (
  activity_id text PRIMARY KEY,
  deployment_id text NOT NULL,
  contract_id text NOT NULL,
  contract_role text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  proposal_id text,
  proposal_number text,
  actor text,
  addresses text,
  ledger_sequence bigint NOT NULL,
  timestamp text,
  transaction_hash text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_feed_deployment_idx
  ON app.activity_feed (deployment_id, ledger_sequence DESC, activity_id DESC);

COMMIT;
