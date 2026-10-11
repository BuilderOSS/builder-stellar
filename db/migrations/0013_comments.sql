-- =============================================================================
-- 0013: on-chain comments (governor, auction and marketplace 0.2.0)
--
-- Comments are event-only: the contracts never store them, so these views are
-- the only place they live.
-- * ProposalCommented: topics proposal_id, author; data { body }.
-- * PrimaryListingCommented: topics listing_id, author; data { body }. The
--   listing may since have been sold, cancelled or expired.
-- * ListingCommented: topics token_id, author; data { body }. Keyed by token,
--   so a token's thread carries over relistings.
-- * BidPlaced gains data.comment ('' when the bidder left none). Bids placed
--   on 0.1.0 auctions have no comment field and read as NULL. auction.bids
--   keeps its columns and order and appends `comment`.
-- =============================================================================

CREATE VIEW governance.proposal_comments AS
SELECT
  e.event_id AS comment_event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  e.topics::jsonb ->> 'proposal_id' AS proposal_id,
  e.topics::jsonb ->> 'author' AS author,
  e.args::jsonb ->> 'body' AS body,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'governor'
  AND e.event_name = 'proposal_commented';

CREATE VIEW marketplace.primary_listing_comments AS
SELECT
  e.event_id AS comment_event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'listing_id')::bigint AS listing_id,
  e.topics::jsonb ->> 'author' AS author,
  e.args::jsonb ->> 'body' AS body,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'marketplace'
  AND e.event_name = 'primary_listing_commented';

CREATE VIEW marketplace.listing_comments AS
SELECT
  e.event_id AS comment_event_id,
  e.deployment_id,
  i.dao_id,
  e.contract_id,
  (e.topics::jsonb ->> 'token_id')::bigint AS token_id,
  e.topics::jsonb ->> 'author' AS author,
  e.args::jsonb ->> 'body' AS body,
  e.ledger_sequence AS event_ledger,
  e.transaction_index,
  e.operation_index,
  e.event_index,
  extract(epoch FROM chain.ledger_closed_at_ts(e.ledger_closed_at))::bigint AS event_timestamp_seconds,
  chain.ledger_closed_at_ts(e.ledger_closed_at) AS event_at,
  e.transaction_hash
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'marketplace'
  AND e.event_name = 'listing_commented';

CREATE OR REPLACE VIEW auction.bids AS
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
  e.transaction_hash,
  NULLIF(e.args::jsonb ->> 'comment', '') AS comment
FROM chain.decoded_events e
JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
WHERE e.contract_role = 'auction'
  AND e.event_name = 'bid_placed';
