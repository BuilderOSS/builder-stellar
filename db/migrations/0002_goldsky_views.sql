BEGIN;

-- Goldsky's decoded envelope is event_name, topic_*, topics, and args. Keep
-- projections here rather than creating a second, partially populated sink.
CREATE OR REPLACE VIEW manager.daos AS
WITH created AS (
  SELECT DISTINCT ON (deployment_id, topic_0) event_id, deployment_id, contract_id AS manager_contract,
    topic_0 AS token_address, topic_1 AS creator, args -> 'founders' AS founders,
    ledger_sequence AS created_ledger, to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000) AS created_timestamp,
    transaction_hash AS created_transaction_hash
  FROM chain.decoded_events
   WHERE contract_role = 'manager' AND lower(event_name) IN ('daocreated', 'dao_created')
  ORDER BY deployment_id, topic_0, ledger_sequence, event_id
), registered AS (
  SELECT DISTINCT ON (deployment_id, topic_0) deployment_id, topic_0 AS token_address,
    args -> 'modules' AS modules, ledger_sequence AS registered_ledger,
    to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000) AS registered_timestamp,
    transaction_hash AS registered_transaction_hash
  FROM chain.decoded_events
   WHERE contract_role = 'manager' AND lower(event_name) IN ('daoregistered', 'dao_registered')
  ORDER BY deployment_id, topic_0, ledger_sequence DESC, event_id DESC
)
SELECT c.deployment_id, c.token_address AS dao_id, c.token_address, c.creator, c.manager_contract,
  r.modules ->> 'auction' AS auction_contract, r.modules ->> 'metadata' AS metadata_contract,
  r.modules ->> 'governor' AS governor_contract, r.modules ->> 'treasury' AS treasury_contract,
  c.founders, c.created_ledger, c.created_timestamp, r.registered_ledger, r.registered_timestamp,
  c.created_transaction_hash, r.registered_transaction_hash
FROM created c LEFT JOIN registered r USING (deployment_id, token_address);

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
FROM chain.decoded_events e LEFT JOIN manager.dao_modules m
  ON m.deployment_id = e.deployment_id AND m.module_contract = e.contract_id;

CREATE OR REPLACE VIEW manager.founder_allocations AS
SELECT d.deployment_id, d.dao_id, d.token_address, f.ordinality - 1 AS founder_index,
  COALESCE(f.value ->> 'address', f.value ->> 'wallet') AS wallet,
  COALESCE((f.value ->> 'amount')::integer, (f.value ->> 'allocation')::integer) AS allocation,
  (f.value ->> 'end_date')::bigint AS end_date, d.created_ledger, d.created_transaction_hash AS transaction_hash
FROM manager.daos d CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.founders, '[]'::jsonb)) WITH ORDINALITY f(value, ordinality);

CREATE OR REPLACE VIEW governance.proposal_lifecycle AS
SELECT event_id AS lifecycle_event_id, deployment_id, topics ->> 'proposal_id' AS proposal_id,
  CASE lower(event_name) WHEN 'proposal_queued' THEN 'queued' WHEN 'proposal_executed' THEN 'executed'
    WHEN 'proposal_expired' THEN 'expired' WHEN 'proposal_canceled' THEN 'canceled' WHEN 'proposal_cancelled' THEN 'canceled' ELSE lower(event_name) END AS state,
  (args ->> 'eta')::bigint AS eta, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000) AS timestamp, transaction_hash
 FROM chain.decoded_events WHERE contract_role = 'governor' AND lower(event_name) IN ('proposal_queued','proposal_executed','proposal_expired','proposal_canceled','proposal_cancelled');

CREATE OR REPLACE VIEW governance.proposal_votes AS
SELECT event_id AS vote_event_id, deployment_id, topics ->> 'proposal_id' AS proposal_id, topics ->> 'voter' AS voter,
  (args ->> 'vote_type')::integer AS support, (args ->> 'weight')::numeric(78,0) AS weight, args ->> 'reason' AS reason,
  ledger_sequence, to_timestamp(NULLIF(ledger_closed_at, '')::numeric / 1000) AS timestamp, transaction_hash
 FROM chain.decoded_events WHERE contract_role = 'governor' AND lower(event_name) IN ('vote_cast','votecast');

