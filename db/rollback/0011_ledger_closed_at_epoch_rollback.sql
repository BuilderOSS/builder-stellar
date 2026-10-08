-- Rollback of 0011: restore the original ::timestamptz casts, then drop the helper.

CREATE OR REPLACE VIEW auction.bid_refunds AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.topics::jsonb ->> 'token_id'::text)::bigint AS token_id,
    e.topics::jsonb ->> 'bidder'::text AS bidder,
    ((e.args::jsonb ->> 'amount'::text))::numeric(78,0) AS amount,
        CASE e.event_name
            WHEN 'refund_deferred'::text THEN 'deferred'::text
            ELSE 'refunded'::text
        END AS refund_status,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'auction'::text AND (e.event_name = ANY (ARRAY['bid_refunded'::text, 'refund_deferred'::text]));

CREATE OR REPLACE VIEW auction.bids AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.topics::jsonb ->> 'token_id'::text)::bigint AS token_id,
    e.topics::jsonb ->> 'bidder'::text AS bidder,
    ((e.args::jsonb ->> 'amount'::text))::numeric(78,0) AS amount,
    (e.args::jsonb ->> 'extended'::text)::boolean AS extended,
    (e.args::jsonb ->> 'new_end_time'::text)::bigint AS new_end_seconds,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'auction'::text AND e.event_name = 'bid_placed'::text;

CREATE OR REPLACE VIEW auction.cancellations AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.topics::jsonb ->> 'token_id'::text)::bigint AS token_id,
    (e.args::jsonb ->> 'reason'::text)::integer AS reason,
    e.args::jsonb ->> 'cancelled_by'::text AS cancelled_by,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'auction'::text AND e.event_name = 'auction_cancelled'::text;

CREATE OR REPLACE VIEW auction.refund_withdrawals AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'bidder'::text AS bidder,
    ((e.args::jsonb ->> 'amount'::text))::numeric(78,0) AS amount,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'auction'::text AND e.event_name = 'refund_withdrawn'::text;

CREATE OR REPLACE VIEW auction.settlements AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.topics::jsonb ->> 'token_id'::text)::bigint AS token_id,
    e.args::jsonb ->> 'winner'::text AS winner,
    ((e.args::jsonb ->> 'amount'::text))::numeric(78,0) AS amount,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'auction'::text AND e.event_name = 'auction_settled'::text;

CREATE OR REPLACE VIEW governance.proposal_execution_calls AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id AS treasury_contract,
    e.topics::jsonb ->> 'proposal_id'::text AS proposal_id,
    (e.args::jsonb ->> 'index'::text)::integer AS call_index,
    e.topics::jsonb ->> 'governor'::text AS governor,
    e.topics::jsonb ->> 'target'::text AS target,
    e.args::jsonb ->> 'function'::text AS function,
    a.args,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
     LEFT JOIN governance.proposal_actions a ON a.deployment_id = e.deployment_id AND a.dao_id = i.dao_id AND a.proposal_id = (e.topics::jsonb ->> 'proposal_id'::text) AND a.action_index = ((e.args::jsonb ->> 'index'::text)::integer)
  WHERE e.contract_role = 'treasury'::text AND e.event_name = 'execute'::text;

CREATE OR REPLACE VIEW governance.proposal_lifecycle AS
SELECT e.event_id AS lifecycle_event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topic_0 AS proposal_id,
        CASE e.event_name
            WHEN 'proposal_queued'::text THEN 'queued'::text
            WHEN 'proposal_executed'::text THEN 'executed'::text
            WHEN 'proposal_cancelled'::text THEN 'canceled'::text
            ELSE NULL::text
        END AS state,
    (e.args::jsonb ->> 'eta'::text)::bigint AS eta_seconds,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'governor'::text AND (e.event_name = ANY (ARRAY['proposal_queued'::text, 'proposal_executed'::text, 'proposal_cancelled'::text]));

CREATE OR REPLACE VIEW governance.proposal_votes AS
SELECT e.event_id AS vote_event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'proposal_id'::text AS proposal_id,
    e.topics::jsonb ->> 'voter'::text AS voter,
    (e.args::jsonb ->> 'vote_type'::text)::integer AS support,
    ((e.args::jsonb ->> 'weight'::text))::numeric(78,0) AS weight,
    e.args::jsonb ->> 'reason'::text AS reason,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'governor'::text AND e.event_name = 'vote_cast'::text;

