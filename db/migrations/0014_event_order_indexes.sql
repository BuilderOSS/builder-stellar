-- Indexes are isolated from view replacement because CONCURRENTLY cannot run in
-- the transaction used by the migration runner.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_decoded_events_deployment_contract_order
  ON chain.decoded_events (deployment_id, contract_id, ledger_sequence DESC,
    transaction_index DESC, operation_index DESC, event_index DESC, event_id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_feed_deployment_contract_order
  ON app.activity_feed_events (deployment_id, contract_id, ledger_sequence DESC,
    transaction_index DESC, operation_index DESC, event_index DESC, activity_id DESC);