CREATE OR REPLACE VIEW governance.proposal_actions AS
SELECT e.deployment_id, e.topics ->> 'proposal_id' AS proposal_id, t.ordinality - 1 AS action_index,
  t.value AS target, f.value AS function, a.value AS args,
  jsonb_array_length(COALESCE(e.args -> 'targets', '[]'::jsonb)) AS action_count,
  NULL::boolean AS executed, NULL::text AS executor, NULL::bigint AS executed_ledger,
  NULL::timestamptz AS executed_timestamp, e.transaction_hash
FROM chain.decoded_events e
LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(e.args -> 'targets','[]'::jsonb)) WITH ORDINALITY t(value, ordinality) ON true
LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(e.args -> 'functions','[]'::jsonb)) WITH ORDINALITY f(value, ordinality) ON f.ordinality = t.ordinality
LEFT JOIN LATERAL jsonb_array_elements(COALESCE(e.args -> 'args','[]'::jsonb)) WITH ORDINALITY a(value, ordinality) ON a.ordinality = t.ordinality
 WHERE e.contract_role = 'governor' AND lower(e.event_name) IN ('proposal_created','proposalcreated');

CREATE OR REPLACE VIEW governance.proposals AS
WITH c AS (SELECT event_id AS created_event_id, deployment_id, topics ->> 'proposal_id' AS proposal_id, topics ->> 'proposer' AS proposer,
  args ->> 'description' AS description, (args ->> 'vote_snapshot')::bigint AS snapshot_ledger,
  (args ->> 'vote_start')::bigint AS vote_start_timestamp, (args ->> 'vote_end')::bigint AS deadline_ledger,
  jsonb_array_length(COALESCE(args -> 'targets','[]'::jsonb)) AS action_count, ledger_sequence AS created_ledger,
  to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS created_timestamp, transaction_hash AS created_transaction_hash
   FROM chain.decoded_events WHERE contract_role = 'governor' AND lower(event_name) IN ('proposal_created','proposalcreated')),
l AS (SELECT DISTINCT ON (deployment_id, proposal_id) deployment_id, proposal_id, state, eta, ledger_sequence AS updated_ledger, timestamp AS updated_timestamp
  FROM governance.proposal_lifecycle ORDER BY deployment_id, proposal_id, ledger_sequence DESC, lifecycle_event_id DESC)
SELECT c.*, COALESCE(l.state,'pending') AS state, l.eta, l.updated_ledger, l.updated_timestamp FROM c LEFT JOIN l USING (deployment_id, proposal_id);

CREATE OR REPLACE VIEW token.transfers AS
SELECT event_id, deployment_id, (args ->> 'token_id')::bigint AS token_id, topics ->> 'operator' AS operator,
  topics ->> 'from' AS from_address, topics ->> 'to' AS to_address, ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash
 FROM chain.decoded_events WHERE contract_role = 'token' AND lower(event_name) IN ('transfer','mint','mintwithminter');

CREATE OR REPLACE VIEW token.inventory AS
SELECT DISTINCT ON (deployment_id, args ->> 'token_id') event_id, deployment_id, (args ->> 'token_id')::bigint AS token_id,
  topics ->> 'to' AS owner, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash
 FROM chain.decoded_events WHERE contract_role = 'token' AND lower(event_name) IN ('transfer','mint','mintwithminter')
ORDER BY deployment_id, args ->> 'token_id', ledger_sequence DESC, event_id DESC;

CREATE OR REPLACE VIEW token.delegations AS
SELECT event_id, deployment_id, topics ->> 'delegator' AS delegator, args ->> 'from_delegate' AS from_delegate,
  args ->> 'to_delegate' AS to_delegate, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash
 FROM chain.decoded_events WHERE contract_role = 'token' AND lower(event_name) IN ('delegate_changed','delegatechanged');