CREATE OR REPLACE VIEW governance.proposals AS
WITH created AS (
         SELECT e.event_id AS created_event_id,
            e.deployment_id,
            i.dao_id,
            e.contract_id,
            e.topics::jsonb ->> 'proposal_id'::text AS proposal_id,
            e.topics::jsonb ->> 'proposer'::text AS proposer,
            e.args::jsonb ->> 'description'::text AS description,
            (e.args::jsonb ->> 'vote_snapshot'::text)::bigint AS snapshot_ledger,
            (e.args::jsonb ->> 'vote_end'::text)::bigint AS vote_end_seconds,
            jsonb_array_length(COALESCE(e.args::jsonb -> 'targets'::text, '[]'::jsonb)) AS action_count,
            e.ledger_sequence AS created_ledger,
            e.transaction_index,
            e.operation_index,
            e.event_index,
            NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS created_at,
            e.transaction_hash AS created_transaction_hash
           FROM chain.decoded_events e
             JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
          WHERE e.contract_role = 'governor'::text AND e.event_name = 'proposal_created'::text
        ), lifecycle AS (
         SELECT proposal_lifecycle.deployment_id,
            proposal_lifecycle.dao_id,
            proposal_lifecycle.proposal_id,
            (array_agg(proposal_lifecycle.state ORDER BY proposal_lifecycle.event_ledger DESC, proposal_lifecycle.transaction_index DESC NULLS LAST, proposal_lifecycle.operation_index DESC NULLS LAST, proposal_lifecycle.event_index DESC NULLS LAST, proposal_lifecycle.lifecycle_event_id DESC))[1] AS state,
            (array_agg(proposal_lifecycle.eta_seconds ORDER BY proposal_lifecycle.event_ledger DESC, proposal_lifecycle.transaction_index DESC NULLS LAST, proposal_lifecycle.operation_index DESC NULLS LAST, proposal_lifecycle.event_index DESC NULLS LAST, proposal_lifecycle.lifecycle_event_id DESC) FILTER (WHERE proposal_lifecycle.eta_seconds IS NOT NULL))[1] AS eta_seconds,
            max(proposal_lifecycle.event_ledger) AS updated_ledger,
            (array_agg(proposal_lifecycle.event_at ORDER BY proposal_lifecycle.event_ledger DESC, proposal_lifecycle.transaction_index DESC NULLS LAST, proposal_lifecycle.operation_index DESC NULLS LAST, proposal_lifecycle.event_index DESC NULLS LAST, proposal_lifecycle.lifecycle_event_id DESC))[1] AS updated_at
           FROM governance.proposal_lifecycle
          GROUP BY proposal_lifecycle.deployment_id, proposal_lifecycle.dao_id, proposal_lifecycle.proposal_id
        ), tally AS (
         SELECT proposal_votes.deployment_id,
            proposal_votes.dao_id,
            proposal_votes.proposal_id,
            COALESCE(sum(proposal_votes.weight) FILTER (WHERE proposal_votes.support = 1), 0::numeric) AS for_votes,
            COALESCE(sum(proposal_votes.weight) FILTER (WHERE proposal_votes.support = 0), 0::numeric) AS against_votes
           FROM governance.proposal_votes
          GROUP BY proposal_votes.deployment_id, proposal_votes.dao_id, proposal_votes.proposal_id
        )
 SELECT c.created_event_id,
    c.deployment_id,
    c.dao_id,
    c.contract_id,
    c.proposal_id,
    c.proposer,
    c.description,
    c.snapshot_ledger,
    c.vote_end_seconds,
    c.action_count,
    c.created_ledger,
    c.transaction_index,
    c.operation_index,
    c.event_index,
    c.created_at,
    c.created_transaction_hash,
        CASE
            WHEN l.state = 'queued'::text AND EXTRACT(epoch FROM now()) >= (l.eta_seconds + 1209600)::numeric THEN 'expired'::text
            WHEN l.state IS NULL AND c.vote_end_seconds IS NOT NULL AND EXTRACT(epoch FROM now()) >= (c.vote_end_seconds + 1209600)::numeric AND COALESCE(t.for_votes, 0::numeric) > COALESCE(t.against_votes, 0::numeric) THEN 'expired'::text
            ELSE COALESCE(l.state, 'pending'::text)
        END AS state,
    l.eta_seconds,
    l.updated_ledger,
    l.updated_at
   FROM created c
     LEFT JOIN lifecycle l ON l.deployment_id = c.deployment_id AND l.dao_id = c.dao_id AND l.proposal_id = c.proposal_id
     LEFT JOIN tally t ON t.deployment_id = c.deployment_id AND t.dao_id = c.dao_id AND t.proposal_id = c.proposal_id;

