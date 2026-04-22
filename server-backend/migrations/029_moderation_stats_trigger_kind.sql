-- ── moderation_stats.trigger_kind ──
-- Auto-punish olaylarında hangi ihlal türü tetiklediğini saklar.
-- flood/profanity/spam değerlerinden biri; diğer kind'larda NULL.
-- Legacy 'auto_punish' satırları NULL kalır (geriye uyum).

ALTER TABLE moderation_stats
  ADD COLUMN IF NOT EXISTS trigger_kind TEXT;

-- Opsiyonel CHECK — NULL veya bilinen 3 tür.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'moderation_stats_trigger_kind_check'
  ) THEN
    ALTER TABLE moderation_stats
      ADD CONSTRAINT moderation_stats_trigger_kind_check
      CHECK (trigger_kind IS NULL OR trigger_kind IN ('flood', 'profanity', 'spam'));
  END IF;
END $$;
