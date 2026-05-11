-- 041_schema_drift_reconciliation.sql
-- Production drift reconciliation for moderation config and moderation_stats constraints.
-- Safe/idempotent: validates existing data before adding constraints.

BEGIN;

UPDATE servers
SET moderation_config = '{}'::jsonb
WHERE moderation_config IS NULL;

ALTER TABLE servers
  ALTER COLUMN moderation_config SET DEFAULT '{}'::jsonb;

ALTER TABLE servers
  ALTER COLUMN moderation_config SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'moderation_stats_kind_check'
      AND conrelid = 'public.moderation_stats'::regclass
  ) THEN
    ALTER TABLE moderation_stats
      ADD CONSTRAINT moderation_stats_kind_check
      CHECK (kind IN ('flood','profanity','spam','auto_punish'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'moderation_stats_trigger_kind_check'
      AND conrelid = 'public.moderation_stats'::regclass
  ) THEN
    ALTER TABLE moderation_stats
      ADD CONSTRAINT moderation_stats_trigger_kind_check
      CHECK (trigger_kind IS NULL OR trigger_kind IN ('flood','profanity','spam'));
  END IF;
END
$$;

COMMIT;