CREATE OR REPLACE VIEW manager.admin_history AS
SELECT event_id,
    deployment_id,
    contract_id AS manager_contract,
    event_name AS event_type,
    COALESCE(topics::jsonb ->> 'current_admin'::text, topics::jsonb ->> 'old_admin'::text) AS previous_admin,
    COALESCE(topics::jsonb ->> 'proposed_admin'::text, topics::jsonb ->> 'cancelled_admin'::text, topics::jsonb ->> 'new_admin'::text) AS new_admin,
    topics::jsonb ->> 'minter'::text AS platform_minter,
    ledger_sequence AS event_ledger,
    transaction_index,
    operation_index,
    event_index,
    NULLIF(ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    transaction_hash
   FROM chain.decoded_events e
  WHERE contract_role = 'manager'::text AND (event_name = ANY (ARRAY['admin_proposed'::text, 'admin_proposal_cancelled'::text, 'admin_changed'::text, 'platform_minter_set'::text]));

CREATE OR REPLACE VIEW manager.current_implementations AS
SELECT DISTINCT ON (deployment_id) deployment_id,
    args::jsonb ->> 'token'::text AS token_impl,
    args::jsonb ->> 'metadata'::text AS metadata_impl,
    args::jsonb ->> 'auction'::text AS auction_impl,
    args::jsonb ->> 'governor'::text AS governor_impl,
    args::jsonb ->> 'treasury'::text AS treasury_impl,
    args::jsonb ->> 'marketplace'::text AS marketplace_impl,
    ledger_sequence AS updated_ledger,
    NULLIF(ledger_closed_at, ''::text)::timestamp with time zone AS updated_at,
    transaction_hash
   FROM chain.decoded_events e
  WHERE contract_role = 'manager'::text AND event_name = 'current_implementations_updated'::text
  ORDER BY deployment_id, ledger_sequence DESC, transaction_index DESC, operation_index DESC, event_index DESC, event_id DESC;

CREATE OR REPLACE VIEW manager.dao_lifecycle AS
WITH launched AS (
         SELECT DISTINCT ON (e.deployment_id, e.topic_0) e.deployment_id,
            e.topic_0 AS dao_id,
            e.ledger_sequence AS launched_ledger,
            NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS launched_at,
            e.transaction_hash AS launched_tx_hash,
            COALESCE((e.args::jsonb ->> 'launch_auction'::text)::boolean, true) AS launch_auction,
            COALESCE((e.args::jsonb ->> 'launch_marketplace'::text)::boolean, true) AS launch_marketplace,
            COALESCE((e.args::jsonb ->> 'enable_minter'::text)::boolean, false) AS enable_minter
           FROM chain.decoded_events e
          WHERE e.contract_role = 'manager'::text AND e.event_name = 'dao_launched'::text
          ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC, e.event_id DESC
        ), modules AS (
         SELECT module_launches.deployment_id,
            module_launches.dao_id,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'token'::text) AS token_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'governor'::text) AS governor_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'treasury'::text) AS treasury_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'auction'::text) AS auction_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'marketplace'::text) AS marketplace_live,
            bool_or(module_launches.is_live) FILTER (WHERE module_launches.module_role = 'metadata'::text) AS metadata_live,
            bool_and(module_launches.is_live) AS all_live,
            bool_or(module_launches.started) FILTER (WHERE module_launches.module_role = 'auction'::text) AS auction_started,
            bool_or(module_launches.opened) FILTER (WHERE module_launches.module_role = 'marketplace'::text) AS marketplace_opened
           FROM manager.module_launches
          GROUP BY module_launches.deployment_id, module_launches.dao_id
        )
 SELECT r.deployment_id,
    r.dao_id,
        CASE
            WHEN l.dao_id IS NULL THEN 'pending'::text
            ELSE 'operational'::text
        END AS status,
    COALESCE(m.all_live, false) AS is_live,
    COALESCE(m.token_live, false) AS token_live,
    COALESCE(m.governor_live, false) AS governor_live,
    COALESCE(m.treasury_live, false) AS treasury_live,
    COALESCE(m.auction_live, false) AS auction_live,
    COALESCE(m.marketplace_live, false) AS marketplace_live,
    COALESCE(m.metadata_live, false) AS metadata_live,
    l.launch_auction,
    l.launch_marketplace,
    l.enable_minter AS minter_enabled,
    m.auction_started,
    m.marketplace_opened,
    l.launched_ledger,
    l.launched_at,
    l.launched_tx_hash
   FROM manager.dao_registry r
     LEFT JOIN launched l ON l.deployment_id = r.deployment_id AND l.dao_id = r.dao_id
     LEFT JOIN modules m ON m.deployment_id = r.deployment_id AND m.dao_id = r.dao_id;

CREATE OR REPLACE VIEW manager.dao_registry AS
SELECT DISTINCT ON (deployment_id, topic_0) deployment_id,
    topic_0 AS dao_id,
    topic_0 AS token_address,
    topic_1 AS deployer,
    topic_2 AS launch_admin,
    contract_id AS manager_contract,
    args::jsonb #>> '{modules,token}'::text[] AS token_contract,
    args::jsonb #>> '{modules,governor}'::text[] AS governor_contract,
    args::jsonb #>> '{modules,auction}'::text[] AS auction_contract,
    args::jsonb #>> '{modules,treasury}'::text[] AS treasury_contract,
    args::jsonb #>> '{modules,metadata}'::text[] AS metadata_contract,
    args::jsonb #>> '{modules,marketplace}'::text[] AS marketplace_contract,
    args::jsonb #>> '{wasm_hashes,token}'::text[] AS token_wasm_hash,
    args::jsonb #>> '{wasm_hashes,governor}'::text[] AS governor_wasm_hash,
    args::jsonb #>> '{wasm_hashes,auction}'::text[] AS auction_wasm_hash,
    args::jsonb #>> '{wasm_hashes,treasury}'::text[] AS treasury_wasm_hash,
    args::jsonb #>> '{wasm_hashes,metadata}'::text[] AS metadata_wasm_hash,
    args::jsonb #>> '{wasm_hashes,marketplace}'::text[] AS marketplace_wasm_hash,
    ledger_sequence AS created_ledger,
    NULLIF(ledger_closed_at, ''::text)::timestamp with time zone AS created_at,
    transaction_hash AS created_tx_hash,
    ingested_at AS indexed_at
   FROM chain.decoded_events e
  WHERE contract_role = 'manager'::text AND event_name = 'dao_created'::text
  ORDER BY deployment_id, topic_0, ledger_sequence, transaction_index, operation_index, event_index, event_id;