CREATE OR REPLACE VIEW token.mint_authority_history AS
SELECT event_id, deployment_id, topics ->> 'authority' AS authority, (args ->> 'enabled')::boolean AS enabled,
  args ->> 'changed_by' AS changed_by, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash
 FROM chain.decoded_events WHERE contract_role = 'token' AND lower(event_name) IN ('mint_authority_changed','mintauthoritychanged');

CREATE OR REPLACE VIEW token.members AS
SELECT deployment_id, owner AS address, count(*)::bigint AS owned_token_count, NULL::text AS delegated_to, 0::bigint AS voting_power,
  min(ledger_sequence)::bigint AS first_seen_ledger, max(ledger_sequence)::bigint AS last_activity_ledger FROM token.inventory GROUP BY deployment_id, owner;

CREATE OR REPLACE VIEW governance.governor_authority_history AS SELECT event_id, deployment_id, topics ->> 'authority' AS authority,
  (args ->> 'enabled')::boolean AS enabled, args ->> 'changed_by' AS changed_by, ledger_sequence,
  to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash FROM chain.decoded_events WHERE contract_role = 'governor' AND lower(event_name) IN ('governor_authority_changed','governorauthoritychanged');
CREATE OR REPLACE VIEW governance.governor_authorities AS SELECT DISTINCT ON (deployment_id, authority) deployment_id, authority, enabled, ledger_sequence, timestamp, transaction_hash, 'event'::text AS source FROM governance.governor_authority_history WHERE enabled ORDER BY deployment_id, authority, ledger_sequence DESC;
CREATE OR REPLACE VIEW token.mint_authorities AS SELECT DISTINCT ON (deployment_id, authority) deployment_id, authority, enabled, ledger_sequence, timestamp, transaction_hash, 'event'::text AS source FROM token.mint_authority_history WHERE enabled ORDER BY deployment_id, authority, ledger_sequence DESC;

CREATE OR REPLACE VIEW auction.bids AS SELECT event_id, deployment_id, (topics ->> 'token_id')::bigint AS token_id, topics ->> 'bidder' AS bidder, (args ->> 'amount')::numeric(78,0) AS amount, (args ->> 'extended')::boolean AS extended, (args ->> 'new_end_time')::bigint AS new_end_time, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash FROM chain.decoded_events WHERE contract_role = 'auction' AND lower(event_name) IN ('bid_placed','bidplaced');
CREATE OR REPLACE VIEW auction.bid_refunds AS SELECT event_id, deployment_id, (topics ->> 'token_id')::bigint AS token_id, topics ->> 'bidder' AS bidder, (args ->> 'amount')::numeric(78,0) AS amount, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash FROM chain.decoded_events WHERE contract_role = 'auction' AND lower(event_name) IN ('bid_refunded','bidrefunded');
CREATE OR REPLACE VIEW auction.settlements AS SELECT event_id, deployment_id, (topics ->> 'token_id')::bigint AS token_id, args ->> 'winner' AS winner, (args ->> 'amount')::numeric(78,0) AS amount, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash FROM chain.decoded_events WHERE contract_role = 'auction' AND lower(event_name) IN ('auction_settled','auctionsettled');
CREATE OR REPLACE VIEW auction.auctions AS SELECT e.event_id, e.deployment_id, (e.topics ->> 'token_id')::bigint AS token_id, (e.args ->> 'start_time')::bigint AS start_time, (e.args ->> 'end_time')::bigint AS end_time, (e.args ->> 'reserve_price')::numeric(78,0) AS reserve_price, e.args ->> 'payment_token' AS payment_token,
  EXISTS (SELECT 1 FROM auction.settlements s WHERE s.deployment_id=e.deployment_id AND s.token_id=(e.topics ->> 'token_id')::bigint AND s.ledger_sequence >= e.ledger_sequence) AS settled,
  EXISTS (SELECT 1 FROM chain.decoded_events x WHERE x.deployment_id=e.deployment_id AND x.contract_role='auction' AND x.contract_id=e.contract_id AND x.topics ->> 'token_id'=e.topics ->> 'token_id' AND lower(x.event_name) IN ('auction_cancelled','auctioncanceled','auction_cancelled_indexed') AND x.ledger_sequence >= e.ledger_sequence) AS cancelled,
  e.ledger_sequence AS created_ledger, e.transaction_hash FROM chain.decoded_events e WHERE e.contract_role='auction' AND lower(e.event_name) IN ('auction_created','auctioncreated');

