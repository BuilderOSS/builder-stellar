-- =============================================================================
-- METADATA VIEWS
--
-- Metadata events (contracts/metadata/src/events.rs):
--   profile_updated   topic seq; data { hash, profile }   seq 0 at construction, then
--                     update_profile(expected_seq, profile) with compare-and-swap, so seq
--                     is unique per contract and the highest seq is the current profile
--   seed_generated    topic token_id;       data { num_properties, selections[] }    (single mint)
--   seeds_generated   topic first_token_id; data { count, num_properties, selections[][] }
--                     (one per batch mint; selections[i] belongs to token first_token_id + i)
-- Not projected (the app reads artwork definitions and the renderer from chain):
--   metadata_initialized, property_added, properties_reset, renderer_base_updated,
--   metadata_launched (manager.module_launches).
--
-- A token is seeded once: on_minted seeds it, and regenerate refuses a token
-- that already has attributes (AlreadySeeded).
-- =============================================================================

-- The current profile of every Metadata contract. `profile` is the JSON string
-- byte-for-byte as emitted; the app hashes it and compares with the chain's
-- profile_hash() before showing it.
CREATE VIEW metadata.profiles AS
SELECT DISTINCT ON (e.deployment_id, e.contract_id)
  e.deployment_id,
  e.dao_id,
  e.contract_id AS metadata_contract,
  (e.t ->> 'seq')::bigint AS profile_seq,
  e.a ->> 'hash' AS profile_hash,
  e.a ->> 'profile' AS profile,
  e.ledger_sequence AS updated_ledger,
  e.closed_at AS updated_at,
  e.transaction_hash AS updated_tx_hash
FROM manager.module_events e
WHERE e.contract_role = 'metadata'
  AND e.event_name = 'profile_updated'
ORDER BY e.deployment_id, e.contract_id, (e.t ->> 'seq')::bigint DESC, e.pos DESC;

-- Artwork seed per token: single seeds as emitted, batch seeds expanded over
-- their range. Batch rows share their source event_id.
CREATE VIEW metadata.token_seeds AS
SELECT
  e.event_id,
  e.deployment_id,
  e.dao_id,
  e.contract_id AS metadata_contract,
  s.token_id,
  (e.a ->> 'num_properties')::integer AS num_properties,
  s.selections,
  e.ledger_sequence AS event_ledger,
  e.closed_at AS event_at,
  e.transaction_hash
FROM manager.module_events e
CROSS JOIN LATERAL (
  SELECT (e.t ->> 'token_id')::bigint AS token_id, e.a -> 'selections' AS selections
  WHERE e.event_name = 'seed_generated'
  UNION ALL
  SELECT (e.t ->> 'first_token_id')::bigint + x.ord - 1, x.selection
  FROM jsonb_array_elements(e.a -> 'selections') WITH ORDINALITY AS x(selection, ord)
  WHERE e.event_name = 'seeds_generated'
) s
WHERE e.contract_role = 'metadata'
  AND e.event_name IN ('seed_generated', 'seeds_generated');