CREATE OR REPLACE VIEW manager.daos AS
WITH launched AS (
         SELECT DISTINCT ON (e.deployment_id, e.topic_0) e.deployment_id,
            e.topic_0 AS dao_id,
            e.ledger_sequence AS launched_ledger,
            e.transaction_index AS launched_transaction_index,
            e.operation_index AS launched_operation_index,
            e.event_index AS launched_event_index,
            NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS launched_at,
            e.transaction_hash AS launched_tx_hash,
            COALESCE((e.args::jsonb ->> 'launch_auction'::text)::boolean, true) AS launch_auction,
            COALESCE((e.args::jsonb ->> 'launch_marketplace'::text)::boolean, true) AS launch_marketplace
           FROM chain.decoded_events e
          WHERE e.contract_role = 'manager'::text AND e.event_name = 'dao_launched'::text
          ORDER BY e.deployment_id, e.topic_0, e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC, e.event_id DESC
        ), auction_state AS (
         SELECT r_1.deployment_id,
            r_1.dao_id,
            bool_or(e.event_name = 'unpaused'::text) AS reactivated,
            (array_agg(e.event_name = 'paused'::text ORDER BY e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC))[1] AS paused
           FROM manager.dao_registry r_1
             JOIN launched l_1 ON l_1.deployment_id = r_1.deployment_id AND l_1.dao_id = r_1.dao_id
             JOIN chain.decoded_events e ON e.deployment_id = r_1.deployment_id AND e.contract_id = r_1.auction_contract
          WHERE e.contract_role = 'auction'::text AND (e.event_name = ANY (ARRAY['paused'::text, 'unpaused'::text])) AND chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index) > chain.event_position(l_1.launched_ledger, l_1.launched_transaction_index, l_1.launched_operation_index, l_1.launched_event_index)
          GROUP BY r_1.deployment_id, r_1.dao_id
        ), token_init AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id) e.deployment_id,
            e.contract_id AS token_contract,
            e.topic_0 AS admin_address,
            e.args::jsonb ->> 'name'::text AS token_name,
            e.args::jsonb ->> 'symbol'::text AS token_symbol,
            e.args::jsonb ->> 'uri'::text AS token_uri
           FROM chain.decoded_events e
          WHERE e.contract_role = 'token'::text AND e.event_name = 'token_initialized'::text
          ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC, e.event_id DESC
        ), dao_description AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id) e.deployment_id,
            e.contract_id AS metadata_contract,
                CASE e.event_name
                    WHEN 'description_updated'::text THEN e.args::jsonb ->> 'new_description'::text
                    ELSE e.args::jsonb ->> 'description'::text
                END AS description
           FROM chain.decoded_events e
          WHERE e.contract_role = 'metadata'::text AND (e.event_name = ANY (ARRAY['metadata_initialized'::text, 'description_updated'::text]))
          ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC, e.operation_index DESC, e.event_index DESC, e.event_id DESC
        )
 SELECT r.deployment_id,
    r.dao_id,
    r.token_address,
    r.deployer,
    r.launch_admin,
    r.manager_contract,
    r.token_contract,
    r.governor_contract,
    r.auction_contract,
    r.treasury_contract,
    r.metadata_contract,
    r.marketplace_contract,
    t.token_name,
    t.token_symbol,
    d.description AS token_description,
    t.token_uri,
    t.admin_address,
        CASE
            WHEN l.dao_id IS NULL THEN 'pending'::text
            ELSE 'operational'::text
        END AS status,
        CASE
            WHEN l.dao_id IS NULL THEN NULL::boolean
            ELSE l.launch_auction OR COALESCE(a.reactivated, false)
        END AS auction_enabled,
        CASE
            WHEN l.dao_id IS NULL THEN NULL::boolean
            ELSE l.launch_marketplace
        END AS marketplace_enabled,
        CASE
            WHEN l.dao_id IS NULL THEN NULL::boolean
            ELSE COALESCE(a.paused, NOT l.launch_auction)
        END AS auction_paused,
    r.created_ledger,
    r.created_at,
    r.created_tx_hash,
    l.launched_ledger,
    l.launched_at,
    l.launched_tx_hash,
    r.indexed_at
   FROM manager.dao_registry r
     LEFT JOIN launched l ON l.deployment_id = r.deployment_id AND l.dao_id = r.dao_id
     LEFT JOIN auction_state a ON a.deployment_id = r.deployment_id AND a.dao_id = r.dao_id
     LEFT JOIN token_init t ON t.deployment_id = r.deployment_id AND t.token_contract = r.token_contract
     LEFT JOIN dao_description d ON d.deployment_id = r.deployment_id AND d.metadata_contract = r.metadata_contract;