CREATE OR REPLACE VIEW treasury.calls AS SELECT event_id, deployment_id, topics ->> 'proposal_id' AS proposal_id, topics ->> 'governor' AS governor, topics ->> 'target' AS target, args ->> 'function' AS function, args -> 'args' AS args, args ->> 'executor' AS executor, args ->> 'action_index' AS action_index, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash FROM chain.decoded_events WHERE contract_role='treasury' AND lower(event_name) IN ('execute','treasury_call_indexed','proposal_call_indexed');

CREATE OR REPLACE VIEW app.proposal_list AS SELECT row_number() OVER (PARTITION BY deployment_id ORDER BY created_ledger, created_event_id)::integer AS proposal_number, p.*, (SELECT count(*) FROM governance.proposal_votes v WHERE v.deployment_id=p.deployment_id AND v.proposal_id=p.proposal_id AND support=1)::bigint AS for_votes, (SELECT count(*) FROM governance.proposal_votes v WHERE v.deployment_id=p.deployment_id AND v.proposal_id=p.proposal_id AND support=0)::bigint AS against_votes, (SELECT count(*) FROM governance.proposal_votes v WHERE v.deployment_id=p.deployment_id AND v.proposal_id=p.proposal_id AND support=2)::bigint AS abstain_votes FROM governance.proposals p;
CREATE OR REPLACE VIEW app.proposal_detail AS SELECT p.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('action_index',a.action_index,'target',a.target,'function',a.function,'args',a.args) ORDER BY a.action_index) FROM governance.proposal_actions a WHERE a.deployment_id=p.deployment_id AND a.proposal_id=p.proposal_id), '[]'::jsonb) AS actions, COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.ledger_sequence) FROM governance.proposal_votes v WHERE v.deployment_id=p.deployment_id AND v.proposal_id=p.proposal_id), '[]'::jsonb) AS votes FROM app.proposal_list p;
CREATE OR REPLACE VIEW app.member_list AS SELECT deployment_id, address, owned_token_count, delegated_to, voting_power, last_activity_ledger FROM token.members;

CREATE OR REPLACE VIEW manager.implementations AS SELECT event_id, deployment_id, contract_id AS manager_contract, args ->> 'name' AS name, (args ->> 'version')::integer AS version, topic_0 AS wasm_hash, (args ->> 'published_at')::bigint AS published_at, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash, false AS revoked, NULL::bigint AS revoked_at FROM chain.decoded_events WHERE contract_role='manager' AND lower(event_name) IN ('implementation_registered','implementationregistered');
CREATE OR REPLACE VIEW manager.current_implementations AS SELECT DISTINCT ON (deployment_id) deployment_id, args ->> 'token' AS token_impl, args ->> 'metadata' AS metadata_impl, args ->> 'auction' AS auction_impl, args ->> 'governor' AS governor_impl, args ->> 'treasury' AS treasury_impl, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS updated_timestamp, transaction_hash FROM chain.decoded_events WHERE contract_role='manager' AND lower(event_name) IN ('current_implementations_updated','currentimplementationsupdated') ORDER BY deployment_id, ledger_sequence DESC, event_id DESC;

