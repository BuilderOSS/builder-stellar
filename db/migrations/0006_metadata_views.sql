-- =============================================================================
-- METADATA VIEWS
--
-- Metadata events (contracts/metadata/src/events.rs):
--   seed_generated    topic token_id;       data { num_properties, selections[] }    (single mint)
--   seeds_generated   topic first_token_id; data { count, num_properties, selections[][] }
--                     (one per batch mint; selections[i] belongs to token first_token_id + i)
-- Not projected here: profile_updated (the current profile is a column of
-- manager.daos), metadata_initialized, property_added, properties_reset,
-- renderer_base_updated (artwork definitions and the renderer are read from
-- chain), metadata_launched (manager.module_launches).
--
-- A token is seeded once: on_minted seeds it, and regenerate refuses a token
-- that already has attributes (AlreadySeeded).
-- =============================================================================

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