CREATE OR REPLACE VIEW manager.implementations AS
SELECT e.event_id,
    e.deployment_id,
    e.contract_id AS manager_contract,
    e.args::jsonb ->> 'name'::text AS name,
    e.args::jsonb ->> 'version'::text AS version,
    e.topic_0 AS wasm_hash,
    (e.args::jsonb ->> 'published_at'::text)::bigint AS published_at,
    e.ledger_sequence AS event_ledger,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash,
    r.event_id IS NOT NULL AS revoked,
    (r.args::jsonb ->> 'revoked_at'::text)::bigint AS revoked_at
   FROM chain.decoded_events e
     LEFT JOIN LATERAL ( SELECT x.event_id,
            x.args
           FROM chain.decoded_events x
          WHERE x.deployment_id = e.deployment_id AND x.contract_role = 'manager'::text AND x.event_name = 'implementation_revoked'::text AND x.topic_0 = e.topic_0 AND chain.event_position(x.ledger_sequence, x.transaction_index, x.operation_index, x.event_index) > chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)
          ORDER BY x.ledger_sequence DESC, x.transaction_index DESC NULLS LAST, x.operation_index DESC NULLS LAST, x.event_index DESC NULLS LAST, x.event_id DESC
         LIMIT 1) r ON true
  WHERE e.contract_role = 'manager'::text AND e.event_name = 'implementation_registered'::text;

CREATE OR REPLACE VIEW manager.module_launches AS
SELECT m.deployment_id,
    m.dao_id,
    m.module_role,
    m.module_contract,
    l.event_id IS NOT NULL AS is_live,
    l.topics::jsonb ->> 'treasury'::text AS treasury,
    (l.args::jsonb ->> 'started'::text)::boolean AS started,
    (l.args::jsonb ->> 'opened'::text)::boolean AS opened,
    l.args::jsonb -> 'minters'::text AS minters,
    l.ledger_sequence AS launched_ledger,
    NULLIF(l.ledger_closed_at, ''::text)::timestamp with time zone AS launched_at,
    l.transaction_hash AS launched_tx_hash
   FROM manager.dao_modules m
     LEFT JOIN LATERAL ( SELECT x.event_id,
            x.deployment_id,
            x.contract_id,
            x.contract_role,
            x.event_name,
            x.topic_0,
            x.topic_1,
            x.topic_2,
            x.topic_3,
            x.topics,
            x.args,
            x.transaction_hash,
            x.transaction_successful,
            x.ledger_sequence,
            x.ledger_hash,
            x.ledger_closed_at,
            x.transaction_index,
            x.operation_index,
            x.event_index,
            x.operation_type,
            x._gs_op,
            x.decoder_version,
            x.ingested_at
           FROM chain.decoded_events x
          WHERE x.deployment_id = m.deployment_id AND x.contract_id = m.module_contract AND x.event_name = 'launched'::text AND x.contract_role = m.module_role
          ORDER BY x.ledger_sequence, x.transaction_index, x.operation_index, x.event_index, x.event_id
         LIMIT 1) l ON true;

CREATE OR REPLACE VIEW manager.module_upgrades AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    i.module_role,
    e.contract_id,
    e.event_name AS event_type,
    e.topics::jsonb ->> 'from_hash'::text AS from_hash,
    e.topics::jsonb ->> 'to_hash'::text AS to_hash,
    e.args::jsonb ->> 'version'::text AS version,
    chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index) AS event_seq,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = i.module_role AND (e.event_name = ANY (ARRAY['upgraded'::text, 'version_synced'::text]));

CREATE OR REPLACE VIEW marketplace.primary_listings AS
WITH created AS (
         SELECT e.event_id,
            e.deployment_id,
            i.dao_id,
            e.contract_id,
            (e.topics::jsonb ->> 'listing_id'::text)::bigint AS listing_id,
            ((e.args::jsonb ->> 'price'::text))::numeric(78,0) AS price,
            (e.args::jsonb ->> 'expires_at'::text)::bigint AS expires_at,
            e.args::jsonb ->> 'payment_asset'::text AS payment_asset,
            e.ledger_sequence AS created_ledger,
            e.transaction_index,
            e.operation_index,
            e.event_index,
            NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS created_at,
            e.transaction_hash AS created_transaction_hash
           FROM chain.decoded_events e
             JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
          WHERE e.contract_role = 'marketplace'::text AND e.event_name = 'primary_listing_created'::text
        )
 SELECT c.event_id,
    c.deployment_id,
    c.dao_id,
    c.contract_id,
    c.listing_id,
    c.price,
    c.expires_at,
    c.payment_asset,
    COALESCE(
        CASE x.event_name
            WHEN 'primary_listing_purchased'::text THEN 'purchased'::text
            WHEN 'primary_listing_cancelled'::text THEN 'cancelled'::text
            WHEN 'primary_listing_expired'::text THEN 'expired'::text
            ELSE NULL::text
        END, 'open'::text) AS status,
    (x.args::jsonb ->> 'token_id'::text)::bigint AS token_id,
    x.topics::jsonb ->> 'buyer'::text AS buyer,
    c.created_ledger,
    c.created_at,
    c.created_transaction_hash,
    x.ledger_sequence AS closed_ledger,
    NULLIF(x.ledger_closed_at, ''::text)::timestamp with time zone AS closed_at,
    x.transaction_hash AS closed_transaction_hash
   FROM created c
     LEFT JOIN LATERAL ( SELECT x_1.event_id,
            x_1.deployment_id,
            x_1.contract_id,
            x_1.contract_role,
            x_1.event_name,
            x_1.topic_0,
            x_1.topic_1,
            x_1.topic_2,
            x_1.topic_3,
            x_1.topics,
            x_1.args,
            x_1.transaction_hash,
            x_1.transaction_successful,
            x_1.ledger_sequence,
            x_1.ledger_hash,
            x_1.ledger_closed_at,
            x_1.transaction_index,
            x_1.operation_index,
            x_1.event_index,
            x_1.operation_type,
            x_1._gs_op,
            x_1.decoder_version,
            x_1.ingested_at
           FROM chain.decoded_events x_1
          WHERE x_1.deployment_id = c.deployment_id AND x_1.contract_id = c.contract_id AND x_1.contract_role = 'marketplace'::text AND (x_1.event_name = ANY (ARRAY['primary_listing_purchased'::text, 'primary_listing_cancelled'::text, 'primary_listing_expired'::text])) AND ((x_1.topics::jsonb ->> 'listing_id'::text)::bigint) = c.listing_id AND chain.event_position(x_1.ledger_sequence, x_1.transaction_index, x_1.operation_index, x_1.event_index) > chain.event_position(c.created_ledger, c.transaction_index, c.operation_index, c.event_index)
          ORDER BY x_1.ledger_sequence, x_1.transaction_index, x_1.operation_index, x_1.event_index, x_1.event_id
         LIMIT 1) x ON true;

