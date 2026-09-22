-- =============================================================================
-- Multi-Tenant DAO Database Schema
--
-- Goldsky-backed read model for Stellar DAO Manager
--
-- This migration creates the foundational schema for:
-- 1. Multi-tenant isolation via (deployment_id, dao_id) composite key
-- 2. DAO lifecycle tracking (Pending → Operational)
-- 3. Event indexing from blockchain
-- 4. Activity feed and governance views
--
-- =============================================================================

BEGIN;

-- Create schemas for different concerns
CREATE SCHEMA IF NOT EXISTS chain;        -- Raw blockchain events from Goldsky
CREATE SCHEMA IF NOT EXISTS governance;   -- Governance/proposal views
CREATE SCHEMA IF NOT EXISTS token;        -- Token/member views
CREATE SCHEMA IF NOT EXISTS auction;      -- Auction views
CREATE SCHEMA IF NOT EXISTS treasury;     -- Treasury views
CREATE SCHEMA IF NOT EXISTS manager;      -- DAO registry and lifecycle
CREATE SCHEMA IF NOT EXISTS metadata;     -- NFT metadata views
CREATE SCHEMA IF NOT EXISTS app;          -- App-facing views

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

-- =============================================================================
-- Manager: DAO Registry with Multi-Tenant Support
-- =============================================================================
-- This table is the source of truth for all deployed DAOs.
-- It is populated by Goldsky when it sees DaoCreated events from the manager contract.
--
-- Key Design Decisions:
-- 1. Multi-tenant isolation via (deployment_id, dao_id) composite key
-- 2. Single deployment_id per app instance (constant)
-- 3. dao_id = token contract address (immutable primary identifier)
-- 4. Status tracks lifecycle: 'pending' (created) → 'operational' (finalized)
-- 5. All contracts immutable after creation
-- 6. Token metadata stored for UI display (name, symbol, description)
-- =============================================================================

CREATE TABLE IF NOT EXISTS manager.daos (
  -- Multi-tenant composite key: one app manages one deployment_id
  deployment_id TEXT NOT NULL,
  -- dao_id = token contract address, primary identifier within manager
  dao_id TEXT NOT NULL,

  -- Core DAO Identity
  token_address TEXT NOT NULL,              -- Same as dao_id (for clarity)
  creator VARCHAR(56),                      -- Account that deployed this DAO

  -- Manager Contract
  manager_contract TEXT NOT NULL,           -- Manager that created this DAO

  -- Deployed Contract Addresses (set at creation, immutable)
  token_contract TEXT NOT NULL,             -- ERC721-style token
  governor_contract TEXT NOT NULL,          -- Governance/proposals
  auction_contract TEXT,                    -- NFT auctions (nullable during setup)
  treasury_contract TEXT,                   -- Treasury/funds (nullable during setup)
  metadata_contract TEXT,                   -- NFT metadata (nullable during setup)

  -- Token Metadata (from DaoCreationParams)
  token_name VARCHAR(255),                  -- "Nouns", "Builder", etc.
  token_symbol VARCHAR(16),                 -- "NOUNS", "BUILD", etc.
  token_description TEXT,                   -- Full description
  token_uri TEXT,                           -- Base URI for token metadata

  -- Admin & Configuration
  admin_address VARCHAR(56),                -- launch_admin (setup account)

  -- Lifecycle Status
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' or 'operational'
  -- pending: DAO created, awaiting finalization
  -- operational: finalized, modules transferred to treasury, ready for use

  -- Blockchain Timeline
  created_ledger BIGINT NOT NULL,           -- Ledger when DaoCreated emitted
  created_at TIMESTAMPTZ,                   -- Timestamp from ledger
  created_tx_hash TEXT,                     -- Transaction that created DAO

  finalized_ledger BIGINT,                  -- Ledger when DaoFinalized emitted (if finalized)
  finalized_at TIMESTAMPTZ,                 -- When DAO moved to operational
  finalized_tx_hash TEXT,                   -- Transaction that finalized DAO

  -- Indexing/Tracking
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When first indexed by pipeline

  -- Constraints
  PRIMARY KEY (deployment_id, dao_id),

  -- Token address and creator must be valid Stellar addresses if set
  CHECK (token_address ~ '^C[A-Z0-9]{55}$'),
  CHECK (dao_id ~ '^C[A-Z0-9]{55}$'),
  CHECK (manager_contract ~ '^C[A-Z0-9]{55}$'),
  CHECK (status IN ('pending', 'operational'))
);

-- Indexes for all query patterns
CREATE INDEX IF NOT EXISTS idx_manager_daos_deployment
  ON manager.daos(deployment_id);

CREATE INDEX IF NOT EXISTS idx_manager_daos_deployment_status
  ON manager.daos(deployment_id, status);

CREATE INDEX IF NOT EXISTS idx_manager_daos_deployment_created_ledger
  ON manager.daos(deployment_id, created_ledger DESC);

CREATE INDEX IF NOT EXISTS idx_manager_daos_token_address
  ON manager.daos(deployment_id, token_address);

CREATE INDEX IF NOT EXISTS idx_manager_daos_governor_contract
  ON manager.daos(deployment_id, governor_contract);

-- Grant permissions to roles
-- Goldsky writer: inserts/updates DAO records as events are decoded
GRANT INSERT, UPDATE ON manager.daos TO goldsky_writer;

-- App server: read-only access to DAO registry
GRANT SELECT ON manager.daos TO app_server;

COMMIT;
