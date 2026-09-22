-- =============================================================================
-- JSON TEXT TO JSONB CONVERSION TRIGGERS
-- =============================================================================
--
-- This migration adds BEFORE INSERT triggers to automatically convert
-- stringified JSON (TEXT) from Goldsky transforms to JSONB for storage.
--
-- Why: Goldsky can only output primitive types (string, number, boolean).
-- We output stringified JSON, and these triggers convert to JSONB before
-- insertion so existing views can use JSONB operators (->, ->>, jsonb_*).
-- =============================================================================

BEGIN;

-- Trigger function to convert TEXT → JSONB for JSON columns
CREATE OR REPLACE FUNCTION chain.convert_json_text_to_jsonb()
RETURNS TRIGGER AS $$
BEGIN
  -- Convert decoded_events JSON columns
  IF TG_TABLE_NAME = 'decoded_events' THEN
    -- Cast TEXT to JSONB (will fail if invalid JSON)
    NEW.topics := NEW.topics::jsonb;
    NEW.args := NEW.args::jsonb;

  -- Convert activity_feed_events JSON columns
  ELSIF TG_TABLE_NAME = 'activity_feed_events' THEN
    NEW.topics := NEW.topics::jsonb;
    NEW.args := NEW.args::jsonb;
    NEW.addresses := NEW.addresses::jsonb;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to decoded_events
CREATE TRIGGER convert_decoded_events_json
  BEFORE INSERT ON chain.decoded_events
  FOR EACH ROW
  EXECUTE FUNCTION chain.convert_json_text_to_jsonb();

-- Apply trigger to activity_feed_events
CREATE TRIGGER convert_activity_feed_json
  BEFORE INSERT ON app.activity_feed_events
  FOR EACH ROW
  EXECUTE FUNCTION chain.convert_json_text_to_jsonb();

COMMIT;