CREATE OR REPLACE VIEW marketplace.purchases AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.topics::jsonb ->> 'token_id'::text)::bigint AS token_id,
    e.topics::jsonb ->> 'buyer'::text AS buyer,
    e.args::jsonb ->> 'seller'::text AS seller,
    ((e.args::jsonb ->> 'price'::text))::numeric(78,0) AS price,
    ((e.args::jsonb ->> 'fee'::text))::numeric(78,0) AS fee,
    e.args::jsonb ->> 'payment_asset'::text AS payment_asset,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'marketplace'::text AND e.event_name = 'listing_purchased'::text;

CREATE OR REPLACE VIEW marketplace.sales AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    'primary'::text AS sale_type,
    (e.topics::jsonb ->> 'listing_id'::text)::bigint AS listing_id,
    (e.args::jsonb ->> 'token_id'::text)::bigint AS token_id,
    e.topics::jsonb ->> 'buyer'::text AS buyer,
    NULL::text AS seller,
    ((e.args::jsonb ->> 'price'::text))::numeric(78,0) AS price,
    NULL::numeric(78,0) AS fee,
    e.args::jsonb ->> 'payment_asset'::text AS payment_asset,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'marketplace'::text AND e.event_name = 'primary_listing_purchased'::text
UNION ALL
 SELECT p.event_id,
    p.deployment_id,
    p.dao_id,
    p.contract_id,
    'secondary'::text AS sale_type,
    NULL::bigint AS listing_id,
    p.token_id,
    p.buyer,
    p.seller,
    p.price,
    p.fee,
    p.payment_asset,
    p.event_ledger,
    p.transaction_index,
    p.operation_index,
    p.event_index,
    p.event_at,
    p.transaction_hash
   FROM marketplace.purchases p;

CREATE OR REPLACE VIEW marketplace.secondary_listings AS
WITH created AS (
         SELECT e.event_id,
            e.deployment_id,
            i.dao_id,
            e.contract_id,
            (e.topics::jsonb ->> 'token_id'::text)::bigint AS token_id,
            e.args::jsonb ->> 'seller'::text AS seller,
            ((e.args::jsonb ->> 'price'::text))::numeric(78,0) AS price,
            (e.args::jsonb ->> 'expires_at'::text)::bigint AS expires_at,
            (e.args::jsonb ->> 'fee_bps'::text)::integer AS fee_bps,
            e.args::jsonb ->> 'payment_asset'::text AS payment_asset,
            e.ledger_sequence AS created_ledger,
            e.transaction_index,
            e.operation_index,
            e.event_index,
            NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS created_at,
            e.transaction_hash AS created_transaction_hash
           FROM chain.decoded_events e
             JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
          WHERE e.contract_role = 'marketplace'::text AND e.event_name = 'secondary_listing_created'::text
        )
 SELECT c.event_id,
    c.deployment_id,
    c.dao_id,
    c.contract_id,
    c.token_id,
    c.seller,
    c.price,
    c.expires_at,
    c.fee_bps,
    c.payment_asset,
    COALESCE(
        CASE x.event_name
            WHEN 'listing_purchased'::text THEN 'purchased'::text
            WHEN 'listing_cancelled'::text THEN 'cancelled'::text
            WHEN 'listing_expired'::text THEN 'expired'::text
            ELSE NULL::text
        END, 'open'::text) AS status,
    c.created_ledger,
    c.created_at,
    c.created_transaction_hash,
    x.ledger_sequence AS closed_ledger,
    NULLIF(x.ledger_closed_at, ''::text)::timestamp with time zone AS closed_at,
    NULLIF(x.topic_1, ''::text) AS buyer
   FROM created c
     LEFT JOIN LATERAL ( SELECT x_1.event_name,
            x_1.ledger_sequence,
            x_1.ledger_closed_at,
            x_1.topic_1
           FROM chain.decoded_events x_1
          WHERE x_1.deployment_id = c.deployment_id AND x_1.contract_id = c.contract_id AND x_1.contract_role = 'marketplace'::text AND (x_1.event_name = ANY (ARRAY['listing_purchased'::text, 'listing_cancelled'::text, 'listing_expired'::text])) AND ((x_1.topics::jsonb ->> 'token_id'::text)::bigint) = c.token_id AND chain.event_position(x_1.ledger_sequence, x_1.transaction_index, x_1.operation_index, x_1.event_index) > chain.event_position(c.created_ledger, c.transaction_index, c.operation_index, c.event_index)
          ORDER BY x_1.ledger_sequence, x_1.transaction_index, x_1.operation_index, x_1.event_index, x_1.event_id
         LIMIT 1) x ON true;

