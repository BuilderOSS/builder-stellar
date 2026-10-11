-- Drop the comment views and restore auction.bids as defined in 0005 (no comment column).
DROP VIEW IF EXISTS marketplace.listing_comments;
DROP VIEW IF EXISTS marketplace.primary_listing_comments;
DROP VIEW IF EXISTS governance.proposal_comments;

-- CREATE OR REPLACE cannot drop a column; recreate the view.
DROP VIEW IF EXISTS auction.bids;
CREATE VIEW auction.bids AS
SELECT
  e.event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'bidder' AS bidder,
  (e.args::jsonb ->> 'amount')::numeric(78, 0) AS amount,
  (e.args::jsonb ->> 'extended')::boolean AS extended,
  (e.args::jsonb ->> 'new_end_time')::bigint AS new_end_seconds,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'auction'
  AND e.event_name = 'bid_placed';