CREATE OR REPLACE VIEW metadata.properties AS SELECT event_id, deployment_id, contract_id AS metadata_contract, (topic_0)::integer AS property_id, args ->> 'name' AS name, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash FROM chain.decoded_events WHERE contract_role='metadata' AND lower(event_name) IN ('property_added','propertyadded');
CREATE OR REPLACE VIEW metadata.token_seeds AS SELECT event_id, deployment_id, contract_id AS metadata_contract, (topic_0)::bigint AS token_id, (args ->> 'num_properties')::integer AS num_properties, args -> 'selections' AS selections, ledger_sequence, to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS timestamp, transaction_hash FROM chain.decoded_events WHERE contract_role='metadata' AND lower(event_name) IN ('seed_generated','seedgenerated');
CREATE OR REPLACE VIEW metadata.configuration AS
WITH initialized AS (
  SELECT DISTINCT ON (deployment_id, contract_id)
    deployment_id,
    contract_id AS metadata_contract,
    topic_0 AS token_contract,
    args ->> 'renderer_base' AS renderer_base,
    ledger_sequence AS init_ledger,
    to_timestamp(NULLIF(ledger_closed_at,'')::numeric / 1000) AS init_timestamp,
    transaction_hash AS init_transaction_hash
  FROM chain.decoded_events
  WHERE contract_role = 'metadata' AND lower(event_name) IN ('metadata_initialized','metadatainitialized')
  ORDER BY deployment_id, contract_id, ledger_sequence DESC, event_id DESC
), latest_updates AS (
  SELECT DISTINCT ON (deployment_id, contract_id, lower(event_name))
    deployment_id, contract_id, lower(event_name) AS event_name, args, ledger_sequence, event_id
  FROM chain.decoded_events
  WHERE contract_role = 'metadata' AND lower(event_name) IN (
    'project_uri_updated', 'projecturiupdated',
    'description_updated', 'descriptionupdated',
    'contract_image_updated', 'contractimageupdated',
    'renderer_base_updated', 'rendererbaseupdated'
  )
  ORDER BY deployment_id, contract_id, lower(event_name), ledger_sequence DESC, event_id DESC
), updates AS (
  SELECT deployment_id, contract_id,
    max(args ->> 'new_uri') FILTER (WHERE event_name IN ('project_uri_updated','projecturiupdated')) AS project_uri,
    max(args ->> 'new_description') FILTER (WHERE event_name IN ('description_updated','descriptionupdated')) AS description,
    max(args ->> 'new_image') FILTER (WHERE event_name IN ('contract_image_updated','contractimageupdated')) AS contract_image,
    max(args ->> 'new_base') FILTER (WHERE event_name IN ('renderer_base_updated','rendererbaseupdated')) AS updated_renderer_base
  FROM latest_updates
  GROUP BY deployment_id, contract_id
)
SELECT i.deployment_id, i.metadata_contract, i.token_contract,
  COALESCE(u.updated_renderer_base, i.renderer_base) AS renderer_base,
  u.project_uri, u.description, u.contract_image,
  i.init_ledger, i.init_timestamp, i.init_transaction_hash
FROM initialized i
LEFT JOIN updates u ON u.deployment_id = i.deployment_id AND u.contract_id = i.metadata_contract;

CREATE OR REPLACE VIEW app.decoded_event_activity AS SELECT e.event_id, e.deployment_id, e.contract_id, e.contract_role, e.event_name, CASE WHEN e.contract_role='manager' THEN NULL ELSE i.dao_id END AS dao_id, e.topics, e.args, e.ledger_sequence, e.transaction_hash FROM chain.decoded_events e LEFT JOIN manager.event_identity i USING (deployment_id, contract_id);

CREATE OR REPLACE VIEW app.activity_feed AS
SELECT e.activity_id, e.deployment_id,
  CASE WHEN e.contract_role = 'manager' THEN NULL ELSE i.dao_id END AS dao_id,
  e.contract_id, e.contract_role, e.event_name, e.topics, e.args, e.kind, e.title, e.summary,
  e.actor, e.addresses, e.proposal_id, e.token_id, e.amount, e.visibility,
  e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index,
  e.ledger_closed_at, e.transaction_hash
FROM app.activity_feed_events e
LEFT JOIN manager.event_identity i USING (deployment_id, contract_id);
COMMIT;