CREATE OR REPLACE VIEW metadata.configuration AS
WITH initialized AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id) e.deployment_id,
            i_1.dao_id,
            e.contract_id AS metadata_contract,
            e.topic_0 AS token_contract,
            e.args::jsonb ->> 'renderer_base'::text AS renderer_base,
            e.args::jsonb ->> 'version'::text AS version,
            e.args::jsonb ->> 'owner'::text AS owner,
            e.args::jsonb ->> 'project_uri'::text AS project_uri,
            e.args::jsonb ->> 'description'::text AS description,
            e.args::jsonb ->> 'contract_image'::text AS contract_image,
            e.ledger_sequence AS init_ledger,
            NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS init_at,
            e.transaction_hash AS init_transaction_hash
           FROM chain.decoded_events e
             JOIN manager.event_identity i_1 ON i_1.deployment_id = e.deployment_id AND i_1.contract_id = e.contract_id
          WHERE e.contract_role = 'metadata'::text AND e.event_name = 'metadata_initialized'::text
          ORDER BY e.deployment_id, e.contract_id, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
        ), latest_update AS (
         SELECT DISTINCT ON (e.deployment_id, e.contract_id, e.event_name) e.deployment_id,
            e.contract_id,
            e.event_name,
            e.args
           FROM chain.decoded_events e
          WHERE e.contract_role = 'metadata'::text AND (e.event_name = ANY (ARRAY['project_uri_updated'::text, 'description_updated'::text, 'contract_image_updated'::text, 'renderer_base_updated'::text]))
          ORDER BY e.deployment_id, e.contract_id, e.event_name, e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC
        ), updates AS (
         SELECT latest_update.deployment_id,
            latest_update.contract_id,
            max(latest_update.args::jsonb ->> 'new_uri'::text) FILTER (WHERE latest_update.event_name = 'project_uri_updated'::text) AS project_uri,
            max(latest_update.args::jsonb ->> 'new_description'::text) FILTER (WHERE latest_update.event_name = 'description_updated'::text) AS description,
            max(latest_update.args::jsonb ->> 'new_image'::text) FILTER (WHERE latest_update.event_name = 'contract_image_updated'::text) AS contract_image,
            max(latest_update.args::jsonb ->> 'new_base'::text) FILTER (WHERE latest_update.event_name = 'renderer_base_updated'::text) AS renderer_base
           FROM latest_update
          GROUP BY latest_update.deployment_id, latest_update.contract_id
        )
 SELECT i.deployment_id,
    i.dao_id,
    i.metadata_contract,
    i.token_contract,
    COALESCE(u.renderer_base, i.renderer_base) AS renderer_base,
    i.version,
    i.owner,
    COALESCE(u.project_uri, i.project_uri) AS project_uri,
    COALESCE(u.description, i.description) AS description,
    COALESCE(u.contract_image, i.contract_image) AS contract_image,
    i.init_ledger,
    i.init_at,
    i.init_transaction_hash
   FROM initialized i
     LEFT JOIN updates u ON u.deployment_id = i.deployment_id AND u.contract_id = i.metadata_contract;

CREATE OR REPLACE VIEW metadata.properties AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id AS metadata_contract,
    (e.topics::jsonb ->> 'property_id'::text)::integer AS property_id,
    e.args::jsonb ->> 'name'::text AS name,
    e.ledger_sequence AS event_ledger,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'metadata'::text AND e.event_name = 'property_added'::text AND NOT (EXISTS ( SELECT 1
           FROM chain.decoded_events r
          WHERE r.deployment_id = e.deployment_id AND r.contract_id = e.contract_id AND r.contract_role = 'metadata'::text AND r.event_name = 'properties_reset'::text AND chain.event_position(r.ledger_sequence, r.transaction_index, r.operation_index, r.event_index) > chain.event_position(e.ledger_sequence, e.transaction_index, e.operation_index, e.event_index)));

CREATE OR REPLACE VIEW metadata.token_seeds AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id AS metadata_contract,
    (e.topics::jsonb ->> 'token_id'::text)::bigint AS token_id,
    (e.args::jsonb ->> 'num_properties'::text)::integer AS num_properties,
    e.args::jsonb -> 'selections'::text AS selections,
    row_number() OVER (PARTITION BY e.deployment_id, e.contract_id, (e.topics::jsonb ->> 'token_id'::text) ORDER BY e.ledger_sequence DESC, e.transaction_index DESC NULLS LAST, e.operation_index DESC NULLS LAST, e.event_index DESC NULLS LAST, e.event_id DESC) = 1 AS is_current,
    e.ledger_sequence AS event_ledger,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'metadata'::text AND e.event_name = 'seed_generated'::text;

CREATE OR REPLACE VIEW minter.allocation_updates AS
SELECT e.event_id,
    e.deployment_id,
    r.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'token_id'::text AS token_id,
        CASE e.event_name
            WHEN 'merkle_root_set_event'::text THEN 'merkle'::text
            ELSE 'allowlist'::text
        END AS allocation_type,
    (e.args::jsonb ->> 'member_count'::text)::integer AS member_count,
    e.ledger_sequence,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
  WHERE e.contract_role = 'minter'::text AND (e.event_name = ANY (ARRAY['merkle_root_set_event'::text, 'allowlist_set_event'::text]));

CREATE OR REPLACE VIEW minter.allowlist_claim_events AS
SELECT e.event_id,
    e.deployment_id,
    r.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'token_id'::text AS token_id,
    e.topics::jsonb ->> 'recipient'::text AS recipient,
    ((e.args::jsonb ->> 'amount'::text))::numeric(78,0) AS amount,
    e.ledger_sequence,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
  WHERE e.contract_role = 'minter'::text AND e.event_name = 'allowlist_claim_event'::text;

CREATE OR REPLACE VIEW minter.batch_mint_events AS
SELECT e.event_id,
    e.deployment_id,
    r.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'token_id'::text AS token_id,
    (e.args::jsonb ->> 'recipient_count'::text)::integer AS recipient_count,
    ((e.args::jsonb ->> 'total_amount'::text))::numeric(78,0) AS total_amount,
    (e.args::jsonb ->> 'first_token_id'::text)::bigint AS first_token_id,
    e.ledger_sequence,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
  WHERE e.contract_role = 'minter'::text AND e.event_name = 'mint_batch_event'::text;

CREATE OR REPLACE VIEW minter.merkle_claim_events AS
SELECT e.event_id,
    e.deployment_id,
    r.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'token_id'::text AS token_id,
    e.topics::jsonb ->> 'recipient'::text AS recipient,
    ((e.args::jsonb ->> 'amount'::text))::numeric(78,0) AS amount,
    e.ledger_sequence,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.dao_registry r ON r.deployment_id = e.deployment_id AND r.token_address = e.topic_0
  WHERE e.contract_role = 'minter'::text AND e.event_name = 'merkle_claim_event'::text;

CREATE OR REPLACE VIEW token.delegations AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'delegator'::text AS delegator,
    e.args::jsonb ->> 'from_delegate'::text AS from_delegate,
    e.args::jsonb ->> 'to_delegate'::text AS to_delegate,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'token'::text AND e.event_name = 'delegate_changed'::text;

CREATE OR REPLACE VIEW token.mint_authority_history AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'authority'::text AS authority,
    (e.args::jsonb ->> 'old_enabled'::text)::boolean AS old_enabled,
    (e.args::jsonb ->> 'enabled'::text)::boolean AS enabled,
    e.args::jsonb ->> 'changed_by'::text AS changed_by,
    (e.args::jsonb ->> 'changed_by'::text) = r.manager_contract AS launch_grant,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
     JOIN manager.dao_registry r ON r.deployment_id = i.deployment_id AND r.dao_id = i.dao_id
  WHERE e.contract_role = 'token'::text AND e.event_name = 'mint_authority_changed'::text;

CREATE OR REPLACE VIEW token.mints AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.args::jsonb ->> 'token_id'::text)::bigint AS token_id,
    e.topics::jsonb ->> 'minter'::text AS minter,
    e.topics::jsonb ->> 'to'::text AS recipient,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'token'::text AND e.event_name = 'mint_with_minter'::text;

CREATE OR REPLACE VIEW token.transfers AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    (e.args::jsonb ->> 'token_id'::text)::bigint AS token_id,
        CASE e.event_name
            WHEN 'mint'::text THEN 'mint'::text
            ELSE 'transfer'::text
        END AS transfer_type,
    e.topics::jsonb ->> 'from'::text AS from_address,
    e.topics::jsonb ->> 'to'::text AS to_address,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'token'::text AND (e.event_name = ANY (ARRAY['mint'::text, 'transfer'::text]));

CREATE OR REPLACE VIEW treasury.calls AS
SELECT e.event_id,
    e.deployment_id,
    i.dao_id,
    e.contract_id,
    e.topics::jsonb ->> 'governor'::text AS governor,
    e.topics::jsonb ->> 'target'::text AS target,
    e.topics::jsonb ->> 'proposal_id'::text AS proposal_id,
    e.args::jsonb ->> 'function'::text AS function,
    (e.args::jsonb ->> 'index'::text)::integer AS call_index,
    e.ledger_sequence AS event_ledger,
    e.transaction_index,
    e.operation_index,
    e.event_index,
    EXTRACT(epoch FROM NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone)::bigint AS event_timestamp_seconds,
    NULLIF(e.ledger_closed_at, ''::text)::timestamp with time zone AS event_at,
    e.transaction_hash
   FROM chain.decoded_events e
     JOIN manager.event_identity i ON i.deployment_id = e.deployment_id AND i.contract_id = e.contract_id
  WHERE e.contract_role = 'treasury'::text AND e.event_name = 'execute'::text;

DROP FUNCTION IF EXISTS chain.ledger_closed_at_ts(text);
